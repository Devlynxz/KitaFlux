"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry picks this up in production once DSN is configured.
    console.error("[kitaflux] route error", error);
  }, [error]);

  return (
    <Card>
      <EmptyState
        title="Something went wrong on this page"
        description={
          error.digest
            ? `Try again. If it keeps happening, quote reference ${error.digest}.`
            : "Try again. If it keeps happening, please get in touch."
        }
        action={
          <Button onClick={reset}>
            <RotateCcw /> Try again
          </Button>
        }
      />
    </Card>
  );
}
