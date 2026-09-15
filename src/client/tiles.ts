/**
 * Welche Kachel wird fuer ein Feld gezeichnet?
 *
 * Reine Darstellung. Die Zuordnung darf nie beeinflussen, was ein Feld
 * liefert - das steht in worldgen.ts. Umgekehrt gilt: ein Spieler muss auf
 * einen Blick erkennen, welcher Rohstoff hier waechst. Deshalb variiert das
 * Klima nur dort, wo die Lesbarkeit es aushaelt:
 *
 *   Wald    -> Taiga, Mischwald oder Dschungel. Alle drei zeigen Baeume,
 *              also liest sich weiterhin "Holz".
 *   Weide   -> Wiese, am Hang gruene Huegel. Beides Gras, beides Wolle.
 *   Wueste  -> Sand, Duenen, Eiswueste oder Sumpf. Alle vier sind oede -
 *              Schnee und Sumpf liegen genau hier, weil sie nichts liefern
 *              und die Wueste auch nicht.
 *   Wasser  -> flach, normal oder tief, nach echter Entfernung zur Kueste.
 *
 * Feld, Huegel und Berg bleiben bei EINER Sorte. Ein Sumpf auf dem Kornfeld
 * waere huebsch, saehe aber nicht mehr nach Getreide aus - und
 * Verwechslungsgefahr wiegt schwerer als Abwechslung.
 */

import { climateAt } from '../core/biome';
import { hash3i } from '../core/hash';
import { hexesInRange, neighbors } from '../core/coords';
import { fieldsAt, terrainAt } from '../core/worldgen';
import type { Terrain } from '../core/types';

const SALT_VARIANT = 31;
const SALT_SUMPF = 32;

/**
 * Alle Kacheln als URL einsammeln. Vite loest den Glob beim Bauen auf und
 * legt die Dateien mit Hash-Namen ins Ausgabeverzeichnis.
 */
const FILES = import.meta.glob('../assets/tiles/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Nach Grundname gruppieren: "forest_2_tile.png" -> Gruppe "forest". */
const GROUPS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [path, url] of Object.entries(FILES)) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const m = /^([a-z_]+)_(\d+)_tile\.png$/i.exec(name);
    if (!m) continue;
    const base = m[1]!;
    (out[base] ??= []).push(url);
  }
  // Feste Reihenfolge, damit die Variantenwahl reproduzierbar bleibt.
  for (const k of Object.keys(out)) out[k]!.sort();
  return out;
})();

/**
 * Kachelmasse - ausgemessen, nicht geraten.
 *
 * Das Bild ist 26 x 32 Pixel, das Sechseck darin aber nur 24 x 25: es sitzt
 * bei x 1..24 und y 7..31. Die sieben freien Zeilen oben sind Platz fuer
 * Aufbauten, die ueber das Feld hinausragen - bei Taiga beginnt die
 * Bemalung schon bei y=2, bei Bergen bei y=4, bei Gras erst bei y=7.
 *
 * Wer das Bild mit dem Sechseck gleichsetzt, bekommt schwarze Fugen zwischen
 * den Feldern: die Kacheln stuenden dann zu weit auseinander.
 */
export const IMG_W = 26;
export const IMG_H = 32;
export const HEX_W = 24;
export const HEX_H = 25;
/** Mittelpunkt des Sechsecks INNERHALB des Bildes. */
export const HEX_CX = 13;
export const HEX_CY = 19.5;

/**
 * Abstand der Kacheln auf der Karte, in Kunstpixeln: 23 Spalten, 17 Zeilen.
 *
 * Das ist der Abstand, fuer den die Kacheln gezeichnet sind (hexmap/map.py).
 * Frueher legte das Brett sie mit 24 x 18,75 - nach der Groesse des Sechsecks
 * gerechnet. Jede zweite Zeile landete damit zwischen den Kunstpixeln, und
 * zwischen den Kacheln blieben dunkle, doppelte Fugen: die Karte wirkte
 * unscharf, obwohl jede einzelne Kachel scharf gezeichnet war. Vergleich:
 * labor.html?art=schaerfe.
 */
export const SCHRITT_X = 23;
export const SCHRITT_Y = 17;

/**
 * Linke obere Ecke des Kachelbilds eines Feldes, in ganzen Kunstpixeln.
 *
 * Auf ganze Kunstpixel gerundet, damit alle Kacheln - und die Figuren darauf -
 * im selben Pixelraster liegen. Die ungeraden Zeilen ruecken dafuer um einen
 * halben Kunstpixel; das faellt nicht auf, ein Versatz zwischen den Zeilen schon.
 */
export function kachelEcke(q: number, r: number): { x: number; y: number } {
  return {
    x: SCHRITT_X * q + Math.ceil((SCHRITT_X / 2) * r) - HEX_CX,
    y: SCHRITT_Y * r - Math.floor(HEX_CY),
  };
}

/**
 * Ab welcher Hoehe eine Weide als Huegelland gezeichnet wird.
 *
 * Weiden liegen zwischen Seegrenze (0,02) und Huegelgrenze (0,67). Das
 * obere Drittel davon bekommt die gruenen Huegel - so steigt das Gelaende zum
 * Gebirge hin sichtbar an, noch bevor das Relief es anhebt.
 */
const HANG_WEIDE = 0.45;

/** Grundname der Kachel fuer Gelaende und Klima. */
function baseName(
  terrain: Terrain,
  temp: number,
  moist: number,
  seed: number,
  q: number,
  r: number,
): string {
  switch (terrain) {
    case 'forest':
      if (temp < 0.38) return 'taiga';
      if (temp > 0.68 && moist > 0.5) return 'jungle';
      return 'forest';
    case 'pasture':
      return fieldsAt(seed, q, r).elevation > HANG_WEIDE ? 'hills' : 'grass';
    case 'field':
      return 'wheat';
    case 'hill':
      return 'clay';
    case 'mountain':
      return 'mountains';
    case 'desert':
      // Kaelte zuerst: eine feuchte, kalte Oede ist Eis, kein Sumpf.
      if (temp < 0.36) return 'snow';
      if (moist > 0.58) return sumpfVariante(seed, q, r);
      return temp > 0.55 && moist < 0.45 ? 'dunes' : 'sand';
    case 'water':
      return wasserTiefe(seed, q, r);
  }
}

/** Welche Kachelsorte ein Feld zeigt - fuer Bauwerke, die sich dem Gelaende anpassen. */
export function kachelSorte(seed: number, terrain: Terrain, q: number, r: number): string {
  const { temp, moist } = climateAt(seed, q, r);
  return baseName(terrain, temp, moist, seed, q, r);
}

/**
 * Sumpf in drei Spielarten: offen, Schilf, Seerosen.
 *
 * Alle aus derselben Familie, damit ein Sumpfgebiet zusammenhaengend wirkt
 * statt gefleckt.
 */
function sumpfVariante(seed: number, q: number, r: number): string {
  const n = hash3i(seed, q, r, SALT_SUMPF) % 3;
  return n === 0 ? 'swamp' : n === 1 ? 'swamp_reeds' : 'swamp_pads';
}

/**
 * Wassertiefe nach echter Kuestennaehe.
 *
 * Vorher kam die Tiefe aus einem Feuchterauschen und hatte mit der Kueste
 * nichts zu tun - tiefes Blau direkt am Strand, flaches mitten im Meer. Das
 * Vorbild misst die Entfernung zum Land per Breitensuche ueber die ganze
 * Karte. Das koennen wir nicht, brauchen wir aber auch nicht: fuer drei
 * Stufen genuegt der Blick zwei Felder weit.
 *
 *   Land direkt daneben   -> flach
 *   Land zwei Felder weit -> normal
 *   sonst                 -> tief
 */
function wasserTiefe(seed: number, q: number, r: number): string {
  for (const n of neighbors(q, r)) {
    if (terrainAt(seed, n.q, n.r) !== 'water') return 'shallow_water';
  }
  for (const h of hexesInRange({ q, r }, 2)) {
    if (terrainAt(seed, h.q, h.r) !== 'water') return 'water';
  }
  return 'deep_water';
}

/**
 * Gemerkte Kachelwahl.
 *
 * Kuestentiefe und Hanglage fragen Nachbarn, und das Brett fragt bei jedem
 * Neuzeichnen - also bei jeder Zeigerbewegung ueber ein neues Feld.
 */
const URL_MAX = 30000;
let urlSeed = Number.NaN;
const urlCache = new Map<string, string | null>();

/**
 * Bild-URL fuer ein Feld. Deterministisch: dasselbe Feld bekommt immer
 * dieselbe Variante, sonst flackerte die Karte bei jedem Neuzeichnen.
 */
export function tileUrl(seed: number, terrain: Terrain, q: number, r: number): string | null {
  if (seed !== urlSeed) {
    urlCache.clear();
    urlSeed = seed;
  }
  const k = q + ':' + r;
  const da = urlCache.get(k);
  if (da !== undefined) return da;
  const v = waehleKachel(seed, terrain, q, r);
  if (urlCache.size >= URL_MAX) urlCache.clear();
  urlCache.set(k, v);
  return v;
}

function waehleKachel(seed: number, terrain: Terrain, q: number, r: number): string | null {
  const { temp, moist } = climateAt(seed, q, r);
  let group = GROUPS[baseName(terrain, temp, moist, seed, q, r)];
  // Fehlt eine Sorte, lieber auf Gras zurueckfallen als nichts zu zeichnen.
  if (!group || group.length === 0) group = GROUPS['grass'];
  if (!group || group.length === 0) return null;
  return group[hash3i(seed, q, r, SALT_VARIANT) % group.length]!;
}

/** Eine Kachel fuer ein Gelaende, ausserhalb der Karte - etwa als Bild auf einer Spielkarte. */
export function kachelFuer(terrain: Terrain, variante = 0): string | null {
  const name: Record<Terrain, string> = {
    forest: 'forest',
    pasture: 'grass',
    field: 'wheat',
    hill: 'clay',
    mountain: 'mountains',
    desert: 'sand',
    water: 'water',
  };
  const group = GROUPS[name[terrain]] ?? GROUPS['grass'];
  return group && group.length > 0 ? group[variante % group.length]! : null;
}

/** Nur fuer die Diagnose: welche Kachelsorten stehen zur Verfuegung. */
export const availableGroups = (): string[] => Object.keys(GROUPS).sort();

// --- Bilder fuer das Canvas -------------------------------------------------

/**
 * Vorgeladene Bildobjekte je URL.
 *
 * Das Brett zeichnet die Kacheln auf ein Canvas statt als SVG-Elemente, weil
 * Safari image-rendering: pixelated bei SVG-<image> nicht zuverlaessig
 * beachtet - dort sah die Karte verwaschen aus, waehrend sie in Chromium
 * scharf war. Auf dem Canvas laesst sich die Glaettung mit
 * imageSmoothingEnabled = false hart abschalten, das gilt in jedem Browser.
 */
const IMAGES = new Map<string, HTMLImageElement>();

/** Alle Kacheln laden. Aufloesung erst, wenn wirklich alle bereit sind. */
export function preloadTiles(): Promise<void> {
  const urls = [...new Set(Object.values(GROUPS).flat())];
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          // Auch bei Fehlern aufloesen: eine fehlende Kachel darf das Brett
          // nicht dauerhaft leer lassen.
          img.onload = () => {
            IMAGES.set(url, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}

export function tileImage(url: string): HTMLImageElement | undefined {
  return IMAGES.get(url);
}

/**
 * Kacheln im Nebel.
 *
 * Einmal je Bild eingetruebt erzeugt und gemerkt, nicht bei jedem Zeichnen
 * gefiltert - ein Canvas-Filter je drawImage waere teuer und in aelteren
 * Safari-Versionen gar nicht vorhanden. Blaeulich statt schwarz, damit Nebel
 * nach Nebel aussieht und nicht nach Nacht. 'source-atop' faerbt nur, wo das
 * Bild deckt; die durchsichtigen Ecken bleiben durchsichtig.
 *
 * PLATZHALTER: ein echter Nebel haette weiche Raender und Bewegung (ASSETS.md).
 */
const NEBEL = new Map<string, HTMLCanvasElement>();
const NEBEL_FARBE = 'rgba(24, 30, 44, 0.58)';

export function tileImageFog(url: string): CanvasImageSource | undefined {
  const da = NEBEL.get(url);
  if (da) return da;
  const img = IMAGES.get(url);
  if (!img) return undefined;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || IMG_W;
  c.height = img.naturalHeight || IMG_H;
  const ctx = c.getContext('2d');
  if (!ctx) return img;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = NEBEL_FARBE;
  ctx.fillRect(0, 0, c.width, c.height);
  NEBEL.set(url, c);
  return c;
}

/**
 * Was ein Kachelbild ueber sein Sechseck hinaus deckt - Gipfel, Baumkronen:
 * das Bild, abzueglich allem, was eine Graskachel deckt (Gras beginnt erst bei
 * y=7, Berge bei y=4, siehe oben). So bleiben Boden, Rand und Klippe draussen,
 * ohne dass ein Sechseck auf das Pixelraster passen muss. Einmal je Bild
 * gemerkt (Board: Gipfel davor).
 *
 * Die Graskachel kommt aus kachelFuer, nicht aus tileUrl - tileUrl merkt sich
 * die Wahl je Feld, fuer ein Bergfeld also wieder den Berg.
 */
const UEBERHANG = new WeakMap<object, HTMLCanvasElement>();

/*
 * Hoehenmaske (PROBE, Board ?verdecken=maske): welche Pixel einer Wald- oder
 * Bergkachel "hoch" sind - Baumkronen, Staemme, Fels, Gipfel - und welche
 * Boden: Grasrand, Erdkante, Schnee zwischen den Baeumen. Nur Hohes verdeckt,
 * was dahinter steht.
 *
 * Automatisch geschaetzt, nicht gezeichnet: Bodenfarben je Kachelfamilie, von
 * der Erdkante unten aus zusammenhaengend geflutet. Was die Flut nicht
 * erreicht, ist hoch. Umrisspixel zaehlen zu der Seite, der die meisten
 * Nachbarn angehoeren. Spaeter liessen sich die Masken als eigene Bilder
 * nachzeichnen (forest_0_mask.png) - diese hier sind der erste Entwurf dafuer.
 */
const ERDE = ['#5f4036', '#6c4738', '#8a6048', '#9a6d4f', '#46352f', '#322d21', '#2b211a'];
const GRAS = ['#6fad42', '#538c47', '#bad08e', '#cbbf5d', '#837131', '#8c833d'];
const SCHNEE = ['#fefefe', '#d4e8f3', '#b9c3cc', '#aae8e3', '#89a7b0', '#9cb4cd', '#90999f', '#7abcc2', '#99c8bc', '#4d919e', '#327297'];
const BODEN_JE_FAMILIE: Record<string, ReadonlySet<string>> = {
  forest: new Set([...ERDE, ...GRAS]),
  jungle: new Set([...ERDE, ...GRAS]),
  taiga: new Set([...ERDE, ...GRAS, ...SCHNEE]),
  mountains: new Set([...ERDE, ...GRAS, '#3d6a45']),
};
const UMRISS = new Set(['#120f12', '#161a19']);
/** Ab dieser Zeile liegt die Erdkante - von dort beginnt die Flut. */
const KANTE_AB = 25;
const MASKEN = new WeakMap<object, HTMLCanvasElement>();

/** Die Kachelfamilie aus der Bild-URL: "taiga_1_tile-abc.png" -> "taiga". */
export function kachelFamilie(url: string): string | null {
  const m = /(forest|jungle|taiga|mountains)_\d+_tile/.exec(url);
  return m ? m[1]! : null;
}

/**
 * Die Hoehenmaske eines Kachelbildes: deckend, wo es hoch ist, durchsichtig
 * sonst. null fuer Kacheln ohne Hoehe (Gras, Feld, Wasser, ...).
 */
export function hoehenMaske(bild: HTMLImageElement, url: string): HTMLCanvasElement | null {
  const da = MASKEN.get(bild);
  if (da) return da;
  const familie = kachelFamilie(url);
  const boden = familie ? BODEN_JE_FAMILIE[familie] : undefined;
  if (!boden) return null;
  const b = bild.naturalWidth || IMG_W;
  const h = bild.naturalHeight || IMG_H;
  const c = document.createElement('canvas');
  c.width = b;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bild, 0, 0);
  const pixel = ctx.getImageData(0, 0, b, h);
  const d = pixel.data;
  const farbe = (i: number) =>
    '#' + [d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('');
  const n = b * h;
  // 0 durchsichtig, 1 Boden, 2 hoch, 3 Umriss (noch offen)
  const art = new Uint8Array(n);
  const istBoden = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3]! === 0) continue;
    const f = farbe(i);
    art[i] = UMRISS.has(f) ? 3 : 2;
    if (boden.has(f)) istBoden[i] = 1;
  }
  // Flut von der Erdkante aus, nur ueber Bodenfarben.
  const schlange: number[] = [];
  for (let i = KANTE_AB * b; i < n; i++) {
    if (istBoden[i] && art[i] === 2) {
      art[i] = 1;
      schlange.push(i);
    }
  }
  while (schlange.length > 0) {
    const i = schlange.pop()!;
    const x = i % b;
    for (const j of [i - b, i + b, x > 0 ? i - 1 : -1, x < b - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= n || art[j] !== 2 || !istBoden[j]) continue;
      art[j] = 1;
      schlange.push(j);
    }
  }
  // Umrisse: zu der Seite, der die meisten Nachbarn angehoeren.
  for (let i = 0; i < n; i++) {
    if (art[i] !== 3) continue;
    const x = i % b;
    let hoch = 0;
    let tief = 0;
    for (const j of [i - b, i + b, x > 0 ? i - 1 : -1, x < b - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= n) continue;
      if (art[j] === 2) hoch++;
      else if (art[j] === 1 || art[j] === 0) tief++;
    }
    art[i] = hoch > tief ? 2 : 1;
  }
  for (let i = 0; i < n; i++) {
    const hochPixel = art[i] === 2;
    d[i * 4] = 0;
    d[i * 4 + 1] = 0;
    d[i * 4 + 2] = 0;
    d[i * 4 + 3] = hochPixel ? 255 : 0;
  }
  ctx.putImageData(pixel, 0, 0);
  MASKEN.set(bild, c);
  return c;
}

export function ueberhangBild(bild: CanvasImageSource): HTMLCanvasElement | null {
  const da = UEBERHANG.get(bild);
  if (da) return da;
  const flachUrl = kachelFuer('pasture');
  const flach = flachUrl === null ? undefined : IMAGES.get(flachUrl);
  if (!flach) return null;
  const c = document.createElement('canvas');
  c.width = flach.naturalWidth || IMG_W;
  c.height = flach.naturalHeight || IMG_H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bild, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(flach, 0, 0, c.width, c.height);
  UEBERHANG.set(bild, c);
  return c;
}
