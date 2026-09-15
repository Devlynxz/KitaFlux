/**
 * What an error report is allowed to carry off this machine.
 *
 * KitaFlux holds income records, bank and Wise account details, and a TIN. An
 * error report that ships a request body or a cookie ships exactly that. The
 * SDK's own defaults are already conservative (`sendDefaultPii` is off, and we
 * deliberately never pass `dataCollection`, which would flip unset categories
 * to permissive), but defaults change between SDK versions -- so this runs on
 * every event as a second, explicit line:
 *
 *   - request bodies: gone. Server action payloads are form fields: amounts,
 *     payment details, a TIN, a password on the change-password form.
 *   - cookies and every request header except a short allowlist: gone. The
 *     session cookie is a bearer credential.
 *   - query strings: gone, and single-use tokens are cut out of any URL,
 *     including breadcrumb URLs -- a password-reset link *is* the password.
 *   - user: reduced to the opaque id, never an email or IP.
 *   - breadcrumb `data` from fetch/xhr: bodies and headers removed.
 *   - tracing attributes on the transaction and every span: the SDK records
 *     `http.target` (path *with* query string) and each request header as an
 *     attribute, entirely separately from `event.request`. Found by capturing
 *     real envelopes locally -- the request block was clean while a reset
 *     token sat in `http.target` on the same event. The same goes for every
 *     other context (Next.js adds `contexts.nextjs.request_path`, query string
 *     included), so all context strings are scrubbed, not just the trace.
 *   - console breadcrumbs: dropped. Server logs are free text -- a Prisma
 *     error can quote query values, and development logs the reset link.
 *
 * Kept: stack traces, the route, status codes, tags, and the pseudonymous user
 * id -- enough to find and fix the bug, not enough to learn anyone's income.
 */

const KEEP_HEADERS = new Set(["user-agent", "content-type", "accept", "referer", "next-action"]);

/** Span attributes are `http.request.header.<name>` with dashes as underscores. */
const HEADER_ATTRIBUTE = "http.request.header.";
const KEEP_HEADER_ATTRIBUTES = new Set(["user_agent", "content_type", "accept"]);
const DROP_ATTRIBUTES = new Set(["url.query", "http.query"]);

/** Path segments or params that carry a single-use credential. */
const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  [/(\/reset-password\/)[^/?#\s]+/gi, "$1[redacted]"],
  [/(\/delete-user\/callback)[^\s]*/gi, "$1[redacted]"],
  [/([?&](?:token|code|callbackURL|q)=)[^&#\s]*/gi, "$1[redacted]"],
];

export function scrubUrl(url: string): string {
  let out = url;
  for (const [pattern, replacement] of TOKEN_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** Scrub URL-shaped secrets from every string in a context, at any depth. */
function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubUrl(value);
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubDeep(v, depth + 1)]),
  );
}

function scrubAttributes(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (DROP_ATTRIBUTES.has(key)) continue;
    if (key.startsWith(HEADER_ATTRIBUTE) && !KEEP_HEADER_ATTRIBUTES.has(key.slice(HEADER_ATTRIBUTE.length))) {
      continue;
    }
    out[key] = typeof value === "string" ? scrubUrl(value) : value;
  }
  return out;
}

/** Structural subset of a Sentry event -- keeps this file free of SDK imports. */
export interface ScrubbableEvent {
  transaction?: string;
  contexts?: { trace?: { data?: Record<string, unknown> } } & Record<string, unknown>;
  spans?: Array<{ description?: string; data?: Record<string, unknown> }>;
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    query_string?: unknown;
    env?: unknown;
  };
  user?: { id?: string | number; [key: string]: unknown };
  breadcrumbs?: Array<{ category?: string; message?: string; data?: Record<string, unknown> }>;
}

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  if (event.contexts) {
    for (const [name, context] of Object.entries(event.contexts)) {
      if (name === "trace") continue;
      (event.contexts as Record<string, unknown>)[name] = scrubDeep(context);
    }
    if (event.contexts.trace?.data) event.contexts.trace.data = scrubAttributes(event.contexts.trace.data);
  }
  if (event.spans) {
    for (const span of event.spans) {
      if (span.description) span.description = scrubUrl(span.description);
      if (span.data) span.data = scrubAttributes(span.data);
    }
  }

  if (event.request) {
    const r = event.request;
    delete r.data;
    delete r.cookies;
    delete r.query_string;
    delete r.env;
    if (r.url) r.url = scrubUrl(r.url.split("?")[0] ?? r.url);
    if (r.headers) {
      // Header names arrive in any case ("Referer", "referer"), so match on
      // the lowercased name and scrub every kept value, not just one key.
      r.headers = Object.fromEntries(
        Object.entries(r.headers)
          .filter(([k]) => KEEP_HEADERS.has(k.toLowerCase()))
          .map(([k, v]) => [k, scrubUrl(String(v))]),
      );
    }
  }

  if (event.user) {
    event.user = event.user.id !== undefined ? { id: event.user.id } : {};
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter((crumb) => crumb.category !== "console");
    for (const crumb of event.breadcrumbs) {
      if (crumb.message) crumb.message = scrubUrl(crumb.message);
      if (crumb.data) {
        const { url, from, to, method, status_code } = crumb.data as Record<string, unknown>;
        crumb.data = {
          ...(typeof url === "string" ? { url: scrubUrl(url) } : {}),
          ...(typeof from === "string" ? { from: scrubUrl(from) } : {}),
          ...(typeof to === "string" ? { to: scrubUrl(to) } : {}),
          ...(method !== undefined ? { method } : {}),
          ...(status_code !== undefined ? { status_code } : {}),
        };
      }
    }
  }

  return event;
}
