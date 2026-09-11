/**
 * Zwei gekreuzte Schwerter ueber einem Feld, auf dem gekaempft wird.
 *
 * PLATZHALTER aus einer Pixelkarte im Kunstpixel der Kacheln (ASSETS.md). Die
 * Parierstangen tragen die Farben der ersten beiden Seiten, damit man sieht,
 * wer da aufeinandertrifft. Liegt kampf.png in src/assets/units, wird
 * stattdessen das Bild gezeigt.
 */

import { spriteUrl } from '../units';

type Farbe = 'blatt' | 'griff' | 'knauf' | 'links' | 'rechts';

/** Ein Schwert von oben links nach unten rechts; das zweite ist sein Spiegelbild. */
const SCHWERT: ReadonlyArray<readonly [number, number, Farbe]> = [
  [0, 0, 'blatt'],
  [1, 1, 'blatt'],
  [2, 2, 'blatt'],
  [3, 3, 'blatt'],
  [4, 4, 'blatt'],
  [5, 5, 'blatt'],
  [6, 6, 'blatt'],
  [8, 6, 'links'],
  [7, 7, 'links'],
  [6, 8, 'links'],
  [8, 8, 'griff'],
  [9, 9, 'knauf'],
];

const BREITE = 10;

const PUNKTE: ReadonlyArray<readonly [number, number, Farbe]> = [
  ...SCHWERT,
  ...SCHWERT.map(([x, y, c]) => [BREITE - 1 - x, y, c === 'links' ? 'rechts' : c] as const),
];

const FEST: Record<'blatt' | 'griff' | 'knauf', string> = {
  blatt: '#dfe3ea',
  griff: '#5e3d25',
  knauf: '#d9a441',
};

export function Schwerter({
  x,
  y,
  k,
  links,
  rechts,
}: {
  /** Mitte, in Welteinheiten. */
  x: number;
  y: number;
  /** Welteinheiten je Kunstpixel. */
  k: number;
  links: string;
  rechts: string;
}) {
  const url = spriteUrl('kampf');
  const x0 = x - (BREITE / 2) * k;
  const y0 = y - (BREITE / 2) * k;
  const farbe = (c: Farbe) => (c === 'links' ? links : c === 'rechts' ? rechts : FEST[c]);
  return (
    <g className="kampf-schwerter" pointerEvents="none" shapeRendering="crispEdges">
      {url ? (
        <image
          href={url}
          x={x - 6 * k}
          y={y - 6 * k}
          width={12 * k}
          height={12 * k}
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <>
          {PUNKTE.map(([px, py]) => (
            <rect
              key={`u${px}:${py}`}
              x={x0 + (px - 1) * k}
              y={y0 + (py - 1) * k}
              width={3 * k}
              height={3 * k}
              fill="#1b130d"
            />
          ))}
          {PUNKTE.map(([px, py, c]) => (
            <rect
              key={`p${px}:${py}`}
              x={x0 + px * k}
              y={y0 + py * k}
              width={k}
              height={k}
              fill={farbe(c)}
            />
          ))}
        </>
      )}
    </g>
  );
}
