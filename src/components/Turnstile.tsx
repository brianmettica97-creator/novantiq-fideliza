import { useEffect, useRef } from 'react';
import { TURNSTILE_SITE_KEY } from '../lib/supabase';

/** Captcha de Cloudflare Turnstile. Solo se muestra si VITE_TURNSTILE_SITE_KEY está configurada. */
export function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    const render = () => (window as any).turnstile?.render(ref.current, { sitekey: TURNSTILE_SITE_KEY, callback: onToken, language: 'es' });
    if ((window as any).turnstile) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [onToken]);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} />;
}
export const captchaEnabled = Boolean(TURNSTILE_SITE_KEY);
