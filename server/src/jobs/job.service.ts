export interface JobService { enqueue(name: string, job: () => Promise<void>): Promise<void>; }

export class InProcessJobService implements JobService {
  async enqueue(_name: string, job: () => Promise<void>) {
    setImmediate(() => { void job().catch(() => undefined); });
  }
}

export const jobs = new InProcessJobService();
