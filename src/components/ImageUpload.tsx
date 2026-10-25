import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { BRAND_BUCKET, supabase } from '../lib/supabase';
import { errorMessage } from '../lib/api';
import { Button } from './ui';

const MAX_BYTES = 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Sube una imagen a <merchant_id>/<carpeta>/... (las políticas de Storage validan el permiso). */
export function ImageUpload({ merchantId, folder, value, onChange, label = 'Logotipo' }: {
  merchantId: string; folder: string; value: string | null; onChange: (url: string | null) => void; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!TYPES.includes(file.type)) return setError('Usá una imagen PNG, JPG o WebP.');
    if (file.size > MAX_BYTES) return setError('La imagen supera 1 MB. Probá con una más liviana.');
    setBusy(true);
    try {
      const ext = file.type.split('/')[1];
      const path = `${merchantId}/${folder}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BRAND_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      onChange(supabase.storage.from(BRAND_BUCKET).getPublicUrl(path).data.publicUrl);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="row">
        <div style={{ width: 64, height: 64, borderRadius: 14, background: 'var(--panel-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          {value ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImagePlus size={22} color="var(--subtle)" />}
        </div>
        <Button size="sm" loading={busy} onClick={() => input.current?.click()}>{value ? 'Cambiar' : 'Subir imagen'}</Button>
        {value && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => onChange(null)}>Quitar</Button>}
        <input ref={input} type="file" accept={TYPES.join(',')} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      </div>
      {error ? <span className="field-error">{error}</span> : <span className="hint">PNG, JPG o WebP de hasta 1 MB. Ideal: cuadrada, 512×512.</span>}
    </div>
  );
}
