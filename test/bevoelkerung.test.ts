/** Bevoelkerung (core/bevoelkerung.ts): Wachstum, Verluste, Stadt und Ritter. */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import { bevoelkerungRunde, einwohnerAbgleichen, einwohnerVerlieren, einwohnerVon } from '../src/core/bevoelkerung';
import { parseVertexKey, vertexAdjacentHexes } from '../src/core/coords';

function mitDorf() {
  const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77, 15, { ereignisse: true });
  const vk = [...g.world.tiles.values()].filter((t) => t.terrain !== 'water').map((t) => `${t.q}:${t.r}:N`)[3]!;
  g.state.buildings = { [vk]: { owner: 'p0', type: 'settlement' } };
  g.state.phase = { t: 'main' };
  einwohnerAbgleichen(g.state);
  return { g, vk };
}

describe('Bevoelkerung', () => {
  it('ein neues Dorf hat einen Einwohner und waechst bis 3', () => {
    const { g, vk } = mitDorf();
    expect(einwohnerVon(g.state, vk)).toBe(1);
    for (let i = 0; i < 4; i++) bevoelkerungRunde(g.state, g.world, []);
    expect(einwohnerVon(g.state, vk)).toBe(3);
  });

  it('eine Pluenderung kostet einen, aber nie den letzten', () => {
    const { g, vk } = mitDorf();
    g.state.einwohner = { [vk]: 2 };
    const h = vertexAdjacentHexes(parseVertexKey(vk))[0]!;
    einwohnerVerlieren(g.state, 'p0', h.q, h.r, 1, []);
    expect(einwohnerVon(g.state, vk)).toBe(1);
    einwohnerVerlieren(g.state, 'p0', h.q, h.r, 1, []);
    expect(einwohnerVon(g.state, vk)).toBe(1);
  });

  it('Stadt nur mit 2 Einwohnern, Ritter kosten einen', () => {
    const { g, vk } = mitDorf();
    g.state.players[0]!.hand = { lumber: 0, brick: 0, wool: 5, grain: 5, ore: 5 };
    expect(applyAction(g, { t: 'buildCity', vertex: vk }, 'p0').ok).toBe(false);
    g.state.einwohner = { [vk]: 3 };
    expect(applyAction(g, { t: 'recruitKnight' }, 'p0').ok).toBe(true);
    expect(einwohnerVon(g.state, vk)).toBe(2);
    expect(applyAction(g, { t: 'buildCity', vertex: vk }, 'p0').ok).toBe(true);
  });
});
