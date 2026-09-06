# Verification

Replace `<DEPLOYED_URL>` below with the actual Vercel deployment URL before
opening the PR (also fill it into `submission.json`'s `deployedUrl` field).

## 1. Health check — confirms the deployment matches this submission's commit

```bash
curl -s https://<DEPLOYED_URL>/api/health
# -> {"status":"ok","commit":"<40-char git commit sha>"}
```

The `commit` value must equal the commit this PR is opened at (`git rev-parse
HEAD` in `source/`, or the PR's head commit on GitHub). On Vercel this is
populated automatically via the `VERCEL_GIT_COMMIT_SHA` build variable — see
`source/lib/commit.ts`.

## 2. X-Agent verification file

```bash
curl -s https://<DEPLOYED_URL>/.well-known/xagent-verification.json
# -> {"schemaVersion":1,"slug":"agada-arcway-pay","commit":"<same 40-char sha>"}
```

## 3. Capability schema (self-describing)

```bash
curl -s https://<DEPLOYED_URL>/api/capability/pay-by-email
```

Returns the capability's full JSON input/output schema — no separate spec
document to keep in sync.

## 4. Call the capability

```bash
curl -s -X POST https://<DEPLOYED_URL>/api/capability/pay-by-email \
  -H "Content-Type: application/json" \
  -d '{"payeeName":"Ada Lovelace","payeeEmail":"ada@example.com","amountUsdc":50}'
```

Expected: a JSON response with `status` of `sent` or `failed` (mock mode has
a small simulated failure rate by design — retry with a different email if
you land on it, or set real Privy/Circle credentials for a live run per
`source/README.md`), plus `payeeId` and `walletAddress`. Calling it again
with the same `payeeEmail` reuses that payee's existing wallet rather than
provisioning a new one.

## 5. See it reflected in the human dashboard

```bash
curl -s https://<DEPLOYED_URL>/api/payees
```

The payee created by step 4's capability call appears here too — the agent
endpoint and the human ETHOnline dashboard (`/dashboard`) are backed by the
same store, confirmed by `source/app/api/capability/pay-by-email/route.ts`
calling into `source/lib/store.ts`.

## Reproducing locally instead of hitting the live deployment

```bash
cd source
npm install
npm run build && npm run start   # or `npm run dev` for hot reload
# then repeat curl commands 1-5 against http://localhost:3000
```

Runs identically in mock mode with zero external accounts — see
`source/README.md` for wiring real Privy/Circle credentials.
