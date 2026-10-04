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
export const SCHLEIM_BILD: Record<'schleim' | 'spuck' | 'spring' | 'panzer', Pixelkarte> = {
  schleim: ['...kkk...', '..keeek..', '.keeeeEk.', 'kewcewcEk', 'keeeeeeEk', 'kEeeeeEEk', '.kkkkkkk.'],
  spuck: ['...kkk...', '..kuuuk..', '.kuuuuUk.', 'kuwcuwcUk', 'kuuukuuUk', 'kUuuuuUUk', '.kkkkkkk.'],
  spring: ['..k...k..', '..yk.ky..', '..kkkkk..', '.kyyyygk.', 'kywcywcgk', 'kyyyyyygk', 'kgyyyyggk', '.kkkkkkk.'],
  panzer: ['...kkk...', '..kmMmk..', '.kmmMmMk.', 'kmwcmwcMk', 'kMmmKmmMk', 'kMMmmmMMk', '.kkkkkkk.'],
};

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
  gold: SACK,
  gelee: GELEE,
  truhe: TRUHE,
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
