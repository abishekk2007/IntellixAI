import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/shared/http.js";

const mocks = vi.hoisted(() => ({
  document: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("../src/config/prisma.js", () => ({ prisma: { document: mocks.document, $transaction: mocks.$transaction } }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: mocks.readFile,
  writeFile: vi.fn(),
}));

import { DocumentProcessor } from "../src/modules/documents/document.service.js";

describe("document processing failures", () => {
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
});
