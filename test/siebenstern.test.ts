/** Siebenstern: eine 7 ohne Fund darf die Partie nicht im Wurf haengen lassen (Spieltest 15). */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame, wuerfelFuer } from '../src/core/rules/reducer';

describe('Siebenstern', () => {
  it('nach einer 7 ohne Fund geht es in die Bauphase', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 3, 4, 15);
    let turn = 1;
    while (wuerfelFuer(g.state.secretSeed, turn).reduce((a, b) => a + b, 0) !== 7) turn += 1;
    g.state.turn = turn;
    g.state.phase = { t: 'roll' };
    g.state.players[0]!.krone = 'siebenstern';
    const r = applyAction(g, { t: 'roll' }, 'p0');
    expect(r.ok).toBe(true);
    expect(g.state.phase.t).toBe('main');
    expect(g.state.draft).toBeNull();
  });
});
