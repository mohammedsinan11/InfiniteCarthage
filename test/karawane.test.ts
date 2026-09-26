/** Karawanen (core/karawane.ts). */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { karawaneAngekommen, karawanenRunde } from '../src/core/karawane';
import { botsSpielen } from '../src/core/bot';
import { isLandAt } from '../src/core/units';
import { hexDistance } from '../src/core/coords';

describe('Karawanen', () => {
  it('bricht zwischen zwei fernen Siedlungen auf und bringt die knappsten Sorten', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77, 15, { ereignisse: true });
    const land = [...g.world.tiles.values()].filter((t) => isLandAt(g.state.worldSeed, t.q, t.r));
    const a = land[0]!;
    const b = land.find((t) => hexDistance(t, a) >= 6)!;
    g.state.buildings = { [`${a.q}:${a.r}:N`]: { owner: 'p0', type: 'settlement' }, [`${b.q}:${b.r}:N`]: { owner: 'p0', type: 'settlement' } };
    const neu: unknown[] = [];
    const ev: { t: string }[] = [];
    karawanenRunde(g.state, ev as never, (u) => neu.push(u));
    expect(neu).toHaveLength(1);
    expect(ev[0]!.t).toBe('caravanSet');

    const u = { ...(neu[0] as object), id: 1 } as Parameters<typeof karawaneAngekommen>[1];
    g.state.players[0]!.hand = { lumber: 5, brick: 5, wool: 0, grain: 5, ore: 0 };
    const ziel = u.ziel;
    karawaneAngekommen(g.state, u, ev as never);
    expect(g.state.players[0]!.hand.wool + g.state.players[0]!.hand.ore).toBe(2);
    expect(u.heimat).toBe(`${ziel!.q}:${ziel!.r}`);
  });

  it('im Spiel kommen Karawanen an', () => {
    const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 31, 32, 15, { haeuser: true, ereignisse: true, rundenLimit: 60 });
    const ev = botsSpielen(g, () => true, 40000).flat();
    expect(ev.some((e) => e.t === 'caravanSet')).toBe(true);
  });
});
