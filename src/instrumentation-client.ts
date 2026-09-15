import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "./sentry.shared";

// Browser runtime. Events go to /monitoring on this origin (the tunnel route in
// next.config.ts), so the Content-Security-Policy keeps connect-src 'self'.
Sentry.init({
  ...sharedSentryOptions,
});

// Names client-side navigations in traces.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
