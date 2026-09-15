import { scrubEvent, scrubUrl } from "@/lib/sentry-scrub";

/**
 * Options every Sentry runtime shares -- browser, Node server, edge.
 *
 * One module so the privacy settings cannot drift between runtimes: a server
 * config that remembered to scrub and a browser config that forgot would leak
 * through whichever one forgot.
 *
 * Without NEXT_PUBLIC_SENTRY_DSN the SDK is initialised disabled: nothing is
 * sent, nothing is buffered, and the app behaves exactly as before. Like every
 * other integration here, missing configuration degrades rather than fails.
 *
 * Deliberately not set:
 *   dataCollection        passing it at all -- even `{}` -- flips every category
 *                         it does not mention to permissive.
 *   includeLocalVariables local variables in a payment handler are amounts,
 *                         rates and TINs.
 *   Session Replay        records what is on screen, which here is income.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

export const sentryEnabled = Boolean(dsn);

export const sharedSentryOptions = {
  dsn,
  enabled: sentryEnabled,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  sendDefaultPii: false,
  // SDK diagnostics on the server log, for "why is nothing arriving?". Server
  // only: the variable is not exposed to the browser bundle.
  debug: process.env.SENTRY_DEBUG === "1",
  // Enough to see slow pages and actions without paying for every request.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  beforeBreadcrumb<B extends { category?: string; message?: string; data?: Record<string, unknown> }>(
    crumb: B,
  ): B | null {
    // Breadcrumbs are also scrubbed when the event is sent; scrubbing here too
    // means a token never sits in the in-memory buffer at all. Console output
    // is free text (see lib/sentry-scrub.ts) and is not kept.
    if (crumb.category === "console") return null;
    if (crumb.message) crumb.message = scrubUrl(crumb.message);
    if (crumb.data && typeof crumb.data.url === "string") crumb.data.url = scrubUrl(crumb.data.url);
    return crumb;
  },
};
