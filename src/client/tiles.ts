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
 * Ab welcher Hoehe eine Weide als Huegelland gezeichnet wird.
 *
 * Weiden liegen zwischen Meeresspiegel (0,29) und Huegelgrenze (0,74). Das
 * obere Drittel davon bekommt die gruenen Huegel - so steigt das Gelaende zum
 * Gebirge hin sichtbar an, noch bevor das Relief es anhebt.
 */
const HANG_WEIDE = 0.6;

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
 * Abgedunkelte Kacheln fuer die Felswand unter angehobenem Gelaende.
 *
 * Einmal je Bild erzeugt und gemerkt, nicht bei jedem Zeichnen gefiltert: ein
 * Canvas-Filter pro drawImage waere teuer und in aelteren Safari-Versionen gar
 * nicht vorhanden. 'source-atop' faerbt nur, wo das Bild deckt - die
 * durchsichtigen Ecken bleiben durchsichtig.
 */
const DUNKEL = new Map<string, HTMLCanvasElement>();
const FELS = 'rgba(30, 22, 17, 0.6)';

export function tileImageDark(url: string): CanvasImageSource | undefined {
  const da = DUNKEL.get(url);
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
  ctx.fillStyle = FELS;
  ctx.fillRect(0, 0, c.width, c.height);
  DUNKEL.set(url, c);
  return c;
}
