# Changelog

## 0.2.1 - 2026-07-24

- Verified the applied Supabase migration and corrected Prisma transaction-pooler parameters.
- Added database-aware health checks, production JWT placeholder rejection, and atomic refresh rotation.
- Stabilized missing-Gemini failures, OCR state transitions, fenced JSON parsing, Q&A citation excerpts, upload error handling, filename/path validation, and upload rate limits.
- Added complete tenant-scoped dashboard statistics, recent records, duplicate-resistant action conversion, expanded tests, and a live Supabase workflow verification.

## 0.2.0 - 2026-07-23

- Added the Express `/api/v1` backend and PostgreSQL/Prisma multi-tenant schema.
- Added registration, login, logout, current-user, access JWTs, and rotating hashed refresh sessions.
- Added validated document upload, PDF/TXT extraction, conditional Tesseract OCR, Gemini structured analysis, chunk retrieval, grounded Q&A, and safe processing states.
- Added user-confirmed action-item task creation and live dashboard summary counts.
- Added login/register, documents, document detail, workspace, and tasks pages with React Query and Zustand.
- Added security middleware, request envelopes/IDs, audit events, tests, linting, environment documentation, and deployment guidance.

## 0.1.0 - 2026-07-23

- Added the Intellix AI marketing site and responsive product preview.
- Added the workspace dashboard with productivity, documents, tasks, scheduling, and AI insights.
- Added an interactive AI workspace conversation prototype.
- Added the initial design system and product architecture documentation.
