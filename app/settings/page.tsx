import { Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHeader } from "@/components/ui";
export default function SettingsPage(){return <AppShell title="Settings"><PageHeader eyebrow="COMING SOON" title="Settings" description="Workspace administration will arrive in a future release."/><EmptyState icon={<Settings/>} title="Settings is under development" description="Your current workspace and authentication remain active and secure." href="/dashboard" action="Return to overview"/></AppShell>}
