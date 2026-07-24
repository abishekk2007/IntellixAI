const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

type ApiEnvelope<T> = { data: T | null; error: { code: string; message: string } | null; meta: { requestId?: string } };

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); }
}

function token() { return typeof window === "undefined" ? null : sessionStorage.getItem("intellix_access"); }
export function setAccessToken(value: string | null) { if (typeof window === "undefined") return; if (value) sessionStorage.setItem("intellix_access", value); else sessionStorage.removeItem("intellix_access"); }

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers); const access = token();
  if (access) headers.set("authorization", `Bearer ${access}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  if (response.status === 401 && retry && path !== "/auth/refresh") {
    const refreshed = await api<{ accessToken: string }>("/auth/refresh", { method: "POST" }, false).catch(() => null);
    if (refreshed) { setAccessToken(refreshed.accessToken); return api<T>(path, init, false); }
  }
  const envelope = await response.json() as ApiEnvelope<T>;
  if (!response.ok || envelope.error || envelope.data === null) throw new ApiError(envelope.error?.code ?? "REQUEST_FAILED", envelope.error?.message ?? "Request failed.", response.status);
  return envelope.data;
}

export type DocumentRecord = { id: string; name: string; mimeType: string; sizeBytes: number; status: "UPLOADED"|"EXTRACTING"|"OCR_PROCESSING"|"ANALYZING"|"READY"|"FAILED"; summary?: string; keyPoints?: string[]; keywords?: string[]; actionItems?: ActionItem[]; importantDates?: { label:string; date:string; context?:string }[]; errorCode?: string; errorMessage?: string; createdAt: string; updatedAt: string };
export type ActionItem = { title: string; description?: string; dueDate?: string; priority: "LOW"|"MEDIUM"|"HIGH" };
export type TaskRecord = ActionItem & { id:string; status:"TODO"|"IN_PROGRESS"|"DONE"; sourceDocumentId?:string; createdAt:string };
