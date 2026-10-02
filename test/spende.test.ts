/** Spenden: ein Abfluss fuer den Ueberschuss (rules/reducer.ts, SPENDE_KARTEN). */

import { describe, it, expect } from 'vitest';
import { SPENDE_KARTEN, applyAction, createGame } from '../src/core/rules/reducer';
import { handSize } from '../src/core/state';

describe('Spenden', () => {
  it('nimmt fuenf Karten von den groessten Stapeln und gibt 1 Ruhm', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 3, 4, 15);
    g.state.phase = { t: 'main' };
    const p = g.state.players[0]!;
    p.hand = { lumber: 0, brick: 1, wool: 0, grain: 8, ore: 0 };
    const ruhm = p.ruhm;
    expect(applyAction(g, { t: 'spenden' }, 'p0').ok).toBe(true);
    const q = g.state.players[0]!;
    expect(handSize(q.hand)).toBe(9 - SPENDE_KARTEN);
    expect(q.hand.grain).toBe(3);
    expect(q.ruhm).toBe(ruhm + 1);
    q.hand = { lumber: 1, brick: 1, wool: 1, grain: 1, ore: 0 };
    expect(applyAction(g, { t: 'spenden' }, 'p0').ok).toBe(false);
  });
});
