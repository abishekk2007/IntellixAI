import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/shared/http.js";

const mocks = vi.hoisted(() => ({
  document: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  documentChunk: { deleteMany: vi.fn(), createMany: vi.fn() },
  usageEvent: { create: vi.fn() },
  $transaction: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("../src/config/prisma.js", () => ({ prisma: { document: mocks.document, documentChunk: mocks.documentChunk, usageEvent: mocks.usageEvent, $transaction: mocks.$transaction } }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: mocks.readFile,
  writeFile: vi.fn(),
}));

import { DocumentProcessor } from "../src/modules/documents/document.service.js";

describe("document processing failures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists a sanitized FAILED AI_RATE_LIMITED state", async () => {
    mocks.document.findFirst.mockResolvedValue({ id:"document-id", workspaceId:"workspace-id", status:"UPLOADED", storageKey:"workspace-id/document.txt", mimeType:"text/plain" });
    mocks.document.updateMany.mockResolvedValue({ count:1 });
    mocks.document.update.mockResolvedValue({});
    mocks.readFile.mockResolvedValue(Buffer.from("A safe document with enough text for analysis."));
    const ai = { analyzeDocument:vi.fn().mockRejectedValue(new AppError(429,"AI_RATE_LIMITED","Gemini usage limit has been reached for this project. Please wait and retry, or check the project quota and billing settings.")), answerDocumentQuestion:vi.fn() };
    const ocr = { extractText:vi.fn() };
    const processor = new DocumentProcessor(ai, ocr);
    await expect(processor.process("document-id","workspace-id")).rejects.toMatchObject({ code:"AI_RATE_LIMITED" });
    expect(mocks.document.update).toHaveBeenLastCalledWith({ where:{ id:"document-id" }, data:{ status:"FAILED", errorCode:"AI_RATE_LIMITED", errorMessage:"Gemini usage limit has been reached for this project. Please wait and retry, or check the project quota and billing settings." } });
    expect(JSON.stringify(mocks.document.update.mock.calls)).not.toContain("RESOURCE_EXHAUSTED");
  });

  it("persists validated fallback analysis with safe OpenRouter metadata", async () => {
    mocks.document.findFirst.mockResolvedValue({ id:"document-id", workspaceId:"workspace-id", status:"UPLOADED", storageKey:"workspace-id/document.txt", mimeType:"text/plain" });
    mocks.document.updateMany.mockResolvedValue({ count:1 });
    mocks.document.update.mockResolvedValue({});
    mocks.readFile.mockResolvedValue(Buffer.from("A safe document with enough text for analysis."));
    mocks.$transaction.mockResolvedValue([]);
    const analysis = { summary:"Summary", keyPoints:["Point"], keywords:["keyword"], actionItems:[], importantDates:[], entities:[], relationships:[] };
    const ai = {
      lastMetadata: { provider:"openrouter" as const, model:"openrouter/free", fallbackUsed:true, status:200 },
      analyzeDocument:vi.fn().mockResolvedValue(analysis), answerDocumentQuestion:vi.fn(),
    };
    await expect(new DocumentProcessor(ai, { extractText:vi.fn() }).process("document-id","workspace-id")).resolves.toBeUndefined();
    expect(mocks.document.update).toHaveBeenCalledWith({ where:{ id:"document-id" }, data:expect.objectContaining({ status:"READY", summary:"Summary" }) });
    expect(mocks.usageEvent.create).toHaveBeenCalledWith({ data:{ workspaceId:"workspace-id", eventType:"document.analysis", metadata:ai.lastMetadata } });
  });

  it("marks deterministic analysis READY and labels evidence-only mode", async () => {
    mocks.document.findFirst.mockResolvedValue({ id:"document-id", workspaceId:"workspace-id", status:"UPLOADED", storageKey:"workspace-id/document.txt", mimeType:"text/plain" });
    mocks.document.updateMany.mockResolvedValue({ count:1 });
    mocks.document.update.mockResolvedValue({});
    mocks.readFile.mockResolvedValue(Buffer.from("Abishek must prepare the dashboard tomorrow."));
    mocks.$transaction.mockResolvedValue([]);
    const ai = {
      lastMetadata: { provider:"deterministic" as const, fallbackUsed:true, mode:"evidence-only" as const },
      analyzeDocument:vi.fn().mockResolvedValue({ summary:"Evidence-only mode: source summary", keyPoints:["Point"], keywords:["dashboard"], actionItems:[], importantDates:[], entities:[], relationships:[] }),
      answerDocumentQuestion:vi.fn(),
    };
    await new DocumentProcessor(ai, { extractText:vi.fn() }).process("document-id","workspace-id");
    expect(mocks.document.update).toHaveBeenCalledWith({ where:{ id:"document-id" }, data:expect.objectContaining({ status:"READY", errorCode:"EVIDENCE_ONLY", errorMessage:"Evidence-only mode" }) });
  });
});
