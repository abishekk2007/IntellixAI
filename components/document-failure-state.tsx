"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ErrorState } from "@/components/ui";

const quotaMessage = "This project has reached its current Gemini API quota. Wait briefly and retry, or review the project's Gemini rate-limit and billing settings.";

export function DocumentFailureState({ errorCode, errorMessage, retrying, retryError, onRetry }: { errorCode?: string; errorMessage?: string; retrying: boolean; retryError?: string; onRetry: () => void }) {
  const copy = errorCode === "AI_RATE_LIMITED"
    ? { title: "Gemini usage limit reached", message: quotaMessage }
    : errorCode === "AI_NOT_CONFIGURED"
      ? { title: "Gemini is not configured", message: "Gemini is not configured for this environment. Add the project API key and retry analysis." }
      : { title: "Processing failed", message: errorMessage ?? "The document could not be processed. Retry when the required service is available." };
  return <section className="analysis-stack">
    <ErrorState title={copy.title} description={copy.message}/>
    <div className="page-actions">
      <button type="button" className="button button-primary" onClick={onRetry} disabled={retrying}><RefreshCw className={retrying ? "spin" : undefined}/>{retrying ? "Retrying…" : "Retry analysis"}</button>
      <Link className="button button-secondary" href="/documents"><ArrowLeft/>Return to documents</Link>
    </div>
    {retryError && <p className="form-error" role="alert">{retryError}</p>}
  </section>;
}
