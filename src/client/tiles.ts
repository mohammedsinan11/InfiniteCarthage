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
 *   Wueste  -> Sand oder Duenen, beides erkennbar oede.
 *   Wasser  -> flach, normal oder tief, rein optische Tiefenstaffelung.
 *
 * Weide, Feld, Huegel und Berg bleiben bei EINER Sorte. Eine verschneite
 * Weide waere huebsch, saehe aber nicht mehr nach Wolle aus - und
 * Verwechslungsgefahr wiegt schwerer als Abwechslung.
 */

import { climateAt } from '../core/biome';
import { hash3i } from '../core/hash';
import type { Terrain } from '../core/types';

const SALT_VARIANT = 31;

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

/** Grundname der Kachel fuer Gelaende und Klima. */
function baseName(terrain: Terrain, temp: number, moist: number): string {
  switch (terrain) {
    case 'forest':
      if (temp < 0.38) return 'taiga';
      if (temp > 0.68 && moist > 0.5) return 'jungle';
      return 'forest';
    case 'pasture':
      return 'grass';
    case 'field':
      return 'wheat';
    case 'hill':
      return 'clay';
    case 'mountain':
      return 'mountains';
    case 'desert':
      return temp > 0.55 && moist < 0.45 ? 'dunes' : 'sand';
    case 'water':
      if (moist > 0.62) return 'deep_water';
      if (moist < 0.38) return 'shallow_water';
      return 'water';
  }
}

/**
 * Bild-URL fuer ein Feld. Deterministisch: dasselbe Feld bekommt immer
 * dieselbe Variante, sonst flackerte die Karte bei jedem Neuzeichnen.
 */
export function tileUrl(seed: number, terrain: Terrain, q: number, r: number): string | null {
  const { temp, moist } = climateAt(seed, q, r);
  let group = GROUPS[baseName(terrain, temp, moist)];
  // Fehlt eine Sorte, lieber auf Gras zurueckfallen als nichts zu zeichnen.
  if (!group || group.length === 0) group = GROUPS['grass'];
  if (!group || group.length === 0) return null;
  return group[hash3i(seed, q, r, SALT_VARIANT) % group.length]!;
}

/** Nur fuer die Diagnose: welche Kachelsorten stehen zur Verfuegung. */
export const availableGroups = (): string[] => Object.keys(GROUPS).sort();
