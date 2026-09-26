/** Balance: Markt, steigender Bankkurs im selben Zug, billigerer Tribut. */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import { tradeRatio } from '../src/core/rules/trade';
import { tributKarten } from '../src/core/rules/diplomatie';

function partie(ereignisse = true) {
  const g = createGame([{ id: 'p0', name: 'S' }], 1, 2, 15, { ereignisse });
  g.state.phase = { t: 'main' };
  g.state.turn = 8;
  g.state.omens = [];
  g.state.players[0]!.haus = null;
  g.state.players[0]!.hand = { lumber: 0, brick: 0, wool: 20, grain: 3, ore: 0 };
  return g;
}

describe('Balance', () => {
  it('jeder weitere Bankhandel im selben Zug kostet mehr - im naechsten Zug wieder normal', () => {
    const g = partie();
    const erst = tradeRatio(g.state, g.world, 'p0', 'wool');
    applyAction(g, { t: 'bankTrade', give: 'wool', receive: 'ore' }, 'p0');
    expect(tradeRatio(g.state, g.world, 'p0', 'wool')).toBe(erst + 1);
    applyAction(g, { t: 'bankTrade', give: 'wool', receive: 'ore' }, 'p0');
    expect(tradeRatio(g.state, g.world, 'p0', 'wool')).toBe(erst + 2);
    g.state.turn = 9;
    expect(tradeRatio(g.state, g.world, 'p0', 'wool')).toBe(erst);
  });

  it('der Markt: drei Karten vom groessten Stapel gegen eine Kartenwahl, einmal je Zug', () => {
    const g = partie();
    const r = applyAction(g, { t: 'visitMarket' }, 'p0');
    expect(r.ok).toBe(true);
    expect(g.state.players[0]!.hand.wool).toBe(17);
    expect(g.state.phase.t).toBe('draft');
    g.state.phase = { t: 'main' };
    expect(applyAction(g, { t: 'visitMarket' }, 'p0').ok).toBe(false);
  });

  it('alte Partien kennen weder Markt noch Aufschlag', () => {
    const g = partie(false);
    const erst = tradeRatio(g.state, g.world, 'p0', 'wool');
    applyAction(g, { t: 'bankTrade', give: 'wool', receive: 'ore' }, 'p0');
    expect(tradeRatio(g.state, g.world, 'p0', 'wool')).toBe(erst);
    expect(applyAction(g, { t: 'visitMarket' }, 'p0').ok).toBe(false);
  });

  it('Tribut: eine Karte je drei Siegpunkte, dazu eine', () => {
    const g = partie();
    g.state.buildings = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`v${i}`, { owner: 'p0', type: 'city' as const }]));
    expect(tributKarten(g.state, 'p0')).toBe(1 + Math.floor(8 / 3));
  });
});
