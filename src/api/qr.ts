// FI backend (BFF) QR endpoints. The BFF forwards verbatim to sbqr.api
// (rvl-secure-bqr-manager/contracts/v1.public.json), attaching the platform
// token server-side.

import { ApiError, postJson } from './http';

export interface GenerateStaticQrRequest {
  recipientName: string;
  recipientCity: string;
  recipientPan: string;
  postalCode?: string | null;
  customerLabel?: string | null;
  purposeOfTransaction?: string | null;
}

export interface GenerateDynamicQrRequest extends GenerateStaticQrRequest {
  /** Tag 54 — digits with optional single decimal point, e.g. "500.00". */
  transactionAmount: string;
}

export interface GenerateQrResponse {
  qrPayload: string;
  payloadHash: string;
  qrType: string;
  signatureKeyVersion: number;
}

export type QrVerdict =
  | 'VALID'
  | 'INVALID_SIGNATURE'
  | 'STRUCTURAL_INVALID'
  | 'KEY_NOT_FOUND'
  | 'KEY_SUSPENDED'
  | 'KEY_REVOKED'
  | 'KEY_NOT_ACTIVE'
  | 'NON_P2P'
  | 'REQUEST_STALE'
  | 'REQUEST_REPLAYED';

export interface ValidateQrResponse {
  verdict: QrVerdict | string;
  trustSource: string | null;
  reasonCode: string | null;
  institutionCode: string | null;
  payloadHash: string;
  recipientName: string | null;
  recipientPan: string | null;
  qrClassification: string;
}

/** Supplies a bearer token; `forceRefresh` re-authenticates (used after a 401). */
export type TokenSource = (forceRefresh?: boolean) => Promise<string>;

async function withAuth<T>(tokens: TokenSource, call: (bearer: string) => Promise<T>): Promise<T> {
  try {
    return await call(await tokens());
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return call(await tokens(true));
    throw e;
  }
}

/** Drop empty optional fields — sbqr.api encodes every non-null field into the payload. */
function clean<T extends object>(body: T): T {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;
}

export function generateStatic(tokens: TokenSource, body: GenerateStaticQrRequest) {
  return withAuth(tokens, (bearer) =>
    postJson<GenerateQrResponse>('BFF', '/v1/qr/generate/static', clean(body), { bearer }),
  );
}

export function generateDynamic(tokens: TokenSource, body: GenerateDynamicQrRequest) {
  return withAuth(tokens, (bearer) =>
    postJson<GenerateQrResponse>('BFF', '/v1/qr/generate/dynamic', clean(body), { bearer }),
  );
}

export function validateQr(tokens: TokenSource, qrPayload: string) {
  return withAuth(tokens, (bearer) =>
    postJson<ValidateQrResponse>(
      'BFF',
      '/v1/qr/validate',
      // requestId + requestTimestamp feed sbqr.api's replay window (C6):
      // every validation attempt is a distinct request.
      {
        qrPayload,
        requestId: crypto.randomUUID().replace(/-/g, ''),
        requestTimestamp: new Date().toISOString(),
      },
      { bearer },
    ),
  );
}

/** Non-technical copy (BRD §5.3) for every non-VALID verdict. */
export function verdictMessage(v: Pick<ValidateQrResponse, 'verdict'>): { title: string; message: string } {
  switch (v.verdict) {
    case 'INVALID_SIGNATURE':
      return {
        title: 'QR could not be verified',
        message: 'This QR could not be verified. Please ask the recipient to share a new one.',
      };
    case 'STRUCTURAL_INVALID':
      return {
        title: 'QR appears damaged',
        message: 'This QR appears to be damaged. Please try again or request a fresh QR from the recipient.',
      };
    case 'KEY_NOT_FOUND':
      return {
        title: 'Unknown institution',
        message:
          "The recipient's institution is not in the Bangladesh Bank trust store. Please contact support if this continues.",
      };
    case 'KEY_SUSPENDED':
    case 'KEY_REVOKED':
    case 'KEY_NOT_ACTIVE':
      return {
        title: 'Institution not trusted',
        message: "The recipient institution's signing key is not currently trusted. The payment was blocked for your safety.",
      };
    case 'NON_P2P':
      return {
        title: 'Merchant QR detected',
        message: 'This is a merchant (P2M) Bangla QR, not a personal QR. Please use merchant payment instead.',
      };
    case 'REQUEST_STALE':
      return { title: 'Device clock out of sync', message: 'Please correct your device date and time, then try again.' };
    case 'REQUEST_REPLAYED':
      return { title: 'Duplicate request', message: 'This verification was already processed. Please scan the QR again.' };
    default:
      return { title: 'Verification failed', message: `The QR could not be verified (${v.verdict}).` };
  }
}
