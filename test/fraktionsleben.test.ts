/** Fraktionsleben (core/fraktionsleben.ts): Nachfolger, Beute, Stimmung. */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { ERSTARKT_AB, VERHASST, erstarkt, fraktionIn, fraktionsLeben, stimmungVon } from '../src/core/fraktionsleben';
import { fraktionById } from '../src/core/factions';
import { verhandeln } from '../src/core/rules/diplomatie';

const ID = 'f:1:2';

function partie() {
  const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77, 15, { ereignisse: true });
  g.state.phase = { t: 'main' };
  return g;
}

describe('Fraktionsleben', () => {
  it('heimgebrachte Beute macht stark', () => {
    const g = partie();
    fraktionsLeben(g.state, [{ t: 'homecoming', fraktion: ID, count: ERSTARKT_AB }], []);
    expect(erstarkt(g.state, ID)).toBe(true);
  });

  it('ein Anfuehrer faellt irgendwann mit seinen Lagern - der Nachfolger hat ein anderes Wesen', () => {
    const g = partie();
    const alt = fraktionById(g.state.worldSeed, ID);
    const ev: { t: string; neu?: string }[] = [];
    for (let t = 1; t < 40 && ev.length === 0; t++) {
      g.state.turn = t;
      fraktionsLeben(g.state, [{ t: 'nestDestroyed', fraktion: ID, players: ['p0'], q: t, r: 0 }], ev as never);
    }
    expect(ev[0]?.t).toBe('chiefChanged');
    const neu = fraktionIn(g.state, ID);
    expect(neu.anfuehrer).not.toBe(alt.anfuehrer);
    expect(neu.wesen).not.toBe(alt.wesen);
  });

  it('wer Lager zerstoert, ist verhasst - und bekommt keinen Frieden mehr; Tribut versoehnt', () => {
    const g = partie();
    const raeuber = Array.from({ length: 30 }, (_, i) => `f:${i}:0`).find((id) => fraktionById(g.state.worldSeed, id).art === 'raeuber')!;
    for (let i = 0; i < 2; i++) fraktionsLeben(g.state, [{ t: 'nestDestroyed', fraktion: raeuber, players: ['p0'], q: 0, r: 0 }], []);
    expect(stimmungVon(g.state, raeuber, 'p0')).toBeLessThanOrEqual(VERHASST);
    g.state.players[0]!.hand = { lumber: 0, brick: 0, wool: 5, grain: 5, ore: 5 };
    expect(verhandeln(g.state, 'p0', raeuber, 'frieden', [])).toMatch(/trauen dir nicht/);
    fraktionsLeben(g.state, [{ t: 'tribute', fraktion: raeuber, player: 'p0' }], []);
    expect(stimmungVon(g.state, raeuber, 'p0')).toBe(-3);
  });

  it('ohne Ereignisse aendert sich nichts', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77, 15);
    fraktionsLeben(g.state, [{ t: 'homecoming', fraktion: ID, count: 50 }], []);
    expect(g.state.fraktionen).toBeUndefined();
  });
});
