import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { AppError } from "../shared/http.js";
import { verifyAccessToken } from "../modules/auth/auth.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const value = req.header("authorization");
    if (!value?.startsWith("Bearer ")) throw new AppError(401, "UNAUTHORIZED", "A valid access token is required.");
    const claims = verifyAccessToken(value.slice(7));
    const membership = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: claims.sub, workspaceId: claims.workspaceId } } });
    if (!membership) throw new AppError(403, "WORKSPACE_FORBIDDEN", "You do not have access to this workspace.");
    req.auth = { userId: claims.sub, workspaceId: claims.workspaceId };
    next();
  } catch (error) { next(error); }
}

export function authContext(req: Request) {
  if (!req.auth) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return req.auth;
}
