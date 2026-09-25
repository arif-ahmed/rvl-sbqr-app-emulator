# rvl-sbqr-sdk-emulator

Web emulator of a financial institution's mobile banking app, used to test the
BanglaQR P2P flow end to end before the real SDK exists:

```
Emulator (browser) ──JWT──▶ FI Backend BFF (rvl-sbqr-fi-gateway) ──OAuth2 S2S──▶ sbqr.api
        │                                  :8080                                 (generate / validate)
        └──── login ───▶ FI IdP (:5105, OAuth2 /connect/token)
```

It renders a phone-sized app (Dhaka Bank-style theme) with a tester console
beside it.

| Area | What it does | Spec / BRD |
|---|---|---|
| Login | OAuth2 password grant against the FI IdP; tokens refresh with rotating refresh tokens | — |
| Home | Customer and accounts, balance, quick actions, recent activity, logout | — |
| Receive → Static QR | Personal reusable QR, no amount (Tag 01 = `11`) | BRD §3, §5.1 |
| Receive → Dynamic QR | Payment request with fixed amount (Tag 01 = `12`, Tag 54), 15-min expiry countdown | BRD §3, §5.2 |
| Save / Share | PNG card of the QR, used for the upload flow | Spec §2.6 |
| Scan & Pay | Gallery upload (jsQR), live camera, or paste raw payload | Spec §2.6 |
| On-device checks | TLV parse, CRC-16/CCITT-FALSE, Tag 52 = `4829` routing, Tag 01 mode, Tags 80/81 present | Annex B step 1 |
| Verify | `POST /v1/qr/validate` through the BFF; the verdict is mapped to non-technical messages | BRD §5.3 |
| Review | Recipient name, masked account, institution (Annex A). Static: payer types the amount. Dynamic: amount is locked | Spec §2.6 |
| Purpose `***` | Payer is required to enter a purpose | Table 4A |
| Authorise | Simulated OTP (the SDK does not implement auth) | BRD §5.1 step 9 |
| Settle | Simulated NPSB debit and credit, with success or failure result, TXN ID, RRN and response code | Figure 1 |

## Run

```bash
npm install
cp .env.example .env    # see Environment variables below before you run this
npm run dev              # http://localhost:5173
```

Requirements: Node 18+. It needs the FI IdP and the FI BFF running (or use the
live IdP — see below). Neither has a CORS policy (they are built for native
apps), so the Vite dev server proxies `/bff/*` → `BFF_URL` and `/idp/*` →
`IDP_URL`. In production the same paths are forwarded by the rewrites in
`vercel.json` (see [`docs/deploy.md`](docs/deploy.md)).

The two status dots in the console show whether the BFF (`/health/ready`) and
the IdP are reachable.

## Environment variables

Set in `.env` (defaults for local mocks, committed as `.env.example`) or
`.env.local` (git-ignored, wins over `.env` — use it for a one-off override
without touching the shared defaults):

| Variable  | Default (`.env.example`)       | Change it to…                                                                 |
|-----------|---------------------------------|--------------------------------------------------------------------------------|
| `IDP_URL` | `http://localhost:5105`         | `https://fi-idp-dhakabank.fly.dev` to log in against the real deployed IdP instead of `fi-idp-mock` (see below). Must match whatever `BFF_URL` trusts as `Auth:Issuer`. |
| `BFF_URL` | `http://localhost:8080`         | Your local `rvl-sbqr-fi-gateway`, or `https://rvl-sbqr-fi-gateway.fly.dev` for the live deployed gateway. |
| `PORT`    | `5173`                           | Whatever port you want the Vite dev server on.                                 |

`vite.config.ts` reads these with `loadEnv` and uses them both as the dev
proxy targets and as the dev-panel labels (`__BFF_TARGET__` / `__IDP_TARGET__`).
No JWT/issuer/audience settings are needed here: login is the OAuth2 password
grant against the IdP's `POST /connect/token`, and the IdP stamps `iss`/`aud`
into the token itself.

### Point local dev at the live deployed IdP

To verify the emulator against the real Dhaka Bank IdP (`fi-idp-dhakabank`,
hosted on Fly.io) instead of the local `fi-idp-mock`:

```bash
echo 'IDP_URL=https://fi-idp-dhakabank.fly.dev' > .env.local
npm run dev
```

The dev panel's `FI IdP` status dot will turn green and show the fly.dev URL.
Log in with any demo user (`fatema` / `fatema@1234`, etc. — same seed
convention as the mock). `BFF_URL` can stay pointed at your local BFF or the
live gateway; only the IdP calls are affected. Delete `.env.local` (or change
`IDP_URL` back) to return to the local mock.

### Offline stack (no real sbqr.api)

The `tmp/fakes/fake-sbqr-api.js` in `rvl-sbqr-fi-gateway` returns fixed
placeholder strings that are not BanglaQR. For offline runs use the canonical
spec-conformant stand-in from `rvl-sbqr-mocks`:

```bash
# Upstream — :5201 (Docker, recommended):
docker compose -f ../rvl-sbqr-mocks/docker-compose.yml up --build sbqr-api-mock

# …or, without Docker, from ../rvl-sbqr-mocks/services/sbqr-api-mock/:
#   PORT=5201 INSTITUTION=000085 node src/mock-sbqr-api.cjs

# IdP — :5105 (one of the fi-idp-mock instances in rvl-sbqr-mocks/docker-compose.yml,
# or for a smoke run, host-run from ../rvl-sbqr-fi-gateway/tmp/fakes/fake-idp.js)

# BFF — start it however you prefer; e.g. from ../rvl-sbqr-fi-gateway/:
#   dotnet run --project src/SBQR.FiGateway.Api
# with ASPNETCORE_ENVIRONMENT=Development and the env overrides from
# rvl-sbqr-mocks/services/sbqr-api-mock/README.md#wiring-for-rvl-sbqr-fi-gateway

# Finally this emulator:
npm run dev
```

The mock generates a new signing key each time it starts. QRs from an earlier
run therefore validate as `INVALID_SIGNATURE`, and institutions other than
`INSTITUTION` return `KEY_NOT_FOUND`.

## End-to-end walkthrough

1. **Tab A**: log in as **Fatema** (password `fatema@1234`). Open *Request Money*, choose BDT 1,500, *Generate*, then *Save image*.
2. **Tab B**: open the same URL and log in as **Rafiq**. Open *Scan & Pay*, then *Add QR from your gallery*, and pick the PNG.
3. Review the on-device checks, then *Verify & Continue*.
4. Enter the purpose if asked, choose *Continue*, enter any 6-digit OTP, then *Confirm & Pay*.
5. Tab B shows *Payment Successful*. Tab A shows *Payment Received* if its QR screen is still open.

Each tab keeps its own login (sessionStorage). Balances, history and generated
QRs live in localStorage, so the tabs can pay each other.

### Negative cases

| Try | Expected |
|---|---|
| Pay the same dynamic QR twice | "This payment link has already been used." |
| Dynamic QR older than 15 min (generated in this browser) | "This request has expired…" |
| Paste a payload with a broken CRC | On-device check fails; *Verify* disabled |
| Change the name and fix the CRC, then paste | `INVALID_SIGNATURE` from sbqr.api |
| Tag 52 ≠ `4829` | Merchant (P2M) QR message |
| OTP `000000` | Wrong code, 3 attempts |
| Amount above balance / per-txn limit | *Transaction Failed* (NPSB 51 / 61) |
| *Simulation → Force decline / timeout* | NPSB 05 / 91 |
| *Simulation → Bypass on-device checks* | Sends invalid payloads to the BFF anyway |

## Layout

```
src/
  api/          http client + network log, IdP login, BFF QR endpoints
  lib/emv.ts    BanglaQR TLV / CRC / P2P decoder (unit tested)
  lib/qrImage   QR render, image and camera decode, shareable PNG card
  data/         demo customers, Annex A institution directory
  state/        session, navigation stack, ledger, simulation knobs, saved QRs
  screens/      Login, Home, Receive, QrDisplay, Pay, Decoded, Review, Pay.flow, Activity, Profile
  components/   phone frame, UI kit, tester console
```

## Testing

```bash
npm test               # vitest: EMV decoder + auth request-shaping unit tests
npm run test:e2e       # Playwright: full login flow against the real fi-idp-mock
npm run test:e2e:report  # open the last e2e HTML report (screenshots + traces)
npm run build           # typecheck + production build
```

`npm run test:e2e` does not stub the IdP: Playwright boots the actual
`fi-idp-mock` (`node server.js` from `../rvl-sbqr-mocks/services/fi-idp-mock`)
and a fresh Vite dev server pointed at it, on dedicated ports (`E2E_IDP_PORT` /
`E2E_APP_PORT`, default `5115` / `5183`) so it doesn't collide with a dev
server you already have running on `5173`. If the mocks repo isn't a sibling
of this one, point `IDP_MOCK_DIR` at it. Coverage: valid/invalid/locked/
expired-password logins with full JWT claim + JWKS signature verification,
refresh-token rotation and reuse rejection, the login-card CSS regression
test, and session persistence/logout — see [`e2e/`](e2e/). Every test captures
numbered screenshots into `e2e-evidence/<test-name>/`, attached to the HTML
report.

To instead check connectivity against the **live deployed IdP** (not part of
the automated suite — a manual sanity check), see [Point local dev at the
live deployed IdP](#point-local-dev-at-the-live-deployed-idp) above.

## Not real

- Login: the IdP (`fi-idp-mock`) checks the password and account status; demo passwords are `<username>@1234`. Balances and accounts come from the emulator's own demo list.
- OTP, settlement, balances, NPSB references and the "received" notification are simulated in the browser.
- Single-use and expiry hooks for dynamic QRs only know about QRs generated or paid in this browser.
- Tag 26 (institution) in generated QRs comes from sbqr.api's tenant registration, not from the app theme.

## Companion repos

- `rvl-sbqr-mocks` — server-side mocks (`fi-idp-mock`, `sbqr-api-mock`, …).
  The `sbqr-api-mock` service in that repo is the canonical spec-conformant
  stand-in that this emulator depends on for offline runs.
- `rvl-sbqr-fi-gateway` — the FI Backend BFF that this emulator talks to.
- `rvl-sbqr-workspace` *(planned)* — a thin umbrella repo that orchestrates
  bringing these repos up side-by-side.
