/** Vorhaben (core/vorhaben.ts): selbst gewaehlte Ziele fuer eine Jahreszeit. */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import { VORHABEN_FRIST, vorhabenRunde } from '../src/core/vorhaben';

function partie() {
  const g = createGame([{ id: 'p0', name: 'S' }], 1, 2, 20, { ereignisse: true });
  g.state.phase = { t: 'main' };
  g.state.turn = 6;
  return g;
}

describe('Vorhaben', () => {
  it('bietet drei verschiedene an, eines wird angenommen und belohnt', () => {
    const g = partie();
    const ev: { t: string }[] = [];
    vorhabenRunde(g.state, ev as never);
    const angebot = g.state.vorhaben!.p0!.angebot;
    expect(new Set(angebot).size).toBe(3);
    expect(ev.some((e) => e.t === 'ambitionOffered')).toBe(true);

    // "Marktherr" erzwingen: handeln ist leicht zu pruefen.
    g.state.vorhaben!.p0!.angebot = ['markt', 'wege', 'siedler'];
    expect(applyAction(g, { t: 'chooseAmbition', id: 'markt' }, 'p0').ok).toBe(true);
    expect(g.state.vorhaben!.p0!.aktiv!.bis).toBe(6 + VORHABEN_FRIST);
    const ruhm = g.state.players[0]!.ruhm;
    g.state.players[0]!.hand.wool = 40;
    let r;
    for (let i = 0; i < 5; i++) r = applyAction(g, { t: 'bankTrade', give: 'wool', receive: 'ore' }, 'p0');
    if (!r || !r.ok) throw new Error('Handel abgelehnt');
    expect(r.events.some((e) => e.t === 'ambitionDone')).toBe(true);
    expect(g.state.players[0]!.ruhm).toBe(ruhm + 2);
    expect(g.state.vorhaben!.p0!.aktiv).toBeNull();
  });

  it('verfaellt nach einer Jahreszeit; ohne Ereignisse gibt es keine', () => {
    const g = partie();
    vorhabenRunde(g.state, []);
    const id = g.state.vorhaben!.p0!.angebot[0]!;
    applyAction(g, { t: 'chooseAmbition', id }, 'p0');
    g.state.turn = 6 + VORHABEN_FRIST + 1;
    const ev: { t: string }[] = [];
    vorhabenRunde(g.state, ev as never);
    expect(ev.map((e) => e.t)).toEqual(['ambitionFailed', 'ambitionOffered']);

    const alt = createGame([{ id: 'p0', name: 'S' }], 1, 2, 20);
    vorhabenRunde(alt.state, []);
    expect(alt.state.vorhaben).toBeUndefined();
  });
});
