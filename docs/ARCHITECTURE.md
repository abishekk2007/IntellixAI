# Architecture

```text
Next.js frontend
        ↓ HTTPS / JSON
Express API + existing JWT/refresh authentication
        ↓ shared Prisma Client (DATABASE_URL)
Prisma ORM
        ↓ Supavisor transaction pooler / TLS
Supabase PostgreSQL

Prisma CLI ── DIRECT_URL ──→ direct or Supavisor session connection
```

Supabase is the managed PostgreSQL host, not an application SDK dependency. Prisma retains schema ownership and migrations. Existing Workspace/Membership tenant authorization remains unchanged, and all database access stays inside the trusted Express backend.

The shared Prisma Client is cached across development reloads, reused for the Express process lifetime, and disconnected only during graceful shutdown. `DATABASE_URL` handles application queries; `DIRECT_URL` isolates migration, introspection, Studio, and administrative operations from transaction pooling.

Supabase Auth, Storage, Realtime, Edge Functions, browser table access, and RLS policies are not part of this phase. Local file storage remains the MVP adapter.
