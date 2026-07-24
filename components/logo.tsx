import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="logo" aria-label="Intellix AI home">
      <span className="logo-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      {!compact && <span>intellix</span>}
    </Link>
  );
}
