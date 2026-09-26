/** Einstieg: Mangelhilfe (rules/hilfe.ts). */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { erzeugteSorten, fehlendeSorten, mangelHilfe } from '../src/core/rules/hilfe';
import { hexVertices, vertexKey } from '../src/core/coords';
import { RESOURCES, TERRAIN_RESOURCE } from '../src/core/types';

function mitDorfAn(terrain: string) {
  const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77);
  const feld = [...g.world.tiles.values()].find((t) => t.terrain === terrain && t.number !== null)!;
  // Eine Ecke, deren Nachbarfelder moeglichst wenig anderes liefern, ist nicht
  // noetig: gezaehlt wird nur, was mindestens erzeugt wird.
  g.state.buildings = { [vertexKey(hexVertices(feld.q, feld.r)[0]!)]: { owner: 'p0', type: 'settlement' } };
  return g;
}

describe('Mangelhilfe', () => {
  it('kennt die Sorten, die die eigenen Gebaeude erzeugen', () => {
    const g = mitDorfAn('forest');
    expect(erzeugteSorten(g.state, g.world, 'p0').has('lumber')).toBe(true);
    const fehlt = fehlendeSorten(g.state, g.world, 'p0');
    expect(fehlt).not.toContain('lumber');
    expect(fehlt.length).toBeGreaterThan(0);
  });

  it('gibt je grosser Runde eine fehlende Sorte, reihum', () => {
    const g = mitDorfAn('forest');
    const fehlt = fehlendeSorten(g.state, g.world, 'p0');
    const bekommen: string[] = [];
    for (const turn of [6, 11, 16, 21]) {
      g.state.turn = turn;
      const ev: { t: string; resource?: string }[] = [];
      mangelHilfe(g.state, g.world, ev);
      expect(ev).toHaveLength(1);
      bekommen.push(ev[0]!.resource!);
    }
    for (const r of bekommen) expect(fehlt).toContain(r);
    if (fehlt.length > 1) expect(new Set(bekommen).size).toBeGreaterThan(1);
  });

  it('wer alles erzeugt, bekommt nichts; wer nichts besitzt, auch nicht', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77);
    const ev: unknown[] = [];
    mangelHilfe(g.state, g.world, ev as never);
    expect(ev).toHaveLength(0);
    // Ein Dorf an jeder Sorte.
    const b: Record<string, { owner: string; type: 'settlement' }> = {};
    for (const r of RESOURCES) {
      const t = [...g.world.tiles.values()].find((x) => TERRAIN_RESOURCE[x.terrain] === r && x.number !== null)!;
      b[vertexKey(hexVertices(t.q, t.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    }
    g.state.buildings = b;
    mangelHilfe(g.state, g.world, ev as never);
    expect(ev).toHaveLength(0);
  });
});

import { productionSources } from '../src/core/rules/production';
import { hexKey } from '../src/core/coords';

describe('Jahreszeiten', () => {
  function menge(terrain: string, turn: number): number {
    const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77);
    const t = [...g.world.tiles.values()].find((x) => x.terrain === terrain && x.number !== null)!;
    g.state.buildings = { [vertexKey(hexVertices(t.q, t.r)[0]!)]: { owner: 'p0', type: 'city' } };
    g.state.turn = turn;
    return productionSources(g.state, g.world, t.number!)
      .filter((q) => q.hex === hexKey(t.q, t.r))
      .reduce((n, q) => n + q.amount, 0);
  }
  it('Fruehling: Weiden +1, Herbst: Felder +1, Winter: Felder halb', () => {
    expect(menge('pasture', 1)).toBe(3); // Stadt 2 + Fruehling 1
    expect(menge('pasture', 16)).toBe(2); // Sommer
    expect(menge('field', 31)).toBe(3); // Herbst
    expect(menge('field', 46)).toBe(1); // Winter: 2 halb
  });
});

describe('Durststrecke', () => {
  it('hilft nach DURST_GRENZE Wuerfen ohne Ertrag mit der knappsten Sorte', async () => {
    const { durstLindern, DURST_GRENZE } = await import('../src/core/rules/hilfe');
    const g = mitDorfAn('forest');
    g.state.ereignisseAn = true;
    const p = g.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 3;
    p.hand.ore = 0;
    const ev: { t: string; resource?: string; grund?: string }[] = [];
    for (let i = 0; i < DURST_GRENZE - 1; i++) durstLindern(g.state, {}, ev);
    expect(ev).toHaveLength(0);
    durstLindern(g.state, {}, ev);
    expect(ev).toEqual([{ t: 'aid', player: 'p0', resource: 'ore', grund: 'durst' }]);
    expect(p.hand.ore).toBe(1);
    expect(g.state.durst?.p0).toBe(0);
  });

  it('ein Ertrag setzt die Zaehlung zurueck; ohne Ereignisse gilt die Regel nicht', async () => {
    const { durstLindern, DURST_GRENZE } = await import('../src/core/rules/hilfe');
    const g = mitDorfAn('forest');
    g.state.ereignisseAn = true;
    const ev: unknown[] = [];
    for (let i = 0; i < DURST_GRENZE - 1; i++) durstLindern(g.state, {}, ev as never);
    const gain = Object.fromEntries(RESOURCES.map((r) => [r, r === 'lumber' ? 1 : 0])) as Record<(typeof RESOURCES)[number], number>;
    durstLindern(g.state, { p0: gain }, ev as never);
    expect(g.state.durst?.p0).toBe(0);
    g.state.ereignisseAn = false;
    for (let i = 0; i < DURST_GRENZE + 2; i++) durstLindern(g.state, {}, ev as never);
    expect(ev).toHaveLength(0);
  });
});

describe('Bankkurs erklaert', () => {
  it('nennt Zoellner und Karte, wenn sie den Kurs aendern', async () => {
    const { tradeRatioErklaert } = await import('../src/core/rules/trade');
    const g = mitDorfAn('forest');
    g.state.omens = ['zoellner'];
    g.state.players[0]!.activeCards = ['markttag'];
    const { ratio, gruende } = tradeRatioErklaert(g.state, g.world, 'p0', 'lumber');
    expect(ratio).toBe(4);
    expect(gruende.some((x) => x.startsWith('Karte'))).toBe(true);
    expect(gruende.some((x) => x.startsWith('Zoellner'))).toBe(true);
  });
});
