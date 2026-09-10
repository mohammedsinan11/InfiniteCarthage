/**
 * Handel - mit der Bank und zwischen Spielern.
 *
 * Haefen liegen bei uns an Wasserfeldern mitten im Land statt an einer
 * Kueste - eine unendliche Karte hat keine. Spielmechanisch aendert das
 * nichts: wer an der richtigen Ecke baut, handelt guenstiger.
 */

import { portAt } from '../world';
import type { World } from '../world';
import { RESOURCES } from '../types';
import type { Bundle, Resource } from '../types';
import { handSize, playerById } from '../state';
import type { GameState, Hand, PlayerId } from '../state';
import type { BoardView } from './placement';
import { modifiersOf } from '../cards/effects';

export const DEFAULT_RATIO = 4;

/**
 * Wie viele Karten dieser Spieler fuer eine Karte des gewuenschten Rohstoffs
 * hinlegen muss: 2 mit passendem 2:1-Hafen, 3 mit 3:1-Hafen, sonst 4.
 */
export function tradeRatio(
  state: BoardView & { players?: ReadonlyArray<{ id: PlayerId; cards: string[] }> },
  world: World,
  player: PlayerId,
  give: Resource,
): number {
  let ratio = DEFAULT_RATIO;
  for (const [vk, b] of Object.entries(state.buildings)) {
    if (b.owner !== player) continue;
    const port = portAt(world, vk);
    if (port === undefined) continue;
    if (port === give) {
      ratio = 2;
      break; // besser geht es ueber Haefen nicht
    }
    if (port === 'any') ratio = Math.min(ratio, 3);
  }
  // Karten koennen den Handel guenstiger machen - aber nie unter zwei, sonst
  // waere Tauschen kein Handel mehr, sondern eine Umbenennung.
  const karten = state.players?.find((p) => p.id === player)?.cards ?? [];
  return Math.max(2, ratio - modifiersOf(karten).tradeDiscount);
}

/** Alle Haefen, an denen dieser Spieler sitzt - fuer die Anzeige. */
export function playerPorts(
  state: BoardView,
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

// --- Handel zwischen Spielern ----------------------------------------------

/** Wie viele Karten ein Buendel umfasst. */
export function bundleSize(b: Bundle): number {
  let n = 0;
  for (const r of RESOURCES) n += b[r] ?? 0;
  return n;
}

/** Hat diese Hand das Buendel vollstaendig? */
export function hasBundle(hand: Hand, b: Bundle): boolean {
  return RESOURCES.every((r) => hand[r] >= (b[r] ?? 0));
}

/** Enthaelt das Buendel negative oder gebrochene Mengen? */
function malformed(b: Bundle): boolean {
  return RESOURCES.some((r) => {
    const n = b[r];
    return n !== undefined && (!Number.isInteger(n) || n < 0);
  });
}

/** Karten von einer Hand in die andere schieben. Die Bank bleibt aussen vor. */
export function moveBundle(from: Hand, to: Hand, b: Bundle): void {
  for (const r of RESOURCES) {
    const n = b[r] ?? 0;
    from[r] -= n;
    to[r] += n;
  }
}

export const MAX_TRADE_CARDS = 20;

/**
 * Darf dieser Spieler dieses Angebot stellen?
 *
 * Die Ueberschneidungspruefung ist keine Schikane: Holz gegen Holz zu
 * tauschen ergibt keinen Zug, verwirrt aber die Anzeige und laedt dazu ein,
 * Mitspieler mit Scheinangeboten zuzumuellen.
 */
export function canOfferTrade(
  state: GameState,
  actor: PlayerId,
  give: Bundle,
  want: Bundle,
): string | null {
  const p = playerById(state, actor);
  if (!p) return 'Unbekannter Spieler.';
  if (state.trade !== null) return 'Es liegt schon ein Angebot.';
  if (malformed(give) || malformed(want)) return 'Ungueltige Mengen.';
  if (bundleSize(give) === 0 || bundleSize(want) === 0) {
    return 'Beide Seiten muessen mindestens eine Karte umfassen.';
  }
  if (bundleSize(give) > MAX_TRADE_CARDS || bundleSize(want) > MAX_TRADE_CARDS) {
    return 'Das Angebot ist zu gross.';
  }
  if (RESOURCES.some((r) => (give[r] ?? 0) > 0 && (want[r] ?? 0) > 0)) {
    return 'Derselbe Rohstoff steht auf beiden Seiten.';
  }
  if (!hasBundle(p.hand, give)) return 'So viele Karten hast du nicht.';
  return null;
}

/** Kann dieser Spieler das offene Angebot bedienen? */
export function canAcceptTrade(state: GameState, actor: PlayerId): string | null {
  const offer = state.trade;
  if (offer === null) return 'Es liegt kein Angebot vor.';
  if (offer.from === actor) return 'Das ist dein eigenes Angebot.';
  const p = playerById(state, actor);
  if (!p) return 'Unbekannter Spieler.';
  if (!hasBundle(p.hand, offer.want)) return 'Du hast nicht, was verlangt wird.';
  return null;
}

/**
 * Laesst sich der Handel mit diesem Partner JETZT abschliessen?
 *
 * Wird beim Bestaetigen erneut gefragt, nicht nur beim Zusagen: zwischen
 * Zusage und Abschluss kann der Anbieter gebaut oder ein Monopol die Hand
 * des Partners geleert haben.
 */
export function canSettleTrade(
  state: GameState,
  partner: PlayerId,
): string | null {
  const offer = state.trade;
  if (offer === null) return 'Es liegt kein Angebot vor.';
  if (!offer.accepted.includes(partner)) return 'Dieser Spieler hat nicht zugesagt.';
  const a = playerById(state, offer.from);
  const b = playerById(state, partner);
  if (!a || !b) return 'Unbekannter Spieler.';
  if (!hasBundle(a.hand, offer.give)) return 'Dir fehlen inzwischen Karten.';
  if (!hasBundle(b.hand, offer.want)) return 'Dem Partner fehlen inzwischen Karten.';
  return null;
}

/** Alle, die zusagen koennten - fuer die Anzeige beim Anbieter. */
export function possiblePartners(state: GameState): PlayerId[] {
  const offer = state.trade;
  if (offer === null) return [];
  return state.order.filter(
    (id) => id !== offer.from && canAcceptTrade(state, id) === null,
  );
}

export { handSize };
