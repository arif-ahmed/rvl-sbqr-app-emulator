import { parseTlv, TAG_NAMES, type TlvField } from '../lib/emv';

const TEMPLATES = new Set(['26', '62', '64', '80', '81']);

function subFields(f: TlvField): TlvField[] | null {
  if (!TEMPLATES.has(f.id)) return null;
  try {
    return parseTlv(f.value);
  } catch {
    return null;
  }
}

/** Raw TLV breakdown of a payload, templates expanded one level. */
export function TlvTable({ fields }: { fields: TlvField[] }) {
  return (
    <table className="tlv">
      <thead>
        <tr>
          <th>Tag</th>
          <th>Field</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {fields.flatMap((f) => {
          const subs = subFields(f);
          const row = (
            <tr key={f.id}>
              <td className="mono">{f.id}</td>
              <td>{TAG_NAMES[f.id] ?? 'Unreserved / RFU'}</td>
              <td className="mono-wrap">{subs ? <em>template ({f.length})</em> : f.value}</td>
            </tr>
          );
          return subs
            ? [
                row,
                ...subs.map((s) => (
                  <tr key={`${f.id}.${s.id}`} className="tlv__sub">
                    <td className="mono">
                      {f.id}.{s.id}
                    </td>
                    <td>{subLabel(f.id, s.id)}</td>
                    <td className="mono-wrap">{s.value}</td>
                  </tr>
                )),
              ]
            : [row];
        })}
      </tbody>
    </table>
  );
}

function subLabel(tag: string, sub: string): string {
  if (sub === '00') return 'GUID';
  if (tag === '26') return ({ '01': 'Institution type', '02': 'Institution ID', '03': 'Recipient PAN' } as Record<string, string>)[sub] ?? 'Sub-field';
  if (tag === '62') return ({ '06': 'Customer label', '08': 'Purpose' } as Record<string, string>)[sub] ?? 'Sub-field';
  if (tag === '80' || tag === '81') return sub === '01' ? 'Signature part' : 'Sub-field';
  return 'Sub-field';
}
