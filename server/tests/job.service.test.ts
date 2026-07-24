import { describe, expect, it, vi } from "vitest";
import { InProcessJobService } from "../src/jobs/job.service.js";

describe("in-process job safety", () => {
  it("rejects concurrent jobs with the same document key and releases the key afterward", async () => {
    const service = new InProcessJobService();
    let finish: (() => void) | undefined;
    const running = new Promise<void>((resolve) => { finish = resolve; });
    await service.enqueue("document:one", () => running);
    await expect(service.enqueue("document:one", vi.fn())).rejects.toMatchObject({ status:409, code:"ANALYSIS_IN_PROGRESS" });
    finish?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(service.enqueue("document:one", async () => undefined)).resolves.toBeUndefined();
  });
});
