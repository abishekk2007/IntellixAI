"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { BarChart3, Bell, Files, LayoutDashboard, ListTodo, Menu, Network, Search, Settings, Sparkles, Upload, X } from "lucide-react";
import { Logo } from "./logo";
import { useAuthStore } from "@/lib/auth-store";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Documents", href: "/documents", icon: Files },
  { label: "Upload History", href: "/documents/history", icon: BarChart3 },
  { label: "AI Workspace", href: "/workspace", icon: Sparkles, badge: "Beta" },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
  { label: "Knowledge Graph", href: "/knowledge", icon: Network, badge: "New" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, badge: "Soon" },
  { label: "Settings", href: "/settings", icon: Settings, badge: "Soon" },
];

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, workspace, load, logout } = useAuthStore();

  useEffect(() => { if (!user) void load().catch(() => router.replace("/login")); }, [load, router, user]);
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => { if (drawerOpen) closeButton.current?.focus(); }, [drawerOpen]);
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, []);

  async function signOut() { await logout(); router.replace("/login"); }

  return <div className="app-layout">
    <aside className={`app-sidebar ${drawerOpen ? "is-open" : ""}`} aria-label="Workspace sidebar">
      <div className="app-sidebar-brand"><Logo/><button ref={closeButton} type="button" className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}><X/></button></div>
      <nav className="app-navigation" aria-label="Workspace navigation">
        <p>Workspace</p>
        {navigation.map(({ label, href, icon: Icon, badge }) => <Link key={href} href={href} className={pathname === href || (href === "/documents" && pathname.startsWith("/documents/")) ? "active" : ""} aria-current={pathname === href ? "page" : undefined}><Icon aria-hidden="true"/><span>{label}</span>{badge && <small>{badge}</small>}</Link>)}
      </nav>
      <div className="app-sidebar-user"><span className="user-avatar">{initials(user?.name)}</span><div><strong title={user?.name}>{user?.name ?? "Intellix user"}</strong><small title={workspace?.name}>{workspace?.name ?? "Workspace"}</small></div><button type="button" onClick={signOut}>Sign out</button></div>
    </aside>
    {drawerOpen && <button type="button" className="app-overlay" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}/>}
    <div className="app-main">
      <header className="app-topbar">
        <button type="button" className="icon-button app-menu" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}><Menu/></button>
        <h2>{title}</h2>
        <label className="app-search"><Search aria-hidden="true"/><span className="sr-only">Search workspace</span><input type="search" placeholder="Search your workspace"/></label>
        <div className="app-topbar-actions"><Link className="button button-primary upload-action" href="/documents"><Upload/> <span>Upload document</span></Link><button type="button" className="icon-button" aria-label="Notifications"><Bell/></button><span className="user-avatar" aria-label={`Signed in as ${user?.name ?? "Intellix user"}`}>{initials(user?.name)}</span></div>
      </header>
      <main className="app-page">{children}</main>
    </div>
  </div>;
}

function initials(name?: string | null) { return name?.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "IA"; }
