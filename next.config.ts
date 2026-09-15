import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Response headers applied to every route.
 *
 * The full Content-Security-Policy is per-request (it carries a nonce) and is
 * set by src/proxy.ts on documents. The `frame-ancestors` policy here covers
 * everything the proxy deliberately skips -- the auth API, the PDF and CSV
 * downloads, static files -- so no response from this app can be framed.
 * Browsers enforce every CSP header they receive, so on a document the two
 * policies combine rather than conflict.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers ignore HSTS over plain http, so this is inert in local development.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

/**
 * Sentry build integration.
 *
 * `tunnelRoute` sends browser error reports to /monitoring on this origin,
 * which forwards them to Sentry. That keeps the CSP's connect-src at 'self'
 * instead of allow-listing an ingest host, and it survives ad blockers.
 *
 * Source maps upload only when SENTRY_AUTH_TOKEN (plus SENTRY_ORG and
 * SENTRY_PROJECT) are present -- a local or preview build without them skips
 * the upload quietly instead of failing.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  telemetry: false,
});
