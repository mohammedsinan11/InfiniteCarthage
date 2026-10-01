/**
 * Pixelbausteine fuer die Kartenbilder (ui/KartenBild.tsx).
 *
 * Wie die Marken auf dem Brett (board/Marken.tsx) sind die Motive kleine
 * Pixelkarten aus Zeichen: jedes Zeichen eine Farbe, '.' durchsichtig. Ein
 * Kartenbild ist 48 x 32 Kunstpixel gross (ASSETS.md, "Kartenmotive") und wird
 * aus diesen Bausteinen zusammengesetzt - so bekommt jede Karte, auch jede
 * kuenftige, ein Bild, ohne dass jemand eines zeichnet.
 *
 * Gleiche Farben einer Zeile werden zu einem Rechteck zusammengefasst: eine
 * Kartenwahl zeigt drei Bilder, das Menue zwei Dutzend - einzelne Rechtecke
 * je Kunstpixel waeren tausende Knoten.
 *
 * Farben gedaempft und erdig wie die Kacheln (ASSETS.md, "Woran sich eine
 * Zeichnung messen lassen sollte"). PLATZHALTER (ASSETS.md): gezeichnete
 * Motive je Karte koennen jeden Baustein ersetzen.
 */

import type { ReactElement } from 'react';
import type { Resource } from '../../core/types';

export type Pixelkarte = readonly string[];

export const PIX: Record<string, string> = {
  k: '#2a1f16', // Umriss, dunkles Braun - nie reines Schwarz
  K: '#140e09', // tiefster Schatten
  w: '#f2e7d0', // Pergament hell
  p: '#d8c8a8', // Pergament
  P: '#a8937a', // Pergament im Schatten
  y: '#f2c94c', // Gold hell
  g: '#d9a441', // Gold
  G: '#a97c28', // Gold dunkel
  b: '#8a5a2b', // Holz
  B: '#6b4420', // Holz dunkel
  d: '#d2a56a', // Holz, Schnittflaeche
  D: '#9a6b3a', // Jahresring
  n: '#b4633c', // Ziegel
  N: '#7d3f22', // Ziegel dunkel
  m: '#b9b3a6', // Stein hell
  M: '#857e70', // Stein dunkel
  s: '#c9ccd6', // Stahl
  S: '#8a8e9a', // Stahl im Schatten
  r: '#c8402f', // Rot
  R: '#8a2a20', // Rot dunkel
  e: '#6aa85a', // Gruen
  E: '#3f6b32', // Gruen dunkel
  u: '#5aa0d8', // Blau
  U: '#3a6a9a', // Blau dunkel
  v: '#b58ae0', // Violett
  V: '#7a4fa8', // Violett dunkel
  o: '#e8641e', // Flamme
  t: '#f6e07a', // Aehre hell
  T: '#a8801f', // Aehre dunkel
  h: '#f4f2e8', // Wolle, Knochen
  H: '#c9c6b4', // Wolle im Schatten
  c: '#3a3430', // Kohle (Schafsgesicht, Augen)
};

/**
 * Eine Pixelkarte als SVG-Gruppe an (x, y), in Kunstpixeln. farbe ersetzt
 * einzelne Zeichen - so wird aus dem goldenen Wappen ein Sippenwappen.
 */
export function Px({
  karte,
  x = 0,
  y = 0,
  farbe,
  spiegeln = false,
}: {
  karte: Pixelkarte;
  x?: number;
  y?: number;
  farbe?: Record<string, string>;
  spiegeln?: boolean;
}) {
  const rects: ReactElement[] = [];
  karte.forEach((zeile0, zy) => {
    const zeile = spiegeln ? [...zeile0].reverse().join('') : zeile0;
    let start = 0;
    while (start < zeile.length) {
      const c = zeile[start]!;
      let ende = start + 1;
      while (ende < zeile.length && zeile[ende] === c) ende++;
      if (c !== '.' && c !== ' ') {
        const f = farbe?.[c] ?? PIX[c] ?? c;
        rects.push(<rect key={`${zy}:${start}`} x={x + start} y={y + zy} width={ende - start} height={1} fill={f} />);
      }
      start = ende;
    }
  });
  return <g>{rects}</g>;
}

export const breiteVon = (k: Pixelkarte): number => k[0]?.length ?? 0;
export const hoeheVon = (k: Pixelkarte): number => k.length;

/* --- Schrift: Ziffern und Zeichen in 3 x 5 -------------------------------- */

const SCHRIFT: Record<string, Pixelkarte> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  x: ['...', '#.#', '.#.', '#.#', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '=': ['...', '###', '...', '###', '...'],
  '?': ['###', '..#', '.##', '...', '.#.'],
  '>': ['#..', '##.', '###', '##.', '#..'],
  '<': ['..#', '.##', '###', '.##', '..#'],
};

/** Breite eines Textes in der 3x5-Schrift, mit einem Kunstpixel Abstand. */
export const textBreite = (t: string): number => Math.max(0, t.length * 4 - 1);

/** Pixeltext. Mit grund steht er auf einem dunklen Schildchen - lesbar auf jedem Himmel. */
export function PxText({
  text,
  x,
  y,
  farbe = PIX.y!,
  grund,
}: {
  text: string;
  x: number;
  y: number;
  farbe?: string;
  grund?: string;
}) {
  const teile: ReactElement[] = [];
  if (grund) {
    teile.push(<rect key="g" x={x - 1} y={y - 1} width={textBreite(text) + 2} height={7} fill={grund} />);
  }
  [...text].forEach((ch, i) => {
    const g = SCHRIFT[ch];
    if (!g) return;
    teile.push(<Px key={i} karte={g.map((z) => z.replace(/#/g, 'Z'))} x={x + i * 4} y={y} farbe={{ Z: farbe }} />);
  });
  return <g>{teile}</g>;
}

/* --- Rohstoffe ------------------------------------------------------------- */

const HOLZ: Pixelkarte = [
  '...kkkkkkkkkkk.',
  '..kbbbbbbbbkddk',
  '..kBbbBbbBbkdDk',
  '..kbbbbbbbbkddk',
  '.kkkkkkkkkkkkk.',
  'kbbbbbbbbkddk..',
  'kBbbBbbBbkdDk..',
  'kbbbbbbbbkddk..',
  '.kkkkkkkkkkk...',
];

const LEHM: Pixelkarte = [
  'kkkkkkkkkkkk',
  'knnnnNpnnnNk',
  'kNNNNNpNNNNk',
  'kppppppppppk',
  'knnNpnnnnnNk',
  'kNNNpNNNNNNk',
  'kppppppppppk',
  'knnnnNpnnnNk',
  'kNNNNNpNNNNk',
  'kkkkkkkkkkkk',
];

const WOLLE: Pixelkarte = [
  '....hhhhh...',
  '..hhhhhhhhh.',
  '.hhHhhhhhhhh',
  'cchhhhhHhhhh',
  'cwchhhhhhhHh',
  'cccHhhhhhhhh',
  '.c.HhhhHhhH.',
  '...HHHHHHH..',
  '...c.c..c.c.',
  '...c.c..c.c.',
];

const GETREIDE: Pixelkarte = [
  '...t..t...',
  '.t.tTtT.t.',
  '.TtTtTtTt.',
  '..TtTtTT..',
  '...TTTT...',
  '....TT....',
  '...gGGg...',
  '....TT....',
  '...T..T...',
  '..T.TT.T..',
  '.T..TT..T.',
];

const ERZ: Pixelkarte = [
  '...kkkkk...',
  '..kmmsmMk..',
  '.kmsmmMMMk.',
  'kmmmMmsmMMk',
  'kMmsmMmmMMk',
  'kMMmmMMsMMk',
  '.kMMMMMMMk.',
  '..kkkkkkk..',
];

export const ROHSTOFF: Record<Resource, Pixelkarte> = {
  lumber: HOLZ,
  brick: LEHM,
  wool: WOLLE,
  grain: GETREIDE,
  ore: ERZ,
};

/* --- Dinge ------------------------------------------------------------------ */

export const SACK: Pixelkarte = [
  '...kkkk...',
  '....kk....',
  '...kbbk...',
  '..kbbbbk..',
  '.kbbybbbk.',
  'kbbyyybbbk',
  'kbbbybbbbk',
  'kBbbbbbbBk',
  '.kBBBBBBk.',
  '..kkkkkk..',
];

export const WAAGE: Pixelkarte = [
  '.....kk.....',
  'kkkkkyykkkkk',
  '.k...yy...k.',
  '.k...yy...k.',
  'kyk..yy..kyk',
  'yyyy.yy.yyyy',
  '.kk..yy..kk.',
  '.....yy.....',
  '...kkyykk...',
  '..kggggggk..',
];

export const TRUHE: Pixelkarte = [
  '..kkkkkkkk..',
  '.kbbbbbbbbk.',
  'kbbbbbbbbbbk',
  'kkkkkggkkkkk',
  'kBBBBgyBBBBk',
  'kbbbbggbbbbk',
  'kBBBBBBBBBBk',
  'kbbbbbbbbbbk',
  'kkkkkkkkkkkk',
];

export const STERN: Pixelkarte = [
  '....y....',
  '....y....',
  '...yyy...',
  'yyyyyyyyG',
  '.yyyyyyG.',
  '..yyyyG..',
  '..yyGyG..',
  '.yG...yG.',
  '.G.....G.',
];

export const SCHILD: Pixelkarte = [
  'kkkkkkkkkk',
  'ksssssssSk',
  'ksssgsssSk',
  'kssgygssSk',
  'ksssgsssSk',
  'ksssssssSk',
  '.kssssSSk.',
  '.kSsssSSk.',
  '..kSSSSk..',
  '...kSSk...',
  '....kk....',
];

export const WUERFEL: Pixelkarte = [
  '.kkkkkkkkk.',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kPwwwwwwwPk',
  '.kkkkkkkkk.',
];

export const ANKER: Pixelkarte = [
  '...SSS...',
  '...S.S...',
  '...SSS...',
  '.SSSsSSS.',
  '....s....',
  '....s....',
  's...s...s',
  'ss..s..ss',
  '.ss.s.ss.',
  '..sssss..',
];

export const SCHWERTER: Pixelkarte = [
  'ss.......ss',
  'sSs.....sSs',
  '.sSs...sSs.',
  '..sSs.sSs..',
  '...sSsSs...',
  '....sSs....',
  '...sSsSs...',
  '.gsSs.sSsg.',
  '..gg...gg..',
  '.bBg...gBb.',
  'bB.......Bb',
];

export const KREUZ: Pixelkarte = [
  '...kkkkk...',
  '...krrRk...',
  '...krrRk...',
  'kkkkrrRkkkk',
  'krrrrrrrrRk',
  'krrrrrrrrRk',
  'kRRRrrRRRRk',
  'kkkkrrRkkkk',
  '...krrRk...',
  '...kRRRk...',
  '...kkkkk...',
];

export const BOGEN: Pixelkarte = [
  'wb.........',
  'w.b........',
  'w..b.......',
  'w..b....s..',
  'w...b....s.',
  'gsssbssssss',
  'w...b....s.',
  'w..b....s..',
  'w..b.......',
  'w.b........',
  'wb.........',
];

export const BANNER: Pixelkarte = [
  'g........',
  'brrrrrr..',
  'brrryrr..',
  'brryyyrr.',
  'brrryrrr.',
  'brrrrrr..',
  'brrR.Rr..',
  'brR...R..',
  'b........',
  'b........',
  'B........',
];

export const TURM: Pixelkarte = [
  'm.m.m.m.m',
  'mmmmmmmmm',
  'MmmmmmmmM',
  '.mmmkmmm.',
  '.mmmkmmm.',
  '.Mmmmmmm.',
  '.mmmmmmM.',
  '.mmmkkmm.',
  '.mmkKKkm.',
  '.MmkKKkM.',
];

export const HAUS: Pixelkarte = [
  '....RR....',
  '...RrrR...',
  '..RrrrrR..',
  '.RrrrrrrR.',
  'RRRRRRRRRR',
  '.bppppppb.',
  '.bpyppBBb.',
  '.bppppBBb.',
  '.bbbbbbbb.',
];

export const STADT: Pixelkarte = [
  '.m.m........',
  '.mmm........',
  '.mym...RR...',
  '.mmm..RrrR..',
  '.mMm.RrrrrR.',
  '.mmmRRRRRRRR',
  '.mMm.pppppp.',
  '.mmm.pyppBp.',
  '.mMm.ppppBp.',
  'mmmmmpppppp.',
  'MMMMMMMMMMMM',
];

export const STRASSE: Pixelkarte = [
  '....bdb....',
  '....bbb....',
  '...bbdbb...',
  '...bbbbb...',
  '..bbbdbbb..',
  '..bbbbbbb..',
  '.bbbbdbbbb.',
  '.bbbbbbbbb.',
  'bbbbbdbbbbb',
  'BBBBBBBBBBB',
];

export const KARAWANE: Pixelkarte = [
  '...pppppp...',
  '..pppppppp..',
  '..pPpPpPpp..',
  '.bbbbbbbbbb.',
  '.bBBBBBBBBb.',
  '.bbbbbbbbbb.',
  '..kk....kk..',
  '.kmmk..kmmk.',
  '..kk....kk..',
];

export const LAGER: Pixelkarte = [
  '.....r.....',
  '.....rr....',
  '.....b.....',
  '....bBb....',
  '...bbBbb...',
  '..bbkBkbb..',
  '..bbkkkbbB.',
  '.bbkkkkkbB.',
  'BBBBBBBBBBB',
];

export const RUINE: Pixelkarte = [
  '.mm........',
  '.mM.....m..',
  '.mM....mm..',
  '.mM....mM..',
  '.mM.m..mM..',
  '.mM.mM.mM..',
  '.mM.mM.mM..',
  '.mM.mM.mM..',
  'mmmmmmmmmmm',
  'MMMMMMMMMMM',
];

export const AUFTRAG: Pixelkarte = [
  '.bbbbbbbbb.',
  'bBbbbbbbbBb',
  '.ppppppppp.',
  '.pkkkkkkpp.',
  '.ppppppppp.',
  '.pkkkkkppp.',
  '.ppppppppp.',
  'bBbbbbbbbBb',
  '.bbbbbbbbb.',
];

export const MARKT: Pixelkarte = [
  'rprprprprpr',
  'rprprprprpr',
  'RRRRRRRRRRR',
  '.b.......b.',
  '.b.ygt.n.b.',
  '.bbbbbbbbb.',
  '.bBBBBBBBb.',
  '.b.......b.',
  '.b.......b.',
];

export const KARTE: Pixelkarte = [
  'kkkkkkkk',
  'kggggggk',
  'kgppppgk',
  'kgpyypgk',
  'kgpyypgk',
  'kgppppgk',
  'kgpPPpgk',
  'kgppppgk',
  'kggggggk',
  'kkkkkkkk',
];

export const SONNE: Pixelkarte = [
  '.....y.....',
  '.y...y...y.',
  '..y.....y..',
  '....ggg....',
  '...gyyyg...',
  'yy.gyyyg.yy',
  '...gyyyg...',
  '....ggg....',
  '..y.....y..',
  '.y...y...y.',
  '.....y.....',
];

export const SCHAEDEL: Pixelkarte = [
  'g...g...g',
  'gg.ggg.gg',
  'ggggggggg',
  '.hhhhhhh.',
  'hhhhhhhhh',
  'hkkhhhkkh',
  'hkkhhhkkh',
  'hhhhkhhhh',
  '.hhhhhhh.',
  '..hkhkh..',
  '..hhhhh..',
];

export const ORDEN: Pixelkarte = [
  '.rR.Rr.',
  '.rR.Rr.',
  '..rRr..',
  '.ggggg.',
  'gyyyyyg',
  'gyygyyg',
  'gygggyg',
  'gyyyyyg',
  '.ggggg.',
];

export const FLAMME: Pixelkarte = [
  '...o...',
  '..oo...',
  '..oyo..',
  '.oyyo.o',
  '.oywyoo',
  'oyywyyo',
  'oyyyyyo',
  '.ryyyr.',
  '..rrr..',
];

export const STRICHE: Pixelkarte = [
  'p.p.p.p.y',
  'p.p.p.py.',
  'p.p.pyy..',
  'p.p.y.p..',
  'p.yyp.p..',
  'pyp.p.p..',
  'y.p.p.p..',
];

export const PFEIL: Pixelkarte = ['y...', 'yy..', 'yyy.', 'yyyy', 'yyy.', 'yy..', 'y...'];

export const KREISLAUF: Pixelkarte = [
  '..yyyy...',
  '.y....y.y',
  'y......yy',
  'y.....yyy',
  'y........',
  'y.......y',
  '.y.....y.',
  '..yyyyy..',
];

export const VERBOT: Pixelkarte = [
  '...rrrrr...',
  '.rr.....rr.',
  '.r.....rrr.',
  'r.....rr..r',
  'r....rr...r',
  'r...rr....r',
  'r..rr.....r',
  '.rrr.....r.',
  '.rr.....rr.',
  '...rrrrr...',
];

export const KRONE: Pixelkarte = [
  '.k...k...k.',
  'kgk.kgk.kgk',
  'kgggggggggk',
  'kgrgggggugk',
  'kgggggggggk',
  'kkkkkkkkkkk',
];

/* --- Sippenwappen, gross: Aehre, Muenze, Hammer, Schwert, Kompass ---------- */

/** F = Sippenfarbe, f = Sippenfarbe dunkel. */
export const WAPPEN: Record<'ernte' | 'handel' | 'bau' | 'krieg' | 'wildnis', Pixelkarte> = {
  ernte: [
    '....F....',
    '..F.F.F..',
    '..FfFfF..',
    '...FfF...',
    '.F.FfF.F.',
    '.FfFfFfF.',
    '..FfFfF..',
    '...FfF...',
    '....f....',
    '....f....',
  ],
  handel: [
    '..FFFFF..',
    '.FFfffFF.',
    'FFfFFFfFF',
    'FfFFkFFfF',
    'FfFkkkFfF',
    'FfFFkFFfF',
    'FFfFFFfFF',
    '.FFfffFF.',
    '..FFFFF..',
  ],
  bau: [
    'FFFFFFFF.',
    'FFFFFFFFf',
    'ffffffff.',
    '...bb....',
    '...bb....',
    '...bb....',
    '...bb....',
    '...BB....',
    '...BB....',
  ],
  krieg: [
    '....s....',
    '...sSs...',
    '...sSs...',
    '...sSs...',
    '...sSs...',
    '...sSs...',
    '.FFFFFFF.',
    '....f....',
    '....F....',
    '...FfF...',
  ],
  wildnis: [
    '...FFF...',
    '..F...F..',
    '.F..y..F.',
    'F..yy...F',
    'F.ffyyF.F',
    'F...FF..F',
    '.F..F..F.',
    '..F...F..',
    '...FFF...',
  ],
};
