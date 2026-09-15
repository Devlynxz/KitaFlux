import type { NextConfig } from "next";

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

export default nextConfig;
