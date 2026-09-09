/**
 * Redigierte Sicht je Spieler.
 *
 * Diese Datei ist eine Sicherheitsgrenze, kein Anzeigehelfer. Der Client
 * traegt dieselbe Regel-Engine wie der Server - wuerde der volle Zustand
 * uebertragen, koennte jeder mit den Entwicklerwerkzeugen die Handkarten der
 * Gegner lesen und die naechsten Wuerfe vorausberechnen.
 *
 * Deshalb bleiben hier drei Dinge grundsaetzlich zurueck:
 *   secretSeed und rngState  - sonst sind Wuerfel und Deck vorhersagbar
 *   deck                     - sonst ist die Reihenfolge der Karten bekannt
 *   fremde Haende und Karten - nur die Anzahl geht raus
 */

import { handSize, publicPoints } from './state';
import type { DevCard, GameState, Hand, Phase, PlayerId, TradeOffer } from './state';
import type { ChunkCoord } from './chunks';
import type { GameEvent } from './rules/reducer';

export type PublicPlayer = {
  id: PlayerId;
  name: string;
  color: number;
  /** Anzahl Handkarten - bei Fremden das Einzige, was sichtbar ist. */
  handCount: number;
  /** Anzahl noch nicht gespielter Entwicklungskarten. */
  devCount: number;
  playedKnights: number;
  pieces: { roads: number; settlements: number; cities: number };
  connected: boolean;
  /** Sichtbare Punkte, ohne verdeckte Siegpunktkarten. */
  points: number;
  /** Nur beim Empfaenger gesetzt. */
  hand?: Hand;
  dev?: DevCard[];
};

export type PublicState = {
  worldSeed: number;
  chunks: ChunkCoord[];
  players: PublicPlayer[];
  order: PlayerId[];
  current: number;
  currentPlayer: PlayerId;
  phase: Phase;
  buildings: GameState['buildings'];
  roads: GameState['roads'];
  robber: string;
  bank: Hand;
  /** Wie viele Entwicklungskarten im laufenden Pack noch liegen. */
  deckLeft: number;
  turn: number;
  devPlayedThisTurn: boolean;
  lastRoll: [number, number] | null;
  targetPoints: number;
  largestArmy: PlayerId | null;
  /**
   * Das offene Handelsangebot. Bewusst unredigiert: alle muessen sehen,
   * was geboten wird, sonst laesst sich nicht darauf antworten. Auch die
   * Zusagen sind oeffentlich - wer zusagt, verraet ohnehin, dass er
   * liefern kann.
   */
  trade: TradeOffer | null;
  /** Eigene Punkte inklusive verdeckter Karten - nur fuer den Empfaenger. */
  myPoints: number;
};

export function redactStateFor(state: GameState, viewer: PlayerId): PublicState {
  const players: PublicPlayer[] = state.players.map((p) => {
    const base: PublicPlayer = {
      id: p.id,
      name: p.name,
      color: p.color,
      handCount: handSize(p.hand),
      devCount: p.dev.filter((d) => !d.played).length,
      playedKnights: p.playedKnights,
      pieces: { ...p.pieces },
      connected: p.connected,
      points: publicPoints(state, p.id),
    };
    if (p.id === viewer) {
      base.hand = { ...p.hand };
      base.dev = p.dev.map((d) => ({ ...d }));
    }
    return base;
  });

  const me = state.players.find((p) => p.id === viewer);
  const hidden = me ? me.dev.filter((d) => d.type === 'victoryPoint').length : 0;

  return {
    worldSeed: state.worldSeed,
    chunks: state.chunks,
    players,
    order: state.order,
    current: state.current,
    currentPlayer:
      state.phase.t === 'setup'
        ? state.order[
            state.phase.step < state.order.length
              ? state.phase.step
              : 2 * state.order.length - 1 - state.phase.step
          ]!
        : state.order[state.current]!,
    phase: state.phase,
    buildings: state.buildings,
    roads: state.roads,
    robber: state.robber,
    bank: { ...state.bank },
    deckLeft: state.deck.length,
    turn: state.turn,
    devPlayedThisTurn: state.devPlayedThisTurn,
    lastRoll: state.lastRoll,
    targetPoints: state.targetPoints,
    largestArmy: state.largestArmy,
    trade: state.trade,
    myPoints: (me ? publicPoints(state, viewer) : 0) + hidden,
  };
}

/**
 * Ereignisse fuer einen Empfaenger saeubern.
 *
 * Betrifft praktisch nur das Klauen: Bestohlener und Dieb duerfen wissen,
 * welche Karte gewandert ist, alle anderen nur, DASS etwas gewandert ist.
 */
export function redactEventsFor(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) => {
    if (e.t !== 'steal') return e;
    if (e.from === viewer || e.to === viewer) return e;
    return { ...e, resource: null };
  });
}
