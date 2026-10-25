import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { CameraOff } from 'lucide-react';
import { Alert, Button } from './ui';

/**
 * Escáner QR con la cámara trasera. Usa BarcodeDetector nativo cuando existe
 * (Android/Chrome) y jsQR como alternativa (iPhone/Safari).
 */
export function QrScanner({ onResult, onCancel }: { onResult: (text: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const Detector = (window as any).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;

    const finish = (text: string) => {
      if (done.current) return;
      done.current = true;
      navigator.vibrate?.(60);
      onResult(text);
    };

    const tick = async () => {
      const v = videoRef.current;
      if (!v || done.current) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes[0]?.rawValue) return finish(codes[0].rawValue);
          } else if (ctx) {
            const w = Math.min(v.videoWidth, 720);
            const h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code?.data) return finish(code.data);
          }
        } catch { /* fotograma ilegible: se reintenta */ }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Ingresá el código manualmente.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute('playsinline', 'true');
        await v.play();
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const name = (e as DOMException).name;
        setError(name === 'NotAllowedError'
          ? 'No diste permiso para usar la cámara. Habilitalo en la configuración del navegador o ingresá el código.'
          : 'No pudimos abrir la cámara. Ingresá el código de la tarjeta manualmente.');
      }
    })();

    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  if (error) {
    return (
      <div className="stack">
        <Alert kind="warn"><CameraOff size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> {error}</Alert>
        <Button onClick={onCancel}>Volver</Button>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="scanner">
        <video ref={videoRef} muted playsInline />
        <div className="scanner-frame" />
        <div className="scanner-line" />
      </div>
      <p className="center muted small mb-0">Apuntá al código QR de la tarjeta del cliente</p>
      <Button onClick={onCancel} variant="ghost">Cancelar</Button>
    </div>
  );
}
