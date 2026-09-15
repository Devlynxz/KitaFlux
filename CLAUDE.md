# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

KitaFlux is an invoicing + FX tracker for Filipino freelancers billing international
clients. `README.md` is unusually complete — read it before a first substantial change.
Nearly every non-obvious module opens with a comment block explaining *why* it is built
that way; read that block before editing the file.

## Commands

```bash
npm install --legacy-peer-deps   # required: better-auth's peerOptional on vitest breaks npm's strict resolver
npm run dev
npm run typecheck                # tsc --noEmit
npm run lint                     # eslint
npm test                         # vitest run
npm run build
```

Run a single test file or test:

```bash
npx vitest run src/lib/__tests__/money.test.ts
npx vitest run -t "rounds half away from zero"
```

Database:

```bash
npm run db:migrate   # create + apply a migration (dev)
npm run db:deploy    # apply migrations (CI/production)
npm run db:seed      # demo data; never against production
npm run db:studio
```

CI (`.github/workflows/ci.yml`) runs, in order: `db:deploy`, `typecheck`, `lint`, `test`,
`build` against a real Postgres 18 service. Match that order locally before claiming done.

### Test environment

`vitest.config.mts` sets `fileParallelism: false` (DB suites create and drop real rows)
and aliases `server-only` to `src/test/server-only-stub.ts` so `server/data/*` is
importable from tests.

179 tests total: 127 pure-logic, 52 behind a database. The four DB-backed suites
(`server/__tests__/isolation`, `invoice-number`, `invoice-lifecycle`, `pagination`) gate themselves on
`const describeDb = DATABASE_URL ? describe : describe.skip`. **That guard tests only
whether the env var is set, never whether the database is reachable**, which gives two
distinct failure modes:

- `DATABASE_URL` unset → 52 tests skip cleanly, suite is green. A green run in this state
  has *not* verified tenant isolation.
- `DATABASE_URL` set but the database is unreachable or credentials are wrong → the
  `describeDb` blocks run, `beforeAll` throws, and those files **fail** while their
  tests are still reported as `skipped`. Read the *file* count, not the test count:
  `Test Files 4 failed | 9 passed` with `Tests 127 passed | 52 skipped` means the database
  is broken, not that the tests were skipped by the guard.

Verify the database is genuinely exercised before trusting a pass.

## Architecture invariants

These are enforced by tests and comment blocks; breaking one is a regression even if it
typechecks.

**Layering is strict and one-directional:**
`app/` (pages, route handlers) → `server/actions/` → `server/data/` → `prisma`.
Pure domain logic lives in `lib/` and imports nothing from `server/`.

- **`server/data/*` is the only place Prisma is queried for user data.** Every exported
  function takes `userId` as its first parameter and puts it in the where clause. Single
  reads use `findFirst({ where: { id, userId } })`, never fetch-then-check; writes use
  `updateMany`/`deleteMany`. Adding a data function without `userId` will fail
  `server/__tests__/isolation.test.ts`. Each file starts with `import "server-only"`.
- **`server/session.ts` is the only source of a `userId`.** `requireUser()` in pages and
  layouts (redirects); `requireUserId()` in server actions and route handlers (throws
  `UnauthorizedError`). It re-reads the user row rather than trusting the cached session
  payload, wrapped in React `cache` for one lookup per request. The `(app)` route-group
  layout is the single auth gate for everything behind it.
- **Server actions** parse `FormData` with a zod schema from `lib/validation.ts`, delegate
  to `server/data/*`, then `revalidatePath`. They return `ActionState`
  (`server/actions/shared.ts`) — a discriminated union, not a throw — so field errors
  render client-side. Wrap work in `try`/`catch (error) { return toActionState(error) }`;
  put `redirect()` *outside* the try (it throws a control-flow signal). New domain errors
  whose message is safe to show a user must be added to `SAFE_ERRORS` in `shared.ts`, or
  they surface as the generic fallback.

**Money:** every amount is a `decimal.js` `Decimal`. `number` never holds an amount —
`MoneyInput` in `lib/money.ts` deliberately excludes it. Rounding is `ROUND_HALF_UP` and
happens at exactly four documented points; lines are rounded then summed. DB columns are
`Decimal(20,2)` for amounts and `Decimal(20,10)` for rates and quantities.

**FX:** `lib/fx.ts` is the pure three-number conversion (invoiced → net after fee →
home currency); fees are deducted in the source currency *before* conversion. Rates are
keyed by date, cached in `FxRate`, and **never updated** — historical reports must not
move. `server/fx-service.ts` fetches (Frankfurter by default, keyless).

**Invoice status:** the transition table in `lib/invoice-status.ts` is the only thing
allowed to set `status`. Go through `assertTransition` with an *event* (`send`,
`payment_recorded`, …), not a target state. There is no `PARTIALLY_PAID`; `OVERDUE` is
stored (the reminder job indexes it) and reconciled by the nightly sweep.

**Invoice numbers:** minted on send, not create. Gapless per-user via the `User.invoiceSeq`
counter taken under `SELECT … FOR UPDATE` in the same transaction as the invoice write —
deliberately not a Postgres `SEQUENCE`, which burns values on rollback. Covered by a
20-way concurrency test.

**Scheduled jobs** (`server/inngest/functions.ts`) are split into a side-effect-free
status sweep and the email sender, so an email outage cannot leave statuses stale.

## Conventions

- Prisma client is generated by the `prisma-client` generator into `src/generated/prisma`,
  which is **gitignored** — created by `postinstall`, and must be regenerated with
  `npm run db:generate` after any schema edit. Import types from
  `@/generated/prisma/client` and `@/generated/prisma/enums`, not `@prisma/client`.
  Never hand-edit that directory.
- `@/*` maps to `src/*`.
- Styling is Tailwind v4 with tokens defined in `@theme` in `src/app/globals.css`, derived
  from `kitaflux-brand/colors.json`. Use semantic tokens (`--color-success`, `--color-surface`),
  never a raw hex in a component; dark mode redefines only the semantic layer.
- Reach for the primitives in `components/ui/primitives.tsx` (`Card`, `Field`, `Input`,
  `MoneyInput`, `Alert`, `EmptyState`, `PageHeader`, `TableWrap`, `Th`, `Td`) and
  `components/ui/button.tsx` before writing new markup.
- The brand wordmark is live text, not artwork — see `components/brand/logo.tsx`. The PDF
  embeds the mark as a data URI (`server/pdf/logo-data.ts`, regenerate with
  `node scripts/inline-logo.mjs`) so rendering never touches the filesystem or network.
- `src/proxy.ts` sets the per-request Content-Security-Policy and does nothing else — never
  put auth checks there (a matcher change would silently skip them). Script policy is nonce +
  `'strict-dynamic'`: any inline `<script>` you add must take the nonce from
  `(await headers()).get("x-nonce")`, as the theme script in `app/layout.tsx` does, or it is
  blocked. Never add a nonce to `style-src`; it disables the `'unsafe-inline'` that React
  `style={…}` attributes rely on.
- Auth rate limiting keys on the client IP resolved by `server/client-ip.ts` from
  `CLIENT_IP_HEADER` / `TRUSTED_PROXIES` (auto on Vercel). Don't read `x-forwarded-for` directly.
- Optional integrations degrade rather than fail: without `RESEND_API_KEY`, `INNGEST_*`,
  or an FX key the app runs and reports the step as skipped. Keep that property.

## Out of scope by design

Recurring invoices and Stripe payment links are v2. Filing taxes on the user's behalf,
tax advice, and double-entry bookkeeping are permanently out of scope.
