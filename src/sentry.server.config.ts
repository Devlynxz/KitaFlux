import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "./sentry.shared";

// Node.js runtime: server components, server actions, route handlers, proxy.
Sentry.init({
  ...sharedSentryOptions,
  includeLocalVariables: false,
});
