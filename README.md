# rvl-sbqr-sdk-emulator

Web emulator of a financial institution's mobile banking app, used to test the
BanglaQR P2P flow end to end before the real SDK exists:

```
Emulator (browser) ──JWT──▶ FI Backend BFF (rvl-sbqr-fi-gateway) ──OAuth2 S2S──▶ sbqr.api
        │                                  :8080                                 (generate / validate)
        └──── login ───▶ FI IdP (:5105, dev /mint)
```

It renders a phone-sized app (Dhaka Bank-style theme) with a tester console
beside it.

| Area | What it does | Spec / BRD |
|---|---|---|
| Login | Demo account holders, JWT minted by the FI IdP | — |
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
npm run dev            # http://localhost:5173
```

Requirements: Node 18+. It needs the FI IdP and the FI BFF running. The BFF has
no CORS policy (it is built for native apps), so the Vite dev server proxies
`/api/proxy/bff/*` → `BFF_URL` and `/api/proxy/idp/*` → `IDP_URL`. The same
prefix is used in production — on Vercel it's served by the Node serverless
function in `api/proxy/[...path].ts`. Copy `.env.example` to `.env`
to change the targets:

```bash
BFF_URL=http://localhost:8080
IDP_URL=http://localhost:5105
VITE_IDP_ISSUER=http://localhost:5105     # must match the BFF's Auth:Issuer
VITE_IDP_AUDIENCE=sbqr-fi-gateway         # must match the BFF's Auth:Audience
```

The two status dots in the console show whether the BFF (`/health/ready`) and
the IdP are reachable.

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

The mock generates a new signing key each time it starts. QRs from an earlier
run therefore validate as `INVALID_SIGNATURE`, and institutions other than
`INSTITUTION` return `KEY_NOT_FOUND`.

## End-to-end walkthrough

1. **Tab A**: log in as **Fatema** (password `1234`). Open *Request Money*, choose BDT 1,500, *Generate*, then *Save image*.
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

```bash
npm test          # EMV decoder tests
npm run build     # typecheck + production build
```

## Not real

- Login: the password is checked against the demo list only. The IdP `/mint` issues the JWT.
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
