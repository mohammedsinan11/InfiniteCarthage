/**
 * Handel mit der Bank, inklusive Haefen.
 *
 * Haefen liegen bei uns an Wasserfeldern mitten im Land statt an einer
 * Kueste - eine unendliche Karte hat keine. Spielmechanisch aendert das
 * nichts: wer an der richtigen Ecke baut, handelt guenstiger.
 */

import { portAt } from '../world';
import type { World } from '../world';
import type { Resource } from '../types';
import type { GameState, PlayerId } from '../state';

export const DEFAULT_RATIO = 4;

/**
 * Wie viele Karten dieser Spieler fuer eine Karte des gewuenschten Rohstoffs
 * hinlegen muss: 2 mit passendem 2:1-Hafen, 3 mit 3:1-Hafen, sonst 4.
 */
export function tradeRatio(
  state: GameState,
  world: World,
  player: PlayerId,
  give: Resource,
): number {
  let ratio = DEFAULT_RATIO;
  for (const [vk, b] of Object.entries(state.buildings)) {
    if (b.owner !== player) continue;
    const port = portAt(world, vk);
    if (port === undefined) continue;
    if (port === give) return 2; // besser geht es nicht
    if (port === 'any') ratio = Math.min(ratio, 3);
  }
  return ratio;
}

/** Alle Haefen, an denen dieser Spieler sitzt - fuer die Anzeige. */
export function playerPorts(
  state: GameState,
  world: World,
  player: PlayerId,
): string[] {
  const out = new Set<string>();
  for (const [vk, b] of Object.entries(state.buildings)) {
    if (b.owner !== player) continue;
    const port = portAt(world, vk);
    if (port !== undefined) out.add(port);
  }
  return [...out];
}

export function canBankTrade(
  state: GameState,
  world: World,
  player: PlayerId,
  give: Resource,
  receive: Resource,
): string | null {
  if (give === receive) return 'Gleicher Rohstoff auf beiden Seiten.';
  const p = state.players.find((x) => x.id === player);
  if (!p) return 'Unbekannter Spieler.';
  const ratio = tradeRatio(state, world, player, give);
  if (p.hand[give] < ratio) return `Dafuer brauchst du ${ratio} ${give}.`;
  if (state.bank[receive] < 1) return 'Die Bank hat davon nichts mehr.';
  return null;
}
