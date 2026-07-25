import type { AIProvider } from "../src/modules/ai/provider.js";
import { AppError } from "../src/shared/http.js";
import {
  extractDeterministicGraph,
  KnowledgeGraphService,
  mergeGraphCandidates,
  normalizeEntityName,
} from "../src/modules/knowledge/knowledge.service.js";
import { describe, expect, it, vi } from "vitest";

const workspaceId = "workspace-one";

function questionDb() {
  return {
    knowledgeEntity: {
      findMany: vi.fn().mockResolvedValue([
        { id: "gemini", name: "Gemini", type: "TECHNOLOGY" },
        { id: "intellix", name: "Intellix", type: "PROJECT" },
      ]),
      findFirst: vi.fn(),
    },
    knowledgeRelation: {
      findMany: vi.fn().mockResolvedValue([
        { sourceEntityId: "intellix", targetEntityId: "gemini" },
      ]),
    },
    knowledgeEntitySource: {
      findMany: vi.fn().mockResolvedValue([
        { workspaceId, entityId: "gemini", documentId: "doc-a", document: { id: "doc-a", name: "Architecture brief" } },
        { workspaceId, entityId: "intellix", documentId: "doc-b", document: { id: "doc-b", name: "Delivery plan" } },
      ]),
    },
    documentChunk: {
      findMany: vi.fn().mockResolvedValue([
        { id: "chunk-a", documentId: "doc-a", workspaceId, chunkIndex: 0, pageNumber: 1, content: "Intellix uses Gemini to analyze documents.", document: { id: "doc-a", name: "Architecture brief" } },
        { id: "chunk-b", documentId: "doc-b", workspaceId, chunkIndex: 2, pageNumber: 3, content: "Gemini supports the Intellix delivery workflow.", document: { id: "doc-b", name: "Delivery plan" } },
      ]),
    },
  };
}

function ai(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    analyzeDocument: vi.fn(),
    answerDocumentQuestion: vi.fn().mockResolvedValue({
      answer: "Both documents connect Gemini to the Intellix workflow.",
      citations: [{ chunkIndex: 0 }, { chunkIndex: 1 }],
    }),
    ...overrides,
  } as AIProvider;
}

describe("knowledge graph", () => {
  it("normalizes equivalent entity names", () => {
    expect(normalizeEntityName("  Gemini   API ")).toBe("gemini api");
    expect(normalizeEntityName("Gemini API")).toBe("gemini api");
  });

  it("creates shared entities and task/date relationships from two documents", () => {
    const architecture = extractDeterministicGraph({
      id: "doc-a",
      name: "Architecture brief",
      extractedText: "Intellix uses Gemini and Prisma. Aakash must validate Gemini by July 25, 2026.",
      keywords: ["Gemini", "Prisma"],
      importantDates: [{ label: "Demo", date: "July 25, 2026" }],
      actionItems: [{ title: "Validate Gemini", description: "Aakash must validate Gemini by July 25, 2026" }],
    }, "Intellix");
    const delivery = extractDeterministicGraph({
      id: "doc-b",
      name: "Delivery plan",
      extractedText: "Gemini supports Intellix. Aakash should prepare the demo.",
      keywords: ["Gemini"],
    }, "Intellix");
    const merged = mergeGraphCandidates([architecture, delivery]);

    expect(merged.nodes.filter((node) => node.normalized === "gemini")).toHaveLength(1);
    expect(merged.edges.filter((edge) => edge.type === "MENTIONED_IN" && edge.sourceKey === "TECHNOLOGY:gemini")).toHaveLength(2);
    expect(merged.edges.some((edge) => edge.type === "ASSIGNED_TO")).toBe(true);
    expect(merged.edges.some((edge) => edge.type === "DUE_ON")).toBe(true);
  });

  it("deduplicates the same graph input for repeatable rebuilds", () => {
    const graph = extractDeterministicGraph({ id: "doc-a", name: "Brief", extractedText: "Intellix uses Gemini." }, "Intellix");
    expect(mergeGraphCandidates([graph, graph])).toEqual(graph);
  });

  it("scopes entity search to the authenticated workspace", async () => {
    const db = {
      knowledgeEntity: { findMany: vi.fn().mockResolvedValue([]) },
      task: { findMany: vi.fn() },
    };
    await new KnowledgeGraphService(db as never, ai()).search(workspaceId, "Gemini", "TECHNOLOGY");
    expect(db.knowledgeEntity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId, normalized: { contains: "gemini" }, type: "TECHNOLOGY" },
    }));
  });

  it("scopes entity detail and its linked tasks to the authenticated workspace", async () => {
    const db = {
      knowledgeEntity: {
        findFirst: vi.fn().mockResolvedValue({
          id: "gemini", name: "Gemini", type: "TECHNOLOGY",
          sources: [{ documentId: "doc-a", excerpt: "Gemini analyzes documents.", pageNumber: 1, chunk: { chunkIndex: 0 }, document: { id: "doc-a", name: "Brief", status: "READY" } }],
          outgoingRelations: [], incomingRelations: [],
        }),
      },
      task: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await new KnowledgeGraphService(db as never, ai()).getEntity(workspaceId, "gemini");

    expect(result.sourceDocuments).toEqual([{ id: "doc-a", name: "Brief", status: "READY" }]);
    expect(db.knowledgeEntity.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "gemini", workspaceId } }));
    expect(db.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId, sourceDocumentId: { in: ["doc-a"] } } }));
  });

  it("returns graph-guided citations from multiple documents", async () => {
    const db = questionDb();
    const result = await new KnowledgeGraphService(db as never, ai()).askQuestion(workspaceId, "How does Gemini connect to Intellix?");

    expect(result.synthesisAvailable).toBe(true);
    expect(new Set(result.citations.map((citation) => citation.documentId))).toEqual(new Set(["doc-a", "doc-b"]));
    expect(db.documentChunk.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId }) }));
  });

  it.each(["AI_RATE_LIMITED", "AI_EMPTY_RESPONSE"])("keeps bounded deterministic evidence when synthesis fails with %s", async (code) => {
    const result = await new KnowledgeGraphService(questionDb() as never, ai({
      answerDocumentQuestion: vi.fn().mockRejectedValue(new AppError(503, code, "AI synthesis unavailable.")),
    })).askQuestion(workspaceId, "How does Gemini connect to Intellix?");

    expect(result).toMatchObject({ synthesisAvailable: false, status: code, providerMetadata: { provider: "deterministic", fallbackUsed: true } });
    expect(result.citations).toHaveLength(2);
    expect(result.evidence).toHaveLength(2);
  });
});
