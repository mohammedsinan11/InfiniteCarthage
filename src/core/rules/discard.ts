/**
 * Abwerfen bei einer Sieben.
 *
 * Uebrig geblieben, nachdem der Raeuber entfernt wurde. Er lebte davon,
 * jemandem zu schaden - wer allein spielt, haette sich selbst bestraft.
 *
 * Das Abwerfen bleibt trotzdem: es ist die einzige Bremse gegen das Horten.
 * Ohne sie koennte man Rohstoffe beliebig ansammeln, und auf einer Karte ohne
 * Rand faellt das nicht einmal auf. Karten koennen die Grenze anheben.
 */

import { handSize } from '../state';
import { modifiersOf } from '../cards/effects';
import type { GameState, PlayerId } from '../state';

/** Ab dieser Handgrosse wird bei einer Sieben abgeworfen - vor Kartenboni. */
export const DISCARD_LIMIT = 7;

/** Die Grenze dieses Spielers, einschliesslich seiner Karten. */
export function limitFor(state: GameState, id: PlayerId): number {
  const p = state.players.find((x) => x.id === id);
  if (!p) return DISCARD_LIMIT;
  return DISCARD_LIMIT + modifiersOf(p.cards).handLimitBonus;
}

/** Wie viele Karten dieser Spieler abwerfen muss (die Haelfte, abgerundet). */
export function discardCount(state: GameState, id: PlayerId): number {
  const p = state.players.find((x) => x.id === id);
  if (!p) return 0;
  const n = handSize(p.hand);
  return n > limitFor(state, id) ? Math.floor(n / 2) : 0;
}

/** Alle Spieler, die nach einer Sieben abwerfen muessen - in Sitzreihenfolge. */
export function playersMustDiscard(state: GameState): PlayerId[] {
  return state.order.filter((id) => discardCount(state, id) > 0);
}
