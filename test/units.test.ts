/**
 * Einheiten auf der Karte: wer in Nestern haust und wo Wachen stehen.
 */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { nestAt } from '../src/core/raiders';
import { hexDistance, hexesInRange, vertexKey } from '../src/core/coords';
import { terrainAt } from '../src/core/worldgen';
import { MAX_JE_FELD, guardUnits, nestOccupants, nestUnits } from '../src/core/units';

const ORIGIN = { q: 0, r: 0 };
const solo = () => createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15);

describe('Bewohner der Nester', () => {
  it('sind rein und zwei bis drei Koepfe stark', () => {
    for (const h of hexesInRange(ORIGIN, 30)) {
      if (!nestAt(2024, h.q, h.r)) continue;
      const a = nestOccupants(2024, h.q, h.r);
      expect(nestOccupants(2024, h.q, h.r)).toEqual(a);
      expect(a.count).toBeGreaterThanOrEqual(2);
      expect(a.count).toBeLessThanOrEqual(3);
    }
  });

  it('sind mal Raeuber, mal Goblins', () => {
    const arten = new Set<string>();
    for (const seed of [2024, 7, 31337]) {
      for (const h of hexesInRange(ORIGIN, 40)) {
        if (nestAt(seed, h.q, h.r)) arten.add(nestOccupants(seed, h.q, h.r).kind);
      }
    }
    expect([...arten].sort()).toEqual(['goblin', 'raeuber']);
  });

  it('stehen nur auf Nestern', () => {
    const einheiten = nestUnits(2024, hexesInRange(ORIGIN, 25));
    expect(einheiten.length).toBeGreaterThan(0);
    for (const u of einheiten) expect(nestAt(2024, u.q, u.r)).toBe(true);
  });
});

describe('Wachen auf der Karte', () => {
  const landOhneNest = (seed: number, ab: { q: number; r: number }, radius: number) =>
    hexesInRange(ab, radius).find(
      (h) => terrainAt(seed, h.q, h.r) !== 'water' && !nestAt(seed, h.q, h.r),
    );

  it('stellt so viele Figuren auf, wie Wachen stehen', () => {
    const s = solo().state;
    const land = landOhneNest(s.worldSeed, ORIGIN, 12)!;
    s.buildings[vertexKey({ q: land.q, r: land.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    s.players[0]!.guards = 5;
    const einheiten = guardUnits(s);
    expect(einheiten).toHaveLength(5);
    expect(einheiten.every((u) => u.kind === 'ritter' && u.owner === 'p0')).toBe(true);
  });

  it('steht an der eigenen Siedlung, an Land, hoechstens drei je Feld', () => {
    const s = solo().state;
    const land = landOhneNest(s.worldSeed, ORIGIN, 12)!;
    s.buildings[vertexKey({ q: land.q, r: land.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    s.players[0]!.guards = MAX_JE_FELD;
    const je = new Map<string, number>();
    for (const u of guardUnits(s)) {
      expect(terrainAt(s.worldSeed, u.q, u.r)).not.toBe('water');
      expect(hexDistance(u, land)).toBeLessThanOrEqual(1);
      je.set(u.q + ':' + u.r, (je.get(u.q + ':' + u.r) ?? 0) + 1);
    }
    for (const n of je.values()) expect(n).toBeLessThanOrEqual(MAX_JE_FELD);
  });

  it('stellt sich zuerst dorthin, woher die Gefahr kommt', () => {
    const s = solo().state;
    const seed = s.worldSeed;
    const nest = hexesInRange(ORIGIN, 30).find((h) => nestAt(seed, h.q, h.r))!;
    const nah = hexesInRange(nest, 2).find(
      (h) => hexDistance(h, nest) === 2 && terrainAt(seed, h.q, h.r) !== 'water' && !nestAt(seed, h.q, h.r),
    );
    const fern = hexesInRange(ORIGIN, 40).find(
      (h) =>
        terrainAt(seed, h.q, h.r) !== 'water' &&
        hexesInRange(h, 5).every((c) => !nestAt(seed, c.q, c.r)),
    );
    expect(nah).toBeDefined();
    expect(fern).toBeDefined();
    s.buildings[vertexKey({ q: fern!.q, r: fern!.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    s.buildings[vertexKey({ q: nah!.q, r: nah!.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    s.players[0]!.guards = 1;
    const [posten] = guardUnits(s);
    expect(hexDistance(posten!, nest)).toBeLessThanOrEqual(3);
  });

  it('ohne Siedlung keine Wachfigur', () => {
    const s = solo().state;
    s.players[0]!.guards = 2;
    expect(guardUnits(s)).toEqual([]);
  });
});
