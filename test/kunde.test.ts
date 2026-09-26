/** Kunde aus dem Land (core/kunde.ts): der Bericht zum Wechsel der Jahreszeit. */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { kundeFortschreiben, kundeSchreiben } from '../src/core/kunde';
import { botsSpielen } from '../src/core/bot';

describe('Kunde aus dem Land', () => {
  it('fasst die Jahreszeit zusammen und leert das Buch', () => {
    const g = createGame([{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bert' }], 4242, 77, 15, { ereignisse: true });
    kundeFortschreiben(g.state, [
      { t: 'production', payout: { a: { lumber: 3, brick: 0, wool: 0, grain: 0, ore: 0 }, b: { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 } } },
      { t: 'march', parties: [{}, {}] },
      { t: 'plunder', player: 'b', count: 4 },
      { t: 'nestDestroyed', fraktion: 'f:1:2', players: ['a'], q: 0, r: 0 },
    ]);
    const b = kundeSchreiben(g.state, 16)!;
    expect(b.saison).toBe('spring');
    const text = b.zeilen.join(' ');
    expect(text).toMatch(/reichste Ernte fuhr Anna/);
    expect(text).toMatch(/2 Raubzuege zogen/);
    expect(text).toMatch(/Bert mit 4 Karten/);
    expect(text).toMatch(/Anna zerstoerte ein Lager/);
    expect(text).toMatch(/Sommer/);
    expect(g.state.berichte).toHaveLength(1);
    expect(g.state.saisonBuch!.raubzuege).toBe(0);
  });

  it('im Spiel kommt zum Wechsel der Jahreszeit ein Bericht', () => {
    const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 31, 32, 0, { haeuser: true, ereignisse: true, rundenLimit: 40 });
    const alle = botsSpielen(g, () => true, 20000).flat();
    expect(alle.filter((e) => e.t === 'seasonReport').length).toBeGreaterThanOrEqual(1);
    expect(g.state.berichte!.length).toBeGreaterThanOrEqual(1);
  });
});
