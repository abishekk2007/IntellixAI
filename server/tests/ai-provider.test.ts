import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { analysisSchema, classifyAIError, executeAIRequest, GeminiProvider, parseModelJson } from "../src/modules/ai/provider.js";

describe("Gemini provider safety", () => {
  it("maps 429 to AI_RATE_LIMITED without retrying or exposing the provider response", async () => {
    const providerError = Object.assign(new Error("RESOURCE_EXHAUSTED key=secret-provider-key raw Google payload"), { status: 429, errorDetails: [] });
    const operation = vi.fn().mockRejectedValue(providerError);
    const result = executeAIRequest(operation).catch((error: unknown) => error);
    const error = await result;
    expect(error).toMatchObject({ status: 429, code: "AI_RATE_LIMITED", message: "Gemini usage limit has been reached for this project. Please wait and retry, or check the project quota and billing settings." });
    expect(String(error)).not.toContain("secret-provider-key");
    expect(String(error)).not.toContain("raw Google payload");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does not retry even when Google supplies a short explicit delay", async () => {
    const delayed = Object.assign(new Error("quota"), { status: 429, errorDetails: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "0.01s" }] });
    const operation = vi.fn().mockRejectedValueOnce(delayed).mockResolvedValueOnce("ok");
    await expect(executeAIRequest(operation)).rejects.toMatchObject({ code: "AI_RATE_LIMITED" });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it.each([[401,"AI_PERMISSION_DENIED"],[403,"AI_PERMISSION_DENIED"],[404,"AI_MODEL_NOT_FOUND"]] as const)("maps HTTP %s to %s", (status, code) => {
    expect(classifyAIError(Object.assign(new Error("raw upstream response"), { status })).code).toBe(code);
  });

  it("classifies timeout, malformed JSON, and schema failures separately", async () => {
    await expect(executeAIRequest(() => new Promise(() => undefined), { timeoutMs: 1 })).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    await expect(executeAIRequest(async () => parseModelJson("not-json"))).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    await expect(executeAIRequest(async () => z.object({ value: z.string() }).parse({ value: 1 }))).rejects.toMatchObject({ code: "AI_VALIDATION_FAILED" });
  });

  it("preserves AI_NOT_CONFIGURED without making a provider request", async () => {
    await expect(new GeminiProvider("").analyzeDocument("safe test document")).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  });

  it("preserves successful structured analysis validation", async () => {
    const analysis = analysisSchema.parse({ summary:"Summary", keyPoints:["Point"], keywords:["keyword"], actionItems:[{title:"Review",priority:"HIGH"}], importantDates:[] });
    await expect(executeAIRequest(async () => analysis)).resolves.toEqual(analysis);
  });

  it("parses the first valid JSON object from surrounding text", () => {
    expect(parseModelJson("preface {not json} then {\"value\":\"brace } in a string\"} suffix")).toEqual({ value: "brace } in a string" });
  });
});
