/**
 * Das Hexenhaus.
 *
 * Wie Lager und Ruinen aus dem worldSeed abgeleitet - rein, ueberall
 * berechenbar, nie uebertragen. Nur viel seltener: eine Region ist so gross,
 * dass man weit ziehen muss, um eines zu finden. Es soll ein Fund sein, kein
 * Moebelstueck der Landschaft.
 *
 * Wer dort steht, ist die Hexe (rules/army.ts, hexenWache). Sie gehoert
 * keiner Bande und keinem Stamm, sondern sich selbst: eine eigene Fraktion
 * ohne Gebiet, mit der sich nicht verhandeln laesst. Sie zieht nicht umher -
 * sie bleibt bei ihrem Haus und verteidigt es.
 */

import { Rng } from './rng';
import { hash3i } from './hash';
import { hexDistance } from './coords';
import { nestAt } from './raiders';
import { ruinAt } from './ruins';
import { terrainAt } from './worldgen';

const SALT_HEXE = 91;

/** Kantenlaenge einer Region; jede traegt hoechstens ein Hexenhaus. */
export const HEXE_REGION = 24;

/** Wie viele Regionen ueberhaupt eines tragen. */
const HEXE_CHANCE = 0.5;

/** Nicht vor der eigenen Tuer - man soll sie suchen muessen. */
export const HEXE_SAFE_RADIUS = 8;

/** Die Fraktion der Hexe: ohne Gebiet, ohne Lager, ohne Diplomatie. */
export const HEXE_ID = 'hexe';

/** Steht hier ein Hexenhaus? Rein - haengt nur von Seed und Koordinate ab. */
export function hexenhausAt(seed: number, q: number, r: number): boolean {
  const rq = Math.floor(q / HEXE_REGION);
  const rr = Math.floor(r / HEXE_REGION);
  const rng = new Rng(hash3i(seed, rq, rr, SALT_HEXE));
  if (rng.next() / 4294967296 > HEXE_CHANCE) return false;
  // Im Inneren der Region, damit zwei Haeuser einander nicht zu nahe kommen.
  const dq = 2 + rng.int(HEXE_REGION - 4);
  const dr = 2 + rng.int(HEXE_REGION - 4);
  if (q !== rq * HEXE_REGION + dq || r !== rr * HEXE_REGION + dr) return false;
  if (hexDistance({ q, r }, { q: 0, r: 0 }) <= HEXE_SAFE_RADIUS) return false;
  // Sie teilt ihr Feld mit niemandem.
  if (nestAt(seed, q, r) || ruinAt(seed, q, r)) return false;
  return terrainAt(seed, q, r) !== 'water';
}
