# Arcway — Cross-border USDC payouts with embedded wallets

A B2B payout tool: a company logs in, adds payees by email (no crypto wallet
needed on their end), and sends USDC payouts to them from a simple status
dashboard. Built as a hackathon submission for **[ETHGlobal ETHOnline
2026](https://ethglobal.com/events/ethonline2026)** (online/async, deadline
**Sep 16, 2026**).

## Table of contents

- [What this is, and why](#what-this-is-and-why)
- [Prize tracks targeted](#prize-tracks-targeted)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting API keys](#getting-api-keys)
- [Running locally](#running-locally)
- [Dependency notes (read before editing package.json)](#dependency-notes-read-before-editing-packagejson)
- [Mock mode vs. live mode](#mock-mode-vs-live-mode)
- [Going live: wiring real Circle Arc calls](#going-live-wiring-real-circle-arc-calls)
- [Deploying to Vercel](#deploying-to-vercel)
- [Production upgrade path](#production-upgrade-path)
- [Punch list: finishing before Sep 16](#punch-list-finishing-before-sep-16)

## What this is, and why

Paying international contractors and remote employees is slow and expensive
through traditional rails, and crypto rails, while fast, usually assume the
recipient already has a wallet, seed phrase, and some familiarity with
on-chain UX. Arcway removes that requirement: a company only needs a
payee's **email address**. Behind the scenes, [Privy](https://www.privy.io)
provisions that payee a secure embedded wallet the instant they're added, and
[Circle](https://www.circle.com/arc)'s Developer-Controlled Wallets API
moves USDC to it.

This project draws directly on my background building KYC/OTP-gated fintech
auth flows (Trust Pay) and wallet-integration work (Peernetics) — the same
shape of problem (verify an identity, safely custody or provision a
credential, move money) just recomposed around embedded wallets and
stablecoins instead of bank rails.

## Prize tracks targeted

| Track | Prize | Why this project fits |
|---|---|---|
| **Privy — Best B2B Financial Product / Best Financial Flow** | $5,000 | Company auth (`@privy-io/react-auth`) and payee wallet provisioning (`@privy-io/server-auth`, pregenerated embedded wallets by email) are both core, load-bearing parts of the product — not bolted on. See `app/providers.tsx`, `app/page.tsx`, and `lib/privy.ts`. |
| **Circle — Arc** | $10,000 | USDC payouts are executed through a dedicated, typed Circle service module (`lib/circle.ts`) built against Circle's Developer-Controlled Wallets API, targeting Arc. See [Going live](#going-live-wiring-real-circle-arc-calls) for exactly what to fill in with real sandbox credentials. |

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (CSS-first config — see `app/globals.css`, no
  `tailwind.config.js` needed)
- **`@privy-io/react-auth`** — client-side email login
- **`@privy-io/server-auth`** — server-side embedded wallet provisioning
  (`importUser` with `createEthereumWallet: true`)
- A local **JSON file** as the MVP data store (`lib/store.ts`, `data/payees.json`)

> The `@solana/kit` / `@solana-program/*` packages in `dependencies` aren't
> used directly — they're optional peer dependencies of
> `@privy-io/react-auth`'s Solana wallet support, which its bundle
> statically imports even though this app only enables Ethereum embedded
> wallets. They're installed purely to satisfy the bundler; safe to ignore.

## Project structure

```
app/
  page.tsx                 Landing page (pitch + Privy sign-in)
  providers.tsx             Client-side PrivyProvider wrapper
  dashboard/page.tsx        Authenticated dashboard: payees + send payouts
  api/payees/route.ts       GET list payees / POST add a payee (provisions wallet)
  api/payouts/route.ts      POST send payouts to all pending payees
  globals.css                Tailwind v4 theme + design tokens
components/
  PayeeForm.tsx              Add-payee form
  PayeeTable.tsx             Payee list with wallet address + status
  StatusBadge.tsx             Pending/Sending/Sent/Failed pill
lib/
  types.ts                    Shared domain types (Payee, PayeeStatus, ...)
  store.ts                    JSON-file-backed persistence (see note below)
  privy.ts                    Privy server SDK — embedded wallet provisioning
  circle.ts                   Circle Arc service — createTransfer / getTransferStatus
  utils.ts                    Formatting helpers
data/
  payees.json                 Local data file (gitignored; auto-created if missing)
```

## Getting API keys

Both are free to sign up for and take a few minutes.

### Privy App ID

1. Go to <https://dashboard.privy.io> and create an account.
2. Create a new app.
3. Copy the **App ID** into `NEXT_PUBLIC_PRIVY_APP_ID` (and again into
   `PRIVY_APP_ID`) in `.env.local`.
4. In the app's dashboard, generate an **App Secret** and put it in
   `PRIVY_APP_SECRET`. Keep this one server-side only — never commit it or
   prefix it with `NEXT_PUBLIC_`.
5. Under **Login methods**, make sure **Email** is enabled (it's the only
   login method this starter wires up in `app/providers.tsx`).

### Circle sandbox API keys

1. Go to <https://console.circle.com> and create a (free, sandbox) account.
2. Under **Developer-Controlled Wallets**, follow Circle's quickstart to
   generate an **API key** and set up an **entity secret** — Circle's setup
   flow / SDK handles the RSA encryption ceremony for you; see
   <https://developers.circle.com/w3s/> for the current walkthrough.
3. Create a developer-controlled wallet to act as your payout **treasury**,
   and fund it with sandbox USDC from Circle's faucet.
4. Put `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, and the treasury wallet's id
   (`CIRCLE_TREASURY_WALLET_ID`) into `.env.local`.
5. For Arc specifically, check <https://www.circle.com/arc> and the Circle
   console for current Arc testnet availability/network settings — Arc is
   new, so the exact chain/network id to select may have moved by the time
   you read this.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in keys, or leave blank for mock mode
npm run dev
```

Open <http://localhost:3000>. With `.env.local` left blank, the app runs
fully in **mock mode** (see below) — no external accounts required to see
the whole flow work.

Other scripts:

```bash
npm run build   # production build (verified to pass — see below)
npm run start   # run the production build
npm run lint    # ESLint (flat config, eslint-config-next)
```

This starter was built and confirmed to run `npm install && npm run build`
successfully as part of putting this repo together.

## Dependency notes (read before editing package.json)

Two things in this project's dependencies look wrong and are not. Both will
break the build if "tidied up", and both fail in ways that don't point back to
the cause — hence this section.

### `.npmrc` sets `legacy-peer-deps=true`

Without it, a plain `npm install` **fails outright**:

```
Could not resolve dependency:
  @circle-fin/developer-controlled-wallets@"*" from the root project
Conflicting peer dependency: @solana/codecs-strings@2.3.0
```

Circle's SDK declares a `peerOptional` on `@solana/codecs-strings@^2`, while
`@privy-io/react-auth` pulls in v8 via `@solana/kit`. The peer is *optional* and
only used by Circle's Solana support, which this app doesn't touch — we send
USDC on Arc — but npm still treats the version clash as fatal.

It lives in `.npmrc` rather than as a `--legacy-peer-deps` flag so that local,
CI and Vercel all resolve identically instead of depending on someone
remembering the flag.

**The file must sit next to `package.json`.** npm reads the project `.npmrc`
from the directory containing the `package.json` it's operating on; it does not
walk up to the repository root. An `.npmrc` one level up is silently ignored —
`npm config get legacy-peer-deps` returns `false` and the install fails with the
error above, with nothing pointing at the misplaced file.

### `@stripe/stripe-js` is a dependency nothing imports

Grep the source and you'll find no reference to it. It is still required.

`@privy-io/react-auth` bundles `@stripe/crypto` for its fiat on-ramp screen, and
that package declares `@stripe/stripe-js@^1.46.0` as a peer. Because
`legacy-peer-deps` skips peer resolution, npm won't install it automatically —
so it's listed as a direct dependency to force it into the tree.

Remove it and the build fails at a place that names neither Stripe nor Privy as
the culprit:

```
./node_modules/@stripe/crypto/dist/stripe.esm.js:1:1
Error: Module not found: Can't resolve '@stripe/stripe-js'
```

It is pinned to `^1.54.2` deliberately. npm's default resolution picks v9, which
is a major version outside the `^1.46.0` range `@stripe/crypto` asks for; that
builds, but leaves a version mismatch inside Privy's on-ramp waiting to
misbehave at runtime.


## Mock mode vs. live mode

Both external integrations independently fall back to a clearly-labeled
**mock mode** when their environment variables are absent, so the app is
fully demoable with zero setup:

- **`lib/privy.ts`** — without `PRIVY_APP_ID`/`PRIVY_APP_SECRET`, adding a
  payee generates a deterministic, fake-but-stable `0x...` address from
  their email (same email always maps to the same fake address) instead of
  calling Privy.
- **`lib/circle.ts`** — without `CIRCLE_API_KEY`/`CIRCLE_ENTITY_SECRET`,
  `createTransfer()` and `getTransferStatus()` simulate Circle's async
  transfer lifecycle with realistic delays, including an ~8% simulated
  failure rate so the dashboard's "Failed" status is reachable in a demo.

The dashboard doesn't hide this — when a payee is added with a mocked
wallet, the UI banner says so explicitly. That's deliberate: it should be
obvious to a judge (or to you) which parts of a demo run are real network
calls and which are simulated.

Setting only *one* of the two (e.g. just Privy) is fine — each module checks
its own env vars independently.

## Going live: wiring real Circle Arc calls

`lib/circle.ts` has the real REST calls scaffolded (`fetch()` against
`https://api.circle.com/v1/w3s/...`) with a large comment block at the top
of the file describing the exact request shape. To actually go live:

1. Set `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, and
   `CIRCLE_TREASURY_WALLET_ID` in `.env.local`.
2. **Swap the raw `fetch()` calls for Circle's official SDK**,
   [`@circle-fin/developer-controlled-wallets`](https://www.npmjs.com/package/@circle-fin/developer-controlled-wallets).
   The entity-secret encryption Circle's API requires per-request is fiddly
   to hand-roll correctly (it's RSA-encrypted with a public key Circle gives
   you); their SDK handles it. This is the single highest-value thing to do
   before a live demo.
3. Fill in the correct `tokenId` for USDC on Arc's testnet (from your Circle
   console once your wallet set is configured for Arc).
4. Double check `getTransferStatus()`'s state-mapping against whatever field
   names the current Circle API actually returns — API field names in this
   space shift between versions, so treat the mapping in the code as a
   best-effort starting point, not gospel.
5. Consider swapping the in-request polling loop in
   `app/api/payouts/route.ts` for Circle's webhook notifications once you're
   past the demo stage — polling works fine for a handful of payees in a
   hackathon demo, but doesn't scale.

`lib/privy.ts` is already wired against real endpoints the moment
`PRIVY_APP_ID`/`PRIVY_APP_SECRET` are set — no code changes needed there,
just credentials.

## Deploying to Vercel

```bash
npm i -g vercel   # if you don't have it already
vercel
```

Or connect the repo in the Vercel dashboard as usual. Either way, add the
same environment variables from `.env.example` in **Project Settings ->
Environment Variables** (remembering `NEXT_PUBLIC_PRIVY_APP_ID` is the only
one that should be public).

**Important caveat:** the JSON-file store (`lib/store.ts`) writes to the
local filesystem, which on Vercel's serverless functions is read-only except
for `/tmp`, and `/tmp` is not shared across invocations or persisted between
deploys. Locally (`npm run dev` / `npm start` on a normal server) this is a
non-issue. On Vercel, treat any payees you add as ephemeral, per-instance
data — fine for a live demo during judging, not for real usage. This is
exactly the gap the Prisma/Postgres upgrade below closes.

## Production upgrade path

This MVP intentionally skips a real database — a JSON file is enough to
demo the product end-to-end without setup friction. The natural next step
(and the right one before this becomes a real product) is **Postgres +
Prisma**, since that's already your stack of choice:

1. `npx prisma init`, model `Payee` almost 1:1 off `lib/types.ts`'s `Payee`
   interface (id, name, email, amountUsdc, walletAddress, status,
   transferId, failureReason, createdAt, updatedAt).
2. Reimplement the functions in `lib/store.ts`
   (`listPayees`/`createPayee`/`updatePayeeStatus`/`getPayee`) using
   `prisma.payee.*` calls with the same signatures — nothing in the API
   routes or components needs to change, since they only ever import from
   `lib/store.ts`.
3. Add a `companyId` column and scope everything to the authenticated
   company (using the Privy user id from the session) once this needs to
   support more than one company.

## License

MIT — this is a hackathon starter, do what you want with it.
