import { describe, expect, it } from "vitest";
import { readEnv } from "../src/config/env.js";

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://postgres.project:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require",
  DIRECT_URL: "postgresql://postgres.project:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require",
  JWT_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters",
  JWT_REFRESH_SECRET: "refresh-secret-that-is-at-least-32-characters",
  FRONTEND_URL: "https://intellix.example",
};

describe("database environment validation", () => {
  it("accepts separate pooled runtime and administrative PostgreSQL URLs", () => {
    const parsed = readEnv(base);
    expect(new URL(parsed.DATABASE_URL).port).toBe("6543");
    expect(new URL(parsed.DIRECT_URL).port).toBe("5432");
  });

  it("rejects non-PostgreSQL database URLs without including credentials", () => {
    expect(() => readEnv({ ...base, DATABASE_URL: "https://user:very-secret@example.org/db" })).toThrow("DATABASE_URL");
  });

  it("rejects obvious production placeholders", () => {
    expect(() => readEnv({ ...base, DIRECT_URL: "postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@REGION.pooler.supabase.com:5432/postgres" })).toThrow("DIRECT_URL");
  });

  it("rejects placeholder production JWT secrets", () => {
    expect(() => readEnv({ ...base, JWT_ACCESS_SECRET: "replace-with-at-least-32-random-characters" })).toThrow("JWT_ACCESS_SECRET");
  });
});
