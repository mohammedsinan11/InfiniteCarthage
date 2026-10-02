/** Heldenpfad (core/heldenpfad.ts, rules/pfad.ts): Ziele, Proben, Stufen, Relikte. */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { GameEvent } from '../src/core/rules/reducer';
import { BEGEGNUNGEN, RELIKTE, heldStufeVon, pfadZiele, probeBonus } from '../src/core/heldenpfad';
import { heldWachsen, relikteBeiFall } from '../src/core/rules/pfad';
import { ereignisById } from '../src/core/ereignis';
import { cardById } from '../src/core/cards/catalog';
import { wirkungenVon } from '../src/core/cards/wirkung';

const sammeln = () => {
  const ev: GameEvent[] = [];
  return { ev, push: (...e: GameEvent[]) => ev.push(...e) };
};

describe('Heldenpfad', () => {
  it('Begegnungen sind als Ereignis lesbar, Relikte als Karte', () => {
    for (const b of BEGEGNUNGEN) expect(ereignisById(b.id)).toBe(b);
    for (const r of RELIKTE) expect(cardById(r.id)?.kind).toBe('ausruestung');
  });

  it('hoechstens drei Ziele: Ruine, Lager, Orte', () => {
    const z = pfadZiele(1, 5, 0, { q: 3, r: 0 }, { q: -4, r: 2, name: 'Die Nattern' }, [{ q: 6, r: -2 }, { q: 1, r: 7 }]);
    expect(z.map((x) => x.art)).toEqual(['ruine', 'lager', 'ort']);
    expect(z[1]!.gefahr).toBe(3);
  });

  it('Stufen aus Erfahrung, Bonus aus Stufe und Eigenschaft', () => {
    expect(heldStufeVon(0)).toBe(0);
    expect(heldStufeVon(3)).toBe(1);
    expect(heldStufeVon(12)).toBe(3);
    expect(probeBonus(2, ['mutig'], 'mut')).toBe(4);
    expect(probeBonus(2, ['mutig'], 'klugheit')).toBe(2);
  });

  it('ein Aufstieg bietet Eigenschaften an, die Wahl nimmt eine', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 3, 4, 15, { ereignisse: true });
    g.state.phase = { t: 'main' };
    const p = g.state.players[0]!;
    heldWachsen(g.state, p, 3, sammeln());
    expect(p.eigenschaftAngebot).toHaveLength(3);
    const wahl = p.eigenschaftAngebot![0]!;
    expect(applyAction(g, { t: 'eigenschaftWaehlen', id: wahl }, 'p0').ok).toBe(true);
    expect(g.state.players[0]!.eigenschaften).toEqual([wahl]);
    expect(g.state.players[0]!.eigenschaftAngebot).toBeNull();
  });

  it('Relikte wirken ohne Platz; faellt der Held, bleibt nur eines', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 3, 4, 15, { ereignisse: true });
    const p = g.state.players[0]!;
    p.equipment = ['relikt_siegel', 'relikt_amulett', 'relikt_chronik'];
    const m = wirkungenVon(g.state, 'p0');
    expect(m.tradeDiscount).toBe(1);
    expect(m.schutz).toBe(1);
    expect(m.punkte).toBe(1);
    const e = sammeln();
    relikteBeiFall(p, e);
    expect(p.equipment).toEqual(['relikt_siegel']);
    expect(e.ev[0]).toMatchObject({ t: 'relikteVerloren', anzahl: 2 });
  });

  it('eine Begegnung mit Probe wird aufgeloest und bringt Erfahrung', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 3, 4, 15, { ereignisse: true });
    g.state.phase = { t: 'ereignis' };
    g.state.ereignis = { id: 'b_einsiedler', player: 'p0' };
    const r = applyAction(g, { t: 'answerEvent', wahl: 0 }, 'p0');
    expect(r.ok).toBe(true);
    const ev = r.ok ? r.events.find((x) => x.t === 'eventResolved') : undefined;
    expect(ev && 'probe' in ev && ev.probe).toBeTruthy();
    // 1 fuer die Begegnung, dazu 1 oder 3 aus der Probe.
    expect([2, 4]).toContain(g.state.players[0]!.heldXp);
  });
});
