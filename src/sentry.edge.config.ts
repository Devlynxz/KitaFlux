import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "./sentry.shared";

// Edge runtime. Nothing in the app runs there today (proxy.ts is Node in
// Next.js 16); kept so a route that opts into edge is not silently unmonitored.
Sentry.init({
  ...sharedSentryOptions,
});
