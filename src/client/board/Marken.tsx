/**
 * Feuer und Auftragszeichen auf der Karte.
 *
 * Wie die Schwerter (Schwerter.tsx) als Pixel-SVG ueber dem Gelaende: so
 * koennen sie sich bewegen, ohne dass das ganze Brett neu gezeichnet wird. Die
 * Flammen wechseln zwischen zwei Bildern, das Zeichen wippt - in Stufen, wie es
 * zur Pixelgrafik passt. PLATZHALTER (ASSETS.md).
 */

type Karte = readonly string[];

const FARBEN: Record<string, string> = {
  o: '#e8641e', // Flamme
  r: '#b8341a', // tiefe Glut
  y: '#f7c13c', // heisse Flamme
  w: '#fff3c4', // Kern
  k: '#2a1f16', // Umriss, Kohle
  g: '#d9a441', // Gold
  p: '#f2e7d0', // Pergament
  s: '#c9ccd6', // Silber
  S: '#8a8e9a', // Silber im Schatten
  b: '#3a7ac2', // Saphir
};

/** Die Krone ueber einem Feld, das fuer eine Hauptstadt (fast) geschlossen ist. */
const KRONE: Karte = [
  '.k...k...k.',
  'kgk.kgk.kgk',
  'kgggggggggk',
  'kgrgggggbgk',
  'kgggggggggk',
  'kkkkkkkkkkk',
];
/** Dieselbe Krone in Silber: fast geschlossen, noch nicht bereit. */
const KRONE_FAST: Karte = KRONE.map((z) => z.replace(/g/g, 's').replace(/[rb]/g, 'S'));

const FLAMME_A: Karte = [
  '...o.....',
  '..oo..o..',
  '.ooyo.oo.',
  '.oyyooyo.',
  'ooyyyyyoo',
  'oyywwyyyo',
  'royyyyyor',
  '.rkkkkkr.',
];

const FLAMME_B: Karte = [
  '.....o...',
  '.o..oo...',
  'oo.oyoo..',
  'oyooyyo.o',
  'ooyyyyyoo',
  'oyyywwyyo',
  'royyyyyor',
  '.rkkkkkr.',
];

/** Ein Ausrufezeichen auf einem Pergament: das Ziel eines Auftrags. */
const ZIEL: Karte = [
  '.kkkkk.',
  'kpppppk',
  'kppkppk',
  'kppkppk',
  'kppkppk',
  'kpppppk',
  'kppkppk',
  'kpppppk',
  '.kgggk.',
  '..kgk..',
];

/** Eine Sprechblase mit Fragezeichen: ein Wanderer hat dir etwas anzubieten. */
const ANGEBOT: Karte = [
  '.kkkkkk.',
  'kppppppk',
  'kpkkkkpk',
  'kppppkpk',
  'kpppkppk',
  'kppppppk',
  'kpppkppk',
  '.kkkkkk.',
  '..kk....',
  '..k.....',
];

function Pixel({ karte, x0, y0, k }: { karte: Karte; x0: number; y0: number; k: number }) {
  const out = [];
  for (let zy = 0; zy < karte.length; zy++) {
    const zeile = karte[zy]!;
    for (let zx = 0; zx < zeile.length; zx++) {
      const c = zeile[zx]!;
      if (c === '.') continue;
      out.push(<rect key={`${zx}:${zy}`} x={x0 + zx * k} y={y0 + zy * k} width={k} height={k} fill={FARBEN[c]} />);
    }
  }
  return <>{out}</>;
}

/**
 * Feuer an einer Strasse oder einem Gebaeude. (x, y) ist der Fuss, in
 * Welteinheiten; k Welteinheiten je Kunstpixel. Wer loeschen darf, klickt darauf.
 */
export function Flammen({
  x,
  y,
  k,
  titel,
  onLoeschen,
}: {
  x: number;
  y: number;
  k: number;
  titel: string;
  onLoeschen?: () => void;
}) {
  const breite = FLAMME_A[0]!.length;
  const x0 = x - (breite / 2) * k;
  const y0 = y - FLAMME_A.length * k;
  return (
    <g
      className={onLoeschen ? 'flammen loeschbar' : 'flammen'}
      pointerEvents={onLoeschen ? 'all' : 'none'}
      shapeRendering="crispEdges"
      onClick={onLoeschen}
    >
      <title>{titel}</title>
      {onLoeschen && (
        <rect x={x0 - 4 * k} y={y0 - 4 * k} width={(breite + 8) * k} height={(FLAMME_A.length + 8) * k} fill="transparent" />
      )}
      <g className="flammen-a">
        <Pixel karte={FLAMME_A} x0={x0} y0={y0} k={k} />
      </g>
      <g className="flammen-b">
        <Pixel karte={FLAMME_B} x0={x0} y0={y0} k={k} />
      </g>
    </g>
  );
}

/**
 * Die Krone ueber einem Feld (rules/hauptstadt.ts): silbern, wenn es fast
 * geschlossen ist, golden und wippend, wenn die Hauptstadt dort entstehen kann.
 * Geklickt wird ueber das Brett (Naehe, fuer Maus und Finger gleich).
 */
export function KronenZeichen({
  x,
  y,
  k,
  bereit,
  titel,
}: {
  x: number;
  y: number;
  k: number;
  bereit: boolean;
  titel: string;
}) {
  const karte = bereit ? KRONE : KRONE_FAST;
  const breite = karte[0]!.length;
  return (
    <g className={bereit ? 'krone-zeichen bereit' : 'krone-zeichen fast'} shapeRendering="crispEdges">
      <title>{titel}</title>
      <Pixel karte={karte} x0={x - (breite / 2) * k} y0={y - karte.length * k} k={k} />
    </g>
  );
}

/** Ueber einem Feld: Ziel eines angenommenen Auftrags oder ein Angebot eines Wanderers. */
export function AuftragsZeichen({
  x,
  y,
  k,
  art,
  titel,
}: {
  x: number;
  y: number;
  k: number;
  art: 'ziel' | 'angebot';
  titel: string;
}) {
  const karte = art === 'ziel' ? ZIEL : ANGEBOT;
  const breite = karte[0]!.length;
  return (
    <g className={`auftrag-zeichen ${art}`} pointerEvents="none" shapeRendering="crispEdges">
      <title>{titel}</title>
      <Pixel karte={karte} x0={x - (breite / 2) * k} y0={y - karte.length * k} k={k} />
    </g>
  );
}
