import { Link } from 'react-router-dom';

export function BrandLogo({ to = '/', compact }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="brand" aria-label="NOVANTIQ Fideliza, inicio">
      <span className="brand-mark" aria-hidden>N</span>
      {!compact && <span>NOVANTIQ <small>Fideliza</small></span>}
    </Link>
  );
}
