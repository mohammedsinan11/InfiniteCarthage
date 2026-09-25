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
import type { HeldLore } from './lore';

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
  /** Ruhm aus einmaligen Kampf-, Auftrags- und Veteranenmeilensteinen. */
  ruhm: number;
  /**
   * Genommene Karten, als Kennungen.
   *
   * Die Dauerwirkungen werden bei Bedarf daraus abgeleitet (cards/effects.ts)
   * statt getrennt gespeichert - so kann der Bonus nicht von den Karten
   * abweichen.
   */
  cards: string[];
  /** Die wenigen Reichskarten, deren Dauerwirkung gerade aktiv ist. */
  activeCards: string[];
  /** Ausspielbare und danach verbrauchte Kampf- und Heldenkarten. */
  tactics: string[];
  /** Fuer die kommenden Gegenstaende des Abenteuerzweigs. */
  equipment: string[];
  /**
   * Beute aus zerstoerten Lagern und Ruinen, die noch nicht eingeloest ist.
   * Jede ist eine Kartenwahl; eingeloest wird in der eigenen Bauphase.
   */
  loot: number;
  connected: boolean;
  /**
   * Wann der gefallene Held zurueckkehrt (Zugnummer). null, solange er lebt -
   * oder bevor er zum ersten Mal angetreten ist.
   */
  heldZurueck: number | null;
  /**
   * Wer der Held ist: Name, Beiname, Haus und Titel (core/lore.ts). null, bis
   * der erste antritt. Der Name bleibt ueber seinen Tod hinaus stehen - das
   * Adelshaus ueberlebt seinen Traeger (DESIGN.md, Heldenlore).
   */
  held: HeldLore | null;
  /**
   * Was der Spieler an Dingen besitzt: Kennung -> Anzahl, etwa "gelee" von
   * erschlagenen Schleimen. Getrennt von der Hand, weil es keine Rohstoffe
   * sind - man baut nichts damit, man sammelt es (DESIGN.md, Inventar).
   */
  inventar: Record<string, number>;
  /**
   * Der Held, den der Koenig ernannt hat (DESIGN.md, Phase 2): welcher Zweig,
   * wer er ist und wann er nach seinem Fall zurueckkehrt. null, bis ernannt
   * wurde - und die Wahl ist endgueltig, es bleibt bei diesem einen.
   *
   * Getrennt von held/heldZurueck, weil beide den gewoehnlichen Helden meinen
   * und ein Spieler nun zwei haben kann.
   */
  ernannt: Ernennung | null;
};

/** Die drei Helden, die der Koenigssitz freischaltet - einer davon, fuer immer. */
export type HeldZweig = 'krieger' | 'heilerin' | 'haendler';

export type Ernennung = {
  zweig: HeldZweig;
  /** Name, Haus und Titel - wie beim gewoehnlichen Helden (core/lore.ts). */
  lore: HeldLore;
  /** Wann er nach seinem Fall zurueckkehrt. null, solange er lebt. */
  zurueck: number | null;
};

/**
 * Ein Gebaeude auf einer Ecke. turm: ein Wachturm steht daneben - er sieht
 * weiter und laesst Brandstifter nicht an Haus und Strassen (rules/feuer.ts).
 */
export type Building = {
  owner: PlayerId;
  type: 'settlement' | 'city';
  /**
   * VERALTET. Frueher stand der Wachturm neben dem Haus. Heute steht er fuer
   * sich auf einer eigenen Ecke (state.tuerme); alte Staende werden beim Laden
   * umgeschrieben (rules/migration.ts).
   */
  turm?: boolean;
};

/**
 * Ein Wachturm auf einer eigenen Ecke. Er braucht kein Haus unter sich und
 * haelt keinen Abstand - dafuer eine eigene Strasse (rules/placement.ts,
 * canPlaceTower). Die Stufe beginnt bei 1; ausbauen laesst er sich spaeter
 * (DESIGN.md, Wachturm).
 */
export type Turm = { owner: PlayerId; stufe: number };

/**
 * Hoechste Turmstufe. 1 ist der Grenzposten, 2 der Geschuetzturm: er schiesst
 * selbst auf Feinde in Reichweite (rules/army.ts, beschuss). 3 ist der
 * befestigte Turm - derselbe Beschuss, staerker, und mehr Deckung fuer
 * eigene Einheiten auf seinen Nachbarfeldern (core/combat.ts, deckungFuer).
 */
export const MAX_TURM_STUFE = 3;

/**
 * Namen der Turmstufen. Bewusst einzelne Substantive, keine Adjektiv-Phrasen -
 * an mehreren Stellen steht "Der ${TURM_NAME[stufe]} ..." davor (rules/reducer.ts,
 * client/scenes/Game.tsx), und "Der Befestigter Turm" waere falsch dekliniert.
 */
export const TURM_NAME: Record<number, string> = {
  1: 'Grenzposten',
  2: 'Geschuetzturm',
  3: 'Festungsturm',
};

/**
 * Ein Stueck Palisade auf einer eigenen Kante, innerhalb des eigenen
 * Einflussbereichs gebaut (rules/placement.ts, einflussFelder). 'wand'
 * sperrt die Bewegung ueber diese Kante fuer alle fremden Einheiten
 * (rules/army.ts, schreite); 'tor' ist dieselbe Mauer mit einem bewussten
 * Durchlass - durch ein Tor kommt jeder (DESIGN.md, Palisade).
 */
export type MauerArt = 'wand' | 'tor';
export type Mauer = { owner: PlayerId; art: MauerArt };

/**
 * Ein Reichsbau auf einer Kachel (rules/reich.ts). Die Art steht als Zeichen
 * da, damit alte Staende nicht brechen, wenn eine vierte dazukommt.
 */
export type Reichsbau = { owner: PlayerId; art: string; seit: number };

/** Was auf der Karte laufen kann. */
export type UnitKind =
  | 'ritter'
  | 'raeuber'
  | 'goblin'
  /** Der grosse Goblin: einer je Goblinlager, sein Anfuehrer. */
  | 'haeuptling'
  /** Der Schamane des Lagers - heilt die Seinen, statt selbst zuzuschlagen. */
  | 'schamane'
  /** Die Hexe: sie bleibt bei ihrem Haus und verteidigt es (core/hexe.ts). */
  | 'hexe'
  /** Der Morast: der grosse Schleim, den die Nacht irgendwann ausspuckt. */
  | 'morast'
  | 'wanderer'
  | 'held'
  | 'bogen'
  | 'schleim';

/**
 * Was eine Einheit gerade vorhat.
 *
 *   befehl    Ritter: zieht, wohin der Spieler sie schickt (ziel), sonst steht sie.
 *   erkunden  Ritter und Held: ziehen von selbst zur naechsten Ruine oder ins Unbekannte.
 *   raub      zieht zur naechsten Siedlung und pluendert dort.
 *   heimkehr  zieht mit der Beute zurueck ins Lager.
 *   fehde     zieht gegen das Lager einer feindlichen Fraktion (ziel).
 *   wandern   neutral, zieht umher und verschwindet nach einer Weile.
 *   jagd      Schleime bei Nacht: ziehen zur naechsten Siedlung und greifen an,
 *             pluendern aber nichts und legen kein Feuer.
 *   ruht      Schleime bei Tag: friedfertig (seiteVon gibt NEUTRAL), sie
 *             bleiben liegen statt zu verschwinden.
 */
export type Auftrag =
  | 'befehl'
  | 'erkunden'
  | 'raub'
  | 'heimkehr'
  | 'fehde'
  | 'wandern'
  | 'jagd'
  | 'ruht';

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
  /**
   * Beim ernannten Helden: welcher Zweig. Er behaelt kind 'held', damit alle
   * Heldenregeln - Sicht, Schrittweite, Befehle, Folgen, Erkunden - ohne
   * Ausnahme auch fuer ihn gelten. Fehlt beim gewoehnlichen Helden.
   */
  zweig?: HeldZweig;
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
  /** Ritter im Gefolge: die Nummer des Helden, dem sie folgen. Sonst null. */
  folgt: number | null;
  /**
   * Ein Verband, der gemeinsam zieht (rules/army.ts): alle eigenen Einheiten
   * eines Feldes, die zusammen einen Befehl bekamen. Sie ziehen im Tempo des
   * Langsamsten und warten, solange einer von ihnen kaempft. null: allein.
   */
  verband: number | null;
  /**
   * Wie viele Feinde sie erschlagen hat. Daraus waechst die Stufe
   * (rules/army.ts, STUFEN_AB). Fehlt bei alten Staenden.
   */
  siege?: number;
  /**
   * Ihre Stufe, beginnend bei 0. Jede Stufe hebt Angriff und Leben und
   * aendert das Aussehen; ab NAME_AB_STUFE traegt sie einen Namen.
   */
  stufe?: number;
  /** Ihr Name, sobald sie sich einen verdient hat (core/lore.ts, einheitName). */
  name?: string;
};

/** Eine vorbereitete Taktik wirkt genau in der naechsten Heeresrunde. */
export type TacticBuff = {
  player: PlayerId;
  kind: 'attack' | 'cover' | 'morale' | 'siege' | 'heroReroll' | 'rangedAttack';
  /** Die Wirkung folgt den Einheiten, auch wenn sie vor dem Kampf ziehen. */
  units: number[];
  amount: number;
  expiresTurn: number;
};

/**
 * Ein Feuer, das Pluenderer gelegt haben (rules/feuer.ts).
 *
 * Es brennt, bis sein Besitzer einen eigenen Zug hinter sich hat - so bleibt
 * immer genau ein Zug, um es zu loeschen: mit einer Karte, einem Ritter oder
 * dem Helden daneben, oder der Regen tut es. Danach brennt es ab.
 */
export type Brand = {
  /** Kantenschluessel bei Strassen, Eckenschluessel bei Gebaeuden. */
  key: string;
  art: 'strasse' | 'dorf' | 'stadt';
  owner: PlayerId;
  /** Wer es gelegt hat. */
  fraktion: string;
  /** Das Feld der Pluenderer. */
  q: number;
  r: number;
  /** Zug, in dem es gelegt wurde. */
  seit: number;
};

/**
 * Ein Abkommen zwischen einem Spieler und einer Fraktion (rules/diplomatie.ts).
 *
 *   frieden  einmal bezahlt, gilt eine Weile. Nur Raeuberbanden.
 *   tribut   kostet je grosser Runde eine Karte, gilt, bis einer nicht zahlt.
 *
 * Solange es gilt, sind beide einander nicht feind (core/combat.ts, feindlich):
 * keine Raubzuege, keine Kaempfe.
 */
export type Abkommen = {
  player: PlayerId;
  fraktion: string;
  art: 'frieden' | 'tribut';
  seit: number;
  /** Letzter Zug, in dem es gilt. null: bis auf Weiteres. */
  bis: number | null;
};

/**
 * Ein Auftrag, den ein Wanderer anbietet (rules/auftraege.ts). Wer ihn
 * erfuellt, bekommt eine Kartenwahl als Beute.
 */
export type WandererAuftrag = {
  id: number;
  player: PlayerId;
  /**
   *   lager       dieses Lager zerstoeren
   *   ruine       diese Ruine erkunden
   *   liefern     dem Wanderer Rohstoffe bringen (menge x rohstoff)
   *   jagd        menge Raeuber oder Goblins schlagen
   *   geleit      einen Ritter oder den Helden zum Wanderer bringen
   *   kundschaft  mit einem Ritter oder dem Helden dieses Feld erreichen
   */
  art: 'lager' | 'ruine' | 'liefern' | 'jagd' | 'geleit' | 'kundschaft';
  /** Das Ziel - bei liefern und geleit, wo der Wanderer beim Angebot stand. */
  q: number;
  r: number;
  /** Beim Liefern: welcher Rohstoff. Sonst null. */
  rohstoff: Resource | null;
  /** Wie viel es braucht: Rohstoffe beim Liefern, Gegner bei der Jagd, sonst 1. */
  menge: number;
  /** Wie weit es ist - bei der Jagd die geschlagenen Gegner. */
  fortschritt: number;
  /** Bei Lagern die Fraktion, die es beim Angebot hielt - fuer den Text. */
  fraktion: string | null;
  status: 'angebot' | 'angenommen' | 'abgelehnt';
  /** Letzter Zug: fuers Angebot die Bedenkzeit, fuer den Auftrag die Frist. */
  bis: number;
  /** Der Wanderer, der ihn angeboten hat. */
  wanderer: number;
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
  /** Wachtuerme, Ecke -> Besitzer und Stufe. Stehen unabhaengig von Doerfern und Staedten. */
  tuerme: Record<string, Turm>;
  /** Palisade, Kante -> Besitzer und Art (Wand oder Tor). Nur im eigenen Einflussbereich. */
  mauern?: Record<string, Mauer>;
  /**
   * Reichsbauten der Phase 2: Feldschluessel -> Besitzer und Art. Sie stehen
   * auf ganzen Kacheln, nicht auf Ecken, und brauchen weder Strasse noch Ring
   * (rules/reich.ts). Mehrere je Reich sind erlaubt, einer je Feld.
   */
  reichsbauten?: Record<string, Reichsbau>;
  /**
   * Lager, die gerade feiern: Feldschluessel -> bis zu welcher Runde. Wer
   * feiert, heilt seine Besatzung und schickt solange niemanden auf Raubzug
   * (rules/army.ts, lagerLeben).
   */
  feste?: Record<string, number>;

  deck: DevCardType[];
  packIndex: number;

  /** Zaehlt jeden Spielerzug hoch. Grundlage der Sperre fuer frische Karten. */
  turn: number;
  lastRoll: [number, number] | null;

  targetPoints: number;
  /** Wer mindestens fuenf Ruhm und mehr als alle Herausforderer hat. */
  ruhmreichster: PlayerId | null;
  /** VERALTET: nur fuer die Migration alter Staende. */
  largestArmy?: PlayerId | null;
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
  /** Vorbereitete, kurzlebige Taktiken fuer die naechste Heeresrunde. */
  tacticBuffs: TacticBuff[];
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
  /** Brennende Strassen und Gebaeude. */
  braende: Brand[];
  /** Abgebrannte Strassen: Kante -> frueherer Besitzer. Er baut sie guenstiger wieder auf. */
  asche: Record<string, PlayerId>;
  /** Frieden und Tribut mit Fraktionen. */
  abkommen: Abkommen[];
  /** Auftraege der Wanderer - angeboten, angenommen oder abgelehnt. */
  auftraege: WandererAuftrag[];
  /** Naechste freie Auftragsnummer. */
  nextAuftragId: number;
  /**
   * Hauptstaedte: Feldschluessel -> Besitzer und Ausbaustufe. Hoechstens eine je
   * Spieler (rules/hauptstadt.ts).
   */
  hauptstaedte: Record<string, Hauptstadt>;
};

/** Eine Hauptstadt auf einem Feld. Die Stufe beginnt bei 1 - weitere folgen (DESIGN.md, Hauptstadt). */
export type Hauptstadt = { owner: PlayerId; stufe: number; seit: number };

/** Siegpunkte einer Hauptstadt - zusaetzlich zu den drei Staedten, die sie umschliessen. */
export const HAUPTSTADT_PUNKTE = 2;
/** Ein weiterer Siegpunkt je Ausbaustufe ueber der ersten. */
export const STUFE_PUNKTE = 1;

/*
 * Eine Bank mit Bestand gibt es nicht mehr: sie ist unendlich. Frueher hielt sie
 * 19 Karten je Rohstoff, und in langen Partien fiel Ertrag aus, weil der
 * Vorrat leer war - auf einer Karte ohne Rand eine Knappheit, die niemand
 * versteht. Bezahltes verschwindet, Ertrag entsteht.
 */

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
  if (state.ruhmreichster === id) pts += 2;
  for (const h of Object.values(state.hauptstaedte ?? {})) {
    if (h.owner === id) pts += HAUPTSTADT_PUNKTE + (h.stufe - 1) * STUFE_PUNKTE;
  }
  return pts;
}

/** Gesamtpunkte inklusive verdeckter Karten - nur serverseitig verwenden. */
export function totalPoints(state: GameState, id: PlayerId): number {
  const p = playerById(state, id);
  const hidden = p ? p.dev.filter((d) => d.type === 'victoryPoint').length : 0;
  return publicPoints(state, id) + hidden;
}
