# Frontend

The Next.js 15 app preserves the original warm-neutral/violet visual direction and now provides `/login`, `/register`, `/dashboard`, `/documents`, `/documents/[documentId]`, `/workspace`, and `/tasks`.

TanStack React Query owns server state and polling. Zustand stores only authenticated user/workspace client state. Access tokens remain in session storage; refresh rotation uses an HTTP-only cookie. The typed API client retries once after refresh.

Document pages include loading, empty, processing, failure, success, grounded Q&A, task confirmation, and responsive states. The dashboard top-line counts use the real summary endpoint when authenticated; its older content cards remain clearly prototype content pending the conversation/dashboard integration milestone.
