/**
 * Figuren auf der Karte - Einheiten und Lager.
 *
 * PLATZHALTER aus Pixelkarten: jede Figur ist ein kleines Raster aus Zeichen,
 * gezeichnet im selben Kunstpixel wie die Kacheln. So sitzen sie im Pixelraster
 * der Karte, statt als glatte Vektoren darueberzuschweben - der Mangel, den
 * ASSETS.md beim alten Nest-Marker notiert hatte.
 *
 * SPRITES FOLGEN. Liegt in src/assets/units eine Datei mit dem Namen der Art
 * (raeuber.png, goblin.png, ritter.png, lager.png, ruine.png), wird sie statt des
 * Platzhalters gezeichnet - ohne Codeaenderung. Format: README dort.
 */

import type { UnitKind } from '../core/units';

export type FigurArt = UnitKind | 'lager' | 'ruine';

const PALETTE: Record<string, string> = {
  k: '#1b130d', // Umriss
  h: '#3a2a22', // Kapuze
  s: '#d9a066', // Haut
  r: '#9c3226', // Rot
  b: '#5e3d25', // Leder
  B: '#3f2818', // dunkles Leder
  g: '#6aa83e', // Goblingruen
  G: '#3f6f24', // dunkles Gruen
  w: '#f2efe6', // Augen
  m: '#c9ccd6', // Metall
  M: '#7d818f', // dunkles Metall
  y: '#d9a441', // Gold
  t: '#8a6a45', // Holz
  T: '#5b4430', // dunkles Holz
  c: '#c7b28a', // Zeltstoff
};

/** Die Platzhalter. '.' ist durchsichtig, 'p' die Farbe des Besitzers. */
const ART: Record<FigurArt, readonly string[]> = {
  raeuber: [
    '..kkk..',
    '.khhhk.',
    'khhhhhk',
    'khssshk',
    '.krrrk.',
    'kbrrrbk',
    'kbbbbbk',
    'ksbBbsk',
    '.kbBbk.',
    '.kb.bk.',
    '.kk.kk.',
  ],
  goblin: [
    'k.......k',
    'gk.kkk.kg',
    '.gkgggkg.',
    '..kwgwk..',
    '..kgggk..',
    '..kGrGk..',
    '.kbbbbbk.',
    'kgkbbbkgk',
    '..kbkbk..',
    '..kk.kk..',
  ],
  ritter: [
    '..kkk...',
    '.kmmmk..',
    '.kmMMk..',
    '.kmmmk..',
    'kkkkkkk.',
    'kppmppmk',
    'kpppppmk',
    'kppyppmk',
    '.kpppk..',
    '.kMkMk..',
    '.kMkMk..',
    '.kk.kk..',
  ],
  ruine: [
    '..k.....k..',
    '.kmk...kmk.',
    '.kmk...kMk.',
    '.kmk.k.kmk.',
    '.kmkkmkkmk.',
    '.kMkkmkkMk.',
    'kkkkkkkkkkk',
    'kMMMmMMMmMk',
    '.kkkkkkkkk.',
  ],
  lager: [
    '......k........',
    '......krr......',
    '......krrr.....',
    '......k........',
    '.....kkk.......',
    '....kcckk......',
    '...kcctckk.T..T',
    '..kcctTtcckT..T',
    '.kcctTTTtcckTTT',
    'kkkkkkkkkkkkkTT',
    'TtTtT.....TtTtT',
    'TtTtT.....TtTtT',
    '.kkk.......kkk.',
  ],
};

const SPRITE_URLS = import.meta.glob('../assets/units/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const SPRITES = new Map<string, HTMLImageElement>();

/** Vorhandene Sprites laden. Fehlt der Ordner oder eine Datei, bleibt der Platzhalter. */
export function preloadUnitSprites(): Promise<void> {
  return Promise.all(
    Object.entries(SPRITE_URLS).map(
      ([pfad, url]) =>
        new Promise<void>((fertig) => {
          const name = pfad.slice(pfad.lastIndexOf('/') + 1).replace(/\.png$/i, '');
          const img = new Image();
          img.onload = () => {
            SPRITES.set(name, img);
            fertig();
          };
          img.onerror = () => fertig();
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}

/**
 * Eine Figur zeichnen.
 *
 * (fx, fy) sind die Fuesse in Geraetepixeln, f die Geraetepixel je Kunstpixel.
 * Anker unten mittig: die unterste Reihe steht auf dem Punkt, egal wie gross
 * die Figur oder das spaetere Sprite ist.
 */
export function zeichneFigur(
  ctx: CanvasRenderingContext2D,
  art: FigurArt,
  fx: number,
  fy: number,
  f: number,
  farbe?: string,
): void {
  const sprite = SPRITES.get(art);
  if (sprite) {
    const w = sprite.naturalWidth;
    const h = sprite.naturalHeight;
    ctx.drawImage(sprite, fx - Math.floor(w / 2) * f, fy - (h - 1) * f, w * f, h * f);
    return;
  }

  const karte = ART[art];
  const breite = Math.max(...karte.map((z) => z.length));
  const x0 = fx - Math.floor(breite / 2) * f;
  const y0 = fy - (karte.length - 1) * f;

  // Ein Pixelstreifen Schatten unter den Fuessen.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fillRect(x0 + f, fy + f, Math.max(1, breite - 2) * f, f);

  for (let zy = 0; zy < karte.length; zy++) {
    const zeile = karte[zy]!;
    for (let zx = 0; zx < zeile.length; zx++) {
      const ch = zeile[zx]!;
      if (ch === '.') continue;
      ctx.fillStyle = ch === 'p' ? (farbe ?? '#3a6fc4') : (PALETTE[ch] ?? '#ff00ff');
      ctx.fillRect(x0 + zx * f, y0 + zy * f, f, f);
    }
  }
}

/**
 * Wo Figuren auf einem Feld stehen, in Kunstpixeln relativ zur Feldmitte -
 * hinten zuerst, damit die vorderen die hinteren ueberdecken. Auf einem Lager
 * stehen sie davor, damit das Lager sichtbar bleibt.
 */
export function aufstellung(anzahl: number, lager: boolean): ReadonlyArray<readonly [number, number]> {
  if (lager) return anzahl <= 2 ? [[-6, 6], [6, 6]] : [[-7, 5], [7, 5], [0, 8]];
  if (anzahl <= 1) return [[0, 4]];
  if (anzahl === 2) return [[-4, 3], [4, 5]];
  return [[-5, 2], [5, 2], [0, 6]];
}
