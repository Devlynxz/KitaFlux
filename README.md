# KitaFlux

**Global income. Clear local numbers.**

An invoicing and FX tracker for Filipino freelancers who bill international
clients. Invoice in USD, record what actually reached the bank in pesos after
platform fees and forex, and keep records that still reconcile at BIR filing
time.

---

## The problem it solves

A spreadsheet can hold the numbers. It cannot tell you what an invoice was worth
in pesos on a date in the past — and it will quietly recalculate that answer
every time you open it.

One payment is really three different numbers:

| | |
|---|---|
| You invoiced | `$1,200.00` |
| Wise sent, after a $14.40 fee | `$1,185.60` |
| Landed in your bank, at 57.85 on 5 Mar | `₱68,586.96` |

KitaFlux stores all three, plus the rate that produced them, so a report re-run
in December returns exactly what it returned in March.

## Brand

One mark across every surface, from `KitaFlux-assets/`. Each file is used at the
size it was drawn for:

| Asset | Size | Used for |
|---|---|---|
| `favicon-16.png` / `favicon-32.png` | 16², 32² | Browser tab and bookmarks |
| `web-logo.png` | 200² | App header, apple-touch-icon, PWA 192, **invoice PDF** |
| `social-avatar.png` | 400² | Social profiles, PWA 512 |
| `og-image.png` | 1200×630 | Open Graph and Twitter card |
| `email-header.png` | 600×200 | Invoice and reminder email header |
| `presentation-logo.png` | 1024×768 | Decks and docs — not referenced by the app |

The wordmark is **live text, not artwork**: it stays crisp at any size, follows
the theme's ink colour, is selectable and readable to assistive tech, and needs
no separate light/dark variant. It is set in **Plus Jakarta Sans 800** with
size-dependent negative tracking — a display face deliberately distinct from the
interface face, because a wordmark set in the interface font reads as a heading rather
than a logo. `components/brand/logo.tsx` has the reasoning and three size
variants (`sm` sidebar, `md` default, `lg` hero).

The PDF embeds the mark as a data URI (`server/pdf/logo-data.ts`, regenerate
with `node scripts/inline-logo.mjs`) so rendering never depends on the
filesystem or the network inside a serverless function.

Colour is taken from the mark: money travels the blue-cyan ribbon and lands on
the gold peso coin, so foreign-currency figures tint cyan (`flow-ink`) and PHP
figures tint gold (`php-ink`). Headings use Plus Jakarta Sans; the interface
and all figures stay on IBM Plex Sans and Plex Mono.

`kitaflux-brand/` holds the **authoritative colour tokens and type rules**
(`colors.json`, `brand-guidelines.md`) that drive `globals.css`. Its SVG logos
are the retired geometric mark and are not referenced by the app.


## Stack

- **Next.js 16** (App Router) + TypeScript, **Tailwind v4**
- **PostgreSQL** + **Prisma 7** (`prisma-client` generator, `@prisma/adapter-pg`)
- **Better Auth** — email/password, session cookies
- **decimal.js** for all money math. No `Number`, ever.
- **@react-pdf/renderer** for invoice PDFs
- **Resend** for email, **Inngest** for scheduled reminders
- **Sentry** for error monitoring (optional; off without a DSN)
- **Vitest** for tests

## Getting started

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` is required: `better-auth` declares a `peerOptional` on
> `vitest` `^2 || ^3 || ^4`, which npm's strict resolver rejects alongside other
> pins. It affects dev tooling only.

Copy the environment file and fill in the two required values:

```bash
cp .env.example .env
```

- `DATABASE_URL` — any Postgres 14+ instance (local, Neon, Supabase).
- `BETTER_AUTH_SECRET` — generate with `openssl rand -base64 32`.

Everything else is optional; the app runs without email, Inngest, Sentry or an
FX API key. Then:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

### Demo credentials

The seed creates two working accounts. Both use the password
**`kitaflux-demo-2026`**:

| Email | Contains |
|---|---|
| `maya@example.com` | 3 issued invoices, 1 draft, 2 payments, 2 clients |
| `other@example.com` | Nothing — exists so a cross-user data leak would be obvious |

Accounts are created through Better Auth's own sign-up API, so these behave
exactly like a real user's. The password is only ever seeded into a local or
throwaway database; never run `db:seed` against production.

You can also just sign up fresh at `/sign-up` for an empty account.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Full test suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Prisma Studio |

## Architecture

```
src/
  app/
    (auth)/            sign-in, sign-up — redirects away if already signed in
    (app)/             everything behind auth; the layout is the single gate
      invoices/[id]/pdf/route.ts     streams the PDF
      reports/export/route.ts        streams the quarterly CSV
      settings/export/route.ts       downloads the account data export
    api/auth/[...all]  Better Auth handler
    api/inngest        scheduled job endpoint
  components/
    ui/                design-system primitives (Button, Field, Card, Table…)
    app/               feature components (forms, actions, badges)
    brand/             the KitaFlux lockup (mark + typeset wordmark)
  lib/                 pure, dependency-free domain logic — fully unit tested
    money.ts           Decimal arithmetic and rounding rules
    fx.ts              the three-number conversion
    invoice-status.ts  the state machine
    dates.ts           UTC calendar dates and BIR quarters
    validation.ts      zod schemas
    sentry-scrub.ts    what an error report may carry off the machine
  server/
    data/              user-scoped data access — the only place Prisma is queried
    actions/           server actions; validate, delegate, revalidate
    inngest/           scheduled jobs
    pdf/               invoice document
    invoice-number.ts  gapless per-user numbering
    session.ts         requireUser / requireUserId
  proxy.ts             per-request Content-Security-Policy (nonce)
  instrumentation*.ts  Sentry registration (server and browser)
  sentry.*.ts          Sentry options, shared across runtimes
```

### The parts worth reading

Each of these has a comment block explaining *why* it is built the way it is.

**Money** (`lib/money.ts`) — every amount is a `Decimal`. Rounding is
`ROUND_HALF_UP` (not banker's rounding — Philippine invoicing rounds half away
from zero) and happens at exactly four points, documented in the file. Lines are
rounded then summed, so a total always equals the visible column.

**FX timing** (`lib/fx.ts`, `server/fx-service.ts`) — the rate that applies is
the rate on the date the money landed. Rates are cached by date and never
updated, so historical records cannot shift. Fees are deducted in the source
currency *before* conversion, matching how Wise, Payoneer and PayPal actually
work; the two orderings genuinely disagree, and there is a test proving it.

**Invoice numbering** (`server/invoice-number.ts`) — sequential per user,
gapless, and safe under concurrency. A Postgres `SEQUENCE` is concurrency-safe
but *not* gapless (a rollback burns the value permanently), so the counter lives
on the user row and is taken under `SELECT … FOR UPDATE` inside the same
transaction as the invoice write. A rollback therefore returns the number to the
pool. Numbers are minted on send, not on create, so abandoned drafts cost
nothing.

**Status** (`lib/invoice-status.ts`) — one transition table, and `status` is
never assigned anywhere else. There is deliberately no `PARTIALLY_PAID` state:
partial payment is a property of the money, not the document.

**Data isolation** (`server/data/*`) — every function takes `userId` first and
puts it in the where clause. Single-row reads use `findFirst({ where: { id,
userId } })` rather than a fetch-then-check, so there is no branch to forget.
Writes use `updateMany`/`deleteMany` for the same reason. `src/server/__tests__/
isolation.test.ts` asserts this across every read and write path.

**Error monitoring** (`sentry.shared.ts`, `lib/sentry-scrub.ts`) — server
errors, browser errors, error-boundary crashes and unexpected server action
failures go to Sentry, with light tracing (10% of requests in production). An
error report must never carry a user's income records, so every event is
scrubbed before it leaves the process: request bodies, cookies, query strings
and all but a few request headers are removed; single-use tokens are cut out of
every URL, including the `http.target` span attributes and Next.js request
contexts where the SDK records them separately; console breadcrumbs are dropped;
and the user is reduced to an opaque id. There is no session replay and no local
variable capture. Browser reports go through a `/monitoring` tunnel on the app's
own origin, so the CSP stays at `connect-src 'self'` — except for a self-hosted
Sentry DSN, which the SDK does not tunnel, whose origin is added to the policy.

**Account export and deletion** (`server/data/account.ts`, `server/auth.ts`) —
Settings → Your data downloads everything the app holds about the user as one
JSON file (`kitaflux-export/1`): profile, clients, invoices with line items, and
payments with the rate each landed at. Amounts are decimal strings, never JSON
numbers. The password hash, sessions, reset tokens and IP addresses are left out.
Deleting an account always requires the current password: Better Auth on its own
deletes without one when the session is under a day old, and a `before` hook
refuses that path (and the emailed-token path) outright. Deletion is permanent
and immediate — the user row cascades to clients, invoices, line items,
payments, sessions and credentials, and leftover reset tokens are removed — so
the UI puts the export directly above it, since invoices are records a
freelancer may need to keep after filing.

## Tests

```bash
npm test
```

183 tests. The pure-logic suites (money, FX, dates, state machine, CSV, pagination, CSP, client IP, Sentry scrubbing) need nothing.
The database-backed suites need `DATABASE_URL` and **skip themselves without
it** — so CI must set it, or isolation goes unverified.

| Suite | Covers |
|---|---|
| `lib/__tests__/money` | rounding rules, precision, formatting |
| `lib/__tests__/fx` | the three amounts, fee ordering, guard rails |
| `lib/__tests__/invoice-status` | every legal and illegal transition |
| `lib/__tests__/dates` | UTC dates, quarters, timezone edges |
| `lib/__tests__/csv` | CSV quoting, spreadsheet formula neutralisation |
| `lib/__tests__/pagination` | page parsing, clamping, page-number window |
| `lib/__tests__/sentry-scrub` | tokens, bodies, cookies, headers and span attributes stripped from error reports |
| `server/__tests__/isolation` | cross-tenant access, every path |
| `server/__tests__/invoice-number` | 20-way concurrent race, rollback gaplessness, double-clicked Send |
| `server/__tests__/csp` | nonce + strict-dynamic script policy, dev/prod differences, report-only switch |
| `server/__tests__/client-ip` | spoofed forwarded chains resolve to the real client, per host config |
| `server/__tests__/pagination` | no row repeated or lost across pages when sort keys tie; totals span every page |
| `server/__tests__/account` | export holds every owned record and no credentials; deletion cascades every row |
| `server/__tests__/invoice-lifecycle` | draft → send → part-pay → pay → void, PDF render, currency and date guards |

## Deploying

1. Provision Postgres (Neon) and set `DATABASE_URL`.
2. Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the
   real domain.
3. **Client IP for rate limiting.** Nothing to do on Vercel. Behind Cloudflare
   or another edge that sets its own header, set `CLIENT_IP_HEADER`; behind your
   own nginx or load balancer, set `TRUSTED_PROXIES` to their addresses. Left
   unset elsewhere, the app logs a warning at startup: sign-in limits may be
   bypassable or shared across every user.
4. **CSP** is enforced by `src/proxy.ts` with a per-request nonce. If a
   deployment ever shows blocked scripts, `CSP_MODE=report-only` downgrades it
   to warnings while you fix the cause.
5. `npm run db:deploy` on release.
6. **Email:** verify a domain in Resend, set `RESEND_API_KEY` and `EMAIL_FROM`.
   Without these the app runs normally and sending is reported as skipped rather
   than failing — except **password reset**, which cannot deliver its link
   without email. In development the link is printed to the server log instead;
   in production nothing is logged, so configure Resend before launch.
7. **Reminders:** connect the Inngest app to `/api/inngest` and set
   `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`. Two daily jobs: a status sweep at
   01:00 UTC and reminder emails at 01:15 UTC (09:00 and 09:15 in Manila).
8. **Error monitoring:** set `NEXT_PUBLIC_SENTRY_DSN` (and optionally
   `NEXT_PUBLIC_SENTRY_ENVIRONMENT`). Without it Sentry stays disabled and nothing
   is sent. For readable stack traces set `SENTRY_ORG`, `SENTRY_PROJECT` and
   `SENTRY_AUTH_TOKEN` at build time; without the token the source map upload is
   skipped rather than failing the build. `SENTRY_DEBUG=1` prints SDK diagnostics
   to the server log when events are not arriving.
9. **FX:** works with no key via Frankfurter (ECB rates). Set
   `FX_PROVIDER=exchangerate.host` and `EXCHANGERATE_HOST_ACCESS_KEY` to switch.

## Scope

Shipped: auth (sign-up, sign-in, password reset, change password, sign out
other devices, database-backed rate limiting), clients, invoices, PDF, email,
payments with FX and fee capture, dashboard, scheduled reminders, quarterly
summary and CSV export, account data export and deletion, and error monitoring.

Not built, deliberately: recurring invoices, Stripe payment links. Both are v2 in
the spec, gated behind having real users.

Out of scope by design: filing taxes on the user's behalf, giving tax advice, and
double-entry bookkeeping. The reports page says so on the page.
