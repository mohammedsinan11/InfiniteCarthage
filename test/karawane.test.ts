/** Karawanen (core/karawane.ts). */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { karawaneAngekommen, karawanenRunde } from '../src/core/karawane';
import { botsSpielen } from '../src/core/bot';
import { isLandAt } from '../src/core/units';
import { edgeEndpoints, hexEdges, vertexAdjacentHexes, vertexKey } from '../src/core/coords';
import type { Vertex } from '../src/core/coords';
import { handelsLohn, handelsstrasseNeu, laengsteRoute } from '../src/core/handelswege';
import type { Game } from '../src/core/rules/reducer';

/** Eine Kette von Strassen ab einer Ecke - jede Kante fuehrt zu einer neuen Ecke. */
function strassenKette(g: Game, start: Vertex, n: number): { ecken: Vertex[]; kanten: string[] } {
  const ecken = [start];
  const kanten: string[] = [];
  const gesehen = new Set([vertexKey(start)]);
  for (let i = 0; i < n; i++) {
    const v = ecken[ecken.length - 1]!;
    const vk = vertexKey(v);
    let weiter: { kante: string; ecke: Vertex } | null = null;
    for (const h of vertexAdjacentHexes(v)) {
      for (const e of hexEdges(h.q, h.r)) {
        const [a, b] = edgeEndpoints(e);
        const anders = vertexKey(a) === vk ? b : vertexKey(b) === vk ? a : null;
        if (!anders || gesehen.has(vertexKey(anders))) continue;
        if (!vertexAdjacentHexes(anders).every((x) => isLandAt(g.state.worldSeed, x.q, x.r))) continue;
        weiter = { kante: `${e.q}:${e.r}:${e.e}`, ecke: anders };
        break;
      }
      if (weiter) break;
    }
    if (!weiter) break;
    gesehen.add(vertexKey(weiter.ecke));
    ecken.push(weiter.ecke);
    kanten.push(weiter.kante);
  }
  return { ecken, kanten };
}

describe('Karawanen', () => {
  it('zieht nur zwischen Siedlungen, die eine Strasse verbindet, und bringt mehr, je laenger der Weg', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77, 15, { ereignisse: true });
    const land = [...g.world.tiles.values()].filter((t) => isLandAt(g.state.worldSeed, t.q, t.r));
    // Eine Strasse von acht Stuecken, Ecke fuer Ecke ueber Land.
    const start: Vertex = { q: land[0]!.q, r: land[0]!.r, d: 'N' };
    const kette = strassenKette(g, start, 8);
    expect(kette.ecken.length).toBe(9);
    const erste = vertexKey(kette.ecken[0]!);
    const letzte = vertexKey(kette.ecken[8]!);
    g.state.buildings = { [erste]: { owner: 'p0', type: 'settlement' }, [letzte]: { owner: 'p0', type: 'settlement' } };
    const neu: unknown[] = [];
    const ev: { t: string }[] = [];
    // Ohne Strasse keine Karawane.
    karawanenRunde(g.state, ev as never, (u) => neu.push(u));
    expect(neu).toHaveLength(0);

    g.state.roads = Object.fromEntries(kette.kanten.map((k) => [k, 'p0']));
    expect(laengsteRoute(g.state, 'p0')!.laenge).toBe(8);
    karawanenRunde(g.state, ev as never, (u) => neu.push(u));
    expect(neu).toHaveLength(1);
    expect(ev[0]!.t).toBe('caravanSet');

    const u = { ...(neu[0] as object), id: 1 } as Parameters<typeof karawaneAngekommen>[1];
    g.state.players[0]!.hand = { lumber: 5, brick: 5, wool: 0, grain: 5, ore: 0 };
    const ziel = u.ziel;
    karawaneAngekommen(g.state, u, ev as never);
    // Acht Strassen: 1 + 8/4 = 3 Karten, die knappsten zuerst.
    expect(handelsLohn(8)).toBe(3);
    const h = g.state.players[0]!.hand;
    expect(h.wool + h.ore).toBe(2);
    expect(h.lumber + h.brick + h.wool + h.grain + h.ore).toBe(15 + 3);
    expect(u.heimat).toBe(`${ziel!.q}:${ziel!.r}`);
    // Und der Titel: ab fuenf Strassen die Handelsstrasse.
    expect(handelsstrasseNeu(g.state)).toBe('p0');
  });

  it('im Spiel kommen Karawanen an', () => {
    const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], 22, 23, 15, { ereignisse: true, rundenLimit: 120 });
    const ev = botsSpielen(g, () => true, 40000).flat();
    expect(ev.some((e) => e.t === 'caravanSet')).toBe(true);
    expect(ev.some((e) => e.t === 'caravanArrived')).toBe(true);
  });
});
