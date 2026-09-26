/**
 * Die gesamte Spiellogik als eine Funktion.
 *
 * applyAction ist die einzige Stelle, an der sich der Zustand aendert. Das
 * Durable Object ruft sie auf, der Client benutzt dieselben Regeln nur
 * lesend, um legale Zuege zu markieren. Deshalb darf hier nichts stehen, was
 * Browser oder Worker voraussetzt - und nichts Zufaelliges ausser dem
 * rngState, der im Zustand mitgefuehrt und vor den Clients verborgen wird.
 *
 * Fehlgeschlagene Aktionen hinterlassen keine Spur: gearbeitet wird auf einer
 * Kopie, die nur bei Erfolg uebernommen wird.
 */

import { kundeFortschreiben, kundeSchreiben } from '../kunde';
import type { KundeEvent } from '../kunde';
import { fraktionsLeben } from '../fraktionsleben';
import type { FraktionsEvent } from '../fraktionsleben';
import { vorhabenPruefen, vorhabenRunde, vorhabenWaehlen } from '../vorhaben';
import type { VorhabenEvent } from '../vorhaben';
import { ahnSauber, istAhn } from '../lore';
import type { HeldLore } from '../lore';
import { erfuellterWeg, siegwegeAn } from '../siegwege';
import { Rng } from '../rng';
import { hash3i } from '../hash';
import {
  edgeEndpoints,
  hexKey,
  parseEdgeKey,
  parseVertexKey,
  vertexAdjacentHexes,
  hexVertices,
  vertexKey,
} from '../coords';
import {
  createWorld,
  ensureGenerated,
  revealChunks,
  tileAt,
} from '../world';
import type { World } from '../world';
import { findPlayableSeed } from '../worldgen';
import type { ChunkCoord } from '../chunks';
import { RESOURCES, TERRAIN_RESOURCE } from '../types';
import type { Resource } from '../types';
import {
  currentPlayerId,
  emptyHand,
  handSize,
  playerById,
  setupPlayerId,
  totalPoints,
} from '../state';
import type { GameState, Hand, HeldZweig, MauerArt, PlayerId, Player } from '../state';
// Turmstufen: 1 Grenzposten, 2 Geschuetzturm (state.ts, Turm).
import { MAX_TURM_STUFE, TURM_NAME } from '../state';
import type { DevCardType } from '../state';
import type { Bundle } from '../types';
import {
  COST_CITY,
  COST_DEV,
  COST_KNIGHT,
  COST_ARCHER,
  COST_REBUILD_ROAD,
  COST_ROAD,
  COST_SETTLEMENT,
  COST_TOWER,
  COST_CAPITAL,
  COST_STUFE,
  COST_TURM_STUFE,
  COST_REICHSBAU,
  COST_MAUER,
  COST_TOR,
  canAfford,
  pay,
} from './costs';
import { REICHSBAU_NAME, reichsbauHindernis } from './reich';
import type { ReichsbauArt } from './reich';
import { ZWEIGE, ernennungHindernis } from './zweig';
import {
  canPlaceCity,
  canPlaceMauer,
  canPlaceRoad,
  canPlaceSettlement,
  canPlaceTower,
  legalRoadEdges,
} from './placement';
import { computeProduction } from './production';
import { beginBigRound, beginDay, beginNight, ernenne, heldenRunde, spawnHeld, spawnKnight, tickArmy } from './army';
import { brandRunde, brennt, mitKarteLoeschen } from './feuer';
import { STUFE_NAME, ausbauHindernis, festungsSchutz, hauptstadtHindernis } from './hauptstadt';
import { abkommenRunde, tributRunde, verhandeln } from './diplomatie';
import type { DiplomatieEvent, Verhandlung } from './diplomatie';
import { auftraegePruefen, aufAuftragAntworten, auftragLiefern, wandererBieten } from './auftraege';
import type { AuftragEvent } from './auftraege';
import { nachtBeginntAt, tagBeginntAt } from '../zeit';
import type { ArmyEvent } from './army';
import { nextStep } from '../units';
import { bigRoundChangedAt, seasonChangedAt } from '../season';
import { draftOptions } from '../cards/draft';
import { cardById } from '../cards/catalog';
import { cardKind, dauerwirkungen, istEinzigartig, wiederholbar } from '../cards/types';
import { modifiersOf } from '../cards/effects';
import type { DraftSource } from '../cards/types';
import { aktiviereNeueReichskarte, setzeAktiveKarten } from '../cards/loadout';
import { playTactic } from './tactics';
import { lagerNeuBesetzen } from './bedrohung';
import type { BedrohungEvent } from './bedrohung';
import { imSpiel, imUntergang, untergangRunde, ueberspringeBesiegte } from './untergang';
import type { UntergangEvent } from './untergang';
import type { TacticEvent } from './tactics';
import { ruhmAusEreignissen } from './ruhm';
import { gueltigeOmen, siebenerBonus, startBeute } from '../omen';
import { hausAngebot, hausById, hausWirkung } from '../haus';
import { durstLindern, mangelHilfe } from './hilfe';
import { omenMitStufe } from '../stufe';
import { szenarioById, szenarioErreicht, sterneFuer, unversehrtGeschafft } from '../szenario';
import { roundOf } from '../season';
import { COST_WUNDER, hatWunder, wunderAt } from '../wunder';
import type { WunderArt } from '../wunder';
import { ereignisById, ereignisFaellig, waehleEreignis } from '../ereignis';
import type { Folge } from '../ereignis';
import { seasonOf } from '../season';
import { takeFromLargest } from './raid';
import type { HilfeEvent } from './hilfe';
import { chronikBeginnen, chronikFortschreiben, neueChronik, wertung } from '../chronik';
import type { RuhmEvent } from './ruhm';
import {
  canAcceptTrade,
  canBankTrade,
  canOfferTrade,
  canSettleTrade,
  moveBundle,
  tradeRatio,
} from './trade';
import { drawDevCard } from './dev';

export type Action =
  /** Ein Weltwunder auf einer Staette errichten, an der ein eigenes Gebaeude steht (core/wunder.ts). */
  | { t: 'buildWonder'; q: number; r: number }
  /** Auf ein Ereignis antworten: die Nummer der Wahl (core/ereignis.ts). */
  | { t: 'answerEvent'; wahl: number }
  /** Ein Vorhaben aus der Auswahl annehmen, null verwirft die Auswahl (core/vorhaben.ts). */
  | { t: 'chooseAmbition'; id: string | null }
  /** Vor dem Aufbau: eines der angebotenen Adelshaeuser waehlen (core/haus.ts). */
  | { t: 'chooseHouse'; haus: string }
  | { t: 'placeSettlement'; vertex: string }
  | { t: 'placeRoad'; edge: string }
  | { t: 'roll' }
  | { t: 'buildRoad'; edge: string }
  | { t: 'buildSettlement'; vertex: string }
  | { t: 'buildCity'; vertex: string }
  | { t: 'buyDev' }
  | { t: 'playKnight' }
  | { t: 'playRoadBuilding' }
  | { t: 'playYearOfPlenty'; a: Resource; b: Resource }
  | { t: 'playMonopoly'; resource: Resource }
  | { t: 'bankTrade'; give: Resource; receive: Resource }
  /** Angebot an alle Mitspieler stellen. Nur der Spieler am Zug. */
  | { t: 'offerTrade'; give: Bundle; want: Bundle }
  /** Zusagen oder ablehnen. Nur die Mitspieler. */
  | { t: 'respondTrade'; accept: boolean }
  /** Anbieter waehlt einen der Zusagenden aus und schliesst ab. */
  | { t: 'settleTrade'; partner: PlayerId }
  /** Anbieter zieht sein Angebot zurueck. */
  | { t: 'cancelTrade' }
  /** Eine der drei angebotenen Karten nehmen. */
  | { t: 'chooseCard'; card: string; replace?: string | null }
  /** Die aktiven Reichskarten neu zusammenstellen (nur aus dem eigenen Besitz). */
  | { t: 'setLoadout'; cards: string[] }
  /** Eine ausspielbare Taktikkarte auf eine eigene Einheit oder deren Feld anwenden. */
  | { t: 'playTactic'; card: string; unit: number }
  /** Einen Ritter anwerben - er tritt an einer eigenen Siedlung an. */
  | { t: 'recruitKnight' }
  | { t: 'recruitArcher' }
  /**
   * Einem eigenen Ritter oder dem Helden ein Ziel geben. Sein eigenes Feld als
   * Ziel heisst: halt. verband: alle eigenen Einheiten seines Feldes ziehen mit.
   */
  | { t: 'orderUnit'; unit: number; q: number; r: number; verband?: boolean }
  /**
   * Einer frei gewaehlten Gruppe eigener Einheiten ein Ziel geben (Befehlstafel).
   * Mehrere bilden eine Schar mit Banner, die auch am Ziel beisammenbleibt.
   * halt: stehen bleiben - die Schar bleibt, wie sie ist.
   */
  | { t: 'orderUnits'; units: number[]; q: number; r: number; halt?: boolean }
  /** Eine Schar aufloesen: ihre Einheiten stehen wieder fuer sich. */
  | { t: 'disbandGroup'; verband: number }
  /** Eine Beute einloesen: eine Kartenwahl. */
  | { t: 'claimLoot' }
  /** Ein eigenes Feuer mit einer Rohstoffkarte loeschen (rules/feuer.ts). */
  | { t: 'putOut'; key: string; mit: Resource }
  /** Einen Wachturm setzen - an einer eigenen Strasse oder im eigenen Einflussbereich. */
  | { t: 'buildTower'; vertex: string }
  /** Den eigenen Wachturm ausbauen - vom Grenzposten zum Geschuetzturm. */
  | { t: 'upgradeTower'; vertex: string }
  /** Ein Stueck Palisade auf eine eigene Kante im eigenen Einflussbereich setzen. */
  | { t: 'buildMauer'; edge: string; art: MauerArt }
  /** Einen Reichsbau auf eine Kachel im eigenen Reich setzen (Phase 2, rules/reich.ts). */
  | { t: 'buildReich'; q: number; r: number; art: string }
  /**
   * Den Helden ernennen, den der Koenigssitz freischaltet: Krieger, Heilerin
   * oder Haendler. Einmal je Partie, danach steht es fest (rules/zweig.ts).
   */
  | { t: 'ernenne'; zweig: HeldZweig }
  /** Einen eigenen Ritter oder den Helden von selbst erkunden lassen - oder nicht mehr. */
  | { t: 'explore'; unit: number; explore: boolean }
  /** Einen eigenen Ritter dem Helden folgen lassen - oder nicht mehr. */
  | { t: 'follow'; unit: number; follow: boolean }
  /** Frieden, Tribut oder Krieg mit einer Fraktion (rules/diplomatie.ts). */
  | { t: 'diplomacy'; fraktion: string; art: Verhandlung }
  /** Einen Auftrag eines Wanderers annehmen oder ablehnen. Auch ausserhalb des Zugs. */
  | { t: 'answerQuest'; id: number; accept: boolean }
  /** Die Rohstoffe fuer einen Lieferauftrag abgeben. Auch ausserhalb des Zugs. */
  | { t: 'deliverQuest'; id: number }
  /** Auf einem Feld, das drei eigene Staedte und sechs eigene Strassen umschliessen, die Hauptstadt gruenden. */
  | { t: 'foundCapital'; q: number; r: number }
  /** Die eigene Hauptstadt eine Stufe ausbauen - von der Residenz zum Festungsring. */
  | { t: 'upgradeCapital'; q: number; r: number }
  | { t: 'endTurn' };

export type GameEvent =
  | { t: 'roll'; player: PlayerId; dice: [number, number] }
  | { t: 'production'; payout: Record<PlayerId, Hand> }
  | { t: 'build'; player: PlayerId; kind: 'road' | 'settlement' | 'city' | 'tower' | 'mauer' | 'tor'; at: string }
  | { t: 'capital'; player: PlayerId; q: number; r: number }
  | { t: 'capitalUpgrade'; player: PlayerId; q: number; r: number; stufe: number }
  /** Ein Wachturm ist eine Stufe hoeher - Stufe 2 ist der Geschuetzturm. */
  | { t: 'towerUpgrade'; player: PlayerId; at: string; stufe: number }
  /** Ein Reichsbau steht (Phase 2). */
  | { t: 'reichsbau'; player: PlayerId; q: number; r: number; art: string }
  | { t: 'buyDev'; player: PlayerId }
  | { t: 'playDev'; player: PlayerId; card: DevCardType }
  | { t: 'yearOfPlenty'; player: PlayerId; a: Resource; b: Resource }
  | { t: 'monopoly'; player: PlayerId; resource: Resource; taken: number }
  | { t: 'trade'; player: PlayerId; give: Resource; receive: Resource; ratio: number }
  | { t: 'tradeOffer'; player: PlayerId; give: Bundle; want: Bundle }
  | { t: 'tradeResponse'; player: PlayerId; accept: boolean }
  | { t: 'tradeSettled'; from: PlayerId; to: PlayerId; give: Bundle; want: Bundle }
  | { t: 'tradeCancelled'; player: PlayerId }
  | { t: 'draftOffered'; player: PlayerId; source: DraftSource; options: string[] }
  | { t: 'cardTaken'; player: PlayerId; card: string }
  | { t: 'chunks'; coords: ChunkCoord[] }
  | { t: 'turn'; player: PlayerId }
  | { t: 'houseChosen'; player: PlayerId; haus: string }
  | { t: 'eventOffered'; player: PlayerId; id: string }
  | { t: 'wonder'; player: PlayerId; q: number; r: number; art: WunderArt }
  | { t: 'wonderGift'; player: PlayerId; art: WunderArt; ruhm: number; beute: number }
  | { t: 'eventResolved'; player: PlayerId; id: string; wahl: number; ruhm: number; verloren: number }
  | { t: 'win'; player: PlayerId }
  /** Heer, Raubzuege, Gefechte, Lager, Ruinen, Held und Feuer - siehe rules/army.ts. */
  | ArmyEvent
  | UntergangEvent
  | HilfeEvent
  | VorhabenEvent
  | FraktionsEvent
  | KundeEvent
  | BedrohungEvent
  | DiplomatieEvent
  | AuftragEvent
  | TacticEvent
  | RuhmEvent;

export type Game = { state: GameState; world: World };

export type Result =
  | { ok: true; events: GameEvent[] }
  | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

// --- Aufbau -----------------------------------------------------------------

/**
 * Wie weit die Karte zu Beginn aufgedeckt ist.
 *
 * Frueher reichte der Wachstumspuffer (Radius 3, gut 50 Felder): genug zum
 * Siedeln, aber zu wenig, um Landschaft zu lesen. Seit Relief, Kaemme und
 * Nester die Karte gliedern, will man beim Start sehen, wie sie aussieht -
 * wo das Gebirge laeuft, wo die Kueste, wo das naechste Nest.
 *
 * Radius 9 (271 Felder) war beim Hereinkommen zu viel auf einmal. Radius 6
 * sind 127 Felder, auf ganze Chunks aufgerundet etwas mehr: genug fuer Kueste,
 * Gebirge und die ersten Lager, aber ein Bild, das man mit einem Blick fasst.
 * Die Regel dahinter aendert sich nicht: danach waechst die Welt wie gehabt um
 * jedes Bauteil. Vergleichsbilder: labor.html?art=aufdeckung.
 */
const START_REVEAL_RADIUS = 6;


export type NewPlayer = {
  id: PlayerId;
  name: string;
  /** Der Held einer frueheren Partie: der neue wird sein Nachfolger (core/lore.ts). */
  ahn?: HeldLore;
};

/** Was eine Partie ausser Spielern, Seeds und Siegpunktziel mitbringt. */
export type PartieOptionen = {
  /** Die Omen (core/omen.ts). Unbekannte Kennungen fallen heraus. */
  omens?: readonly string[];
  /** Nach so vielen Runden ist Schluss (core/chronik.ts, wertung). */
  rundenLimit?: number | null;
  /** Das Datum einer Tagesexpedition (core/tages.ts). */
  tagesDatum?: string | null;
  /**
   * Mit Adelshaeusern (core/haus.ts): vor dem Aufbau waehlt jeder eines aus
   * drei. Aus, wenn nicht gesetzt - so bleiben Tests und alte Aufrufe, wie sie
   * sind; der Raum schaltet es ein.
   */
  haeuser?: boolean;
  /** Mit Ereignissen (core/ereignis.ts) - wie die Haeuser nur, wenn gesetzt. */
  ereignisse?: boolean;
  /** Chronikstufe (core/stufe.ts): legt je Stufe einen Fluch zu den Omen. */
  stufe?: number;
  /** Gemeinsam gegen die Wildnis: ein Ziel fuer alle (KOOP_ZIEL_JE). */
  koop?: boolean;
  /** Ein Szenario (core/szenario.ts): Ziel, Frist und Omen kommen von dort. */
  szenario?: string | null;
};

/** Im gemeinsamen Spiel: so viele Siegpunkte je Spieler soll die Summe erreichen. */
export const KOOP_ZIEL_JE = 10;

/** Das gemeinsame Ziel dieser Partie. */
export const koopZiel = (s: Pick<GameState, 'order'>): number => KOOP_ZIEL_JE * s.order.length;

export function createGame(
  players: NewPlayer[],
  worldSeed: number,
  secretSeed: number,
  targetPoints = 15,
  optionen: PartieOptionen = {},
): Game {
  /**
   * Ein Spieler genuegt - allein siedeln ist der Sandkasten.
   *
   * Der Ablauf traegt das ohne Sonderfall: die Aufbau-Schlange laeuft bei
   * einem Spieler zweimal ueber denselben, der Zugwechsel landet wieder bei
   * ihm, und Raeuber wie Monopol finden schlicht niemanden zum Bestehlen.
   */
  if (players.length < 1) throw new Error('Mindestens ein Spieler');

  // Nicht jede Gegend taugt als Startplatz - siehe findPlayableSeed.
  const seed = findPlayableSeed(worldSeed);
  const world = createWorld(seed);
  const added = ensureGenerated(world, { q: 0, r: 0 }, START_REVEAL_RADIUS);

  const state: GameState = {
    worldSeed: seed,
    secretSeed,
    rngState: secretSeed | 0,
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: i,
      hand: emptyHand(),
      dev: [],
      playedKnights: 0,
      ruhm: 0,
      cards: [],
      activeCards: [],
      tactics: [],
      equipment: [],
      loot: 0,
      connected: true,
      untergang: null,
      besiegt: false,
      heldZurueck: null,
      held: null,
      inventar: {},
      ernannt: null,
      ...(p.ahn && istAhn(p.ahn) ? { ahn: ahnSauber(p.ahn) } : {}),
    })),
    order: players.map((p) => p.id),
    current: 0,
    phase: { t: 'setup', step: 0, awaiting: 'settlement', lastVertex: null },
    buildings: {},
    roads: {},
    tuerme: {},
    mauern: {},
    reichsbauten: {},
    deck: [],
    packIndex: 0,
    turn: 0,
    lastRoll: null,
    targetPoints,
    ruhmreichster: null,
    trade: null,
    draft: null,
    chunks: added,
    units: [],
    tacticBuffs: [],
    nextUnitId: 1,
    destroyedNests: [],
    nestGarrison: {},
    nestTod: {},
    nestFraktion: {},
    exploredRuins: [],
    braende: [],
    asche: {},
    abkommen: [],
    auftraege: [],
    nextAuftragId: 1,
    hauptstaedte: {},
    omens: omenMitStufe(gueltigeOmen(optionen.omens ?? []), optionen.stufe ?? 0),
    stufe: optionen.stufe ?? 0,
    rundenLimit: optionen.rundenLimit ?? null,
    tagesDatum: optionen.tagesDatum ?? null,
    chronik: neueChronik({ players: players.map((p) => ({ id: p.id })) as GameState['players'] }),
  };

  if (optionen.ereignisse) state.ereignisseAn = true;
  const sz = szenarioById(optionen.szenario);
  if (sz) {
    state.szenario = sz.id;
    state.szenarioErgebnis = null;
    state.omens = omenMitStufe(gueltigeOmen(sz.omens), optionen.stufe ?? 0);
    state.rundenLimit = sz.runden;
    state.targetPoints = 0;
  }
  if (optionen.koop) {
    state.koop = true;
    state.koopErgebnis = null;
  }
  if (optionen.haeuser) {
    state.phase = { t: 'hauswahl' };
    state.hausAngebot = {};
    state.players.forEach((p, i) => {
      p.haus = null;
      state.hausAngebot![p.id] = hausAngebot(secretSeed, i);
    });
  }

  return { state, world };
}

/** Welt aus einem geladenen Zustand wiederherstellen - Gelaende wird nie gespeichert. */
export function rebuildWorld(state: GameState): World {
  const world = createWorld(state.worldSeed);
  revealChunks(world, state.chunks);
  return world;
}

// --- Helfer -----------------------------------------------------------------

/**
 * Welt um die neuen Bauteile herum weiterwachsen lassen und die neu
 * entstandenen Chunks im Zustand vermerken. Genau diese Liste geht spaeter
 * an die Clients.
 */
function grow(state: GameState, world: World, hexes: { q: number; r: number }[]): ChunkCoord[] {
  const added: ChunkCoord[] = [];
  for (const h of hexes) added.push(...ensureGenerated(world, h));
  if (added.length > 0) state.chunks.push(...added);
  return added;
}

function nextTurn(state: GameState): void {
  state.current = (state.current + 1) % state.order.length;
  ueberspringeBesiegte(state);
  state.turn += 1;
  // Ein Angebot gehoert zum Zug seines Anbieters und verfaellt mit ihm.
  state.trade = null;
  state.phase = { t: 'roll' };
}

/**
 * Die Wuerfel eines Zuges.
 *
 * Aus geheimem Seed und Zugnummer, nicht aus dem fortlaufenden rngState. Der
 * wird auch von Kaempfen, Ruinen und Namen verbraucht - zwei Spieler auf
 * derselben Welt haetten sonst verschiedene Wuerfe, sobald einer von ihnen
 * einen Kampf mehr fuehrt. Fuer die Tagesexpedition (core/tages.ts) muessen
 * alle dieselben Wuerfe bekommen; vorhersagbar bleiben sie trotzdem nicht,
 * weil der secretSeed den Server nie verlaesst. Dasselbe Prinzip wie bei der
 * Kartenwahl (cards/draft.ts).
 */
const SALT_WUERFEL = 97;

export function wuerfelFuer(secretSeed: number, turn: number): [number, number] {
  const rng = new Rng(hash3i(secretSeed, turn, SALT_WUERFEL, 0));
  return [1 + rng.int(6), 1 + rng.int(6)];
}

/**
 * Die Rundengrenze ist erreicht: die Partie endet, und es gewinnt die hoechste
 * Wertung (core/chronik.ts) unter denen, die noch im Spiel sind - wer
 * untergegangen ist (rules/untergang.ts), gewinnt nicht mehr. Bei Gleichstand,
 * wer in der Reihenfolge vorn sitzt.
 */
function zeitAbgelaufen(state: GameState, events: GameEvent[]): void {
  const uebrig = imSpiel(state);
  const sz = szenarioById(state.szenario);
  if (sz) {
    // Die Frist ist um: nur "unversehrt" kann jetzt noch gelingen.
    const id = state.order[0]!;
    const erreicht = uebrig.length > 0 && unversehrtGeschafft(state, id, sz.ziel);
    state.szenarioErgebnis = { erreicht, runde: state.turn, sterne: erreicht ? sterneFuer(sz, roundOf(state.turn)) : 0 };
    state.phase = { t: 'finished', winner: erreicht ? id : null, durch: 'zeit' };
    events.push(erreicht ? { t: 'win', player: id } : { t: 'lost' });
    return;
  }
  if (state.koop) {
    // Gemeinsam: die Summe aller zaehlt, auch die der Gefallenen.
    const summe = state.order.reduce((n, id) => n + totalPoints(state, id), 0);
    const ziel = koopZiel(state);
    const erfolg = summe >= ziel && uebrig.length > 0;
    state.koopErgebnis = { erfolg, summe, ziel };
    let best = state.order[0]!;
    for (const id of state.order) if (wertung(state, id) > wertung(state, best)) best = id;
    state.phase = { t: 'finished', winner: erfolg ? best : null, durch: 'zeit' };
    events.push(erfolg ? { t: 'win', player: best } : { t: 'lost' });
    return;
  }
  if (uebrig.length === 0) {
    state.phase = { t: 'finished', winner: null, durch: 'zeit' };
    events.push({ t: 'lost' });
    return;
  }
  let best = uebrig[0]!;
  for (const id of uebrig) {
    if (wertung(state, id) > wertung(state, best)) best = id;
  }
  state.phase = { t: 'finished', winner: best, durch: 'zeit' };
  events.push({ t: 'win', player: best });
}

/**
 * Sieg pruefen. Gewonnen wird nur im eigenen Zug.
 *
 * targetPoints = 0 heisst Sandkasten: die Partie kennt kein Ende. Das ist
 * kein Sonderfall im Ablauf, sondern schlicht eine Schwelle, die nie
 * erreicht wird.
 */
function checkWin(state: GameState, events: GameEvent[]): void {
  // Gemeinsam gibt es kein Einzelziel - nur die Rundengrenze entscheidet.
  if (state.targetPoints <= 0 || state.koop) return;
  const id = state.order[state.current]!;
  if (totalPoints(state, id) >= state.targetPoints) {
    state.phase = { t: 'finished', winner: id, durch: 'ziel' };
    events.push({ t: 'win', player: id });
  }
}


/** Warum hier kein Wunder gebaut werden kann - oder null. Auch fuer die Anzeige. */
export function wunderHindernis(
  s: Pick<GameState, 'worldSeed' | 'buildings'> & { wunder?: GameState['wunder'] },
  world: World,
  id: PlayerId,
  q: number,
  r: number,
): string | null {
  if (!tileAt(world, q, r)) return 'Dieses Feld ist noch nicht erkundet.';
  if (wunderAt(s.worldSeed, q, r) === null) return 'Hier liegt keine Wunderstaette.';
  if (s.wunder?.[hexKey(q, r)]) return 'Hier steht schon ein Wunder.';
  const angrenzend = hexVertices(q, r).some((v) => s.buildings[vertexKey(v)]?.owner === id);
  if (!angrenzend) return 'Dafuer brauchst du ein Dorf oder eine Stadt an der Staette.';
  return null;
}

/** Warum diese Wahl nicht geht - oder null. Auch fuer die Anzeige (Client). */
export function wahlHindernis(
  s: Pick<GameState, 'units'> & { players: ReadonlyArray<{ id: PlayerId; hand?: Hand }> },
  id: PlayerId,
  folge: Folge,
  brauchtHeld: boolean,
): string | null {
  if (brauchtHeld && !s.units.some((u) => u.kind === 'held' && u.owner === id)) {
    return 'Dafuer muss dein Held auf der Karte stehen.';
  }
  const hand = s.players.find((p) => p.id === id)?.hand;
  if (folge.zahle && (!hand || !canAfford(hand, folge.zahle))) return 'Dafuer fehlen dir Rohstoffe.';
  return null;
}

/** Die Folge einer Wahl anwenden. Gibt zurueck, wie viele Karten verloren gingen. */
function wendeFolgeAn(s: GameState, p: Player, folge: Folge, events: GameEvent[]): number {
  if (folge.zahle) pay(p.hand, folge.zahle);
  for (const r of RESOURCES) p.hand[r] += folge.gib?.[r] ?? 0;
  if (folge.zufall) {
    const rng = new Rng(s.rngState);
    for (let i = 0; i < folge.zufall; i++) p.hand[RESOURCES[rng.int(RESOURCES.length)]!] += 1;
    s.rngState = rng.getState();
  }
  let verloren = 0;
  if (folge.verliere) {
    const weg = takeFromLargest(p.hand, folge.verliere);
    for (const r of RESOURCES) {
      p.hand[r] -= weg[r];
      verloren += weg[r];
    }
  }
  p.loot += folge.beute ?? 0;
  for (let i = 0; i < (folge.ritter ?? 0); i++) spawnKnight(s, p.id, events);
  return verloren;
}

/** Eine spielbare Entwicklungskarte dieses Typs suchen. */
function findPlayableDev(
  state: GameState,
  p: Player,
  type: DevCardType,
): number {
  return p.dev.findIndex(
    (d) => d.type === type && !d.played && d.boughtTurn < state.turn,
  );
}

function devPlayGuard(state: GameState, p: Player, type: DevCardType): string | null {
  if (findPlayableDev(state, p, type) < 0) {
    const owned = p.dev.some((d) => d.type === type && !d.played);
    return owned
      ? 'Diese Karte ist erst im naechsten Zug spielbar.'
      : 'Du hast diese Karte nicht.';
  }
  return null;
}

/**
 * Kartenwahl eroeffnen.
 *
 * Loest die Raeuberphase ab. Die drei Karten stehen zwar schon durch Seed und
 * Runde fest, werden aber in den Spielstand geschrieben - so sehen die
 * Clients dieselben drei, ohne den geheimen Seed zu kennen.
 */
function enterDraft(
  state: GameState,
  source: DraftSource,
  events: GameEvent[],
  salt = 0,
): void {
  // Mit salt zeigen mehrere Wahlen derselben Runde verschiedene Karten - etwa
  // zwei eingeloeste Beuten hintereinander. Ohne salt bleibt alles wie gehabt.
  const runde = salt === 0 ? state.turn : state.turn * 64 + salt;
  const spieler = playerById(state, state.order[state.current]!);
  const owned = spieler ? [...spieler.cards, ...spieler.equipment] : [];
  const options = draftOptions(state.secretSeed, runde, source, owned);
  state.draft = { source, options };
  state.phase = { t: 'draft' };
  events.push({
    t: 'draftOffered',
    player: state.order[state.current]!,
    source,
    options,
  });
}

// --- Hauptfunktion ----------------------------------------------------------

export function applyAction(game: Game, action: Action, actor: PlayerId): Result {
  const s: GameState = structuredClone(game.state);
  const world = game.world;
  const events: GameEvent[] = [];

  const actorPlayer = playerById(s, actor);
  if (!actorPlayer) return fail('Unbekannter Spieler.');
  if (s.phase.t === 'finished') return fail('Die Partie ist beendet.');
  if (actorPlayer.besiegt) return fail('Dein Reich ist gefallen.');

  /**
   * Eine Aktion kommt bewusst NICHT vom Spieler am Zug: die Antwort auf ein
   * Handelsangebot. Alles andere darf nur, wer dran ist.
   *
   * Frueher stand hier auch das Abwerfen. Dass es fort ist, ist kein Verlust
   * an Mitsprache - die Pluenderung nimmt selbst, und zwar ohne Phase, damit
   * ein abwesender Spieler die Runde nicht anhalten kann.
   */
  const fromOthers =
    action.t === 'respondTrade' ||
    action.t === 'answerQuest' ||
    action.t === 'deliverQuest' ||
    action.t === 'chooseAmbition' ||
    action.t === 'chooseHouse';
  if (!fromOthers && actor !== currentPlayerId(s)) return fail('Du bist nicht am Zug.');

  const phase = s.phase;

  switch (action.t) {
    // --- Weltwunder ---
    case 'buildWonder': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      const why = wunderHindernis(s, world, actor, action.q, action.r);
      if (why) return fail(why);
      if (!canAfford(actorPlayer.hand, COST_WUNDER)) return fail('Zu wenig Rohstoffe fuer ein Weltwunder.');
      pay(actorPlayer.hand, COST_WUNDER);
      const art = wunderAt(s.worldSeed, action.q, action.r)!;
      s.wunder = { ...(s.wunder ?? {}), [hexKey(action.q, action.r)]: { owner: actor, art, seit: s.turn } };
      events.push({ t: 'wonder', player: actor, q: action.q, r: action.r, art });
      checkWin(s, events);
      break;
    }

    // --- Ereignis: eine Wahl nach dem Wurf ---
    case 'answerEvent': {
      if (phase.t !== 'ereignis' || !s.ereignis) return fail('Es liegt kein Ereignis vor.');
      if (s.ereignis.player !== actor) return fail('Das Ereignis gilt einem anderen.');
      const ereignis = ereignisById(s.ereignis.id);
      const wahl = ereignis?.wahlen[action.wahl];
      if (!ereignis || !wahl) return fail('Diese Wahl gibt es nicht.');
      const why = wahlHindernis(s, actor, wahl.folge, wahl.brauchtHeld ?? false);
      if (why) return fail(why);
      const verloren = wendeFolgeAn(s, actorPlayer, wahl.folge, events);
      s.ereignisseGesehen = [...(s.ereignisseGesehen ?? []), ereignis.id];
      s.ereignis = null;
      s.phase = { t: 'main' };
      events.push({ t: 'eventResolved', player: actor, id: ereignis.id, wahl: action.wahl, ruhm: wahl.folge.ruhm ?? 0, verloren });
      checkWin(s, events);
      break;
    }

    // --- Hauswahl: alle gleichzeitig, dann der Aufbau ---
    case 'chooseHouse': {
      if (phase.t !== 'hauswahl') return fail('Die Haeuser sind schon gewaehlt.');
      if (actorPlayer.haus) return fail('Du hast dein Haus schon gewaehlt.');
      if (!(s.hausAngebot?.[actor] ?? []).includes(action.haus) || !hausById(action.haus)) {
        return fail('Dieses Haus steht dir nicht zur Wahl.');
      }
      actorPlayer.haus = action.haus;
      events.push({ t: 'houseChosen', player: actor, haus: action.haus });
      if (s.players.every((p) => p.haus)) {
        s.phase = { t: 'setup', step: 0, awaiting: 'settlement', lastVertex: null };
        events.push({ t: 'turn', player: setupPlayerId(s, 0) });
      }
      break;
    }

    // --- Aufbau ---
    case 'placeSettlement': {
      if (phase.t !== 'setup' || phase.awaiting !== 'settlement') {
        return fail('Jetzt ist keine Siedlung zu setzen.');
      }
      const why = canPlaceSettlement(s, world, actor, action.vertex, { setup: true });
      if (why) return fail(why);

      s.buildings[action.vertex] = { owner: actor, type: 'settlement' };
      events.push({ t: 'build', player: actor, kind: 'settlement', at: action.vertex });

      const v = parseVertexKey(action.vertex);
      const around = vertexAdjacentHexes(v);

      // Die zweite Siedlung bringt sofort Ertrag.
      const n = s.order.length;
      if (phase.step >= n && !hausWirkung(actorPlayer.haus).keinStartErtrag) {
        for (const h of around) {
          const tile = tileAt(world, h.q, h.r);
          if (!tile) continue;
          const res = TERRAIN_RESOURCE[tile.terrain];
          if (res === null) continue;
          actorPlayer.hand[res] += 1;
        }
      }

      const added = grow(s, world, around);
      if (added.length) events.push({ t: 'chunks', coords: added });

      s.phase = { t: 'setup', step: phase.step, awaiting: 'road', lastVertex: action.vertex };
      break;
    }

    case 'placeRoad': {
      if (phase.t !== 'setup' || phase.awaiting !== 'road') {
        return fail('Jetzt ist keine Strasse zu setzen.');
      }
      const why = canPlaceRoad(s, world, actor, action.edge, phase.lastVertex ?? undefined);
      if (why) return fail(why);

      s.roads[action.edge] = actor;
      delete s.asche[action.edge];
      events.push({ t: 'build', player: actor, kind: 'road', at: action.edge });

      const e = parseEdgeKey(action.edge);
      const added = grow(s, world, edgeEndpoints(e).flatMap(vertexAdjacentHexes));
      if (added.length) events.push({ t: 'chunks', coords: added });

      const step = phase.step + 1;
      if (step >= 2 * s.order.length) {
        // Aufbau vorbei: der erste Spieler beginnt, und jeder bekommt seinen Helden.
        s.current = 0;
        s.turn = 1;
        s.phase = { t: 'roll' };
        for (const id of s.order) spawnHeld(s, id, events);
        // Gruenderzeit: jeder beginnt mit einer Kartenwahl (core/omen.ts).
        for (const p of s.players) p.loot += startBeute(s.omens);
        // Die Startausstattung der Haeuser (core/haus.ts).
        for (const p of s.players) {
          const w = hausWirkung(p.haus);
          for (const r of RESOURCES) p.hand[r] += w.startHand?.[r] ?? 0;
          p.loot += w.startBeute ?? 0;
          for (let i = 0; i < (w.startRitter ?? 0); i++) spawnKnight(s, p.id, events);
        }
        chronikBeginnen(s);
        events.push({ t: 'turn', player: s.order[0]! });
      } else {
        s.phase = { t: 'setup', step, awaiting: 'settlement', lastVertex: null };
        events.push({ t: 'turn', player: setupPlayerId(s, step) });
      }
      break;
    }

    // --- Wuerfeln und Ertrag ---
    case 'roll': {
      if (phase.t !== 'roll') return fail('Jetzt wird nicht gewuerfelt.');
      const dice = wuerfelFuer(s.secretSeed, s.turn);
      s.lastRoll = dice;
      const sum = dice[0] + dice[1];
      events.push({ t: 'roll', player: actor, dice });

      if (sum === 7) {
        // Nur noch der Fund. Das Abwerfen sass frueher auch hier und machte
        // dieselbe Zahl zu Geschenk und Strafe zugleich; es haengt jetzt an
        // den Pluenderungen.
        enterDraft(s, 'fund', events);
        // Glueckliche Sieben (core/omen.ts) fuer den Werfer, Siebenergaben
        // aus Karten (cards/effects.ts) fuer jeden, der sie aktiv hat.
        const payout: Record<PlayerId, Hand> = {};
        const rng = new Rng(s.rngState);
        for (const p of s.players) {
          const n = (p.id === actor ? siebenerBonus(s.omens) : 0) + modifiersOf(p.activeCards).siebenGabe;
          if (n <= 0) continue;
          const gain = emptyHand();
          for (let i = 0; i < n; i++) gain[RESOURCES[rng.int(RESOURCES.length)]!] += 1;
          for (const r of RESOURCES) p.hand[r] += gain[r];
          payout[p.id] = gain;
        }
        s.rngState = rng.getState();
        if (Object.keys(payout).length > 0) events.push({ t: 'production', payout });
      } else {
        const { payout } = computeProduction(s, world, sum);
        for (const [pid, gain] of Object.entries(payout)) {
          const p = playerById(s, pid);
          if (!p) continue;
          for (const r of RESOURCES) {
            p.hand[r] += gain[r];
          }
        }
        events.push({ t: 'production', payout });
        durstLindern(s, payout, events);
        s.phase = { t: 'main' };
      }
      // Alle paar eigenen Zuege ein Ereignis mit einer Wahl (core/ereignis.ts) -
      // bei einer 7 erst nach der Kartenwahl.
      if (s.ereignisseAn && ereignisFaellig(s.turn, s.order.length)) {
        const id = waehleEreignis(s.secretSeed, s.turn, seasonOf(s.turn), s.ereignisseGesehen ?? []);
        s.ereignis = { id, player: actor };
        events.push({ t: 'eventOffered', player: actor, id });
        if (s.phase.t === 'main') s.phase = { t: 'ereignis' };
      }
      break;
    }

    case 'chooseCard': {
      if (phase.t !== 'draft') return fail('Jetzt ist keine Karte zu waehlen.');
      const angebot = s.draft;
      if (angebot === null) return fail('Es liegt keine Auswahl vor.');
      if (!angebot.options.includes(action.card)) {
        return fail('Diese Karte steht nicht zur Wahl.');
      }
      const karte = cardById(action.card);
      if (!karte) return fail('Unbekannte Karte.');

      const schonDa = [...actorPlayer.cards, ...actorPlayer.equipment].includes(karte.id);
      if (istEinzigartig(karte) && schonDa && !wiederholbar(karte)) {
        return fail('Diese einzigartige Karte besitzt du bereits.');
      }

      // Ein zweites Mal zaehlt nur die Sofortwirkung - die Dauerwirkung liegt
      // schon vor und wuerde weder stapeln noch einen zweiten Platz belegen.
      if (!(istEinzigartig(karte) && schonDa)) {
        if (cardKind(karte) === 'taktik') actorPlayer.tactics.push(karte.id);
        else if (cardKind(karte) === 'ausruestung') actorPlayer.equipment.push(karte.id);
        else {
          actorPlayer.cards.push(karte.id);
          if (dauerwirkungen(karte).length > 0) {
            aktiviereNeueReichskarte(s, actorPlayer, karte.id, action.replace);
          }
        }
      }

      // Sofortwirkung - die Bank ist unendlich.
      if (karte.instant) {
        if (karte.instant.t === 'gain') {
          for (const r of RESOURCES) actorPlayer.hand[r] += karte.instant.resources[r] ?? 0;
        } else {
          /*
           * Zufaellige Rohstoffe, nicht gewaehlte. Das Aussuchen von Hand war
           * auf dem Handy Fummelei: fuenf Sorten mit Plus und Minus auf einer
           * Karte, die ohnehin das halbe Bild einnimmt.
           *
           * Jeder Rohstoff wird EINZELN gezogen - es koennen also mehrere
           * derselben Sorte fallen. Der Wurf kommt aus dem rngState, wie
           * Wuerfel und Deck: auf dem Server, aus dem Stand reproduzierbar,
           * fuer niemanden vorhersagbar.
           */
          const rng = new Rng(s.rngState);
          for (let i = 0; i < karte.instant.count; i++) {
            actorPlayer.hand[RESOURCES[rng.int(RESOURCES.length)]!] += 1;
          }
          s.rngState = rng.getState();
        }
      }

      s.draft = null;
      s.phase = s.ereignis ? { t: 'ereignis' } : { t: 'main' };
      events.push({ t: 'cardTaken', player: actor, card: karte.id });
      checkWin(s, events);
      break;
    }

    case 'setLoadout': {
      if (phase.t !== 'main') return fail('Die Karten werden in der Bauphase umgestellt.');
      const why = setzeAktiveKarten(s, actorPlayer, action.cards);
      if (why) return fail(why);
      break;
    }

    case 'playTactic': {
      if (phase.t !== 'main') return fail('Taktiken werden in der Bauphase vorbereitet.');
      const why = playTactic(s, actor, action.card, action.unit, events);
      if (why) return fail(why);
      break;
    }

    // --- Bauen ---
    case 'buildRoad': {
      const inRoadBuilding = phase.t === 'roadBuilding';
      if (phase.t !== 'main' && !inRoadBuilding) return fail('Jetzt kann nicht gebaut werden.');
      const why = canPlaceRoad(s, world, actor, action.edge);
      if (why) return fail(why);
      // Auf eigener Asche fehlen nur die Bohlen (rules/feuer.ts).
      const kosten = s.asche[action.edge] === actor ? COST_REBUILD_ROAD : COST_ROAD;
      if (!inRoadBuilding && !canAfford(actorPlayer.hand, kosten)) {
        return fail('Zu wenig Rohstoffe fuer eine Strasse.');
      }

      if (!inRoadBuilding) pay(actorPlayer.hand, kosten);
      s.roads[action.edge] = actor;
      delete s.asche[action.edge];
      events.push({ t: 'build', player: actor, kind: 'road', at: action.edge });

      const added = grow(
        s,
        world,
        edgeEndpoints(parseEdgeKey(action.edge)).flatMap(vertexAdjacentHexes),
      );
      if (added.length) events.push({ t: 'chunks', coords: added });

      if (inRoadBuilding) {
        const remaining = phase.remaining - 1;
        const canStillBuild =
          remaining > 0 &&
          legalRoadEdges(s, world, actor).length > 0;
        s.phase = canStillBuild ? { t: 'roadBuilding', remaining } : { t: 'main' };
      }
      break;
    }

    case 'buildSettlement': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      // Steht kein Gebaeude mehr, darf die Siedlung ueberall stehen - ohne
      // eigene Strasse davor (rules/untergang.ts).
      const why = canPlaceSettlement(s, world, actor, action.vertex, { setup: imUntergang(s, actor) });
      if (why) return fail(why);
      if (!canAfford(actorPlayer.hand, COST_SETTLEMENT)) {
        return fail('Zu wenig Rohstoffe fuer eine Siedlung.');
      }

      pay(actorPlayer.hand, COST_SETTLEMENT);
      s.buildings[action.vertex] = { owner: actor, type: 'settlement' };
      events.push({ t: 'build', player: actor, kind: 'settlement', at: action.vertex });

      const added = grow(s, world, vertexAdjacentHexes(parseVertexKey(action.vertex)));
      if (added.length) events.push({ t: 'chunks', coords: added });
      checkWin(s, events);
      break;
    }

    case 'buildCity': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      const why = canPlaceCity(s, actor, action.vertex);
      if (why) return fail(why);
      if (brennt(s, action.vertex)) return fail('Dort brennt es gerade.');
      if (!canAfford(actorPlayer.hand, COST_CITY)) {
        return fail('Zu wenig Rohstoffe fuer eine Stadt.');
      }

      pay(actorPlayer.hand, COST_CITY);
      s.buildings[action.vertex] = { owner: actor, type: 'city' };
      events.push({ t: 'build', player: actor, kind: 'city', at: action.vertex });
      checkWin(s, events);
      break;
    }

    // --- Entwicklungskarten ---
    case 'buyDev': {
      if (phase.t !== 'main') return fail('Jetzt kann nichts gekauft werden.');
      if (!canAfford(actorPlayer.hand, COST_DEV)) {
        return fail('Zu wenig Rohstoffe fuer eine Entwicklungskarte.');
      }
      pay(actorPlayer.hand, COST_DEV);
      const card = drawDevCard(s);
      actorPlayer.dev.push({ type: card, boughtTurn: s.turn, played: false });
      events.push({ t: 'buyDev', player: actor });
      checkWin(s, events); // eine Siegpunktkarte kann sofort entscheiden
      break;
    }

    case 'playKnight': {
      if (phase.t !== 'main' && phase.t !== 'roll') {
        return fail('Jetzt ist keine Karte spielbar.');
      }
      const why = devPlayGuard(s, actorPlayer, 'knight');
      if (why) return fail(why);

      actorPlayer.dev[findPlayableDev(s, actorPlayer, 'knight')]!.played = true;
      actorPlayer.playedKnights += 1;
      events.push({ t: 'playDev', player: actor, card: 'knight' });
      spawnKnight(s, actor, events);
      /*
       * Der Ritter tritt als Einheit an einer eigenen Siedlung an (rules/army.ts)
       * und zieht von dort, wohin man ihn schickt. Ruhm entsteht erst durch
       * Taten auf der Karte, nicht schon durch das Ausspielen.
       */
      checkWin(s, events);
      break;
    }

    case 'playRoadBuilding': {
      if (phase.t !== 'main') return fail('Jetzt ist keine Karte spielbar.');
      const why = devPlayGuard(s, actorPlayer, 'roadBuilding');
      if (why) return fail(why);

      actorPlayer.dev[findPlayableDev(s, actorPlayer, 'roadBuilding')]!.played = true;
      events.push({ t: 'playDev', player: actor, card: 'roadBuilding' });

      const possible = 2;
      s.phase =
        possible > 0 && legalRoadEdges(s, world, actor).length > 0
          ? { t: 'roadBuilding', remaining: possible }
          : { t: 'main' };
      break;
    }

    case 'playYearOfPlenty': {
      if (phase.t !== 'main') return fail('Jetzt ist keine Karte spielbar.');
      const why = devPlayGuard(s, actorPlayer, 'yearOfPlenty');
      if (why) return fail(why);
      const want: Partial<Record<Resource, number>> = {};
      want[action.a] = (want[action.a] ?? 0) + 1;
      want[action.b] = (want[action.b] ?? 0) + 1;

      actorPlayer.dev[findPlayableDev(s, actorPlayer, 'yearOfPlenty')]!.played = true;
      for (const r of RESOURCES) {
        actorPlayer.hand[r] += want[r] ?? 0;
      }
      events.push({ t: 'playDev', player: actor, card: 'yearOfPlenty' });
      events.push({ t: 'yearOfPlenty', player: actor, a: action.a, b: action.b });
      break;
    }

    case 'playMonopoly': {
      if (phase.t !== 'main') return fail('Jetzt ist keine Karte spielbar.');
      const why = devPlayGuard(s, actorPlayer, 'monopoly');
      if (why) return fail(why);

      actorPlayer.dev[findPlayableDev(s, actorPlayer, 'monopoly')]!.played = true;
      let taken = 0;
      for (const p of s.players) {
        if (p.id === actor) continue;
        taken += p.hand[action.resource];
        p.hand[action.resource] = 0;
      }
      actorPlayer.hand[action.resource] += taken;
      events.push({ t: 'playDev', player: actor, card: 'monopoly' });
      events.push({ t: 'monopoly', player: actor, resource: action.resource, taken });
      break;
    }

    // --- Handel ---
    case 'bankTrade': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gehandelt werden.');
      const why = canBankTrade(s, world, actor, action.give, action.receive);
      if (why) return fail(why);
      const ratio = tradeRatio(s, world, actor, action.give);
      actorPlayer.hand[action.give] -= ratio;
      actorPlayer.hand[action.receive] += 1;
      events.push({ t: 'trade', player: actor, give: action.give, receive: action.receive, ratio });
      break;
    }

    case 'offerTrade': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gehandelt werden.');
      const why = canOfferTrade(s, actor, action.give, action.want);
      if (why) return fail(why);
      s.trade = {
        from: actor,
        give: { ...action.give },
        want: { ...action.want },
        accepted: [],
        declined: [],
      };
      events.push({ t: 'tradeOffer', player: actor, give: action.give, want: action.want });
      break;
    }

    case 'respondTrade': {
      const offer = s.trade;
      if (offer === null) return fail('Es liegt kein Angebot vor.');
      if (offer.from === actor) return fail('Das ist dein eigenes Angebot.');
      if (action.accept) {
        const why = canAcceptTrade(s, actor);
        if (why) return fail(why);
      }
      // Eine Antwort ersetzt die vorherige - Meinungsaenderung ist erlaubt.
      offer.accepted = offer.accepted.filter((id) => id !== actor);
      offer.declined = offer.declined.filter((id) => id !== actor);
      (action.accept ? offer.accepted : offer.declined).push(actor);
      events.push({ t: 'tradeResponse', player: actor, accept: action.accept });
      break;
    }

    case 'settleTrade': {
      const offer = s.trade;
      if (offer === null) return fail('Es liegt kein Angebot vor.');
      if (offer.from !== actor) return fail('Nur der Anbieter kann abschliessen.');
      const why = canSettleTrade(s, action.partner);
      if (why) return fail(why);

      const partner = playerById(s, action.partner)!;
      // Beide Richtungen direkt zwischen den Haenden - die Bank ist nicht beteiligt.
      moveBundle(actorPlayer.hand, partner.hand, offer.give);
      moveBundle(partner.hand, actorPlayer.hand, offer.want);

      events.push({
        t: 'tradeSettled',
        from: actor,
        to: action.partner,
        give: offer.give,
        want: offer.want,
      });
      s.trade = null;
      break;
    }

    case 'cancelTrade': {
      const offer = s.trade;
      if (offer === null) return fail('Es liegt kein Angebot vor.');
      if (offer.from !== actor) return fail('Nur der Anbieter kann zurueckziehen.');
      s.trade = null;
      events.push({ t: 'tradeCancelled', player: actor });
      break;
    }

    // --- Heer ---
    case 'recruitKnight': {
      if (phase.t !== 'main') return fail('Jetzt kann niemand angeworben werden.');
      if (!canAfford(actorPlayer.hand, COST_KNIGHT)) {
        return fail('Zu wenig Rohstoffe fuer einen Ritter.');
      }
      pay(actorPlayer.hand, COST_KNIGHT);
      if (!spawnKnight(s, actor, events)) {
        return fail('Keine Siedlung, an der ein Ritter antreten koennte.');
      }
      break;
    }

    case 'recruitArcher': {
      if (phase.t !== 'main') return fail('Jetzt kann niemand angeworben werden.');
      if (!canAfford(actorPlayer.hand, COST_ARCHER)) {
        return fail('Zu wenig Rohstoffe fuer einen Bogenschuetzen.');
      }
      pay(actorPlayer.hand, COST_ARCHER);
      if (!spawnKnight(s, actor, events, 'bogen')) {
        return fail('Keine Siedlung, an der ein Bogenschuetze antreten koennte.');
      }
      break;
    }

    case 'orderUnit': {
      if (phase.t !== 'main' && phase.t !== 'roll') {
        return fail('Jetzt koennen keine Befehle gegeben werden.');
      }
      const einheit = s.units.find((u) => u.id === action.unit);
      if (!einheit) return fail('Diese Einheit gibt es nicht.');
      if (einheit.owner !== actor || (einheit.kind !== 'ritter' && einheit.kind !== 'bogen' && einheit.kind !== 'held')) {
        return fail('Das ist nicht deine Einheit.');
      }
      // Mit Verband: alle eigenen Ritter und der Held auf diesem Feld.
      const mitglieder = action.verband
        ? s.units.filter(
            (u) =>
              u.owner === actor &&
              (u.kind === 'ritter' || u.kind === 'bogen' || u.kind === 'held') &&
              u.q === einheit.q &&
              u.r === einheit.r,
          )
        : [einheit];
      // Ein eigener Befehl loest aus Gefolge und Verband und beendet das Erkunden.
      for (const m of mitglieder) {
        m.folgt = null;
        m.auftrag = 'befehl';
        m.verband = null;
      }
      if (action.q === einheit.q && action.r === einheit.r) {
        for (const m of mitglieder) m.ziel = null;
        break;
      }
      const feld = tileAt(world, action.q, action.r);
      if (!feld) return fail('Dieses Feld ist noch nicht erkundet.');
      if (feld.terrain === 'water') return fail('Ritter gehen nicht uebers Wasser.');
      if (!nextStep(s.worldSeed, einheit, new Set([hexKey(action.q, action.r)]))) {
        return fail('Dorthin fuehrt kein Landweg.');
      }
      const verbandId = mitglieder.length > 1 ? einheit.id : null;
      for (const m of mitglieder) {
        m.ziel = { q: action.q, r: action.r };
        m.verband = verbandId;
      }
      break;
    }

    case 'orderUnits': {
      if (phase.t !== 'main' && phase.t !== 'roll') {
        return fail('Jetzt koennen keine Befehle gegeben werden.');
      }
      const liste = [...new Set(action.units)].map((id) => s.units.find((u) => u.id === id));
      if (
        liste.length === 0 ||
        liste.some((u) => !u || u.owner !== actor || (u.kind !== 'ritter' && u.kind !== 'bogen' && u.kind !== 'held'))
      ) {
        return fail('Das sind nicht deine Einheiten.');
      }
      const gruppe = liste as (typeof s.units)[number][];
      if (action.halt) {
        for (const m of gruppe) {
          m.ziel = null;
          m.folgt = null;
          m.auftrag = 'befehl';
        }
        break;
      }
      const feld = tileAt(world, action.q, action.r);
      if (!feld) return fail('Dieses Feld ist noch nicht erkundet.');
      if (feld.terrain === 'water') return fail('Einheiten gehen nicht uebers Wasser.');
      const zk = hexKey(action.q, action.r);
      if (gruppe.some((m) => hexKey(m.q, m.r) !== zk && !nextStep(s.worldSeed, m, new Set([zk])))) {
        return fail('Dorthin fuehrt kein Landweg.');
      }
      /*
       * Das Banner: ist genau eine bestehende Schar gewaehlt, behaelt sie es.
       * Sonst bekommen die Gewaehlten ein neues - aus dem Zaehler der Einheiten,
       * damit es keiner anderen Schar gleicht. Wer aus einer Schar herausgewaehlt
       * wurde, laesst den Rest mit dem alten Banner zurueck.
       */
      const alt = gruppe[0]!.verband;
      const ganzeSchar =
        alt !== null &&
        gruppe.every((m) => m.verband === alt) &&
        s.units.filter((u) => u.verband === alt && u.owner === actor).length === gruppe.length;
      const schar = gruppe.length < 2 ? null : ganzeSchar ? alt : s.nextUnitId++;
      for (const m of gruppe) {
        m.folgt = null;
        m.auftrag = 'befehl';
        m.verband = schar;
        m.ziel = hexKey(m.q, m.r) === zk ? null : { q: action.q, r: action.r };
      }
      break;
    }

    case 'disbandGroup': {
      if (phase.t !== 'main' && phase.t !== 'roll') {
        return fail('Jetzt koennen keine Befehle gegeben werden.');
      }
      const mitglieder = s.units.filter((u) => u.owner === actor && u.verband === action.verband);
      if (mitglieder.length === 0) return fail('Diese Schar gibt es nicht.');
      for (const m of mitglieder) m.verband = null;
      break;
    }

    case 'claimLoot': {
      if (phase.t !== 'main') return fail('Beute wird in der Bauphase eingeloest.');
      if (actorPlayer.loot <= 0) return fail('Keine Beute vorhanden.');
      actorPlayer.loot -= 1;
      enterDraft(s, 'belohnung', events, 1 + actorPlayer.cards.length);
      break;
    }

    case 'putOut': {
      if (phase.t !== 'main' && phase.t !== 'roll') return fail('Jetzt kann nicht geloescht werden.');
      const why = mitKarteLoeschen(s, actor, action.key, action.mit, events);
      if (why) return fail(why);
      break;
    }

    case 'buildTower': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      const why = canPlaceTower(s, world, actor, action.vertex);
      if (why) return fail(why);
      if (!canAfford(actorPlayer.hand, COST_TOWER)) return fail('Zu wenig Rohstoffe fuer einen Wachturm.');
      pay(actorPlayer.hand, COST_TOWER);
      s.tuerme[action.vertex] = { owner: actor, stufe: 1 };
      events.push({ t: 'build', player: actor, kind: 'tower', at: action.vertex });
      // Ein Turm am Rand schiebt die Welt vor sich her, wie jedes Bauteil.
      const added = grow(s, world, vertexAdjacentHexes(parseVertexKey(action.vertex)));
      if (added.length) events.push({ t: 'chunks', coords: added });
      break;
    }

    case 'buildMauer': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      const why = canPlaceMauer(s, world, actor, action.edge);
      if (why) return fail(why);
      const kosten = action.art === 'tor' ? COST_TOR : COST_MAUER;
      const name = action.art === 'tor' ? 'ein Tor' : 'eine Palisade';
      if (!canAfford(actorPlayer.hand, kosten)) return fail(`Zu wenig Rohstoffe fuer ${name}.`);
      pay(actorPlayer.hand, kosten);
      if (!s.mauern) s.mauern = {};
      s.mauern[action.edge] = { owner: actor, art: action.art };
      events.push({ t: 'build', player: actor, kind: action.art === 'tor' ? 'tor' : 'mauer', at: action.edge });
      break;
    }

    case 'buildReich': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      const kosten = COST_REICHSBAU[action.art];
      if (!kosten) return fail('Diesen Bau gibt es nicht.');
      const why = reichsbauHindernis(s, actor, action.q, action.r);
      if (why) return fail(why);
      if (!canAfford(actorPlayer.hand, kosten)) {
        return fail(`Zu wenig Rohstoffe fuer ${REICHSBAU_NAME[action.art as ReichsbauArt] ?? 'den Bau'}.`);
      }
      pay(actorPlayer.hand, kosten);
      if (!s.reichsbauten) s.reichsbauten = {};
      s.reichsbauten[hexKey(action.q, action.r)] = { owner: actor, art: action.art, seit: s.turn };
      events.push({ t: 'reichsbau', player: actor, q: action.q, r: action.r, art: action.art });
      // Auch ein Reichsbau schiebt die Welt vor sich her.
      const added = grow(s, world, [{ q: action.q, r: action.r }]);
      if (added.length) events.push({ t: 'chunks', coords: added });
      break;
    }

    case 'ernenne': {
      if (phase.t !== 'main') return fail('Ernannt wird in der Bauphase.');
      // Der Client schickt eine Zeichenkette - hier wird sie geprueft, nicht geglaubt.
      if (!ZWEIGE.includes(action.zweig)) return fail('Diesen Helden gibt es nicht.');
      const why = ernennungHindernis(s, actor);
      if (why) return fail(why);
      ernenne(s, actor, action.zweig, events);
      break;
    }

    case 'upgradeTower': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      const turm = s.tuerme?.[action.vertex];
      if (!turm || turm.owner !== actor) return fail('Das ist nicht dein Wachturm.');
      if (turm.stufe >= MAX_TURM_STUFE) return fail(`Der ${TURM_NAME[MAX_TURM_STUFE]} steht schon.`);
      const stufe = turm.stufe + 1;
      const kosten = COST_TURM_STUFE[stufe]!;
      if (!canAfford(actorPlayer.hand, kosten)) return fail(`Zu wenig Rohstoffe fuer den ${TURM_NAME[stufe]}.`);
      pay(actorPlayer.hand, kosten);
      turm.stufe = stufe;
      events.push({ t: 'towerUpgrade', player: actor, at: action.vertex, stufe });
      break;
    }

    case 'foundCapital': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      const why = hauptstadtHindernis(s, actor, action.q, action.r);
      if (why) return fail(why);
      if (!canAfford(actorPlayer.hand, COST_CAPITAL)) return fail('Zu wenig Rohstoffe fuer eine Hauptstadt.');
      pay(actorPlayer.hand, COST_CAPITAL);
      s.hauptstaedte[hexKey(action.q, action.r)] = { owner: actor, stufe: 1, seit: s.turn };
      events.push({ t: 'capital', player: actor, q: action.q, r: action.r });
      checkWin(s, events);
      break;
    }

    case 'upgradeCapital': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      const why = ausbauHindernis(s, actor, action.q, action.r);
      if (why) return fail(why);
      const hauptstadt = s.hauptstaedte[hexKey(action.q, action.r)]!;
      const stufe = hauptstadt.stufe + 1;
      const kosten = COST_STUFE[stufe]!;
      if (!canAfford(actorPlayer.hand, kosten)) return fail(`Zu wenig Rohstoffe fuer den ${STUFE_NAME[stufe]}.`);
      pay(actorPlayer.hand, kosten);
      hauptstadt.stufe = stufe;
      // Die neue Mauer loescht, was im Ring gerade brennt.
      const schutz = festungsSchutz(s, actor);
      s.braende = s.braende.filter((b) => b.owner !== actor || !(schutz.kanten.has(b.key) || schutz.ecken.has(b.key)));
      events.push({ t: 'capitalUpgrade', player: actor, q: action.q, r: action.r, stufe: hauptstadt.stufe });
      checkWin(s, events);
      break;
    }

    case 'explore': {
      if (phase.t !== 'main' && phase.t !== 'roll') {
        return fail('Jetzt koennen keine Befehle gegeben werden.');
      }
      const einheit = s.units.find((u) => u.id === action.unit);
      if (!einheit || einheit.owner !== actor || (einheit.kind !== 'ritter' && einheit.kind !== 'bogen' && einheit.kind !== 'held')) {
        return fail('Das ist nicht deine Einheit.');
      }
      einheit.folgt = null;
      einheit.verband = null;
      einheit.ziel = null;
      einheit.auftrag = action.explore ? 'erkunden' : 'befehl';
      break;
    }

    case 'follow': {
      if (phase.t !== 'main' && phase.t !== 'roll') {
        return fail('Jetzt koennen keine Befehle gegeben werden.');
      }
      const ritter = s.units.find((u) => u.id === action.unit);
      if (!ritter || ritter.owner !== actor || (ritter.kind !== 'ritter' && ritter.kind !== 'bogen')) {
        return fail('Nur Ritter und Bogenschuetzen folgen dem Helden.');
      }
      if (!action.follow) {
        ritter.folgt = null;
        ritter.ziel = null;
        break;
      }
      const held = s.units.find((u) => u.kind === 'held' && u.owner === actor);
      if (!held) return fail('Dein Held ist nicht auf der Karte.');
      ritter.folgt = held.id;
      ritter.verband = null;
      ritter.auftrag = 'befehl';
      ritter.ziel = ritter.q === held.q && ritter.r === held.r ? null : { q: held.q, r: held.r };
      break;
    }

    case 'diplomacy': {
      if (phase.t !== 'main') return fail('Verhandelt wird in der Bauphase.');
      const why = verhandeln(s, actor, action.fraktion, action.art, events);
      if (why) return fail(why);
      break;
    }

    case 'deliverQuest': {
      const why = auftragLiefern(s, actor, action.id, events);
      if (why) return fail(why);
      break;
    }

    case 'chooseAmbition': {
      const why = vorhabenWaehlen(s, actor, action.id);
      if (why) return fail(why);
      break;
    }

    case 'answerQuest': {
      const why = aufAuftragAntworten(s, actor, action.id, action.accept, events);
      if (why) return fail(why);
      break;
    }

    case 'endTurn': {
      if (phase.t !== 'main') return fail('Der Zug laesst sich jetzt nicht beenden.');
      const ender = actor;
      const beendet = s.turn;
      // Rundengrenze: der letzte Zug ist gespielt (core/chronik.ts, wertung).
      if (s.rundenLimit && beendet >= s.rundenLimit) {
        zeitAbgelaufen(s, events);
        break;
      }
      nextTurn(s);

      // Jede Runde zieht das Heer: Ritter, der Held, Raubzuege, Fehden,
      // Wanderer, Kaempfe, Pluenderungen und Feuer (rules/army.ts).
      tickArmy(s, world, events);

      // Feuer: Regen und Helfer loeschen, was ein Zug lang brannte, brennt ab.
      brandRunde(s, ender, beendet, events);

      // Ist ein Reich gefallen, laeuft seine Frist - und ist die Partie damit
      // entschieden, endet sie hier (rules/untergang.ts).
      untergangRunde(s, events);
      if ((s.phase as GameState['phase']).t === 'finished') break;
      ueberspringeBesiegte(s);

      // Zum Beginn jeder grossen Runde brechen Raubzuege auf, vielleicht eine
      // Fehde und ein Wanderer - nach dem Ziehen, damit ein frischer Raubzug
      // nicht im selben Moment schon pluendert. Und der Tribut wird faellig.
      if (bigRoundChangedAt(s.turn)) {
        beginBigRound(s, events);
        lagerNeuBesetzen(s, events);
        tributRunde(s, events);
        // Vorhaben (core/vorhaben.ts): verfallen lassen, neue anbieten.
        vorhabenRunde(s, events);
        // Wer eine Sorte gar nicht erzeugt, bekommt sie ab und zu (rules/hilfe.ts).
        mangelHilfe(s, world, events);
        // Sternwarte und Sonnentempel geben je grosser Runde (core/wunder.ts).
        for (const p of s.players) {
          if (p.besiegt) continue;
          const beute = hatWunder(s, p.id, 'sternwarte') ? 1 : 0;
          const ruhm = hatWunder(s, p.id, 'sonnentempel') ? 1 : 0;
          p.loot += beute;
          if (beute > 0) events.push({ t: 'wonderGift', player: p.id, art: 'sternwarte', ruhm: 0, beute });
          if (ruhm > 0) events.push({ t: 'wonderGift', player: p.id, art: 'sonnentempel', ruhm, beute: 0 });
        }
      }

      // Mit der Nacht kommen die Goblins in Horden und die Schleime aus dem
      // Dunkel; im Morgengrauen werden die Schleime wieder friedfertig
      // (core/zeit.ts, rules/army.ts).
      if (nachtBeginntAt(s.turn)) beginNight(s, events);
      if (tagBeginntAt(s.turn)) beginDay(s, events);

      heldenRunde(s, events);
      abkommenRunde(s, events);

      // Auftraege: erst was diese Runde erfuellt hat, dann neue Angebote.
      auftraegePruefen(s, events, events);
      const rng = new Rng(s.rngState);
      wandererBieten(s, world, rng, events);
      s.rngState = rng.getState();

      events.push({ t: 'turn', player: s.order[s.current]! });
      break;
    }

    default: {
      const never: never = action;
      return fail('Unbekannte Aktion: ' + JSON.stringify(never));
    }
  }

  // Kampf, Lager, Auftraege und Veteranen laufen in verschiedenen Regeln.
  // Ihre bereits erzeugten Ereignisse bilden an einer Stelle den Ruhm.
  const geschehen = [...events] as Array<{ t: string } & Record<string, unknown>>;
  ruhmAusEreignissen(s, geschehen, events);
  // Die Fraktionen reagieren: Nachfolger, Beute, Stimmung (core/fraktionsleben.ts).
  fraktionsLeben(s, geschehen, events);
  // Ins Saisonbuch - und zum Wechsel der Jahreszeit die Kunde aus dem Land (core/kunde.ts).
  kundeFortschreiben(s, events as never);
  if (action.t === 'endTurn' && seasonChangedAt(s.turn) && (s.phase as GameState['phase']).t !== 'finished') {
    const bericht = kundeSchreiben(s, s.turn);
    if (bericht) events.push({ t: 'seasonReport', bericht });
  }
  // Die Chronik liest dieselben Ereignisse - fuer die Schlussseite. Der Aufbau
  // zaehlt nicht mit: er ist fuer alle gleich und kein Teil der Geschichte.
  if (action.t !== 'placeSettlement' && action.t !== 'placeRoad') chronikFortschreiben(s, events);

  // Vorhaben (core/vorhaben.ts): erst jetzt stehen die Zahlen der Chronik.
  // Der Lohn laeuft wie jeder Ruhm und jedes Ereignis durch Ruhm und Chronik.
  if ((s.phase as GameState['phase']).t !== 'finished') {
    const erfuellt: GameEvent[] = [];
    vorhabenPruefen(s, erfuellt);
    if (erfuellt.length > 0) {
      const ruhm: GameEvent[] = [];
      ruhmAusEreignissen(s, erfuellt as never, ruhm);
      events.push(...erfuellt, ...ruhm);
      chronikFortschreiben(s, [...erfuellt, ...ruhm]);
    }
  }

  // Siegwege (core/siegwege.ts): wer auf einem eigenen Weg weit genug kam,
  // gewinnt wie mit den Siegpunkten - der Spieler am Zug zuerst.
  if ((s.phase as GameState['phase']).t !== 'finished' && siegwegeAn(s)) {
    const reihe = [...s.order.slice(s.current), ...s.order.slice(0, s.current)];
    for (const id of reihe) {
      const weg = erfuellterWeg(s, id);
      if (!weg) continue;
      s.phase = { t: 'finished', winner: id, durch: 'ziel', weg: weg.id };
      const schluss: GameEvent[] = [{ t: 'win', player: id }];
      events.push(...schluss);
      chronikFortschreiben(s, schluss);
      break;
    }
  }

  // Szenario: ist das Ziel erreicht? Dann ist es geschafft - je schneller, desto
  // mehr Sterne (core/szenario.ts). Die Chronik bekommt den Schluss nachgereicht.
  const szenario = szenarioById(s.szenario);
  const jetzt = (s.phase as GameState['phase']).t;
  if (szenario && jetzt !== 'finished' && jetzt !== 'setup' && jetzt !== 'hauswahl') {
    const id = s.order[0]!;
    if (szenarioErreicht(s, id, szenario.ziel)) {
      const runde = roundOf(s.turn);
      s.szenarioErgebnis = { erreicht: true, runde, sterne: sterneFuer(szenario, runde) };
      s.phase = { t: 'finished', winner: id, durch: 'ziel' };
      const schluss: GameEvent[] = [{ t: 'win', player: id }];
      events.push(...schluss);
      chronikFortschreiben(s, schluss);
    }
  }

  game.state = s;
  return { ok: true, events };
}

/** Handkartenzahl - fuer Anzeige und Redaktion. */
export { handSize };
