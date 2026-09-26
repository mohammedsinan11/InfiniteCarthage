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
import { sturm, wetterOf } from '../zeit';
import { hatReichsbau } from './reich';
import { handelsAufschlag, handelsDeckel } from '../omen';
import { hausHandelsAufschlag, hausHandelsDeckel } from '../haus';
import { hatWunder } from '../wunder';

export const DEFAULT_RATIO = 4;

/** Sind die Haefen gerade geschlossen? Bei Sturm (core/zeit.ts). */
export function haefenZu(state: { worldSeed?: number; turn?: number }): boolean {
  return state.worldSeed !== undefined && state.turn !== undefined && sturm(wetterOf(state.worldSeed, state.turn));
}

/**
 * Wie viele Karten dieser Spieler fuer eine Karte des gewuenschten Rohstoffs
 * hinlegen muss: 2 mit passendem 2:1-Hafen, 3 mit 3:1-Hafen oder mit einem
 * Handelskontor, sonst 4. Bei Sturm laeuft kein Schiff aus - dann gelten die
 * Haefen nicht, das Handelskontor aber schon.
 */
export function tradeRatioErklaert(
  state: BoardView & {
    players?: ReadonlyArray<{ id: PlayerId; activeCards: string[]; haus?: string | null }>;
    worldSeed?: number;
    turn?: number;
    reichsbauten?: GameState['reichsbauten'];
    units?: GameState['units'];
    /** Handelswinde und Zoellner (core/omen.ts). */
    omens?: readonly string[];
    /** Der Kothon (core/wunder.ts) handelt 3:1. */
    wunder?: GameState['wunder'];
    /** Wie oft in diesem Zug schon mit der Bank getauscht wurde (bankAufschlag). */
    bankZug?: GameState['bankZug'];
    ereignisseAn?: boolean;
  },
  world: World,
  player: PlayerId,
  give: Resource,
): { ratio: number; gruende: string[] } {
  let ratio = DEFAULT_RATIO;
  const gruende: string[] = [];
  const setze = (neu: number, grund: string) => {
    if (neu < ratio) {
      ratio = neu;
      gruende.push(`${grund}: ${neu}:1`);
    }
  };
  const karten = state.players?.find((p) => p.id === player)?.activeCards ?? [];
  const mods = modifiersOf(karten);
  const zu = haefenZu(state) && !mods.stormPorts;
  for (const [vk, b] of Object.entries(state.buildings)) {
    if (zu) break;
    if (b.owner !== player) continue;
    const port = portAt(world, vk);
    if (port === undefined) continue;
    if (port === give) {
      setze(2, 'Passender Hafen');
      break; // besser geht es ueber Haefen nicht
    }
    if (port === 'any') setze(3, '3:1-Hafen');
  }
  /*
   * Das Handelskontor der Phase 2 (rules/reich.ts) handelt ueber Land: 3:1 auf
   * alles, im ganzen Reich, und es bleibt offen, wenn der Sturm die Haefen
   * schliesst. Einen passenden 2:1-Hafen unterbietet es nicht.
   */
  if (hatReichsbau(state, player, 'handelskontor')) setze(3, 'Handelskontor');
  /*
   * Der ernannte Haendler (rules/zweig.ts) handelt, solange er auf der Karte
   * steht: 2:1 auf alles. Faellt er, ist es damit vorbei, bis er zurueckkehrt -
   * seine Wirkung haengt an ihm, nicht an einem Gebaeude.
   */
  if (state.units?.some((u) => u.zweig === 'haendler' && u.owner === player)) {
    setze(2, 'Haendler');
  }
  // Karten koennen den Handel guenstiger machen - aber nie unter zwei, sonst
  // waere Tauschen kein Handel mehr, sondern eine Umbenennung.
  // Omen gelten fuer alle (core/omen.ts): Handelswinde deckelt bei 3:1,
  // Zoellner schlagen auf alles eine Karte auf - auch auf den besten Hafen.
  const deckel = handelsDeckel(state.omens);
  if (deckel !== null) setze(deckel, 'Handelswinde');
  // Das eigene Haus (core/haus.ts): Karthago handelt 3:1, Bergclan und Seher teurer.
  const haus = state.players?.find((p) => p.id === player)?.haus;
  const hausDeckel = hausHandelsDeckel(haus);
  if (hausDeckel !== null) setze(hausDeckel, 'Dein Haus');
  if (hatWunder(state, player, 'kothon')) setze(3, 'Kothon');
  if (zu) gruende.push('Sturm: Haefen zu');
  if (mods.tradeDiscount > 0) {
    if (ratio > 2) gruende.push(`Karte: -${mods.tradeDiscount}`);
    else gruende.push('Karte: wirkt nicht unter 2:1');
  }
  const omenPlus = handelsAufschlag(state.omens);
  if (omenPlus > 0) gruende.push(`Zoellner: +${omenPlus}`);
  const hausPlus = hausHandelsAufschlag(haus);
  if (hausPlus > 0) gruende.push(`Dein Haus: +${hausPlus}`);
  const heute = bankAufschlag(state, player);
  if (heute > 0) gruende.push(`${heute === 1 ? '2.' : 'weiterer'} Tausch in diesem Zug: +${heute}`);
  return { ratio: Math.max(2, ratio - mods.tradeDiscount) + omenPlus + hausPlus + heute, gruende };
}

/**
 * Der Aufschlag fuer weitere Bankgeschaefte im selben Zug: der zweite kostet
 * eine Karte mehr, jeder weitere zwei. Spieltest: die Haelfte aller Aktionen
 * war 4:1-Tausch - Handel soll eine Entscheidung sein, kein Zwischenschritt
 * vor jedem Bau. Nur in Partien mit Ereignissen (die neuen Raeume).
 */
export function bankAufschlag(
  state: { bankZug?: GameState['bankZug']; ereignisseAn?: boolean; turn?: number },
  player: PlayerId,
): number {
  if (!state.ereignisseAn) return 0;
  const z = state.bankZug?.[player];
  if (!z || z.turn !== state.turn) return 0;
  return Math.min(2, z.n);
}

/** Wie tradeRatioErklaert, nur die Zahl. */
export function tradeRatio(...args: Parameters<typeof tradeRatioErklaert>): number {
  return tradeRatioErklaert(...args).ratio;
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
