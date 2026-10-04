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

const STIEFEL: Pixelkarte = [
  '..kkk....',
  '..kbk....',
  '..kbk....',
  '..kbk....',
  '..kbbkk..',
  '.kbbbbbk.',
  '.kBBBBBk.',
  '..kkkkk..',
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

export const SYMBOL: Record<string, Pixelkarte> = {
  schwert: SCHWERT,
  axt: AXT,
  schild: SCHILD,
  helm: HELM,
  ruestung: RUESTUNG,
  stiefel: STIEFEL,
  laterne: FLAMME,
  kraut: KRAUT,
  gold: SACK,
  gelee: GELEE,
  truhe: TRUHE,
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
