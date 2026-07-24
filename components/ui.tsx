import Link from "next/link";
import { AlertCircle, ArrowRight, LoaderCircle } from "lucide-react";
import { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow-label">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</header>;
}
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={`ui-card ${className}`}>{children}</section>; }
export function EmptyState({ icon, title, description, href, action }: { icon: ReactNode; title: string; description: string; href?: string; action?: string }) { return <div className="ui-empty"><span>{icon}</span><h2>{title}</h2><p>{description}</p>{href && action && <Link className="button button-secondary" href={href}>{action}<ArrowRight/></Link>}</div>; }
export function LoadingState({ label = "Loading" }: { label?: string }) { return <div className="ui-state" role="status"><LoaderCircle className="spin"/><p>{label}</p></div>; }
export function ErrorState({ title = "Something went wrong", description }: { title?: string; description: string }) { return <div className="ui-error" role="alert"><AlertCircle/><div><h2>{title}</h2><p>{description}</p></div></div>; }
export function StatusBadge({ status }: { status: string }) { return <span className={`badge badge-${status.toLowerCase()}`}>{status.replaceAll("_", " ")}</span>; }
