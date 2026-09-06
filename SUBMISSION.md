# Arcway — pay_by_email

**Track:** General Challenge (Open Innovation)
**Team:** Agada Anthony Alex (solo)

## What this capability does

`pay_by_email` lets an agent pay a person or business a specified amount of
USDC using only their email address. If the recipient has no wallet, one is
provisioned for them automatically (a Privy embedded wallet) before the
payment executes — no wallet address, seed phrase, or prior crypto setup
required from the recipient. This targets the cross-border payroll/payout
use case: paying contractors and remote workers who shouldn't have to become
crypto users to get paid.

This capability is one half of a larger project, **Arcway**, also submitted
to ETHGlobal's ETHOnline 2026 hackathon as a human-facing dashboard (add
payees, review status, click "Send Payouts"). Both entry points — the
dashboard and this agent-callable endpoint — share the same underlying
Privy (wallet provisioning) and Circle Arc (USDC transfer) logic, and write
to the same payee store, so a payment made by an agent shows up in the human
dashboard too, and vice versa.

## Endpoint

```
GET  /api/capability/pay-by-email   -> returns this capability's JSON schema
POST /api/capability/pay-by-email   -> executes one payment
```

### Request

```json
{
  "payeeName": "Ada Lovelace",
  "payeeEmail": "ada@example.com",
  "amountUsdc": 50
}
```

### Response

```json
{
  "status": "sent",
  "payeeId": "9f22f734-b77b-43d2-8fc3-f2631c7525f7",
  "walletAddress": "0xb533d4547eaa5a0fa955965a1ca393ccd2ea0130",
  "transferId": "circle_transfer_id_here"
}
```

`status` is one of `sent`, `failed`, or `pending`. `errorMessage` is present
only when `status` is `failed`. Full JSON Schema for both request and
response is returned live by `GET` on the same endpoint, and is also in
`source/app/api/capability/pay-by-email/route.ts`.

## Mock mode vs. live mode

The deployed endpoint under review may be running in **mock mode**: if
`PRIVY_APP_ID`/`PRIVY_APP_SECRET` and `CIRCLE_API_KEY`/`CIRCLE_ENTITY_SECRET`
are not set, wallet provisioning and USDC transfers are realistically
simulated (deterministic fake wallet addresses, a short delay, and an ~8%
simulated failure rate so the failure path is reachable) instead of calling
Privy/Circle's real networks. This lets the capability be fully exercised —
request, response shape, both success and failure paths — with zero external
accounts. See `source/lib/privy.ts` and `source/lib/circle.ts` for exactly
what changes between mock and live mode, and `source/README.md`'s "Going
live" sections for the steps to wire real credentials.

## Verification

See `verification/README.md` for the exact `curl` commands reviewers can run
against the live deployment, and how the health-check and `.well-known`
endpoints prove the deployment matches this submission's commit.

## Why I built this

I've worked both halves of this problem from opposite directions: KYC/OTP-
gated authentication and secure money movement in traditional fintech (JWT
auth, KYC verification, PIN-authorized transfers for a digital banking
platform), and wallet-connection/token-transfer infrastructure in Web3
(wallet state management and on-chain transaction handling for a crypto
rewards platform). `pay_by_email` is those two halves recomposed as a single
callable capability: verify a recipient by something they already have (an
email address), safely provision a credential (an embedded wallet), and move
money — the exact shape of problem "agents need reliable capabilities to
call" is asking for, just applied to payments specifically.
