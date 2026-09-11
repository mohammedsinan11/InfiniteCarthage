/**
 * Einheiten: Bewohner der Lager, Wege, Sicht und wo neue Ritter antreten.
 */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { nestAt } from '../src/core/raiders';
import { hexDistance, hexKey, hexesInRange, vertexKey } from '../src/core/coords';
import {
  SICHT_SIEDLUNG,
  einheitVorlage,
  garrisonUnits,
  nestFraktionOf,
  isLandAt,
  knightMusterHex,
  nestOccupants,
  nextStep,
  settlementApproaches,
  sightOf,
} from '../src/core/units';

const ORIGIN = { q: 0, r: 0 };
const solo = () => createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15);

/** Ein Feld, um das im Radius alles Land ist und kein Lager steht. */
function landFlaeche(seed: number, radius: number, ab = ORIGIN, suche = 20) {
  const h = hexesInRange(ab, suche).find((c) =>
    hexesInRange(c, radius).every((x) => isLandAt(seed, x.q, x.r) && !nestAt(seed, x.q, x.r)),
  );
  if (!h) throw new Error(`keine freie Landflaeche mit Radius ${radius}`);
  return h;
}

describe('Bewohner der Lager', () => {
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

  it('schrumpfen mit der Belagerung und verschwinden mit dem Lager', () => {
    const s = solo().state;
    const nest = hexesInRange(ORIGIN, 30).find((h) => nestAt(s.worldSeed, h.q, h.r))!;
    expect(garrisonUnits(s, [nest])).toHaveLength(nestOccupants(s.worldSeed, nest.q, nest.r).count);
    for (const u of garrisonUnits(s, [nest])) {
      expect(u.fraktion).toBe(nestFraktionOf(s, nest.q, nest.r));
    }
    s.nestGarrison[hexKey(nest.q, nest.r)] = 1;
    expect(garrisonUnits(s, [nest])).toHaveLength(1);
    s.destroyedNests.push(hexKey(nest.q, nest.r));
    expect(garrisonUnits(s, [nest])).toHaveLength(0);
  });
});

describe('Wege', () => {
  it('gehen je Schritt auf ein benachbartes Landfeld', () => {
    const seed = solo().state.worldSeed;
    const mitte = landFlaeche(seed, 3);
    const ziel = { q: mitte.q + 3, r: mitte.r };
    const weg = nextStep(seed, mitte, new Set([hexKey(ziel.q, ziel.r)]))!;
    expect(weg).not.toBeNull();
    expect(hexDistance(weg.step, mitte)).toBe(1);
    // Alles Land dazwischen: der kuerzeste Weg kommt dem Ziel mit jedem Schritt naeher.
    expect(hexDistance(weg.step, ziel)).toBe(2);
    expect(weg.ziel).toEqual(ziel);
  });

  it('enden am Ziel', () => {
    const seed = solo().state.worldSeed;
    const mitte = landFlaeche(seed, 1);
    expect(nextStep(seed, mitte, new Set([hexKey(mitte.q, mitte.r)]))).toBeNull();
  });

  it('fuehren nicht uebers Wasser', () => {
    const seed = solo().state.worldSeed;
    const wasser = hexesInRange(ORIGIN, 25).find((h) => !isLandAt(seed, h.q, h.r))!;
    const land = landFlaeche(seed, 1);
    expect(nextStep(seed, land, new Set([hexKey(wasser.q, wasser.r)]), 800)).toBeNull();
  });
});

describe('Sicht', () => {
  it('reicht um Siedlungen drei Felder weit und um Ritter zwei', () => {
    const s = solo().state;
    const land = landFlaeche(s.worldSeed, 1);
    s.buildings[vertexKey({ q: land.q, r: land.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    const sicht = sightOf(s, 'p0');
    expect(sicht.has(hexKey(land.q, land.r))).toBe(true);
    expect(sicht.has(hexKey(land.q + SICHT_SIEDLUNG, land.r))).toBe(true);
    expect(sicht.has(hexKey(land.q + SICHT_SIEDLUNG + 3, land.r))).toBe(false);

    s.units.push({ ...einheitVorlage('ritter', land.q + 12, land.r, { owner: 'p0' }), id: 1 });
    const mitRitter = sightOf(s, 'p0');
    expect(mitRitter.has(hexKey(land.q + 14, land.r))).toBe(true);
    expect(mitRitter.has(hexKey(land.q + 15, land.r))).toBe(false);
  });

  it('gilt nur fuer die eigenen Siedlungen und Einheiten', () => {
    const s = solo().state;
    const land = landFlaeche(s.worldSeed, 1);
    s.buildings[vertexKey({ q: land.q, r: land.r, d: 'N' })] = { owner: 'p1', type: 'settlement' };
    expect(sightOf(s, 'p0').size).toBe(0);
  });
});

describe('Musterung', () => {
  it('stellt neue Ritter an eine eigene Siedlung, auf die Seite der Gefahr', () => {
    const s = solo().state;
    const seed = s.worldSeed;
    const nest = hexesInRange(ORIGIN, 30).find((h) => nestAt(seed, h.q, h.r))!;
    const nah = hexesInRange(nest, 2).find(
      (h) => hexDistance(h, nest) === 2 && isLandAt(seed, h.q, h.r) && !nestAt(seed, h.q, h.r),
    );
    const fern = hexesInRange(ORIGIN, 40).find(
      (h) => isLandAt(seed, h.q, h.r) && hexesInRange(h, 5).every((c) => !nestAt(seed, c.q, c.r)),
    );
    expect(nah).toBeDefined();
    expect(fern).toBeDefined();
    s.buildings[vertexKey({ q: fern!.q, r: fern!.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    s.buildings[vertexKey({ q: nah!.q, r: nah!.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    const feld = knightMusterHex(s, 'p0')!;
    expect(settlementApproaches(s, 'p0').has(hexKey(feld.q, feld.r))).toBe(true);
    expect(hexDistance(feld, nest)).toBeLessThanOrEqual(3);
  });

  it('braucht eine Siedlung', () => {
    expect(knightMusterHex(solo().state, 'p0')).toBeNull();
  });
});
