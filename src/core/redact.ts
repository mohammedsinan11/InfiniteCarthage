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

import { emptyHand, handSize, publicPoints } from './state';
import type { DevCard, GameState, Hand, Phase, PlayerId, TradeOffer } from './state';
import type { ChunkCoord } from './chunks';
import type { GameEvent } from './rules/reducer';
import type { HeldLore } from './lore';

export type PublicPlayer = {
  id: PlayerId;
  name: string;
  color: number;
  /** Anzahl Handkarten - bei Fremden das Einzige, was sichtbar ist. */
  handCount: number;
  /** Anzahl noch nicht gespielter Entwicklungskarten. */
  devCount: number;
  playedKnights: number;
  /** Sichtbarer Fortschritt zur Ruhmwertung. */
  ruhm: number;
  /**
   * Genommene Karten - oeffentlich, im Gegensatz zur Hand.
   *
   * Sie aendern sichtbare Regeln: wer weiss, dass jemand doppelten Ertrag aus
   * Bergen zieht, kann das einordnen. Sie zu verbergen waere kein Geheimnis,
   * sondern Verwirrung.
   */
  cards: string[];
  /** Aktive Reichskarten; nur diese liefern eine Dauerwirkung. */
  activeCards: string[];
  /** Taktikkarten bleiben bis zum Ausspielen geheim; nur ihre Zahl ist sichtbar. */
  tacticCount: number;
  /** Ausruestung ist wie die Figur, die sie traegt, oeffentlich. */
  equipment: string[];
  /** Uneingeloeste Beute - oeffentlich: wer ein Lager zerstoert, tut das vor aller Augen. */
  loot: number;
  /** Wann der gefallene Held zurueckkehrt, oder null - oeffentlich wie sein Fall. */
  heldZurueck: number | null;
  /** Name, Haus und Titel des Helden - oeffentlich: sein Schild steht auf der Karte. */
  held: HeldLore | null;
  /** Gesammelte Dinge, etwa Gelee - oeffentlich wie die Beute. */
  inventar: Record<string, number>;
  /**
   * Der ernannte Held - oeffentlich: er steht sichtbar auf der Karte, und wen
   * der Koenig beruft, erfaehrt ohnehin jeder (rules/zweig.ts).
   */
  ernannt: GameState['players'][number]['ernannt'];
  connected: boolean;
  /** Sichtbare Punkte, ohne verdeckte Siegpunktkarten. */
  points: number;
  /** Nur beim Empfaenger gesetzt. */
  hand?: Hand;
  dev?: DevCard[];
  /** Nur der Besitzer sieht, welche Taktiken er auf der Hand hat. */
  tactics?: string[];
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
  /** Wachtuerme - oeffentlich wie die Gebaeude. */
  tuerme: GameState['tuerme'];
  /** Palisade - oeffentlich wie Strassen. */
  mauern: GameState['mauern'];
  /** Reichsbauten der Phase 2 - oeffentlich: sie stehen weithin sichtbar. */
  reichsbauten: GameState['reichsbauten'];
  /** Hauptstaedte - oeffentlich wie die Gebaeude. */
  hauptstaedte: GameState['hauptstaedte'];
  /** Wie viele Entwicklungskarten im laufenden Pack noch liegen. */
  deckLeft: number;
  turn: number;
  lastRoll: [number, number] | null;
  targetPoints: number;
  ruhmreichster: PlayerId | null;
  /** Offene, bis zur naechsten Heeresrunde vorbereitete Taktiken. */
  tacticBuffs: GameState['tacticBuffs'];
  /** Die offene Kartenwahl - fuer alle sichtbar, gewaehlt wird vom Spieler am Zug. */
  draft: GameState['draft'];
  /**
   * Das offene Handelsangebot. Bewusst unredigiert: alle muessen sehen,
   * was geboten wird, sonst laesst sich nicht darauf antworten. Auch die
   * Zusagen sind oeffentlich - wer zusagt, verraet ohnehin, dass er
   * liefern kann.
   */
  trade: TradeOffer | null;
  /** Eigene Punkte inklusive verdeckter Karten - nur fuer den Empfaenger. */
  myPoints: number;
  /**
   * Heer, zerstoerte Lager, erkundete Ruinen - alles oeffentlich. Einheiten
   * stehen sichtbar auf der Karte; der Nebel im Client ist Anschauung, keine
   * Geheimhaltung, denn Gelaende und Lager folgen ohnehin aus dem Seed.
   */
  units: GameState['units'];
  destroyedNests: string[];
  nestGarrison: Record<string, number>;
  nestFraktion: Record<string, string>;
  exploredRuins: string[];
  /**
   * Feuer, Asche, Abkommen und Auftraege - oeffentlich. Ein Feuer sieht man von
   * weitem, und ein Abkommen aendert, wen die Raeuber angreifen: das muss jeder
   * einordnen koennen.
   */
  braende: GameState['braende'];
  asche: GameState['asche'];
  abkommen: GameState['abkommen'];
  auftraege: GameState['auftraege'];
  /** Die Omen - oeffentlich, sie gelten fuer alle (core/omen.ts). */
  omens: string[];
  /** Nach so vielen Runden endet die Partie; null ohne Grenze. */
  rundenLimit: number | null;
  /** Das Datum einer Tagesexpedition, sonst null (core/tages.ts). */
  tagesDatum: string | null;
  /**
   * Punkteverlauf, Zahlen und Momente (core/chronik.ts) - oeffentlich wie das
   * Protokoll. Verdeckte Siegpunktkarten stehen erst nach dem Ende darin.
   */
  chronik: NonNullable<GameState['chronik']> | null;
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
      ruhm: p.ruhm,
      cards: [...p.cards],
      activeCards: [...p.activeCards],
      tacticCount: p.tactics.length,
      equipment: [...p.equipment],
      loot: p.loot,
      heldZurueck: p.heldZurueck,
      held: p.held ?? null,
      inventar: { ...(p.inventar ?? {}) },
      ernannt: p.ernannt ? { ...p.ernannt, lore: { ...p.ernannt.lore } } : null,
      connected: p.connected,
      points: publicPoints(state, p.id),
    };
    if (p.id === viewer) {
      base.hand = { ...p.hand };
      base.dev = p.dev.map((d) => ({ ...d }));
      base.tactics = [...p.tactics];
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
    tuerme: state.tuerme ?? {},
    mauern: state.mauern ?? {},
    reichsbauten: state.reichsbauten ?? {},
    hauptstaedte: state.hauptstaedte,
    deckLeft: state.deck.length,
    turn: state.turn,
    lastRoll: state.lastRoll,
    targetPoints: state.targetPoints,
    ruhmreichster: state.ruhmreichster,
    tacticBuffs: state.tacticBuffs,
    draft: state.draft,
    trade: state.trade,
    myPoints: (me ? publicPoints(state, viewer) : 0) + hidden,
    // Was ein Raubzug heimtraegt, sieht nur der Beraubte - wie beim Pluendern
    // selbst. Wie viel es ist, bleibt fuer alle sichtbar (traegt).
    units: state.units.map((u) =>
      u.fracht !== null && u.beraubt !== viewer ? { ...u, fracht: null } : u,
    ),
    destroyedNests: state.destroyedNests,
    nestGarrison: state.nestGarrison,
    nestFraktion: state.nestFraktion,
    exploredRuins: state.exploredRuins,
    braende: state.braende,
    asche: state.asche,
    abkommen: state.abkommen,
    auftraege: state.auftraege,
    omens: state.omens ?? [],
    rundenLimit: state.rundenLimit ?? null,
    tagesDatum: state.tagesDatum ?? null,
    chronik: state.chronik ?? null,
  };
}

/**
 * Ereignisse fuer einen Empfaenger saeubern.
 *
 * Eine Pluenderung nennt, WELCHE Rohstoffe genommen wurden. Beim Bestohlenen
 * gehoert das hin - er sieht seine Hand ohnehin. Bei allen anderen waere es
 * ein Blick in fremde Karten: wer mitschreibt, was jemandem genommen wurde,
 * rekonstruiert mit der Zeit dessen Vorrat.
 *
 * Die ANZAHL bleibt oeffentlich. Dass jemand geplündert wurde und wie hart,
 * ist Teil des Spielgeschehens - nur das Was nicht.
 */
export function redactEventsFor(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  // Zurueckeroberte Beute ebenso: sie landet in einer Hand.
  return events.map((e) =>
    (e.t === 'plunder' || e.t === 'lootRecovered') && e.player !== viewer
      ? { ...e, taken: emptyHand() }
      : e,
  );
}
