"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Logo } from "./logo";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export function AuthForm({mode}:{mode:"login"|"register"}) {
  const router=useRouter(), setSession=useAuthStore((state)=>state.setSession); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const values=Object.fromEntries(new FormData(event.currentTarget));
    try { const result=await api<{user:{id:string;name:string;email:string};workspace:{id:string;name:string;slug:string};accessToken:string}>(`/auth/${mode}`,{method:"POST",body:JSON.stringify(values)}); setSession(result); router.push("/documents"); }
    catch (cause) { setError(cause instanceof ApiError?cause.message:"Could not complete the request."); setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-panel"><Logo/><div><span className="kicker">INTELLIX WORKSPACE</span><h1>{mode==="login"?"Welcome back.":"Create your workspace."}</h1><p>{mode==="login"?"Continue turning documents into grounded answers and action.":"Start with one secure workspace for your documents, insights, and tasks."}</p></div><form onSubmit={submit}>
    {mode==="register"&&<><label>Name<input name="name" required minLength={2} autoComplete="name"/></label><label>Workspace name<input name="workspaceName" required minLength={2}/></label></>}
    <label>Email<input name="email" type="email" required autoComplete="email"/></label><label>Password<input name="password" type="password" required minLength={mode==="register"?10:1} autoComplete={mode==="login"?"current-password":"new-password"}/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}<button className="button button-primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:null}{mode==="login"?"Sign in":"Create account"}<ArrowRight size={16}/></button>
  </form><small>{mode==="login"?"New to Intellix? ":"Already have an account? "}<Link href={mode==="login"?"/register":"/login"}>{mode==="login"?"Create a workspace":"Sign in"}</Link></small></section></main>;
}
