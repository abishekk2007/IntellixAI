import { create } from "zustand";
import { api, setAccessToken } from "./api";

type User = { id:string; name:string; email:string };
type Workspace = { id:string; name:string; slug:string };
type AuthState = { user:User|null; workspace:Workspace|null; setSession:(data:{user:User;workspace:Workspace;accessToken:string})=>void; load:()=>Promise<void>; logout:()=>Promise<void> };

export const useAuthStore = create<AuthState>((set) => ({
  user:null, workspace:null,
  setSession(data) { setAccessToken(data.accessToken); set({ user:data.user, workspace:data.workspace }); },
  async load() { const data = await api<{user:User;workspace:Workspace}>("/auth/me"); set(data); },
  async logout() { await api("/auth/logout", {method:"POST"}).catch(()=>undefined); setAccessToken(null); set({user:null,workspace:null}); },
}));
