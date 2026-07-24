import { BarChart3 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHeader } from "@/components/ui";
export default function AnalyticsPage(){return <AppShell title="Analytics"><PageHeader eyebrow="COMING SOON" title="Analytics" description="Historical trends and team reporting are planned for a future release."/><EmptyState icon={<BarChart3/>} title="Analytics is under development" description="Current persisted totals remain available on the Overview dashboard." href="/dashboard" action="Return to overview"/></AppShell>}
