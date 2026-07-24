# API

All application endpoints are under `/api/v1` and return `{ data, error, meta: { requestId } }`.

`GET /health` verifies both API and database availability and returns `database: "connected"` when ready.

## Authentication

`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`

## Documents

`POST /documents`, `GET /documents`, `GET /documents/:documentId`, `DELETE /documents/:documentId`, `GET /documents/:documentId/status`, `POST /documents/:documentId/analyze`, `POST /documents/:documentId/questions`, `POST /documents/:documentId/action-items/tasks`

Uploads use multipart field `file`. Task conversion requires `{ confirmed: true, items: [...] }`.

## Tasks and dashboard

`POST /tasks`, `GET /tasks`, `PATCH /tasks/:taskId`, `DELETE /tasks/:taskId`, `GET /dashboard/summary`

Protected routes verify the access JWT and a real Membership before workspace-scoped queries. SSE conversation streaming remains a roadmap item.

Dashboard summary fields are `totalDocuments`, `readyDocuments`, `processingDocuments`, `failedDocuments`, `totalTasks`, `pendingTasks`, `completedTasks`, `recentDocuments`, and `recentTasks`. Question citations include chunk index, optional page number, and a short source excerpt.
