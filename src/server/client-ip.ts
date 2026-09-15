import { isIP } from "node:net";

/**
 * Where the client's IP comes from, for auth rate limiting.
 *
 * Rate limits are keyed by IP, so the IP must be one a client cannot choose.
 * What makes a header trustworthy is entirely a property of the host, which is
 * why this is configuration rather than code:
 *
 *   Vercel      overwrites X-Forwarded-For so it cannot be spoofed, and also
 *               sets x-vercel-forwarded-for, which survives another proxy
 *               sitting in front. Detected automatically (VERCEL=1).
 *
 *   A single edge that sets its own header (Cloudflare: cf-connecting-ip,
 *   Fly: fly-client-ip) -- set CLIENT_IP_HEADER to that header.
 *
 *   Your own reverse proxies appending to X-Forwarded-For (nginx, a load
 *   balancer) -- set TRUSTED_PROXIES to their addresses or CIDR ranges. The
 *   chain is then read right to left, skipping those hops, and the first
 *   address that is not a proxy is the client.
 *
 * Getting this wrong fails in one of two opposite ways, which is why an unset
 * configuration in production logs a warning:
 *
 *   - Better Auth's default trusts X-Forwarded-For only when it holds a single
 *     address. On a host that passes a client's own header through, an
 *     attacker sends a different fake address on every attempt and is never
 *     limited.
 *   - On a host that appends to the header, every request arrives with a chain,
 *     no IP resolves, and all of them fall into one shared bucket per path --
 *     so five wrong passwords from anyone locks sign-in for everyone.
 *
 * A malformed TRUSTED_PROXIES entry throws at startup. Better Auth would drop
 * it silently, and a proxy list with a typo in it degrades into the second
 * failure above without a single error.
 */

export interface ClientIpConfig {
  ipAddressHeaders?: string[];
  trustedProxies?: string[];
}

export function isValidProxyEntry(entry: string): boolean {
  const slash = entry.lastIndexOf("/");
  const address = slash === -1 ? entry : entry.slice(0, slash);
  const family = isIP(address);
  if (family === 0) return false;
  if (slash === -1) return true;

  const prefix = entry.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function clientIpConfig(env: Record<string, string | undefined>): {
  config: ClientIpConfig;
  warning: string | null;
} {
  const headers = list(env.CLIENT_IP_HEADER).map((h) => h.toLowerCase());
  const proxies = list(env.TRUSTED_PROXIES);

  const invalid = proxies.filter((p) => !isValidProxyEntry(p));
  if (invalid.length > 0) {
    throw new Error(
      `TRUSTED_PROXIES contains entries that are not an IP address or CIDR range: ${invalid.join(", ")}`,
    );
  }
  const badHeader = headers.find((h) => !/^[a-z0-9-]+$/.test(h));
  if (badHeader) {
    throw new Error(`CLIENT_IP_HEADER is not a valid header name: ${badHeader}`);
  }

  const config: ClientIpConfig = {};
  if (headers.length > 0) config.ipAddressHeaders = headers;
  else if (env.VERCEL === "1") config.ipAddressHeaders = ["x-vercel-forwarded-for", "x-forwarded-for"];
  if (proxies.length > 0) config.trustedProxies = proxies;

  const configured = headers.length > 0 || proxies.length > 0 || env.VERCEL === "1";
  const warning =
    !configured && env.NODE_ENV === "production"
      ? "[kitaflux] neither CLIENT_IP_HEADER nor TRUSTED_PROXIES is set and this is not Vercel. " +
        "Auth rate limiting may trust a spoofable X-Forwarded-For or share one bucket across all users. " +
        "See src/server/client-ip.ts."
      : null;

  return { config, warning };
}
