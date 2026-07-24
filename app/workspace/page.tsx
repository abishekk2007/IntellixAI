"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileCheck2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { api, type DocumentRecord } from "@/lib/api";
export default function WorkspacePage(){const query=useQuery({queryKey:["documents"],queryFn:()=>api<DocumentRecord[]>("/documents")});const ready=query.data?.filter(doc=>doc.status==="READY")??[];return <AppShell title="AI Workspace"><PageHeader eyebrow="DOCUMENT-GROUNDED AI" title="AI Workspace" description="Choose a ready document to ask grounded questions with source citations."/><Card className="ai-card"><span className="ai-icon"><Sparkles/></span><p>GENERAL ASSISTANT</p><h2>Coming soon</h2><p>Open-ended workspace chat is not available yet. Document Q&A is the supported and verified workflow.</p></Card><div className="quick-section"><h2>Ready documents</h2>{query.isLoading?<LoadingState/>:ready.length?<div className="quick-grid">{ready.map(doc=><Link href={`/documents/${doc.id}`} key={doc.id}><FileCheck2/><strong>{doc.name}</strong><StatusBadge status={doc.status}/><ArrowRight className="arrow"/></Link>)}</div>:<EmptyState icon={<Sparkles/>} title="No ready documents" description="Upload a document and wait for analysis before asking grounded questions." href="/documents" action="Open documents"/>}</div></AppShell>}
