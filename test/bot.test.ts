/** Bots (core/bot.ts): spielen ohne Blockade, bauen und machen Punkte. */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import { botsSpielen } from '../src/core/bot';
import { totalPoints } from '../src/core/state';

describe('Bots', () => {
  it('drei Bots spielen ein Jahr mit Haeusern und Ereignissen, ohne haengen zu bleiben', () => {
    const g = createGame(
      [
        { id: 'b1', name: 'Hanno' },
        { id: 'b2', name: 'Dido' },
        { id: 'b3', name: 'Magon' },
      ],
      1234,
      5678,
      0,
      { haeuser: true, ereignisse: true, rundenLimit: 60, omens: ['reiche_adern', 'zoellner'] },
    );
    const ereignisse = botsSpielen(g, () => true, 20000);
    expect(g.state.phase.t).toBe('finished');
    expect(g.state.turn).toBe(60);
    const punkte = g.state.order.map((id) => totalPoints(g.state, id));
    // Jeder Bot baut ueber den Aufbau hinaus.
    for (const p of punkte) expect(p).toBeGreaterThanOrEqual(2);
    expect(Math.max(...punkte)).toBeGreaterThanOrEqual(4);
    expect(ereignisse.length).toBeGreaterThan(100);
  });

  it('bleibt stehen, wenn ein Mensch am Zug ist', () => {
    const g = createGame(
      [
        { id: 'mensch', name: 'M' },
        { id: 'b1', name: 'Hanno' },
      ],
      1,
      2,
      0,
      { haeuser: true },
    );
    botsSpielen(g, (id) => id !== 'mensch');
    // Der Bot hat sein Haus gewaehlt, der Mensch noch nicht.
    expect(g.state.phase.t).toBe('hauswahl');
    expect(g.state.players.find((p) => p.id === 'b1')!.haus).toBeTruthy();
    expect(g.state.players.find((p) => p.id === 'mensch')!.haus).toBeNull();
  });
});

import { koopZiel } from '../src/core/rules/reducer';

describe('Gemeinsam', () => {
  it('am Ende entscheidet die Summe: alle gewinnen oder keiner', () => {
    const g = createGame(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      31,
      32,
      0,
      { haeuser: true, ereignisse: true, rundenLimit: 60, koop: true },
    );
    botsSpielen(g, () => true, 30000);
    expect(g.state.phase.t).toBe('finished');
    const e = g.state.koopErgebnis!;
    expect(e.ziel).toBe(koopZiel(g.state));
    expect(e.summe).toBe(g.state.order.reduce((n, id) => n + totalPoints(g.state, id), 0));
    expect(g.state.phase.t === 'finished' && g.state.phase.winner !== null).toBe(e.erfolg);
  });

  it('kennt kein Einzelziel', () => {
    const g = createGame([{ id: 'a', name: 'A' }], 1, 2, 3, { koop: true, rundenLimit: 60 });
    g.state.buildings = { x: { owner: 'a', type: 'city' }, y: { owner: 'a', type: 'city' } };
    g.state.phase = { t: 'main' };
    g.state.turn = 5;
    const r = applyAction(g, { t: 'buyDev' }, 'a');
    void r;
    expect(g.state.phase.t).not.toBe('finished');
  });
});
