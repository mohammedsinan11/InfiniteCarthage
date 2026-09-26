/**
 * Bedrohung: wie sehr die Wildnis mit dem Reich waechst.
 *
 * Bisher war ein Raubzug in Runde 5 derselbe wie in Runde 500 - zwei je grosser
 * Runde, jeder ein einzelner frischer Raeuber. Drei Ritter genuegten fuer
 * dauernde Ruhe, und weil zerstoerte Lager nie wiederkamen, nahm die Gefahr mit
 * dem Spiel sogar ab. Ein Gegner, der schwaecher wird, waehrend man staerker
 * wird, macht das Ende einer Partie zur Wiederholung.
 *
 * Jetzt richtet sich die Wildnis nach dem, was es zu holen gibt: der Stufe der
 * Bedrohung, aus den sichtbaren Siegpunkten des Spielers, den ein Zug trifft.
 *
 *   Stufe  Punkte  Raubzug                          zusaetzlich
 *     0     0-3    1 Raeuber
 *     1     4-7    1 Raeuber
 *     2     8-11   1 Raeuber, Rang 1
 *     3    12-15   2 Raeuber, Rang 1
 *     4    16-19   2 Raeuber, Rang 2                +1 Raubzug je grosser Runde
 *     5    20-23   2 Raeuber, Rang 2
 *     6    24+     3 Raeuber, Rang 3
 *
 * Der Rang ist derselbe wie bei den Veteranen der Ritter (combat.ts, STUFEN):
 * je Rang ein Punkt Angriff und Leben. Wer klein bleibt, bleibt verschont - das
 * Spiel wird nicht schwerer, nur weil die Uhr laeuft.
 *
 * Zerstoerte Lager kommen wieder (lagerNeuBesetzen): nach einigen grossen
 * Runden bezieht eine Fraktion die Ruine neu - aber nur, wenn jemand die
 * Stufe 1 erreicht hat und dort niemand steht oder baut.
 */

import { hexDistance, parseHexKey } from '../coords';
import { bigRoundOf } from '../season';
import { publicPoints } from '../state';
import type { GameState, PlayerId } from '../state';
import { BESATZUNG_MAX, nestFraktionOf, settlementApproaches } from '../units';

export const PUNKTE_JE_STUFE = 4;
export const BEDROHUNG_MAX = 6;

/** Die Bedrohungsstufe zu so vielen Siegpunkten. */
export const bedrohung = (punkte: number): number =>
  Math.max(0, Math.min(BEDROHUNG_MAX, Math.floor(punkte / PUNKTE_JE_STUFE)));

/** Wie viele Raeuber ein einzelner Raubzug zaehlt. */
export const raubzugGroesse = (stufe: number): number => 1 + Math.floor(stufe / 3);

/** Welchen Rang die Raeuber tragen (combat.ts, stufe). */
export const raeuberRang = (stufe: number): number => Math.floor(stufe / 2);

/** Ein Raubzug mehr je grosser Runde, sobald die Stufe hoch genug ist. */
export const zusatzAufbrueche = (stufe: number): number => (stufe >= 4 ? 1 : 0);

/** Die Stufe, die ein Spieler gerade ausloest. */
export const bedrohungVon = (
  s: Pick<GameState, 'buildings' | 'ruhmreichster' | 'hauptstaedte'>,
  id: PlayerId,
): number => bedrohung(publicPoints(s, id));

/** Die hoechste Stufe am Tisch. */
export const hoechsteBedrohung = (
  s: Pick<GameState, 'buildings' | 'ruhmreichster' | 'hauptstaedte' | 'players'>,
): number => s.players.reduce((n, p) => Math.max(n, bedrohungVon(s, p.id)), 0);

// --- Lager kommen wieder ---------------------------------------------------

/** So viele grosse Runden bleibt ein zerstoertes Lager leer. */
export const LAGER_NEU_RUNDEN = 6;
/** Dichter als so nah an eine Siedlung zieht keine Fraktion ein. */
const LAGER_NEU_ABSTAND = 3;
/** Nur was so nah an einer Siedlung liegt, ist ueberhaupt von Belang. */
const LAGER_NEU_REICHWEITE = 12;

export type BedrohungEvent = { t: 'nestRevived'; q: number; r: number; fraktion: string };

type Ereignisse = { push(...e: BedrohungEvent[]): number };

/** Den Zeitpunkt merken, an dem ein Lager fiel. */
export function lagerFiel(s: GameState, key: string): void {
  if (!s.nestTod) s.nestTod = {};
  s.nestTod[key] = s.turn;
}

/**
 * Zu Beginn jeder grossen Runde: zerstoerte Lager, die lange genug leer standen,
 * beziehen neue Bewohner - mit einer Besatzung nach der Bedrohungsstufe.
 */
export function lagerNeuBesetzen(s: GameState, events: Ereignisse): void {
  if (s.destroyedNests.length === 0) return;
  const stufe = hoechsteBedrohung(s);
  if (stufe < 1) return;
  if (!s.nestTod) s.nestTod = {};
  const siedlungen = [...settlementApproaches(s).keys()].map(parseHexKey);
  const runde = bigRoundOf(s.turn);
  const bleibt: string[] = [];

  for (const k of s.destroyedNests) {
    // Alte Staende kennen den Zeitpunkt nicht: die Uhr beginnt beim ersten Blick.
    const tod = s.nestTod[k] ?? (s.nestTod[k] = s.turn);
    const h = parseHexKey(k);
    const alt = runde - bigRoundOf(tod) >= LAGER_NEU_RUNDEN;
    const besetzt = s.units.some((u) => u.owner !== null && hexDistance(u, h) <= 1);
    const nah = siedlungen.some((a) => hexDistance(a, h) <= LAGER_NEU_REICHWEITE);
    const zuNah = siedlungen.some((a) => hexDistance(a, h) < LAGER_NEU_ABSTAND);
    if (!alt || besetzt || !nah || zuNah) {
      bleibt.push(k);
      continue;
    }
    delete s.nestTod[k];
    delete s.nestFraktion[k];
    s.nestGarrison[k] = Math.min(BESATZUNG_MAX, 1 + Math.floor(stufe / 3));
    events.push({ t: 'nestRevived', q: h.q, r: h.r, fraktion: nestFraktionOf(s, h.q, h.r) });
  }
  s.destroyedNests = bleibt;
}
