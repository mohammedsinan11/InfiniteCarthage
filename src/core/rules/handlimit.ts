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

import { wirkungenVon } from '../cards/wirkung';
import type { SippenZaehler } from '../cards/sippen';
import { handSize } from '../state';
import { handGrenzeBonus } from '../omen';
import { hausHandGrenze } from '../haus';
import type { Hand, PlayerId } from '../state';

/**
 * Was die Grenze vom Spielstand braucht. Bewusst schmal, damit auch der Client
 * damit rechnen kann: er haelt nur die redigierte Sicht, und darin steht die
 * eigene Hand, fremde nicht.
 */
export type HandView = {
  players: ReadonlyArray<{ id: PlayerId; activeCards: readonly string[]; krone?: string | null; sippe?: SippenZaehler; sippeSeit?: SippenZaehler; zaehler?: Record<string, number>; ruhm?: number; hand?: Hand; handCount?: number; haus?: string | null }>;
  buildings?: Record<string, { owner: string; type: 'settlement' | 'city' }>;
  roads?: Record<string, string>;
  /** Volle Speicher, Leere Taschen (core/omen.ts). */
  omens?: readonly string[];
};

/** Ab dieser Handgrosse gilt man als hortend - vor Kartenboni. */
export const HAND_LIMIT = 7;

/** Die Grenze dieses Spielers, einschliesslich seiner Karten. */
export function limitFor(state: HandView, id: PlayerId): number {
  const p = state.players.find((x) => x.id === id);
  const omen = handGrenzeBonus(state.omens);
  if (!p) return HAND_LIMIT + omen;
  // Die Karten - auch skalierte und negative (Zinseszins) - nie unter 2.
  return Math.max(2, HAND_LIMIT + wirkungenVon(state, id).handLimitBonus + omen + hausHandGrenze(p.haus));
}

/** Haelt dieser Spieler mehr, als ihm zusteht? */
export function isHoarding(state: HandView, id: PlayerId): boolean {
  const p = state.players.find((x) => x.id === id);
  if (!p || !p.hand) return false;
  return handSize(p.hand) > limitFor(state, id);
}
