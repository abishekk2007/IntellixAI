"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListTodo, Plus, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { api, ApiError, type TaskRecord } from "@/lib/api";

export default function TasksPage(){
 const client=useQueryClient(),[search,setSearch]=useState(""),[status,setStatus]=useState("ALL"),[priority,setPriority]=useState("ALL"),[creating,setCreating]=useState(false),[error,setError]=useState("");
 const query=useQuery({queryKey:["tasks"],queryFn:()=>api<TaskRecord[]>("/tasks")});
 const refresh=()=>Promise.all([client.invalidateQueries({queryKey:["tasks"]}),client.invalidateQueries({queryKey:["dashboard-summary"]})]);
 const update=useMutation({mutationFn:({id,next}:{id:string;next:TaskRecord["status"]})=>api(`/tasks/${id}`,{method:"PATCH",body:JSON.stringify({status:next})}),onSuccess:refresh});
 const remove=useMutation({mutationFn:(id:string)=>api(`/tasks/${id}`,{method:"DELETE"}),onSuccess:refresh});
 const create=useMutation({mutationFn:(values:{title:string;priority:string})=>api("/tasks",{method:"POST",body:JSON.stringify(values)}),onSuccess:async()=>{setCreating(false);setError("");await refresh()},onError:cause=>setError(cause instanceof ApiError?cause.message:"Task could not be created.")});
 const tasks=useMemo(()=>(query.data??[]).filter(task=>task.title.toLowerCase().includes(search.toLowerCase())&&(status==="ALL"||task.status===status)&&(priority==="ALL"||task.priority===priority)),[query.data,search,status,priority]);
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));create.mutate({title:String(values.title),priority:String(values.priority)})}
 return <AppShell title="Tasks"><PageHeader eyebrow="ACTION CENTER" title="Tasks" description="Manage confirmed document actions and manually created work." actions={<button type="button" className="button button-primary" onClick={()=>setCreating(value=>!value)}><Plus/>Create task</button>}/>
  {creating&&<form className="composer" onSubmit={submit}><input name="title" required maxLength={200} placeholder="Task title" aria-label="Task title"/><select name="priority" aria-label="Task priority"><option>MEDIUM</option><option>HIGH</option><option>LOW</option></select><button className="button button-primary" disabled={create.isPending}>Add task</button></form>}{error&&<div className="form-error" role="alert">{error}</div>}
  <div className="toolbar"><label><Search/><span className="sr-only">Search tasks</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks"/></label><select aria-label="Filter by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All statuses</option><option>TODO</option><option>IN_PROGRESS</option><option>DONE</option></select><select aria-label="Filter by priority" value={priority} onChange={e=>setPriority(e.target.value)}><option value="ALL">All priorities</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div>
  {query.isLoading?<LoadingState label="Loading tasks"/>:query.isError?<ErrorState description="Tasks could not be loaded. Sign in again or verify the API connection."/>:!query.data?.length?<EmptyState icon={<ListTodo/>} title="No tasks yet" description="Create a task here or confirm action items from a ready document."/>:!tasks.length?<EmptyState icon={<Search/>} title="No matching tasks" description="Try another search or filter."/>:<div className="task-grid">{tasks.map(task=><Card className={`task-card ${task.status==="DONE"?"done":""}`} key={task.id}><button type="button" aria-label={`${task.status==="DONE"?"Reopen":"Complete"} ${task.title}`} onClick={()=>update.mutate({id:task.id,next:task.status==="DONE"?"TODO":"DONE"})}>{task.status==="DONE"&&<Check/>}</button><div className="task-copy"><h2>{task.title}</h2>{task.description&&<p>{task.description}</p>}<div className="task-meta"><StatusBadge status={task.status}/><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>{task.dueDate&&<span>Due {new Date(task.dueDate).toLocaleDateString()}</span>}{task.sourceDocumentId&&<span>From document</span>}</div></div><div className="task-actions"><button type="button" className="icon-button" aria-label={`Delete ${task.title}`} onClick={()=>remove.mutate(task.id)}><Trash2/></button></div></Card>)}</div>}
 </AppShell>;
}
