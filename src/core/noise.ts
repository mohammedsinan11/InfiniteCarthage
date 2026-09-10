/**
 * Wertrauschen fuer Gelaende und Klima.
 *
 * Rein aus Seed und Koordinate, ohne jeden Blick auf Nachbarn. Genau das
 * unterscheidet den Ansatz vom Vorbild (hexmap): dort entstehen Kontinente
 * durch Fluten und Abstandsmessungen ueber die ganze Karte, was einen Rand
 * voraussetzt. Rauschen braucht keinen - man kann es an jeder Stelle
 * auswerten, ohne zu wissen, was sonst existiert.
 *
 * Der Preis: keine Fluesse, und Meer laesst sich nicht von einem grossen See
 * unterscheiden. Beides braucht globale Information.
 */

import { hash3i } from './hash';

/** Gitterwert in [0,1). */
function lattice(seed: number, xi: number, yi: number, salt: number): number {
  return hash3i(seed, xi, yi, salt) / 4294967296;
}

/** Weiche Ueberblendung - ohne sie sieht man das Gitter als Rautenmuster. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Wertrauschen mit bilinearer, geglaetteter Interpolation. Liefert [0,1). */
export function noise2(seed: number, x: number, y: number, salt: number): number {
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
 * Mehrere Rauschlagen uebereinander: grosse Formen, darauf feinere.
 *
 * Ohne die feinen Lagen sehen die Kuesten aus wie mit dem Lineal gezogen -
 * weiche Rundungen, die niemand fuer eine Landschaft haelt.
 */
export function fbm(
  seed: number,
  x: number,
  y: number,
  salt: number,
  octaves = 3,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(seed, x * freq, y * freq, salt + o * 977);
    norm += amp;
    amp *= 0.5;
    freq *= 2.07; // krumm, damit sich die Lagen nicht auf dem Gitter decken
  }
  return sum / norm;
}

/**
 * Werte um die Mitte spreizen.
 *
 * fbm mittelt mehrere Rauschlagen, und Mittelwerte draengen zur Mitte: fast
 * alles landet zwischen 0,35 und 0,65. Die aeusseren Schwellen - Berge,
 * Wueste - greifen dann kaum noch. Gemessen kamen so nur 3 % Berge heraus,
 * und kein einziger von 300 Seeds hatte ein spielbares Startgebiet.
 *
 * expand zieht die Verteilung auseinander, ohne ihre Form zu aendern.
 */
export function expand(v: number, k = 1.9): number {
  const t = (v - 0.5) * k + 0.5;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Rauschen zu Kammlinien falten.
 *
 * 1 - |2v-1| macht aus einem weichen Feld eines mit scharfem Grat dort, wo das
 * Original die Mitte kreuzt. Aus runden Bergklumpen werden dadurch Ketten -
 * genau der Unterschied, den man auf hexmaps Karten als Gebirgszug sieht.
 */
export function ridged(v: number): number {
  return 1 - Math.abs(2 * v - 1);
}

/**
 * Axiale Hexkoordinaten in ein gleichmaessiges Feld umrechnen.
 *
 * Ohne das waeren alle Zonen schraege Rauten: in einem Pointy-Top-Gitter
 * verschiebt jede Zeile die Spalte um eine halbe Breite.
 */
export function hexToField(q: number, r: number): { x: number; y: number } {
  return { x: q + r / 2, y: r * 0.866 };
}
