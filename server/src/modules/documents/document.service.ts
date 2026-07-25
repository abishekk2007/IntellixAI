import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/http.js";
import { createAIProvider, type AIProvider, type ContextChunk, type DocumentAnalysis } from "../ai/provider.js";
import { TesseractOCRProvider, type OCRProvider } from "../ocr/ocr.js";
import { KnowledgeGraphService } from "../knowledge/knowledge.service.js";

const allowed = new Map([
  [".pdf", "application/pdf"], [".txt", "text/plain"], [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
]);

export function sanitizeOriginalName(value: string) {
  const printable = Array.from(path.basename(value)).filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join("");
  const base = printable.replace(/[^a-zA-Z0-9._ ()-]/g, "_").trim();
  return (base || "document").slice(0, 180);
}

export function splitIntoChunks(text: string, max = 1_500) {
  const paragraphs = text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > max) { chunks.push(current); current = ""; }
    if (paragraph.length > max) {
      if (current) chunks.push(current);
      for (let index = 0; index < paragraph.length; index += max) chunks.push(paragraph.slice(index, index + max));
    } else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function retrieveRelevantChunks(question: string, chunks: ContextChunk[], limit = 6) {
  const terms = new Set(question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  return chunks.map((chunk) => ({ chunk, score: [...terms].reduce((score, term) => score + (chunk.content.toLowerCase().split(term).length - 1), 0) }))
    .sort((a, b) => b.score - a.score || a.chunk.chunkIndex - b.chunk.chunkIndex).slice(0, limit).map(({ chunk }) => chunk);
}

export async function validateUpload(file: Express.Multer.File) {
  if (!file.buffer.length) throw new AppError(400, "EMPTY_FILE", "The uploaded file is empty.");
  if (file.size > env.MAX_UPLOAD_BYTES) throw new AppError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the configured size limit.");
  const extension = path.extname(file.originalname).toLowerCase();
  const expectedMime = allowed.get(extension);
  if (!expectedMime) throw new AppError(415, "UNSUPPORTED_FILE", "Supported files are PDF, TXT, PNG, JPG, and JPEG.");
  const detected = await fileTypeFromBuffer(file.buffer);
  if (extension === ".txt") {
    if (file.mimetype !== "text/plain" || detected) throw new AppError(415, "INVALID_FILE_TYPE", "The file content does not match its extension.");
  } else if (detected?.mime !== expectedMime || file.mimetype !== expectedMime) throw new AppError(415, "INVALID_FILE_TYPE", "The file content does not match its extension.");
  return { extension, mimeType: expectedMime };
}

export async function storeUpload(file: Express.Multer.File, workspaceId: string) {
  const { extension, mimeType } = await validateUpload(file);
  const storageKey = path.join(workspaceId, `${randomUUID()}${extension}`);
  const root = path.resolve(env.LOCAL_UPLOAD_DIR);
  const absolute = path.resolve(root, storageKey);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new AppError(400, "INVALID_STORAGE_KEY", "The upload path is invalid.");
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, file.buffer, { flag: "wx" });
  return { storageKey, mimeType };
}

async function extract(storageKey: string, mimeType: string, ocr: OCRProvider, onOcrStart: () => Promise<void>) {
  const root = path.resolve(env.LOCAL_UPLOAD_DIR);
  const absolute = path.resolve(root, storageKey);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new AppError(400, "INVALID_STORAGE_KEY", "The stored document path is invalid.");
  const data = await readFile(absolute);
  if (mimeType === "text/plain") return { text: data.toString("utf8"), usedOcr: false };
  if (mimeType.startsWith("image/")) { await onOcrStart(); return { text: await ocr.extractText(data), usedOcr: true }; }
  const parser = new PDFParse({ data });
  try {
    const text = (await parser.getText()).text.trim();
    if (text.replace(/\s/g, "").length >= 80) return { text, usedOcr: false };
    await onOcrStart();
    const screenshots = await parser.getScreenshot({ scale: 1.5, imageBuffer: true });
    const pages = await Promise.all(screenshots.pages.slice(0, 30).map((page) => ocr.extractText(page.data)));
    return { text: pages.join("\n\n"), usedOcr: true };
  } finally { await parser.destroy(); }
}

export class DocumentProcessor {
  constructor(private readonly ai: AIProvider, private readonly ocr: OCRProvider) {}
  async process(documentId: string, workspaceId: string) {
    const document = await prisma.document.findFirst({ where: { id: documentId, workspaceId, deletedAt: null } });
    if (!document) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found.");
    if (["EXTRACTING", "OCR_PROCESSING", "ANALYZING"].includes(document.status)) {
      throw new AppError(409, "ANALYSIS_IN_PROGRESS", "This document is already being processed.");
    }
    const claimed = await prisma.document.updateMany({
      where: { id: document.id, workspaceId, deletedAt: null, status: document.status },
      data: { status: "EXTRACTING", errorCode: null, errorMessage: null },
    });
    if (!claimed.count) throw new AppError(409, "ANALYSIS_IN_PROGRESS", "This document is already being processed.");
    try {
      const extracted = await extract(document.storageKey, document.mimeType, this.ocr, async () => {
        await prisma.document.update({ where: { id: document.id }, data: { status: "OCR_PROCESSING" } });
      });
      if (!extracted.text.trim()) throw new AppError(422, "NO_TEXT_FOUND", "No usable text could be extracted from the document.");
      await prisma.document.update({ where: { id: document.id }, data: { status: "ANALYZING", extractedText: extracted.text } });
      const analysis = await this.ai.analyzeDocument(extracted.text);
      const chunks = splitIntoChunks(extracted.text);
      await prisma.$transaction([
        prisma.documentChunk.deleteMany({ where: { documentId: document.id, workspaceId } }),
        prisma.documentChunk.createMany({ data: chunks.map((content, chunkIndex) => ({ documentId: document.id, workspaceId, chunkIndex, content })) }),
        prisma.document.update({ where: { id: document.id }, data: analysisData(analysis, this.ai.lastMetadata?.provider === "deterministic") }),
        prisma.usageEvent.create({ data: { workspaceId, eventType: "document.analysis", metadata: this.ai.lastMetadata } }),
      ]);
      await new KnowledgeGraphService().rebuildDocument(document.id, workspaceId, analysis).catch(() => undefined);
    } catch (error) {
      await prisma.document.update({ where: { id: document.id }, data: { status: "FAILED", errorCode: error instanceof AppError ? error.code : "PROCESSING_FAILED", errorMessage: error instanceof AppError ? error.message : "Document processing failed." } });
      if (error instanceof AppError && error.code.startsWith("AI_")) await new KnowledgeGraphService().rebuildDocument(document.id, workspaceId).catch(() => undefined);
      throw error;
    }
  }
}

function analysisData(analysis: DocumentAnalysis, evidenceOnly = false) {
  return { status: "READY" as const, summary: analysis.summary, keyPoints: analysis.keyPoints, keywords: analysis.keywords, actionItems: analysis.actionItems, importantDates: analysis.importantDates, errorCode: evidenceOnly ? "EVIDENCE_ONLY" : null, errorMessage: evidenceOnly ? "Evidence-only mode" : null };
}

export function createDocumentProcessor() { return new DocumentProcessor(createAIProvider(), new TesseractOCRProvider()); }

export async function answerQuestion(documentId: string, workspaceId: string, question: string, ai: AIProvider = createAIProvider()) {
  const document = await prisma.document.findFirst({ where: { id: documentId, workspaceId, status: "READY", deletedAt: null }, include: { chunks: { orderBy: { chunkIndex: "asc" } } } });
  if (!document) throw new AppError(404, "DOCUMENT_NOT_READY", "The document is not ready for questions.");
  const evidence = retrieveRelevantChunks(question, document.chunks);
  try { return await ai.answerDocumentQuestion(question, evidence); }
  catch (error) {
    if (error instanceof AppError && ["AI_PROVIDERS_UNAVAILABLE", "AI_EMPTY_RESPONSE"].includes(error.code)) {
      return {
        answer: "Generative synthesis is temporarily unavailable. Relevant source evidence is provided below.",
        citations: evidence.map((chunk) => ({ chunkIndex: chunk.chunkIndex, ...(chunk.pageNumber ? { pageNumber: chunk.pageNumber } : {}), excerpt: chunk.content.replace(/\s+/g, " ").slice(0, 220) })),
        providerMetadata: { provider: "deterministic" as const, fallbackUsed: true },
      };
    }
    throw error;
  }
}

export const questionSchema = z.object({ question: z.string().trim().min(2).max(2_000) });
