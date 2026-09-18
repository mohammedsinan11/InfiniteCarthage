/**
 * Die drei Helden, die der Koenig ernennt (DESIGN.md, Phase 2).
 *
 * Mit dem Koenigssitz waehlt ein Spieler genau einen: Krieger, Heilerin oder
 * Haendler - je einer zu einem der drei Reichsbauten. Die Wahl ist
 * ENDGUELTIG; sie faellt einmal je Partie und laesst sich nicht tauschen.
 * Darum steht hier auch, was man aufgibt, nicht nur, was man bekommt.
 *
 * Der Ernannte tritt ZUSAETZLICH zum gewoehnlichen Helden an. Er traegt
 * kind 'held' und unterscheidet sich nur durch u.zweig (core/state.ts).
 */

import type { GameState, HeldZweig, PlayerId } from '../state';
import { playerById } from '../state';
import { hatKoenigssitz } from './hauptstadt';
import type { ReichsbauArt } from './reich';

export const ZWEIGE: readonly HeldZweig[] = ['krieger', 'heilerin', 'haendler'];

export const ZWEIG_NAME: Record<HeldZweig, string> = {
  krieger: 'Krieger',
  heilerin: 'Heilerin',
  haendler: 'Haendler',
};

/** Zu welchem Reichsbau jeder gehoert - dort tritt er auch an. */
export const ZWEIG_BAU: Record<HeldZweig, ReichsbauArt> = {
  krieger: 'burgfeste',
  heilerin: 'tempel',
  haendler: 'handelskontor',
};

/** Wie weit die Heilerin um sich herum heilt (rules/army.ts, Erholung). */
export const HEILERIN_RADIUS = 1;

/**
 * Was jeder von ihnen kann - das sind Regeln, keine Beschreibungen:
 *
 *   Krieger   hoechster Angriff und das meiste Leben (ZWEIG_WERTE). Dazu
 *             fuehrt er wie jeder Held: Ritter auf seinem Feld treffen
 *             leichter (core/combat.ts, ANFUEHRUNG).
 *   Heilerin  heilt eigene Einheiten HEILERIN_RADIUS Felder weit je Runde -
 *             ein wandernder Tempel. Dafuer kaempft sie so gut wie nicht.
 *   Haendler  2:1 auf alles, solange er auf der Karte steht (rules/trade.ts).
 *             Faellt er, ist es vorbei, bis er zurueckkehrt.
 */
export const ZWEIG_ZWECK: Record<HeldZweig, string> = {
  krieger: 'schlaegt am haertesten zu und fuehrt die Seinen',
  heilerin: `heilt eigene Einheiten ${HEILERIN_RADIUS} Feld weit je Runde, kaempft aber kaum`,
  haendler: 'tauscht 2:1 auf alles, solange er steht',
};

/**
 * Warum jetzt nicht ernannt werden kann - oder null.
 *
 * Nur mit Koenigssitz, und nur einmal: die zweite Ernennung gibt es nicht.
 */
export function ernennungHindernis(s: GameState, player: PlayerId): string | null {
  const p = playerById(s, player);
  if (!p) return 'Unbekannter Spieler.';
  if (!hatKoenigssitz(s, player)) return 'Erst der Koenigssitz laesst dich ernennen.';
  if (p.ernannt) return `Du hast schon ${ZWEIG_NAME[p.ernannt.zweig]} ernannt - die Wahl ist endgueltig.`;
  return null;
}
