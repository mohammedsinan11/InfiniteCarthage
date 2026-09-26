/** Siegwege (core/siegwege.ts): gewinnen ohne die Siegpunkte. */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import { SIEGWEGE, schwelle, siegwegeAn } from '../src/core/siegwege';

function partie(ziel: number, ereignisse = true) {
  const g = createGame([{ id: 'p0', name: 'S' }], 1, 2, ziel, { ereignisse });
  g.state.phase = { t: 'main' };
  g.state.turn = 12;
  g.state.players[0]!.hand.wool = 8;
  return g;
}

describe('Siegwege', () => {
  it('Schwellen wachsen mit dem Ziel, Wunder nicht', () => {
    const erob = SIEGWEGE.find((w) => w.id === 'eroberer')!;
    const wund = SIEGWEGE.find((w) => w.id === 'wunderbauer')!;
    expect(schwelle(erob, 20)).toBe(5);
    expect(schwelle(erob, 60)).toBe(15);
    expect(schwelle(wund, 60)).toBe(2);
  });

  it('wer genug Lager zerstoert hat, gewinnt als Eroberer', () => {
    const g = partie(20);
    expect(siegwegeAn(g.state)).toBe(true);
    g.state.chronik!.stats.p0 = { ...(g.state.chronik!.stats.p0 ?? ({} as never)), lager: 5 } as never;
    const r = applyAction(g, { t: 'bankTrade', give: 'wool', receive: 'ore' }, 'p0');
    expect(r.ok).toBe(true);
    expect(g.state.phase).toMatchObject({ t: 'finished', winner: 'p0', durch: 'ziel', weg: 'eroberer' });
  });

  it('gelten nicht ohne Ziel, nicht gemeinsam und nicht in alten Partien', () => {
    expect(siegwegeAn(partie(0).state)).toBe(false);
    expect(siegwegeAn(partie(20, false).state)).toBe(false);
    const g = partie(20);
    g.state.koop = true;
    expect(siegwegeAn(g.state)).toBe(false);
  });
});
