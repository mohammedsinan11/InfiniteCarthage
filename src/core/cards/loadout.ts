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
 * Eine frisch gewaehlte Dauerkarte kommt auf einen freien Platz. Sind alle
 * voll, entscheidet ersetze:
 *   - eine aktive Karte: genau die weicht,
 *   - null: nichts weicht, die neue Karte bleibt im Besitz und inaktiv,
 *   - weggelassen: die aelteste weicht (das alte Verhalten, fuer Aufrufer ohne
 *     eigene Wahl).
 * Danach laesst sich mit setzeAktiveKarten jederzeit umstellen.
 */
export function aktiviereNeueReichskarte(
  state: Pick<GameState, 'hauptstaedte'>,
  player: Pick<Player, 'id' | 'activeCards'>,
  card: string,
  ersetze?: string | null,
): void {
  if (!istDauerhafteReichskarte(card) || player.activeCards.includes(card)) return;
  const max = reichskartenPlaetze(state, player.id);
  if (player.activeCards.length < max) {
    player.activeCards = [...player.activeCards, card];
  } else if (ersetze === undefined) {
    player.activeCards = [...player.activeCards, card].slice(-max);
  } else if (ersetze !== null && player.activeCards.includes(ersetze)) {
    player.activeCards = player.activeCards.map((c) => (c === ersetze ? card : c));
  }
}

/** Die aktiven Reichskarten neu zusammenstellen. null bei Erfolg, sonst der Grund. */
export function setzeAktiveKarten(
  state: Pick<GameState, 'hauptstaedte'>,
  player: Pick<Player, 'id' | 'activeCards' | 'cards'>,
  wunsch: readonly string[],
): string | null {
  if (new Set(wunsch).size !== wunsch.length) return 'Eine Karte kann nur einmal aktiv sein.';
  const max = reichskartenPlaetze(state, player.id);
  if (wunsch.length > max) return `Du hast nur ${max} Plaetze.`;
  for (const id of wunsch) {
    if (!player.cards.includes(id)) return 'Diese Karte besitzt du nicht.';
    if (!istDauerhafteReichskarte(id)) return 'Nur Karten mit Dauerwirkung lassen sich aktivieren.';
  }
  player.activeCards = [...wunsch];
  return null;
}

/** Alte Staende: einzigartige Dauerwirkungen, bis die heutigen Plaetze voll sind. */
export function ersteAktiveReichskarten(
  state: Pick<GameState, 'hauptstaedte'>,
  player: Pick<Player, 'id' | 'cards'>,
): string[] {
  const einzigartig = [...new Set(player.cards.filter(istDauerhafteReichskarte))];
  return einzigartig.slice(0, reichskartenPlaetze(state, player.id));
}
