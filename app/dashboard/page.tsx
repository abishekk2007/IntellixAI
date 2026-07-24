"use client";

import { FormEvent, useState } from "react";
import {
  ArrowRight, Bell, CalendarDays, Check, ChevronDown, CircleHelp, Clock3,
  Command, File, FileText, FolderKanban, Home, LayoutGrid, Menu, MessageSquare,
  Mic, MoreHorizontal, Paperclip, Search, Send, Settings, Sparkles,
  SquarePen, Target, Upload, Users, WandSparkles, X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const navItems = [
  { label: "Home", icon: Home }, { label: "AI Workspace", icon: Sparkles },
  { label: "Documents", icon: FileText }, { label: "Knowledge", icon: LayoutGrid },
  { label: "Tasks", icon: Check }, { label: "Calendar", icon: CalendarDays },
];

const starterPrompts = ["Summarize my latest documents", "Plan my priorities for today", "Create tasks from meeting notes"];

export default function Dashboard() {
  const [active, setActive] = useState("Home");
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    const text = query.trim();
    setMessages((items) => [...items, { role: "user", text }, { role: "ai", text: "I’ve mapped that request to your workspace. Connect your AI provider and data sources to run it with full context." }]);
    setQuery("");
    setActive("AI Workspace");
  }

  return (
    <main className="app-shell">
      <aside className={`app-sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="sidebar-top"><Logo/><button className="close-nav" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={19}/></button></div>
        <button className="new-chat" onClick={() => { setActive("AI Workspace"); setMessages([]); setMobileNav(false); }}><SquarePen size={16}/> New conversation <span>⌘ N</span></button>
        <nav className="app-nav" aria-label="Workspace navigation">
          {navItems.map(({label, icon: Icon}) => <button key={label} className={active === label ? "active" : ""} onClick={() => {setActive(label);setMobileNav(false)}}><Icon size={17}/>{label}{label === "Tasks" && <i>4</i>}</button>)}
        </nav>
        <div className="sidebar-label">Workspace</div>
        <nav className="app-nav secondary"><button><FolderKanban size={17}/> Projects</button><button><Users size={17}/> Shared with me</button></nav>
        <div className="sidebar-spacer"/>
        <div className="storage"><span><small>Workspace storage</small><small>2.4 / 10 GB</small></span><i><b/></i></div>
        <nav className="app-nav secondary"><button><CircleHelp size={17}/> Help & support</button><button><Settings size={17}/> Settings</button></nav>
        <div className="profile"><div className="profile-avatar">AK</div><span><strong>Alex Kumar</strong><small>alex@example.com</small></span><MoreHorizontal size={17}/></div>
      </aside>

      <div className="app-content">
        <header className="app-header"><button className="open-nav" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="header-search"><Search size={16}/><span>Search your workspace...</span><kbd><Command size={11}/> K</kbd></div><div className="header-actions"><button aria-label="Notifications"><Bell size={18}/><i/></button><button className="invite"><Users size={15}/> Invite</button></div></header>
        {active === "AI Workspace" ? (
          <section className="chat-view">
            <div className="chat-header"><div><span className="ai-dot"><Sparkles size={15}/></span><span><strong>New conversation</strong><small>General mode · Gemini</small></span></div><button><MoreHorizontal size={19}/></button></div>
            <div className="chat-stream">
              {messages.length === 0 ? <div className="chat-empty"><span><Sparkles size={27}/></span><h2>How can I help you work smarter?</h2><p>Ask about your documents, create content, organize your work, or start with one of these.</p><div>{starterPrompts.map(prompt => <button key={prompt} onClick={() => setQuery(prompt)}>{prompt}<ArrowRight size={14}/></button>)}</div></div> : messages.map((message,index)=><div key={index} className={`message ${message.role}`}><span>{message.role === "ai" ? <Sparkles size={15}/> : "AK"}</span><p>{message.text}</p></div>)}
            </div>
            <form className="chat-composer" onSubmit={sendMessage}><textarea aria-label="Message Intellix" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ask Intellix anything..." rows={1}/><div><span><button type="button" aria-label="Attach file"><Paperclip size={17}/></button><button type="button" aria-label="Voice input"><Mic size={17}/></button><button type="button" className="mode-button"><WandSparkles size={14}/> General <ChevronDown size={13}/></button></span><button className="send-button" aria-label="Send message" disabled={!query.trim()}><Send size={16}/></button></div></form>
            <small className="ai-disclaimer">Intellix can make mistakes. Check important information.</small>
          </section>
        ) : (
          <DashboardHome onOpenAI={() => setActive("AI Workspace")} />
        )}
      </div>
      {mobileNav && <button className="nav-scrim" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
    </main>
  );
}

function DashboardHome({ onOpenAI }: { onOpenAI: () => void }) {
  const summary = useQuery({ queryKey: ["dashboard-summary"], queryFn: () => api<{totalDocuments:number;readyDocuments:number;processingDocuments:number;failedDocuments:number;totalTasks:number;pendingTasks:number;completedTasks:number}>("/dashboard/summary"), retry: false });
  const stats = summary.data;
  return <section className="dashboard-home">
    <div className="dashboard-title"><div><p>Thursday, July 23</p><h1>Good morning, Alex.</h1><span>Here&apos;s what&apos;s happening across your workspace.</span></div><div><button className="dash-secondary"><Upload size={15}/> Upload</button><button className="dash-primary" onClick={onOpenAI}><Sparkles size={15}/> Ask Intellix</button></div></div>
    <div className="dash-command"><Sparkles size={19}/><input aria-label="Ask Intellix" placeholder="Ask anything or tell Intellix what to do..." onFocus={onOpenAI}/><kbd>⌘ K</kbd></div>
    <div className="stats-grid"><Stat icon={<Check size={18}/>} label="Tasks completed" value={stats ? String(stats.completedTasks) : "—"} detail={stats ? `${stats.pendingTasks} pending tasks` : "Sign in for live data"} tone="purple"/><Stat icon={<FileText size={18}/>} label="Documents" value={stats ? String(stats.totalDocuments) : "—"} detail={stats ? `${stats.readyDocuments} ready · ${stats.processingDocuments} processing` : "Sign in for live data"} tone="blue"/><Stat icon={<MessageSquare size={18}/>} label="AI conversations" value="—" detail="Conversation persistence next" tone="green"/><Stat icon={<Target size={18}/>} label="MVP workflow" value={stats ? "Live" : "Demo"} detail={stats ? "Connected to API" : "Prototype data below"} tone="amber"/></div>
    <div className="dashboard-grid">
      <article className="dash-card focus-card"><header><div><h3>Today&apos;s focus</h3><p>4 tasks · 2h 45m estimated</p></div><button><MoreHorizontal size={18}/></button></header><div className="progress-line"><i><b/></i><span>65%</span></div><Task checked title="Review Q3 strategy brief" meta="Completed at 9:42 AM"/><Task title="Prepare client presentation" meta="Today · 11:00 AM" tag="High"/><Task title="Team product sync" meta="Today · 2:30 PM"/><Task title="Send weekly progress report" meta="Today · 4:00 PM"/><button className="view-all">View all tasks <ArrowRight size={13}/></button></article>
      <article className="dash-card insight-card"><header><div><h3>AI insight</h3><p>Based on your recent work</p></div><span className="insight-spark"><Sparkles size={17}/></span></header><div className="insight-body"><div className="insight-files"><i/><i/><i/><span>3 documents</span></div><h4>A growth opportunity is emerging</h4><p>Three recent reports point to strong demand in Southeast Asia, with Singapore leading early signals.</p><button>Explore this insight <ArrowRight size={13}/></button></div></article>
      <article className="dash-card recent-card"><header><div><h3>Recent documents</h3><p>Continue where you left off</p></div><button>View all</button></header><Document name="Q3 Strategy Brief.pdf" meta="Edited 12 min ago" type="PDF" color="red"/><Document name="Product Roadmap 2026" meta="Edited 1 hour ago" type="DOC" color="blue"/><Document name="Market Research.xlsx" meta="Opened yesterday" type="XLS" color="green"/></article>
      <article className="dash-card schedule-card"><header><div><h3>Upcoming</h3><p>Your schedule today</p></div><button><CalendarDays size={17}/></button></header><div className="time-row"><time>11:00<small>AM</small></time><i className="blue"/><span><strong>Client presentation</strong><small>Zoom · 45 min</small></span></div><div className="time-row"><time>2:30<small>PM</small></time><i className="purple"/><span><strong>Team product sync</strong><small>Meeting room A · 30 min</small></span></div><div className="time-row"><time>4:00<small>PM</small></time><i className="green"/><span><strong>Weekly review</strong><small>Focus time · 45 min</small></span></div><button className="view-all">Open calendar <ArrowRight size={13}/></button></article>
    </div>
  </section>
}

function Stat({icon,label,value,detail,tone}:{icon:React.ReactNode,label:string,value:string,detail:string,tone:string}){return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>}
function Task({title,meta,checked,tag}:{title:string,meta:string,checked?:boolean,tag?:string}){return <div className={`dash-task ${checked?"checked":""}`}><button aria-label={`Mark ${title} complete`}>{checked?<Check size={12}/>:null}</button><span><strong>{title}</strong><small><Clock3 size={11}/>{meta}</small></span>{tag&&<i>{tag}</i>}</div>}
function Document({name,meta,type,color}:{name:string,meta:string,type:string,color:string}){return <div className="document-row"><span className={`file-icon ${color}`}><File size={18}/><small>{type}</small></span><span><strong>{name}</strong><small>{meta}</small></span><button><MoreHorizontal size={17}/></button></div>}
