/**
 * Relief mit begrenzter Steigung.
 *
 * Kein Feld darf mehr als slope ueber seinem Nachbarn stehen, sonst klaffen
 * ohne Sockel Fugen. Die lokale Suche muss exakt dasselbe liefern wie ein Blick
 * ueber einen grossen Umkreis - sonst waere "lokal" nur eine Naeherung. Und seit
 * Seen mitsteigen duerfen, muss das Meer trotzdem unten bleiben.
 */

import { describe, it, expect } from 'vitest';
import { reliefLimitedAt, reliefTargetAt } from '../src/core/relief';
import { hexDistance, hexesInRange, neighbors } from '../src/core/coords';
import { terrainAt } from '../src/core/worldgen';

const SLOPE = 3 / 180; // wie im Brett: 1,5 Kunstpixel bei Massstab 2, Deckel 180

describe('Relief mit begrenzter Steigung', () => {
  it('springt nie mehr als slope zu einem Nachbarn', () => {
    for (const seed of [2024, 7]) {
      for (const h of hexesInRange({ q: 0, r: 0 }, 12)) {
        const v = reliefLimitedAt(seed, h.q, h.r, SLOPE);
        for (const n of neighbors(h.q, h.r)) {
          expect(Math.abs(v - reliefLimitedAt(seed, n.q, n.r, SLOPE))).toBeLessThanOrEqual(SLOPE + 1e-9);
        }
      }
    }
  });

  it('liegt auf Land nie ueber dem Ziel', () => {
    for (const h of hexesInRange({ q: 0, r: 0 }, 12)) {
      if (terrainAt(2024, h.q, h.r) === 'water') continue;
      expect(reliefLimitedAt(2024, h.q, h.r, SLOPE)).toBeLessThanOrEqual(reliefTargetAt(2024, h.q, h.r) + 1e-12);
    }
  });

  it('liefert exakt dasselbe wie eine Suche ueber einen grossen Umkreis', () => {
    const seed = 7;
    // 1/SLOPE = 60 - ein Umkreis von 61 reicht sicher.
    for (const h of hexesInRange({ q: 3, r: -2 }, 1)) {
      let best = Infinity;
      for (const c of hexesInRange(h, 61)) {
        best = Math.min(best, reliefTargetAt(seed, c.q, c.r) + SLOPE * hexDistance(h, c));
      }
      expect(reliefLimitedAt(seed, h.q, h.r, SLOPE)).toBeCloseTo(Number.isFinite(best) ? best : 0, 9);
    }
  }, 30000);

  it('laesst das Meer auf Meereshoehe', () => {
    for (const h of hexesInRange({ q: 0, r: 0 }, 12)) {
      if (reliefTargetAt(2024, h.q, h.r) === 0) expect(reliefLimitedAt(2024, h.q, h.r, SLOPE)).toBe(0);
    }
  });

  it('laesst Seen mit dem Land steigen', () => {
    let gehoben = 0;
    for (const seed of [2024, 7, 31337]) {
      for (const h of hexesInRange({ q: 0, r: 0 }, 16)) {
        if (reliefTargetAt(seed, h.q, h.r) !== Infinity) continue;
        if (reliefLimitedAt(seed, h.q, h.r, SLOPE) > 0) gehoben++;
      }
    }
    expect(gehoben).toBeGreaterThan(0);
  });
});
