/**
 * Die fuenf Rohstoffe als Sinnbild.
 *
 * An EINER Stelle, weil dieselben Bilder an mehreren Orten auftauchen: auf
 * der Handkarte, auf der Karte, die vom Feld heranfliegt, und spaeter im
 * Handel. Zwei Zeichnungen desselben Rohstoffs waeren zwei Gelegenheiten,
 * sie auseinanderlaufen zu lassen.
 *
 * Der Entwurf zielt auf Erkennbarkeit bei kleiner Groesse, nicht auf Details:
 * kraeftige Umrisse, wenige Farben, deutlich verschiedene Silhouetten. Ein
 * Baumstamm und ein Erzbrocken duerfen sich auf 20 Pixel nicht aehneln.
 */

import type { Resource } from '../../core/types';

/** Grundfarbe je Rohstoff - dieselbe Familie wie die Gelaendekacheln. */
export const RES_COLOR: Record<Resource, { bg: string; hell: string; dunkel: string }> = {
  lumber: { bg: '#3f6b32', hell: '#8a6a3f', dunkel: '#5a4526' },
  wool: { bg: '#8fb862', hell: '#f4f2e8', dunkel: '#c9c6b4' },
  grain: { bg: '#d9b23f', hell: '#f6e07a', dunkel: '#a8801f' },
  brick: { bg: '#b4633c', hell: '#d98a5c', dunkel: '#7d3f22' },
  ore: { bg: '#8b8b93', hell: '#c3c8d2', dunkel: '#5a5f6a' },
};

/** Nur das Sinnbild, ohne Kartenrahmen - fuer den Einsatz in eigenem Rahmen. */
export function ResourceGlyph({ r }: { r: Resource }) {
  const c = RES_COLOR[r];
  switch (r) {
    case 'lumber': // gestapelte Staemme, von vorn gesehen
      return (
        <g>
          <rect x={4} y={12} width={16} height={7} rx={3} fill={c.hell} stroke={c.dunkel} strokeWidth={1.4} />
          <rect x={7} y={5} width={16} height={7} rx={3} fill={c.hell} stroke={c.dunkel} strokeWidth={1.4} />
          <circle cx={20} cy={8.5} r={2.2} fill={c.dunkel} />
          <circle cx={17} cy={15.5} r={2.2} fill={c.dunkel} />
        </g>
      );
    case 'wool': // Schaf im Profil
      return (
        <g>
          <ellipse cx={13} cy={13} rx={9} ry={7} fill={c.hell} stroke={c.dunkel} strokeWidth={1.4} />
          <circle cx={6} cy={10} r={4} fill="#3a3430" />
          <circle cx={4.6} cy={9} r={0.9} fill="#f4f2e8" />
          <rect x={9} y={18} width={2} height={4} fill="#3a3430" />
          <rect x={16} y={18} width={2} height={4} fill="#3a3430" />
        </g>
      );
    case 'grain': // Garbe aus drei Aehren
      return (
        <g>
          <path d="M12 22 L12 9" stroke={c.dunkel} strokeWidth={2} />
          <path d="M7 20 L12 12 M17 20 L12 12" stroke={c.dunkel} strokeWidth={1.6} />
          <ellipse cx={12} cy={5} rx={3} ry={4.5} fill={c.hell} stroke={c.dunkel} strokeWidth={1.2} />
          <ellipse cx={6.5} cy={9} rx={2.6} ry={4} fill={c.hell} stroke={c.dunkel} strokeWidth={1.2} transform="rotate(-25 6.5 9)" />
          <ellipse cx={17.5} cy={9} rx={2.6} ry={4} fill={c.hell} stroke={c.dunkel} strokeWidth={1.2} transform="rotate(25 17.5 9)" />
        </g>
      );
    case 'brick': // Ziegelmauer im Verband
      return (
        <g>
          <rect x={2} y={6} width={20} height={5.5} fill={c.hell} stroke={c.dunkel} strokeWidth={1.3} />
          <rect x={2} y={12.5} width={20} height={5.5} fill={c.hell} stroke={c.dunkel} strokeWidth={1.3} />
          <rect x={11} y={6} width={1.6} height={5.5} fill={c.dunkel} />
          <rect x={6} y={12.5} width={1.6} height={5.5} fill={c.dunkel} />
          <rect x={16} y={12.5} width={1.6} height={5.5} fill={c.dunkel} />
        </g>
      );
    case 'ore': // Erzbrocken mit Bruchkante
      return (
        <g>
          <path d="M4 18 L8 7 L15 5 L20 12 L16 20 Z" fill={c.hell} stroke={c.dunkel} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M8 7 L15 5 L13 13 Z" fill={c.dunkel} opacity={0.75} />
          <path d="M13 13 L20 12 L16 20 Z" fill={c.dunkel} opacity={0.35} />
        </g>
      );
  }
}

/**
 * Eine vollstaendige Karte: farbiger Grund, Rahmen, Sinnbild.
 *
 * Der farbige Grund traegt viel zur Erkennbarkeit bei - man sieht schon am
 * Rand, welche Sorte es ist, bevor man das Bild erfasst hat.
 */
export function ResourceCard({ r, size = 1 }: { r: Resource; size?: number }) {
  const c = RES_COLOR[r];
  return (
    <svg viewBox="0 0 24 32" width={24 * size} height={32 * size} className="res-card">
      <rect x={0.8} y={0.8} width={22.4} height={30.4} rx={2} fill={c.bg} stroke="#2a2016" strokeWidth={1.6} />
      <rect x={3} y={3} width={18} height={20} rx={1.5} fill="#f2e7d0" stroke="#2a2016" strokeWidth={1} />
      <g transform="translate(3 4.5) scale(0.75)">
        <ResourceGlyph r={r} />
      </g>
    </svg>
  );
}
