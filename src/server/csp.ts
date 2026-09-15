/**
 * Content Security Policy.
 *
 * Built per request by `src/proxy.ts`, because the script policy hinges on a
 * nonce that must be fresh for every response. Next.js reads the nonce back
 * out of the request's CSP header and stamps it onto its own framework and
 * page scripts; the one inline script we write ourselves (the pre-paint theme
 * script in the root layout) reads it from `x-nonce`.
 *
 * The choices that are not the Next.js guide's defaults, and why:
 *
 *   script-src  nonce + 'strict-dynamic'. A script runs only if it carries this
 *               response's nonce or was loaded by one that did. Host allowlists
 *               ('self') are ignored by browsers that understand strict-dynamic
 *               and kept only as a fallback for those that do not. This is the
 *               directive that turns an HTML-injection bug into a non-event.
 *
 *   style-src   'unsafe-inline', and deliberately *no* nonce. The UI sets ~70
 *               inline `style={...}` attributes (table min-widths, meters), and
 *               a nonce cannot authorise a style attribute -- worse, a nonce in
 *               style-src makes browsers ignore 'unsafe-inline' entirely, which
 *               would break every one of them. Injected CSS can restyle a page
 *               but cannot run code; the script policy is what matters.
 *
 *   connect-src 'self'. Every fetch the browser makes is same-origin: Better
 *               Auth's client, server actions, the rate lookup. FX providers,
 *               Resend and Inngest are called from the server, where CSP does
 *               not apply. In CSP3 browsers 'self' also covers the same-origin
 *               WebSocket that development hot reload uses.
 *
 *   upgrade-insecure-requests  production only. On http://localhost it would
 *               rewrite same-origin requests to https and break development.
 *
 * Development adds 'unsafe-eval': React uses eval to reconstruct server error
 * stacks in the browser. Production does not need it and does not get it.
 */

export type CspMode = "enforce" | "report-only";

export function buildContentSecurityPolicy({
  nonce,
  isDev,
}: {
  nonce: string;
  isDev: boolean;
}): string {
  const directives: Array<[string, ...string[]]> = [
    ["default-src", "'self'"],
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:"],
    ["font-src", "'self'"],
    ["connect-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ...(isDev ? [] : [["upgrade-insecure-requests"] as [string]]),
  ];
  return directives.map((d) => d.join(" ")).join("; ");
}

/**
 * Which header carries the policy.
 *
 * `CSP_MODE=report-only` is the rollback lever: if the policy blocks something
 * in production, flipping the env var turns every block into a console warning
 * without a code change. Anything other than exactly "report-only" enforces --
 * a typo must fail safe, not open.
 */
export function cspMode(value: string | undefined): CspMode {
  return value === "report-only" ? "report-only" : "enforce";
}

export function cspHeaderName(mode: CspMode): string {
  return mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/** 128 bits from the platform CSPRNG, base64-encoded as the CSP spec expects. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
