import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export async function qrDataUrl(value: string, size = 640): Promise<string> {
  return QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 1, width: size, color: { dark: '#0B0B0DFF', light: '#FFFFFFFF' } });
}

export function QrImage({ value, alt = 'Código QR', size = 640 }: { value: string; alt?: string; size?: number }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    let alive = true;
    qrDataUrl(value, size).then((u) => alive && setSrc(u));
    return () => { alive = false; };
  }, [value, size]);
  return <div className="qr-box">{src ? <img src={src} alt={alt} width={size} height={size} /> : <div className="skeleton" style={{ aspectRatio: '1' }} />}</div>;
}

export async function downloadQr(value: string, filename: string) {
  const url = await qrDataUrl(value, 1200);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}
