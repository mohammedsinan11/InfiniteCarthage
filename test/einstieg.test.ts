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
