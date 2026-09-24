import { describe, expect, it } from 'vitest';
import { crc16, decodeP2pQr, parseTlv } from './emv';

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

function build(parts: string[]): string {
  const body = parts.join('') + '6304';
  return body + crc16(body);
}

const SIG = 'A'.repeat(88);
const account = tlv('26', tlv('00', 'bd.org.bb.npsb') + tlv('01', '00') + tlv('02', '0085') + tlv('03', '01711111111'));
const sigTags = [tlv('80', tlv('00', 'bd.org.bb.npsb') + tlv('01', SIG.slice(0, 44))), tlv('81', tlv('00', 'bd.org.bb.npsb') + tlv('01', SIG.slice(44)))];

describe('crc16', () => {
  it('matches the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

describe('parseTlv', () => {
  it('rejects truncated values', () => {
    expect(() => parseTlv('0005ab')).toThrow(/declares 5/);
  });
});

describe('decodeP2pQr', () => {
  it('decodes a static P2P QR', () => {
    const raw = build([
      tlv('00', '01'), tlv('01', '11'), account, tlv('52', '4829'), tlv('53', '050'), tlv('58', 'BD'),
      tlv('59', 'AreebaNawar'), tlv('60', 'Dhaka'), tlv('62', tlv('06', 'FT')), ...sigTags,
    ]);
    const qr = decodeP2pQr(raw);
    expect(qr.errors).toEqual([]);
    expect(qr.crc.ok).toBe(true);
    expect(qr.mode).toBe('STATIC');
    expect(qr.isP2p).toBe(true);
    expect(qr.institutionCode).toBe('000085');
    expect(qr.account.pan).toBe('01711111111');
    expect(qr.customerLabel).toBe('FT');
    expect(qr.amount).toBeUndefined();
    expect(qr.signature.present).toBe(true);
  });

  it('decodes a dynamic P2P QR with amount and purpose prompt', () => {
    const raw = build([
      tlv('00', '01'), tlv('01', '12'), account, tlv('52', '4829'), tlv('53', '050'), tlv('54', '500.00'),
      tlv('58', 'BD'), tlv('59', 'Karim'), tlv('60', 'Dhaka'), tlv('62', tlv('08', '***')), ...sigTags,
    ]);
    const qr = decodeP2pQr(raw);
    expect(qr.errors).toEqual([]);
    expect(qr.mode).toBe('DYNAMIC');
    expect(qr.amount).toBe('500.00');
    expect(qr.purposeRequired).toBe(true);
  });

  it('flags a tampered payload via CRC', () => {
    const raw = build([tlv('00', '01'), tlv('01', '11'), account, tlv('52', '4829'), tlv('53', '050'), tlv('58', 'BD'), tlv('59', 'Karim'), tlv('60', 'Dhaka')]);
    const tampered = raw.replace('Karim', 'Kerim');
    const qr = decodeP2pQr(tampered);
    expect(qr.crc.ok).toBe(false);
    expect(qr.errors.some((e) => e.includes('CRC mismatch'))).toBe(true);
  });

  it('flags a dynamic QR without an amount', () => {
    const raw = build([tlv('00', '01'), tlv('01', '12'), account, tlv('52', '4829'), tlv('53', '050'), tlv('58', 'BD'), tlv('59', 'Karim'), tlv('60', 'Dhaka')]);
    expect(decodeP2pQr(raw).errors).toContain('Dynamic QR must carry a Transaction Amount (Tag 54)');
  });

  it('decodes the reference dynamic sample (031008, placeholder signature)', () => {
    const qr = decodeP2pQr(
      '00020101021226510014bd.org.bb.npsb01020302041008031501790220001123452044829530305054071250.005802BD5912Farhan Ahmed6005Dhaka6104121262140602FT0804Gift80660014bd.org.bb.npsb0144AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA81660014bd.org.bb.npsb0144AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==63040CF0',
    );
    expect(qr.errors).toEqual([]);
    expect(qr.crc).toMatchObject({ declared: '0CF0', ok: true });
    expect(qr.mode).toBe('DYNAMIC');
    expect(qr.institutionCode).toBe('031008');
    expect(qr.account.pan).toBe('017902200011234');
    expect(qr.amount).toBe('1250.00');
    expect(qr).toMatchObject({ recipientName: 'Farhan Ahmed', postalCode: '1212', customerLabel: 'FT', purpose: 'Gift' });
    expect((qr.signature.part1 ?? '') + (qr.signature.part2 ?? '')).toHaveLength(88);
  });

  it('rejects a sample whose Tag 26 lengths and CRC are inconsistent', () => {
    const qr = decodeP2pQr(
      '00020101021226500013bd.org.bb.npsb01020302041008031501790220001123452044829530305054071250.005802BD5912Farhan Ahmed6005Dhaka6104121262210609Farhan A.0804Gift8002018188iHvhoWYG0NFUjjEsDTjJjmz3eMcaqvLfKFQxBvpqS0nHQCbIpR4LgycNZaeg4zqZYqiXoWC21begvt0+Iccchw==6304C4D9',
    );
    expect(qr.crc.ok).toBe(false);
    expect(qr.errors.length).toBeGreaterThan(0);
  });

  it('classifies non-P2P MCC', () => {
    const raw = build([tlv('00', '01'), tlv('01', '11'), account, tlv('52', '5411'), tlv('53', '050'), tlv('58', 'BD'), tlv('59', 'Shop'), tlv('60', 'Dhaka')]);
    expect(decodeP2pQr(raw).isP2p).toBe(false);
  });
});
