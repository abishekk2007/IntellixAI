import "dotenv/config";
import { z } from "zod";

const postgresUrl = z.string().min(1).superRefine((value, context) => {
  try {
    const parsed = new URL(value);
    if (!(["postgres:", "postgresql:"] as string[]).includes(parsed.protocol) || !parsed.hostname || !parsed.username) {
      context.addIssue({ code: "custom", message: "must be a valid PostgreSQL connection URL" });
    }
  } catch {
    context.addIssue({ code: "custom", message: "must be a valid PostgreSQL connection URL" });
  }
});

const obviousPlaceholder = /(placeholder|project[_-]?ref|your[_-]?password|replace|example\.com|region\.pooler|\[.*\]|<.*>)/i;
const developmentFrontendOrigins = ["http://localhost:3000", "http://localhost:3001"];

const originList = z.string().transform((value, context) => {
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (!origins.length) {
    context.addIssue({ code: "custom", message: "must contain at least one frontend origin" });
    return z.NEVER;
  }
  const normalized: string[] = [];
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin.replace(/\/$/, "")) throw new Error();
      normalized.push(parsed.origin);
    } catch {
      context.addIssue({ code: "custom", message: "must contain only valid HTTP(S) origins" });
      return z.NEVER;
    }
  }
  return [...new Set(normalized)];
});
const singleOrigin = originList.transform((origins, context) => {
  if (origins.length !== 1) {
    context.addIssue({ code: "custom", message: "must contain exactly one frontend origin" });
    return z.NEVER;
  }
  return origins[0];
});

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl,
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(30),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  FRONTEND_URL: singleOrigin.optional(),
  FRONTEND_URLS: originList.optional(),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000/api/v1"),
  STORAGE_PROVIDER: z.literal("local").default("local"),
  LOCAL_UPLOAD_DIR: z.string().default("uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
});

export type Env = Omit<z.infer<typeof schema>, "FRONTEND_URLS"> & { FRONTEND_URLS: string[] };

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  if (result.data.NODE_ENV === "production") {
    const placeholderFields = (["DATABASE_URL", "DIRECT_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const)
      .filter((field) => obviousPlaceholder.test(result.data[field]));
    if (placeholderFields.length) throw new Error(`Invalid environment configuration: ${placeholderFields.join(", ")}`);
    if (!result.data.FRONTEND_URLS && !result.data.FRONTEND_URL) throw new Error("Invalid environment configuration: FRONTEND_URLS");
  }
  const configuredOrigins = result.data.FRONTEND_URLS ?? (result.data.FRONTEND_URL ? [result.data.FRONTEND_URL] : []);
  const allowedOrigins = result.data.NODE_ENV === "production"
    ? configuredOrigins
    : [...new Set([...developmentFrontendOrigins, ...configuredOrigins])];
  return { ...result.data, FRONTEND_URLS: allowedOrigins };
}

export const env = readEnv();
