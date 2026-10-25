import { useState } from 'react';
import { Download, Printer, Share2 } from 'lucide-react';
import { downloadQr, QrImage } from '../../components/QrImage';
import { Button, CopyField, Empty, ErrorBox, Loading, PageHeader, Select, Textarea } from '../../components/ui';
import { useMerchant } from '../../context/MerchantContext';
import { q } from '../../lib/api';
import { programType } from '../../lib/constants';
import { SITE_URL, supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import type { Program } from '../../lib/types';

export const joinUrl = (code: string) => `${SITE_URL}/unirse/${code}`;

/** Materiales para compartir: enlace, QR descargable, afiche imprimible y texto para redes. */
export function SharePanel({ program, merchantName }: { program: Program; merchantName: string }) {
  const url = joinUrl(program.join_code);
  const t = programType(program.type);
  const pitch = program.type === 'points'
    ? `Sumá puntos en cada compra en ${merchantName} y canjealos por premios.`
    : `Juntá ${program.stamps_required ?? ''} ${t.units} en ${merchantName} y llevate tu premio.`;
  const [social, setSocial] = useState(`🎁 ¡Llegó ${program.name}! ${pitch}\nSumate gratis desde tu celular, sin descargar apps 👉 ${url}`);
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="stack">
        <CopyField label="Enlace de inscripción" value={url} />
        <div className="row">
          <Button icon={<Download size={16} />} onClick={() => downloadQr(url, `qr-${program.name.toLowerCase().replace(/\s+/g, '-')}.png`)}>Descargar QR</Button>
          <Button icon={<Printer size={16} />} onClick={() => window.print()}>Imprimir afiche</Button>
          {'share' in navigator && <Button icon={<Share2 size={16} />} onClick={() => navigator.share({ title: program.name, text: pitch, url })}>Compartir</Button>}
        </div>
        <Textarea label="Texto para redes y WhatsApp" value={social} onChange={(e) => setSocial(e.target.value)} />
        <div className="row">
          <Button size="sm" onClick={() => navigator.clipboard.writeText(social)}>Copiar texto</Button>
          <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(social)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
        </div>
        <p className="small subtle mb-0">Este QR solo sirve para que el cliente se inscriba. No permite sumar sellos ni puntos: eso siempre lo registra tu equipo.</p>
      </div>
      <div className="poster" style={{ background: program.bg_color, color: program.text_color }}>
        <div className="small" style={{ textTransform: 'uppercase', letterSpacing: '.1em', opacity: .8 }}>{merchantName}</div>
        <h2>{program.name}</h2>
        <p style={{ opacity: .9 }}>{pitch}</p>
        <QrImage value={url} alt="QR para sumarse" />
        <p className="mt-2" style={{ fontWeight: 700, fontSize: '1.2rem', color: program.accent_color }}>Escaneá y sumate gratis</p>
        <p className="small" style={{ opacity: .7 }}>Sin descargar apps · NOVANTIQ Fideliza</p>
      </div>
    </div>
  );
}

export function SharePage() {
  const { merchantId, current } = useMerchant();
  const { data, error, loading, reload } = useAsync(() => q<Program[]>(supabase.from('programs').select('*').eq('merchant_id', merchantId!).eq('status', 'active').order('created_at')), [merchantId]);
  const [sel, setSel] = useState<string>('');
  if (loading) return <Loading />;
  const program = data?.find((p) => p.id === sel) ?? data?.[0];
  return (
    <>
      <div className="no-print"><PageHeader title="Compartir y QR" subtitle="Materiales listos para el mostrador y las redes sociales." /></div>
      <ErrorBox error={error} onRetry={reload} />
      {!program ? <Empty title="No hay tarjetas activas">Publicá una tarjeta para generar su QR de inscripción.</Empty> : (
        <div className="stack">
          {data!.length > 1 && <div className="no-print"><Select label="Tarjeta" value={program.id} onChange={(e) => setSel(e.target.value)}>{data!.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>}
          <SharePanel program={program} merchantName={current!.name} />
        </div>
      )}
    </>
  );
}
