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
 * goldenem Kreuz, Schild links, Schwert rechts. Zwei Bilder: stehend und im
 * Schritt. Eigen fuers Abenteuer - die Strategie behaelt ihre Figuren.
 */
export const RITTER_STEHT: Pixelkarte = [
  '......rr......',
  '.....rRrr.....',
  '.....kkkkk....',
  '....kwsssSk...',
  '....kskkkSk.k.',
  '....ksssSSkksk',
  '.....kSSSk.ksk',
  '...kkkuyukkksk',
  'kkkkuuyuuSkgyg',
  'kuyukuyyyukbk.',
  'kyyykuuyuukk..',
  'kuyukbbybbk...',
  '.kuk.kuUuUk...',
  '..k..kSkSk....',
  '.....kSkSk....',
  '....kBBkBBk...',
];
export const RITTER_GEHT: Pixelkarte = [
  '......rr......',
  '.....rRrr.....',
  '.....kkkkk....',
  '....kwsssSk...',
  '....kskkkSk.k.',
  '....ksssSSkksk',
  '.....kSSSk.ksk',
  '...kkkuyukkksk',
  'kkkkuuyuuSkgyg',
  'kuyukuyyyukbk.',
  'kyyykuuyuukk..',
  'kuyukbbybbk...',
  '.kuk.kuUuUk...',
  '..k.kSk.kSk...',
  '....kSk..kSk..',
  '...kBBk..kBBk.',
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

export const SYMBOL: Record<string, Pixelkarte> = {
  schwert: SCHWERT,
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
