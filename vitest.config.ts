import { defineConfig } from "vitest/config";
export default defineConfig({ test:{ environment:"node", setupFiles:["./server/tests/setup.ts"], include:["server/tests/**/*.test.ts"], clearMocks:true } });
