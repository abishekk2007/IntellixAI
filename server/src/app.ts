import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import pinoHttp from "pino-http";
import { z } from "zod";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { jobs } from "./jobs/job.service.js";
import { authContext, requireAuth } from "./middleware/auth.js";
import { login, loginSchema, logout, register, registerSchema, rotateRefreshToken } from "./modules/auth/auth.js";
import { analysisSchema } from "./modules/ai/provider.js";
import { answerQuestion, createDocumentProcessor, questionSchema, sanitizeOriginalName, storeUpload } from "./modules/documents/document.service.js";
import { entityTypes, graphQuestionSchema, graphSearchSchema, KnowledgeGraphService } from "./modules/knowledge/knowledge.service.js";
import { AppError, errorHandler, notFound, ok } from "./shared/http.js";

const refreshCookie = "intellix_refresh";
const taskInput = z.object({
  title: z.string().trim().min(1).max(200), description: z.string().trim().max(2_000).optional(),
  dueDate: z.string().datetime({ offset: true }).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});
const actionTaskSchema = z.object({ items: z.array(taskInput).min(1).max(30), confirmed: z.literal(true) });
const taskPatch = taskInput.partial().extend({ status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional() }).refine((value) => Object.keys(value).length > 0, "At least one change is required.");

function cookie(req: express.Request, name: string) {
  const item = req.header("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}
function setRefreshCookie(res: express.Response, value: string) {
  res.cookie(refreshCookie, value, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", maxAge: env.JWT_REFRESH_EXPIRES_IN_DAYS * 86_400_000, path: "/api/v1/auth" });
}
function publicDocument<T extends { storageKey?: unknown; extractedText?: unknown; errorMessage?: unknown }>(document: T) {
  const safe = { ...document };
  delete safe.storageKey;
  delete safe.extractedText;
  return safe;
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => { res.locals.requestId = req.header("x-request-id") ?? randomUUID(); res.setHeader("x-request-id", res.locals.requestId); next(); });
  app.use(pinoHttp({ redact: ["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.refreshToken"] }));
  app.use(helmet());
  const allowedOrigins = new Set(env.FRONTEND_URLS);
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    optionsSuccessStatus: 204,
  }));
  app.use(express.json({ limit: "1mb" }));
  const health = async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    try { await prisma.$queryRaw`SELECT 1`; ok(res, { status: "ok", database: "connected" }); }
    catch { next(new AppError(503, "DATABASE_UNAVAILABLE", "The database is unavailable.")); }
  };
  app.get("/health", health);
  app.get("/api/v1/health", health);

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
  app.post("/api/v1/auth/register", authLimiter, async (req, res, next) => { try { const result = await register(registerSchema.parse(req.body)); setRefreshCookie(res, result.refreshToken); ok(res, { user: result.user, workspace: result.workspace, accessToken: result.accessToken }, 201); } catch (error) { next(error); } });
  app.post("/api/v1/auth/login", authLimiter, async (req, res, next) => { try { const result = await login(loginSchema.parse(req.body)); setRefreshCookie(res, result.refreshToken); ok(res, { user: result.user, workspace: result.workspace, accessToken: result.accessToken }); } catch (error) { next(error); } });
  app.post("/api/v1/auth/refresh", authLimiter, async (req, res, next) => { try { const value = cookie(req, refreshCookie); if (!value) throw new AppError(401, "REFRESH_REQUIRED", "A refresh session is required."); const result = await rotateRefreshToken(value); setRefreshCookie(res, result.refreshToken); ok(res, { accessToken: result.accessToken }); } catch (error) { next(error); } });
  app.post("/api/v1/auth/logout", async (req, res, next) => { try { await logout(cookie(req, refreshCookie)); res.clearCookie(refreshCookie, { path: "/api/v1/auth" }); ok(res, { loggedOut: true }); } catch (error) { next(error); } });
  app.get("/api/v1/auth/me", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const membership = await prisma.membership.findUnique({ where: { userId_workspaceId: auth }, include: { user: true, workspace: true } }); if (!membership) throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Workspace membership not found."); ok(res, { user: { id: membership.user.id, name: membership.user.name, email: membership.user.email }, workspace: membership.workspace, role: membership.role }); } catch (error) { next(error); } });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 } });
  const uploadLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
  app.post("/api/v1/documents", uploadLimiter, requireAuth, upload.single("file"), async (req, res, next) => { try {
    if (!req.file) throw new AppError(400, "FILE_REQUIRED", "Choose a document to upload.");
    const auth = authContext(req); const stored = await storeUpload(req.file, auth.workspaceId);
    const document = await prisma.document.create({ data: { workspaceId: auth.workspaceId, uploadedById: auth.userId, name: sanitizeOriginalName(req.file.originalname), mimeType: stored.mimeType, sizeBytes: req.file.size, storageKey: stored.storageKey } });
    await prisma.auditLog.create({ data: { workspaceId: auth.workspaceId, actorUserId: auth.userId, action: "document.upload", resource: "Document", resourceId: document.id } });
    await jobs.enqueue(`document:${document.id}`, () => createDocumentProcessor().process(document.id, auth.workspaceId));
    ok(res, publicDocument(document), 202);
  } catch (error) { next(error); } });
  app.get("/api/v1/documents", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const documents = await prisma.document.findMany({ where: { workspaceId: auth.workspaceId, deletedAt: null }, orderBy: { updatedAt: "desc" } }); ok(res, documents.map(publicDocument)); } catch (error) { next(error); } });
  app.get("/api/v1/documents/history", requireAuth, async (req, res, next) => { try {
    const auth = authContext(req);
    const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || "20", 10)));
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const fileType = req.query.fileType as string | undefined;
    const analysisMode = req.query.analysisMode as string | undefined;
    const sort = req.query.sort as string | undefined;

    const where: Record<string, unknown> = { workspaceId: auth.workspaceId, deletedAt: null };
    if (search) where.name = { contains: search, mode: "insensitive" };
    if (status) where.status = status;
    if (fileType) {
      if (fileType === "txt") where.mimeType = "text/plain";
      else if (fileType === "pdf") where.mimeType = "application/pdf";
      else if (fileType === "image") where.mimeType = { startsWith: "image/" };
    }
    if (analysisMode) {
      if (analysisMode === "evidence-only") where.errorCode = "EVIDENCE_ONLY";
      else if (analysisMode === "synthesis") where.errorCode = null;
      // "not-analysed" could mean status is not READY or FAILED, or we don't have analysis.
    }

    let orderBy: Record<string, unknown> = { createdAt: "desc" };
    if (sort === "oldest") orderBy = { createdAt: "asc" };
    else if (sort === "filename") orderBy = { name: "asc" };
    else if (sort === "status") orderBy = { status: "asc" };

    const [total, items, ready, processing, failed] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, name: true, mimeType: true, sizeBytes: true, status: true,
          errorCode: true, errorMessage: true, createdAt: true, updatedAt: true,
          uploadedById: true,
          _count: { select: { tasks: true } }
        }
      }),
      prisma.document.count({ where: { workspaceId: auth.workspaceId, deletedAt: null, status: "READY" } }),
      prisma.document.count({ where: { workspaceId: auth.workspaceId, deletedAt: null, status: { in: ["UPLOADED", "EXTRACTING", "OCR_PROCESSING", "ANALYZING"] } } }),
      prisma.document.count({ where: { workspaceId: auth.workspaceId, deletedAt: null, status: "FAILED" } }),
    ]);

    // get uploader information
    const userIds = Array.from(new Set(items.map(i => i.uploadedById)));
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
    const userMap = new Map(users.map(u => [u.id, u]));

    // get graph inclusion status
    const docIds = items.map(i => i.id);
    const graphInclusions = await prisma.knowledgeEntitySource.findMany({ where: { documentId: { in: docIds } }, select: { documentId: true }, distinct: ["documentId"] });
    const graphDocIds = new Set(graphInclusions.map(g => g.documentId));

    const enrichedItems = items.map(item => {
      const uploader = userMap.get(item.uploadedById);
      const isEvidenceOnly = item.errorCode === "EVIDENCE_ONLY";
      return {
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        status: item.status,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        uploadedBy: uploader ? { name: uploader.name, email: uploader.email } : null,
        taskCount: item._count.tasks,
        analysisMode: isEvidenceOnly ? "evidence-only" : (item.status === "READY" ? "synthesis" : "not-analysed"),
        graphStatus: graphDocIds.has(item.id) ? "included" : (item.status === "READY" ? "not-built" : (item.status === "FAILED" ? "failed" : "not-applicable"))
      };
    });

    ok(res, {
      items: enrichedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: { total: total, ready, processing, failed }
    });
  } catch (error) { next(error); } });
  app.get("/api/v1/documents/:documentId", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const document = await prisma.document.findFirst({ where: { id: String(req.params.documentId), workspaceId: auth.workspaceId, deletedAt: null } }); if (!document) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found."); ok(res, publicDocument(document)); } catch (error) { next(error); } });
  app.get("/api/v1/documents/:documentId/status", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const document = await prisma.document.findFirst({ where: { id: String(req.params.documentId), workspaceId: auth.workspaceId, deletedAt: null }, select: { id: true, status: true, errorCode: true, errorMessage: true, updatedAt: true } }); if (!document) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found."); ok(res, document); } catch (error) { next(error); } });
  app.post("/api/v1/documents/:documentId/analyze", requireAuth, async (req, res, next) => { try {
    const auth = authContext(req);
    const document = await prisma.document.findFirst({ where: { id: String(req.params.documentId), workspaceId: auth.workspaceId, deletedAt: null } });
    if (!document) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found.");
    if (["UPLOADED", "EXTRACTING", "OCR_PROCESSING", "ANALYZING"].includes(document.status)) throw new AppError(409, "ANALYSIS_IN_PROGRESS", "This document is already being processed.");
    const queued = await prisma.document.updateMany({ where: { id: document.id, workspaceId: auth.workspaceId, deletedAt: null, status: document.status }, data: { status: "UPLOADED", errorCode: null, errorMessage: null } });
    if (!queued.count) throw new AppError(409, "ANALYSIS_IN_PROGRESS", "This document is already being processed.");
    try {
      await jobs.enqueue(`document:${document.id}`, () => createDocumentProcessor().process(document.id, auth.workspaceId));
    } catch (error) {
      await prisma.document.updateMany({
        where: { id: document.id, workspaceId: auth.workspaceId, deletedAt: null, status: "UPLOADED" },
        data: { status: document.status, errorCode: document.errorCode, errorMessage: document.errorMessage },
      });
      throw error;
    }
    ok(res, { id: document.id, status: "UPLOADED" }, 202);
  } catch (error) { next(error); } });
  app.post("/api/v1/documents/:documentId/questions", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const { question } = questionSchema.parse(req.body); ok(res, await answerQuestion(String(req.params.documentId), auth.workspaceId, question)); } catch (error) { next(error); } });
  app.delete("/api/v1/documents/:documentId", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const result = await prisma.document.updateMany({ where: { id: String(req.params.documentId), workspaceId: auth.workspaceId, deletedAt: null }, data: { deletedAt: new Date() } }); if (!result.count) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found."); ok(res, { deleted: true }); } catch (error) { next(error); } });

  app.post("/api/v1/documents/:documentId/action-items/tasks", requireAuth, async (req, res, next) => { try {
    const auth = authContext(req); const input = actionTaskSchema.parse(req.body);
    const document = await prisma.document.findFirst({ where: { id: String(req.params.documentId), workspaceId: auth.workspaceId, status: "READY", deletedAt: null } });
    if (!document) throw new AppError(404, "DOCUMENT_NOT_READY", "The document is not ready for task creation.");
    analysisSchema.shape.actionItems.parse(document.actionItems);
    const tasks = await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findMany({ where: { workspaceId: auth.workspaceId, sourceDocumentId: document.id }, select: { title: true, dueDate: true } });
      const unique = input.items.filter((item) => !existing.some((task) => task.title === item.title && task.dueDate?.toISOString() === (item.dueDate ? new Date(item.dueDate).toISOString() : undefined)));
      return Promise.all(unique.map((item) => tx.task.create({ data: { workspaceId: auth.workspaceId, createdById: auth.userId, sourceDocumentId: document.id, title: item.title, description: item.description, dueDate: item.dueDate ? new Date(item.dueDate) : undefined, priority: item.priority } })));
    });
    await prisma.auditLog.create({ data: { workspaceId: auth.workspaceId, actorUserId: auth.userId, action: "tasks.create_from_document", resource: "Document", resourceId: document.id, metadata: { count: tasks.length } } });
    ok(res, tasks, 201);
  } catch (error) { next(error); } });
  app.post("/api/v1/tasks", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const item = taskInput.parse(req.body); const task = await prisma.task.create({ data: { ...item, dueDate: item.dueDate ? new Date(item.dueDate) : undefined, workspaceId: auth.workspaceId, createdById: auth.userId } }); ok(res, task, 201); } catch (error) { next(error); } });
  app.get("/api/v1/tasks", requireAuth, async (req, res, next) => { try { const auth = authContext(req); ok(res, await prisma.task.findMany({ where: { workspaceId: auth.workspaceId }, orderBy: { updatedAt: "desc" } })); } catch (error) { next(error); } });
  app.patch("/api/v1/tasks/:taskId", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const item = taskPatch.parse(req.body); const existing = await prisma.task.findFirst({ where: { id: String(req.params.taskId), workspaceId: auth.workspaceId } }); if (!existing) throw new AppError(404, "TASK_NOT_FOUND", "Task not found."); ok(res, await prisma.task.update({ where: { id: existing.id }, data: { ...item, dueDate: item.dueDate ? new Date(item.dueDate) : undefined } })); } catch (error) { next(error); } });
  app.delete("/api/v1/tasks/:taskId", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const result = await prisma.task.deleteMany({ where: { id: String(req.params.taskId), workspaceId: auth.workspaceId } }); if (!result.count) throw new AppError(404, "TASK_NOT_FOUND", "Task not found."); ok(res, { deleted: true }); } catch (error) { next(error); } });
  app.get("/api/v1/dashboard/summary", requireAuth, async (req, res, next) => { try {
    const auth = authContext(req); const documentScope = { workspaceId: auth.workspaceId, deletedAt: null } as const;
    const [totalDocuments, readyDocuments, processingDocuments, failedDocuments, totalTasks, pendingTasks, completedTasks, recentDocuments, recentTasks] = await Promise.all([
      prisma.document.count({ where: documentScope }),
      prisma.document.count({ where: { ...documentScope, status: "READY" } }),
      prisma.document.count({ where: { ...documentScope, status: { in: ["UPLOADED", "EXTRACTING", "OCR_PROCESSING", "ANALYZING"] } } }),
      prisma.document.count({ where: { ...documentScope, status: "FAILED" } }),
      prisma.task.count({ where: { workspaceId: auth.workspaceId } }),
      prisma.task.count({ where: { workspaceId: auth.workspaceId, status: { in: ["TODO", "IN_PROGRESS"] } } }),
      prisma.task.count({ where: { workspaceId: auth.workspaceId, status: "DONE" } }),
      prisma.document.findMany({ where: documentScope, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, name: true, status: true, updatedAt: true } }),
      prisma.task.findMany({ where: { workspaceId: auth.workspaceId }, orderBy: { updatedAt: "desc" }, take: 5 }),
    ]);
    ok(res, { totalDocuments, readyDocuments, processingDocuments, failedDocuments, totalTasks, pendingTasks, completedTasks, recentDocuments, recentTasks });
  } catch (error) { next(error); } });

  app.post("/api/v1/knowledge-graph/rebuild", requireAuth, async (req, res, next) => { try { const auth = authContext(req); ok(res, await new KnowledgeGraphService().rebuildWorkspace(auth.workspaceId), 202); } catch (error) { next(error); } });
  app.post("/api/v1/documents/:documentId/knowledge-graph/rebuild", requireAuth, async (req, res, next) => { try { const auth = authContext(req); ok(res, await new KnowledgeGraphService().rebuildDocument(String(req.params.documentId), auth.workspaceId), 202); } catch (error) { next(error); } });
  app.get("/api/v1/knowledge-graph", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const type = z.enum(entityTypes).optional().parse(req.query.type); ok(res, await new KnowledgeGraphService().getGraph(auth.workspaceId, type)); } catch (error) { next(error); } });
  app.get("/api/v1/knowledge-graph/search", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const input = graphSearchSchema.parse(req.query); ok(res, await new KnowledgeGraphService().search(auth.workspaceId, input.q, input.type)); } catch (error) { next(error); } });
  app.get("/api/v1/knowledge-graph/entities/:entityId", requireAuth, async (req, res, next) => { try { const auth = authContext(req); ok(res, await new KnowledgeGraphService().getEntity(auth.workspaceId, String(req.params.entityId))); } catch (error) { next(error); } });
  app.post("/api/v1/knowledge-graph/questions", requireAuth, async (req, res, next) => { try { const auth = authContext(req); const input = graphQuestionSchema.parse(req.body); ok(res, await new KnowledgeGraphService().askQuestion(auth.workspaceId, input.question)); } catch (error) { next(error); } });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
