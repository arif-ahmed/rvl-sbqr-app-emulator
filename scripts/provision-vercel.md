# Provisioning Vercel — SBQR emulator

These commands set up everything Vercel-side for the SBQR emulator project. The
project name is kept generic on purpose (no FI name in the public `*.vercel.app`
hostname) — see [docs/deploy.md](../docs/deploy.md#vercel-recommended-setup) for why.
Run them locally (or in CI) — **not** from an automated agent, since they create
real cloud resources and credentials.

## 0. One-time prerequisites

### Install the Vercel CLI
```bash
npm install -g vercel@latest
vercel --version        # confirm
```

### Authenticate
```bash
vercel login            # interactive; opens browser, stores token locally
```

You'll be prompted to confirm the email tied to your Vercel account. After login,
`~/.vercel/auth.json` holds a session token.

## 1. Link the repo (optional but recommended)

From the repo root:
```bash
vercel link --yes
```
This creates `.vercel/project.json` with a `projectId` and `orgId`. Useful if you
want to deploy locally with `vercel deploy` without specifying `--project`.

> ⚠️ `.vercel/project.json` is project-specific and should be gitignored. Add it to
> `.gitignore` if not already there.

## 2. Create the project

```bash
vercel project add sbqr-sdk-sandbox \
  --framework vite
```

Notes:
- `--framework vite` tells Vercel to use the Vite build preset (auto-detected
  anyway from `vercel.json`, but explicit is safer).
- The project will appear under your default Vercel team / scope.
- Project name `sbqr-sdk-sandbox` must be globally unique across
  `*.vercel.app`; if it's taken, Vercel will tell you and you can pick another.
  Keep it FI-agnostic — which institution is emulated is a `fis.json` /
  build-env concern, not part of the public hostname.

After creation, fetch the project id:
```bash
vercel project ls
# or
cat .vercel/project.json      # if you ran vercel link first
```

You need the `projectId` (looks like `prj_xxxxxxxx`) for the next step.

## 3. Set environment variables on the project

Vercel supports four environments per project: `production`, `preview`, `development`,
and the global scope. For each, set the vars we need:

```bash
PROJECT=sbqr-sdk-sandbox

# Production
vercel env add BFF_URL           production --project $PROJECT
vercel env add IDP_URL           production --project $PROJECT

# Preview (PR builds — same values for now)
for var in BFF_URL IDP_URL; do
  vercel env add "$var" preview --project $PROJECT
done
```

Values (paste when prompted):
| Variable            | Value                                       |
|---------------------|---------------------------------------------|
| `BFF_URL`           | `https://rvl-sbqr-fi-gateway.fly.dev`       |
| `IDP_URL`           | `https://fi-idp-dhakabank.fly.dev`          |

Verify:
```bash
vercel env ls --project $PROJECT
```

## 4. Create a deploy token (for GitHub Actions)

Don't reuse your personal login token — create a dedicated token for CI:

```bash
# Vercel tokens are created via the dashboard (Account Settings → Tokens).
# CLI doesn't expose token creation directly, but you can still use the
# dashboard. Copy the token immediately; Vercel only shows it once.
```

Steps:
1. Open https://vercel.com/account/settings/tokens
2. Click **Create Token**
3. Name: `gh-actions-sbqr-emulator`
4. Scope: your account (or the team that owns the project)
5. Expiration: pick a sensible window (90 days is common)
6. **Copy the token value** — you will not see it again.

## 5. Wire secrets into GitHub

Using `gh` CLI:
```bash
REPO=arif-ahmed/rvl-sbqr-app-emulator

gh secret set VERCEL_TOKEN \
  --repo "$REPO" \
  --body "<paste the token from step 4>"

gh secret set VERCEL_PROJECT_ID_DHAKABANK \
  --repo "$REPO" \
  --body "<paste the prj_xxx from step 2>"
```

Verify:
```bash
gh secret list --repo "$REPO"
```

## 6. Optional: custom domain

If `emulator.dhakabank.dev` (or whichever you picked in `fis.json`) should point
to this project:

```bash
vercel domains add emulator.dhakabank.dev --project sbqr-sdk-sandbox
```

Vercel will print the DNS records you need to add at your registrar (typically a
CNAME). Once DNS propagates, the assignment is automatic.

## 7. Trigger the first deploy

Either push a small change to `main`, or run the workflow manually:

```bash
gh workflow run deploy-vercel.yml --repo arif-ahmed/rvl-sbqr-app-emulator
```

Watch progress:
```bash
gh run watch --repo arif-ahmed/rvl-sbqr-app-emulator
```

## Cheat sheet

| What                          | Where it lives                                   |
|-------------------------------|--------------------------------------------------|
| Project name                  | `sbqr-sdk-sandbox` (Vercel)           |
| Project id                    | `prj_xxx` → GitHub secret `VERCEL_PROJECT_ID_DHAKABANK` |
| Token                         | Vercel dashboard → GitHub secret `VERCEL_TOKEN`  |
| Env vars                      | `vercel env ls --project sbqr-sdk-sandbox` |
| Custom domain                 | `vercel domains ls --project sbqr-sdk-sandbox` |

## If the BFF URL changes again

```bash
vercel env rm BFF_URL production --project sbqr-sdk-sandbox
vercel env add BFF_URL production --project sbqr-sdk-sandbox
# paste the new URL when prompted

# Preview env too
vercel env rm BFF_URL preview --project sbqr-sdk-sandbox
vercel env add BFF_URL preview --project sbqr-sdk-sandbox
```

Then push any tiny change (or rerun the workflow) to rebuild with the new BFF
URL baked into the bundle.
