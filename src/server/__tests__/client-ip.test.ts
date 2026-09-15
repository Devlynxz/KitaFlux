import { describe, expect, it } from "vitest";

// Better Auth's own resolver, so these tests prove what the rate limiter will
// actually key on -- not what we assume it does with our config.
import { getIP, getIPFromHeader } from "@better-auth/core/utils/ip";

import { clientIpConfig, isValidProxyEntry } from "../client-ip";

function resolve(env: Record<string, string>, headers: Record<string, string>) {
  const { config } = clientIpConfig(env);
  return getIP(new Headers(headers), { advanced: { ipAddress: config } });
}

describe("clientIpConfig", () => {
  it("uses Vercel's unspoofable header automatically on Vercel", () => {
    expect(clientIpConfig({ VERCEL: "1" }).config.ipAddressHeaders).toEqual([
      "x-vercel-forwarded-for",
      "x-forwarded-for",
    ]);
    expect(
      resolve({ VERCEL: "1" }, { "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "6.6.6.6" }),
    ).toBe("203.0.113.9");
  });

  it("uses an explicit edge header, and ignores a forged X-Forwarded-For", () => {
    const env = { CLIENT_IP_HEADER: "CF-Connecting-IP" };
    expect(clientIpConfig(env).config.ipAddressHeaders).toEqual(["cf-connecting-ip"]);
    expect(resolve(env, { "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "6.6.6.6" })).toBe(
      "198.51.100.4",
    );
  });

  it("walks a proxy chain past trusted hops to the real client", () => {
    const env = { TRUSTED_PROXIES: "10.0.0.0/8, 192.0.2.10" };
    // Client-supplied spoof on the left, then the real client, then our proxies.
    expect(
      resolve(env, { "x-forwarded-for": "6.6.6.6, 203.0.113.9, 192.0.2.10, 10.1.2.3" }),
    ).toBe("203.0.113.9");
  });

  it("shows why proxies must be configured: a chain resolves to no IP without them", () => {
    expect(getIPFromHeader("203.0.113.9, 10.1.2.3", {})).toBeNull();
    expect(
      getIPFromHeader("203.0.113.9, 10.1.2.3", { trustedProxies: ["10.0.0.0/8"] }),
    ).toBe("203.0.113.9");
  });

  it("refuses a malformed proxy entry instead of silently dropping it", () => {
    expect(() => clientIpConfig({ TRUSTED_PROXIES: "10.0.0.0/8, 10.0.0.300" })).toThrow(/10\.0\.0\.300/);
    expect(() => clientIpConfig({ TRUSTED_PROXIES: "10.0.0.0/33" })).toThrow();
    expect(() => clientIpConfig({ CLIENT_IP_HEADER: "x forwarded" })).toThrow(/header name/);
  });

  it("warns in production when nothing is configured, and only then", () => {
    expect(clientIpConfig({ NODE_ENV: "production" }).warning).toMatch(/TRUSTED_PROXIES/);
    expect(clientIpConfig({ NODE_ENV: "production", VERCEL: "1" }).warning).toBeNull();
    expect(clientIpConfig({ NODE_ENV: "production", TRUSTED_PROXIES: "10.0.0.1" }).warning).toBeNull();
    expect(clientIpConfig({ NODE_ENV: "development" }).warning).toBeNull();
    expect(clientIpConfig({ NODE_ENV: "production" }).config).toEqual({});
  });
});

describe("isValidProxyEntry", () => {
  it("accepts addresses and ranges in both families", () => {
    for (const ok of ["192.0.2.10", "10.0.0.0/8", "0.0.0.0/0", "2001:db8::1", "2001:db8::/32"]) {
      expect(isValidProxyEntry(ok)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const bad of ["", "localhost", "10.0.0/8", "10.0.0.0/", "10.0.0.0/-1", "2001:db8::/129", "10.0.0.0/8/8"]) {
      expect(isValidProxyEntry(bad)).toBe(false);
    }
  });
});
