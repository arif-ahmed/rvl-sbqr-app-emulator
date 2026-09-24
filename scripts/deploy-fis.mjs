#!/usr/bin/env node
/**
 * Per-FI deploy helper for Vercel.
 *
 * For every FI in fis.json:
 *   1. Build with BFF_URL / IDP_URL set (baked into the JS bundle via vite.config.ts).
 *   2. vercel deploy --prebuilt to that FI's project.
 *
 * Requires:
 *   - VERCEL_TOKEN env var (or per-FI token via VERCEL_TOKEN_<FI_ID>)
 *   - VERCEL_PROJECT_ID_<FI_ID> env var per FI
 *   - vercel CLI installed and linked (`npm i -g vercel`)
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const reg = JSON.parse(readFileSync(new URL('../fis.json', import.meta.url), 'utf8'));

for (const fi of reg.fIs) {
  console.log(`\n=== ${fi.id} (${fi.displayName ?? ''}) ===`);
  const projectEnv = fi.vercelProjectIdEnv ?? `VERCEL_PROJECT_ID_${fi.id.toUpperCase().replace(/-/g, '_')}`;
  const tokenEnv   = `VERCEL_TOKEN_${fi.id.toUpperCase().replace(/-/g, '_')}`;
  const projectId  = process.env[projectEnv];
  const token      = process.env[tokenEnv] ?? process.env.VERCEL_TOKEN;

  if (!projectId) {
    console.error(`  ! Missing env ${projectEnv} — skipping ${fi.id}`);
    continue;
  }
  if (!token) {
    console.error(`  ! Missing ${tokenEnv} or VERCEL_TOKEN — skipping ${fi.id}`);
    continue;
  }

  console.log(`  • Building (BFF=${fi.bffUrl}, IDP=${fi.idpUrl})`);
  const build = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, BFF_URL: fi.bffUrl, IDP_URL: fi.idpUrl },
  });
  if (build.status !== 0) {
    console.error(`  ! Build failed for ${fi.id}`);
    process.exit(build.status ?? 1);
  }

  console.log(`  • Deploying to Vercel project ${projectId}`);
  const deploy = spawnSync('vercel', [
    'deploy', '--yes', '--prebuilt',
    '--token', token,
    '--target', 'production',
  ], {
    stdio: 'inherit',
    env: { ...process.env, VERCEL_PROJECT_ID: projectId },
  });
  if (deploy.status !== 0) {
    console.error(`  ! Deploy failed for ${fi.id}`);
    process.exit(deploy.status ?? 1);
  }
}

console.log('\nAll FI deploys complete.');
