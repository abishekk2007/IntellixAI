# Database

Supabase provides managed PostgreSQL; Prisma 6.19 remains the ORM, generated client, schema, and migration system. The datasource provider remains `postgresql`, and Prisma manages Intellix tables in the normal `public` schema.

## Connection strategy

- `DATABASE_URL`: Express/Prisma Client runtime traffic through Supavisor transaction mode, normally port `6543`, with `pgbouncer=true&connection_limit=1&sslmode=require`.
- `DIRECT_URL`: Prisma migrations, introspection, Studio, and administrative commands through the direct endpoint or Supavisor session mode, normally port `5432`, with `sslmode=require`.

Supavisor session mode is preferred for local migration commands when the direct `db.PROJECT_REF.supabase.co` IPv6 endpoint is unreachable. Obtain both strings from **Supabase Dashboard → Connect**. Do not use Supabase API keys as database credentials.

Prisma 6 reads both URLs from `prisma/schema.prisma` using `url` and `directUrl`. At runtime the shared `PrismaClient` uses `DATABASE_URL`; Prisma CLI commands that need a direct connection use `DIRECT_URL`.

## Schema and tenancy

Core models remain User, Workspace, Membership, RefreshSession, Document, DocumentChunk, Task, Conversation, Message, Notification, UsageEvent, and AuditLog. UUID defaults, enums, JSON fields, foreign keys, cascades, soft deletion, token hashes, and tenant indexes are PostgreSQL/Supabase compatible.

The Express API verifies Membership and applies `workspaceId` to protected queries. Supabase Auth tables are not created and the Supabase `auth` schema is not modified. RLS is not enabled blindly; future RLS design must account for Prisma connecting as a trusted backend rather than as each Supabase end user.

## Safe migration workflow

```bash
pnpm prisma:format
pnpm prisma:generate
pnpm prisma:validate
```

After confirming `DIRECT_URL` targets the intended development project, inspect existing tables and review the prepared initial SQL. For a new empty project:

```bash
pnpm prisma:migrate:deploy
```

For an already-reviewed migration in a deployment environment:

```bash
pnpm prisma:migrate:deploy
```

Never run `prisma migrate reset` or `prisma db push --force-reset` against Supabase. No remote migration is considered applied until a real connection succeeds and the expected tables/indexes are verified.

The initial `20260724000000_init_intellix_mvp` migration is applied in the configured Supabase development database. A live `prisma migrate status` check reported the schema up to date on July 24, 2026.
