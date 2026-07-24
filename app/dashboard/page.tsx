"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CheckCircle2, FileCheck2, FileClock, Files, ListTodo, Plus, Sparkles, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { api, type DocumentRecord, type TaskRecord } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

type DashboardSummary = { totalDocuments:number; readyDocuments:number; processingDocuments:number; failedDocuments:number; totalTasks:number; pendingTasks:number; completedTasks:number; recentDocuments:Pick<DocumentRecord,"id"|"name"|"status"|"updatedAt">[]; recentTasks:TaskRecord[] };

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const summary = useQuery({ queryKey:["dashboard-summary"], queryFn:()=>api<DashboardSummary>("/dashboard/summary"), retry:false });
  return <AppShell title="Overview">
    <PageHeader eyebrow="INTELLIX OVERVIEW" title={`Welcome back, ${user?.name?.split(" ")[0] ?? "there"}`} description="Here is what is happening in your Intellix workspace." actions={<><Link className="button button-secondary" href="/documents"><Files/>Open documents</Link><Link className="button button-primary" href="/documents"><Upload/>Upload document</Link></>}/>
    {summary.isLoading ? <LoadingState label="Loading workspace overview"/> : summary.isError || !summary.data ? <ErrorState title="Dashboard data is unavailable" description="Sign in again or verify that the API is running."/> : <DashboardContent data={summary.data}/>}
  </AppShell>;
}

function DashboardContent({data}:{data:DashboardSummary}) {
  const stats = [
    ["Total documents",data.totalDocuments,"All workspace files",Files],
    ["Ready documents",data.readyDocuments,"Available for Q&A",FileCheck2],
    ["Processing",data.processingDocuments,"Extraction or analysis",FileClock],
    ["Failed",data.failedDocuments,"Review and retry",AlertCircle],
    ["Pending tasks",data.pendingTasks,"Action still required",ListTodo],
    ["Completed tasks",data.completedTasks,`${data.totalTasks} total tasks`,CheckCircle2],
  ] as const;
  const max = Math.max(data.totalDocuments,1);
  return <>
    <section className="dashboard-stats" aria-label="Workspace statistics">{stats.map(([label,value,description,Icon])=><article className="stat-card" key={label}><span><Icon aria-hidden="true"/></span><p>{label}</p><strong>{value}</strong><small>{description}</small></article>)}</section>
    <section className="dashboard-grid">
      <Card><div className="card-header"><div><p>WORKSPACE ACTIVITY</p><h2>Processing overview</h2></div><span className="badge">Live totals</span></div><div className="activity-list"><Activity label="Ready" value={data.readyDocuments} max={max}/><Activity label="Processing" value={data.processingDocuments} max={max}/><Activity label="Failed" value={data.failedDocuments} max={max}/></div><p className="honest-note">Historical analytics are not available yet. This view uses current persisted document totals.</p></Card>
      <Card className="ai-card"><span className="ai-icon"><Sparkles/></span><p>AI WORKSPACE</p><h2>{insightTitle(data)}</h2><p>{insightText(data)}</p><Link href={data.pendingTasks?"/tasks":"/documents"}>{data.pendingTasks?"Review pending tasks":"Upload your next document"}<ArrowRight/></Link><small>General assistant chat is coming soon. Document Q&A is the supported AI workflow.</small></Card>
      <Card className="wide-card"><div className="card-header"><div><p>RECENT FILES</p><h2>Recent documents</h2></div><Link href="/documents">View all<ArrowRight/></Link></div>{data.recentDocuments.length?<div className="data-list"><div className="data-row header"><span>File</span><span>Status</span><span>Updated</span><span>Action</span></div>{data.recentDocuments.map(doc=><div className="data-row" key={doc.id}><span><Files/><b title={doc.name}>{doc.name}</b></span><StatusBadge status={doc.status}/><time>{date(doc.updatedAt)}</time><Link href={`/documents/${doc.id}`}>Open</Link></div>)}</div>:<InlineEmpty text="No documents yet. Upload a file to begin." href="/documents"/>}</Card>
      <Card className="wide-card"><div className="card-header"><div><p>ACTION CENTER</p><h2>Recent tasks</h2></div><Link href="/tasks">View all<ArrowRight/></Link></div>{data.recentTasks.length?<div className="data-list"><div className="data-row header"><span>Task</span><span>Priority</span><span>Status</span><span>Due</span></div>{data.recentTasks.map(task=><div className="data-row" key={task.id}><span><CheckCircle2/><b title={task.title}>{task.title}</b></span><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span><StatusBadge status={task.status}/><time>{task.dueDate?date(task.dueDate):"No due date"}</time></div>)}</div>:<InlineEmpty text="No tasks yet. Create one or confirm an action item." href="/tasks"/>}</Card>
    </section>
    <section className="quick-section"><p className="eyebrow-label">QUICK ACTIONS</p><h2>Keep work moving</h2><div className="quick-grid"><Quick href="/documents" icon={<Upload/>} title="Upload document" description="Add a PDF, TXT file or image."/><Quick href="/documents" icon={<Sparkles/>} title="Ask a document" description="Get grounded answers with citations."/><Quick href="/tasks" icon={<Plus/>} title="Create task" description="Add a task to your action center."/><Quick href="/documents" icon={<Files/>} title="View documents" description="Review every workspace file."/><Quick href="/tasks" icon={<ListTodo/>} title="Pending tasks" description={`${data.pendingTasks} items still need action.`}/></div></section>
  </>;
}

function Activity({label,value,max}:{label:string;value:number;max:number}) { return <div className="activity-row"><div><span>{label}</span><strong>{value}</strong></div><div className="activity-track"><span style={{width:`${Math.max(value?7:0,value/max*100)}%`}}/></div></div>; }
function InlineEmpty({text,href}:{text:string;href:string}) { return <div className="ui-empty"><p>{text}</p><Link className="button button-secondary" href={href}>Get started<ArrowRight/></Link></div>; }
function Quick({href,icon,title,description}:{href:string;icon:React.ReactNode;title:string;description:string}) { return <Link href={href}>{icon}<strong>{title}</strong><small>{description}</small><ArrowRight className="arrow"/></Link>; }
function date(value:string) { return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"}).format(new Date(value)); }
function insightTitle(data:DashboardSummary) { if(data.failedDocuments)return `${data.failedDocuments} document${data.failedDocuments===1?" needs":"s need"} attention`;if(data.processingDocuments)return "Your document intelligence is processing";if(data.pendingTasks)return `${data.pendingTasks} task${data.pendingTasks===1?" is":"s are"} waiting`;return "Your workspace is ready for the next document"; }
function insightText(data:DashboardSummary) { if(data.failedDocuments)return "Open Documents to review the safe failure reason and retry analysis.";if(data.processingDocuments)return "Intellix is extracting, OCR processing, or analyzing uploaded files.";if(data.pendingTasks)return "Review confirmed action items and keep the workflow moving.";return "Upload a source file to generate structured intelligence and grounded answers."; }
