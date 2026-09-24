// Scan & Pay — read a BanglaQR from the gallery (image upload, spec §2.6),
// the camera, or a pasted payload (tester convenience).

import { useEffect, useRef, useState } from 'react';
import { AppBar, Banner, Button, Segmented, Sheet } from '../components/ui';
import { decodeQrFile, decodeVideoFrame } from '../lib/qrImage';
import { useNav, type QrSource } from '../state/nav';

export function Pay() {
  const nav = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');

  const found = (payload: string, source: QrSource) => nav.push({ name: 'decoded', payload, source });

  async function onFile(file?: File) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      found(await decodeQrFile(file), 'upload');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // Live camera scanning loop.
  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const tick = () => {
          if (stopped) return;
          const text = decodeVideoFrame(v);
          if (text) {
            stopped = true;
            stream?.getTracks().forEach((t) => t.stop());
            found(text, 'camera');
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setCamera(false);
        setError(`Camera unavailable: ${(e as Error).message}. Use "Add QR from your gallery" instead.`);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera]);

  return (
    <div className="screen scanner">
      <AppBar title="Scan & Pay" dark />
      <div className="scanner__tabs">
        <Segmented
          value="pay"
          onChange={(v) => v === 'receive' && nav.replace({ name: 'receive', tab: 'STATIC' })}
          options={[
            { value: 'pay', label: 'Pay', icon: 'card' },
            { value: 'receive', label: 'Receive', icon: 'receive' },
          ]}
        />
      </div>

      <div className="scanner__viewport">
        <div className={`scanner__frame ${camera ? 'is-live' : ''}`}>
          {camera && <video ref={videoRef} muted playsInline />}
          <span className="c c--tl" />
          <span className="c c--tr" />
          <span className="c c--bl" />
          <span className="c c--br" />
          {!busy && <span className="scanner__line" />}
          {busy && <span className="spinner spinner--light" />}
        </div>
        <p className="scanner__hint">
          {busy ? 'Reading QR…' : camera ? 'Point the camera at a Bangla QR' : 'Upload a Bangla QR image or turn on the camera'}
        </p>
        {error && (
          <div className="scanner__error">
            <Banner kind="error">{error}</Banner>
          </div>
        )}
      </div>

      <div className="scanner__actions">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="outline-light" icon="image" onClick={() => fileRef.current?.click()} loading={busy}>
          Add QR from your gallery
        </Button>
        <div className="btn-row">
          <Button variant="outline-light" icon="camera" onClick={() => { setError(null); setCamera((c) => !c); }}>
            {camera ? 'Stop camera' : 'Use camera'}
          </Button>
          <Button variant="outline-light" icon="clipboard" onClick={() => setPasteOpen(true)}>
            Paste
          </Button>
        </div>
        <Button icon="qr" onClick={() => nav.replace({ name: 'receive', tab: 'STATIC' })}>
          Show QR Code
        </Button>
      </div>

      <Sheet open={pasteOpen} onClose={() => setPasteOpen(false)}>
        <h3 className="sheet__title">Paste QR payload</h3>
        <p className="muted small">Tester shortcut — paste the raw EMV string (e.g. from the network inspector or a forged-QR script).</p>
        <textarea className="input input--area mono" rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="000201010211…6304ABCD" />
        <Button
          icon="chevronRight"
          disabled={!pasted.trim()}
          onClick={() => {
            setPasteOpen(false);
            found(pasted.trim(), 'paste');
          }}
        >
          Read payload
        </Button>
      </Sheet>
    </div>
  );
}
