/**
 * Raeubernester.
 *
 * Sie liegen auf der Karte wie das Gelaende: aus dem worldSeed abgeleitet,
 * ueberall, auch dort, wo noch nie jemand war. Damit muss der Server ihre
 * Lage nie uebertragen - jeder Client rechnet sie selbst aus, genau wie die
 * Landschaft. Derselbe Trick, kein neues Rohr.
 *
 * WOZU. Bisher war Hinausbauen reine Aufwaertsbewegung: mehr Land, mehr
 * Ertrag, es kostete nur Strassen. Eine Karte ohne Rand, aber auch ohne
 * Draussen. Die Nester machen Entfernung zu etwas, das man abwaegt - weit weg
 * ist unerschlossen und ertragreich, aber ungeschuetzt.
 *
 * VERTEILUNG. Ein reiner Wurf je Feld wuerde Nester verklumpen; ein Gebiet
 * haette fuenf, das naechste keines. Stattdessen wird die Ebene in Regionen
 * geteilt, und jede Region traegt hoechstens ein Nest. Das Nest sitzt im
 * INNEREN der Region, nie am Rand - dadurch koennen zwei Nester benachbarter
 * Regionen einander nicht zu nahe kommen.
 *
 * Zugesichert ist damit ein Mindestabstand, nicht ein gleicher Abstand. Die
 * Karte soll nicht wie ein Gitter aussehen.
 */

import { Rng } from './rng';
import { hash3i } from './hash';
import { hexDistance, hexesInRange } from './coords';
import { terrainAt } from './worldgen';
import type { Hex } from './coords';

const SALT_NEST = 71;

/** Kantenlaenge einer Region in Axialkoordinaten. */
export const NEST_REGION = 6;

/** Wie viele Regionen ueberhaupt ein Nest tragen. */
const NEST_CHANCE = 0.55;

/**
 * Ruhe um den Ursprung.
 *
 * Radius 3, waehrend beim Start Radius 4 aufgedeckt wird: das naechste Nest
 * liegt also am Rand der sichtbaren Welt. Man sieht die Bedrohung von der
 * ersten Runde an, aber sie steht nicht in der eigenen Stube.
 */
export const NEST_SAFE_RADIUS = 3;

const ORIGIN: Hex = { q: 0, r: 0 };

/** Liegt hier ein Nest? Rein - haengt nur von Seed und Koordinate ab. */
export function nestAt(seed: number, q: number, r: number): boolean {
  const rq = Math.floor(q / NEST_REGION);
  const rr = Math.floor(r / NEST_REGION);

  const rng = new Rng(hash3i(seed, rq, rr, SALT_NEST));
  if (rng.next() / 4294967296 > NEST_CHANCE) return false;

  // Innere Felder der Region: 1 .. NEST_REGION-2. Der Rand bleibt frei, damit
  // Nester benachbarter Regionen Abstand halten.
  const dq = 1 + rng.int(NEST_REGION - 2);
  const dr = 1 + rng.int(NEST_REGION - 2);
  if (q !== rq * NEST_REGION + dq || r !== rr * NEST_REGION + dr) return false;

  if (hexDistance({ q, r }, ORIGIN) <= NEST_SAFE_RADIUS) return false;

  // Raeuber wohnen an Land. Das duennt die Nester an Kuesten aus, was der
  // Karte guttut: das Meer ist ohnehin schon eine Grenze.
  return terrainAt(seed, q, r) !== 'water';
}

/** Alle Nester im Umkreis. Fuer Anzeige und Bedrohungsrechnung. */
export function nestsInRange(seed: number, center: Hex, radius: number): Hex[] {
  return hexesInRange(center, radius).filter((h) => nestAt(seed, h.q, h.r));
}
