# Deployment

Deploy Next.js to Vercel and the persistent Express API to Railway or Render. Supabase supplies managed PostgreSQL only in this phase.

## Secrets

Configure `DATABASE_URL`, `DIRECT_URL`, JWT secrets, and `GEMINI_API_KEY` as encrypted platform secrets. Only `NEXT_PUBLIC_API_URL` may reach the browser. Never log either database URL, expose them through Next.js public variables, or commit `.env`.

Use Supavisor transaction mode on port `6543` with `pgbouncer=true&connection_limit=1&sslmode=require` for application traffic and a direct/session connection on port `5432` for controlled migration jobs. The persistent Express process reuses one Prisma Client and disconnects only during graceful shutdown.

Run migrations as a separate release step using `pnpm prisma:migrate:deploy`, which resolves `DIRECT_URL`. Do not run migration commands from the web build or against the transaction pooler.

## Release gates

```bash
pnpm prisma:format
pnpm prisma:generate
pnpm prisma:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm build:api
```

After credentials are configured, verify registration, login, refresh rotation, tenant isolation, persisted documents/tasks, dashboard counts after API restart, and absence of secrets in frontend bundles and logs.

Supabase Auth, Storage, Realtime, Edge Functions, and direct browser table access are out of scope. Local uploads and the in-process job service must still be replaced before horizontally scaled production.

Gemini is optional only for development startup. Without it, extraction is retained and processing safely ends with `AI_NOT_CONFIGURED`; production document intelligence requires a configured key. The in-process job runner is not restart-durable, scanned-PDF OCR is limited to 30 pages, and long analysis input is bounded.
