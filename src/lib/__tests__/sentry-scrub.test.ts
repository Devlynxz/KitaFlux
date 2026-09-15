import { describe, expect, it } from "vitest";

import { scrubEvent, scrubUrl } from "../sentry-scrub";

describe("scrubUrl", () => {
  it("cuts single-use tokens out of reset and deletion links", () => {
    expect(scrubUrl("https://app.test/api/auth/reset-password/Nnq9n3eFPyol?callbackURL=%2Freset")).toBe(
      "https://app.test/api/auth/reset-password/[redacted]?callbackURL=[redacted]",
    );
    expect(scrubUrl("/reset-password?token=abc123&x=1")).toBe("/reset-password?token=[redacted]&x=1");
    expect(scrubUrl("/api/auth/delete-user/callback?token=zzz")).toBe("/api/auth/delete-user/callback[redacted]");
  });

  it("removes search terms, which are client names", () => {
    expect(scrubUrl("/invoices?status=SENT&q=Acme%20Corp")).toBe("/invoices?status=SENT&q=[redacted]");
  });

  it("leaves ordinary URLs alone", () => {
    expect(scrubUrl("/invoices/cmu2kz/pdf")).toBe("/invoices/cmu2kz/pdf");
  });
});

describe("scrubEvent", () => {
  it("strips bodies, cookies, query strings and sensitive headers from the request", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.test/settings?tab=security",
        data: { tin: "123-456-789-000", paymentDetails: "Wise 0000", currentPassword: "hunter2hunter2" },
        cookies: { "__Secure-kitaflux.session_token": "secret" },
        query_string: "tab=security",
        env: { REMOTE_ADDR: "203.0.113.9" },
        headers: {
          Cookie: "kitaflux.session_token=secret",
          Authorization: "Bearer x",
          "X-Forwarded-For": "203.0.113.9",
          "User-Agent": "Mozilla/5.0",
          Referer: "https://app.test/reset-password?token=abc",
        },
      },
    });

    const serialized = JSON.stringify(event);
    for (const secret of ["123-456-789-000", "Wise 0000", "hunter2", "secret", "Bearer", "203.0.113.9"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(event.request?.url).toBe("https://app.test/settings");
    expect(event.request?.headers).toEqual({
      "User-Agent": "Mozilla/5.0",
      Referer: "https://app.test/reset-password?token=[redacted]",
    });
  });

  it("reduces the user to an opaque id", () => {
    expect(scrubEvent({ user: { id: "u_1", email: "maya@example.com", ip_address: "1.2.3.4" } }).user).toEqual({
      id: "u_1",
    });
    expect(scrubEvent({ user: { email: "maya@example.com" } }).user).toEqual({});
  });

  it("scrubs tracing attributes, where the SDK records the raw query string and headers", () => {
    // Shape taken from a real transaction captured locally: http.target carried
    // a reset token and a search term, and every request header was an attribute.
    const attrs = () => ({
      "http.method": "GET",
      "http.target": "/api/qa-throw?token=SECRET-RESET-TOKEN-123&q=Acme",
      "url.full": "http://localhost:3000/reset-password?token=BROWSER-TOKEN-456",
      "url.query": "?token=SECRET-RESET-TOKEN-123",
      "http.request.header.cookie.kitaflux.session_token": "[Filtered]",
      "http.request.header.x_forwarded_for": "203.0.113.99",
      "http.request.header.user_agent": "curl/8.18.0",
      "http.response.status_code": 500,
    });
    const event = scrubEvent({
      transaction: "GET /reset-password?token=BROWSER-TOKEN-456",
      contexts: { trace: { data: attrs() } },
      spans: [{ description: "GET /api/qa-throw?token=SECRET-RESET-TOKEN-123", data: attrs() }],
    });

    const serialized = JSON.stringify(event);
    for (const leak of ["SECRET-RESET-TOKEN-123", "BROWSER-TOKEN-456", "Acme", "203.0.113.99", "session_token"]) {
      expect(serialized).not.toContain(leak);
    }
    expect(event.contexts?.trace?.data).toEqual({
      "http.method": "GET",
      "http.target": "/api/qa-throw?token=[redacted]&q=[redacted]",
      "url.full": "http://localhost:3000/reset-password?token=[redacted]",
      "http.request.header.user_agent": "curl/8.18.0",
      "http.response.status_code": 500,
    });
  });

  it("scrubs every context, not only the trace", () => {
    // contexts.nextjs.request_path carried the full query string in a real event.
    const event = scrubEvent({
      contexts: {
        nextjs: { request_path: "/api/qa-throw?token=SECRET-RESET-TOKEN-123&q=Acme", router_kind: "App Router" },
        nested: { deeper: [{ url: "/reset-password?token=abc" }] },
      },
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("SECRET-RESET-TOKEN-123");
    expect(serialized).not.toContain("Acme");
    expect(serialized).not.toContain("token=abc");
    expect((event.contexts as Record<string, { router_kind?: string }>).nextjs.router_kind).toBe("App Router");
  });

  it("drops console breadcrumbs, which are free text", () => {
    const event = scrubEvent({
      breadcrumbs: [
        { category: "console", message: "[kitaflux] password reset link for maya@example.com: https://x/api/auth/reset-password/tok" },
        { category: "navigation", data: { from: "/a", to: "/b" } },
      ],
    });
    expect(event.breadcrumbs).toHaveLength(1);
    expect(JSON.stringify(event)).not.toContain("maya@example.com");
  });

  it("keeps only the shape of fetch breadcrumbs", () => {
    const event = scrubEvent({
      breadcrumbs: [
        {
          message: "POST /api/auth/reset-password/tok123",
          data: {
            url: "/api/auth/sign-in/email",
            method: "POST",
            status_code: 401,
            request_body: '{"password":"hunter2hunter2"}',
            response_body_size: 44,
          },
        },
        { data: { from: "/reset-password?token=abc", to: "/sign-in?reset=1" } },
      ],
    });
    expect(event.breadcrumbs?.[0]).toEqual({
      message: "POST /api/auth/reset-password/[redacted]",
      data: { url: "/api/auth/sign-in/email", method: "POST", status_code: 401 },
    });
    expect(event.breadcrumbs?.[1].data).toEqual({ from: "/reset-password?token=[redacted]", to: "/sign-in?reset=1" });
  });
});
