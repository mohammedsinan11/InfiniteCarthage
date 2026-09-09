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

import { hexToField, noise2 } from './noise';

const SALT_TEMP = 21;
const SALT_MOIST = 22;

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
  const p = hexToField(q, r);
  return {
    temp: noise2(seed, p.x / TEMP_SCALE, p.y / TEMP_SCALE, SALT_TEMP),
    moist: noise2(seed, p.x / MOIST_SCALE, p.y / MOIST_SCALE, SALT_MOIST),
  };
}
