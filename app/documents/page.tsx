"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, useRef, useState } from "react";
import { FileText, LoaderCircle, Upload } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace-header";
import { api, ApiError, type DocumentRecord } from "@/lib/api";

export default function DocumentsPage(){const client=useQueryClient(),input=useRef<HTMLInputElement>(null),[error,setError]=useState("");const query=useQuery({queryKey:["documents"],queryFn:()=>api<DocumentRecord[]>("/documents"),refetchInterval:5000});
 const upload=useMutation({mutationFn:async(file:File)=>{const body=new FormData();body.append("file",file);return api<DocumentRecord>("/documents",{method:"POST",body})},onSuccess:async()=>{setError("");await client.invalidateQueries({queryKey:["documents"]})},onError:(cause)=>setError(cause instanceof ApiError?cause.message:"Upload failed.")});
 function choose(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(file)upload.mutate(file);event.target.value=""}
 return <><WorkspaceHeader/><main className="product-page"><header className="product-heading"><div><span className="kicker">DOCUMENT INTELLIGENCE</span><h1>Your documents</h1><p>Upload a PDF, text file, or image. Intellix extracts, analyzes, and grounds every answer in the source.</p></div><button className="button button-primary" onClick={()=>input.current?.click()} disabled={upload.isPending}>{upload.isPending?<LoaderCircle className="spin" size={16}/>:<Upload size={16}/>}Upload document</button><input ref={input} hidden type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" onChange={choose}/></header>
 {error&&<p className="form-error" role="alert">{error}</p>}{query.isLoading?<div className="empty-state"><LoaderCircle className="spin"/></div>:query.isError?<div className="empty-state"><p>Could not load documents. Sign in or try again.</p></div>:!query.data?.length?<div className="empty-state"><FileText/><h2>No documents yet</h2><p>Upload your first file to generate a summary, actions, dates, and grounded answers.</p></div>:<section className="document-list">{query.data.map(doc=><Link href={`/documents/${doc.id}`} key={doc.id}><span><FileText size={19}/></span><div><strong>{doc.name}</strong><small>{(doc.sizeBytes/1024).toFixed(1)} KB · Updated {new Date(doc.updatedAt).toLocaleString()}</small></div><i className={`status ${doc.status.toLowerCase()}`}>{doc.status.replaceAll("_"," ")}</i></Link>)}</section>}</main></>}
