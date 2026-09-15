import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";

import { clientIpConfig } from "./client-ip";
import { prisma } from "./db";
import { sendPasswordResetEmail } from "./email";

const clientIp = clientIpConfig(process.env);
if (clientIp.warning) console.warn(clientIp.warning);

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Email verification is deliberately off for v1: the spec's definition of
    // done is 20 real users, and a verification wall before anyone has seen the
    // product costs more signups than it prevents fraud. Turn on with Resend
    // configured when that trade flips.
    requireEmailVerification: false,

    // The link is single-use (the verification row is deleted when it is
    // redeemed) and short-lived. Every existing session is revoked on reset:
    // "I think someone is in my account" is the most common reason to reset,
    // and leaving that someone signed in would defeat the point.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Deferred with after() rather than awaited: the endpoint answers
      // identically whether or not the account exists, and waiting on Resend
      // would reintroduce that difference as a timing oracle. after() (not a
      // bare un-awaited promise) keeps a serverless function alive until the
      // send completes.
      after(() => sendPasswordResetEmail(user.email, url));
    },
  },

  // On in every environment except the test runner. Better Auth enables it
  // only in production by default, with in-memory counters -- which on a
  // serverless host means one counter per instance, i.e. no real limit.
  // Server-side `auth.api.*` calls (the seed, the tests) bypass the limiter.
  rateLimit: {
    enabled: process.env.NODE_ENV !== "test",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60 * 10, max: 5 },
      "/request-password-reset": { window: 60 * 15, max: 3 },
      "/reset-password": { window: 60 * 15, max: 5 },
      "/change-password": { window: 60 * 15, max: 5 },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  user: {
    // Extra profile columns live on the same `user` row rather than a side
    // table -- they are 1:1 with the account and read on nearly every page.
    //
    // All `input: false`. Better Auth exposes /update-user (and accepts extra
    // keys on /sign-up), and any field marked as input there is written with no
    // validation at all -- a request could set homeCurrency to "BTC" or an
    // arbitrary-length prefix. The only writer is updateSettingsAction, which
    // runs the zod schema.
    additionalFields: {
      businessName: { type: "string", required: false, input: false },
      tin: { type: "string", required: false, input: false },
      addressLine: { type: "string", required: false, input: false },
      city: { type: "string", required: false, input: false },
      country: { type: "string", required: false, input: false, defaultValue: "PH" },
      defaultCurrency: { type: "string", required: false, input: false, defaultValue: "USD" },
      homeCurrency: { type: "string", required: false, input: false, defaultValue: "PHP" },
      paymentDetails: { type: "string", required: false, input: false },
      invoicePrefix: { type: "string", required: false, input: false, defaultValue: "INV" },
      invoiceNotes: { type: "string", required: false, input: false },
      // The invoice counter. See src/server/invoice-number.ts.
      invoiceSeq: { type: "number", required: false, input: false, defaultValue: 0 },
    },
  },

  advanced: {
    cookiePrefix: "kitaflux",
    // Which request header holds a client IP that cannot be forged, per host.
    // See src/server/client-ip.ts.
    ipAddress: clientIp.config,
  },

  // Must stay last.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
