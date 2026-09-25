import { netlog, type NetTarget } from './netlog';

export interface ProblemDetails {
  type?: string | null;
  title?: string | null;
  status?: number | null;
  detail?: string | null;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the FI backend (or the dev proxy in front of it) could not be reached. */
  get unreachable(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

// Same-origin paths, forwarded server-side because the FI IdP / BFF have no
// CORS: by the Vite proxy in dev (vite.config.ts), by vercel.json rewrites in prod.
const PREFIX: Record<NetTarget, string> = { BFF: '/bff', IdP: '/idp' };

export interface RequestOptions {
  bearer?: string;
  headers?: Record<string, string>;
}

function problemMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    // OAuth2 error (RFC 6749 §5.2) from the IdP token endpoint.
    const oauth = body as { error_description?: unknown };
    if (typeof oauth.error_description === 'string' && oauth.error_description) return oauth.error_description;
    const p = body as ProblemDetails;
    const fieldErrors = p.errors ? Object.values(p.errors).flat().join(' ') : '';
    const text = [p.title, p.detail, fieldErrors].filter(Boolean).join(' — ');
    if (text) return text;
  }
  if (typeof body === 'string' && body.trim() && body.length < 200) return body.trim();
  if (status === 401) return 'Session rejected by the FI backend (401).';
  if (status === 403) return 'Not allowed (403).';
  return `Request failed with HTTP ${status}.`;
}

export function postJson<T>(target: NetTarget, path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  return post<T>(target, path, 'application/json', JSON.stringify(body), body, opts);
}

/**
 * application/x-www-form-urlencoded POST — the encoding OAuth2 token endpoints
 * require. Fields listed in `secretFields` are masked in the dev-panel log.
 */
export function postForm<T>(
  target: NetTarget,
  path: string,
  fields: Record<string, string>,
  secretFields: string[] = [],
  opts: RequestOptions = {},
): Promise<T> {
  const logged = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, secretFields.includes(k) ? '••••••' : v]));
  return post<T>(target, path, 'application/x-www-form-urlencoded', new URLSearchParams(fields).toString(), logged, opts);
}

async function post<T>(
  target: NetTarget,
  path: string,
  contentType: string,
  payload: string,
  loggedBody: unknown,
  opts: RequestOptions,
): Promise<T> {
  const correlationId = target === 'BFF' ? crypto.randomUUID() : undefined;
  const headers: Record<string, string> = {
    'content-type': contentType,
    accept: 'application/json',
    ...opts.headers,
  };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  if (correlationId) headers['x-correlation-id'] = correlationId;

  const id = netlog.start({ target, method: 'POST', path, requestBody: loggedBody, correlationId });
  const started = performance.now();

  let res: Response;
  try {
    res = await fetch(`${PREFIX[target]}${path}`, { method: 'POST', headers, body: payload });
  } catch (e) {
    const msg = `Network error: ${(e as Error).message}`;
    netlog.finish(id, { ms: Math.round(performance.now() - started), error: msg, status: 0 });
    throw new ApiError(0, msg);
  }

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON body (e.g. proxy error page) — keep as text */
  }
  // The Vite proxy answers 500 with an empty body when the upstream refuses the connection.
  const unreachable = res.status === 500 && !text;
  netlog.finish(id, {
    status: res.status,
    ms: Math.round(performance.now() - started),
    responseBody: parsed,
    correlationId: res.headers.get('x-correlation-id') ?? correlationId,
    error: unreachable ? `${target} not reachable (connection refused)` : undefined,
  });

  if (!res.ok) {
    throw new ApiError(
      unreachable ? 0 : res.status,
      unreachable ? `The ${target === 'BFF' ? 'FI backend' : 'identity provider'} is not reachable.` : problemMessage(res.status, parsed),
      parsed,
    );
  }
  return parsed as T;
}
