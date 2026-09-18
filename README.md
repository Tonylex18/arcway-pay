# Arcway

**Stablecoin payroll on Arc.** Pay a contractor with their email address. They receive USDC in a wallet only they control — no seed phrase, no gas token, no prior crypto knowledge.

**Live:** https://arcwaypay.xyz · **Submission details:** [SUBMISSION.md](./SUBMISSION.md)

---

## Why this works on Arc

Paying someone in stablecoins usually breaks at the last step: the recipient holds money they can't move, because moving it needs a second token for gas that nobody sent them.

On Arc, **USDC is the native gas token**. Being paid is sufficient. A contractor can sign a withdrawal the moment funds arrive, out of the same balance — which is the difference between a payroll product that works and a demo that doesn't survive contact with a real recipient.

## How it works

**Employer** → signs in with email, adds payees by name and email address, reviews the run before anything moves (totals, balance-after, a flag on anyone who hasn't claimed their wallet), then confirms. USDC settles on Arc in about a second, with a receipt carrying every transaction hash.

**Payee** → gets an email, signs in with that same address, and sees a balance read directly from the chain. Withdrawals are signed **in their browser** by their own embedded wallet. The server has no authority to move their funds and never did.

**Agents** → `POST /api/capability/pay-by-email` with a scoped API key pays someone programmatically. Same ledger, same receipts, same chain.

## Try it in 60 seconds

```bash
curl -s -X POST https://arcwaypay.xyz/api/capability/pay-by-email \
  -H "Authorization: Bearer <reviewer-key>" \
  -H "Content-Type: application/json" \
  -d '{"payeeName":"Ada Lovelace","payeeEmail":"ada.demo@example.com","amountUsdc":0.25}'
```

Take `walletAddress` from the response and open `https://testnet.arcscan.app/address/<walletAddress>` — the transfer is there on chain, from the treasury at `0x98c0…f8a0`.

A scoped reviewer key (0.5 USDC per payout, 6 req/min, own company, revocable) is available on request through the program's private review channel — contact anthonyagada2000@gmail.com.

## Run it locally

Mock mode needs no Circle, Privy or Resend credentials — only Postgres. Full steps in [SUBMISSION.md](./SUBMISSION.md#without-credentials--local-mock-mode).

## Stack

Next.js 16 · TypeScript · Postgres (Neon) · Prisma · Circle Developer-Controlled Wallets · Privy · viem · Resend · Vercel

## Known limits

One shared treasury across companies (database tenancy is enforced; funds aren't yet partitioned). Agent-initiated payouts aren't settled by a background job: their status and the payee's email update only when an employer opens that run's receipt page, so verify them on the explorer. The rate limiter is a fixed window, isn't concurrency-safe, and fails open when the database is unreachable. Each is explained in [SUBMISSION.md](./SUBMISSION.md#known-limits).

---

Built by Agada Anthony Alex — [portfolio](https://portfolio-clue.vercel.app) · [GitHub](https://github.com/Tonylex18)
