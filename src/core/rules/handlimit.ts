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
import type { Hand, PlayerId } from '../state';

/**
 * Was die Grenze vom Spielstand braucht. Bewusst schmal, damit auch der Client
 * damit rechnen kann: er haelt nur die redigierte Sicht, und darin steht die
 * eigene Hand, fremde nicht.
 */
export type HandView = {
  players: ReadonlyArray<{ id: PlayerId; cards: readonly string[]; hand?: Hand }>;
};

/** Ab dieser Handgrosse gilt man als hortend - vor Kartenboni. */
export const HAND_LIMIT = 7;

/** Die Grenze dieses Spielers, einschliesslich seiner Karten. */
export function limitFor(state: HandView, id: PlayerId): number {
  const p = state.players.find((x) => x.id === id);
  if (!p) return HAND_LIMIT;
  return HAND_LIMIT + modifiersOf(p.cards).handLimitBonus;
}

/** Haelt dieser Spieler mehr, als ihm zusteht? */
export function isHoarding(state: HandView, id: PlayerId): boolean {
  const p = state.players.find((x) => x.id === id);
  if (!p || !p.hand) return false;
  return handSize(p.hand) > limitFor(state, id);
}
