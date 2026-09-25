/**
 * Einflussbereich, Wachturm abseits der Strasse, und die Palisade (Wand und
 * Tor) - alle drei teilen sich dieselbe Regel (rules/placement.ts,
 * einflussFelder). Die Bewegungssperre der Palisade steht in test/wege.test.ts
 * und test/army.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import {
  canPlaceMauer,
  canPlaceTower,
  einflussFelder,
  legalMauerEdges,
  vertexBuildable,
  vertexInEinfluss,
} from '../src/core/rules/placement';
import { COST_MAUER, COST_TOR } from '../src/core/rules/costs';
import { isLandAt } from '../src/core/units';
import { edgeKey, hexKey, hexesInRange, vertexAdjacentEdges, vertexKey } from '../src/core/coords';
import type { Vertex } from '../src/core/coords';
import { RESOURCES } from '../src/core/types';

const ORIGIN = { q: 0, r: 0 };

function spiel(): Game {
  const game = createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], 2024, 4711, 0);
  game.state.phase = { t: 'main' };
  game.state.turn = 3;
  return game;
}

/** Ein Feld, dessen Nachbarn ebenfalls Land sind. */
function landFeld(game: Game, ab = ORIGIN, radius = 3) {
  const seed = game.state.worldSeed;
  return hexesInRange(ab, radius).find((h) => hexesInRange(h, 1).every((x) => isLandAt(seed, x.q, x.r)))!;
}

/** Die Nordecke eines Feldes - fuer die Tests genuegt eine feste Ecke. */
function eckeVon(h: { q: number; r: number }): Vertex {
  return { q: h.q, r: h.r, d: 'N' };
}

/** Eine Kante an dieser Ecke - index waehlt, welche der drei. */
function kanteVon(h: { q: number; r: number }, index = 0): string {
  return edgeKey(vertexAdjacentEdges(eckeVon(h))[index]!);
}

/** Eine bebaubare Ecke ausserhalb der uebergebenen Felder - egal wie weit. */
function eckeAusserhalb(game: Game, felder: ReadonlySet<string>): Vertex {
  for (const t of game.world.tiles.values()) {
    const v = eckeVon(t);
    if (vertexInEinfluss(felder, v)) continue;
    if (vertexBuildable(game.world, v)) return v;
  }
  throw new Error('keine bebaubare Ecke ausserhalb des Einflussbereichs gefunden');
}

function geben(game: Game, cost: Record<string, number>, pid = 'p0') {
  const p = game.state.players.find((x) => x.id === pid)!;
  for (const r of RESOURCES) p.hand[r] += cost[r] ?? 0;
}

describe('Einflussbereich', () => {
  it('eine Stadt deckt mehr als ein Dorf an derselben Ecke', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(eckeVon(h));
    game.state.buildings[vk] = { owner: 'p0', type: 'settlement' };
    const dorf = einflussFelder(game.state, 'p0');
    expect(dorf.has(hexKey(h.q, h.r))).toBe(true);

    game.state.buildings[vk] = { owner: 'p0', type: 'city' };
    const stadt = einflussFelder(game.state, 'p0');
    // Die Stadt deckt mindestens alles, was das Dorf schon deckte, und mehr.
    for (const f of dorf) expect(stadt.has(f)).toBe(true);
    expect(stadt.size).toBeGreaterThan(dorf.size);
  });

  it('ein eigener Turm erweitert den Einflussbereich, ein fremder nicht', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(eckeVon(h));
    const ohne = einflussFelder(game.state, 'p0');
    game.state.tuerme[vk] = { owner: 'p0', stufe: 1 };
    const mit = einflussFelder(game.state, 'p0');
    expect(mit.size).toBeGreaterThan(ohne.size);

    game.state.tuerme[vk] = { owner: 'p1', stufe: 1 };
    expect(einflussFelder(game.state, 'p0').size).toBe(ohne.size);
  });

  it('vertexInEinfluss stimmt mit einflussFelder ueberein', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(eckeVon(h));
    game.state.buildings[vk] = { owner: 'p0', type: 'settlement' };
    const felder = einflussFelder(game.state, 'p0');
    expect(vertexInEinfluss(felder, eckeVon(h))).toBe(true);
    expect(vertexInEinfluss(felder, { q: h.q + 50, r: h.r, d: 'N' })).toBe(false);
  });
});

describe('Wachturm abseits der Strasse', () => {
  it('darf im eigenen Einflussbereich stehen, auch ohne eigene Strasse an der Ecke', () => {
    const game = spiel();
    const h = landFeld(game);
    const dorfEcke = vertexKey(eckeVon(h));
    game.state.buildings[dorfEcke] = { owner: 'p0', type: 'settlement' };

    const fern = landFeld(game, h, 2);
    const fernEcke = vertexKey(eckeVon(fern));
    if (fernEcke === dorfEcke) return; // zu nah gewaehlt, Testseed-Sonderfall
    expect(canPlaceTower(game.state, game.world, 'p0', fernEcke)).toBe(null);
  });

  it('ausserhalb jedes Einflussbereichs und ohne Strasse geht es nicht', () => {
    const game = spiel();
    const h = landFeld(game);
    const dorfEcke = vertexKey(eckeVon(h));
    game.state.buildings[dorfEcke] = { owner: 'p0', type: 'settlement' };

    const felder = einflussFelder(game.state, 'p0');
    const weitEcke = vertexKey(eckeAusserhalb(game, felder));
    const fehler = canPlaceTower(game.state, game.world, 'p0', weitEcke);
    expect(fehler).not.toBeNull();
    expect(fehler).toContain('Einflussbereich');
  });
});

describe('Palisade (Wand und Tor)', () => {
  it('steht im eigenen Einflussbereich, nicht ausserhalb', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(eckeVon(h));
    game.state.buildings[vk] = { owner: 'p0', type: 'settlement' };

    expect(canPlaceMauer(game.state, game.world, 'p0', kanteVon(h))).toBe(null);

    const felder = einflussFelder(game.state, 'p0');
    const weit = eckeAusserhalb(game, felder);
    expect(canPlaceMauer(game.state, game.world, 'p0', kanteVon(weit))).not.toBeNull();
  });

  it('nicht auf eine Strasse und nicht zweimal auf dieselbe Kante', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(eckeVon(h));
    game.state.buildings[vk] = { owner: 'p0', type: 'settlement' };
    const ek = kanteVon(h);

    game.state.roads[ek] = 'p0';
    expect(canPlaceMauer(game.state, game.world, 'p0', ek)).toContain('Strasse');

    delete game.state.roads[ek];
    game.state.mauern = { [ek]: { owner: 'p0', art: 'wand' } };
    expect(canPlaceMauer(game.state, game.world, 'p0', ek)).toContain('schon eine Palisade');
  });

  it('buildMauer zieht Kosten ab und setzt Wand oder Tor', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(eckeVon(h));
    game.state.buildings[vk] = { owner: 'p0', type: 'settlement' };
    const ek = kanteVon(h, 0);

    geben(game, COST_MAUER);
    const wand = applyAction(game, { t: 'buildMauer', edge: ek, art: 'wand' }, 'p0');
    expect(wand.ok).toBe(true);
    expect(game.state.mauern![ek]).toEqual({ owner: 'p0', art: 'wand' });
    expect(RESOURCES.every((r) => game.state.players[0]!.hand[r] === 0)).toBe(true);
    if (wand.ok) expect(wand.events).toContainEqual({ t: 'build', player: 'p0', kind: 'mauer', at: ek });

    const ek2 = kanteVon(h, 1);
    geben(game, COST_TOR);
    const tor = applyAction(game, { t: 'buildMauer', edge: ek2, art: 'tor' }, 'p0');
    expect(tor.ok).toBe(true);
    expect(game.state.mauern![ek2]).toEqual({ owner: 'p0', art: 'tor' });
    if (tor.ok) expect(tor.events).toContainEqual({ t: 'build', player: 'p0', kind: 'tor', at: ek2 });
  });

  it('ohne genug Rohstoffe oder ausserhalb der Bauphase nicht', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(eckeVon(h));
    game.state.buildings[vk] = { owner: 'p0', type: 'settlement' };
    const ek = kanteVon(h);

    const arm = applyAction(game, { t: 'buildMauer', edge: ek, art: 'wand' }, 'p0');
    expect(arm.ok).toBe(false);

    geben(game, COST_MAUER);
    game.state.phase = { t: 'roll' };
    const falschePhase = applyAction(game, { t: 'buildMauer', edge: ek, art: 'wand' }, 'p0');
    expect(falschePhase.ok).toBe(false);
  });

  it('legalMauerEdges enthaelt genau die erlaubten Kanten', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(eckeVon(h));
    game.state.buildings[vk] = { owner: 'p0', type: 'settlement' };
    const ek = kanteVon(h);
    expect(legalMauerEdges(game.state, game.world, 'p0')).toContain(ek);
    expect(legalMauerEdges(game.state, game.world, 'p1')).not.toContain(ek);
  });
});
