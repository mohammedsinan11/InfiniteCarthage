/**
 * Raeuber, Abwerfen und Klauen.
 *
 * Es gibt genau einen Raeuber, auch auf unbegrenzter Karte. Mehrere waeren
 * denkbar, wuerden aber die Bedrohung verwaessern: bei unbegrenztem Platz
 * kann man einem Raeuber ohnehin leichter ausweichen als im Original.
 */

import { hexVertices, vertexKey, parseHexKey } from '../coords';
import { isGenerated } from '../world';
import type { World } from '../world';
import { handSize } from '../state';
import type { GameState, PlayerId } from '../state';
import type { BoardView } from './placement';

/** Ab dieser Handgrosse wird bei einer 7 abgeworfen. */
export const DISCARD_LIMIT = 7;

/** Wie viele Karten dieser Spieler abwerfen muss (die Haelfte, abgerundet). */
export function discardCount(state: GameState, id: PlayerId): number {
  const p = state.players.find((x) => x.id === id);
  if (!p) return 0;
  const n = handSize(p.hand);
  return n > DISCARD_LIMIT ? Math.floor(n / 2) : 0;
}

/** Alle Spieler, die nach einer 7 abwerfen muessen - in Sitzreihenfolge. */
export function playersMustDiscard(state: GameState): PlayerId[] {
  return state.order.filter((id) => discardCount(state, id) > 0);
}

export function canMoveRobber(
  state: GameState,
  world: World,
  hk: string,
): string | null {
  if (hk === state.robber) return 'Der Raeuber steht schon dort.';
  const h = parseHexKey(hk);
  if (!isGenerated(world, h.q, h.r)) return 'Dieses Feld ist noch nicht aufgedeckt.';
  return null;
}

/**
 * Wen kann man auf diesem Feld bestehlen? Nur Spieler mit einem Gebaeude am
 * Feld, die auch wirklich Karten haben - und nie sich selbst.
 */
export function stealCandidates(
  state: BoardView,
  hk: string,
  thief: PlayerId,
  /**
   * Ob dieser Spieler ueberhaupt Karten hat. Als Funktion uebergeben, weil
   * der Server die Haende kennt, der Client aber nur deren Anzahl - so
   * benutzen beide dieselbe Regel statt zweier Nachbauten.
   */
  hasCards: (id: PlayerId) => boolean,
): PlayerId[] {
  const h = parseHexKey(hk);
  const out = new Set<PlayerId>();
  for (const v of hexVertices(h.q, h.r)) {
    const b = state.buildings[vertexKey(v)];
    if (b === undefined || b.owner === thief) continue;
    if (hasCards(b.owner)) out.add(b.owner);
  }
  return [...out];
}

/** Bequemer Aufruf auf dem Server, wo die Haende bekannt sind. */
export function stealCandidatesServer(
  state: GameState,
  hk: string,
  thief: PlayerId,
): PlayerId[] {
  return stealCandidates(state, hk, thief, (id) => {
    const p = state.players.find((x) => x.id === id);
    return p !== undefined && handSize(p.hand) > 0;
  });
}
