/**
 * Tageszeit, Wetter und die kuerzere Sicht bei Nacht.
 */

import { describe, it, expect } from 'vitest';
import { istNacht, nachtBeginntAt, tageszeitOf, wetterOf } from '../src/core/zeit';
import { ROUNDS_PER_SEASON } from '../src/core/season';
import { createGame } from '../src/core/rules/reducer';
import { sightOf } from '../src/core/units';
import { vertexKey } from '../src/core/coords';

describe('Tageszeit', () => {
  it('laeuft je grosse Runde: Morgen, Tag, Tag, Abend, Nacht', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(tageszeitOf)).toEqual([
      'morgen',
      'tag',
      'tag',
      'abend',
      'nacht',
      'morgen',
      'nacht',
    ]);
    expect(istNacht(0)).toBe(false);
  });

  it('meldet den Beginn der Nacht genau einmal je Nacht', () => {
    const beginn = Array.from({ length: 16 }, (_, t) => t).filter(nachtBeginntAt);
    expect(beginn).toEqual([5, 10, 15]);
  });
});

describe('Wetter', () => {
  it('ist rein und passt zur Jahreszeit', () => {
    const winter = new Set<string>();
    for (const seed of [2024, 7, 31337]) {
      for (let t = 1; t <= 240; t++) {
        const w = wetterOf(seed, t);
        expect(wetterOf(seed, t)).toBe(w);
        const imJahr = (t - 1) % (4 * ROUNDS_PER_SEASON);
        if (imJahr >= ROUNDS_PER_SEASON && imJahr < 2 * ROUNDS_PER_SEASON) {
          expect(w).not.toBe('schnee'); // Sommer
        }
        if (imJahr >= 3 * ROUNDS_PER_SEASON) {
          expect(['regen', 'gewitter']).not.toContain(w); // Winter
          winter.add(w);
        }
      }
    }
    expect(winter.has('schnee')).toBe(true);
  });

  it('haelt zwei Runden', () => {
    for (const seed of [2024, 7]) {
      expect(wetterOf(seed, 1)).toBe(wetterOf(seed, 2));
      expect(wetterOf(seed, 3)).toBe(wetterOf(seed, 4));
    }
  });
});

describe('Sicht bei Nacht', () => {
  it('reicht ein Feld weniger weit', () => {
    const s = createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15).state;
    s.buildings[vertexKey({ q: 0, r: 0, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    s.units.push({
      id: 1,
      kind: 'ritter',
      owner: 'p0',
      fraktion: null,
      q: 20,
      r: 0,
      ziel: null,
      heimat: null,
      auftrag: 'befehl',
      leben: 3,
      fracht: null,
      traegt: 0,
      beraubt: null,
      dauer: null,
    });
    const tag = sightOf(s, 'p0');
    const nacht = sightOf(s, 'p0', true);
    expect(nacht.size).toBeLessThan(tag.size);
    for (const k of nacht) expect(tag.has(k)).toBe(true);
    expect(nacht.has('20:0')).toBe(true);
  });
});
