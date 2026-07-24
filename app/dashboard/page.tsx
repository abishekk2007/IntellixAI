"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, ArrowRight, BarChart3, Bell, CheckCircle2, CircleHelp,
  FileCheck2, FileClock, Files, LayoutDashboard, ListTodo, Menu,
  Search, Settings, Sparkles, Upload, X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { api, type DocumentRecord, type TaskRecord } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

type DashboardSummary = {
  totalDocuments: number;
  readyDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  recentDocuments: Pick<DocumentRecord, "id" | "name" | "status" | "updatedAt">[];
  recentTasks: TaskRecord[];
};

const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Documents", href: "/documents", icon: Files },
  { label: "AI Workspace", href: "#ai-workspace", icon: Sparkles },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
];

export default function DashboardPage() {
  const router = useRouter();
  const [mobileNav, setMobileNav] = useState(false);
  const user = useAuthStore((state) => state.user);
  const workspace = useAuthStore((state) => state.workspace);
  const load = useAuthStore((state) => state.load);
  const logout = useAuthStore((state) => state.logout);
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api<DashboardSummary>("/dashboard/summary"),
    retry: false,
  });

  useEffect(() => {
    if (!user) void load().catch(() => router.push("/login"));
  }, [load, router, user]);

  async function signOut() {
    await logout();
    router.push("/login");
  }

  return <main className="judge-dashboard">
    <aside className={`judge-sidebar ${mobileNav ? "open" : ""}`}>
      <div className="judge-brand"><Logo/><button onClick={() => setMobileNav(false)} aria-label="Close navigation"><X/></button></div>
      <nav aria-label="Workspace navigation">
        <span>Workspace</span>
        {navigation.map(({label,href,icon:Icon}) => <Link key={label} href={href} className={label === "Overview" ? "active" : ""} onClick={() => setMobileNav(false)}><Icon/>{label}{label === "AI Workspace" && <small>Beta</small>}</Link>)}
        <span>Manage</span>
        <a href="#analytics"><BarChart3/>Analytics <small>Soon</small></a>
        <a href="#settings"><Settings/>Settings <small>Soon</small></a>
      </nav>
      <div className="judge-help"><CircleHelp/><div><strong>Demo ready</strong><p>Need a quick walkthrough?</p></div></div>
      <div className="judge-user"><div>{initials(user?.name)}</div><span><strong>{user?.name ?? "Intellix user"}</strong><small>{workspace?.name ?? "Your workspace"}</small></span><button onClick={signOut}>Sign out</button></div>
    </aside>

    <section className="judge-main">
      <header className="judge-topbar">
        <button className="judge-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu/></button>
        <div className="judge-search"><Search/><span>Search your workspace</span><kbd>⌘ K</kbd></div>
        <Link className="judge-upload" href="/documents"><Upload/>Upload document</Link>
        <button className="judge-notification" aria-label="Notifications"><Bell/><i/></button>
        <div className="judge-avatar">{initials(user?.name)}</div>
      </header>

      <div className="judge-content">
        <section className="judge-welcome">
          <div><p>INTELLIX OVERVIEW</p><h1>Welcome back, {user?.name?.split(" ")[0] ?? "there"}</h1><span>Here is what is happening in your Intellix workspace.</span></div>
          <div><Link href="/documents">Open documents</Link><Link className="primary" href="/documents"><Upload/>Upload document</Link></div>
        </section>

        {summary.isLoading ? <DashboardSkeleton/> : summary.isError || !summary.data ? <DashboardError/> : <DashboardData data={summary.data}/>}
      </div>
    </section>
    {mobileNav && <button className="judge-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation overlay"/>}
  </main>;
}

function DashboardData({data}:{data:DashboardSummary}) {
  const stats = [
    {label:"Total documents",value:data.totalDocuments,detail:"All workspace files",icon:Files,tone:"forest"},
    {label:"Ready documents",value:data.readyDocuments,detail:"Available for Q&A",icon:FileCheck2,tone:"green"},
    {label:"Processing",value:data.processingDocuments,detail:"Extraction or analysis",icon:FileClock,tone:"blue"},
    {label:"Failed",value:data.failedDocuments,detail:"Review and retry",icon:AlertCircle,tone:"red"},
    {label:"Pending tasks",value:data.pendingTasks,detail:"Action still required",icon:ListTodo,tone:"amber"},
    {label:"Completed tasks",value:data.completedTasks,detail:`${data.totalTasks} total tasks`,icon:CheckCircle2,tone:"mint"},
  ];
  const documentMax = Math.max(data.totalDocuments, 1);
  return <>
    <section className="judge-stats" aria-label="Workspace statistics">
      {stats.map(({label,value,detail,icon:Icon,tone}) => <article key={label}><span className={`judge-stat-icon ${tone}`}><Icon/></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>)}
    </section>

    <section className="judge-grid">
      <article className="judge-card judge-activity" id="analytics">
        <header><div><p>WORKSPACE ACTIVITY</p><h2>Processing overview</h2></div><span>Live totals</span></header>
        <div className="activity-bars" aria-label="Current document status distribution">
          <ActivityBar label="Ready" value={data.readyDocuments} max={documentMax}/>
          <ActivityBar label="Processing" value={data.processingDocuments} max={documentMax}/>
          <ActivityBar label="Failed" value={data.failedDocuments} max={documentMax}/>
        </div>
        <p className="honest-note">Historical analytics are not collected yet. This chart uses current persisted document totals.</p>
      </article>

      <aside className="judge-card judge-insight" id="ai-workspace">
        <span className="insight-mark"><Sparkles/></span><p>AI WORKSPACE</p><h2>{insightTitle(data)}</h2><p>{insightText(data)}</p>
        <Link href={data.failedDocuments ? "/documents" : data.pendingTasks ? "/tasks" : "/documents"}>{data.failedDocuments ? "Retry failed documents" : data.pendingTasks ? "Review pending tasks" : "Upload your next document"}<ArrowRight/></Link>
        <small>General assistant chat is coming soon. Document Q&A is the supported AI workflow.</small>
      </aside>

      <article className="judge-card judge-table-card">
        <header><div><p>RECENT FILES</p><h2>Recent documents</h2></div><Link href="/documents">View all <ArrowRight/></Link></header>
        {data.recentDocuments.length ? <div className="judge-table"><div className="judge-table-head"><span>File</span><span>Status</span><span>Updated</span><span>Action</span></div>{data.recentDocuments.map((document) => <div className="judge-table-row" key={document.id}><span><i className="file-tile"><Files/></i><b>{document.name}</b></span><span><em className={`status ${document.status.toLowerCase()}`}>{document.status.replaceAll("_"," ")}</em></span><time>{formatDate(document.updatedAt)}</time><Link href={`/documents/${document.id}`}>Open</Link></div>)}</div> : <EmptyInline text="No documents yet. Upload a file to begin." href="/documents"/>}
      </article>

      <article className="judge-card judge-table-card">
        <header><div><p>ACTION CENTER</p><h2>Recent tasks</h2></div><Link href="/tasks">View all <ArrowRight/></Link></header>
        {data.recentTasks.length ? <div className="judge-table task-table"><div className="judge-table-head"><span>Task</span><span>Priority</span><span>Status</span><span>Due</span></div>{data.recentTasks.map((task) => <div className="judge-table-row" key={task.id}><span><i className="task-tile"><CheckCircle2/></i><b>{task.title}</b></span><span><em className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</em></span><span><em className="task-status">{task.status.replaceAll("_"," ")}</em></span><time>{task.dueDate ? formatDate(task.dueDate) : "No due date"}</time></div>)}</div> : <EmptyInline text="No tasks yet. Confirm an action item or create one." href="/tasks"/>}
      </article>
    </section>

    <section className="judge-quick"><header><p>QUICK ACTIONS</p><h2>Keep work moving</h2></header><div><Link href="/documents"><Upload/><span><strong>Upload document</strong><small>PDF, TXT or image</small></span><ArrowRight/></Link><Link href="/documents"><Sparkles/><span><strong>Ask a document</strong><small>Grounded answers</small></span><ArrowRight/></Link><Link href="/tasks"><ListTodo/><span><strong>View tasks</strong><small>{data.pendingTasks} pending</small></span><ArrowRight/></Link></div></section>
  </>;
}

function ActivityBar({label,value,max}:{label:string;value:number;max:number}) { return <div><span><b>{label}</b><strong>{value}</strong></span><i><b style={{width:`${Math.max(value ? 8 : 0,(value/max)*100)}%`}}/></i></div>; }
function EmptyInline({text,href}:{text:string;href:string}) { return <div className="judge-empty"><p>{text}</p><Link href={href}>Get started <ArrowRight/></Link></div>; }
function DashboardSkeleton() { return <div className="judge-loading"><i/><i/><i/><i/><i/><i/></div>; }
function DashboardError() { return <div className="judge-error"><AlertCircle/><div><h2>Dashboard data is unavailable</h2><p>Sign in again or verify that the API is running.</p></div></div>; }
function initials(name?:string|null) { return name?.split(" ").filter(Boolean).slice(0,2).map((part) => part[0]).join("").toUpperCase() || "IA"; }
function formatDate(value:string) { return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"}).format(new Date(value)); }
function insightTitle(data:DashboardSummary) { if(data.failedDocuments) return `${data.failedDocuments} document${data.failedDocuments === 1 ? " needs" : "s need"} attention`; if(data.processingDocuments) return "Your document intelligence is processing"; if(data.pendingTasks) return `${data.pendingTasks} task${data.pendingTasks === 1 ? " is" : "s are"} waiting`; return "Your workspace is ready for the next document"; }
function insightText(data:DashboardSummary) { if(data.failedDocuments) return "Open Documents to review the safe failure reason and retry analysis."; if(data.processingDocuments) return "Intellix is extracting, OCR processing, or analyzing your uploaded files."; if(data.pendingTasks) return "Review the action items you have already confirmed and keep the workflow moving."; return "Upload a source file to generate structured intelligence and grounded document answers."; }
