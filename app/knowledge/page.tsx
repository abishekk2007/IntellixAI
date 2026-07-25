"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  HelpCircle,
  Link2,
  LoaderCircle,
  Network,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";

/* ─── Types ─────────────────────────────────────────────────────── */

const ENTITY_TYPES = [
  "ALL",
  "PERSON",
  "ORGANIZATION",
  "PROJECT",
  "TASK",
  "DATE",
  "TECHNOLOGY",
  "TOPIC",
  "LOCATION",
  "DOCUMENT",
] as const;

type EntityType = Exclude<(typeof ENTITY_TYPES)[number], "ALL">;

type GraphNode = {
  id: string;
  name: string;
  normalized: string;
  type: EntityType;
  documentCount: number;
};
type GraphEdge = {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: string;
  confidence: number;
  documentId?: string;
};
type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: {
    entities: number;
    relationships: number;
    connectedDocuments: number;
    linkedTasks: number;
  };
  topConnectedEntities: {
    id: string;
    name: string;
    type: EntityType;
    connections: number;
  }[];
};

type SearchResult = {
  id: string;
  name: string;
  type: EntityType;
  documents: { id: string; name: string; status: string }[];
  excerpts: { documentId: string; excerpt: string }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
  }[];
};

type IncomingRelation = {
  id: string;
  type: string;
  sourceEntity: { id: string; name: string; type: EntityType };
  documentId?: string;
  excerpt?: string;
};
type OutgoingRelation = {
  id: string;
  type: string;
  targetEntity: { id: string; name: string; type: EntityType };
  documentId?: string;
  excerpt?: string;
};
type Detail = {
  entity: { id: string; name: string; type: EntityType };
  incomingRelations: IncomingRelation[];
  outgoingRelations: OutgoingRelation[];
  sourceDocuments: { id: string; name: string; status: string }[];
  sourceExcerpts: {
    documentId: string;
    excerpt: string;
    pageNumber?: number;
    chunkIndex?: number;
  }[];
  connectedTasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate?: string;
  }[];
  connectedDates: { id: string; name: string; type: EntityType }[];
};

type Citation = {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  pageNumber?: number;
  excerpt: string;
};

type Answer = {
  mode: string;
  synthesisAvailable: boolean;
  status?: string;
  answer: string;
  matchedEntities: { id: string; name: string; type: EntityType }[];
  citations: Citation[];
  evidence: Citation[];
};

/* ─── Grouped relation types ────────────────────────────────────── */

type GroupedRelation = {
  groupKey: string;
  type: string;
  direction: "in" | "out";
  peer: { id: string; name: string; type: EntityType };
  relationIds: string[];
  documentIds: string[];
  excerpts: string[];
};

type GroupedTableEdge = {
  groupKey: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: string;
  confidence: number;
  relationIds: string[];
  documentIds: string[];
};

/* ─── Helpers ────────────────────────────────────────────────────── */

const RELATION_LABELS: Record<string, string> = {
  DOCUMENT_MENTIONS_ENTITY: "Mentions",
  MENTIONED_IN: "Mentioned in",
  ASSIGNED_TO: "Assigned to",
  DUE_ON: "Due on",
  DUE_DATE_FOR: "Due date for",
  HAS_TASK: "Has task",
  RELATED_TO: "Related to",
  USES: "Uses",
  REFERENCES: "References",
  RESPONSIBLE_FOR: "Responsible for",
  USED_BY: "Used by",
  ENABLES: "Enables",
};

function humanRelationType(type: string): string {
  return RELATION_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanLabel(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function entityIcon(type: EntityType) {
  if (type === "DOCUMENT") return <FileText aria-hidden="true" />;
  if (type === "DATE") return <CalendarDays aria-hidden="true" />;
  if (type === "PERSON") return <Users aria-hidden="true" />;
  if (type === "TECHNOLOGY") return <Sparkles aria-hidden="true" />;
  return <Network aria-hidden="true" />;
}

/**
 * Group outgoing + incoming relations into logical edges.
 * Key = direction|type|peerId
 * Multiple DB records for the same logical edge accumulate documentIds and excerpts.
 */
function groupRelations(
  outgoing: OutgoingRelation[],
  incoming: IncomingRelation[]
): GroupedRelation[] {
  const map = new Map<string, GroupedRelation>();

  for (const rel of outgoing) {
    const logicalKey = `out|${rel.type}|${rel.targetEntity.id}`;
    const existing = map.get(logicalKey);
    if (existing) {
      existing.relationIds.push(rel.id);
      if (rel.documentId && !existing.documentIds.includes(rel.documentId)) {
        existing.documentIds.push(rel.documentId);
      }
      if (rel.excerpt && !existing.excerpts.includes(rel.excerpt)) {
        existing.excerpts.push(rel.excerpt);
      }
    } else {
      map.set(logicalKey, {
        groupKey: `out-${rel.id}`,
        type: rel.type,
        direction: "out",
        peer: rel.targetEntity,
        relationIds: [rel.id],
        documentIds: rel.documentId ? [rel.documentId] : [],
        excerpts: rel.excerpt ? [rel.excerpt] : [],
      });
    }
  }

  for (const rel of incoming) {
    const logicalKey = `in|${rel.type}|${rel.sourceEntity.id}`;
    const existing = map.get(logicalKey);
    if (existing) {
      existing.relationIds.push(rel.id);
      if (rel.documentId && !existing.documentIds.includes(rel.documentId)) {
        existing.documentIds.push(rel.documentId);
      }
      if (rel.excerpt && !existing.excerpts.includes(rel.excerpt)) {
        existing.excerpts.push(rel.excerpt);
      }
    } else {
      map.set(logicalKey, {
        groupKey: `in-${rel.id}`,
        type: rel.type,
        direction: "in",
        peer: rel.sourceEntity,
        relationIds: [rel.id],
        documentIds: rel.documentId ? [rel.documentId] : [],
        excerpts: rel.excerpt ? [rel.excerpt] : [],
      });
    }
  }

  return [...map.values()];
}

/**
 * Group full graph edges for the relationship table.
 * Key = sourceEntityId|type|targetEntityId
 */
function groupTableEdges(edges: GraphEdge[]): GroupedTableEdge[] {
  const map = new Map<string, GroupedTableEdge>();
  for (const edge of edges) {
    const key = `${edge.sourceEntityId}|${edge.type}|${edge.targetEntityId}`;
    const existing = map.get(key);
    if (existing) {
      existing.relationIds.push(edge.id);
      if (edge.documentId && !existing.documentIds.includes(edge.documentId)) {
        existing.documentIds.push(edge.documentId);
      }
    } else {
      map.set(key, {
        groupKey: edge.id,
        sourceEntityId: edge.sourceEntityId,
        targetEntityId: edge.targetEntityId,
        type: edge.type,
        confidence: edge.confidence,
        relationIds: [edge.id],
        documentIds: edge.documentId ? [edge.documentId] : [],
      });
    }
  }
  return [...map.values()];
}

const PAGE_SIZE = 12;

/* ─── Page ───────────────────────────────────────────────────────── */

export default function KnowledgePage() {
  const client = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<(typeof ENTITY_TYPES)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [page, setPage] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);

  // Rebuild status state
  const [rebuildStatus, setRebuildStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
    timestamp?: string;
    counts?: {
      entities: number;
      relationships: number;
      connectedDocuments: number;
      linkedTasks: number;
    };
  }>({ type: null, message: "" });

  const detailRef = useRef<HTMLDivElement>(null);
  const isInitial = useRef(true);

  const graph = useQuery({
    queryKey: ["knowledge-graph", typeFilter],
    queryFn: () =>
      api<Graph>(`/knowledge-graph${typeFilter === "ALL" ? "" : `?type=${typeFilter}`}`),
    retry: false,
  });

  const results = useQuery({
    queryKey: ["knowledge-search", search, typeFilter],
    queryFn: () =>
      api<SearchResult[]>(
        `/knowledge-graph/search?q=${encodeURIComponent(search.trim())}${typeFilter === "ALL" ? "" : `&type=${typeFilter}`}`
      ),
    enabled: search.trim().length > 0,
    retry: false,
  });

  const detail = useQuery({
    queryKey: ["knowledge-entity", selected],
    queryFn: () => api<Detail>(`/knowledge-graph/entities/${selected}`),
    enabled: Boolean(selected),
    retry: false,
  });

  const rebuild = useMutation({
    mutationFn: () =>
      api<{ rebuiltDocuments: number }>("/knowledge-graph/rebuild", { method: "POST" }),
    onMutate: () => {
      setRebuildStatus({ type: null, message: "" });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["knowledge-graph"] });
      await client.invalidateQueries({ queryKey: ["knowledge-search"] });
      const refetched = await graph.refetch();
      
      const counts = refetched.data?.counts;
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      setRebuildStatus({
        type: "success",
        message: "Workspace graph updated.",
        timestamp,
        counts,
      });

      if (refetched.data?.nodes[0]) {
        setSelected(refetched.data.nodes[0].id);
      }
    },
    onError: (error) => {
      let errMsg = "Graph rebuild failed. Existing graph data is still available.";
      if (error instanceof ApiError && error.code === "REBUILD_IN_PROGRESS") {
        errMsg = "Graph rebuild is already in progress.";
      } else if (error instanceof ApiError && error.message) {
        errMsg = error.message;
      }
      setRebuildStatus({
        type: "error",
        message: errMsg,
      });
    },
  });

  const ask = useMutation({
    mutationFn: () =>
      api<Answer>("/knowledge-graph/questions", {
        method: "POST",
        body: JSON.stringify({ question }),
      }),
  });

  // Handle auto-focus and scrolling of selected detail panel
  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    if (selected && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      detailRef.current.focus();
    }
  }, [selected]);

  // All visible nodes (search overrides graph nodes)
  const allVisible: (GraphNode | SearchResult)[] = search.trim()
    ? results.data ?? []
    : graph.data?.nodes ?? [];

  const totalVisible = allVisible.length;
  const visibleSlice = allVisible.slice(0, page * PAGE_SIZE);
  const hasMore = totalVisible > page * PAGE_SIZE;

  // Node-name lookup for edge rendering
  const names = useMemo(
    () => new Map(graph.data?.nodes?.map((n) => [n.id, n.name]) ?? []),
    [graph.data]
  );

  // Auto-select first node on load
  useEffect(() => {
    if (!selected && graph.data?.nodes?.[0]?.id) setSelected(graph.data.nodes[0].id);
  }, [graph.data, selected]);

  // Reset pagination on filter/search change
  useEffect(() => {
    setPage(1);
    setSelected(null);
  }, [typeFilter, search]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (question.trim().length >= 2) ask.mutate();
  }

  function clearFilters() {
    setSearch("");
    setTypeFilter("ALL");
    setPage(1);
  }

  const isFiltered = search.trim().length > 0 || typeFilter !== "ALL";

  const handleSelectEntity = (targetId: string, sourceId: string) => {
    const allNodes = graph.data?.nodes ?? [];
    const targetExists = allNodes.some((n) => n.id === targetId);
    const selectedId = targetExists ? targetId : sourceId;
    setSelected(selectedId);
  };

  return (
    <AppShell title="Knowledge Graph">
      {/* ── Header ─────────────────────────────────────── */}
      <PageHeader
        eyebrow="WORKSPACE INTELLIGENCE"
        title="Workspace Knowledge Graph"
        description="Discover connections across documents, people, tasks and dates."
        actions={
          <div className="page-actions">
            <button
              className="button button-secondary"
              type="button"
              aria-expanded={helpOpen}
              aria-controls="kg-help-panel"
              onClick={() => setHelpOpen((v) => !v)}
            >
              <HelpCircle aria-hidden="true" />
              How it works
            </button>
            <div className="kg-build-btn-container">
              <button
                className="button button-primary"
                type="button"
                onClick={() => rebuild.mutate()}
                disabled={rebuild.isPending}
                aria-busy={rebuild.isPending}
                title="Rebuilds connections using the latest workspace documents, tasks, dates and extracted entities."
              >
                {rebuild.isPending ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                {rebuild.isPending ? "Building graph…" : "Build workspace graph"}
              </button>
              <p className="kg-build-helper-text">
                Rebuilds connections using the latest workspace documents, tasks, dates and extracted entities.
              </p>
            </div>
          </div>
        }
      />

      {/* ── Rebuild feedback banner ────────────────────── */}
      {rebuildStatus.type === "success" && (
        <div className="kg-rebuild-banner success" role="status">
          <div className="kg-banner-header">
            <Sparkles className="kg-banner-icon" aria-hidden="true" />
            <div>
              <strong>Workspace graph updated.</strong>
              <span className="kg-banner-time">Last updated: {rebuildStatus.timestamp}</span>
            </div>
          </div>
          {rebuildStatus.counts && (
            <div className="kg-banner-stats">
              <span><strong>{rebuildStatus.counts.entities}</strong> entities</span>
              <span><strong>{rebuildStatus.counts.relationships}</strong> relationships</span>
              <span><strong>{rebuildStatus.counts.connectedDocuments}</strong> connected documents</span>
              <span><strong>{rebuildStatus.counts.linkedTasks}</strong> linked tasks</span>
            </div>
          )}
        </div>
      )}
      {rebuildStatus.type === "error" && (
        <div className="kg-rebuild-banner error" role="alert">
          <strong>{rebuildStatus.message}</strong>
        </div>
      )}

      {/* ── How it works ───────────────────────────────── */}
      {helpOpen && (
        <div id="kg-help-panel" role="region" aria-label="How the knowledge graph works">
          <Card className="kg-help">
            <div className="kg-help-header">
              <span className="eyebrow-label">HOW IT WORKS</span>
              <button
                type="button"
                className="icon-button kg-help-close"
                aria-label="Close help"
                onClick={() => setHelpOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <ol className="kg-help-steps">
              <li><strong>1.</strong> Intellix extracts entities (people, technologies, dates…) from every document.</li>
              <li><strong>2.</strong> Shared entities are connected across documents into a workspace-wide graph.</li>
              <li><strong>3.</strong> Tasks and dates become linked graph nodes with evidence trails.</li>
              <li><strong>4.</strong> Selecting an entity shows all its relationships, source documents and evidence.</li>
              <li><strong>5.</strong> The Q&amp;A section retrieves evidence from connected documents — no vector search required.</li>
            </ol>
          </Card>
        </div>
      )}

      {graph.isLoading ? (
        <LoadingState label="Loading workspace graph" />
      ) : graph.isError || !graph.data ? (
        <ErrorState
          title="Knowledge graph unavailable"
          description="Apply the graph migration and verify that the API is running."
        />
      ) : (
        <>
          {/* ── Metrics ──────────────────────────────────── */}
          <section className="knowledge-stats" aria-label="Graph metrics">
            <StatCard icon={<Network />} label="Total entities" value={graph.data?.counts?.entities || 0} />
            <StatCard icon={<Link2 />} label="Relationships" value={graph.data?.counts?.relationships || 0} />
            <StatCard icon={<FileText />} label="Connected documents" value={graph.data?.counts?.connectedDocuments || 0} />
            <StatCard icon={<Users />} label="Linked tasks" value={graph.data?.counts?.linkedTasks || 0} />
          </section>

          {/* ── Search / Filter ───────────────────────────── */}
          <Card className="knowledge-toolbar" aria-label="Search and filter entities">
            <label className="kg-search-label" htmlFor="kg-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Search entities</span>
              <input
                id="kg-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search entities — e.g. Gemini, Aakash…"
                maxLength={100}
                autoComplete="off"
              />
            </label>
            <label className="sr-only" htmlFor="kg-type-filter">
              Filter by entity type
            </label>
            <select
              id="kg-type-filter"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as (typeof ENTITY_TYPES)[number]);
              }}
              aria-label="Filter by entity type"
            >
              <option value="ALL">All entity types</option>
              {ENTITY_TYPES.slice(1).map((t) => (
                <option key={t} value={t}>
                  {humanLabel(t)}
                </option>
              ))}
            </select>
            {isFiltered && (
              <button
                type="button"
                className="button button-secondary kg-clear-btn"
                onClick={clearFilters}
                aria-label="Clear all filters"
              >
                <X aria-hidden="true" />
                Clear
              </button>
            )}
          </Card>

          {/* ── Main explorer ─────────────────────────────── */}
          <div className="knowledge-layout" aria-label="Entity explorer">
            {/* Left: entity list */}
            <Card className="knowledge-network">
              <div className="card-header">
                <div>
                  <p className="eyebrow-label">
                    {search.trim() ? "SEARCH RESULTS" : "ENTITY EXPLORER"}
                  </p>
                  <h2>
                    {search.trim()
                      ? `${totalVisible} matching ${totalVisible === 1 ? "entity" : "entities"}`
                      : "Connected entities"}
                  </h2>
                </div>
                <span className="badge">Deterministic</span>
              </div>

              {results.isFetching ? (
                <LoadingState label="Searching graph" />
              ) : totalVisible === 0 ? (
                <EmptyState
                  icon={<Network />}
                  title="No graph entities yet"
                  description="No graph data yet. Build the workspace graph after uploading documents."
                />
              ) : (
                <>
                  <div className="entity-grid" role="list" aria-label="Entity list">
                    {visibleSlice.map((item) => (
                      <EntityCard
                        key={item.id}
                        item={item}
                        isSelected={selected === item.id}
                        onSelect={setSelected}
                      />
                    ))}
                  </div>

                  {hasMore && (
                    <div className="kg-pagination">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setPage((p) => p + 1)}
                        aria-label={`Show more entities (${totalVisible - page * PAGE_SIZE} remaining)`}
                      >
                        <ChevronDown aria-hidden="true" />
                        Show more
                        <span className="kg-count-badge">
                          +{totalVisible - page * PAGE_SIZE}
                        </span>
                      </button>
                    </div>
                  )}

                  {!search.trim() && graph.data.edges.length > 0 && (
                    <RecentRelationships edges={graph.data.edges} names={names} onSelect={setSelected} />
                  )}
                </>
              )}
            </Card>

            {/* Right: entity detail */}
            <div
              className="entity-detail-container"
              ref={detailRef}
              tabIndex={-1}
              style={{ outline: "none" }}
            >
              <Card className="entity-detail">
                {!selected ? (
                  <EmptyState
                    icon={<Sparkles />}
                    title="Select an entity"
                    description="Choose a connected entity to inspect its documents, tasks, dates and evidence."
                  />
                ) : detail.isLoading ? (
                  <LoadingState label="Loading entity relationships" />
                ) : detail.isError || !detail.data ? (
                  <ErrorState
                    title="Entity unavailable"
                    description="This entity is not available in your workspace."
                  />
                ) : (
                  <EntityDetailPanel
                    detail={detail.data}
                    onSelect={setSelected}
                    currentFilter={typeFilter}
                  />
                )}
              </Card>
            </div>
          </div>

          {/* ── Relationship table ────────────────────────── */}
          {(graph.data?.edges?.length || 0) > 0 && (
            <RelationshipTable
              edges={graph.data?.edges || []}
              names={names}
              onSelect={handleSelectEntity}
            />
          )}

          {/* ── Q&A ──────────────────────────────────────── */}
          <Card className="graph-question" aria-label="Ask across connected documents">
            <div>
              <span className="ai-icon" aria-hidden="true">
                <Sparkles />
              </span>
              <div>
                <p className="eyebrow-label">GRAPH-GUIDED CROSS-DOCUMENT RETRIEVAL</p>
                <h2>Ask across connected documents</h2>
                <p>
                  Matches entities, expands one relationship hop and ranks bounded source chunks.
                  This is not vector RAG.
                </p>
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What connects Gemini, Aakash and the Intellix project?"
                maxLength={500}
                aria-label="Question for the knowledge graph"
              />
              <button
                className="button button-primary"
                type="submit"
                disabled={question.trim().length < 2 || ask.isPending}
                aria-busy={ask.isPending}
              >
                {ask.isPending ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : (
                  <Sparkles aria-hidden="true" />
                )}
                Ask workspace
              </button>
            </form>

            {ask.isError && (
              <div className="form-error" role="alert">
                {ask.error instanceof ApiError
                  ? ask.error.message
                  : "The question could not be answered."}
              </div>
            )}

            {ask.data && <AnswerPanel answer={ask.data} />}
          </Card>
        </>
      )}
    </AppShell>
  );
}

/* ─── EntityCard ─────────────────────────────────────────────────── */

function EntityCard({
  item,
  isSelected,
  onSelect,
}: {
  item: GraphNode | SearchResult;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const docCount =
    "documentCount" in item ? item.documentCount : item.documents.length;

  return (
    <button
      type="button"
      role="listitem"
      className={`entity-card${isSelected ? " active" : ""}`}
      onClick={() => onSelect(item.id)}
      aria-pressed={isSelected}
      aria-label={`${item.name} — ${humanLabel(item.type)}, ${docCount} document${docCount === 1 ? "" : "s"}`}
    >
      <span
        className={`entity-icon entity-${item.type.toLowerCase()}`}
        aria-hidden="true"
      >
        {entityIcon(item.type)}
      </span>
      <span className="entity-card-text">
        <strong title={item.name}>{item.name}</strong>
        <small>
          <span className="entity-type-label">{humanLabel(item.type)}</span>
          {" · "}
          {docCount} doc{docCount === 1 ? "" : "s"}
        </small>
      </span>
      <ChevronRight aria-hidden="true" className="entity-card-arrow" />
    </button>
  );
}

/* ─── RecentRelationships ────────────────────────────────────────── */

function RecentRelationships({
  edges,
  names,
  onSelect,
}: {
  edges: GraphEdge[];
  names: Map<string, string>;
  onSelect: (id: string) => void;
}) {
  // Show up to 12 recent edges
  const shown = edges.slice(0, 12);
  return (
    <div className="relation-list" aria-label="Recent relationships">
      <h3>Recent relationships</h3>
      {shown.map((edge) => (
        <button
          type="button"
          key={edge.id}
          className="relation-row"
          onClick={() => onSelect(edge.sourceEntityId)}
          aria-label={`${names.get(edge.sourceEntityId) ?? "Entity"} ${humanRelationType(edge.type)} ${names.get(edge.targetEntityId) ?? "Entity"}`}
        >
          <strong className="rel-source">{names.get(edge.sourceEntityId) ?? "Entity"}</strong>
          <span className="rel-type">
            <ArrowRight aria-hidden="true" />
            {humanRelationType(edge.type)}
          </span>
          <strong className="rel-target">{names.get(edge.targetEntityId) ?? "Entity"}</strong>
        </button>
      ))}
    </div>
  );
}

/* ─── RelationshipTable ──────────────────────────────────────────── */

function RelationshipTable({
  edges,
  names,
  onSelect,
}: {
  edges: GraphEdge[];
  names: Map<string, string>;
  onSelect: (targetId: string, sourceId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  // Group table edges to satisfy section 10 and 11
  const grouped = useMemo(() => groupTableEdges(edges), [edges]);
  const shown = showAll ? grouped : grouped.slice(0, 10);

  return (
    <Card className="kg-rel-card" aria-label="Relationship table">
      <div className="card-header">
        <div>
          <p className="eyebrow-label">ALL RELATIONSHIPS</p>
          <h2>Relationship overview</h2>
        </div>
        <span className="badge">{grouped.length} unique connections</span>
      </div>
      <div className="kg-rel-table-wrap" role="region" aria-label="Relationships table" tabIndex={0}>
        <table className="kg-rel-table">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Relationship</th>
              <th scope="col">Target</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((edge) => {
              const sourceName = names.get(edge.sourceEntityId) ?? "—";
              const targetName = names.get(edge.targetEntityId) ?? "—";
              const relationType = humanRelationType(edge.type);

              return (
                <tr key={edge.groupKey}>
                  <td data-label="Source">
                    <button
                      type="button"
                      className="rel-table-link"
                      onClick={() => onSelect(edge.sourceEntityId, edge.sourceEntityId)}
                      title={sourceName}
                    >
                      {sourceName}
                    </button>
                  </td>
                  <td data-label="Relationship">
                    <div className="rel-badge-group">
                      <span className="rel-type-badge" title={edge.type}>
                        {relationType}
                      </span>
                      {edge.documentIds.length > 1 && (
                        <span className="kg-group-badge" title={`${edge.documentIds.length} sources`}>
                          {edge.documentIds.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td data-label="Target">
                    <button
                      type="button"
                      className="rel-table-link"
                      onClick={() => onSelect(edge.targetEntityId, edge.sourceEntityId)}
                      title={targetName}
                    >
                      {targetName}
                    </button>
                  </td>
                  <td data-label="Action">
                    <button
                      type="button"
                      className="kg-view-detail-btn"
                      aria-label="View target entity details"
                      onClick={() => onSelect(edge.targetEntityId, edge.sourceEntityId)}
                    >
                      View details
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {grouped.length > 10 && (
        <div className="kg-pagination">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
          >
            {showAll ? "Show less" : `Show all ${grouped.length} connections`}
          </button>
        </div>
      )}
    </Card>
  );
}

/* ─── EntityDetailPanel ──────────────────────────────────────────── */

function EntityDetailPanel({
  detail,
  onSelect,
  currentFilter,
}: {
  detail: Detail;
  onSelect: (id: string) => void;
  currentFilter: string;
}) {
  // Group relations to eliminate duplicate logical edges
  const grouped = useMemo(
    () =>
      groupRelations(
        detail.outgoingRelations || [],
        detail.incomingRelations || []
      ),
    [detail.outgoingRelations, detail.incomingRelations]
  );

  const isOutsideFilter =
    currentFilter !== "ALL" && detail?.entity?.type !== currentFilter;

  if (!detail?.entity) return null;

  return (
    <div className="entity-detail-content">
      {/* Warning if entity is filtered out */}
      {isOutsideFilter && (
        <div className="kg-filter-warning" role="status">
          Selected entity is outside the current filter ({humanLabel(currentFilter)}).
        </div>
      )}

      {/* Overview */}
      <div className="entity-detail-heading">
        <span
          className={`entity-icon entity-${detail?.entity?.type?.toLowerCase() || ''}`}
          aria-hidden="true"
        >
          {entityIcon(detail.entity.type)}
        </span>
        <div>
          <p className="entity-type-label">{humanLabel(detail.entity.type)}</p>
          <h2>{detail.entity.name}</h2>
          <p className="entity-meta-line">
            {detail.outgoingRelations.length + detail.incomingRelations.length} connection
            {detail.outgoingRelations.length + detail.incomingRelations.length === 1 ? "" : "s"}
            {" · "}
            {detail.sourceDocuments.length} document
            {detail.sourceDocuments.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Relationships */}
      <DetailSection title="Relationships" count={grouped.length}>
        {grouped.length === 0 ? (
          <p className="muted-copy" role="status">
            This entity has no recorded relationships yet.
          </p>
        ) : (
          grouped.map((group) => (
            <button
              key={group.groupKey}
              type="button"
              className="detail-link"
              onClick={() => onSelect(group.peer.id)}
              aria-label={`${group.direction === "out" ? "→" : "←"} ${humanRelationType(group.type)}: ${group.peer.name}`}
            >
              <span className="detail-link-direction">
                {group.direction === "out" ? "→" : "←"}{" "}
                <em>{humanRelationType(group.type)}</em>
              </span>
              <strong className="detail-link-name">{group.peer.name}</strong>
              {group.relationIds.length > 1 && (
                <span
                  className="kg-group-badge"
                  title={`${group.relationIds.length} relation records`}
                >
                  {group.relationIds.length}
                </span>
              )}
            </button>
          ))
        )}
      </DetailSection>

      {/* Connected documents */}
      <DetailSection title="Connected documents" count={detail.sourceDocuments.length}>
        {detail.sourceDocuments.length === 0 ? (
          <p className="muted-copy">No documents linked.</p>
        ) : (
          detail.sourceDocuments.map((doc) => (
            <div key={doc.id} className="detail-row">
              <FileText aria-hidden="true" />
              <span>
                <strong title={doc.name}>{doc.name}</strong>
                <small>
                  <StatusBadge status={doc.status} />
                </small>
              </span>
            </div>
          ))
        )}
      </DetailSection>

      {/* Connected tasks */}
      <DetailSection title="Connected tasks" count={detail.connectedTasks.length}>
        {detail.connectedTasks.length === 0 ? (
          <p className="muted-copy" role="status">
            No linked tasks found.
          </p>
        ) : (
          detail.connectedTasks.map((task) => (
            <div key={task.id} className="detail-row">
              <Users aria-hidden="true" />
              <span>
                <strong title={task.title}>{task.title}</strong>
                <small>
                  {humanLabel(task.status)} · {humanLabel(task.priority)}
                  {task.dueDate ? ` · Due ${task.dueDate}` : ""}
                </small>
              </span>
            </div>
          ))
        )}
      </DetailSection>

      {/* Important dates */}
      {detail.connectedDates.length > 0 && (
        <DetailSection title="Important dates" count={detail.connectedDates.length}>
          {detail.connectedDates.map((date) => (
            <div key={date.id} className="detail-row">
              <CalendarDays aria-hidden="true" />
              <strong>{date.name}</strong>
            </div>
          ))}
        </DetailSection>
      )}

      {/* Source evidence */}
      <DetailSection title="Source evidence" count={detail.sourceExcerpts.length}>
        {detail.sourceExcerpts.length === 0 ? (
          <p className="muted-copy">No source excerpts available.</p>
        ) : (
          detail.sourceExcerpts.map((source, i) => (
            <blockquote
              key={`${source.documentId}-${source.chunkIndex ?? i}-${i}`}
              className="kg-excerpt"
            >
              <p>{source.excerpt}</p>
              {source.chunkIndex !== undefined && (
                <cite>
                  Chunk {source.chunkIndex}
                  {source.pageNumber !== undefined ? ` · Page ${source.pageNumber}` : ""}
                </cite>
              )}
            </blockquote>
          ))
        )}
      </DetailSection>
    </div>
  );
}

/* ─── AnswerPanel ────────────────────────────────────────────────── */

function AnswerPanel({ answer }: { answer: Answer }) {
  const citations = answer.citations.length ? answer.citations : answer.evidence;

  return (
    <div
      className={`graph-answer${answer.synthesisAvailable ? "" : " quota-limited"}`}
      aria-live="polite"
      role="region"
      aria-label="Answer from workspace graph"
    >
      <div className="graph-answer-header">
        <StatusBadge
          status={answer.synthesisAvailable ? "READY" : (answer.status ?? "EVIDENCE_ONLY")}
        />
        <strong>
          {answer.synthesisAvailable ? "Gemini synthesis" : "Evidence-only answer"}
        </strong>
      </div>
      <p>{answer.answer}</p>

      {citations.length > 0 && (
        <div className="citation-list" aria-label="Source citations">
          {citations.map((citation) => (
            <div key={`${citation.documentId}-${citation.chunkIndex}`}>
              <small>
                {citation.documentName} · Chunk {citation.chunkIndex}
                {citation.pageNumber ? ` · Page ${citation.pageNumber}` : ""}
              </small>
              <span>{citation.excerpt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── DetailSection ──────────────────────────────────────────────── */

function DetailSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="kg-detail-subsection" aria-label={title}>
      <h3>
        {title}
        {count !== undefined && count > 0 && (
          <span className="kg-count-badge" aria-label={`${count} items`}>
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

/* ─── StatCard ───────────────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <article className="stat-card" aria-label={`${label}: ${value}`}>
      <span className="stat-icon stat-icon-green" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p>{label}</p>
        <strong>{value.toLocaleString()}</strong>
      </div>
    </article>
  );
}
