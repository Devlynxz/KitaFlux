import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="tabular mt-10 text-5xl font-bold tracking-tight text-[var(--color-ink-subtle)]">
        404
      </p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">We could not find that page</h1>
      <p className="mt-1.5 max-w-sm text-sm text-[var(--color-ink-muted)]">
        The link may be stale, or the record may belong to a different account.
      </p>
      <Link href="/dashboard" className={buttonVariants({ className: "mt-6" })}>
        Back to dashboard
      </Link>
    </div>
  );
}
