# Intellix Backend Security Review

## Executive summary

No critical or high-severity vulnerability was confirmed in the reviewed Express, Next.js, React, Prisma, authentication, and upload paths. The backend uses a solid hackathon baseline: server-side tenant authorization, parameterized Prisma queries, bounded and validated input, hashed credentials/tokens, scoped CORS, security headers, rate limits, safe errors, and non-public local upload storage.

## Medium severity

### SEC-001 — In-process controls are not horizontally durable

- **Location:** `server/src/jobs/job.service.ts`; `server/src/app.ts:55-64`
- **Evidence:** jobs use `setImmediate`; rate limiting uses the process-local default store.
- **Impact:** queued processing is lost on restart and limits are not shared between multiple API replicas.
- **Fix:** retain the current adapter for the hackathon; before multi-instance production, use a durable queue and shared rate-limit store.
- **Mitigation:** deploy one persistent API instance and expose it behind a managed reverse proxy.
- **False-positive notes:** acceptable for the explicitly scoped single-instance hackathon deployment.

## Low severity

### SEC-002 — Access JWT is readable by same-origin JavaScript

- **Location:** `lib/api.ts:9-10`
- **Evidence:** the short-lived access JWT is stored in `sessionStorage`; the refresh token remains HTTP-only.
- **Impact:** a successful same-origin XSS could read the access token until expiry.
- **Fix:** keep the short expiry and avoid unsafe HTML; a future hardened design can keep access credentials solely in memory or use a BFF pattern.
- **Mitigation:** React escaping, Helmet, no `dangerouslySetInnerHTML`, and HTTP-only refresh cookies reduce exposure.
- **False-positive notes:** session storage is cleared when the tab closes and is less persistent than local storage.

## Verified controls

- Helmet and scoped credentialed CORS: `server/src/app.ts:45-47`.
- Authentication and upload rate limits: `server/src/app.ts:55`, `server/src/app.ts:63-64`.
- Bcrypt cost 12 and HMAC refresh hashes: `server/src/modules/auth/auth.ts:24`, `server/src/modules/auth/auth.ts:42`.
- Atomic refresh-token consumption: `server/src/modules/auth/auth.ts:73`.
- Membership authorization and tenant-scoped queries: `server/src/app.ts:60`, `server/src/app.ts:72-108`.
- Upload signature checks, filename sanitization, and traversal protection: `server/src/modules/documents/document.service.ts:17`, `server/src/modules/documents/document.service.ts:49`, `server/src/modules/documents/document.service.ts:61-70`.
- Soft-delete filtering: `server/src/app.ts:72-81`, `server/src/app.ts:97`.
- Consistent safe error envelopes: `server/src/shared/http.ts`.
