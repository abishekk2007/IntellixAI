declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; workspaceId: string; sessionId?: string };
    }
  }
}
export {};
