import { NextResponse, type NextRequest } from "next/server";

import {
  buildContentSecurityPolicy,
  cspHeaderName,
  cspMode,
  generateNonce,
} from "./server/csp";

/**
 * Per-request Content Security Policy. See `server/csp.ts` for the policy.
 *
 * This proxy does security headers and nothing else -- in particular it does
 * not check sessions. Authentication stays in `(app)/layout.tsx` and in each
 * server action, where it cannot be skipped by a matcher that stops matching a
 * route.
 *
 * The nonce is written to the *request* CSP header as well as the response:
 * Next.js extracts it from the request while rendering. That request header is
 * always named Content-Security-Policy, even in report-only mode, because it is
 * only ever read by Next.js and never sent to the browser.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeaderName(cspMode(process.env.CSP_MODE)), policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Documents only. Excluded: Better Auth and Inngest (JSON APIs), build
      // assets and public files (no document to protect), and the route
      // handlers that stream a download (PDF, CSV, account export). Those still
      // get frame-ancestors, nosniff and the rest from next.config.ts.
      source:
        "/((?!api/|_next/static|_next/image|favicon|brand/|manifest\\.webmanifest|reports/export|settings/export|invoices/[^/]+/pdf).*)",
      // Prefetches carry no document the browser will execute.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
