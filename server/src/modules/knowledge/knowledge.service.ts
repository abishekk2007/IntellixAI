import { KnowledgeEntityType, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/http.js";
import { createAIProvider, type AIProvider, type DocumentAnalysis } from "../ai/provider.js";

export const entityTypes = ["PERSON", "ORGANIZATION", "PROJECT", "TASK", "DATE", "TECHNOLOGY", "TOPIC", "LOCATION", "DOCUMENT"] as const;
export const relationTypes = ["DOCUMENT_MENTIONS_ENTITY", "MENTIONED_IN", "HAS_TASK", "DUE_ON", "ASSIGNED_TO", "RELATED_TO", "USES", "REFERENCES", "RESPONSIBLE_FOR", "USED_BY", "DUE_DATE_FOR", "ENABLES"] as const;
const technologyNames = ["Gemini", "Supabase", "Prisma", "PostgreSQL", "Next.js", "React", "TypeScript", "Express", "Tesseract", "OCR"];

export type GraphCandidateNode = { key: string; name: string; normalized: string; type: KnowledgeEntityType; excerpt: string };
export type GraphCandidateEdge = { sourceKey: string; targetKey: string; type: string; confidence: number; documentId: string; excerpt: string };
export type GraphCandidates = { nodes: GraphCandidateNode[]; edges: GraphCandidateEdge[] };

type DeterministicDocument = {
  id: string;
  name: string;
  extractedText?: string | null;
  keywords?: unknown;
  importantDates?: unknown;
  actionItems?: unknown;
};
type LinkedTask = { title: string; description?: string | null; dueDate?: Date | null };

export function normalizeEntityName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function extractDeterministicGraph(
  document: DeterministicDocument,
  workspaceName: string,
  tasks: LinkedTask[] = [],
  enhanced?: Pick<DocumentAnalysis, "entities" | "relationships">,
): GraphCandidates {
  const nodes = new Map<string, GraphCandidateNode>();
  const edges = new Map<string, GraphCandidateEdge>();
  const excerpt = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 500);
  const addNode = (name: string, type: KnowledgeEntityType, evidence: string) => {
    const normalized = normalizeEntityName(name);
    if (!normalized) return "";
    const key = `${type}:${normalized}`;
    if (!nodes.has(key)) nodes.set(key, { key, name: name.trim().replace(/\s+/g, " ").slice(0, 200), normalized, type, excerpt: excerpt(evidence || name) });
    return key;
  };
  const addEdge = (sourceKey: string, targetKey: string, type: string, evidence: string, confidence = 1) => {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;
    const key = `${sourceKey}|${targetKey}|${type}|${document.id}`;
    if (!edges.has(key)) edges.set(key, { sourceKey, targetKey, type, confidence: Math.max(0, Math.min(1, confidence)), documentId: document.id, excerpt: excerpt(evidence) });
  };
  const linkMention = (documentKey: string, entityKey: string, evidence: string) => {
    addEdge(documentKey, entityKey, "DOCUMENT_MENTIONS_ENTITY", evidence);
    addEdge(entityKey, documentKey, "MENTIONED_IN", evidence);
  };

  const documentKey = addNode(document.name, "DOCUMENT", document.name);
  const projectKey = addNode(workspaceName, "PROJECT", workspaceName);
  addEdge(documentKey, projectKey, "RELATED_TO", `${document.name} belongs to ${workspaceName}`);

  const keywords = stringArray(document.keywords);
  const text = document.extractedText ?? "";
  const discoveredTechnologies = new Set(technologyNames.filter((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text)));
  for (const keyword of keywords) {
    const known = technologyNames.find((name) => normalizeEntityName(name) === normalizeEntityName(keyword));
    const entityKey = addNode(keyword, known ? "TECHNOLOGY" : "TOPIC", keyword);
    linkMention(documentKey, entityKey, keyword);
    if (known) addEdge(projectKey, entityKey, "USES", `${workspaceName} uses ${keyword}`);
  }
  for (const name of discoveredTechnologies) {
    const entityKey = addNode(name, "TECHNOLOGY", sentenceContaining(text, name));
    linkMention(documentKey, entityKey, sentenceContaining(text, name));
    addEdge(projectKey, entityKey, "USES", `${workspaceName} uses ${name}`);
  }

  const dates = dateArray(document.importantDates);
  for (const item of dates) {
    const dateKey = addNode(item.date, "DATE", `${item.label}: ${item.date}`);
    linkMention(documentKey, dateKey, `${item.label}: ${item.date}`);
  }
  const dateMatches = text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?\b/gi) ?? [];
  for (const value of dateMatches) linkMention(documentKey, addNode(value, "DATE", sentenceContaining(text, value)), sentenceContaining(text, value));

  const actions = actionArray(document.actionItems);
  const inferredActions = text.split(/(?<=[.!?])\s+|\r?\n/).map((item) => item.trim()).filter((item) => /\b(?:must|should|due|completed)\b/i.test(item)).slice(0, 20)
    .map((sentence) => ({ title: sentence.replace(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:must|should)\s+/i, "").replace(/[.!?]+$/, ""), description: sentence }));
  for (const item of [...actions, ...inferredActions, ...tasks]) {
    const taskKey = addNode(item.title, "TASK", item.description ?? item.title);
    addEdge(documentKey, taskKey, "HAS_TASK", item.description ?? item.title);
    const person = assignedPerson(item.description ?? item.title);
    if (person) addEdge(addNode(person, "PERSON", item.description ?? item.title), taskKey, "ASSIGNED_TO", item.description ?? item.title);
    const due = "dueDate" in item && item.dueDate ? (item.dueDate instanceof Date ? item.dueDate.toISOString().slice(0, 10) : String(item.dueDate)) : firstDate(item.description ?? item.title);
    if (due) addEdge(taskKey, addNode(due, "DATE", item.description ?? item.title), "DUE_ON", item.description ?? item.title);
  }

  const people = [...text.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\s+(?:must|should|owns?|is responsible for)\b/g)].map((match) => match[1]);
  for (const person of people) linkMention(documentKey, addNode(person, "PERSON", sentenceContaining(text, person)), sentenceContaining(text, person));

  for (const item of enhanced?.entities ?? []) linkMention(documentKey, addNode(item.name, item.type, item.excerpt), item.excerpt);
  for (const relationship of enhanced?.relationships ?? []) {
    const sourceKey = findNodeKey(nodes, relationship.source) || addNode(relationship.source, "TOPIC", relationship.excerpt);
    const targetKey = findNodeKey(nodes, relationship.target) || addNode(relationship.target, "TOPIC", relationship.excerpt);
    addEdge(sourceKey, targetKey, relationship.type, relationship.excerpt, relationship.confidence);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function mergeGraphCandidates(graphs: GraphCandidates[]): GraphCandidates {
  const nodes = new Map<string, GraphCandidateNode>();
  const edges = new Map<string, GraphCandidateEdge>();
  for (const graph of graphs) {
    for (const node of graph.nodes) if (!nodes.has(node.key)) nodes.set(node.key, node);
    for (const edge of graph.edges) {
      const key = `${edge.sourceKey}|${edge.targetKey}|${edge.type}|${edge.documentId}`;
      if (!edges.has(key)) edges.set(key, edge);
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export class KnowledgeGraphService {
  constructor(private readonly db: PrismaClient = prisma, private readonly ai: AIProvider = createAIProvider()) {}

  async rebuildWorkspace(workspaceId: string) {
    const documents = await this.db.document.findMany({ where: { workspaceId, deletedAt: null }, select: { id: true } });
    const results = [];
    for (const document of documents.slice(0, 100)) results.push(await this.rebuildDocument(document.id, workspaceId));
    return { rebuiltDocuments: results.length, deterministic: true };
  }

  async rebuildDocument(documentId: string, workspaceId: string, enhanced?: Pick<DocumentAnalysis, "entities" | "relationships">) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, workspaceId, deletedAt: null },
      include: { workspace: { select: { name: true } }, tasks: { select: { title: true, description: true, dueDate: true } } },
    });
    if (!document) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found.");
    const graph = extractDeterministicGraph(document, document.workspace.name, document.tasks, enhanced);
    await this.db.$transaction([
      this.db.knowledgeRelation.deleteMany({ where: { workspaceId, documentId } }),
      this.db.knowledgeEntitySource.deleteMany({ where: { workspaceId, documentId } }),
    ]);
    const ids = new Map<string, string>();
    for (const node of graph.nodes) {
      const entity = await this.db.knowledgeEntity.upsert({
        where: { workspaceId_normalized_type: { workspaceId, normalized: node.normalized, type: node.type } },
        update: { name: node.name },
        create: { workspaceId, name: node.name, normalized: node.normalized, type: node.type },
      });
      ids.set(node.key, entity.id);
      const existingSource = await this.db.knowledgeEntitySource.findFirst({ where: { workspaceId, entityId: entity.id, documentId, chunkId: null } });
      if (existingSource) await this.db.knowledgeEntitySource.update({ where: { id: existingSource.id }, data: { excerpt: node.excerpt } });
      else await this.db.knowledgeEntitySource.create({ data: { workspaceId, entityId: entity.id, documentId, excerpt: node.excerpt } });
    }
    for (const edge of graph.edges) {
      const sourceEntityId = ids.get(edge.sourceKey);
      const targetEntityId = ids.get(edge.targetKey);
      if (!sourceEntityId || !targetEntityId) continue;
      const existing = await this.db.knowledgeRelation.findFirst({ where: { workspaceId, sourceEntityId, targetEntityId, type: edge.type, documentId } });
      const data = { confidence: edge.confidence, excerpt: edge.excerpt };
      if (existing) await this.db.knowledgeRelation.update({ where: { id: existing.id }, data });
      else await this.db.knowledgeRelation.create({ data: { workspaceId, sourceEntityId, targetEntityId, type: edge.type, documentId, ...data } });
    }
    await this.db.knowledgeEntity.deleteMany({ where: { workspaceId, sources: { none: {} }, outgoingRelations: { none: {} }, incomingRelations: { none: {} } } });
    return { documentId, entities: graph.nodes.length, relationships: graph.edges.length, deterministic: true, enhanced: Boolean(enhanced?.entities.length || enhanced?.relationships.length) };
  }

  async getGraph(workspaceId: string, type?: KnowledgeEntityType) {
    const nodes = await this.db.knowledgeEntity.findMany({ where: { workspaceId, ...(type ? { type } : {}) }, include: { sources: { select: { documentId: true } } }, orderBy: { updatedAt: "desc" }, take: 150 });
    const nodeIds = nodes.map((node) => node.id);
    const edges = nodeIds.length ? await this.db.knowledgeRelation.findMany({ where: { workspaceId, sourceEntityId: { in: nodeIds }, targetEntityId: { in: nodeIds } }, take: 300 }) : [];
    const documentIds = [...new Set(nodes.flatMap((node) => node.sources.map((source) => source.documentId)))];
    const linkedTasks = documentIds.length ? await this.db.task.count({ where: { workspaceId, sourceDocumentId: { in: documentIds } } }) : 0;
    const degrees = new Map<string, number>();
    for (const edge of edges) { degrees.set(edge.sourceEntityId, (degrees.get(edge.sourceEntityId) ?? 0) + 1); degrees.set(edge.targetEntityId, (degrees.get(edge.targetEntityId) ?? 0) + 1); }
    const topConnectedEntities = nodes.map((node) => ({ id: node.id, name: node.name, type: node.type, connections: degrees.get(node.id) ?? 0 })).sort((a, b) => b.connections - a.connections).slice(0, 8);
    return {
      nodes: nodes.map((node) => ({ id: node.id, name: node.name, normalized: node.normalized, type: node.type, documentCount: new Set(node.sources.map((source) => source.documentId)).size })),
      edges: edges.map((edge) => ({ id: edge.id, sourceEntityId: edge.sourceEntityId, targetEntityId: edge.targetEntityId, type: edge.type, confidence: edge.confidence, documentId: edge.documentId })),
      counts: { entities: nodes.length, relationships: edges.length, connectedDocuments: documentIds.length, linkedTasks },
      topConnectedEntities,
    };
  }

  async search(workspaceId: string, query: string, type?: KnowledgeEntityType) {
    const normalized = normalizeEntityName(query);
    const entities = await this.db.knowledgeEntity.findMany({
      where: { workspaceId, normalized: { contains: normalized }, ...(type ? { type } : {}) },
      include: { sources: { include: { document: { select: { id: true, name: true, status: true } } } } },
      take: 40,
    });
    const documentIds = [...new Set(entities.flatMap((entity) => entity.sources.map((source) => source.documentId)))];
    const tasks = documentIds.length ? await this.db.task.findMany({ where: { workspaceId, sourceDocumentId: { in: documentIds } }, select: { id: true, title: true, status: true, priority: true, sourceDocumentId: true }, take: 40 }) : [];
    return entities.map((entity) => ({
      id: entity.id, name: entity.name, type: entity.type,
      documents: uniqueBy(entity.sources.map((source) => source.document), (item) => item.id),
      excerpts: uniqueBy(entity.sources.filter((source) => source.excerpt).map((source) => ({ documentId: source.documentId, excerpt: source.excerpt! })), (item) => `${item.documentId}:${item.excerpt}`),
      tasks: tasks.filter((task) => entity.sources.some((source) => source.documentId === task.sourceDocumentId)),
    }));
  }

  async getEntity(workspaceId: string, entityId: string) {
    const entity = await this.db.knowledgeEntity.findFirst({
      where: { id: entityId, workspaceId },
      include: {
        sources: { include: { document: { select: { id: true, name: true, status: true } }, chunk: { select: { id: true, chunkIndex: true } } } },
        outgoingRelations: { include: { targetEntity: { select: { id: true, name: true, type: true } } }, take: 100 },
        incomingRelations: { include: { sourceEntity: { select: { id: true, name: true, type: true } } }, take: 100 },
      },
    });
    if (!entity) throw new AppError(404, "ENTITY_NOT_FOUND", "Knowledge entity not found.");
    const documentIds = [...new Set(entity.sources.map((source) => source.documentId))];
    const tasks = documentIds.length ? await this.db.task.findMany({ where: { workspaceId, sourceDocumentId: { in: documentIds } }, select: { id: true, title: true, status: true, priority: true, dueDate: true, sourceDocumentId: true }, take: 50 }) : [];
    const connectedDates = [...entity.outgoingRelations, ...entity.incomingRelations].filter((relation) => relation.type === "DUE_ON" || relation.type === "DUE_DATE_FOR").map((relation) => "targetEntity" in relation ? relation.targetEntity : relation.sourceEntity);
    return { entity: { id: entity.id, name: entity.name, type: entity.type }, incomingRelations: entity.incomingRelations, outgoingRelations: entity.outgoingRelations, sourceDocuments: uniqueBy(entity.sources.map((source) => source.document), (item) => item.id), sourceExcerpts: entity.sources.filter((source) => source.excerpt).map((source) => ({ documentId: source.documentId, excerpt: source.excerpt, pageNumber: source.pageNumber, chunkIndex: source.chunk?.chunkIndex })), connectedTasks: tasks, connectedDates: uniqueBy(connectedDates, (item) => item.id) };
  }

  async askQuestion(workspaceId: string, question: string) {
    const terms = normalizeEntityName(question).match(/[a-z0-9]{3,}/g) ?? [];
    const entities = await this.db.knowledgeEntity.findMany({ where: { workspaceId, OR: terms.slice(0, 8).map((term) => ({ normalized: { contains: term } })) }, take: 12 });
    const matchedIds = entities.map((entity) => entity.id);
    const relations = matchedIds.length ? await this.db.knowledgeRelation.findMany({ where: { workspaceId, OR: [{ sourceEntityId: { in: matchedIds } }, { targetEntityId: { in: matchedIds } }] }, take: 60 }) : [];
    const expandedIds = [...new Set([...matchedIds, ...relations.flatMap((relation) => [relation.sourceEntityId, relation.targetEntityId])])];
    const sources = expandedIds.length ? await this.db.knowledgeEntitySource.findMany({ where: { workspaceId, entityId: { in: expandedIds } }, include: { document: { select: { id: true, name: true } } }, take: 100 }) : [];
    const documentIds = [...new Set(sources.map((source) => source.documentId))];
    const chunks = documentIds.length ? await this.db.documentChunk.findMany({ where: { workspaceId, documentId: { in: documentIds } }, include: { document: { select: { id: true, name: true } } }, take: 120 }) : [];
    const ranked = chunks.map((chunk) => ({ chunk, score: terms.reduce((score, term) => score + occurrences(chunk.content, term), 0) }))
      .sort((a, b) => b.score - a.score || a.chunk.documentId.localeCompare(b.chunk.documentId) || a.chunk.chunkIndex - b.chunk.chunkIndex)
      .slice(0, 10).map(({ chunk }, virtualIndex) => ({ ...chunk, virtualIndex }));
    const base = { mode: "Graph-guided cross-document retrieval", matchedEntities: entities.map((entity) => ({ id: entity.id, name: entity.name, type: entity.type })), evidence: ranked.map((item) => ({ documentId: item.document.id, documentName: item.document.name, chunkIndex: item.chunkIndex, pageNumber: item.pageNumber, excerpt: item.content.replace(/\s+/g, " ").slice(0, 220) })) };
    if (!ranked.length) return { ...base, synthesisAvailable: false, answer: "No connected document evidence matched this question.", citations: [] };
    try {
      const answer = await this.ai.answerDocumentQuestion(question, ranked.map((item) => ({ chunkIndex: item.virtualIndex, pageNumber: item.pageNumber, content: item.content })));
      const citations = answer.citations.flatMap((citation) => {
        const match = ranked.find((item) => item.virtualIndex === citation.chunkIndex);
        return match ? [{ documentId: match.document.id, documentName: match.document.name, chunkIndex: match.chunkIndex, ...(match.pageNumber ? { pageNumber: match.pageNumber } : {}), excerpt: match.content.replace(/\s+/g, " ").slice(0, 220) }] : [];
      });
      return { ...base, synthesisAvailable: true, answer: answer.answer, citations, providerMetadata: answer.providerMetadata ?? this.ai.lastMetadata };
    } catch (error) {
      if (error instanceof AppError && ["AI_RATE_LIMITED", "AI_NOT_CONFIGURED", "AI_PROVIDERS_UNAVAILABLE", "AI_EMPTY_RESPONSE"].includes(error.code)) return { ...base, synthesisAvailable: false, status: error.code, answer: "The knowledge graph and source evidence are available, but AI synthesis is temporarily unavailable.", citations: base.evidence, providerMetadata: { provider: "deterministic" as const, fallbackUsed: true } };
      throw error;
    }
  }
}

export const graphSearchSchema = z.object({ q: z.string().trim().min(1).max(100), type: z.enum(entityTypes).optional() });
export const graphQuestionSchema = z.object({ question: z.string().trim().min(2).max(500) });

function stringArray(value: unknown) { return z.array(z.string().trim().min(1).max(200)).safeParse(value).data ?? []; }
function actionArray(value: unknown) { return z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2_000).optional(), dueDate: z.string().optional() })).safeParse(value).data ?? []; }
function dateArray(value: unknown) { return z.array(z.object({ label: z.string().trim().min(1).max(200), date: z.string().trim().min(1).max(100) })).safeParse(value).data ?? []; }
function assignedPerson(value: string) { return value.match(/^([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\s+(?:must|should|owns?|is responsible for)\b/)?.[1]; }
function firstDate(value: string) { return value.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?\b/i)?.[0]; }
function sentenceContaining(text: string, value: string) { return text.split(/(?<=[.!?])\s+|\r?\n/).find((sentence) => sentence.toLowerCase().includes(value.toLowerCase())) ?? value; }
function findNodeKey(nodes: Map<string, GraphCandidateNode>, name: string) { const normalized = normalizeEntityName(name); return [...nodes.values()].find((node) => node.normalized === normalized)?.key ?? ""; }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function occurrences(value: string, term: string) { return value.toLowerCase().split(term).length - 1; }
function uniqueBy<T>(items: T[], key: (item: T) => string) { return [...new Map(items.map((item) => [key(item), item])).values()]; }
