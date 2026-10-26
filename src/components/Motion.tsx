import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Aparece con una animación al entrar en pantalla. */
export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'section' | 'li' }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref as any} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</Tag>;
}

/** Inclina su contenido en 3D siguiendo el puntero, con un brillo que acompaña. */
export function Tilt({ children, max = 12, className = '', style }: { children: ReactNode; max?: number; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  function move(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${-y * max}deg`);
    el.style.setProperty('--ry', `${x * max}deg`);
    el.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
  }
  function leave() {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  }
  return <div ref={ref} className={`tilt ${className}`} style={style} onPointerMove={move} onPointerLeave={leave}>{children}<span className="tilt-glare" aria-hidden /></div>;
}

/** Palabra que rota entre opciones con transición. */
export function RotatingWord({ words, interval = 2200 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval]);
  return <span className="rotating" aria-live="polite"><span key={i} className="rotating-word gradient-text">{words[i]}</span></span>;
}

/** Número que cuenta hacia arriba al aparecer. */
export function CountUp({ to, suffix = '', prefix = '', duration = 1200 }: { to: number; suffix?: string; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);
  return <span ref={ref}>{prefix}{v.toLocaleString('es-AR')}{suffix}</span>;
}

/** Lluvia de confeti (CSS) que se dispara cambiando `fire`. */
export function Confetti({ fire, colors = ['#B7F000', '#22D3EE', '#8B5CF6', '#FF4D8D', '#FFC83D'] }: { fire: number; colors?: string[] }) {
  const [pieces, setPieces] = useState<{ id: number; left: number; color: string; delay: number; rot: number; dur: number }[]>([]);
  useEffect(() => {
    if (!fire) return;
    const p = Array.from({ length: 70 }, (_, i) => ({
      id: fire * 100 + i, left: Math.random() * 100, color: colors[i % colors.length],
      delay: Math.random() * 250, rot: Math.random() * 360, dur: 1100 + Math.random() * 900,
    }));
    setPieces(p);
    const t = setTimeout(() => setPieces([]), 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fire]);
  if (!pieces.length) return null;
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p) => <i key={p.id} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}ms`, animationDuration: `${p.dur}ms`, transform: `rotate(${p.rot}deg)` }} />)}
    </div>
  );
}
