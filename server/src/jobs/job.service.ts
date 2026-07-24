import { AppError } from "../shared/http.js";

export interface JobService { enqueue(name: string, job: () => Promise<void>): Promise<void>; }

export class InProcessJobService implements JobService {
  private readonly active = new Set<string>();

  async enqueue(name: string, job: () => Promise<void>) {
    if (this.active.has(name)) throw new AppError(409, "ANALYSIS_IN_PROGRESS", "This document is already being processed.");
    this.active.add(name);
    setImmediate(() => {
      void job().catch(() => undefined).finally(() => this.active.delete(name));
    });
  }
}

export const jobs = new InProcessJobService();
