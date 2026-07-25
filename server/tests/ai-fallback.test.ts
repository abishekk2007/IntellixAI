import { describe, expect, it, vi } from "vitest";
import { AIProviderRouter, DeterministicProvider, OpenRouterProvider, deterministicAnalysis, type AIProvider, type DocumentAnalysis } from "../src/modules/ai/provider.js";
import { AppError } from "../src/shared/http.js";

const analysis: DocumentAnalysis = {
  summary: "Safe summary", keyPoints: ["Point"], keywords: ["keyword"], actionItems: [], importantDates: [], entities: [], relationships: [],
};
const analysisJson = JSON.stringify(analysis);

function provider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    analyzeDocument: vi.fn().mockResolvedValue(analysis),
    answerDocumentQuestion: vi.fn().mockResolvedValue({ answer: "Answer", citations: [{ chunkIndex: 0, excerpt: "Evidence" }] }),
    ...overrides,
  };
}

function completion(content: unknown, options: { finishReason?: string | null; completionTokens?: number; reasoning?: unknown; reasoningDetails?: unknown; model?: string } = {}) {
  return new Response(JSON.stringify({
    model: options.model ?? "selected/free-model",
    choices: [{
      finish_reason: options.finishReason === undefined ? "stop" : options.finishReason,
      message: { content, ...(options.reasoning !== undefined ? { reasoning: options.reasoning } : {}), ...(options.reasoningDetails !== undefined ? { reasoning_details: options.reasoningDetails } : {}) },
    }],
    usage: { completion_tokens: options.completionTokens ?? 100 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function requestBodies(fetcher: ReturnType<typeof vi.fn>) {
  return fetcher.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>);
}

describe("AI provider fallback", () => {
  it("does not call OpenRouter when Gemini succeeds", async () => {
    const primary = provider({ lastMetadata: { provider: "gemini", model: "gemini-test", fallbackUsed: false } });
    const secondary = provider();
    const router = new AIProviderRouter(primary, secondary);
    await expect(router.analyzeDocument("document")).resolves.toEqual(analysis);
    expect(secondary.analyzeDocument).not.toHaveBeenCalled();
    expect(router.lastMetadata).toEqual({ provider: "gemini", model: "gemini-test", fallbackUsed: false });
  });

  it.each(["AI_RATE_LIMITED", "AI_TIMEOUT", "AI_PROVIDER_UNAVAILABLE", "AI_MODEL_NOT_FOUND", "AI_PERMISSION_DENIED", "AI_INVALID_RESPONSE", "AI_VALIDATION_FAILED"])("falls back once for %s", async (code) => {
    const primary = provider({ analyzeDocument: vi.fn().mockRejectedValue(new AppError(502, code, "safe")) });
    const secondary = provider({ lastMetadata: { provider: "openrouter", model: "openrouter/free", fallbackUsed: false } });
    const router = new AIProviderRouter(primary, secondary);
    await expect(router.analyzeDocument("document")).resolves.toEqual(analysis);
    expect(primary.analyzeDocument).toHaveBeenCalledTimes(1);
    expect(secondary.analyzeDocument).toHaveBeenCalledTimes(1);
    expect(router.lastMetadata).toEqual({ provider: "openrouter", model: "openrouter/free", fallbackUsed: true });
  });

  it.each([
    [new TypeError("bug"), undefined],
    [new AppError(400, "VALIDATION_ERROR", "Invalid input."), "VALIDATION_ERROR"],
    [new AppError(499, "AI_REQUEST_CANCELLED", "Cancelled."), "AI_REQUEST_CANCELLED"],
  ])("does not fall back for non-provider failure %#", async (failure, code) => {
    const secondary = provider();
    const router = new AIProviderRouter(provider({ analyzeDocument: vi.fn().mockRejectedValue(failure) }), secondary);
    const error = await router.analyzeDocument("document").catch((caught: unknown) => caught);
    if (code) expect(error).toMatchObject({ code }); else expect(error).toBe(failure);
    expect(secondary.analyzeDocument).not.toHaveBeenCalled();
  });

  it("returns evidence-only analysis after both external providers fail", async () => {
    const primary = provider({ analyzeDocument: vi.fn().mockRejectedValue(new AppError(429, "AI_RATE_LIMITED", "secret primary payload")) });
    const secondary = provider({ analyzeDocument: vi.fn().mockRejectedValue(new AppError(502, "AI_PROVIDER_UNAVAILABLE", "secret secondary payload")) });
    const router = new AIProviderRouter(
      primary,
      secondary,
    );
    await expect(router.analyzeDocument("Aakash must verify the fallback tomorrow.")).resolves.toMatchObject({
      summary: expect.stringContaining("Evidence-only mode"),
      actionItems: [expect.objectContaining({ title: expect.stringContaining("Aakash") })],
      importantDates: [expect.objectContaining({ date: "tomorrow" })],
    });
    expect(primary.analyzeDocument).toHaveBeenCalledTimes(1);
    expect(secondary.analyzeDocument).toHaveBeenCalledTimes(1);
    expect(router.lastMetadata).toMatchObject({ provider: "deterministic", fallbackUsed: true, mode: "evidence-only", safeErrorCode: "AI_PROVIDER_UNAVAILABLE" });
  });

  it("does not retry an empty OpenRouter response and uses evidence-only analysis", async () => {
    const secondary = provider({ analyzeDocument: vi.fn().mockRejectedValue(new AppError(502, "AI_EMPTY_RESPONSE", "The backup AI returned an empty response.")) });
    const router = new AIProviderRouter(
      provider({ analyzeDocument: vi.fn().mockRejectedValue(new AppError(429, "AI_RATE_LIMITED", "safe")) }),
      secondary,
    );
    await expect(router.analyzeDocument("Local evidence remains available.")).resolves.toMatchObject({ summary: expect.stringContaining("Evidence-only mode") });
    expect(secondary.analyzeDocument).toHaveBeenCalledTimes(1);
  });

  it("provides bounded evidence-only Q&A without inventing synthesis", async () => {
    const local = new DeterministicProvider();
    await expect(local.answerDocumentQuestion("Who owns this?", [{ chunkIndex: 0, content: "Aakash owns provider verification." }])).resolves.toEqual({
      answer: "Evidence-only mode: generative synthesis is unavailable. The relevant source excerpts are provided below.",
      citations: [{ chunkIndex: 0, excerpt: "Aakash owns provider verification." }],
      providerMetadata: { provider: "deterministic", fallbackUsed: true, mode: "evidence-only" },
    });
  });

  it("creates deterministic schema-valid analysis from source evidence", () => {
    expect(deterministicAnalysis("Intellix uses Supabase. Abishek must prepare the dashboard. The demo is due tomorrow.")).toMatchObject({
      summary: expect.stringContaining("Evidence-only mode"),
      keywords: expect.arrayContaining(["intellix", "supabase"]),
      actionItems: expect.arrayContaining([expect.objectContaining({ priority: "MEDIUM" })]),
      importantDates: [expect.objectContaining({ date: "tomorrow" })],
    });
  });

  it("accepts normal string content and preserves grounded citations", async () => {
    const fetcher = vi.fn().mockResolvedValue(completion('{"answer":"Grounded","citations":[{"chunkIndex":0}]}'));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher, referer: "http://localhost:3000" });
    await expect(openRouter.answerDocumentQuestion("Question?", [{ chunkIndex: 0, content: "Source evidence" }])).resolves.toMatchObject({
      answer: "Grounded", citations: [{ chunkIndex: 0, excerpt: "Source evidence" }], providerMetadata: { provider: "openrouter", model: "selected/free-model" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("accepts message content as an array of text parts", async () => {
    const fetcher = vi.fn().mockResolvedValue(completion([{ type: "text", text: '{"answer":"Array answer","citations":[{"chunkIndex":0}]}' }]));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.answerDocumentQuestion("Question?", [{ chunkIndex: 0, content: "Evidence" }])).resolves.toMatchObject({ answer: "Array answer" });
  });

  it.each([[null, 10, "null"], ["", 10, "empty"], [null, 0, "zero-token"]] as const)("maps a 200 %s final response to AI_EMPTY_RESPONSE", async (content, completionTokens, _label) => {
    const fetcher = vi.fn().mockResolvedValue(completion(content, { completionTokens, finishReason: completionTokens ? "stop" : null }));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.analyzeDocument("document")).rejects.toMatchObject({ code: "AI_EMPTY_RESPONSE", message: "The backup AI returned an empty response. Your document and extracted evidence have been preserved." });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not use reasoning as final content", async () => {
    const fetcher = vi.fn().mockResolvedValue(completion(null, { finishReason: "length", completionTokens: 160, reasoning: "hidden", reasoningDetails: [{ type: "reasoning.text" }] }));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.analyzeDocument("document")).rejects.toMatchObject({ code: "AI_EMPTY_RESPONSE" });
  });

  it("rejects object content instead of treating it as final text", async () => {
    const fetcher = vi.fn().mockResolvedValue(completion({ text: analysisJson }));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.analyzeDocument("document")).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });

  it("maps a response-level embedded provider error even when HTTP is 200", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 429, message: "raw secret", metadata: { error_type: "rate_limit_exceeded" } } }), { status: 200 }));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    const error = await openRouter.analyzeDocument("document").catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "AI_RATE_LIMITED" });
    expect(String(error)).not.toContain("raw secret");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not misclassify truncated non-empty output as provider outage", async () => {
    const fetcher = vi.fn().mockResolvedValue(completion("{", { finishReason: "length", completionTokens: 30 }));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.analyzeDocument("document")).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });

  it("sends strict JSON Schema and validates a structured response", async () => {
    const fetcher = vi.fn().mockResolvedValue(completion(analysisJson));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.analyzeDocument("document")).resolves.toEqual(analysis);
    const body = requestBodies(fetcher)[0] as { response_format: { type: string }; provider: { require_parameters: boolean }; reasoning: { effort: string; exclude: boolean }; max_tokens: number };
    expect(body.response_format.type).toBe("json_schema");
    expect(body.provider.require_parameters).toBe(true);
    expect(body.reasoning).toEqual({ effort: "none", exclude: true });
    expect(body.max_tokens).toBe(6_000);
    expect(openRouter.lastMetadata).toMatchObject({ finishReason: "stop", finalContentPresent: true });
  });

  it("sends minimal excluded reasoning for grounded Q&A and validates visible final JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(completion('{"answer":"Visible answer","citations":[{"chunkIndex":0}]}', { reasoning: "hidden reasoning" }));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.answerDocumentQuestion("Question?", [{ chunkIndex: 0, content: "Evidence" }])).resolves.toMatchObject({ answer: "Visible answer" });
    const body = requestBodies(fetcher)[0] as { reasoning: { effort: string; exclude: boolean }; max_tokens: number };
    expect(body.reasoning).toEqual({ effort: "minimal", exclude: true });
    expect(body.max_tokens).toBe(2_000);
  });

  it("maps an explicitly unsupported reasoning configuration safely without retrying", async () => {
    const response = new Response(JSON.stringify({ error: { code: 400, message: "reasoning effort none is unsupported", metadata: { error_type: "invalid_request" } } }), { status: 400 });
    const fetcher = vi.fn().mockResolvedValue(response);
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.analyzeDocument("document")).rejects.toMatchObject({ code: "AI_INVALID_REQUEST" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([[analysisJson, "direct"], [`\`\`\`json\n${analysisJson}\n\`\`\``, "fenced"]])("uses one compatibility request for explicitly unsupported structured output: %s", async (content) => {
    const unsupported = new Response(JSON.stringify({ error: { code: 400, message: "response_format json_schema is unsupported", metadata: { error_type: "invalid_request" } } }), { status: 400 });
    const fetcher = vi.fn().mockResolvedValueOnce(unsupported).mockResolvedValueOnce(completion(content));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.analyzeDocument("document")).resolves.toEqual(analysis);
    const bodies = requestBodies(fetcher) as Array<{ response_format: { type: string }; provider?: unknown; reasoning: { effort: string; exclude: boolean } }>;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(bodies[0].response_format.type).toBe("json_schema");
    expect(bodies[1].response_format.type).toBe("json_object");
    expect(bodies[1].provider).toBeUndefined();
    expect(bodies[1].reasoning).toEqual({ effort: "minimal", exclude: true });
  });

  it("rejects Zod-invalid compatibility JSON and never makes a third call", async () => {
    const unsupported = new Response(JSON.stringify({ error: { code: 503, message: "No available providers meet the required parameters", metadata: { error_type: "no_available_providers" } } }), { status: 503 });
    const fetcher = vi.fn().mockResolvedValueOnce(unsupported).mockResolvedValueOnce(completion('{"summary":"missing fields"}'));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.analyzeDocument("private document text")).rejects.toMatchObject({ code: "AI_VALIDATION_FAILED" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never logs provider keys, document text, reasoning, or raw responses", async () => {
    const logs = [vi.spyOn(console, "log").mockImplementation(() => undefined), vi.spyOn(console, "error").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined)];
    const fetcher = vi.fn().mockResolvedValue(completion(null, { reasoning: "hidden reasoning" }));
    const openRouter = new OpenRouterProvider({ apiKey: "secret-provider-key", fetcher });
    await openRouter.analyzeDocument("private document text").catch(() => undefined);
    expect(logs.flatMap((spy) => spy.mock.calls).flat().join(" ")).toBe("");
    logs.forEach((spy) => spy.mockRestore());
  });

  it.each([[400, "AI_INVALID_REQUEST"], [401, "AI_PERMISSION_DENIED"], [402, "AI_PAYMENT_REQUIRED"], [403, "AI_PERMISSION_DENIED"], [404, "AI_MODEL_NOT_FOUND"], [408, "AI_TIMEOUT"], [429, "AI_RATE_LIMITED"], [500, "AI_PROVIDER_UNAVAILABLE"], [502, "AI_PROVIDER_UNAVAILABLE"], [503, "AI_PROVIDER_UNAVAILABLE"], [504, "AI_TIMEOUT"]] as const)("maps OpenRouter HTTP %s to %s without retrying", async (status, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: status } }), { status }));
    const openRouter = new OpenRouterProvider({ apiKey: "test-key", fetcher });
    await expect(openRouter.analyzeDocument("document")).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
