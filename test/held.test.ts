/**
 * Der Held: tritt nach dem Aufbau an, zieht schneller, fuehrt Ritter, erkundet
 * Ruinen ohne Hinterhalt und kehrt nach seinem Fall zurueck.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { HELD_RUECKKEHR, heldenRunde, spawnHeld, tickArmy } from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { legalRoadEdges, legalSettlementVertices } from '../src/core/rules/placement';
import { hexDistance, hexKey, hexesInRange, vertexKey } from '../src/core/coords';
import { einheitVorlage, isLandAt } from '../src/core/units';
import { nestAt } from '../src/core/raiders';
import { ruinAt } from '../src/core/ruins';
import type { UnitState } from '../src/core/state';

const ORIGIN = { q: 0, r: 0 };
const solo = (geheim = 4711): Game => createGame([{ id: 'p0', name: 'Solo' }], 2024, geheim, 15);

function must(game: Game, action: Parameters<typeof applyAction>[1]) {
  const res = applyAction(game, action, 'p0');
  if (!res.ok) throw new Error(res.error);
  return res.events;
}

function landFlaeche(game: Game, radius: number) {
  const seed = game.state.worldSeed;
  const h = hexesInRange(ORIGIN, 20).find((c) =>
    hexesInRange(c, radius).every(
      (x) => isLandAt(seed, x.q, x.r) && !nestAt(seed, x.q, x.r) && !ruinAt(seed, x.q, x.r),
    ),
  );
  if (!h) throw new Error('keine freie Landflaeche');
  return h;
}

function einheit(game: Game, u: Omit<UnitState, 'id'>): UnitState {
  const neu = { ...u, id: game.state.nextUnitId++ };
  game.state.units.push(neu);
  return neu;
}

describe('Der Held', () => {
  it('tritt fuer jeden Spieler an, sobald der Aufbau vorbei ist', () => {
    const game = solo();
    for (let i = 0; i < 2; i++) {
      const v = legalSettlementVertices(game.state, game.world, 'p0', { setup: true })[0]!;
      must(game, { t: 'placeSettlement', vertex: v });
      const e = legalRoadEdges(game.state, game.world, 'p0', v)[0]!;
      const events = must(game, { t: 'placeRoad', edge: e });
      if (i === 1) expect(events.some((x) => x.t === 'heroReady')).toBe(true);
    }
    const helden = game.state.units.filter((u) => u.kind === 'held');
    expect(helden).toHaveLength(1);
    expect(helden[0]!.owner).toBe('p0');
    expect(spawnHeld(game.state, 'p0', [])).toBeNull();
  });

  it('zieht zwei Felder je Runde, und sein Gefolge zieht mit', () => {
    const game = solo();
    const mitte = landFlaeche(game, 4);
    const ziel = { q: mitte.q + 4, r: mitte.r };
    const held = einheit(game, { ...einheitVorlage('held', mitte.q, mitte.r, { owner: 'p0' }), ziel });
    const ritter = einheit(game, { ...einheitVorlage('ritter', mitte.q, mitte.r, { owner: 'p0' }), folgt: held.id });
    game.state.turn = 1;
    tickArmy(game.state, game.world, []);
    expect(hexDistance(held, ziel)).toBe(2);
    expect(hexKey(ritter.q, ritter.r)).toBe(hexKey(held.q, held.r));
  });

  it('folgen geht nur mit eigenem Helden auf der Karte', () => {
    const game = solo();
    const mitte = landFlaeche(game, 1);
    game.state.phase = { t: 'main' };
    const ritter = einheit(game, einheitVorlage('ritter', mitte.q, mitte.r, { owner: 'p0' }));
    expect(applyAction(game, { t: 'follow', unit: ritter.id, follow: true }, 'p0').ok).toBe(false);
    const held = einheit(game, einheitVorlage('held', mitte.q + 1, mitte.r, { owner: 'p0' }));
    must(game, { t: 'follow', unit: ritter.id, follow: true });
    expect(game.state.units.find((u) => u.id === ritter.id)!.folgt).toBe(held.id);
    // Ein eigener Befehl loest aus dem Gefolge.
    must(game, { t: 'orderUnit', unit: ritter.id, q: mitte.q, r: mitte.r });
    expect(game.state.units.find((u) => u.id === ritter.id)!.folgt).toBeNull();
  });

  it('geraet in Ruinen nie in einen Hinterhalt', () => {
    const seed = solo().state.worldSeed;
    const ruine = hexesInRange(ORIGIN, 40).find((h) => ruinAt(seed, h.q, h.r))!;
    for (let geheim = 1; geheim <= 40; geheim++) {
      const game = solo(geheim);
      einheit(game, einheitVorlage('held', ruine.q, ruine.r, { owner: 'p0' }));
      const events: ArmyEvent[] = [];
      tickArmy(game.state, game.world, events);
      const e = events.find((x) => x.t === 'ruin');
      expect(e).toMatchObject({ t: 'ruin', held: true });
      expect(e && e.t === 'ruin' && e.result).not.toBe('hinterhalt');
    }
  });

  it('faellt er, kehrt er nach einigen Runden an einer Siedlung zurueck', () => {
    const game = solo();
    const s = game.state;
    const mitte = landFlaeche(game, 3);
    s.buildings[vertexKey({ q: mitte.q, r: mitte.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    const held = einheit(game, { ...einheitVorlage('held', mitte.q + 2, mitte.r, { owner: 'p0' }), leben: 1 });
    for (let i = 0; i < 3; i++) {
      einheit(game, { ...einheitVorlage('raeuber', held.q, held.r, { fraktion: 'f:99:99', auftrag: 'heimkehr' }), leben: 60 });
    }
    let gefallen: ArmyEvent | undefined;
    for (let i = 0; i < 60 && !gefallen; i++) {
      const events: ArmyEvent[] = [];
      tickArmy(s, game.world, events);
      gefallen = events.find((e) => e.t === 'heroFell');
    }
    expect(gefallen).toMatchObject({ t: 'heroFell', zurueck: s.turn + HELD_RUECKKEHR });
    expect(s.players[0]!.heldZurueck).toBe(s.turn + HELD_RUECKKEHR);

    s.units = [];
    heldenRunde(s, []);
    expect(s.units).toHaveLength(0);
    s.turn += HELD_RUECKKEHR;
    const events: ArmyEvent[] = [];
    heldenRunde(s, events);
    expect(s.units.filter((u) => u.kind === 'held')).toHaveLength(1);
    expect(s.players[0]!.heldZurueck).toBeNull();
    expect(events).toMatchObject([{ t: 'heroReady', zurueck: true }]);
  });
});
