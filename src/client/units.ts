/**
 * Figuren auf der Karte - Einheiten, Lager und Ruinen.
 *
 * PLATZHALTER aus Pixelkarten: jede Figur ist ein kleines Raster aus Zeichen,
 * gezeichnet im selben Kunstpixel wie die Kacheln. So sitzen sie im Pixelraster
 * der Karte, statt als glatte Vektoren darueberzuschweben - der Mangel, den
 * ASSETS.md beim alten Nest-Marker notiert hatte.
 *
 * FARBE. 'p' in einer Pixelkarte ist die Farbe des Besitzers: die Spielerfarbe
 * beim Ritter, die Fraktionsfarbe bei Raeubern, Goblins und dem Wimpel am Lager.
 *
 * SPRITES FOLGEN. Liegt in src/assets/units eine Datei mit dem Namen der Art
 * (raeuber.png, goblin.png, ritter.png, wanderer.png, lager.png, ruine.png,
 * dorf.png, stadt.png), wird sie statt des Platzhalters gezeichnet - ohne
 * Codeaenderung. Ebenso kampf.png fuer die Schwerter ueber einem Kampf.
 * Format: README dort.
 *
 * DOERFER UND STAEDTE stehen seit der Ueberarbeitung auch hier. Vorher waren
 * sie glatte SVG-Formen in Spielerfarbe, die ueber der Pixelkarte wie
 * aufgeklebt wirkten. 'P' ist die Spielerfarbe im Schatten, 'q' im Licht.
 */

import type { UnitKind } from '../core/units';

export type FigurArt = UnitKind | 'lager' | 'ruine' | 'dorf' | 'stadt';

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
  c: '#d8c49a', // Zeltstoff, Mauer im Licht
  C: '#a88f63', // Mauer im Schatten
  a: '#8d8a7e', // Wandermantel
  A: '#6a675d', // dunkler Mantel
};

/** Die Platzhalter. '.' ist durchsichtig, 'p' die Farbe des Besitzers. */
const ART: Record<FigurArt, readonly string[]> = {
  raeuber: [
    '..kkk..',
    '.khhhk.',
    'khhhhhk',
    'khssshk',
    '.kpppk.',
    'kbpppbk',
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
    '..kGpGk..',
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
  // Kapuzenmantel und Stab - neutral, ohne Farbe.
  wanderer: [
    '..kkk....',
    '.kaaak..k',
    'kaaaaak.t',
    'kasssak.t',
    '.kAaAk..t',
    'kaaaaakst',
    'kaAaAak.t',
    'kaaaaak.t',
    'kaAaAak.t',
    '.kaaak..t',
    '.kb.bk..t',
    '.kk.kk..k',
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
    '......kpp......',
    '......kppp.....',
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
  // Dorf: Giebeldach in Spielerfarbe, links im Licht, rechts im Schatten;
  // helle Mauer, zwei erleuchtete Fenster, eine Tuer.
  dorf: [
    '......k......',
    '.....kpk.....',
    '....kqpPk....',
    '...kqppPPk...',
    '..kqpppPPPk..',
    '.kqppppPPPPk.',
    'kkkkkkkkkkkkk',
    '.kcccccCCCCk.',
    '.kcyyccCyyCk.',
    '.kcyyccCyyCk.',
    '.kccckkkCCCk.',
    '.kccckbkCCCk.',
    '.kkkkkkkkkkk.',
  ],
  // Stadt: ein steinerner Turm mit Wimpel neben einem Haus - hoeher und breiter
  // als das Dorf, damit man den Unterschied auch klein erkennt.
  stadt: [
    '...k.............',
    '...kpp...........',
    '...kppp..........',
    '...k.............',
    '.kkkkkkk.........',
    '.kmkmkMk.........',
    '.kmmmMMk....k....',
    '.kmmmMMk...kpk...',
    '.kmyymMk..kqpPk..',
    '.kmyymMk.kqppPPk.',
    '.kmmmMMkkqpppPPPk',
    '.kmmmMMkkkkkkkkkk',
    '.kmmmMMk.kccCCCk.',
    '.kmkkMMk.kcyCyCk.',
    '.kmkbMMk.kccbCCk.',
    '.kkkkkkk.kkkkkkk.',
  ],
};

const hex2 = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');

/** Eine Farbe #rrggbb zu Schwarz (ziel 0) oder Weiss (ziel 255) hin verschieben. */
function mische(farbe: string, ziel: number, anteil: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(farbe);
  if (!m) return farbe;
  return (
    '#' +
    [m[1]!, m[2]!, m[3]!]
      .map((h) => {
        const v = parseInt(h, 16);
        return hex2(Math.round(v + (ziel - v) * anteil));
      })
      .join('')
  );
}
export const dunkler = (farbe: string): string => mische(farbe, 0, 0.35);
export const heller = (farbe: string): string => mische(farbe, 255, 0.35);

const SPRITE_URLS = import.meta.glob('../assets/units/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const SPRITES = new Map<string, HTMLImageElement>();

/** Die Adresse eines gelieferten Sprites, oder null, solange es fehlt. */
export function spriteUrl(name: string): string | null {
  for (const [pfad, url] of Object.entries(SPRITE_URLS)) {
    if (pfad.endsWith(`/${name}.png`)) return url;
  }
  return null;
}

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

  const grund = farbe ?? '#9c3226';
  const schatten = dunkler(grund);
  const licht = heller(grund);
  for (let zy = 0; zy < karte.length; zy++) {
    const zeile = karte[zy]!;
    for (let zx = 0; zx < zeile.length; zx++) {
      const ch = zeile[zx]!;
      if (ch === '.') continue;
      ctx.fillStyle =
        ch === 'p' ? grund : ch === 'P' ? schatten : ch === 'q' ? licht : (PALETTE[ch] ?? '#ff00ff');
      ctx.fillRect(x0 + zx * f, y0 + zy * f, f, f);
    }
  }
}

export type Strassenstueck = {
  a: { x: number; y: number };
  b: { x: number; y: number };
  farbe: string;
};

/**
 * Strassen als Pixelband entlang der Feldkante, in Geraetepixeln.
 *
 * Schritt fuer Schritt ein Kunstpixel weit, auf das Kunstpixelraster gerundet:
 * so bekommt die schraege Kante dieselben Treppenstufen wie die Kacheln, statt
 * als glatte Linie darueberzuliegen. Erst alle Umrisse, dann aller Belag - wo
 * Strassen sich treffen, fliessen sie ineinander, statt dass ein Umriss quer
 * durch die Nachbarstrasse schneidet. Jeder vierte Stein ist heller, das liest
 * sich als Pflaster. PLATZHALTER (ASSETS.md).
 */
export function zeichneStrassen(
  ctx: CanvasRenderingContext2D,
  stuecke: readonly Strassenstueck[],
  f: number,
): void {
  const punkte = (s: Strassenstueck) => {
    const n = Math.max(1, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / f));
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      out.push({
        x: Math.round((s.a.x + ((s.b.x - s.a.x) * i) / n) / f) * f,
        y: Math.round((s.a.y + ((s.b.y - s.a.y) * i) / n) / f) * f,
      });
    }
    return out;
  };
  const alle = stuecke.map((s) => ({ s, p: punkte(s) }));
  ctx.fillStyle = '#1b130d';
  for (const { p } of alle) {
    for (const q of p) ctx.fillRect(q.x - 2 * f, q.y - 2 * f, 4 * f, 4 * f);
  }
  for (const { s, p } of alle) {
    const hell = heller(s.farbe);
    p.forEach((q, i) => {
      ctx.fillStyle = i % 4 === 2 ? hell : s.farbe;
      ctx.fillRect(q.x - f, q.y - f, 2 * f, 2 * f);
    });
  }
}

/** Wie hoch eine Figur ist, in Kunstpixeln. */
export function figurHoehe(art: FigurArt): number {
  const sprite = SPRITES.get(art);
  return sprite ? sprite.naturalHeight : ART[art].length;
}

/**
 * Leben ueber dem Kopf eines Verwundeten: ein Kunstpixel je Leben, rot fuer
 * uebrige, dunkel fuer verlorene. Unverletzte bekommen keine Anzeige - sonst
 * steht ueber jeder Figur ein Balken. PLATZHALTER (ASSETS.md).
 */
export function zeichneLeben(
  ctx: CanvasRenderingContext2D,
  art: FigurArt,
  fx: number,
  fy: number,
  f: number,
  leben: number,
  max: number,
): void {
  const y = fy - (figurHoehe(art) + 1) * f;
  const breite = max * 2 - 1;
  const x0 = fx - Math.floor(breite / 2) * f;
  ctx.fillStyle = '#1b130d';
  ctx.fillRect(x0 - f, y - f, (breite + 2) * f, 3 * f);
  for (let i = 0; i < max; i++) {
    ctx.fillStyle = i < leben ? '#e0473a' : '#4a3a30';
    ctx.fillRect(x0 + i * 2 * f, y, f, f);
  }
}

/**
 * Wo Figuren auf einem Feld stehen, in Kunstpixeln relativ zur Feldmitte. Auf
 * einem Lager stehen sie davor, damit das Lager sichtbar bleibt. Ab vier
 * Figuren stehen die ersten beiden links, die naechsten rechts - wer nach Seite
 * sortiert zeichnet, bekommt so zwei Reihen, die einander gegenueberstehen.
 */
export function aufstellung(anzahl: number, lager: boolean): ReadonlyArray<readonly [number, number]> {
  if (lager) {
    if (anzahl <= 2) return [[-6, 6], [6, 6]];
    if (anzahl === 3) return [[-7, 5], [7, 5], [0, 8]];
    return [[-9, 4], [-6, 9], [9, 4], [6, 9], [0, 11]];
  }
  if (anzahl <= 1) return [[0, 4]];
  if (anzahl === 2) return [[-4, 3], [4, 5]];
  if (anzahl === 3) return [[-5, 2], [5, 2], [0, 6]];
  return [[-7, 1], [-5, 6], [7, 1], [5, 6], [0, 9]];
}
