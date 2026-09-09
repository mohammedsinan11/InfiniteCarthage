/**
 * Klimafeld ueber der Karte.
 *
 * Zwei langwellige Rauschfelder - Waerme und Feuchte - die bestimmen, WIE ein
 * Feld aussieht, aber niemals WAS es liefert. Ein Waldfeld bleibt ein
 * Waldfeld, ob es als Taiga, Mischwald oder Dschungel gezeichnet wird.
 *
 * Diese Trennung ist Absicht. Die Vorlage (hexmap von Astropulse) leitet
 * Biome aus Hoehe, Fluessen und Kuestenabstand ab - alles globale Groessen,
 * die eine endliche Karte voraussetzen. Hier haengt das Klima nur von Seed
 * und Koordinate ab, ist also genauso unbegrenzt und reihenfolgeunabhaengig
 * wie die Weltgenerierung selbst.
 *
 * Warum nicht in den Regelteil: weil es keine Regel ist. worldgen.ts
 * entscheidet ueber Rohstoffe und Zahlen, diese Datei nur ueber die Optik.
 * Wer das Klima aendert, aendert kein einziges Spielergebnis.
 */

import { hash3i } from './hash';

const SALT_TEMP = 21;
const SALT_MOIST = 22;

/** Gitterwert in [0,1). */
function lattice(seed: number, xi: number, yi: number, salt: number): number {
  return hash3i(seed, xi, yi, salt) / 4294967296;
}

/** Weiche Ueberblendung - ohne sie sieht man das Gitter als Rautenmuster. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Wertrauschen mit bilinearer, geglaetteter Interpolation. Liefert [0,1). */
function noise2(seed: number, x: number, y: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);

  const a = lattice(seed, x0, y0, salt);
  const b = lattice(seed, x0 + 1, y0, salt);
  const c = lattice(seed, x0, y0 + 1, salt);
  const d = lattice(seed, x0 + 1, y0 + 1, salt);

  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Wie gross eine Klimazone ist, in Hexfeldern. Bewusst gross gewaehlt: bei
 * kleinen Zonen flackert das Gelaende von Feld zu Feld und die Karte wirkt
 * unruhig statt vielfaeltig.
 */
const TEMP_SCALE = 16;
const MOIST_SCALE = 13;

export type Climate = {
  /** 0 = kalt, 1 = heiss. */
  temp: number;
  /** 0 = trocken, 1 = feucht. */
  moist: number;
};

/**
 * Klima an einem Hexfeld. Rein - gleiche Eingabe, gleiches Ergebnis.
 *
 * Die axialen Koordinaten werden vorher entzerrt, sonst waeren die Zonen
 * schraege Rauten statt runder Flecken: in einem Pointy-Top-Gitter verschiebt
 * jede Zeile die Spalte um eine halbe Breite.
 */
export function climateAt(seed: number, q: number, r: number): Climate {
  const x = q + r / 2;
  const y = r * 0.866;
  return {
    temp: noise2(seed, x / TEMP_SCALE, y / TEMP_SCALE, SALT_TEMP),
    moist: noise2(seed, x / MOIST_SCALE, y / MOIST_SCALE, SALT_MOIST),
  };
}
