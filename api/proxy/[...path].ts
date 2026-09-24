// Generic upstream proxy: /api/proxy/<target>/<path...> → ${TARGET_URL}/<path...>
//
// Used from the browser via fetch('/api/proxy/idp/mint') instead of
// fetch('/idp/mint'), because Vercel's edge POPs intermittently fail to
// resolve external hostnames (*.fly.dev etc.) when serving static rewrites.
// A Node serverless function uses Vercel's centralized outbound network and
// resolves DNS reliably from every region.
//
// Targets are looked up by name in the TARGETS map below, populated from env
// at request time. Add new targets by extending the map.
//
// Env (set per environment in Vercel):
//   IDP_URL   e.g. https://fi-idp-dhakabank.fly.dev
//   BFF_URL   e.g. https://fi-bff-dhakabank.fly.dev   (may be a placeholder
//                 until the BFF is hosted — proxy will return 502 with a clear
//                 message in that case)

import type { IncomingHttpHeaders } from 'node:http';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  runtime: 'nodejs',
};

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const RESPONSE_HEADER_DENY = new Set([
  'content-encoding',
  'transfer-encoding',
  'connection',
  'keep-alive',
]);

// Allowed target aliases. Anything else returns 404 — prevents the proxy
// from being abused as an open redirector.
const TARGETS: Record<string, string | undefined> = {
  idp: process.env.IDP_URL,
  bff: process.env.BFF_URL,
};

function resolveTarget(
  alias: string,
): { base: string; host: string } | { error: string } {
  const raw = TARGETS[alias];
  if (!raw) {
    return {
      error: `Target "${alias}" is not configured. Set ${alias.toUpperCase()}_URL in this Vercel project's environment.`,
    };
  }
  let host = '';
  try {
    host = new URL(raw).host;
  } catch {
    return { error: `${alias.toUpperCase()}_URL is not a valid URL: ${raw}` };
  }
  return { base: raw.replace(/\/+$/, ''), host };
}

function buildUpstreamPath(req: VercelRequest): string {
  // `req.query.path` is everything after `/api/proxy/<target>`.
  const p = (req.query.path as string | string[] | undefined) ?? '';
  const tail = Array.isArray(p) ? p.join('/') : p;
  const url = req.url ?? '/';
  const qIndex = url.indexOf('?');
  const qs = qIndex >= 0 ? url.slice(qIndex) : '';
  return `/${tail}${qs}`;
}

function pickRequestHeaders(
  req: VercelRequest,
  upstreamHost: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  const h = req.headers as IncomingHttpHeaders;
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  out['host'] = upstreamHost;
  out['x-forwarded-host'] = upstreamHost;
  out['x-forwarded-proto'] = 'https';
  return out;
}

function pickResponseHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    if (RESPONSE_HEADER_DENY.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // `req.query.target` is the alias segment, populated by the catch-all.
  const aliasRaw = (req.query.target as string | string[] | undefined) ?? '';
  const alias = Array.isArray(aliasRaw) ? aliasRaw[0] : aliasRaw;
  if (!alias || !(alias in TARGETS)) {
    res.status(404).json({
      error: {
        code: '404',
        message: `Unknown proxy target "${alias}". Known: ${Object.keys(TARGETS).join(', ')}.`,
      },
    });
    return;
  }

  const resolved = resolveTarget(alias);
  if ('error' in resolved) {
    res.status(502).json({
      error: { code: '502', message: resolved.error },
    });
    return;
  }

  const upstreamUrl = `${resolved.base}${buildUpstreamPath(req)}`;

  let body: Buffer | undefined;
  if (req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
    if (Buffer.isBuffer(req.body)) {
      body = req.body;
    } else if (typeof req.body === 'string') {
      body = Buffer.from(req.body);
    } else if (req.body && typeof req.body === 'object') {
      body = Buffer.from(JSON.stringify(req.body));
    }
  }

  try {
    // Use the global fetch (Node 18+). Vercel's Node runtime ships with it.
    const upstream = await fetch(upstreamUrl, {
      method: req.method ?? 'GET',
      headers: pickRequestHeaders(req, resolved.host),
      // BodyInit accepts Buffer in Node, but the DOM type doesn't know that.
      body: body as unknown as undefined,
      // Abort signal: 15s to connect, 30s total — fly.io cold starts can take a few seconds.
      signal: AbortSignal.timeout(30_000),
    });

    res.status(upstream.status);
    for (const [k, v] of Object.entries(
      pickResponseHeaders(upstream.headers as unknown as IncomingHttpHeaders),
    )) {
      res.setHeader(k, v);
    }
    // Buffer the upstream body — small IdP payloads, and Node fetch streams
    // don't compose well with Vercel's response helper without a transform.
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('proxy fetch failed:', err);
    if (!res.headersSent) {
      res.status(502).json({
        error: {
          code: '502',
          message: `Upstream unreachable: ${(err as Error).message ?? 'unknown error'}`,
        },
      });
    } else {
      res.end();
    }
  }
}
