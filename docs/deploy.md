# Deploying per-FI artifacts

This repo intentionally produces **one build artifact per FI** (financial institution),
because every FI ships its own BFF and IdP. Each artifact is a Vite-built SPA whose
`/idp/*` and `/bff/*` calls are proxied server-side to that FI's backend.

## Current state — Dhaka Bank (primary)

The repository is currently configured for a single primary FI:

| Field        | Value                                  |
|--------------|----------------------------------------|
| `id`         | `dhakabank`                            |
| `displayName`| Dhaka Bank                             |
| IdP URL      | `https://fi-idp-dhakabank.fly.dev`     |
| BFF URL      | `https://rvl-sbqr-fi-gateway.fly.dev`  |
| Domain       | `emulator.dhakabank.dev`               |

Both the IdP and the gateway/BFF (`rvl-sbqr-fi-gateway`) are live on Fly.io.

## Why a server-side proxy?

The browser always calls the same-origin paths `/idp/*` and `/bff/*`. In dev the
Vite server forwards them to the local IdP/BFF (see `vite.config.ts`). In
production the rewrites in `vercel.json` forward them to the FI's hosted IdP/BFF:

```json
{ "source": "/idp/:path*", "destination": "https://fi-idp-dhakabank.fly.dev/:path*" }
```

> **Hosts are literal on purpose.** Vercel does not substitute environment
> variables inside `vercel.json`. An earlier `https://${IDP_URL}/$1` destination
> was forwarded to a host literally named `${IDP_URL}` and failed every request
> with `502 DNS_HOSTNAME_NOT_FOUND` — a config bug, not flaky DNS. To point the
> deployed emulator at a different IdP/BFF, edit `vercel.json`.

The browser can't hit the IdP directly: the IdP and BFF were built for native
mobile callers and don't set CORS headers, so a direct cross-origin `fetch`
would fail preflight. `regions: ["iad1"]` pins the rewrite to a single region
with reliable outbound DNS — earlier, letting Vercel pick the nearest edge POP
per-request intermittently failed to resolve `*.fly.dev` hosts.

## Environment variables — what to set

Set these per environment. `vite.config.ts` uses them as the dev proxy targets
and bakes them into the bundle as the dev-panel labels (`__BFF_TARGET__` /
`__IDP_TARGET__`). Production forwarding uses the hosts in `vercel.json`.

| Variable             | Local dev (`.env.local`)              | Production (host)                                  |
|----------------------|---------------------------------------|----------------------------------------------------|
| `BFF_URL`            | `http://localhost:8080` *(or your FI BFF)* | `https://rvl-sbqr-fi-gateway.fly.dev` |
| `IDP_URL`            | `https://fi-idp-dhakabank.fly.dev`    | `https://fi-idp-dhakabank.fly.dev`                 |
| `PORT`               | `5173`                                | — *(set by host)*                                  |

> **`VITE_*` prefix matters.** Vite only exposes variables prefixed `VITE_` to the
> browser bundle. Drop the prefix and the bundle won't see it.

No JWT settings are needed: login is the OAuth2 password grant on the IdP's
`POST /connect/token`, and the IdP stamps `iss` / `aud` into the token. Those
must match the BFF's `Auth__Issuer` / `Auth__Audience`, which is configured on
the IdP and BFF, not here.

## Hosting

One Vercel project per FI: the static Vite build plus the `/idp` and `/bff`
rewrites, both from `vercel.json`, deployed by `.github/workflows/deploy-vercel.yml`.

## Per-FI registry

FIs are declared in [`fis.json`](../fis.json):

```json
{
  "fIs": [
    { "id": "dhakabank",
      "bffUrl": "rvl-sbqr-fi-gateway.fly.dev",
      "idpUrl": "fi-idp-dhakabank.fly.dev",
      "domain": "emulator.dhakabank.dev",
      "vercelProjectIdEnv": "VERCEL_PROJECT_ID_DHAKABANK" }
  ]
}
```

To add a future FI, append an entry — the CI matrix and the local helper
both pick it up automatically (you'll also need to add a `matrix.include`
entry to `.github/workflows/deploy-vercel.yml`).

## Vercel: recommended setup

### One-time
1. Create one Vercel project (e.g. `sbqr-sdk-sandbox`). Keep the project name
   (and therefore its default `*.vercel.app` hostname) generic — don't bake the FI
   name into it. Public URLs that pair a real financial institution's name/branding
   with a login form on an unrelated third-party domain read as textbook phishing to
   automated Safe Browsing–style scanners, even when the content is a sandbox. FI
   selection belongs in `fis.json` / build-time env vars, not the hostname.
2. Per project, set environment variables:
   - `BFF_URL` = `https://rvl-sbqr-fi-gateway.fly.dev`
   - `IDP_URL` = `https://fi-idp-dhakabank.fly.dev`
3. Add the FI's custom domain (`emulator.dhakabank.dev`) to that project.
4. Copy the project id → set as a GitHub repo secret
   `VERCEL_PROJECT_ID_DHAKABANK`.
5. Create a Vercel token with deploy rights and add it as `VERCEL_TOKEN`.

### Per push to `main`
- `.github/workflows/ci.yml` runs typecheck + tests + build on every PR.
- `.github/workflows/deploy-vercel.yml` builds and deploys Dhaka Bank to
  its Vercel project.

### If the BFF URL changes again
1. In Vercel project env: update `BFF_URL`.
2. In GitHub repo variables (optional): set `BFF_URL_DHAKABANK` so future
   CI runs rebuild with the correct value baked in.
3. Push a small change to trigger a rebuild. No code change required.

### Local manual deploy
```bash
export VERCEL_TOKEN=...
export VERCEL_PROJECT_ID_DHAKABANK=...
npm run deploy:fis          # builds & deploys every FI in fis.json
```

## BFF CORS — important

Your FI BFF (rvl-sbqr-fi-gateway) was built for native mobile callers and has no CORS
policy. The `vercel.json` rewrites call it server-side and the browser only sees
same-origin requests, so **no CORS change is needed on the BFF**.

If you ever switch to direct `fetch(${BFF_URL})` from the browser, you must add CORS
headers on the BFF for the emulator's deployed origin.

## Rollback

- Vercel: `vercel rollback` or "Promote to Production" on a previous deployment.
