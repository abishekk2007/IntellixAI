"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Logo } from "./logo";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export function AuthForm({mode}:{mode:"login"|"register"}) {
  const router=useRouter(), setSession=useAuthStore((state)=>state.setSession); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [showPassword,setShowPassword]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const values=Object.fromEntries(new FormData(event.currentTarget));
    if(mode==="register"&&values.password!==values.confirmPassword){setError("Passwords do not match.");setBusy(false);return;} delete values.confirmPassword;
    try { const result=await api<{user:{id:string;name:string;email:string};workspace:{id:string;name:string;slug:string};accessToken:string}>(`/auth/${mode}`,{method:"POST",body:JSON.stringify(values)}); setSession(result); router.push("/dashboard"); }
    catch (cause) { setError(cause instanceof ApiError?cause.message:"Could not complete the request."); setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-panel"><Logo/><div><span className="kicker">INTELLIX WORKSPACE</span><h1>{mode==="login"?"Welcome back.":"Create your workspace."}</h1><p>{mode==="login"?"Continue turning documents into grounded answers and action.":"Start with one secure workspace for your documents, insights, and tasks."}</p></div><form onSubmit={submit}>
    {mode==="register"&&<><label>Name<input name="name" required minLength={2} autoComplete="name"/></label><label>Workspace name<input name="workspaceName" required minLength={2}/></label></>}
    <label>Email<input name="email" type="email" required autoComplete="email"/></label><label>Password<span className="password-field"><input name="password" type={showPassword?"text":"password"} required minLength={mode==="register"?10:1} autoComplete={mode==="login"?"current-password":"new-password"}/><button type="button" aria-label={showPassword?"Hide password":"Show password"} onClick={()=>setShowPassword((visible)=>!visible)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>
    {mode==="register"&&<label>Confirm password<input name="confirmPassword" type={showPassword?"text":"password"} required minLength={10} autoComplete="new-password"/></label>}
    {error&&<p className="form-error" role="alert">{error}</p>}<button className="button button-primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:null}{mode==="login"?"Sign in":"Create account"}<ArrowRight size={16}/></button>
  </form><small>{mode==="login"?"New to Intellix? ":"Already have an account? "}<Link href={mode==="login"?"/register":"/login"}>{mode==="login"?"Create a workspace":"Sign in"}</Link></small></section></main>;
}
