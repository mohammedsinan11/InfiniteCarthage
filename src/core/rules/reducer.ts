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

import { Rng } from '../rng';
import {
  edgeEndpoints,
  hexKey,
  parseEdgeKey,
  parseVertexKey,
  vertexAdjacentHexes,
} from '../coords';
import {
  createWorld,
  ensureGenerated,
  robberStart,
  revealChunks,
  tileAt,
} from '../world';
import type { World } from '../world';
import { findPlayableSeed } from '../worldgen';
import type { ChunkCoord } from '../chunks';
import { RESOURCES, TERRAIN_RESOURCE } from '../types';
import type { Resource } from '../types';
import {
  BANK_PER_RESOURCE,
  STARTING_PIECES,
  currentPlayerId,
  emptyHand,
  handSize,
  playerById,
  setupPlayerId,
  totalPoints,
} from '../state';
import type { GameState, Hand, PlayerId, Player } from '../state';
import type { DevCardType } from '../state';
import type { Bundle } from '../types';
import {
  COST_CITY,
  COST_DEV,
  COST_ROAD,
  COST_SETTLEMENT,
  canAfford,
  pay,
} from './costs';
import {
  canPlaceCity,
  canPlaceRoad,
  canPlaceSettlement,
  legalRoadEdges,
} from './placement';
import { computeProduction } from './production';
import {
  canMoveRobber,
  discardCount,
  playersMustDiscard,
  stealCandidatesServer,
} from './robber';
import {
  canAcceptTrade,
  canBankTrade,
  canOfferTrade,
  canSettleTrade,
  moveBundle,
  tradeRatio,
} from './trade';
import { drawDevCard, largestArmyHolder } from './dev';

export type Action =
  | { t: 'placeSettlement'; vertex: string }
  | { t: 'placeRoad'; edge: string }
  | { t: 'roll' }
  | { t: 'discard'; cards: Partial<Record<Resource, number>> }
  | { t: 'moveRobber'; hex: string; victim?: PlayerId }
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
  | { t: 'endTurn' };

export type GameEvent =
  | { t: 'roll'; player: PlayerId; dice: [number, number] }
  | { t: 'production'; payout: Record<PlayerId, Hand>; shortfall: Resource[] }
  | { t: 'build'; player: PlayerId; kind: 'road' | 'settlement' | 'city'; at: string }
  | { t: 'robber'; player: PlayerId; hex: string }
  /** resource ist null, wenn der Empfaenger weder Dieb noch Bestohlener ist. */
  | { t: 'steal'; from: PlayerId; to: PlayerId; resource: Resource | null }
  | { t: 'discard'; player: PlayerId; count: number }
  | { t: 'buyDev'; player: PlayerId }
  | { t: 'playDev'; player: PlayerId; card: DevCardType }
  | { t: 'yearOfPlenty'; player: PlayerId; a: Resource; b: Resource }
  | { t: 'monopoly'; player: PlayerId; resource: Resource; taken: number }
  | { t: 'trade'; player: PlayerId; give: Resource; receive: Resource; ratio: number }
  | { t: 'tradeOffer'; player: PlayerId; give: Bundle; want: Bundle }
  | { t: 'tradeResponse'; player: PlayerId; accept: boolean }
  | { t: 'tradeSettled'; from: PlayerId; to: PlayerId; give: Bundle; want: Bundle }
  | { t: 'tradeCancelled'; player: PlayerId }
  | { t: 'largestArmy'; player: PlayerId }
  | { t: 'chunks'; coords: ChunkCoord[] }
  | { t: 'turn'; player: PlayerId }
  | { t: 'win'; player: PlayerId };

export type Game = { state: GameState; world: World };

export type Result =
  | { ok: true; events: GameEvent[] }
  | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

// --- Aufbau -----------------------------------------------------------------

export type NewPlayer = { id: PlayerId; name: string };

export function createGame(
  players: NewPlayer[],
  worldSeed: number,
  secretSeed: number,
  targetPoints = 10,
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
  const added = ensureGenerated(world, { q: 0, r: 0 });
  const robber = robberStart(world);

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
      pieces: { ...STARTING_PIECES },
      connected: true,
    })),
    order: players.map((p) => p.id),
    current: 0,
    phase: { t: 'setup', step: 0, awaiting: 'settlement', lastVertex: null },
    buildings: {},
    roads: {},
    robber: hexKey(robber.q, robber.r),
    bank: {
      lumber: BANK_PER_RESOURCE,
      wool: BANK_PER_RESOURCE,
      grain: BANK_PER_RESOURCE,
      brick: BANK_PER_RESOURCE,
      ore: BANK_PER_RESOURCE,
    },
    deck: [],
    packIndex: 0,
    turn: 0,
    devPlayedThisTurn: false,
    lastRoll: null,
    targetPoints,
    largestArmy: null,
    trade: null,
    chunks: added,
  };

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
  state.turn += 1;
  state.devPlayedThisTurn = false;
  // Ein Angebot gehoert zum Zug seines Anbieters und verfaellt mit ihm.
  state.trade = null;
  state.phase = { t: 'roll' };
}

/**
 * Sieg pruefen. Gewonnen wird nur im eigenen Zug.
 *
 * targetPoints = 0 heisst Sandkasten: die Partie kennt kein Ende. Das ist
 * kein Sonderfall im Ablauf, sondern schlicht eine Schwelle, die nie
 * erreicht wird.
 */
function checkWin(state: GameState, events: GameEvent[]): void {
  if (state.targetPoints <= 0) return;
  const id = state.order[state.current]!;
  if (totalPoints(state, id) >= state.targetPoints) {
    state.phase = { t: 'finished', winner: id };
    events.push({ t: 'win', player: id });
  }
}

function takeRandomCard(rng: Rng, hand: Hand): Resource | null {
  const pool: Resource[] = [];
  for (const r of RESOURCES) for (let i = 0; i < hand[r]; i++) pool.push(r);
  if (pool.length === 0) return null;
  const picked = pool[rng.int(pool.length)]!;
  hand[picked] -= 1;
  return picked;
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
  if (state.devPlayedThisTurn) return 'In diesem Zug wurde schon eine Karte gespielt.';
  if (findPlayableDev(state, p, type) < 0) {
    const owned = p.dev.some((d) => d.type === type && !d.played);
    return owned
      ? 'Diese Karte ist erst im naechsten Zug spielbar.'
      : 'Du hast diese Karte nicht.';
  }
  return null;
}

/**
 * In die Raeuberphase wechseln.
 *
 * returnTo ist kein Beiwerk: ein Ritter darf auch VOR dem Wuerfeln gespielt
 * werden. Ohne die Ruecksprungmarke wuerde der Wurf danach uebersprungen und
 * der Spieler bekaeme in dieser Runde keinen Ertrag.
 */
function enterRobber(state: GameState, by: 'dice' | 'knight', returnTo: 'roll' | 'main'): void {
  state.phase = { t: 'moveRobber', by, returnTo };
}

// --- Hauptfunktion ----------------------------------------------------------

export function applyAction(game: Game, action: Action, actor: PlayerId): Result {
  const s: GameState = structuredClone(game.state);
  const world = game.world;
  const events: GameEvent[] = [];

  const actorPlayer = playerById(s, actor);
  if (!actorPlayer) return fail('Unbekannter Spieler.');
  if (s.phase.t === 'finished') return fail('Die Partie ist beendet.');

  /**
   * Zwei Aktionen kommen bewusst NICHT vom Spieler am Zug: das Abwerfen nach
   * einer Sieben und die Antwort auf ein Handelsangebot. Alles andere darf
   * nur, wer dran ist.
   */
  const fromOthers = action.t === 'discard' || action.t === 'respondTrade';
  if (!fromOthers && actor !== currentPlayerId(s)) return fail('Du bist nicht am Zug.');

  const phase = s.phase;

  switch (action.t) {
    // --- Aufbau ---
    case 'placeSettlement': {
      if (phase.t !== 'setup' || phase.awaiting !== 'settlement') {
        return fail('Jetzt ist keine Siedlung zu setzen.');
      }
      const why = canPlaceSettlement(s, world, actor, action.vertex, { setup: true });
      if (why) return fail(why);
      if (actorPlayer.pieces.settlements <= 0) return fail('Keine Siedlungen mehr.');

      s.buildings[action.vertex] = { owner: actor, type: 'settlement' };
      actorPlayer.pieces.settlements -= 1;
      events.push({ t: 'build', player: actor, kind: 'settlement', at: action.vertex });

      const v = parseVertexKey(action.vertex);
      const around = vertexAdjacentHexes(v);

      // Die zweite Siedlung bringt sofort Ertrag.
      const n = s.order.length;
      if (phase.step >= n) {
        for (const h of around) {
          const tile = tileAt(world, h.q, h.r);
          if (!tile) continue;
          const res = TERRAIN_RESOURCE[tile.terrain];
          if (res === null) continue;
          if (s.bank[res] <= 0) continue;
          s.bank[res] -= 1;
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
      if (actorPlayer.pieces.roads <= 0) return fail('Keine Strassen mehr.');

      s.roads[action.edge] = actor;
      actorPlayer.pieces.roads -= 1;
      events.push({ t: 'build', player: actor, kind: 'road', at: action.edge });

      const e = parseEdgeKey(action.edge);
      const added = grow(s, world, edgeEndpoints(e).flatMap(vertexAdjacentHexes));
      if (added.length) events.push({ t: 'chunks', coords: added });

      const step = phase.step + 1;
      if (step >= 2 * s.order.length) {
        // Aufbau vorbei: der erste Spieler beginnt.
        s.current = 0;
        s.turn = 1;
        s.phase = { t: 'roll' };
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
      const rng = new Rng(s.rngState);
      const dice: [number, number] = [1 + rng.int(6), 1 + rng.int(6)];
      s.rngState = rng.getState();
      s.lastRoll = dice;
      const sum = dice[0] + dice[1];
      events.push({ t: 'roll', player: actor, dice });

      if (sum === 7) {
        const pending = playersMustDiscard(s);
        if (pending.length > 0) s.phase = { t: 'discard', pending };
        else enterRobber(s, 'dice', 'main');
      } else {
        const { payout, shortfall } = computeProduction(s, world, sum);
        for (const [pid, gain] of Object.entries(payout)) {
          const p = playerById(s, pid);
          if (!p) continue;
          for (const r of RESOURCES) {
            p.hand[r] += gain[r];
            s.bank[r] -= gain[r];
          }
        }
        events.push({ t: 'production', payout, shortfall });
        s.phase = { t: 'main' };
      }
      break;
    }

    case 'discard': {
      if (phase.t !== 'discard') return fail('Jetzt wird nicht abgeworfen.');
      if (!phase.pending.includes(actor)) return fail('Du musst nichts abwerfen.');
      const need = discardCount(s, actor);
      let given = 0;
      for (const r of RESOURCES) {
        const n = action.cards[r] ?? 0;
        if (n < 0) return fail('Negative Anzahl.');
        if (n > actorPlayer.hand[r]) return fail('So viele Karten hast du nicht.');
        given += n;
      }
      if (given !== need) return fail(`Du musst genau ${need} Karten abwerfen.`);

      for (const r of RESOURCES) {
        const n = action.cards[r] ?? 0;
        actorPlayer.hand[r] -= n;
        s.bank[r] += n;
      }
      events.push({ t: 'discard', player: actor, count: need });

      const rest = phase.pending.filter((id) => id !== actor);
      if (rest.length > 0) s.phase = { t: 'discard', pending: rest };
      else enterRobber(s, 'dice', 'main');
      break;
    }

    case 'moveRobber': {
      if (phase.t !== 'moveRobber') return fail('Der Raeuber ist gerade nicht dran.');
      const why = canMoveRobber(s, world, action.hex);
      if (why) return fail(why);

      s.robber = action.hex;
      events.push({ t: 'robber', player: actor, hex: action.hex });

      const candidates = stealCandidatesServer(s, action.hex, actor);
      if (action.victim !== undefined) {
        if (!candidates.includes(action.victim)) return fail('Dort ist nichts zu holen.');
        const victim = playerById(s, action.victim)!;
        const rng = new Rng(s.rngState);
        const stolen = takeRandomCard(rng, victim.hand);
        s.rngState = rng.getState();
        if (stolen) {
          actorPlayer.hand[stolen] += 1;
          events.push({ t: 'steal', from: action.victim, to: actor, resource: stolen });
        }
      } else if (candidates.length > 0) {
        return fail('Du musst einen Spieler zum Bestehlen waehlen.');
      }

      s.phase = phase.returnTo === 'roll' ? { t: 'roll' } : { t: 'main' };
      break;
    }

    // --- Bauen ---
    case 'buildRoad': {
      const inRoadBuilding = phase.t === 'roadBuilding';
      if (phase.t !== 'main' && !inRoadBuilding) return fail('Jetzt kann nicht gebaut werden.');
      const why = canPlaceRoad(s, world, actor, action.edge);
      if (why) return fail(why);
      if (actorPlayer.pieces.roads <= 0) return fail('Keine Strassen mehr.');
      if (!inRoadBuilding && !canAfford(actorPlayer.hand, COST_ROAD)) {
        return fail('Zu wenig Rohstoffe fuer eine Strasse.');
      }

      if (!inRoadBuilding) pay(actorPlayer.hand, s.bank, COST_ROAD);
      s.roads[action.edge] = actor;
      actorPlayer.pieces.roads -= 1;
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
          actorPlayer.pieces.roads > 0 &&
          legalRoadEdges(s, world, actor).length > 0;
        s.phase = canStillBuild ? { t: 'roadBuilding', remaining } : { t: 'main' };
      }
      break;
    }

    case 'buildSettlement': {
      if (phase.t !== 'main') return fail('Jetzt kann nicht gebaut werden.');
      const why = canPlaceSettlement(s, world, actor, action.vertex, { setup: false });
      if (why) return fail(why);
      if (actorPlayer.pieces.settlements <= 0) return fail('Keine Siedlungen mehr.');
      if (!canAfford(actorPlayer.hand, COST_SETTLEMENT)) {
        return fail('Zu wenig Rohstoffe fuer eine Siedlung.');
      }

      pay(actorPlayer.hand, s.bank, COST_SETTLEMENT);
      s.buildings[action.vertex] = { owner: actor, type: 'settlement' };
      actorPlayer.pieces.settlements -= 1;
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
      if (actorPlayer.pieces.cities <= 0) return fail('Keine Staedte mehr.');
      if (!canAfford(actorPlayer.hand, COST_CITY)) {
        return fail('Zu wenig Rohstoffe fuer eine Stadt.');
      }

      pay(actorPlayer.hand, s.bank, COST_CITY);
      s.buildings[action.vertex] = { owner: actor, type: 'city' };
      actorPlayer.pieces.cities -= 1;
      actorPlayer.pieces.settlements += 1; // die Siedlung kommt zurueck in den Vorrat
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
      pay(actorPlayer.hand, s.bank, COST_DEV);
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
      s.devPlayedThisTurn = true;
      events.push({ t: 'playDev', player: actor, card: 'knight' });

      const holder = largestArmyHolder(s);
      if (holder !== s.largestArmy && holder !== null) {
        s.largestArmy = holder;
        events.push({ t: 'largestArmy', player: holder });
      }
      enterRobber(s, 'knight', phase.t === 'roll' ? 'roll' : 'main');
      checkWin(s, events);
      break;
    }

    case 'playRoadBuilding': {
      if (phase.t !== 'main') return fail('Jetzt ist keine Karte spielbar.');
      const why = devPlayGuard(s, actorPlayer, 'roadBuilding');
      if (why) return fail(why);

      actorPlayer.dev[findPlayableDev(s, actorPlayer, 'roadBuilding')]!.played = true;
      s.devPlayedThisTurn = true;
      events.push({ t: 'playDev', player: actor, card: 'roadBuilding' });

      const possible = Math.min(2, actorPlayer.pieces.roads);
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
      for (const r of RESOURCES) {
        if ((want[r] ?? 0) > s.bank[r]) return fail('Die Bank hat davon nicht genug.');
      }

      actorPlayer.dev[findPlayableDev(s, actorPlayer, 'yearOfPlenty')]!.played = true;
      s.devPlayedThisTurn = true;
      for (const r of RESOURCES) {
        const n = want[r] ?? 0;
        s.bank[r] -= n;
        actorPlayer.hand[r] += n;
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
      s.devPlayedThisTurn = true;
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
      s.bank[action.give] += ratio;
      s.bank[action.receive] -= 1;
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

    case 'endTurn': {
      if (phase.t !== 'main') return fail('Der Zug laesst sich jetzt nicht beenden.');
      nextTurn(s);
      events.push({ t: 'turn', player: s.order[s.current]! });
      break;
    }

    default: {
      const never: never = action;
      return fail('Unbekannte Aktion: ' + JSON.stringify(never));
    }
  }

  game.state = s;
  return { ok: true, events };
}

/** Handkartenzahl - fuer Anzeige und Redaktion. */
export { handSize };
