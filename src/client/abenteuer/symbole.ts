/**
 * Pixelbilder der Gegenstaende im Abenteuer - im Stil der Kartenmotive
 * (ui/KartenPixel.tsx, gleiche Palette). PLATZHALTER (ASSETS.md).
 */

import { FLAMME, SACK, SCHILD, TRUHE } from '../ui/KartenPixel';
import type { Pixelkarte } from '../ui/KartenPixel';

const SCHWERT: Pixelkarte = [
  '.......kk',
  '......ksk',
  '.....kssk',
  '....kssk.',
  '.k.kssk..',
  '.kkssk...',
  '..kgk....',
  '.kgkk....',
  'kgk......',
];

const AXT: Pixelkarte = [
  '...kkkk..',
  '..kssssk.',
  '.ksssssk.',
  '.kssbbkk.',
  '..kkbk...',
  '....bk...',
  '....bk...',
  '....bk...',
  '....kk...',
];

const HELM: Pixelkarte = [
  '..kkkkk..',
  '.ksssssk.',
  'ksssssssk',
  'ksSkkkSsk',
  'ksSk.kSsk',
  'kSSk.kSSk',
  '.kk...kk.',
];

const RUESTUNG: Pixelkarte = [
  '.kk...kk.',
  'ksskkkssk',
  'kssssssk.',
  '.ksSsSsk.',
  '.kssssk..',
  '.ksSsSsk.',
  '.kssssssk',
  '..kkkkkk.',
];

/** Reitstiefel: Stulpe, Schnalle, Absatz, ein Glanzlicht auf dem Leder. */
const STIEFEL: Pixelkarte = [
  '..kkkkkk..',
  '..kddddk..',
  '..kbbbBk..',
  '..kbwbBk..',
  '..kyybBk..',
  '..kbbbBkk.',
  '.kbwbbbbBk',
  'kbbbbbbbBk',
  'kBBBBBBBBk',
  'kkkkkkkkk.',
];

const KRAUT: Pixelkarte = [
  '...ke....',
  '..keEk...',
  '.keEek.k.',
  '..kEk.kek',
  '.k.k.keEk',
  'kek.k.kk.',
  '.kEkk....',
  '..kk.....',
];

const GELEE: Pixelkarte = [
  '...kkk...',
  '..keeek..',
  '.keweeek.',
  'keeeeeEk.',
  'keEeeeEk.',
  '.kEEEEk..',
  '..kkkk...',
];

const HERZ: Pixelkarte = [
  '.kk.kk.',
  'krrkrrk',
  'krwrrrk',
  'krrrrrk',
  '.krrrk.',
  '..krk..',
  '...k...',
];

/** Die linke Haelfte eines Herzens, rechts nur der Umriss. */
const HALBHERZ: Pixelkarte = [
  '.kk.kk.',
  'krrk..k',
  'krwk..k',
  'krrk..k',
  '.krk.k.',
  '..kkk..',
  '...k...',
];

/** Das Auge fuer die Sicht im Wertefenster. */
const AUGE: Pixelkarte = [
  '..kkkkk..',
  '.kwwwwwk.',
  'kwwuUuwwk',
  'kwuUcUuwk',
  'kwwuUuwwk',
  '.kwwwwwk.',
  '..kkkkk..',
];

/**
 * Der Ritter des Abenteuers: Helm mit rotem Busch, blauer Waffenrock mit
 * goldenem Kreuz, Schild links, die rechte Hand frei - die Waffe ist ein
 * eigenes Bild (WAFFE), das in der Hand sitzt und sich dreht: so sieht man
 * sie, und spaeter traegt er andere. Zwei Bilder: stehend und im Schritt.
 */
export const RITTER_KOERPER: Pixelkarte = [
  '......rr......',
  '.....rRrr.....',
  '.....kkkkk....',
  '....kwsssSk...',
  '....kskkkSk...',
  '....ksssSSk...',
  '.....kSSSk....',
  '...kkkuyukkk..',
  'kkkkuuyuuSsk..',
  'kuyukuyyyuksk.',
  'kyyykuuyuukbbk',
  'kuyukbbybbkkk.',
  '.kuk.kuUuUk...',
  '..k..kSkSk....',
  '.....kSkSk....',
  '....kBBkBBk...',
];
export const RITTER_SCHRITT: Pixelkarte = [
  '......rr......',
  '.....rRrr.....',
  '.....kkkkk....',
  '....kwsssSk...',
  '....kskkkSk...',
  '....ksssSSk...',
  '.....kSSSk....',
  '...kkkuyukkk..',
  'kkkkuuyuuSsk..',
  'kuyukuyyyuksk.',
  'kyyykuuyuukbbk',
  'kuyukbbybbkkk.',
  '.kuk.kuUuUk...',
  '..k.kSk.kSk...',
  '....kSk..kSk..',
  '...kBBk..kBBk.',
];
/** Wo im Ritterbild die Hand sitzt (Kunstpixel, Mitte des Handschuhs). */
export const RITTER_HAND = { x: 12.5, y: 10.5 };

/** Waffen in der Hand, Klinge nach oben. Der Griff sitzt bei WAFFE_GRIFF. */
export const WAFFE: Record<string, Pixelkarte> = {
  schwert: [
    '...k...',
    '..kwk..',
    '..kwSk.',
    '..kwSk.',
    '..kwSk.',
    '..kwSk.',
    '..kwSk.',
    '..kwSk.',
    'kkgyykk',
    'kGGgGGk',
    '..kbk..',
    '..kbk..',
    '..kyk..',
    '...k...',
  ],
  breitschwert: [
    '...kk..',
    '..kwsk.',
    '..kwsSk',
    '..kwsSk',
    '..kwsSk',
    '..kwsSk',
    '..kwsSk',
    '..kwsSk',
    'kkgyygk',
    'kGGgGGk',
    '..kbk..',
    '..kbk..',
    '..kyk..',
    '...k...',
  ],
  runenklinge: [
    '...k...',
    '..kwk..',
    '..kwUk.',
    '..kuUk.',
    '..kwyk.',
    '..kuUk.',
    '..kwUk.',
    '..kuyk.',
    'kkVvvkk',
    'kVVvVVk',
    '..kbk..',
    '..kbk..',
    '..kvk..',
    '...k...',
  ],
  flammenschwert: [
    '...y...',
    '..kyk..',
    '..kyok.',
    '..koyk.',
    '..kyok.',
    '..koRk.',
    '..kyok.',
    '..korRk',
    'kkNnnkk',
    'kNNnNNk',
    '..kbk..',
    '..kbk..',
    '..kok..',
    '...k...',
  ],
  axt: [
    '...kkkk',
    '..kssSk',
    '..kbsSk',
    '..kbkkk',
    '..kbk..',
    '..kbk..',
    '..kbk..',
    '..kbk..',
    '..kbk..',
    '..kbk..',
    '..kbk..',
    '..kbk..',
    '..kBk..',
    '...k...',
  ],
};
export const WAFFE_GRIFF = { x: 3.5, y: 10.5 };

/**
 * Die Schleime, je nach Art in eigener Farbe und Form:
 * gewoehnlich gruen, Spuckschleim blau mit rundem Maul, Springschleim gelb
 * mit Fuehlern, Panzerschleim grau mit Steinplatten.
 */
export const SCHLEIM_BILD: Record<'schleim' | 'spuck' | 'spring' | 'panzer' | 'gift' | 'teil' | 'geist' | 'bandit', Pixelkarte> = {
  // Bandit: als Figur gezeichnet (Kachelstil) - dies ist nur sein Kopf fuer kleine Bilder.
  bandit: ['..ooo..', '.oqqqo.', 'oqsqsqo', 'oqqqqqo', '.oQQQo.', '.ooooo.'],
  // Giftschleim: violett, tropft - hinterlaesst Pfuetzen.
  gift: ['...ooo...', '..oPPPo..', '.oPLPPPo.', 'oPoPPoPpo', 'oPPPPPPpo', 'opPpPpppo', '.oooPooo.', '....p....'],
  // Teilschleim: zwei Lappen, eine Naht in der Mitte - zerfaellt in zwei.
  teil: ['.ooo.ooo.', 'oOfOoOOOo', 'oOoOoOoFo', 'oOOOoOOFo', 'oFOOoOFFo', '.ooooooo.'],
  // Geisterschleim: blass, ohne dunklen Umriss, mit welligem Saum.
  geist: ['...aaa...', '..aAAAa..', '.aAAAAAa.', 'aAoAAoAAa', 'aAAAAAAAa', 'aAAAAAAAa', 'aAaAaAaAa'],
  // Gewoehnlich: ein runder Klumpen, der quillt und sackt.
  schleim: ['...ooo...', '..oGGGo..', '.oGLGGGo.', 'oGoGGoGgo', 'oGGGGGGgo', 'ogGGGGggo', '.ooooooo.'],
  // Spuckschleim: tropfenfoermig, mit rundem Maul zur Seite - blaest die Backen auf.
  spuck: ['....o.....', '...oBo....', '..oBLBo...', '.oBLBBBo..', 'oBoBBoBboo', 'oBBBBBBbon', 'obBBBBbboo', '.oooooooo.'],
  // Springschleim: gelb, mit Fuehlern, auf einer Sprungfeder - huepft auf der Stelle.
  spring: ['..o...o..', '..Y...Y..', '..ooooo..', '.oYfYYyo.', 'oYoYYoYyo', 'oYYYYYyyo', '.ooooooo.', '...omo...', '...mom...', '..ooooo..'],
  // Panzerschleim: flach und breit unter einem Steinpanzer - lugt nur hervor.
  panzer: ['...ooooo...', '..olLlmlo..', '.olmlmmlmo.', 'omlmmlmmlmo', 'oGGoGGoGGgo', 'ogGGGGGGggo', '.ooooooooo.'],
};

/** Deko auf der Karte: Kakteen in der Wueste, Blumen auf Wiesen, Pilze im Wald. */
export const DEKO: Record<'kaktus' | 'blume' | 'pilz', Pixelkarte> = {
  kaktus: ['..g..', 'g.G..', 'gGG.g', '.gGGg', '..Gg.', '..Gg.'],
  blume: ['.R.', 'RYR', '.g.'],
  pilz: ['RLR', 'RRR', '.l.'],
};

/** Der Schattenschleim: dunkelviolett, mit Hoernern und rot gluehenden Augen. */
export const SCHATTENSCHLEIM: Pixelkarte = [
  '..k.........k..',
  '.kVk.......kVk.',
  '.kVVkkkkkkkVVk.',
  '..kVVVVVVVVVk..',
  '.kVvVVVVVVVvVk.',
  'kVVrrVVVVVrrVVk',
  'kVVVVVVVVVVVVVk',
  'kVvVVkkkkkVVvVk',
  'kVVVVVVVVVVVVVk',
  '.kVvVVvVVvVVvk.',
  '..kkkkkkkkkkk..',
];

/** Der Pentagrammschleim: violett, mit goldenem Pentagramm auf dem Leib und spitzer Kapuze. */
export const PENTASCHLEIM: Pixelkarte = [
  '.......k.......',
  '......kVk......',
  '.....kVVVk.....',
  '....kVrVrVk....',
  '...kVVVVVVVk...',
  '..kVVVVyVVVVk..',
  '.kVVVVyVyVVVVk.',
  'kVyyyyyyyyyyyVk',
  'kVVVyVVVVVyVVVk',
  'kVVVVyVyVyVVVVk',
  'kvVVyVVVVVyVVvk',
  '.kkkkkkkkkkkkk.',
];

/** Der Gelee-Koloss: riesig, tuerkis, viele Augen. */
export const GELEEKOLOSS: Pixelkarte = [
  '.....kkkkkkk.....',
  '...kkuuuuuuukk...',
  '..kuuwwuuuuuuUk..',
  '.kuuwuuuuuuuuuUk.',
  '.kuucuuucuuucuUk.',
  'kuuuuuuuuuuuuuuUk',
  'kuuuuUUUUUUUuuuUk',
  'kuuuUcccccccUuuUk',
  'kuuuuUUUUUUUuuUUk',
  'kUuuuuuuuuuuuuUUk',
  '.kUUuuUuuUuuUUUk.',
  '..kkkkkkkkkkkkk..',
];

/** Schneehase - neutral, huepft und flieht (Kachelpalette). Zwei Bilder: sitzend, im Sprung. */
export const HASE: [Pixelkarte, Pixelkarte] = [
  ['.a.a..', '.H.H..', '.HHH..', 'HoHHH.', 'HHHHHH', '.HHHHa', '.aa.a.'],
  ['..a.a.', '..H.H.', '.HHHH.', 'HoHHHH', 'HHHHHa', 'aa..aa', '......'],
];

/** Schaf - neutral, grast auf Wiesen (Palette PIX: h Wolle, c Gesicht). Zwei Bilder: steht, grast. */
export const SCHAF: [Pixelkarte, Pixelkarte] = [
  ['...hhhh..', 'cchhhhhhh', 'cchhhhhhH', '.hhhhhhHH', '..c..c.c.'],
  ['...hhhh..', '..hhhhhhh', 'chhhhhhhH', 'chhhhhhHH', '..c..c.c.'],
];

/** Der Schleimkoenig: ein breiter Klumpen mit goldener Krone und rotem Stein. */
export const SCHLEIMKOENIG: Pixelkarte = [
  '....y..r..y....',
  '....yy.y.yy....',
  '....yyyyyyy....',
  '...kkkkkkkkk...',
  '..keeeeeeeeEk..',
  '.keweeeeeweeEk.',
  '.kecceeeecceEk.',
  'keeeeeeeeeeeeEk',
  'keeeeccccceeeEk',
  'kEeeeeeeeeeeEEk',
  '.kkkkkkkkkkkkk.',
];

/** Eine Pixelkarte mit anderen Farben - fuer Klingen aus anderem Stoff. */
const umfaerben = (karte: Pixelkarte, farben: Record<string, string>): Pixelkarte =>
  karte.map((z) => [...z].map((c) => farben[c] ?? c).join(''));

const BREITSCHWERT: Pixelkarte = [
  '......kkk',
  '.....kwsk',
  '....kwssk',
  '...kwssk.',
  '.k.kssk..',
  '.kkssk...',
  '..kgk....',
  '.kgkk....',
  'kgk......',
];

/** Solo-Leveling: ein blaues Systemfenster mit leuchtendem Pfeil nach oben. */
const SOLO_LEVELING: Pixelkarte = [
  '.kkkkkkk.',
  'kUUUuUUUk',
  'kUUuwuUUk',
  'kUuwwwuUk',
  'kUUUwUUUk',
  'kUUUwUUUk',
  'kUuuwuuUk',
  'kUUUUUUUk',
  '.kkkkkkk.',
];

/** Der leere Herzcontainer: roter Rand, dunkles Inneres. */
const HERZCONTAINER: Pixelkarte = [
  '.kk.kk.',
  'krrkrrk',
  'krKKKrk',
  'krKKKrk',
  '.krKrk.',
  '..krk..',
  '...k...',
];

const ANGEL: Pixelkarte = [
  '........k',
  '.......kb',
  '......kbw',
  '.....kb.w',
  '....kb..w',
  '...kb...w',
  '..kb....w',
  '.kb....kw',
  'kb......k',
];

/** Holz: zwei Scheite mit Schnittflaeche. */
const HOLZ: Pixelkarte = ['.kkkkkkk.', 'kdDbbbbbk', 'kDdbbBBbk', '.kkkkkkkk', 'kdDbbbbbk', 'kDdbbBBbk', '.kkkkkkk.'];

const FISCH: Pixelkarte = ['..kkkk..k', '.kuuuukkk', 'kwcuuuuUk', '.kUUUUkkk', '..kkkk..k'];

/** Extra-Leben: ein goldenes Herz. */
const EXTRALEBEN: Pixelkarte = ['.kk.kk.', 'kyykyyk', 'kywyyyk', 'kyyyyyk', '.kyyyk.', '..kyk..', '...k...'];

/** Hermes-Stiefel: ein goldener Stiefel mit weissem Fluegel. */
const HERMES: Pixelkarte = ['ww.kkk...', '.wwkyk...', '..wkyk...', '...kyykk.', '..kyyyyyk', '..kggggGk', '...kkkkk.'];

/** Eine Goldmuenze - fuer den Zaehler ueber dem Inventar. */
export const MUENZE: Pixelkarte = ['..kkk..', '.kyyyk.', 'kywyygk', 'kyyyygk', 'kyyyggk', '.kgggk.', '..kkk..'];

/** Pentagrammmeister: ein violetter Stern im Kreis. */
const PENTAGRAMM: Pixelkarte = [
  '..kkkkk..',
  '.kV.v.Vk.',
  'kV.vVv.Vk',
  'kvvvvvvvk',
  'kV.vVv.Vk',
  'kV.v.v.Vk',
  'kVv.V.vVk',
  '.kVVVVVk.',
  '..kkkkk..',
];

export const SYMBOL: Record<string, Pixelkarte> = {
  schwert: SCHWERT,
  breitschwert: BREITSCHWERT,
  runenklinge: umfaerben(SCHWERT, { s: 'u', g: 'v' }),
  flammenschwert: umfaerben(SCHWERT, { s: 'o', g: 'N' }),
  axt: AXT,
  schild: SCHILD,
  helm: HELM,
  ruestung: RUESTUNG,
  stiefel: STIEFEL,
  laterne: FLAMME,
  kraut: KRAUT,
  herz: HERZ,
  halbherz: HALBHERZ,
  // Gold liegt als Muenze da; der Beutel ist das Taeschchen mit Zufallsinhalt.
  gold: MUENZE,
  beutel: SACK,
  gelee: GELEE,
  truhe: TRUHE,
  schatz: umfaerben(TRUHE, { b: 'y', B: 'G', g: 'R', y: 'w' }),
  sololeveling: SOLO_LEVELING,
  angel: ANGEL,
  fisch: FISCH,
  holz: HOLZ,
  extraleben: EXTRALEBEN,
  hermes: HERMES,
  pentagramm: PENTAGRAMM,
  muenze: MUENZE,
  herzcontainer: HERZCONTAINER,
  auge: AUGE,
};

/** Eine Pixelkarte auf ein Canvas - fuer Funde auf der Karte. */
export function zeichnePixel(ctx: CanvasRenderingContext2D, karte: Pixelkarte, x: number, y: number, f: number, palette: Record<string, string>): void {
  karte.forEach((zeile, zy) => {
    for (let zx = 0; zx < zeile.length; zx++) {
      const c = zeile[zx]!;
      if (c === '.' || c === ' ') continue;
      ctx.fillStyle = palette[c] ?? c;
      ctx.fillRect(x + zx * f, y + zy * f, f, f);
    }
  });
}

// --- Figuren im Stil der Kacheln (Debugfenster: Figur) ----------------------
//
// Spieltest: "Die Animation gefaellt mir nicht ... passend zu den Tiles?"
// Die Kacheln (hexmap von Astropulse) sind fein: ein Baum ist 4 bis 6 Pixel
// breit, die Farben sind gedeckt, Umrisse gibt es kaum, Licht von links oben.
// Diese Figuren halten sich daran: 11 x 14 Pixel, nur Farben der Kacheln,
// Umriss im dunkelsten Kachelton, und echte Einzelbilder statt gedrehter Waffe.

/** Die Palette der Kacheln - und ein paar Toene fuer Haut, Haar, Feuer. */
export const KACHEL_PIX: Record<string, string> = {
  o: '#172323',
  L: '#d4e8f3',
  l: '#b9c3cc',
  m: '#7d7c82',
  n: '#474b56',
  B: '#4d919e',
  b: '#327297',
  Y: '#e0c26d',
  y: '#b6a444',
  R: '#b0483a',
  r: '#6c2f2a',
  W: '#8a6048',
  w: '#5f4036',
  d: '#2b211a',
  G: '#6fad42',
  g: '#3d6a45',
  h: '#254b3c',
  s: '#d79a6e',
  S: '#9a6d4f',
  q: '#2b2f36',
  Q: '#3e434d',
  O: '#c8743a',
  F: '#e8641e',
  P: '#9a6ac0',
  p: '#5e3d80',
  A: '#dfe9f0',
  a: '#a9bccb',
  H: '#f4f8fb',
  f: '#f6c04a',
  ',': 'rgba(230, 240, 255, 0.55)',
};

export type Haltung = 'ruhe' | 'aus' | 'hieb' | 'nach';
export type BeinBild = 'steh' | 'lauf1' | 'lauf2';

/** Klingen je Haltung; '@' ist der Griff. Waffen faerben L und l um. */
const KLINGE: Record<Haltung, Pixelkarte> = {
  ruhe: ['.L.', '.l.', '.l.', '.l.', 'yYy', '.@.'],
  aus: ['L...', '.l..', '..l.', '..yY', '...@'],
  hieb: ['....,,.', '@yLlll.', '..,,,,,'],
  nach: ['@y...', '.Yl..', '..l..', '...l.', '....L'],
};
const AXT_HALTUNG: Record<Haltung, Pixelkarte> = {
  ruhe: ['mml', '.Wm', '.W.', '.W.', '.W.', '.@.'],
  aus: ['mm..', 'mW..', '..W.', '...W', '...@'],
  hieb: ['....,mm', '@WWWWml', '..,,,mm'],
  nach: ['@W...', '..W..', '...W.', '...mm', '...ml'],
};
const KLINGEN_FARBE: Record<string, Record<string, string>> = {
  schwert: {},
  breitschwert: { L: 'l', l: 'm' },
  runenklinge: { L: 'B', l: 'b', Y: 'B', y: 'b' },
  flammenschwert: { L: 'f', l: 'F', y: 'r', Y: 'R' },
};

/** Die Waffe in einer Haltung, als Pixelkarte mit Griff '@'. */
export function waffeInHaltung(id: string | null, h: Haltung): Pixelkarte {
  if (id === 'axt') return AXT_HALTUNG[h];
  const farben = KLINGEN_FARBE[id ?? 'schwert'] ?? {};
  return KLINGE[h].map((z) => [...z].map((c) => farben[c] ?? c).join(''));
}

export type FigurDesign = {
  id: string;
  name: string;
  koerper: Pixelkarte;
  /** Schild [x, y, Bild] - oder keiner. */
  schild: [number, number, Pixelkarte] | null;
  /** Umhang hinter dem Koerper: stehend, laufend. */
  umhang?: [[number, number, Pixelkarte], [number, number, Pixelkarte]];
  beine: Record<BeinBild, Pixelkarte>;
  /** Wo die Hand mit dem Griff sitzt, je Haltung. */
  hand: Record<Haltung, [number, number]>;
  /** Farbe der Hand (Handschuh oder Haut). */
  handFarbe: string;
};

const STAHLBEINE: Record<BeinBild, Pixelkarte> = {
  steh: ['....mn.mn..', '....ww.ww..'],
  lauf1: ['...mn...mn.', '...ww...ww.'],
  lauf2: ['....mnmn...', '....wwww...'],
};
const LEDERBEINE: Record<BeinBild, Pixelkarte> = {
  steh: ['....WW.WW..', '....dd.dd..'],
  lauf1: ['...WW...WW.', '...dd...dd.'],
  lauf2: ['....WWWW...', '....dddd...'],
};
const HAND: Record<Haltung, [number, number]> = { ruhe: [10, 9], aus: [9, 6], hieb: [10, 8], nach: [10, 9] };

export const FIGUREN: readonly FigurDesign[] = [
  {
    id: 'kachel',
    name: 'Kachel-Ritter',
    koerper: ['.....rR....', '....rR.....', '....oLLlo..', '...oLlllmo.', '...olnnnno.', '...omllmmo.', '....ommmo..', '...oBBYBbo.', '..oBBYYYbbo', '..omBBYBbmo', '...owwYwwo.', '...oBbbbbo.'],
    schild: [0, 7, ['.oo.', 'oRRo', 'RYYr', 'oRro', '.oo.']],
    beine: STAHLBEINE,
    hand: HAND,
    handFarbe: 'm',
  },
  {
    id: 'waldlaeufer',
    name: 'Waldlaeufer',
    koerper: ['...........', '.....gG....', '....gGGg...', '...gGGGgg..', '...gsssgh..', '...gsSSsh..', '....hSSh...', '...owWWwo..', '..oWWyWwwo.', '..osWWWwso.', '...odYddo..', '...oWwwwo..'],
    schild: null,
    umhang: [
      [2, 6, ['..gg', '.ghh', 'gghh', 'ghhh', 'ghh.', 'gh..']],
      [1, 6, ['...gg', '..ghh', '.gghh', 'gghh.', 'ghh..', 'hh...']],
    ],
    beine: LEDERBEINE,
    hand: HAND,
    handFarbe: 's',
  },
  {
    id: 'schwarz',
    name: 'Schwarzer Ritter',
    koerper: ['.....RR....', '....oRo....', '....oQQqo..', '...oQQQqqo.', '...oqRqRqo.', '...oQQQqqo.', '....oqqqo..', '...oRRYRro.', '..oRRRYRrro', '..oQRRYRrQo', '...oddYddo.', '...oRrrrro.'],
    schild: [0, 7, ['.oo.', 'oQQo', 'QRRq', 'oQqo', '.oo.']],
    beine: STAHLBEINE,
    hand: HAND,
    handFarbe: 'q',
  },
  {
    id: 'paladin',
    name: 'Weisser Paladin',
    koerper: ['.....YY....', '....oYo....', '....oLLlo..', '...oLLLllo.', '...oLnnnlo.', '...oLLLllo.', '....olllo..', '...oLLYLlo.', '..oLLYYYllo', '..olLLYLlmo', '...oyyYyyo.', '...oLlllLo.'],
    schild: [0, 7, ['.oo.', 'oBBo', 'BYYb', 'oBbo', '.oo.']],
    beine: STAHLBEINE,
    hand: HAND,
    handFarbe: 'l',
  },
  {
    id: 'zwerg',
    name: 'Zwergenkrieger',
    koerper: ['...........', '..L......L.', '..ml.oo.lm.', '...ollllmo.', '...osqsqso.', '...oOOOOOo.', '..oOOOOOOOo', '..omOOOOOmo', '..ommOOOmmo', '...oddYddo.', '...omnmnmo.', '...ommmmmo.'],
    schild: [0, 7, ['.oo.', 'oWWo', 'WyyW', 'oWwo', '.oo.']],
    beine: { steh: ['....nm.nm..', '....dd.dd..'], lauf1: ['...nm...nm.', '...dd...dd.'], lauf2: ['....nmnm...', '....dddd...'] },
    hand: { ruhe: [10, 9], aus: [9, 7], hieb: [10, 9], nach: [10, 9] },
    handFarbe: 's',
  },
  {
    id: 'soeldnerin',
    name: 'Soeldnerin',
    koerper: ['...........', '....rRRr...', '...rRRRRr..', '...Rsssssr.', '...Rsqsqsr.', '..rRsSSSs..', '.rr..sSs...', '...oBBBBo..', '..oWWBWWwo.', '..osWWWwso.', '...odYddo..', '...oWwwwo..'],
    schild: null,
    beine: LEDERBEINE,
    hand: HAND,
    handFarbe: 's',
  },
];

/**
 * Eine Figur im Stil der Kacheln zeichnen (symbole.ts, FIGUREN): Umhang,
 * Beine, Koerper, Schild, Waffe in ihrer Haltung, Hand. (x, fuss) ist die
 * Mitte unter den Fuessen; blick -1 spiegelt.
 */
export function malKachelFigur(
  ctx: CanvasRenderingContext2D,
  x: number,
  fuss: number,
  f: number,
  d: FigurDesign,
  beine: BeinBild,
  haltung: Haltung,
  waffe: string | null,
  blick: 1 | -1,
  blitz: boolean,
  glut: string | null,
): void {
  const breite = 11;
  const hoehe = 14;
  const mal = () => {
    const lauf = beine !== 'steh';
    if (d.umhang) {
      const [ux, uy, k] = d.umhang[lauf ? 1 : 0];
      zeichnePixel(ctx, k, ux * f, uy * f, f, KACHEL_PIX);
    }
    zeichnePixel(ctx, d.beine[beine], 0, 12 * f, f, KACHEL_PIX);
    zeichnePixel(ctx, d.koerper, 0, 0, f, KACHEL_PIX);
    if (d.schild) zeichnePixel(ctx, d.schild[2], d.schild[0] * f, d.schild[1] * f, f, KACHEL_PIX);
  };
  ctx.save();
  ctx.translate(x, fuss - hoehe * f);
  ctx.scale(blick, 1);
  ctx.translate(-Math.floor(breite / 2) * f - f / 2, 0);
  mal();
  if (blitz) {
    ctx.save();
    ctx.filter = 'brightness(4) saturate(0)';
    ctx.globalAlpha = 0.7;
    mal();
    ctx.restore();
  }
  if (waffe) {
    const k = waffeInHaltung(waffe, haltung);
    let ax = 0;
    let ay = 0;
    k.forEach((z, y) => {
      const i = z.indexOf('@');
      if (i >= 0) {
        ax = i;
        ay = y;
      }
    });
    const [hx, hy] = d.hand[haltung];
    ctx.save();
    if (glut) {
      ctx.shadowColor = glut;
      ctx.shadowBlur = 3 * f;
    }
    zeichnePixel(ctx, k, (hx - ax) * f, (hy - ay) * f, f, KACHEL_PIX);
    ctx.restore();
    ctx.fillStyle = KACHEL_PIX[d.handFarbe] ?? '#7d7c82';
    ctx.fillRect(hx * f, hy * f, f, f);
  }
  ctx.restore();
}


/** Der Marktstand des Haendlers: gestreiftes Dach, Tresen mit Waren (Kachelpalette). */
export const STAND: Pixelkarte = [
  'oooooooooooooooo',
  'oRARARARARARARAo',
  'oRARARARARARARAo',
  '.oooooooooooooo.',
  '.w............w.',
  '.w............w.',
  '.w............w.',
  'oWWWWWWWWWWWWWWo',
  'oWfWYWRWfWGWYWWo',
  'oWWWWWWWWWWWWWWo',
  '.ww..........ww.',
];

/** Das Banner des Werbers: ein Stab mit Fahne (Kachelpalette). */
export const BANNER: Pixelkarte = [
  'o.......',
  'wooooooo',
  'wBBBBBBo',
  'wBYYYBBo',
  'wBBYBBBo',
  'wBBBBBBo',
  'woBoBoBo',
  'w.o.o.o.',
  'w.......',
  'w.......',
  'w.......',
  'w.......',
  'ww......',
];
