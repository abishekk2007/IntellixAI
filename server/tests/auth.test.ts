import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({
  user:{create:vi.fn(),findUnique:vi.fn()},workspace:{create:vi.fn()},membership:{create:vi.fn()},auditLog:{create:vi.fn()},refreshSession:{create:vi.fn(),findUnique:vi.fn(),update:vi.fn(),updateMany:vi.fn()},$transaction:vi.fn(),
}));
vi.mock("../src/config/prisma.js",()=>({prisma:mocks}));
import { login, register, rotateRefreshToken, verifyAccessToken } from "../src/modules/auth/auth.js";

const user={id:"11111111-1111-4111-8111-111111111111",name:"Alex",email:"alex@example.com"};
const workspace={id:"22222222-2222-4222-8222-222222222222",name:"Alex Workspace",slug:"alex-workspace"};

describe("authentication service",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.refreshSession.create.mockResolvedValue({id:"33333333-3333-4333-8333-333333333333"});});
  it("registers a user and owner workspace in one transaction",async()=>{mocks.$transaction.mockImplementation(async(fn:(tx:typeof mocks)=>Promise<unknown>)=>fn(mocks));mocks.user.create.mockResolvedValue(user);mocks.workspace.create.mockResolvedValue(workspace);const result=await register({name:"Alex",email:"alex@example.com",password:"long-password",workspaceName:"Alex Workspace"});expect(mocks.membership.create).toHaveBeenCalledWith({data:{userId:user.id,workspaceId:workspace.id,role:"OWNER"}});expect(verifyAccessToken(result.accessToken)).toMatchObject({sub:user.id,workspaceId:workspace.id});});
  it("logs in with a valid password",async()=>{const passwordHash=await bcrypt.hash("long-password",4);mocks.user.findUnique.mockResolvedValue({...user,passwordHash,memberships:[{workspaceId:workspace.id,workspace}]});const result=await login({email:user.email,password:"long-password"});expect(result.workspace.id).toBe(workspace.id);expect(result.refreshToken).toContain(".");});
  it("rotates a refresh session and atomically revokes the previous one",async()=>{mocks.$transaction.mockImplementation(async(fn:(tx:typeof mocks)=>Promise<unknown>)=>fn(mocks));mocks.refreshSession.updateMany.mockResolvedValue({count:1});mocks.user.create.mockResolvedValue(user);mocks.workspace.create.mockResolvedValue(workspace);const first=await register({name:"Alex",email:user.email,password:"long-password",workspaceName:"Alex Workspace"});const [id,token]=first.refreshToken.split(".");const {createHmac}=await import("node:crypto");mocks.refreshSession.findUnique.mockResolvedValue({id,userId:user.id,workspaceId:workspace.id,tokenHash:createHmac("sha256",process.env.JWT_REFRESH_SECRET!).update(token).digest("hex"),expiresAt:new Date(Date.now()+10000),revokedAt:null});const rotated=await rotateRefreshToken(first.refreshToken);expect(mocks.refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id,revokedAt:null}}));expect(rotated.accessToken).toBeTruthy();});
});
