/**
 * Ruinen.
 *
 * Wie Lager aus dem worldSeed abgeleitet und ueber Regionen verteilt, nur
 * seltener und in groesseren Regionen. Wo eine Ruine liegt, ist oeffentlich;
 * was sie birgt, entscheidet erst der Wurf bei ihrer Erkundung (rules/army.ts),
 * aus dem geheimen rngState - vorhersagbar ist es nicht.
 */

import { Rng } from './rng';
import { hash3i } from './hash';
import { hexDistance } from './coords';
import { nestAt } from './raiders';
import { terrainAt } from './worldgen';

const SALT_RUINE = 79;

/** Kantenlaenge einer Region; jede traegt hoechstens eine Ruine. */
export const RUIN_REGION = 9;

/** Wie viele Regionen eine Ruine tragen. */
const RUIN_CHANCE = 0.45;

/** Keine Ruine direkt am Start - man soll hinziehen muessen. */
export const RUIN_SAFE_RADIUS = 2;

export type RuinResult = 'schatz' | 'beute' | 'karte' | 'hinterhalt';

/** Liegt hier eine Ruine? Rein - haengt nur von Seed und Koordinate ab. */
export function ruinAt(seed: number, q: number, r: number): boolean {
  const rq = Math.floor(q / RUIN_REGION);
  const rr = Math.floor(r / RUIN_REGION);
  const rng = new Rng(hash3i(seed, rq, rr, SALT_RUINE));
  if (rng.next() / 4294967296 > RUIN_CHANCE) return false;
  // Im Inneren der Region, damit Ruinen benachbarter Regionen Abstand halten.
  const dq = 1 + rng.int(RUIN_REGION - 2);
  const dr = 1 + rng.int(RUIN_REGION - 2);
  if (q !== rq * RUIN_REGION + dq || r !== rr * RUIN_REGION + dr) return false;
  if (hexDistance({ q, r }, { q: 0, r: 0 }) <= RUIN_SAFE_RADIUS) return false;
  if (nestAt(seed, q, r)) return false;
  return terrainAt(seed, q, r) !== 'water';
}

/**
 * Was eine Erkundung ergibt, aus einem Wurf 1 bis 6.
 *
 *   1    Hinterhalt   - ein Goblin wartet; der Ritter muss sich wehren
 *   2-3  Schatz       - drei Rohstoffe
 *   4-5  Beute        - eine Kartenwahl
 *   6    alte Karte   - die Umgebung wird weit aufgedeckt
 */
export function ruinResultFor(wurf: number): RuinResult {
  if (wurf <= 1) return 'hinterhalt';
  if (wurf <= 3) return 'schatz';
  if (wurf <= 5) return 'beute';
  return 'karte';
}
