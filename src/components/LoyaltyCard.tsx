import { Bone, Car, Check, Coffee, Croissant, Dumbbell, Heart, IceCreamCone, PawPrint, Scissors, Sandwich, Sparkles, Star, type LucideIcon } from 'lucide-react';
import type { CardLook } from '../lib/types';
import { initials } from '../lib/format';
import { formatCardCode } from '../lib/qr';
import { programType } from '../lib/constants';

export const STAMP_ICON_MAP: Record<string, LucideIcon> = {
  star: Star, coffee: Coffee, heart: Heart, check: Check, scissors: Scissors, paw: PawPrint,
  burger: Sandwich, icecream: IceCreamCone, car: Car, dumbbell: Dumbbell, sparkles: Sparkles, bread: Croissant, bone: Bone,
};

/** Tarjeta de fidelización con la identidad visual del comercio. */
export function LoyaltyCard({ look, compact }: { look: CardLook; compact?: boolean }) {
  const Icon = STAMP_ICON_MAP[look.stampIcon] ?? Star;
  const t = programType(look.type);
  const isSlots = (look.type === 'stamps' || look.type === 'visits') && look.stampsRequired;
  const required = look.stampsRequired ?? 0;
  const filled = isSlots ? (look.balance >= required ? required : look.balance % required) : 0;
  const completed = isSlots ? Math.floor(look.balance / required) : 0;
  const cols = required <= 5 ? required : required <= 10 ? Math.ceil(required / 2) : Math.ceil(required / 3);

  return (
    <div className="lcard" style={{ background: look.bgColor, color: look.textColor }} aria-label={`Tarjeta ${look.name} de ${look.merchantName}`}>
      <div className="lcard-head">
        <div className="lcard-logo" style={{ color: look.accentColor }}>
          {look.logoUrl ? <img src={look.logoUrl} alt="" width={44} height={44} /> : initials(look.merchantName)}
        </div>
        <div className="grow">
          <div className="lcard-merchant">{look.merchantName}</div>
          <div className="lcard-name">{look.name}</div>
        </div>
      </div>

      {isSlots ? (
        <div className="lcard-stamps" style={{ ['--cols' as string]: cols, color: look.accentColor }}>
          {Array.from({ length: required }, (_, i) => (
            <div key={i} className={`lcard-stamp ${i < filled ? 'on' : ''}`} style={i < filled ? { background: look.accentColor, color: look.bgColor, borderColor: look.accentColor } : undefined}>
              {i < filled ? <Icon strokeWidth={2.5} /> : !compact && <span style={{ fontSize: '.7rem', fontWeight: 700 }}>{i + 1}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div className="lcard-points" style={{ color: look.accentColor }}>{look.balance.toLocaleString('es-AR')}</div>
          <div style={{ opacity: .8, fontSize: '.85rem' }}>{t.units} acumulados</div>
        </div>
      )}

      <div className="lcard-foot">
        <div style={{ opacity: .85, minWidth: 0 }}>
          {look.rewardName && <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🎁 {look.rewardName}</div>}
          {isSlots && <div>{filled}/{required} {t.units}{completed > 0 && look.balance >= required ? ' · ¡Premio disponible!' : ''}</div>}
        </div>
        {look.code && <div className="mono" style={{ opacity: .7, fontSize: '.78rem' }}>{formatCardCode(look.code)}</div>}
      </div>
    </div>
  );
}
