import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/http.js";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(128),
  workspaceName: z.string().trim().min(2).max(80),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

type AccessClaims = { sub: string; workspaceId: string };

function workspaceSlug(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${randomBytes(3).toString("hex")}`;
}

function hashRefreshToken(token: string) {
  return createHmac("sha256", env.JWT_REFRESH_SECRET).update(token).digest("hex");
}

function accessToken(userId: string, workspaceId: string) {
  return jwt.sign({ workspaceId }, env.JWT_ACCESS_SECRET, { subject: userId, expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

async function newSession(userId: string, workspaceId: string) {
  const token = randomBytes(48).toString("base64url");
  const session = await prisma.refreshSession.create({ data: {
    userId, workspaceId, tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 86_400_000),
  }});
  return { refreshToken: `${session.id}.${token}`, accessToken: accessToken(userId, workspaceId) };
}

export async function register(input: z.infer<typeof registerSchema>) {
  const data = registerSchema.parse(input);
  const passwordHash = await bcrypt.hash(data.password, 12);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: data.name, email: data.email, passwordHash } });
      const workspace = await tx.workspace.create({ data: { name: data.workspaceName, slug: workspaceSlug(data.workspaceName) } });
      await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
      await tx.auditLog.create({ data: { workspaceId: workspace.id, actorUserId: user.id, action: "auth.register", resource: "User", resourceId: user.id } });
      return { user, workspace };
    });
    return { user: { id: created.user.id, name: created.user.name, email: created.user.email }, workspace: created.workspace, ...(await newSession(created.user.id, created.workspace.id)) };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new AppError(409, "REGISTRATION_FAILED", "Unable to create the account with those details.");
    throw error;
  }
}

export async function login(input: z.infer<typeof loginSchema>) {
  const data = loginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email: data.email }, include: { memberships: { include: { workspace: true }, take: 1 } } });
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash)) || !user.memberships[0]) throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  const membership = user.memberships[0];
  return { user: { id: user.id, name: user.name, email: user.email }, workspace: membership.workspace, ...(await newSession(user.id, membership.workspaceId)) };
}

export async function rotateRefreshToken(value: string) {
  const [sessionId, token] = value.split(".");
  if (!sessionId || !token) throw new AppError(401, "INVALID_REFRESH_TOKEN", "The refresh session is invalid.");
  const session = await prisma.refreshSession.findUnique({ where: { id: sessionId } });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.tokenHash !== hashRefreshToken(token)) throw new AppError(401, "INVALID_REFRESH_TOKEN", "The refresh session is invalid.");
  const nextToken = randomBytes(48).toString("base64url");
  const next = await prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (revoked.count !== 1) throw new AppError(401, "INVALID_REFRESH_TOKEN", "The refresh session is invalid.");
    return tx.refreshSession.create({ data: {
      userId: session.userId, workspaceId: session.workspaceId, tokenHash: hashRefreshToken(nextToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 86_400_000),
    }});
  });
  return { refreshToken: `${next.id}.${nextToken}`, accessToken: accessToken(session.userId, session.workspaceId) };
}

export async function logout(value?: string) {
  const sessionId = value?.split(".")[0];
  if (sessionId) await prisma.refreshSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof claims === "string" || !claims.sub || typeof claims.workspaceId !== "string") throw new Error("claims");
    return { sub: claims.sub, workspaceId: claims.workspaceId };
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "A valid access token is required.");
  }
}
