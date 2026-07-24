"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./logo";
import { useAuthStore } from "@/lib/auth-store";

export function WorkspaceHeader(){const path=usePathname(),router=useRouter(),logout=useAuthStore(s=>s.logout);return <header className="workspace-header"><Logo/><nav><Link className={path.startsWith("/documents")?"active":""} href="/documents">Documents</Link><Link className={path==="/tasks"?"active":""} href="/tasks">Tasks</Link><Link href="/dashboard">Dashboard</Link></nav><button onClick={async()=>{await logout();router.push("/login")}}>Sign out</button></header>}
