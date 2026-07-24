# Intellix AI

> **Where Intelligence Meets Action.**

Intellix AI is a secure, multi-tenant document-intelligence workspace. It transforms uploaded files into structured insights, grounded answers, user-confirmed tasks, and live workspace statistics.

## Round 1 evaluation status

The core hackathon MVP is implemented and builds successfully. Authentication, Supabase persistence, document upload and extraction, tenant isolation, tasks, and dashboard aggregation have been verified with real API requests.

Gemini integration is implemented behind a provider abstraction, but a live Gemini analysis and Q&A demonstration still requires a valid `GEMINI_API_KEY`. Without a key, the application deliberately stores `FAILED / AI_NOT_CONFIGURED` instead of crashing or leaving a document stuck.

| Area | Status | Evaluation note |
|---|---|---|
| Responsive Next.js interface | Complete | Landing, authentication, dashboard, documents, tasks, and workspace pages |
| Registration and login | Complete and verified | Creates User, Workspace, and OWNER Membership |
| JWT and refresh rotation | Complete and verified | Short-lived access JWT and opaque, hashed, rotating refresh session |
| Supabase PostgreSQL | Complete and verified | Prisma migration applied; persisted data survives API restart |
| Tenant authorization | Complete and verified | Membership checks and workspace-scoped queries |
| Document upload | Complete and verified | PDF, TXT, PNG, JPG, and JPEG with size, MIME, signature, and filename validation |
| Text extraction | Complete | TXT and PDF extraction |
| Conditional OCR | Implemented | Tesseract for images and scanned PDFs; live OCR demo still recommended |
| Gemini analysis | Implemented; key required | Structured summary, points, keywords, actions, and dates validated with Zod |
| Document Q&A | Implemented; key required | Keyword-ranked chunks with citation index, optional page, and excerpt |
| Confirmed task creation | Complete | Tasks are created only when `confirmed` strictly equals `true` |
| Dashboard aggregation | Complete and verified | Real tenant-scoped document and task statistics |
| Automated quality suite | Passing | 19 tests, type checks, lint, API build, and web build |
| Production deployment | Under development | Local storage and in-process jobs remain hackathon adapters |

## Problem and objective

Important information is often buried in reports, notes, scans, and images. Intellix provides one workflow to:

1. securely upload a document;
2. extract or OCR its text;
3. generate structured, source-based intelligence;
4. ask questions using relevant document chunks;
5. approve selected action items before task creation; and
6. track persisted results from a workspace dashboard.

The product keeps human confirmation and workspace ownership at the center of the workflow.

## Main workflow

```text
Register or log in
        ↓
Upload PDF, TXT, PNG, JPG, or JPEG
        ↓
Validate → safely store → extract text → OCR when required
        ↓
Gemini structured analysis with Zod validation
        ↓
Summary + key points + keywords + actions + important dates
        ↓
Keyword-ranked document Q&A with source citations
        ↓
User selects and confirms action items
        ↓
Persist tasks and update dashboard statistics
```

## Features completed

### Frontend

- Responsive Next.js workspace and landing experience
- Register and login integration
- Zustand authentication state
- Central API client with `credentials: "include"`
- One-time access-token refresh and retry protection
- Document upload, list, detail, status polling, analysis display, and retry handling
- Polling stops when a document reaches `READY` or `FAILED`
- Document question form and citation display
- Explicit action-item selection and confirmation
- Persisted task list and status updates
- Live dashboard summary integration
- Loading, empty, processing, and safe error states

### Backend and security

- Express 5 API under `/api/v1`
- Consistent `{ data, error, meta }` response envelopes
- Database-aware health endpoint
- Request IDs, Helmet, scoped credentialed CORS, and Pino redaction
- Authentication and upload rate limits
- Zod request and environment validation
- Bcrypt password hashing with cost 12
- Short-lived JWT access tokens
- Opaque refresh tokens stored only as HMAC-SHA256 hashes
- Atomic refresh rotation and logout revocation
- HTTP-only refresh cookie with production-aware security settings
- Membership verification on protected routes
- Workspace scoping on documents, tasks, dashboard data, chunks, and audit records
- Soft-delete filtering for documents
- Safe centralized errors without stack traces, credentials, provider errors, or file paths

### Document intelligence

- Multipart upload field: `file`
- Maximum upload size controlled by `MAX_UPLOAD_BYTES`
- Extension, MIME, magic-byte/signature, empty-file, and size validation
- Sanitized display names and server-generated storage keys
- Path-traversal protection
- TXT decoding and PDF extraction
- Conditional Tesseract OCR for images and low-text scanned PDFs
- Processing states: `UPLOADED`, `EXTRACTING`, `OCR_PROCESSING`, `ANALYZING`, `READY`, `FAILED`
- Gemini behind `AIProvider`
- OCR behind `OCRProvider`
- Prompt-injection protection that treats uploaded text as untrusted data
- Bounded AI input, timeout handling, transient retry policy, fenced-JSON parsing, and Zod validation
- Persisted document chunks and keyword-overlap retrieval
- Safe missing-Gemini state: `FAILED / AI_NOT_CONFIGURED`

### Tasks and dashboard

- Task create, list, update, and delete endpoints
- Action items never become tasks without explicit confirmation
- Transactional action-item conversion
- Source-document relationship retained on generated tasks
- Practical duplicate-submission protection
- Tenant-scoped totals for ready, processing, and failed documents
- Tenant-scoped totals for pending and completed tasks
- Recent persisted documents and tasks

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Client data | TanStack React Query, Zustand |
| Backend | Express 5, TypeScript |
| Database | Supabase managed PostgreSQL |
| ORM and migrations | Prisma 6.19 |
| Authentication | JWT, opaque refresh tokens, bcrypt |
| AI | Google Gemini via `@google/generative-ai` |
| OCR | Tesseract.js |
| PDF extraction | `pdf-parse` |
| Validation | Zod and `file-type` |
| Security and logging | Helmet, CORS, rate limiting, Pino |
| Testing | Vitest and Supertest |
| Package manager | pnpm |

## Architecture

```text
Next.js + React Query + Zustand
              ↓ HTTPS / JSON / multipart
Express API + JWT + Membership authorization
              ↓ shared Prisma Client
Supavisor transaction pooler (DATABASE_URL)
              ↓
Supabase PostgreSQL

Prisma migration commands
              ↓ direct/session connection (DIRECT_URL)
Supabase PostgreSQL
```

Supabase is used only as managed PostgreSQL. The application does not use Supabase Auth, Storage, Realtime, browser database access, or automatically generated RLS policies. Prisma remains the only ORM and migration system.

## Project structure

```text
app/                    Next.js routes and screens
components/             Reusable UI components
lib/                    API client and authentication state
server/src/             Express application and domain services
server/tests/           API and service tests
prisma/schema.prisma    Database schema
prisma/migrations/      Version-controlled migration SQL
docs/                   Detailed technical documentation
```

## Environment setup

Copy the safe template and replace placeholders locally:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Required configuration:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime Supavisor transaction connection |
| `DIRECT_URL` | Direct/session connection for Prisma administration |
| `JWT_ACCESS_SECRET` | Access-token signing secret, minimum 32 characters |
| `JWT_REFRESH_SECRET` | Refresh-token HMAC secret, minimum 32 characters |
| `GEMINI_API_KEY` | Optional for startup; required for AI analysis and Q&A |
| `GEMINI_MODEL` | Configurable Gemini model name |
| `FRONTEND_URL` | Allowed browser origin |
| `NEXT_PUBLIC_API_URL` | Public Express API base URL |
| `LOCAL_UPLOAD_DIR` | Local hackathon upload directory |
| `MAX_UPLOAD_BYTES` | Maximum accepted upload size |
| `PORT` | API port, defaults to `4000` |

Never commit `.env`. Only `NEXT_PUBLIC_API_URL` is exposed to browser code.

## Local installation and database setup

Prerequisites: Node.js, pnpm, and a Supabase development project.

```bash
pnpm install
pnpm prisma:format
pnpm prisma:generate
pnpm prisma:validate
pnpm prisma:migrate:deploy
```

Runtime `DATABASE_URL` should use Supavisor transaction mode on port `6543` with:

```text
pgbouncer=true&connection_limit=1&sslmode=require
```

`DIRECT_URL` should use the direct or Supavisor session connection on port `5432` with `sslmode=require`. Never run destructive reset commands against the shared Supabase project.

## Start the application

Use two terminals:

```bash
# Terminal 1 — frontend
pnpm dev

# Terminal 2 — backend
pnpm dev:api
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Health: `http://localhost:4000/api/v1/health`

Expected health response:

```json
{
  "data": {
    "status": "ok",
    "database": "connected"
  },
  "error": null,
  "meta": {
    "requestId": "generated-request-id"
  }
}
```

## API overview

### Authentication

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Documents

- `POST /api/v1/documents`
- `GET /api/v1/documents`
- `GET /api/v1/documents/:documentId`
- `DELETE /api/v1/documents/:documentId`
- `GET /api/v1/documents/:documentId/status`
- `POST /api/v1/documents/:documentId/analyze`
- `POST /api/v1/documents/:documentId/questions`
- `POST /api/v1/documents/:documentId/action-items/tasks`

### Tasks and dashboard

- `POST /api/v1/tasks`
- `GET /api/v1/tasks`
- `PATCH /api/v1/tasks/:taskId`
- `DELETE /api/v1/tasks/:taskId`
- `GET /api/v1/dashboard/summary`

See [API documentation](docs/API.md) for behavior and response conventions.

## Testing and verified results

```bash
pnpm install
pnpm prisma:format
pnpm prisma:generate
pnpm prisma:validate
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm build:api
pnpm build
```

Latest Round 1 verification:

- Prisma formatting, generation, and schema validation: passed
- Frontend and backend type checks: passed
- ESLint: passed
- Automated tests: **19/19 passed**
- Express production build: passed
- Next.js production build: passed
- Supabase migration status: schema up to date
- Live registration, current user, refresh, logout, upload, task, dashboard, tenant-isolation, and restart-persistence checks: passed
- Non-failing warning: Next.js ESLint plugin is not yet configured

## Round 1 demo procedure

1. Configure `.env`, including a valid Gemini key for the complete AI demonstration.
2. Start the frontend and backend.
3. Open the health endpoint and confirm `database: "connected"`.
4. Register a new user and enter the workspace.
5. Upload a short TXT or PDF document.
6. Watch the processing state progress to `READY`.
7. Review the summary, key points, keywords, important dates, and action items.
8. Ask a question whose answer appears clearly in the document.
9. Show the returned chunk citation and excerpt.
10. Select one or more action items and explicitly confirm task creation.
11. Open Tasks and update a task status.
12. Open the dashboard and show the persisted totals.
13. Restart the API and confirm the data remains available.

If Gemini is not configured, demonstrate the safe `AI_NOT_CONFIGURED` failure and retry behavior, but do not claim the live AI workflow is complete.

## Under development

### Round 1 follow-up

- Add and verify the real Gemini key in the evaluation environment
- Run a live OCR demonstration with an image and scanned PDF
- Configure the Next.js ESLint plugin to remove the current build warning
- Finalize teammate names, Git repository metadata, remote, and clean commit groups
- Add the selected project license

### Production roadmap

- Replace local uploads with durable object storage
- Replace in-process jobs with a durable queue and worker
- Add shared rate-limit storage for multiple API replicas
- Add multi-pass synthesis for very large documents
- Improve chunk/page metadata during PDF extraction and OCR
- Add broader integration tests against an isolated test database
- Add CI for install, Prisma validation, tests, lint, and builds
- Deploy preview and production environments with managed secrets
- Evaluate defense-in-depth database RLS without weakening backend Membership checks

## Known hackathon limitations

- Local file storage is suitable for the current single-instance demo, not horizontal scaling.
- In-process document jobs are not durable across restarts.
- OCR for scanned PDFs is limited to the first 30 rendered pages.
- Long Gemini input is bounded to protect latency and cost.
- Retrieval uses keyword overlap, not vector search; this project does not describe it as vector RAG.
- Access JWTs are stored in session storage; refresh tokens remain HTTP-only cookies.
- Supabase Auth, Supabase Storage, billing, OAuth, Redis, BullMQ, calendar, email, voice, and admin features are intentionally outside the Round 1 MVP.

## Documentation

- [Project documentation](PROJECT_DOCUMENTATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Backend](docs/BACKEND.md)
- [Frontend](docs/FRONTEND.md)
- [Database](docs/DATABASE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Security review](security_best_practices_report.md)
- [Changelog](CHANGELOG.md)

## Contributors

- Teammate 1 Name — Frontend and UI
- Teammate 2 Name — Backend, authentication and database
- Teammate 3 Name — AI, OCR, document processing and tasks

Replace these placeholders with the final team names before submission.

## License status

No open-source license has been selected yet. Add a `LICENSE` file before distributing Intellix AI under an open-source license.
