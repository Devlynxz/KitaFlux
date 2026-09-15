import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  cspHeaderName,
  cspMode,
  generateNonce,
  sentryConnectSource,
} from "../csp";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values] as [string, string[]];
    }),
  );
}

describe("buildContentSecurityPolicy", () => {
  const prod = directives(buildContentSecurityPolicy({ nonce: "abc123==", isDev: false }));
  const dev = directives(buildContentSecurityPolicy({ nonce: "abc123==", isDev: true }));

  it("only runs scripts that carry this response's nonce", () => {
    expect(prod.get("script-src")).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
    expect(prod.get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("allows eval only in development", () => {
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
  });

  it("keeps a nonce out of style-src, where it would disable inline style attributes", () => {
    expect(prod.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("locks down framing, plugins, base and form targets", () => {
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("base-uri")).toEqual(["'self'"]);
    expect(prod.get("form-action")).toEqual(["'self'"]);
    expect(prod.get("connect-src")).toEqual(["'self'"]);
  });

  it("upgrades insecure requests in production only", () => {
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("sentryConnectSource", () => {
  it("adds nothing for a SaaS DSN, which the SDK tunnels through /monitoring", () => {
    expect(sentryConnectSource("https://abc@o123456.ingest.sentry.io/789")).toBeNull();
    expect(sentryConnectSource("https://abc@o123456.ingest.de.sentry.io/789")).toBeNull();
  });

  it("adds exactly the origin of a self-hosted DSN, which the SDK posts to directly", () => {
    expect(sentryConnectSource("https://abc@sentry.example.com/12")).toBe("https://sentry.example.com");
    expect(sentryConnectSource("http://abc@localhost:9000/1")).toBe("http://localhost:9000");
  });

  it("adds nothing without a usable DSN", () => {
    expect(sentryConnectSource(undefined)).toBeNull();
    expect(sentryConnectSource("")).toBeNull();
    expect(sentryConnectSource("not a url")).toBeNull();
    expect(sentryConnectSource("javascript://abc@x/1")).toBeNull();
  });

  it("is reflected in connect-src", () => {
    const selfHosted = directives(
      buildContentSecurityPolicy({ nonce: "n", isDev: false, sentryDsn: "https://k@sentry.example.com/1" }),
    );
    expect(selfHosted.get("connect-src")).toEqual(["'self'", "https://sentry.example.com"]);
    const saas = directives(
      buildContentSecurityPolicy({ nonce: "n", isDev: false, sentryDsn: "https://k@o1.ingest.sentry.io/1" }),
    );
    expect(saas.get("connect-src")).toEqual(["'self'"]);
  });
});

describe("cspMode", () => {
  it("enforces unless explicitly set to report-only", () => {
    expect(cspMode("report-only")).toBe("report-only");
    for (const v of [undefined, "", "enforce", "REPORT-ONLY", "reportonly", "off"]) {
      expect(cspMode(v)).toBe("enforce");
    }
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
  });
});

describe("generateNonce", () => {
  it("is 128 bits of base64 and never repeats", () => {
    const nonces = new Set(Array.from({ length: 500 }, generateNonce));
    expect(nonces.size).toBe(500);
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
