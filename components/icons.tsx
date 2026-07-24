import type { LucideIcon } from "lucide-react";

export function IconBox({ icon: Icon, tone = "violet" }: { icon: LucideIcon; tone?: "violet" | "blue" | "green" | "amber" }) {
  return (
    <span className={`icon-box ${tone}`} aria-hidden="true">
      <Icon size={20} strokeWidth={1.8} />
    </span>
  );
}
