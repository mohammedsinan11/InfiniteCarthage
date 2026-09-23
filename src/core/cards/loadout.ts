/** Begrenzte Plaetze fuer dauerhafte Reichskarten. */

import { cardById } from './catalog';
import { cardKind, dauerwirkungen } from './types';
import type { GameState, Player, PlayerId } from '../state';

export const REICHSKARTEN_PLAETZE = 2;
export const HAUPTSTADT_KARTEN_PLAETZE = 3;
export const KOENIGSSITZ_KARTEN_PLAETZE = 4;

export function reichskartenPlaetze(
  state: Pick<GameState, 'hauptstaedte'>,
  player: PlayerId,
): number {
  const stufe = Object.values(state.hauptstaedte ?? {})
    .filter((h) => h.owner === player)
    .reduce((n, h) => Math.max(n, h.stufe), 0);
  if (stufe >= 3) return KOENIGSSITZ_KARTEN_PLAETZE;
  if (stufe >= 1) return HAUPTSTADT_KARTEN_PLAETZE;
  return REICHSKARTEN_PLAETZE;
}

export function istDauerhafteReichskarte(id: string): boolean {
  const c = cardById(id);
  return !!c && cardKind(c) === 'reich' && dauerwirkungen(c).length > 0;
}

/**
 * Eine frisch gewaehlte Dauerkarte wird sofort aktiv. Sind alle Plaetze voll,
 * ersetzt die bewusste neue Wahl die aelteste aktive Karte. Die spaetere
 * Kartenverwaltung kann aus der Sammlung wieder anders zusammenstellen.
 */
export function aktiviereNeueReichskarte(
  state: Pick<GameState, 'hauptstaedte'>,
  player: Pick<Player, 'id' | 'activeCards'>,
  card: string,
): void {
  if (!istDauerhafteReichskarte(card) || player.activeCards.includes(card)) return;
  const max = reichskartenPlaetze(state, player.id);
  player.activeCards = [...player.activeCards, card].slice(-max);
}

/** Alte Staende: einzigartige Dauerwirkungen, bis die heutigen Plaetze voll sind. */
export function ersteAktiveReichskarten(
  state: Pick<GameState, 'hauptstaedte'>,
  player: Pick<Player, 'id' | 'cards'>,
): string[] {
  const einzigartig = [...new Set(player.cards.filter(istDauerhafteReichskarte))];
  return einzigartig.slice(0, reichskartenPlaetze(state, player.id));
}
