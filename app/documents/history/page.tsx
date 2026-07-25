"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, LoaderCircle, Search, Clock, FileWarning, CheckCircle, Trash, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { api, type HistoryResponse, type DocumentHistoryItem } from "@/lib/api";

const safeErrorMap: Record<string, string> = {
  "EVIDENCE_ONLY": "Evidence-only fallback was used",
  "AI_PROVIDERS_UNAVAILABLE": "AI analysis was unavailable",
  "NO_TEXT_FOUND": "Text extraction could not be completed",
  "FILE_TOO_LARGE": "File exceeded maximum size",
  "PROCESSING_FAILED": "Document processing failed",
  "DEFAULT": "Document processing failed"
};

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function safeErrorMessage(code: string | null) {
  if (!code) return safeErrorMap["DEFAULT"];
  return safeErrorMap[code] || safeErrorMap["DEFAULT"];
}

function Timeline({ item }: { item: DocumentHistoryItem }) {
  const steps = [
    { name: "Uploaded", status: "completed", date: new Date(item.createdAt).toLocaleString() },
    { name: "Text extracted", status: ["EXTRACTING", "UPLOADED"].includes(item.status) ? "pending" : "completed" },
    { name: "AI analysis attempted", status: ["EXTRACTING", "UPLOADED", "OCR_PROCESSING"].includes(item.status) ? "pending" : "completed", error: item.errorCode ? safeErrorMessage(item.errorCode) : undefined },
  ];

  if (item.errorCode === "EVIDENCE_ONLY") {
    steps.push({ name: "Fallback used", status: "completed", error: "Evidence-only fallback was used" });
  }

  steps.push({ name: "Tasks extracted", status: item.taskCount > 0 ? "completed" : (item.status === "READY" ? "completed" : "pending") });
  steps.push({ name: "Knowledge Graph included", status: item.graphStatus === "included" ? "completed" : (item.graphStatus === "failed" ? "failed" : "pending"), error: item.graphStatus === "failed" ? "Knowledge Graph generation failed" : undefined });
  
  if (item.status === "FAILED") {
    steps.push({ name: "Ready", status: "failed", error: "Processing failed. Retry is available." });
  } else {
    steps.push({ name: "Ready", status: item.status === "READY" ? "completed" : "pending" });
  }

  return (
    <div className="timeline-panel">
      <h4 className="timeline-title">Processing Timeline</h4>
      <div className="timeline-track">
        {steps.map((step, i) => (
          <div key={i} className={`timeline-event event-${step.status}`}>
            <strong>{step.name}</strong>
            {step.date && <small>{step.date}</small>}
            {step.error && <span className="error-note">{step.error}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [analysisMode, setAnalysisMode] = useState("ALL");
  const [sort, setSort] = useState("NEWEST");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  queryParams.set("page", page.toString());
  queryParams.set("limit", "20");
  if (search) queryParams.set("search", search);
  if (status !== "ALL") queryParams.set("status", status);
  if (type !== "ALL") queryParams.set("fileType", type.toLowerCase());
  if (analysisMode !== "ALL") queryParams.set("analysisMode", analysisMode.toLowerCase());
  if (sort === "OLDEST") queryParams.set("sort", "oldest");
  else if (sort === "NAME") queryParams.set("sort", "filename");
  else if (sort === "STATUS") queryParams.set("sort", "status");

  const query = useQuery({
    queryKey: ["document-history", queryParams.toString()],
    queryFn: () => api<HistoryResponse>(`/documents/history?${queryParams.toString()}`),
    refetchInterval: (state) => state.state.data?.items.some(doc => !["READY", "FAILED"].includes(doc.status)) ? 3000 : false
  });

  const retry = useMutation({
    mutationFn: async (id: string) => api<{ id: string }>(`/documents/${id}/analyze`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["document-history"] })
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => api<{ deleted: boolean }>(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["document-history"] })
  });

  function handleFilterChange(setter: (val: string) => void, val: string) {
    setter(val);
    setPage(1);
  }

  const data = query.data;
  const items = data?.items || [];
  const summary = data?.summary || { total: 0, ready: 0, processing: 0, failed: 0 };

  return (
    <AppShell title="Document Upload History">
      <PageHeader
        eyebrow="WORKSPACE AUDIT"
        title="Document Upload History"
        description="Review every document uploaded to this workspace and track its processing status."
      />
      
      <div className="dashboard-stats" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="stat-card">
          <span><FileText /></span>
          <p>Total uploads</p>
          <strong>{summary.total}</strong>
        </div>
        <div className="stat-card">
          <span><CheckCircle /></span>
          <p>Ready documents</p>
          <strong>{summary.ready}</strong>
        </div>
        <div className="stat-card">
          <span><LoaderCircle /></span>
          <p>Processing</p>
          <strong>{summary.processing}</strong>
        </div>
        <div className="stat-card">
          <span><FileWarning /></span>
          <p>Failed</p>
          <strong>{summary.failed}</strong>
        </div>
      </div>

      <div className="toolbar">
        <label>
          <Search />
          <span className="sr-only">Search filename</span>
          <input value={search} onChange={e => handleFilterChange(setSearch, e.target.value)} placeholder="Search filename..." />
        </label>
        <select aria-label="Filter by status" value={status} onChange={e => handleFilterChange(setStatus, e.target.value)}>
          <option value="ALL">All statuses</option>
          {["UPLOADED", "EXTRACTING", "OCR_PROCESSING", "ANALYZING", "READY", "FAILED"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select>
        <select aria-label="Filter by file type" value={type} onChange={e => handleFilterChange(setType, e.target.value)}>
          <option value="ALL">All file types</option>
          <option value="PDF">PDF</option>
          <option value="TXT">Text</option>
          <option value="IMAGE">Image</option>
        </select>
        <select aria-label="Filter by analysis mode" value={analysisMode} onChange={e => handleFilterChange(setAnalysisMode, e.target.value)}>
          <option value="ALL">All analysis modes</option>
          <option value="SYNTHESIS">Synthesis</option>
          <option value="EVIDENCE-ONLY">Evidence-only</option>
          <option value="NOT-ANALYSED">Not analysed</option>
        </select>
        <select aria-label="Sort history" value={sort} onChange={e => handleFilterChange(setSort, e.target.value)}>
          <option value="NEWEST">Newest first</option>
          <option value="OLDEST">Oldest first</option>
          <option value="NAME">Filename</option>
          <option value="STATUS">Status</option>
        </select>
      </div>

      {query.isLoading ? (
        <LoadingState label="Loading history..." />
      ) : query.isError ? (
        <ErrorState description="Upload history could not be loaded. Please check your connection." />
      ) : !items.length ? (
        <EmptyState
          icon={search || status !== "ALL" || type !== "ALL" || analysisMode !== "ALL" ? <Search /> : <Clock />}
          title={search || status !== "ALL" || type !== "ALL" || analysisMode !== "ALL" ? "No history matches filters" : "No documents have been uploaded to this workspace yet."}
          description={search || status !== "ALL" || type !== "ALL" || analysisMode !== "ALL" ? "Try clearing some filters." : "Upload documents in the Documents tab to see history here."}
        />
      ) : (
        <Card className="history-table history-card-override">
          
          <div className="history-desktop-view data-list" style={{ padding: "var(--space-6)" }}>
            <div className="history-row data-row header">
              <span>Document</span>
              <span>Uploaded at</span>
              <span>Uploaded by</span>
              <span>File type</span>
              <span>Size</span>
              <span>Status</span>
              <span>Analysis mode</span>
              <span>Tasks</span>
              <span>Graph status</span>
              <span style={{ textAlign: "right" }}>Actions</span>
            </div>
            {items.map(item => (
              <div key={item.id} style={{ display: "grid", borderBottom: "1px solid var(--app-border)" }}>
                <div className="history-row data-row" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                  <span className="file-meta">
                    <b title={item.name}>{item.name}</b>
                    <small>ID: {item.id.slice(0, 8)}</small>
                  </span>
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                  <span>{item.uploadedBy?.name || item.uploadedBy?.email || "Unknown"}</span>
                  <span style={{ textTransform: "uppercase" }}>{item.mimeType.includes("pdf") ? "PDF" : item.mimeType.startsWith("image/") ? "IMAGE" : "TXT"}</span>
                  <span>{formatBytes(item.sizeBytes)}</span>
                  <span><StatusBadge status={item.status} /></span>
                  <span style={{ textTransform: "capitalize" }}>{item.analysisMode.replace("-", " ")}</span>
                  <span>{item.taskCount}</span>
                  <span style={{ textTransform: "capitalize" }}>{item.graphStatus.replace("-", " ")}</span>
                  <span style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                    <Link href={`/documents/${item.id}`} className="button button-secondary" style={{ padding: "0 8px", minHeight: "32px", fontSize: "12px" }}>View</Link>
                    {item.status === "FAILED" && (
                      <button type="button" className="button button-secondary" style={{ padding: "0 8px", minHeight: "32px", fontSize: "12px" }} onClick={() => retry.mutate(item.id)} disabled={retry.isPending}>
                        <RefreshCw style={{ width: 14, height: 14 }} /> Retry
                      </button>
                    )}
                    <button type="button" className="button button-danger" style={{ padding: "0 8px", minHeight: "32px", fontSize: "12px" }} onClick={() => { if(confirm("Are you sure you want to delete this document?")) deleteDoc.mutate(item.id); }}>
                      <Trash style={{ width: 14, height: 14 }} />
                    </button>
                    <button type="button" className="icon-button" style={{ width: 32, height: 32, border: 0 }}>
                      {expanded === item.id ? <ChevronUp /> : <ChevronDown />}
                    </button>
                  </span>
                </div>
                {expanded === item.id && <Timeline item={item} />}
              </div>
            ))}
          </div>

          <div className="history-mobile-view" style={{ padding: "var(--space-4)" }}>
            <div className="history-mobile-list">
              {items.map(item => (
                <div key={item.id} className="history-mobile-card">
                  <div className="history-mobile-card-header" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                    <div style={{ minWidth: 0, paddingRight: 8 }}>
                      <h3 title={item.name}>{item.name}</h3>
                      <div className="history-mobile-card-meta" style={{ marginTop: 4 }}>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                        <span>&bull;</span>
                        <span>{item.uploadedBy?.name || item.uploadedBy?.email || "Unknown"}</span>
                      </div>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="history-mobile-card-meta">
                    <span style={{ textTransform: "uppercase" }}>{item.mimeType.includes("pdf") ? "PDF" : item.mimeType.startsWith("image/") ? "IMAGE" : "TXT"}</span>
                    <span>&bull;</span>
                    <span>{formatBytes(item.sizeBytes)}</span>
                    <span>&bull;</span>
                    <span style={{ textTransform: "capitalize" }}>Mode: {item.analysisMode.replace("-", " ")}</span>
                    <span>&bull;</span>
                    <span>Tasks: {item.taskCount}</span>
                  </div>
                  <div className="history-mobile-card-actions">
                    <Link href={`/documents/${item.id}`} className="button button-secondary" style={{ fontSize: "13px", padding: 0 }}>View</Link>
                    {item.status === "FAILED" && (
                      <button type="button" className="button button-secondary" style={{ fontSize: "13px", padding: 0 }} onClick={() => retry.mutate(item.id)} disabled={retry.isPending}>
                        <RefreshCw style={{ width: 14 }} /> Retry
                      </button>
                    )}
                    <button type="button" className="button button-danger" style={{ fontSize: "13px", padding: 0 }} onClick={() => { if(confirm("Are you sure you want to delete this document?")) deleteDoc.mutate(item.id); }}>
                      <Trash style={{ width: 14 }} /> Delete
                    </button>
                  </div>
                  <button type="button" className="button button-secondary" style={{ marginTop: "4px", minHeight: "36px", fontSize: "13px" }} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                    {expanded === item.id ? "Hide timeline" : "Show processing timeline"}
                  </button>
                  {expanded === item.id && <Timeline item={item} />}
                </div>
              ))}
            </div>
          </div>

        </Card>
      )}

      {data && data.totalPages > 1 && (
        <div className="pagination-controls">
          <span>Showing page {page} of {data.totalPages} ({summary.total} total)</span>
          <div>
            <button className="button button-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="button button-secondary" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
