# Deploying per-FI artifacts

This repo intentionally produces **one build artifact per FI** (financial institution),
because every FI ships its own BFF and IdP. Each artifact is a Vite-built SPA whose
`/bff/*` and `/idp/*` calls are rewritten to that FI's backend at the edge.

## Current state — Dhaka Bank (primary)

The repository is currently configured for a single primary FI:

| Field        | Value                                  |
|--------------|----------------------------------------|
| `id`         | `dhakabank`                            |
| `displayName`| Dhaka Bank                             |
| IdP URL      | `https://fi-idp-dhakabank.fly.dev`     |
| BFF URL      | `https://fi-bff-dhakabank.fly.dev` *(placeholder — gateway not yet hosted)* |
| Domain       | `emulator.dhakabank.dev`               |

The IdP is live; the **gateway/BFF is not yet hosted**. The emulator will deploy
and authenticate against the real IdP, but `/bff/*` calls will fail at runtime
until the BFF is brought up at the placeholder URL (or the URL is changed).

## Environment variables — what to set

Set these per environment. They are read by `vite.config.ts` at build time
(`__BFF_TARGET__` / `__IDP_TARGET__`) and by the host (Vercel/Netlify/Cloudflare)
for the runtime `/bff/*` and `/idp/*` rewrites.

| Variable             | Local dev (`.env.local`)              | Production (host)                                  |
|----------------------|---------------------------------------|----------------------------------------------------|
| `BFF_URL`            | `http://localhost:8080` *(or your FI BFF)* | `https://fi-bff-dhakabank.fly.dev` *(update when BFF is live)* |
| `IDP_URL`            | `https://fi-idp-dhakabank.fly.dev`    | `https://fi-idp-dhakabank.fly.dev`                 |
| `VITE_IDP_ISSUER`    | `https://fi-idp-dhakabank.fly.dev`    | `https://fi-idp-dhakabank.fly.dev`                 |
| `VITE_IDP_AUDIENCE`  | `sbqr-fi-gateway`                     | `sbqr-fi-gateway` *(must match BFF's expected aud)*|
| `PORT`               | `5173`                                | — *(set by host)*                                  |

> **`VITE_*` prefix matters.** Vite only exposes variables prefixed `VITE_` to the
> browser bundle. Drop the prefix and the bundle won't see it.

### Why two sets of values?

- `BFF_URL` / `IDP_URL` → consumed by `vite.config.ts` for dev/proxy + by
  `vercel.json` / `netlify.toml` / `_redirects` for runtime edge rewrites.
- `VITE_IDP_ISSUER` / `VITE_IDP_AUDIENCE` → read inside React code to mint
  dev tokens (`/mint`) and to validate tokens at the BFF.

## Host options (all free-tier friendly)

| Host          | Config file             | CI strategy                                 |
|---------------|-------------------------|---------------------------------------------|
| **Vercel**    | `vercel.json`           | GitHub Actions (`deploy-vercel.yml`) or Vercel Git integration |
| **Netlify**   | `netlify.toml`          | Netlify Git integration (no GH Actions needed) |
| **Cloudflare**| `public/_redirects`     | Cloudflare Pages Git integration            |

All three honor `BFF_URL` and `IDP_URL` env vars at deploy time.

## Per-FI registry

FIs are declared in [`fis.json`](../fis.json):

```json
{
  "fIs": [
    { "id": "dhakabank",
      "bffUrl": "fi-bff-dhakabank.fly.dev",
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
1. Create one Vercel project for Dhaka Bank (e.g. `rvl-sbqr-emulator-dhakabank`).
2. Per project, set environment variables:
   - `BFF_URL` = `https://fi-bff-dhakabank.fly.dev` *(placeholder until BFF is hosted)*
   - `IDP_URL` = `https://fi-idp-dhakabank.fly.dev`
3. Add the FI's custom domain (`emulator.dhakabank.dev`) to that project.
4. Copy the project id → set as a GitHub repo secret
   `VERCEL_PROJECT_ID_DHAKABANK`.
5. Create a Vercel token with deploy rights and add it as `VERCEL_TOKEN`.

### Per push to `main`
- `.github/workflows/ci.yml` runs typecheck + tests + build on every PR.
- `.github/workflows/deploy-vercel.yml` builds and deploys Dhaka Bank to
  its Vercel project.

### When the BFF goes live
1. In Vercel project env: update `BFF_URL` to the real gateway URL.
2. In GitHub repo variables (optional): set `BFF_URL_DHAKABANK` so future
   CI runs rebuild with the correct value baked in.
3. Push a small change to trigger a rebuild. No code change required.

### Local manual deploy
```bash
export VERCEL_TOKEN=...
export VERCEL_PROJECT_ID_DHAKABANK=...
npm run deploy:fis          # builds & deploys every FI in fis.json
```

## Netlify: setup
1. Create one Netlify site per FI (or one site with environment-targeted branches).
2. Set `BFF_URL` / `IDP_URL` / `VITE_IDP_ISSUER` / `VITE_IDP_AUDIENCE` per site.
3. Connect to this repo. Netlify reads `netlify.toml` automatically.

## Cloudflare Pages: setup
1. Create one Pages project per FI.
2. Set the four env vars per project.
3. Connect to this repo. Cloudflare uses `public/_redirects`.

## BFF CORS — important

Your FI BFF (rvl-sbqr-fi-gateway) was built for native mobile callers and has no CORS
policy. The `/bff/*` and `/idp/*` rewrites above avoid browser CORS because the browser
sees same-origin requests. **No CORS change is needed** as long as the BFF is reachable
from the Vercel/Netlify/Cloudflare edge.

If you ever switch to direct `fetch(${BFF_URL})` from the browser, you must add CORS
headers on the BFF for the emulator's deployed origin.

## Rollback

- Vercel: `vercel rollback` or "Promote to Production" on a previous deployment.
- Netlify: "Publish deploy" → pick a prior deploy.
- Cloudflare: "Rollback to this deploy" on the Pages dashboard.
