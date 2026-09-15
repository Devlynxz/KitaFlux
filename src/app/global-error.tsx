"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import "./globals.css";

/**
 * Last-resort error page, for a failure in the root layout itself.
 *
 * It replaces the root layout, so it renders its own <html> and cannot rely on
 * the fonts or the pre-paint theme script -- hence the system font and the
 * light palette. Everything below the root layout is handled by the friendlier
 * `(app)/error.tsx`, which keeps the navigation around the message.
 *
 * Next.js catches the error before any global handler sees it, so it has to be
 * reported to Sentry explicitly.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
          <p className="text-lg font-bold tracking-tight">
            Kita<span className="text-[var(--color-primary)]">Flux</span>
          </p>
          <h1 className="mt-8 text-xl font-semibold tracking-tight">KitaFlux could not load</h1>
          <p className="mt-1.5 max-w-sm text-sm text-[var(--color-ink-muted)]">
            {error.digest
              ? `Your records are safe. Try again, and if it keeps happening, quote reference ${error.digest}.`
              : "Your records are safe. Try again in a moment."}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 h-10 rounded-[var(--radius-control)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-primary-fg)]"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
