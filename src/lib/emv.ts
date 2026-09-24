// Client-side BanglaQR P2P payload reader — the part of the Client SDK that
// runs on the device before anything is sent to the FI backend
// (BRD §5.1 step 6 / spec Annex B step 1): TLV parse, CRC check, Tag 52
// routing, Tag 01 static/dynamic detection. Signature verification is NOT
// done here — it needs the trust store and is performed by sbqr.api via the
// FI backend (/v1/qr/validate).

export interface TlvField {
  id: string;
  length: number;
  value: string;
}

export type QrMode = 'STATIC' | 'DYNAMIC' | 'UNSPECIFIED';

export interface P2pQr {
  raw: string;
  fields: TlvField[];
  crc: { declared: string | null; computed: string; ok: boolean };
  payloadFormatIndicator?: string;
  mode: QrMode;
  account: {
    guid?: string;
    institutionType?: string;
    institutionId?: string;
    pan?: string;
  };
  /** Tag 26 sub 01 + sub 02 — the trust-store key id (Annex B). */
  institutionCode?: string;
  mcc?: string;
  isP2p: boolean;
  currency?: string;
  amount?: string;
  country?: string;
  recipientName?: string;
  recipientCity?: string;
  postalCode?: string;
  customerLabel?: string;
  purpose?: string;
  /** Tag 62 sub 08 === "***" → payer app must prompt for a purpose. */
  purposeRequired: boolean;
  signature: { part1?: string; part2?: string; present: boolean };
  /** Structural problems found locally. Empty = structurally sound. */
  errors: string[];
}

export const P2P_MCC = '4829';
export const NPSB_GUID = 'bd.org.bb.npsb';
export const CURRENCY_BDT = '050';

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as used by EMVCo QR Tag 63. */
export function crc16(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Parse one level of EMV TLV. Lengths are counted in characters, which is
 * what every encoder in this ecosystem emits for the ASCII-only P2P fields.
 * Throws on malformed input.
 */
export function parseTlv(data: string): TlvField[] {
  const out: TlvField[] = [];
  let i = 0;
  while (i < data.length) {
    if (i + 4 > data.length) throw new Error(`Truncated TLV header at offset ${i}`);
    const id = data.slice(i, i + 2);
    const lenStr = data.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenStr)) {
      throw new Error(`Malformed TLV header "${id}${lenStr}" at offset ${i}`);
    }
    const length = Number(lenStr);
    const value = data.slice(i + 4, i + 4 + length);
    if (value.length !== length) throw new Error(`Tag ${id} declares ${length} chars but only ${value.length} remain`);
    out.push({ id, length, value });
    i += 4 + length;
  }
  return out;
}

function sub(fields: TlvField[], id: string): string | undefined {
  return fields.find((f) => f.id === id)?.value;
}

function tryParse(data: string | undefined, label: string, errors: string[]): TlvField[] {
  if (!data) return [];
  try {
    return parseTlv(data);
  } catch (e) {
    errors.push(`${label}: ${(e as Error).message}`);
    return [];
  }
}

export function decodeP2pQr(raw: string): P2pQr {
  const payload = raw.trim();
  const errors: string[] = [];

  let fields: TlvField[] = [];
  try {
    fields = parseTlv(payload);
  } catch (e) {
    errors.push((e as Error).message);
  }

  // CRC covers everything up to and including the "6304" header of Tag 63.
  const crcIdx = payload.lastIndexOf('6304');
  const declared = crcIdx >= 0 && crcIdx + 8 === payload.length ? payload.slice(crcIdx + 4) : null;
  const computed = crc16(crcIdx >= 0 ? payload.slice(0, crcIdx + 4) : payload + '6304');
  const crcOk = declared !== null && declared.toUpperCase() === computed;
  if (declared === null) errors.push('CRC (Tag 63) missing or not the last field');
  else if (!crcOk) errors.push(`CRC mismatch: payload says ${declared}, computed ${computed}`);

  const get = (id: string) => sub(fields, id);
  const tag26 = tryParse(get('26'), 'Tag 26', errors);
  const tag62 = tryParse(get('62'), 'Tag 62', errors);
  const tag80 = tryParse(get('80'), 'Tag 80', errors);
  const tag81 = tryParse(get('81'), 'Tag 81', errors);

  const pfi = get('00');
  if (pfi !== '01') errors.push(`Payload Format Indicator (Tag 00) must be "01", got "${pfi ?? '—'}"`);

  const poi = get('01');
  const mode: QrMode = poi === '11' ? 'STATIC' : poi === '12' ? 'DYNAMIC' : 'UNSPECIFIED';

  const account = {
    guid: sub(tag26, '00'),
    institutionType: sub(tag26, '01'),
    institutionId: sub(tag26, '02'),
    pan: sub(tag26, '03'),
  };
  const mcc = get('52');

  for (const [id, name] of [
    ['26', 'Recipient Account Information'],
    ['52', 'Merchant Category Code'],
    ['53', 'Transaction Currency'],
    ['58', 'Country Code'],
    ['59', 'Recipient Name'],
    ['60', 'Recipient City'],
  ] as const) {
    if (!get(id)) errors.push(`Mandatory Tag ${id} (${name}) is missing`);
  }
  if (get('26')) {
    if (!account.guid) errors.push('Tag 26 sub 00 (GUID) is missing');
    if (!account.institutionType) errors.push('Tag 26 sub 01 (institution type) is missing');
    if (!account.institutionId) errors.push('Tag 26 sub 02 (institution ID) is missing');
    if (!account.pan) errors.push('Tag 26 sub 03 (recipient PAN) is missing');
  }

  const amount = get('54');
  if (mode === 'DYNAMIC' && !amount) errors.push('Dynamic QR must carry a Transaction Amount (Tag 54)');
  if (amount !== undefined && !/^\d+(\.\d{1,2})?$/.test(amount)) errors.push(`Transaction Amount "${amount}" is not a valid amount`);

  const purpose = sub(tag62, '08');
  const part1 = sub(tag80, '01');
  const part2 = sub(tag81, '01');

  return {
    raw: payload,
    fields,
    crc: { declared, computed, ok: crcOk },
    payloadFormatIndicator: pfi,
    mode,
    account,
    institutionCode:
      account.institutionType && account.institutionId ? `${account.institutionType}${account.institutionId}` : undefined,
    mcc,
    isP2p: mcc === P2P_MCC,
    currency: get('53'),
    amount,
    country: get('58'),
    recipientName: get('59'),
    recipientCity: get('60'),
    postalCode: get('61'),
    customerLabel: sub(tag62, '06'),
    purpose,
    purposeRequired: purpose === '***',
    signature: { part1, part2, present: Boolean(part1 && part2) },
    errors,
  };
}

/** Human label for a root tag id — used by the "raw fields" inspector. */
export const TAG_NAMES: Record<string, string> = {
  '00': 'Payload Format Indicator',
  '01': 'Point of Initiation',
  '26': 'Recipient Account Info',
  '52': 'Merchant Category Code',
  '53': 'Transaction Currency',
  '54': 'Transaction Amount',
  '58': 'Country Code',
  '59': 'Recipient Name',
  '60': 'Recipient City',
  '61': 'Postal Code',
  '62': 'Additional Data',
  '63': 'CRC',
  '64': 'Language Template',
  '80': 'Signature (part 1)',
  '81': 'Signature (part 2)',
};
