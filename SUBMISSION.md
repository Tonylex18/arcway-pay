# Arcway — Submission

**Stablecoin payroll on Arc. Pay a contractor with their email address; they receive USDC in a wallet only they control.**

Live: **https://arcwaypay.xyz**
Repo: https://github.com/Tonylex18/arcway-pay
Chain: Arc testnet (chainId `5042002`) · Explorer: https://testnet.arcscan.app
Commit this submission describes: `44a2e3c5e0f9a51657c309773776eda2f0fb3128`
*(Any later commits on `main` are documentation-only.)*

---

## The problem

Paying a contractor across a border means a bank intermediary, three to five days, and fees that fall hardest on the smallest payments. Paying them in crypto usually means asking a non-technical person to create a wallet, safeguard a seed phrase, and hold a second token for gas before they can touch their own money.

Arcway removes both. An employer adds someone by name and email. A wallet is provisioned for them silently. When the run is sent, USDC settles on Arc in about a second, and the recipient signs in with the same email they already use — no seed phrase, no gas token, no prior crypto knowledge.

The reason it works on Arc specifically: **USDC is the native gas token.** On a general-purpose chain a freshly-paid contractor holds money they cannot move until someone sends them ETH. On Arc, being paid is sufficient — they can sign a withdrawal the moment funds arrive, out of the same balance.

---

## Verify it in 60 seconds

Production runs in **live mode**. This call moves real testnet USDC on Arc.

```bash
curl -s -X POST https://arcwaypay.xyz/api/capability/pay-by-email \
  -H "Authorization: Bearer ark_ba240ff116f75a608ef6a10985ba62cbefb5cf321e24dabccc8a8bd65d14c0ec" \
  -H "Content-Type: application/json" \
  -d '{"payeeName":"Ada Lovelace","payeeEmail":"ada.demo@example.com","amountUsdc":0.25}' \
  -w '\nHTTP %{http_code}\n'
```

Expected:

```json
{"status":"pending","payeeId":"c…","walletAddress":"0x…","transferId":"<uuid>"}
HTTP 200
```

**To confirm the money actually moved**, take `walletAddress` from the response and open:

```
https://testnet.arcscan.app/address/<walletAddress>
```

Within a few seconds you will see an incoming USDC transfer from the treasury at `0x98c0159314014953a5b91d566daeba3fc427f8a0`.

Two notes so you are not misled:

- `status` is almost always `"pending"`. The endpoint checks Circle once and returns; Arc settles a moment later. Pending here means *submitted*, not *uncertain*.
- **Do not look up `transferId` on the explorer.** It is Circle's internal transfer identifier, not a chain hash. The `walletAddress` view above is the correct way to verify.

This key is public and deliberately constrained: **0.5 USDC per payout, 6 requests per minute**, scoped to its own company. It cannot read or touch any other company's data.

### Error responses

| Case | Status | Body |
|---|---|---|
| No key, wrong scheme, unknown or revoked key | 401 | `{"status":"failed","errorMessage":"A valid API key is required. Send it as: Authorization: Bearer ark_…"}` |
| Rate limited | 429 + `Retry-After` | `{"status":"failed","errorMessage":"Rate limit exceeded for this key (6/min). Retry in 55s."}` |
| Over the per-payout cap | 403 | `{"status":"failed","errorMessage":"This key is limited to 0.5 USDC per payout."}` |
| Malformed JSON | 400 | `{"error":"Invalid JSON body."}` |
| Validation | 400 | `{"error":"payeeName is required."}` etc. |
| Circle refuses the transfer | 502 | `{"status":"failed","payeeId":"…","walletAddress":"0x…","errorMessage":"…"}` |

Every 401 returns byte-identical output regardless of which failure occurred, so nothing leaks about whether a company or key exists.

---

## Run it yourself, without credentials

The repository runs in **mock mode** with no Circle, Privy or Resend keys. Transfers are simulated; everything else is the real code path.

```bash
git clone https://github.com/Tonylex18/arcway-pay.git
cd arcway-pay/source
npm install
cp .env.example .env.local
```

Add a Postgres connection to `.env.local` — this is the only requirement:

```
DATABASE_URL="postgresql://USER:PASS@localhost:5432/arcway"
DIRECT_URL="postgresql://USER:PASS@localhost:5432/arcway"
```

(No Postgres handy? `docker run -d -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`)

```bash
npm run db:deploy
npm run dev
```

Then, with **no API key at all** — mock mode ignores auth:

```bash
curl -s -X POST http://localhost:3000/api/capability/pay-by-email \
  -H "Content-Type: application/json" \
  -d '{"payeeName":"Ada Lovelace","payeeEmail":"ada@example.com","amountUsdc":50}'
```

You will get `{"status":"sent", …, "transferId":"mock_…"}`. Roughly 15% of mock calls return a simulated failure on purpose, so that failure handling is exercised rather than assumed. The employer dashboard requires Privy and will report that sign-in isn't configured.

---

## Architecture

**Employer** signs in with email (Privy), adds payees, and reviews a run before anything moves — totals, balance-after, and a flag on anyone who hasn't yet claimed their wallet. On confirm, Circle's developer-controlled wallet API transfers USDC to each payee on Arc. Each payout stores its own `feeUsdc`, so a receipt reopened later shows what was actually charged rather than a recomputed estimate.

**Payee** receives an email from the employer's own sending domain, signs in with that address, and sees their balance read directly from the chain. Withdrawal is signed **in their browser** by their Privy embedded wallet. The server holds no signing authority over payee funds and cannot move them — which is what makes "this wallet is yours" a true statement rather than a marketing one. The server's only role is to record the transaction hash after the broadcast has already succeeded.

**Agents** call `POST /api/capability/pay-by-email` with a scoped API key. Keys are SHA-256 hashed at rest, shown once at creation, revocable, rate-limited per key, and resolve to exactly one company. Every query and mutation is scoped by `companyId` — updates key on `{id, companyId}`, never `id` alone.

Stack: Next.js 16 · TypeScript · Postgres (Neon) · Prisma · Circle Developer-Controlled Wallets · Privy · viem · Resend · Vercel.

---

## Known limits

These are boundaries we chose knowingly, not defects we haven't found.

**One shared treasury.** Database tenancy is fully enforced — every payee, payout and run is scoped by `companyId`. Treasury *funds* are not yet partitioned: all companies draw on a single Circle wallet. Per-company wallets, provisioned at signup with their own deposit address, are the next change.

**Agent payouts don't send email.** They create the notification in a pending state; the employer triggers the send from the dashboard. This is deliberate — a public API key that could emit mail to arbitrary addresses under the employer's sending domain is a spam vector.

**Agent payouts don't settle in the ledger.** The USDC lands on chain, but there is no webhook or scheduled job to update status afterwards — only an employer's receipt page refreshes it. So agent-initiated payments show as `pending` in Activity indefinitely. Verify those on the explorer, not in the app.

**The rate limiter is a fixed window and is not concurrency-safe.** Sequential calls are capped correctly at 6/min; simultaneous calls can exceed it. It's abuse-mitigation, not a hard guarantee — which is why the public key is capped at 0.5 USDC per payout.

---

## What was verified, and how

Claims here were checked against the live deployment and the chain, not against the application's own reporting:

- Real USDC settlement confirmed by reading `balanceOf` on the payee's wallet and the transaction receipt status from the Arc RPC — not by trusting Circle's API response.
- Tenant isolation proven at the store layer across 17 checks.
- Auth failure modes verified byte-identical across five distinct causes.
- The rate limiter verified by a burst designed so at least one refusal was guaranteed regardless of window timing, after an earlier timing-dependent test nearly produced a false pass in both directions.
- Withdrawal gas is measured against the live chain per transaction, not assumed — the original fixed constant was 8× the real fee, which would have made the Max button wrong.

---

Built by Agada Anthony Alex — [portfolio](https://portfolio-clue.vercel.app) · [GitHub](https://github.com/Tonylex18)
