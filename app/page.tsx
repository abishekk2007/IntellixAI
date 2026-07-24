"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight, Bot, BrainCircuit, CalendarDays, Check, ChevronDown,
  FileSearch, Layers3, Menu, Search, ShieldCheck, Sparkles, Workflow, X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { IconBox } from "@/components/icons";

const features = [
  { icon: Bot, tone: "violet" as const, title: "AI that understands your work", text: "Ask, analyze, create, and act with context from everything in your workspace." },
  { icon: FileSearch, tone: "blue" as const, title: "Documents, finally intelligent", text: "Turn PDFs, sheets, slides, and images into summaries, answers, and clear next steps." },
  { icon: Workflow, tone: "green" as const, title: "From insight to action", text: "Transform any decision into tasks, reminders, meetings, and automated workflows." },
];

const faqs = [
  ["What makes Intellix different from an AI chatbot?", "Intellix connects conversation to your documents, knowledge, tasks, and calendar—so answers can become real work, not another tab to manage."],
  ["Which file types are supported?", "PDF, DOCX, PPTX, XLSX, TXT, CSV, and common image formats are all part of the document intelligence roadmap."],
  ["Is my workspace data secure?", "Intellix is designed around secure authentication, encrypted connections, scoped permissions, and clear control over connected data."],
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <main className="landing">
      <nav className="site-nav" aria-label="Primary navigation">
        <Logo />
        <div className={`nav-links ${menuOpen ? "open" : ""}`}>
          <a href="#features">Features</a><a href="#workflow">How it works</a><a href="#security">Security</a><a href="#pricing">Pricing</a>
          <Link href="/dashboard" className="mobile-nav-cta">Open workspace</Link>
        </div>
        <div className="nav-actions">
          <Link href="/dashboard" className="text-link">Sign in</Link>
          <Link href="/dashboard" className="button button-dark">Get started <ArrowRight size={15} /></Link>
        </div>
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X /> : <Menu />}</button>
      </nav>

      <section className="hero">
        <div className="ambient ambient-one" /><div className="ambient ambient-two" />
        <div className="eyebrow"><span><Sparkles size={13} /></span> One workspace. Endless intelligence.</div>
        <h1>Where intelligence<br /><span>meets action.</span></h1>
        <p className="hero-copy">Bring your documents, knowledge, and daily work together. Intellix understands the context, finds what matters, and helps you move forward.</p>
        <div className="hero-actions">
          <Link href="/dashboard" className="button button-primary">Start building smarter <ArrowRight size={17} /></Link>
          <a href="#workflow" className="button button-ghost">See how it works</a>
        </div>
        <p className="hero-note"><Check size={14} /> Free to explore <span /> No credit card required</p>

        <div className="product-stage" aria-label="Intellix workspace preview">
          <div className="stage-glow" />
          <div className="product-window">
            <div className="window-topbar">
              <div className="window-dots"><i /><i /><i /></div><span>Intellix Workspace</span><div className="avatar">AK</div>
            </div>
            <div className="window-body">
              <aside className="preview-sidebar">
                <Logo compact />
                <div className="preview-nav active"><Sparkles size={16} /> Home</div>
                <div className="preview-nav"><Bot size={16} /> AI Workspace</div>
                <div className="preview-nav"><FileSearch size={16} /> Documents</div>
                <div className="preview-nav"><Search size={16} /> Knowledge</div>
                <div className="preview-nav"><CalendarDays size={16} /> Calendar</div>
              </aside>
              <div className="preview-main">
                <div className="preview-greeting"><span>Good morning, Alex</span><h3>What will we accomplish today?</h3></div>
                <div className="command-bar"><Sparkles size={18} /><span>Ask anything or tell Intellix what to do...</span><kbd>⌘ K</kbd></div>
                <div className="preview-grid">
                  <div className="preview-card wide">
                    <div className="card-label">Today&apos;s focus <span>4 tasks</span></div>
                    <div className="task-row"><i className="task-check done"><Check size={11} /></i><span>Review Q3 strategy brief</span><small>9:30 AM</small></div>
                    <div className="task-row"><i className="task-check" /><span>Prepare client presentation</span><small>11:00 AM</small></div>
                    <div className="task-row"><i className="task-check" /><span>Team product sync</span><small>2:30 PM</small></div>
                  </div>
                  <div className="preview-card insight">
                    <div className="mini-orb"><BrainCircuit size={19} /></div>
                    <div><div className="card-label">AI insight</div><p>3 reports mention the same growth opportunity.</p><button>Explore insight <ArrowRight size={12} /></button></div>
                  </div>
                  <div className="preview-card metric"><small>Work completed</small><strong>84%</strong><div className="bars"><i/><i/><i/><i/><i/><i/><i/></div></div>
                  <div className="preview-card recent"><div className="card-label">Recent knowledge</div><span><FileSearch size={15}/> Market research.pdf <small>12 min</small></span><span><Layers3 size={15}/> Product roadmap <small>1 hr</small></span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-row"><p>Built for focused teams and ambitious thinkers</p><div><span>Northstar</span><span>✦ LUMEN</span><span>vertex</span><span>MONO</span><span>ACME</span></div></section>

      <section className="feature-section" id="features">
        <div className="section-heading"><span className="kicker">ONE INTELLIGENT WORKSPACE</span><h2>Less switching.<br />More <em>momentum.</em></h2><p>Everything you need to understand, organize, and complete your work—connected by intelligence.</p></div>
        <div className="feature-grid">
          {features.map((feature) => <article className="feature-card" key={feature.title}><IconBox icon={feature.icon} tone={feature.tone}/><h3>{feature.title}</h3><p>{feature.text}</p><a href="#workflow">Learn more <ArrowRight size={14}/></a></article>)}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="workflow-copy"><span className="kicker">BUILT AROUND YOUR FLOW</span><h2>Start with a thought.<br /><em>Finish with progress.</em></h2><p>Intellix connects every step between an idea and a finished outcome.</p>
          <ol><li><span>01</span><div><strong>Bring your context</strong><p>Upload documents or connect the tools you already use.</p></div></li><li><span>02</span><div><strong>Think with AI</strong><p>Ask questions, find patterns, and create with full context.</p></div></li><li><span>03</span><div><strong>Turn it into action</strong><p>Create tasks, schedule work, and keep momentum automatically.</p></div></li></ol>
        </div>
        <div className="flow-visual">
          <div className="flow-card source"><small>FROM YOUR DOCUMENT</small><strong>Q3 Strategy.pdf</strong><p>“Expand into two new markets by Q4...”</p></div>
          <div className="flow-line"><span><Sparkles size={16}/></span></div>
          <div className="flow-card result"><small>INTELLIX FOUND 3 ACTIONS</small><div><Check size={14}/><span><strong>Research APAC competitors</strong><small>Task · Due Friday</small></span></div><div><CalendarDays size={14}/><span><strong>Schedule expansion review</strong><small>Meeting · Next week</small></span></div><div><FileSearch size={14}/><span><strong>Create market brief</strong><small>Document · Ready to generate</small></span></div><button>Apply all actions <ArrowRight size={13}/></button></div>
        </div>
      </section>

      <section className="security-strip" id="security"><div><ShieldCheck size={25}/><span><strong>Your work stays yours.</strong><small>Secure by design, private by default, and always under your control.</small></span></div><a href="#faq">Explore security <ArrowRight size={14}/></a></section>

      <section className="quote-section"><Sparkles size={22}/><blockquote>“Intellix doesn&apos;t just give us answers. It understands where our work is going and helps us get there.”</blockquote><div className="quote-author"><span>MR</span><p><strong>Maya Raman</strong><small>Head of Product, Northstar</small></p></div></section>

      <section className="faq-section" id="faq"><div><span className="kicker">QUESTIONS, ANSWERED</span><h2>Good to know.</h2></div><div className="faq-list">{faqs.map(([q,a], i) => <button key={q} className={`faq-item ${openFaq === i ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === i ? -1 : i)}><span><strong>{q}</strong><ChevronDown size={18}/></span><p>{a}</p></button>)}</div></section>

      <section className="cta-section" id="pricing"><div className="cta-orb"><Sparkles size={24}/></div><h2>Your best work is waiting.</h2><p>Bring intelligence and action into one beautifully focused workspace.</p><Link href="/dashboard" className="button button-light">Start with Intellix <ArrowRight size={16}/></Link></section>

      <footer><div><Logo/><p>Where intelligence meets action.</p></div><div className="footer-links"><span><strong>Product</strong><a href="#features">Features</a><a href="#workflow">How it works</a><a href="#pricing">Pricing</a></span><span><strong>Company</strong><a href="#">About</a><a href="#">Roadmap</a><a href="#">Contact</a></span><span><strong>Legal</strong><a href="#">Privacy</a><a href="#">Terms</a><a href="#security">Security</a></span></div><div className="footer-bottom"><small>© 2026 Intellix AI. Built for better work.</small><span>English <ChevronDown size={13}/></span></div></footer>
    </main>
  );
}
