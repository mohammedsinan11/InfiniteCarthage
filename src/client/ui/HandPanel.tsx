/**
 * Die eigene Hand als Kartenblatt unten links.
 *
 * Fremde Haende gibt es hier nicht - der Server sendet sie gar nicht erst.
 *
 * Die Symbole sind bewusst gezeichnet und nicht aus den Gelaendekacheln
 * ausgeschnitten: eine Kachel zeigt eine Landschaft, eine Karte soll einen
 * Rohstoff zeigen. Ein Baumstamm liest sich schneller als ein Waldstueck.
 *
 * Karten mit Bestand null bleiben sichtbar, nur blass. Wer sie ausblendet,
 * laesst die Leiste bei jedem Wurf springen, und man verliert die feste
 * Reihenfolge, an der sich das Auge festhaelt.
 */

import { RESOURCES } from '../../core/types';
import type { Resource } from '../../core/types';
import type { Hand } from '../../core/state';
import { resourceName } from '../log';

/** Farben je Rohstoff - abgestimmt auf die Kacheln, aus denen sie stammen. */
const FARBEN: Record<Resource, { hell: string; dunkel: string }> = {
  lumber: { hell: '#4f8a3d', dunkel: '#2f5a26' },
  wool: { hell: '#cfe0b8', dunkel: '#8fb862' },
  grain: { hell: '#e6c65a', dunkel: '#b5932f' },
  brick: { hell: '#c47a4e', dunkel: '#8a4f2e' },
  ore: { hell: '#a8adb8', dunkel: '#6b7079' },
};

/** Kleines Sinnbild je Rohstoff, im Pixel-Stil gehalten. */
function Symbol({ r }: { r: Resource }) {
  const f = FARBEN[r];
  switch (r) {
    case 'lumber': // Baumstamm
      return (
        <g>
          <rect x={7} y={4} width={10} height={16} rx={2} fill={f.hell} />
          <rect x={7} y={4} width={10} height={4} rx={1} fill={f.dunkel} />
          <rect x={10} y={10} width={4} height={2} fill={f.dunkel} />
        </g>
      );
    case 'wool': // Wollknaeuel
      return (
        <g>
          <circle cx={12} cy={12} r={8} fill={f.hell} />
          <path d="M5 12 Q12 6 19 12" stroke={f.dunkel} strokeWidth={1.6} fill="none" />
          <path d="M5 15 Q12 9 19 15" stroke={f.dunkel} strokeWidth={1.6} fill="none" />
        </g>
      );
    case 'grain': // Aehre
      return (
        <g>
          <rect x={11} y={9} width={2} height={11} fill={f.dunkel} />
          <ellipse cx={9} cy={9} rx={3} ry={4} fill={f.hell} />
          <ellipse cx={15} cy={9} rx={3} ry={4} fill={f.hell} />
          <ellipse cx={12} cy={5} rx={3} ry={4} fill={f.hell} />
        </g>
      );
    case 'brick': // Ziegel
      return (
        <g>
          <rect x={3} y={7} width={18} height={5} fill={f.hell} />
          <rect x={3} y={13} width={18} height={5} fill={f.hell} />
          <rect x={11} y={7} width={1.6} height={5} fill={f.dunkel} />
          <rect x={6} y={13} width={1.6} height={5} fill={f.dunkel} />
          <rect x={16} y={13} width={1.6} height={5} fill={f.dunkel} />
        </g>
      );
    case 'ore': // Erzbrocken
      return (
        <g>
          <path d="M6 17 L9 8 L15 6 L19 13 L15 18 Z" fill={f.hell} />
          <path d="M9 8 L15 6 L14 12 Z" fill={f.dunkel} />
        </g>
      );
  }
}

export function HandPanel({ hand }: { hand: Hand }) {
  const total = RESOURCES.reduce((n, r) => n + hand[r], 0);
  return (
    <div className="hand" title={`${total} Karten insgesamt`}>
      {RESOURCES.map((r) => (
        <div
          key={r}
          className={hand[r] === 0 ? 'hand-card leer' : 'hand-card'}
          title={`${resourceName(r)}: ${hand[r]}`}
        >
          <svg viewBox="0 0 24 24" className="hand-symbol" aria-hidden="true">
            <Symbol r={r} />
          </svg>
          <span className="hand-zahl">{hand[r]}</span>
          <span className="hand-name">{resourceName(r)}</span>
        </div>
      ))}
    </div>
  );
}
