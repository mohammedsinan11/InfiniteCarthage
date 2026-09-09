import { describe, it, expect } from 'vitest';
import { applyAction, createGame, rebuildWorld } from '../src/core/rules/reducer';
import type { Action, Game } from '../src/core/rules/reducer';
import {
  legalRoadEdges,
  legalSettlementVertices,
  canPlaceSettlement,
  edgeBuildable,
} from '../src/core/rules/placement';
import { currentPlayerId, playerById, totalPoints, handSize } from '../src/core/state';
import type { Hand, PlayerId } from '../src/core/state';
import { redactStateFor, redactEventsFor } from '../src/core/redact';
import { tradeRatio } from '../src/core/rules/trade';
import { discardCount, stealCandidatesServer } from '../src/core/rules/robber';
import { RESOURCES } from '../src/core/types';
import type { Resource } from '../src/core/types';
import { vertexNeighborVertices, parseVertexKey, vertexKey, hexEdges, edgeKey } from '../src/core/coords';

const NAMES = ['Anna', 'Bert', 'Cem', 'Dana'];

function newGame(n = 3, worldSeed = 1, secretSeed = 42): Game {
  return createGame(
    Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: NAMES[i]! })),
    worldSeed,
    secretSeed,
  );
}

function must(game: Game, action: Action, actor: PlayerId) {
  const r = applyAction(game, action, actor);
  if (!r.ok) throw new Error(`${action.t} scheiterte: ${r.error}`);
  return r;
}

/** Aufbauphase automatisch durchspielen: immer der erste legale Zug. */
function runSetup(game: Game): void {
  let guard = 0;
  while (game.state.phase.t === 'setup') {
    if (guard++ > 100) throw new Error('Aufbau endet nicht');
    const p = currentPlayerId(game.state);
    const ph = game.state.phase;
    if (ph.awaiting === 'settlement') {
      const vs = legalSettlementVertices(game.state, game.world, p, { setup: true });
      expect(vs.length).toBeGreaterThan(0);
      must(game, { t: 'placeSettlement', vertex: vs[0]! }, p);
    } else {
      const es = legalRoadEdges(game.state, game.world, p, ph.lastVertex ?? undefined);
      expect(es.length).toBeGreaterThan(0);
      must(game, { t: 'placeRoad', edge: es[0]! }, p);
    }
  }
}

function give(game: Game, pid: PlayerId, res: Partial<Hand>): void {
  const p = playerById(game.state, pid)!;
  for (const r of RESOURCES) {
    const n = res[r] ?? 0;
    p.hand[r] += n;
    game.state.bank[r] -= n;
  }
}

describe('Aufbauphase', () => {
  it('laeuft als Schlange: 0,1,2,2,1,0', () => {
    const game = newGame(3);
    // Je Aufbauschritt (Siedlung + Strasse) festhalten, wer ihn ausgefuehrt hat.
    const perStep: PlayerId[] = [];
    let guard = 0;
    while (game.state.phase.t === 'setup') {
      if (guard++ > 100) throw new Error('Aufbau endet nicht');
      const ph = game.state.phase;
      const p = currentPlayerId(game.state);
      if (ph.awaiting === 'settlement') {
        perStep[ph.step] = p;
        const vs = legalSettlementVertices(game.state, game.world, p, { setup: true });
        must(game, { t: 'placeSettlement', vertex: vs[0]! }, p);
      } else {
        // Dieselbe Person muss auch die Strasse dieses Schritts setzen.
        expect(p).toBe(perStep[ph.step]);
        const es = legalRoadEdges(game.state, game.world, p, ph.lastVertex ?? undefined);
        must(game, { t: 'placeRoad', edge: es[0]! }, p);
      }
    }
    expect(perStep).toEqual(['p0', 'p1', 'p2', 'p2', 'p1', 'p0']);
  });

  it('endet mit je zwei Siedlungen und zwei Strassen und Spieler 0 am Zug', () => {
    const game = newGame(3);
    runSetup(game);
    expect(game.state.phase.t).toBe('roll');
    expect(currentPlayerId(game.state)).toBe('p0');
    for (const p of game.state.players) {
      expect(p.pieces.settlements).toBe(3); // 5 - 2
      expect(p.pieces.roads).toBe(13); // 15 - 2
    }
    expect(Object.keys(game.state.buildings)).toHaveLength(6);
    expect(Object.keys(game.state.roads)).toHaveLength(6);
  });

  it('bringt erst die zweite Siedlung Rohstoffe', () => {
    const game = newGame(3);
    // Erste Runde: nach den ersten drei Siedlungen darf niemand Karten haben.
    for (let i = 0; i < 3; i++) {
      const p = currentPlayerId(game.state);
      const vs = legalSettlementVertices(game.state, game.world, p, { setup: true });
      must(game, { t: 'placeSettlement', vertex: vs[0]! }, p);
      const ph = game.state.phase;
      const es = legalRoadEdges(
        game.state,
        game.world,
        p,
        ph.t === 'setup' ? (ph.lastVertex ?? undefined) : undefined,
      );
      must(game, { t: 'placeRoad', edge: es[0]! }, p);
    }
    for (const p of game.state.players) expect(handSize(p.hand)).toBe(0);

    runSetup(game);
    const total = game.state.players.reduce((n, p) => n + handSize(p.hand), 0);
    expect(total).toBeGreaterThan(0);
  });

  it('haelt die Abstandsregel ein', () => {
    const game = newGame(3);
    const p = currentPlayerId(game.state);
    const vs = legalSettlementVertices(game.state, game.world, p, { setup: true });
    must(game, { t: 'placeSettlement', vertex: vs[0]! }, p);

    // Direkt daneben darf nichts stehen.
    for (const n of vertexNeighborVertices(parseVertexKey(vs[0]!))) {
      const why = canPlaceSettlement(game.state, game.world, p, vertexKey(n), { setup: true });
      expect(why).toBe('Zu nah an einer anderen Siedlung.');
    }
  });

  it('verlangt, dass die Aufbaustrasse an der neuen Siedlung liegt', () => {
    const game = newGame(3);
    const p = currentPlayerId(game.state);
    const vs = legalSettlementVertices(game.state, game.world, p, { setup: true });
    must(game, { t: 'placeSettlement', vertex: vs[0]! }, p);

    // Eine Kante, die baubar waere, aber nicht an der neuen Siedlung liegt.
    const touching = new Set(legalRoadEdges(game.state, game.world, p, vs[0]!));
    let far: string | undefined;
    for (const t of game.world.tiles.values()) {
      for (const e of hexEdges(t.q, t.r)) {
        const ek = edgeKey(e);
        if (touching.has(ek)) continue;
        if (game.state.roads[ek] !== undefined) continue;
        if (!edgeBuildable(game.world, e)) continue;
        far = ek;
        break;
      }
      if (far) break;
    }
    expect(far).toBeDefined();
    const r = applyAction(game, { t: 'placeRoad', edge: far! }, p);
    expect(r).toEqual({ ok: false, error: 'Die Strasse muss an der neuen Siedlung anliegen.' });
  });
});

describe('Zugablauf', () => {
  it('erlaubt Bauen erst nach dem Wuerfeln', () => {
    const game = newGame(3);
    runSetup(game);
    const r = applyAction(game, { t: 'endTurn' }, 'p0');
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: expect.stringContaining('nicht') });
  });

  it('weist Aktionen von Spielern ab, die nicht am Zug sind', () => {
    const game = newGame(3);
    runSetup(game);
    const r = applyAction(game, { t: 'roll' }, 'p1');
    expect(r).toEqual({ ok: false, error: 'Du bist nicht am Zug.' });
  });

  it('reicht den Zug reihum weiter', () => {
    const game = newGame(3);
    runSetup(game);
    const seen: PlayerId[] = [];
    for (let i = 0; i < 6; i++) {
      const p = currentPlayerId(game.state);
      seen.push(p);
      must(game, { t: 'roll' }, p);
      // Nach einer 7 haengt der Zug in Abwerfen/Raeuber - dann aufloesen.
      resolveSeven(game);
      must(game, { t: 'endTurn' }, p);
    }
    expect(seen).toEqual(['p0', 'p1', 'p2', 'p0', 'p1', 'p2']);
  });

  it('laesst eine fehlgeschlagene Aktion den Zustand unveraendert', () => {
    const game = newGame(3);
    runSetup(game);
    const before = structuredClone(game.state);
    const r = applyAction(game, { t: 'buildCity', vertex: '99:99:N' }, 'p0');
    expect(r.ok).toBe(false);
    expect(game.state).toEqual(before);
  });
});

/** Nach einem Wurf ggf. Abwerfen und Raeuber abarbeiten. */
function resolveSeven(game: Game): void {
  let guard = 0;
  while (game.state.phase.t === 'discard' || game.state.phase.t === 'moveRobber') {
    if (guard++ > 20) throw new Error('Siebener-Phase endet nicht');
    const ph = game.state.phase;
    if (ph.t === 'discard') {
      const pid = ph.pending[0]!;
      const p = playerById(game.state, pid)!;
      let need = discardCount(game.state, pid);
      const cards: Partial<Record<Resource, number>> = {};
      for (const r of RESOURCES) {
        const n = Math.min(need, p.hand[r]);
        if (n > 0) cards[r] = n;
        need -= n;
      }
      must(game, { t: 'discard', cards }, pid);
    } else {
      // Auf ein Feld ohne fremde Gebaeude ziehen, damit kein Opfer noetig ist.
      const cur = currentPlayerId(game.state);
      const target = [...game.world.tiles.values()].find((t) => {
        const k = t.q + ':' + t.r;
        if (k === game.state.robber) return false;
        return stealFree(game, k, cur);
      });
      must(game, { t: 'moveRobber', hex: target!.q + ':' + target!.r }, cur);
    }
  }
}

/**
 * Aktuelle Phase als reiner String.
 *
 * TypeScript verengt game.state.phase.t nach einer Zusicherung und sieht
 * nicht, dass applyAction den Zustand ersetzt. Ueber diesen Umweg bleiben
 * die Laufzeitpruefungen erhalten, ohne dass der Compiler sie fuer
 * unmoeglich haelt.
 */
function phaseOf(game: Game): string {
  return game.state.phase.t;
}

function stealFree(game: Game, hk: string, thief: PlayerId): boolean {
  return stealCandidatesServer(game.state, hk, thief).length === 0;
}

describe('Bauen und Kosten', () => {
  it('zieht Kosten ab und gibt sie der Bank', () => {
    const game = newGame(3);
    runSetup(game);
    must(game, { t: 'roll' }, 'p0');
    resolveSeven(game);
    expect(game.state.phase.t).toBe('main');

    give(game, 'p0', { lumber: 1, brick: 1 });
    const p = playerById(game.state, 'p0')!;
    const before = { ...p.hand };
    const bankBefore = { ...game.state.bank };

    const es = legalRoadEdges(game.state, game.world, 'p0');
    must(game, { t: 'buildRoad', edge: es[0]! }, 'p0');

    const after = playerById(game.state, 'p0')!;
    expect(after.hand.lumber).toBe(before.lumber - 1);
    expect(after.hand.brick).toBe(before.brick - 1);
    expect(game.state.bank.lumber).toBe(bankBefore.lumber + 1);
    expect(after.pieces.roads).toBe(12);
  });

  it('verweigert Bauen ohne Rohstoffe', () => {
    const game = newGame(3);
    runSetup(game);
    must(game, { t: 'roll' }, 'p0');
    resolveSeven(game);
    expect(game.state.phase.t).toBe('main');

    const p = playerById(game.state, 'p0')!;
    for (const r of RESOURCES) p.hand[r] = 0;
    const es = legalRoadEdges(game.state, game.world, 'p0');
    const r = applyAction(game, { t: 'buildRoad', edge: es[0]! }, 'p0');
    expect(r).toEqual({ ok: false, error: 'Zu wenig Rohstoffe fuer eine Strasse.' });
  });

  it('macht aus einer Siedlung eine Stadt und gibt den Stein zurueck', () => {
    const game = newGame(3);
    runSetup(game);
    must(game, { t: 'roll' }, 'p0');
    resolveSeven(game);
    expect(game.state.phase.t).toBe('main');

    give(game, 'p0', { ore: 3, grain: 2 });
    const mine = Object.entries(game.state.buildings).find(([, b]) => b.owner === 'p0')!;
    must(game, { t: 'buildCity', vertex: mine[0] }, 'p0');

    expect(game.state.buildings[mine[0]]!.type).toBe('city');
    const p = playerById(game.state, 'p0')!;
    expect(p.pieces.cities).toBe(3);
    expect(p.pieces.settlements).toBe(4); // die Siedlung kehrt in den Vorrat zurueck
  });
});

describe('Handel mit der Bank', () => {
  it('tauscht ohne Hafen im Verhaeltnis 4:1', () => {
    const game = newGame(3);
    runSetup(game);
    must(game, { t: 'roll' }, 'p0');
    resolveSeven(game);
    expect(game.state.phase.t).toBe('main');

    const p = playerById(game.state, 'p0')!;
    for (const r of RESOURCES) p.hand[r] = 0;
    give(game, 'p0', { lumber: 4 });

    expect(tradeRatio(game.state, game.world, 'p0', 'lumber')).toBeGreaterThanOrEqual(3);
    const ratio = tradeRatio(game.state, game.world, 'p0', 'lumber');
    must(game, { t: 'bankTrade', give: 'lumber', receive: 'ore' }, 'p0');
    expect(playerById(game.state, 'p0')!.hand.lumber).toBe(4 - ratio);
    expect(playerById(game.state, 'p0')!.hand.ore).toBe(1);
  });

  it('lehnt Handel mit zu wenig Karten ab', () => {
    const game = newGame(3);
    runSetup(game);
    must(game, { t: 'roll' }, 'p0');
    resolveSeven(game);
    expect(game.state.phase.t).toBe('main');
    const p = playerById(game.state, 'p0')!;
    for (const r of RESOURCES) p.hand[r] = 0;
    give(game, 'p0', { lumber: 1 });
    const r = applyAction(game, { t: 'bankTrade', give: 'lumber', receive: 'ore' }, 'p0');
    expect(r.ok).toBe(false);
  });
});

describe('Entwicklungskarten', () => {
  /** Wuerfeln und eine eventuelle 7 abarbeiten, bis wirklich gebaut werden darf. */
  function toMain(game: Game, pid: PlayerId) {
    must(game, { t: 'roll' }, pid);
    resolveSeven(game);
    expect(game.state.phase.t).toBe('main');
  }

  it('sind im Kaufzug noch nicht spielbar', () => {
    const game = newGame(3);
    runSetup(game);
    toMain(game, 'p0');
    give(game, 'p0', { ore: 1, wool: 1, grain: 1 });
    must(game, { t: 'buyDev' }, 'p0');

    const p = playerById(game.state, 'p0')!;
    const bought = p.dev[p.dev.length - 1]!;
    if (bought.type === 'knight') {
      const r = applyAction(game, { t: 'playKnight' }, 'p0');
      expect(r).toEqual({ ok: false, error: 'Diese Karte ist erst im naechsten Zug spielbar.' });
    }
  });

  it('erlaubt hoechstens eine Karte pro Zug', () => {
    const game = newGame(3);
    runSetup(game);
    // Zwei Ritter direkt einsetzen, mit einer Kaufrunde in der Vergangenheit.
    const p = playerById(game.state, 'p0')!;
    p.dev.push({ type: 'knight', boughtTurn: 0, played: false });
    p.dev.push({ type: 'knight', boughtTurn: 0, played: false });

    toMain(game, 'p0');
    must(game, { t: 'playKnight' }, 'p0');
    // Raeuber setzen, danach zweiter Ritter -> muss scheitern.
    resolveRobberOnly(game);
    const r = applyAction(game, { t: 'playKnight' }, 'p0');
    expect(r).toEqual({ ok: false, error: 'In diesem Zug wurde schon eine Karte gespielt.' });
  });

  it('vergibt die Groesste Rittermacht ab drei Rittern', () => {
    const game = newGame(3);
    runSetup(game);
    const p = playerById(game.state, 'p0')!;
    p.playedKnights = 2;
    p.dev.push({ type: 'knight', boughtTurn: 0, played: false });

    toMain(game, 'p0');
    expect(game.state.largestArmy).toBeNull();
    must(game, { t: 'playKnight' }, 'p0');
    expect(game.state.largestArmy).toBe('p0');
  });

  it('Monopol zieht allen denselben Rohstoff ab', () => {
    const game = newGame(3);
    runSetup(game);
    const p = playerById(game.state, 'p0')!;
    p.dev.push({ type: 'monopoly', boughtTurn: 0, played: false });
    for (const other of ['p1', 'p2']) {
      const o = playerById(game.state, other)!;
      for (const r of RESOURCES) o.hand[r] = 0;
      o.hand.wool = 3;
    }
    const mineBefore = p.hand.wool;

    toMain(game, 'p0');
    must(game, { t: 'playMonopoly', resource: 'wool' }, 'p0');

    expect(playerById(game.state, 'p0')!.hand.wool).toBe(mineBefore + 6);
    expect(playerById(game.state, 'p1')!.hand.wool).toBe(0);
    expect(playerById(game.state, 'p2')!.hand.wool).toBe(0);
  });

  it('Erfindung nimmt zwei Karten aus der Bank', () => {
    const game = newGame(3);
    runSetup(game);
    const p = playerById(game.state, 'p0')!;
    p.dev.push({ type: 'yearOfPlenty', boughtTurn: 0, played: false });
    toMain(game, 'p0');

    const oreBefore = playerById(game.state, 'p0')!.hand.ore;
    const bankBefore = game.state.bank.ore;
    must(game, { t: 'playYearOfPlenty', a: 'ore', b: 'ore' }, 'p0');
    expect(playerById(game.state, 'p0')!.hand.ore).toBe(oreBefore + 2);
    expect(game.state.bank.ore).toBe(bankBefore - 2);
  });

  it('Strassenbau setzt zwei Strassen ohne Kosten', () => {
    const game = newGame(3);
    runSetup(game);
    const p = playerById(game.state, 'p0')!;
    p.dev.push({ type: 'roadBuilding', boughtTurn: 0, played: false });
    for (const r of RESOURCES) p.hand[r] = 0;
    toMain(game, 'p0');

    const roadsBefore = playerById(game.state, 'p0')!.pieces.roads;
    must(game, { t: 'playRoadBuilding' }, 'p0');
    expect(game.state.phase).toMatchObject({ t: 'roadBuilding', remaining: 2 });

    for (let i = 0; i < 2; i++) {
      if (game.state.phase.t !== 'roadBuilding') break;
      const es = legalRoadEdges(game.state, game.world, 'p0');
      must(game, { t: 'buildRoad', edge: es[0]! }, 'p0');
    }
    expect(game.state.phase.t).toBe('main');
    expect(playerById(game.state, 'p0')!.pieces.roads).toBe(roadsBefore - 2);
    // Nichts bezahlt.
    expect(handSize(playerById(game.state, 'p0')!.hand)).toBe(0);
  });
});

function resolveRobberOnly(game: Game): void {
  if (game.state.phase.t !== 'moveRobber') return;
  const cur = currentPlayerId(game.state);
  const target = [...game.world.tiles.values()].find((t) => {
    const k = t.q + ':' + t.r;
    return k !== game.state.robber && stealFree(game, k, cur);
  })!;
  must(game, { t: 'moveRobber', hex: target.q + ':' + target.r }, cur);
}

describe('Sieg', () => {
  it('endet bei Erreichen der Zielpunkte', () => {
    const game = createGame(
      [
        { id: 'p0', name: 'Anna' },
        { id: 'p1', name: 'Bert' },
      ],
      1,
      42,
      3, // niedriges Ziel, damit der Test kurz bleibt
    );
    runSetup(game);
    must(game, { t: 'roll' }, 'p0');
    resolveSeven(game);
    expect(game.state.phase.t).toBe('main');

    give(game, 'p0', { ore: 3, grain: 2 });
    const mine = Object.entries(game.state.buildings).find(([, b]) => b.owner === 'p0')!;
    must(game, { t: 'buildCity', vertex: mine[0] }, 'p0');

    expect(totalPoints(game.state, 'p0')).toBeGreaterThanOrEqual(3);
    expect(game.state.phase).toEqual({ t: 'finished', winner: 'p0' });
    const r = applyAction(game, { t: 'endTurn' }, 'p0');
    expect(r).toEqual({ ok: false, error: 'Die Partie ist beendet.' });
  });
});

describe('Redaktion', () => {
  it('verbirgt Geheimnisse und fremde Haende', () => {
    const game = newGame(3);
    runSetup(game);
    const p1 = playerById(game.state, 'p1')!;
    for (const r of RESOURCES) p1.hand[r] = 0; // Aufbaukarten beiseite
    give(game, 'p1', { ore: 5 });
    p1.dev.push({ type: 'victoryPoint', boughtTurn: 0, played: false });

    const view = redactStateFor(game.state, 'p0');
    const json = JSON.stringify(view);

    expect(json).not.toContain('secretSeed');
    expect(json).not.toContain('rngState');
    expect(json).not.toContain('"deck"');

    const other = view.players.find((p) => p.id === 'p1')!;
    expect(other.hand).toBeUndefined();
    expect(other.dev).toBeUndefined();
    expect(other.handCount).toBe(5);
    expect(other.devCount).toBe(1);
    // Die verdeckte Siegpunktkarte darf die sichtbaren Punkte nicht verraten.
    expect(other.points).toBe(2);

    const me = view.players.find((p) => p.id === 'p0')!;
    expect(me.hand).toBeDefined();
    expect(me.dev).toBeDefined();
  });

  it('zeigt die geklaute Karte nur Dieb und Bestohlenem', () => {
    const events = [
      { t: 'steal' as const, from: 'p1', to: 'p0', resource: 'ore' as Resource | null },
    ];
    expect(redactEventsFor(events, 'p0')[0]).toMatchObject({ resource: 'ore' });
    expect(redactEventsFor(events, 'p1')[0]).toMatchObject({ resource: 'ore' });
    expect(redactEventsFor(events, 'p2')[0]).toMatchObject({ resource: null });
  });
});

describe('Welt aus Zustand', () => {
  it('rebuildWorld stellt exakt dieselbe Landschaft her', () => {
    const game = newGame(3);
    runSetup(game);
    const again = rebuildWorld(game.state);
    expect(new Set(again.tiles.keys())).toEqual(new Set(game.world.tiles.keys()));
    for (const [k, t] of game.world.tiles) expect(again.tiles.get(k)).toEqual(t);
  });
});

describe('Dauerlauf', () => {
  it('spielt 80 Zuege ohne Blockade und mit gueltiger Buchhaltung', () => {
    const game = newGame(4, 2024, 7);
    runSetup(game);

    for (let turn = 0; turn < 80; turn++) {
      if (phaseOf(game) === 'finished') break;
      const pid = currentPlayerId(game.state);
      must(game, { t: 'roll' }, pid);
      resolveSeven(game);
      if (phaseOf(game) === 'finished') break;
      expect(phaseOf(game)).toBe('main');

      // Bauen, wann immer es geht - sonst passiert nie etwas.
      const p = playerById(game.state, pid)!;
      const es = legalRoadEdges(game.state, game.world, pid);
      if (p.hand.lumber >= 1 && p.hand.brick >= 1 && es.length > 0 && p.pieces.roads > 0) {
        must(game, { t: 'buildRoad', edge: es[0]! }, pid);
      }
      if (phaseOf(game) === 'main') must(game, { t: 'endTurn' }, pid);
    }

    // Buchhaltung: keine negativen Beststaende, Bank plus Haende bleiben im Rahmen.
    for (const p of game.state.players) {
      for (const r of RESOURCES) expect(p.hand[r]).toBeGreaterThanOrEqual(0);
      expect(p.pieces.roads).toBeGreaterThanOrEqual(0);
    }
    for (const r of RESOURCES) {
      expect(game.state.bank[r]).toBeGreaterThanOrEqual(0);
      const inHands = game.state.players.reduce((n, p) => n + p.hand[r], 0);
      expect(game.state.bank[r] + inHands).toBe(19);
    }
  });

  it('laesst die Karte durch Bauen nach aussen wachsen', () => {
    const game = newGame(2, 5, 5);
    runSetup(game);
    const before = game.state.chunks.length;

    // Einem Spieler Strassenmaterial geben und ihn nach aussen bauen lassen.
    for (let i = 0; i < 25; i++) {
      const pid = currentPlayerId(game.state);
      must(game, { t: 'roll' }, pid);
      resolveSeven(game);
      if (phaseOf(game) !== 'main') break;
      give(game, pid, { lumber: 2, brick: 2 });
      const es = legalRoadEdges(game.state, game.world, pid);
      if (es.length > 0) must(game, { t: 'buildRoad', edge: es[es.length - 1]! }, pid);
      must(game, { t: 'endTurn' }, pid);
    }

    expect(game.state.chunks.length).toBeGreaterThan(before);
    // Und der Zustand bleibt die alleinige Wahrheit ueber die Welt.
    const again = rebuildWorld(game.state);
    expect(new Set(again.tiles.keys())).toEqual(new Set(game.world.tiles.keys()));
  });
});
