import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Every error thrown while rendering a server component, running a route
// handler or a server action -- the ones Next.js turns into an error page.
export const onRequestError = Sentry.captureRequestError;
