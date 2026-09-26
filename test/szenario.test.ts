/** Szenarien (core/szenario.ts). */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import { SZENARIEN, sterneFuer, szenarioById } from '../src/core/szenario';
import { gueltigeOmen } from '../src/core/omen';
import { botsSpielen } from '../src/core/bot';

describe('Szenarien', () => {
  it('haben gueltige Omen, sinnvolle Fristen und Sterne', () => {
    expect(new Set(SZENARIEN.map((s) => s.id)).size).toBe(SZENARIEN.length);
    for (const s of SZENARIEN) {
      expect(gueltigeOmen(s.omens)).toEqual(s.omens);
      expect(s.sterne[0]).toBeLessThanOrEqual(s.sterne[1]);
      expect(s.sterne[1]).toBeLessThanOrEqual(s.runden);
    }
    const g = szenarioById('gruendung')!;
    expect(sterneFuer(g, 10)).toBe(3);
    expect(sterneFuer(g, 30)).toBe(2);
    expect(sterneFuer(g, 44)).toBe(1);
  });

  it('createGame uebernimmt Omen und Frist des Szenarios', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 1, 2, 30, { szenario: 'wunder' });
    expect(g.state.szenario).toBe('wunder');
    expect(g.state.rundenLimit).toBe(45);
    expect(g.state.targetPoints).toBe(0);
    expect(g.state.omens).toEqual(['reiche_adern']);
  });

  it('endet, sobald das Ziel erreicht ist - mit Sternen', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 1, 2, 0, { szenario: 'gruendung' });
    g.state.phase = { t: 'main' };
    g.state.turn = 12;
    g.state.buildings = {
      a: { owner: 'p0', type: 'city' },
      b: { owner: 'p0', type: 'city' },
      c: { owner: 'p0', type: 'city' },
      d: { owner: 'p0', type: 'city' },
    };
    // Eine beliebige gelungene Aktion loest die Pruefung aus.
    g.state.players[0]!.hand.wool = 4;
    const r = applyAction(g, { t: 'bankTrade', give: 'wool', receive: 'ore' }, 'p0');
    expect(r.ok).toBe(true);
    expect(g.state.phase).toEqual({ t: 'finished', winner: 'p0', durch: 'ziel' });
    expect(g.state.szenarioErgebnis).toEqual({ erreicht: true, runde: 12, sterne: 3 });
  });

  it('verfehlt bei Fristablauf, wenn das Ziel fehlt', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 3, 4, 0, { szenario: 'wunder', haeuser: false });
    botsSpielen(g, () => true, 20000);
    expect(g.state.phase.t).toBe('finished');
    expect(g.state.szenarioErgebnis).not.toBeNull();
    if (!g.state.szenarioErgebnis!.erreicht) {
      expect(g.state.phase.t === 'finished' && g.state.phase.winner).toBeNull();
      expect(g.state.turn).toBe(45);
    }
  });
});
