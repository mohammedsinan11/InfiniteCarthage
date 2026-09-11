/**
 * Spielzustand. Muss durch JSON und wieder zurueck ueberleben - er liegt im
 * Durable Object und geht ueber die Leitung. Deshalb ueberall Record statt
 * Map und keine Klassen.
 *
 * Der Zustand ist selbsttragend: aus worldSeed und chunks laesst sich die
 * gesamte Landschaft neu berechnen (siehe world.ts). Gelaende wird nie
 * gespeichert und nie uebertragen.
 */

import type { Bundle, Resource } from './types';
import type { ChunkCoord } from './chunks';
import type { DraftSource } from './cards/types';

export type PlayerId = string;

export type DevCardType =
  | 'knight'
  | 'victoryPoint'
  | 'roadBuilding'
  | 'yearOfPlenty'
  | 'monopoly';

export type DevCard = {
  type: DevCardType;
  /** Zugnummer des Kaufs. Eine Karte ist erst im naechsten eigenen Zug spielbar. */
  boughtTurn: number;
  played: boolean;
};

export type Hand = Record<Resource, number>;

export const emptyHand = (): Hand => ({
  lumber: 0,
  wool: 0,
  grain: 0,
  brick: 0,
  ore: 0,
});

export const handSize = (h: Hand): number =>
  h.lumber + h.wool + h.grain + h.brick + h.ore;

export type Player = {
  id: PlayerId;
  name: string;
  /** Index in die Farbpalette des Clients. */
  color: number;
  hand: Hand;
  dev: DevCard[];
  playedKnights: number;
  /**
   * Genommene Karten, als Kennungen.
   *
   * Die Dauerwirkungen werden bei Bedarf daraus abgeleitet (cards/effects.ts)
   * statt getrennt gespeichert - so kann der Bonus nicht von den Karten
   * abweichen.
   */
  cards: string[];
  /**
   * Beute aus zerstoerten Lagern und Ruinen, die noch nicht eingeloest ist.
   * Jede ist eine Kartenwahl; eingeloest wird in der eigenen Bauphase.
   */
  loot: number;
  connected: boolean;
};

export type Building = { owner: PlayerId; type: 'settlement' | 'city' };

/** Was auf der Karte laufen kann. */
export type UnitKind = 'ritter' | 'raeuber' | 'goblin' | 'wanderer';

/**
 * Was eine Einheit gerade vorhat.
 *
 *   befehl    Ritter: zieht, wohin der Spieler sie schickt (ziel), sonst steht sie.
 *   raub      zieht zur naechsten Siedlung und pluendert dort.
 *   heimkehr  zieht mit der Beute zurueck ins Lager.
 *   fehde     zieht gegen das Lager einer feindlichen Fraktion (ziel).
 *   wandern   neutral, zieht umher und verschwindet nach einer Weile.
 */
export type Auftrag = 'befehl' | 'raub' | 'heimkehr' | 'fehde' | 'wandern';

/**
 * Eine Einheit im Spielstand.
 *
 * Ritter gehoeren einem Spieler und ziehen, wohin er sie schickt. Raeuber und
 * Goblins gehoeren einer Fraktion, kommen aus einem Lager (heimat) und kehren
 * dorthin zurueck. Wanderer gehoeren niemandem. Alle ziehen ein Feld je Runde
 * (rules/army.ts).
 */
export type UnitState = {
  id: number;
  kind: UnitKind;
  owner: PlayerId | null;
  /** Fraktion bei Raeubern und Goblins (core/factions.ts), sonst null. */
  fraktion: string | null;
  q: number;
  r: number;
  /** Wohin sie zieht - fuer Befehle, Fehden und die Anzeige. */
  ziel: { q: number; r: number } | null;
  /** Aus welchem Lager sie kommt; je Lager ist hoechstens ein Trupp unterwegs. */
  heimat: string | null;
  auftrag: Auftrag;
  /** Verbleibende Leben. Bei 0 faellt die Einheit. */
  leben: number;
  /** Was sie an Beute traegt. Fuer alle ausser dem Beraubten redigiert (redact.ts). */
  fracht: Hand | null;
  /** Wie viele Karten sie traegt - oeffentlich, anders als die Fracht selbst. */
  traegt: number;
  /** Wem die Fracht gehoerte; null, wenn sie von mehreren stammt. */
  beraubt: PlayerId | null;
  /** Wanderer: wie viele Runden sie noch bleiben. Sonst null. */
  dauer: number | null;
};

/**
 * Spielphasen.
 *
 * Aufbau laeuft als Schlange: 0,1,..,n-1,n-1,..,1,0. setupStep zaehlt von 0
 * bis 2n-1 durch, daraus ergibt sich der Spieler - so kann der Zustand die
 * Reihenfolge nicht verlieren.
 */
export type Phase =
  | { t: 'setup'; step: number; awaiting: 'settlement' | 'road'; lastVertex: string | null }
  | { t: 'roll' }
  /**
   * Kartenwahl. Loest die Raeuberphase ab: bei einer Sieben gibt es jetzt
   * einen Fund statt einer Strafe.
   */
  | { t: 'draft' }
  | { t: 'main' }
  | { t: 'roadBuilding'; remaining: number }
  | { t: 'finished'; winner: PlayerId };

/**
 * Ein offenes Handelsangebot des Spielers am Zug.
 *
 * Bewusst KEINE eigene Phase: waehrend ein Angebot liegt, darf weitergebaut
 * werden. Das ist naeher am Brettspiel, wo nebenher verhandelt wird - und es
 * verhindert, dass ein unbeantwortetes Angebot die Partie blockiert.
 *
 * Weil sich Haende bis zur Bestaetigung aendern koennen (der Anbieter baut,
 * ein Monopol raeumt ab), wird beim Abschluss erneut geprueft. Eine Zusage
 * ist eine Absichtserklaerung, keine Reservierung.
 */
export type TradeOffer = {
  /** Immer der Spieler am Zug. */
  from: PlayerId;
  /** Was der Anbieter hergibt. */
  give: Bundle;
  /** Was er dafuer haben will. */
  want: Bundle;
  /** Wer zugesagt hat. Oeffentlich - eine Zusage verraet ohnehin, dass man liefern kann. */
  accepted: PlayerId[];
  /** Wer abgelehnt hat. Nur fuer die Anzeige, damit niemand zweimal gefragt wird. */
  declined: PlayerId[];
};

export type GameState = {
  /** Oeffentlich: die Clients rechnen das Gelaende daraus selbst aus. */
  worldSeed: number;
  /** Geheim: Wuerfel und Kartendeck. Verlaesst das Durable Object nie. */
  secretSeed: number;
  rngState: number;

  players: Player[];
  order: PlayerId[];
  current: number;
  phase: Phase;

  buildings: Record<string, Building>;
  roads: Record<string, PlayerId>;

  bank: Hand;
  deck: DevCardType[];
  packIndex: number;

  /** Zaehlt jeden Spielerzug hoch. Grundlage der Sperre fuer frische Karten. */
  turn: number;
  devPlayedThisTurn: boolean;
  lastRoll: [number, number] | null;

  targetPoints: number;
  largestArmy: PlayerId | null;
  chunks: ChunkCoord[];
  /** Offenes Angebot, oder null. Hoechstens eines gleichzeitig. */
  trade: TradeOffer | null;
  /**
   * Die offene Kartenwahl. Die Karten stehen hier, obwohl sie sich aus Seed
   * und Runde ableiten liessen - so sieht der Client dieselben drei, ohne den
   * geheimen Seed zu kennen.
   */
  draft: { source: DraftSource; options: string[] } | null;
  /** Alle Einheiten auf der Karte. */
  units: UnitState[];
  /** Naechste freie Einheitennummer - Nummern werden nie wiederverwendet. */
  nextUnitId: number;
  /** Zerstoerte Lager, als Feldschluessel "q:r". */
  destroyedNests: string[];
  /**
   * Verbliebene Besatzung angegriffener Lager. Fehlt ein Lager hier, ist es
   * unberuehrt und hat seine volle Besatzung (units.ts, nestOccupants).
   */
  nestGarrison: Record<string, number>;
  /**
   * Eroberte Lager: Feldschluessel -> Fraktion, die es jetzt haelt. Fehlt ein
   * Lager hier, gehoert es der Fraktion seines Gebiets (core/factions.ts).
   */
  nestFraktion: Record<string, string>;
  /** Erkundete Ruinen - jede gibt ihr Ereignis nur einmal her. */
  exploredRuins: string[];
};

/** Die Bank haelt 19 Karten je Rohstoff - auch auf unendlicher Karte. */
export const BANK_PER_RESOURCE = 19;

export function playerById(state: GameState, id: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function currentPlayerId(state: GameState): PlayerId {
  if (state.phase.t === 'setup') {
    return setupPlayerId(state, state.phase.step);
  }
  return state.order[state.current]!;
}

/** Schlangenreihenfolge im Aufbau: hin und wieder zurueck. */
export function setupPlayerId(state: GameState, step: number): PlayerId {
  const n = state.order.length;
  const i = step < n ? step : 2 * n - 1 - step;
  return state.order[i]!;
}

/** Sichtbare Siegpunkte (ohne verdeckte Siegpunktkarten). */
export function publicPoints(state: GameState, id: PlayerId): number {
  let pts = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.owner === id) pts += b.type === 'city' ? 2 : 1;
  }
  if (state.largestArmy === id) pts += 2;
  return pts;
}

/** Gesamtpunkte inklusive verdeckter Karten - nur serverseitig verwenden. */
export function totalPoints(state: GameState, id: PlayerId): number {
  const p = playerById(state, id);
  const hidden = p ? p.dev.filter((d) => d.type === 'victoryPoint').length : 0;
  return publicPoints(state, id) + hidden;
}
