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
  state: GameState,
  hk: string,
  thief: PlayerId,
): PlayerId[] {
  const h = parseHexKey(hk);
  const out = new Set<PlayerId>();
  for (const v of hexVertices(h.q, h.r)) {
    const b = state.buildings[vertexKey(v)];
    if (b === undefined || b.owner === thief) continue;
    const p = state.players.find((x) => x.id === b.owner);
    if (p && handSize(p.hand) > 0) out.add(b.owner);
  }
  return [...out];
}
