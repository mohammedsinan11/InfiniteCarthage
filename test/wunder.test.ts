/** Weltwunder (core/wunder.ts). */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame, wunderHindernis } from '../src/core/rules/reducer';
import { HEIMAT_ABSTAND, WUNDER, heimatStaette, wunderAt, COST_WUNDER } from '../src/core/wunder';
import { hexDistance, hexKey, hexVertices, vertexKey } from '../src/core/coords';
import { publicPoints } from '../src/core/state';
import { tradeRatio } from '../src/core/rules/trade';
import { raidLoss } from '../src/core/rules/raid';
import { ensureGenerated } from '../src/core/world';
import { botsSpielen } from '../src/core/bot';
import { findPlayableSeed } from '../src/core/worldgen';

describe('Wunderstaetten', () => {
  it('eine liegt immer auf dem Ring um den Start, auf Land, und traegt ein Wunder', () => {
    for (let roh = 1; roh < 40; roh++) {
      const seed = findPlayableSeed(roh);
      const h = heimatStaette(seed)!;
      expect(h).not.toBeNull();
      expect(Math.abs(hexDistance(h, { q: 0, r: 0 }) - HEIMAT_ABSTAND)).toBeLessThanOrEqual(2);
      expect(wunderAt(seed, h.q, h.r)).not.toBeNull();
    }
  });

  it('in der Ferne selten, nahe dem Start ausser der einen keine', () => {
    let nah = 0;
    let fern = 0;
    for (let q = -40; q <= 40; q++) {
      for (let r = -40; r <= 40; r++) {
        if (!wunderAt(7, q, r)) continue;
        if (hexDistance({ q, r }, { q: 0, r: 0 }) <= HEIMAT_ABSTAND + 3) nah++;
        else fern++;
      }
    }
    expect(nah).toBe(1);
    expect(fern).toBeGreaterThan(0);
    expect(fern).toBeLessThan(40);
  });
});

describe('Ein Wunder bauen', () => {
  function mitDorfAnStaette() {
    const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77);
    const h = heimatStaette(g.state.worldSeed)!;
    ensureGenerated(g.world, h, 2);
    g.state.phase = { t: 'main' };
    g.state.turn = 3;
    g.state.buildings = { [vertexKey(hexVertices(h.q, h.r)[0]!)]: { owner: 'p0', type: 'settlement' } };
    return { g, h };
  }

  it('braucht ein Gebaeude an der Staette und die Kosten, dann Punkte und Wirkung', () => {
    const { g, h } = mitDorfAnStaette();
    expect(wunderHindernis(g.state, g.world, 'p0', h.q, h.r)).toBeNull();
    expect(applyAction(g, { t: 'buildWonder', q: h.q, r: h.r }, 'p0').ok).toBe(false); // zu arm
    for (const [r, n] of Object.entries(COST_WUNDER)) g.state.players[0]!.hand[r as 'ore'] = n!;
    const vorher = publicPoints(g.state, 'p0');
    const res = applyAction(g, { t: 'buildWonder', q: h.q, r: h.r }, 'p0');
    expect(res.ok).toBe(true);
    const art = wunderAt(g.state.worldSeed, h.q, h.r)!;
    expect(g.state.wunder![hexKey(h.q, h.r)]!.art).toBe(art);
    expect(publicPoints(g.state, 'p0')).toBe(vorher + WUNDER[art].punkte);
    // Nur einmal je Staette.
    expect(wunderHindernis(g.state, g.world, 'p0', h.q, h.r)).toMatch(/schon/);
  });

  it('ohne eigenes Gebaeude daneben geht es nicht', () => {
    const { g, h } = mitDorfAnStaette();
    g.state.buildings = {};
    expect(wunderHindernis(g.state, g.world, 'p0', h.q, h.r)).toMatch(/Dorf oder eine Stadt/);
  });

  it('Kothon handelt 3:1, Koloss schuetzt vor Pluenderern', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77);
    g.state.wunder = { x: { owner: 'p0', art: 'kothon', seit: 1 }, y: { owner: 'p0', art: 'koloss', seit: 1 } };
    expect(tradeRatio(g.state, g.world, 'p0', 'lumber')).toBeLessThanOrEqual(3);
    g.state.players[0]!.hand.lumber = 6;
    expect(raidLoss(g.state, 'p0', 2)).toBe(0);
  });

  it('Bots spielen mit Wunderstaetten weiter, ohne haengen zu bleiben', () => {
    const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 5, 6, 0, { haeuser: true, ereignisse: true, rundenLimit: 80 });
    botsSpielen(g, () => true, 30000);
    expect(g.state.phase.t).toBe('finished');
  });
});
