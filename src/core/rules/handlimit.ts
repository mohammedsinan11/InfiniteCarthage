/**
 * Die Handkartengrenze.
 *
 * Frueher haing sie an der Sieben: wer zu viel hielt, warf beim Raeuberwurf
 * die Haelfte ab. Diese Kopplung ist gefallen, als die Sieben zum Fund wurde -
 * dieselbe Zahl haette sonst gleichzeitig beschenkt und bestraft.
 *
 * Jetzt beisst die Grenze bei den Pluenderungen (rules/raid.ts). Das ist
 * naeher an dem, was sie eigentlich sagt: Vorraete anzuhaeufen ist gefaehrlich,
 * weil sie jemanden anziehen - nicht, weil eine Zahl faellt.
 */

import { handSize } from '../state';
import { modifiersOf } from '../cards/effects';
import type { GameState, PlayerId } from '../state';

/** Ab dieser Handgrosse gilt man als hortend - vor Kartenboni. */
export const HAND_LIMIT = 7;

/** Die Grenze dieses Spielers, einschliesslich seiner Karten. */
export function limitFor(state: GameState, id: PlayerId): number {
  const p = state.players.find((x) => x.id === id);
  if (!p) return HAND_LIMIT;
  return HAND_LIMIT + modifiersOf(p.cards).handLimitBonus;
}

/** Haelt dieser Spieler mehr, als ihm zusteht? */
export function isHoarding(state: GameState, id: PlayerId): boolean {
  const p = state.players.find((x) => x.id === id);
  if (!p) return false;
  return handSize(p.hand) > limitFor(state, id);
}
