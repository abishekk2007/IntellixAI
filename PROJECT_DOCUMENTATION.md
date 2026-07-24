# Project Documentation

## Objective

Intellix AI combines document intelligence with action. The MVP vertical slice is registration → workspace → upload → extraction/OCR → Gemini analysis → grounded document Q&A → user-confirmed task creation → dashboard aggregation.

## Current milestone

The stabilized backend is connected to Supabase PostgreSQL and the initial Prisma 6.19 migration is applied. Live checks verified registration, current user, refresh rotation, logout revocation, upload persistence, safe no-Gemini failure, task persistence, dashboard aggregation, tenant isolation, and persistence across an API restart. Gemini analysis/Q&A awaits a configured API key.

## Product decisions

- Every protected resource is workspace scoped through Membership records.
- Gemini is behind an `AIProvider` interface; raw model output is validated before persistence.
- OCR is behind an `OCRProvider` interface and runs only for images or PDFs with insufficient extracted text.
- Document questions use simple keyword-ranked chunks and cite chunk/page metadata where available; this is deliberately not described as vector RAG.
- Extracted actions never become tasks until the user selects and confirms them.
- Local storage and in-process jobs are explicit MVP adapters, not simulated cloud infrastructure.
- Runtime queries use Supavisor transaction mode through `DATABASE_URL`; Prisma administrative commands use `DIRECT_URL`.
- Existing JWT/refresh authentication and Workspace/Membership authorization remain active. Supabase Auth and Storage are intentionally excluded.

## Next milestone

Configure `GEMINI_API_KEY`, run the complete READY-state document analysis/Q&A/action conversion demo, and deploy preview environments. Object storage, a durable queue, multi-pass long-document synthesis, Supabase Auth, and other roadmap capabilities remain separate future phases.
