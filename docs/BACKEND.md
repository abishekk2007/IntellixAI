# Backend

The API is Express 5 with TypeScript strict mode. `server/src/app.ts` composes secure middleware and versioned routes; domain code is under `server/src/modules`.

Authentication uses bcrypt (cost 12), short-lived access JWTs, opaque refresh tokens stored only as HMAC-SHA256 hashes, atomic rotation/revocation, HTTP-only SameSite cookies, rate limits, and membership checks. Production startup rejects placeholder database and JWT secrets. Sensitive headers/body fields are redacted from structured logs.

Document processing validates MIME, extension, signature, size, empty content, supported formats, display filenames, and storage paths. It extracts TXT/PDF text, conditionally renders scanned PDF pages for Tesseract OCR, sends bounded text to Gemini, parses fenced JSON safely, validates it with Zod, stores chunks, and records safe status/error data. Missing Gemini configuration persists `AI_NOT_CONFIGURED` and can be retried.

The current job runner uses `setImmediate` through `JobService`. Replace it with a durable queue before multi-instance production deployment.
