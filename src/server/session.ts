import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { cache } from "react";

import { auth } from "./auth";
import { prisma } from "./db";

/**
 * Session access.
 *
 * `requireUser()` is the only sanctioned entry point for anything under
 * /dashboard, every server action, and every route handler that touches user
 * data. It returns a `userId` that the data layer then requires -- the two
 * halves of the isolation rule are: you cannot get a userId without a valid
 * session, and you cannot query without a userId.
 *
 * Wrapped in React's `cache` so a page that calls it in the layout, the page,
 * and three server components still resolves one session per request.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  businessName: string | null;
  tin: string | null;
  addressLine: string | null;
  city: string | null;
  country: string;
  defaultCurrency: string;
  homeCurrency: string;
  paymentDetails: string | null;
  invoicePrefix: string;
  invoiceNotes: string | null;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // disableCookieCache: the signed `session_data` cookie is otherwise trusted
  // for its whole five-minute lifetime without looking at the session table,
  // so a session revoked by sign-out, a password reset, or "sign out other
  // devices" would keep working until the cookie aged out. One indexed lookup
  // per request (the call is already React-cached) is the price of revocation
  // meaning revocation.
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session?.user?.id) return null;

  // Re-read from the database rather than trusting the session payload: the
  // session is cached for five minutes and profile edits must take effect at
  // once (an invoice rendered with a stale TIN is a filing problem).
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      businessName: true,
      tin: true,
      addressLine: true,
      city: true,
      country: true,
      defaultCurrency: true,
      homeCurrency: true,
      paymentDetails: true,
      invoicePrefix: true,
      invoiceNotes: true,
    },
  });

  // Opaque id only -- lets an error report say how many people it affected
  // without carrying an email. Scoped to this request by the SDK.
  if (user) Sentry.setUser({ id: user.id });

  return user;
});

/** Redirects to sign-in when there is no session. Use in pages and layouts. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * Throws instead of redirecting. Use in server actions and route handlers,
 * where a redirect would be swallowed or would produce a confusing response.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super("You need to be signed in to do that.");
    this.name = "UnauthorizedError";
  }
}

export async function requireUserId(): Promise<string> {
  return (await requireSessionUser()).id;
}

/**
 * The full profile, throwing rather than redirecting. For server actions that
 * need more than the id (the home currency, say). `requireUser` must not be
 * used there: its redirect is a thrown control-flow signal, and the action's
 * try/catch would swallow it into a generic "Something went wrong".
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
