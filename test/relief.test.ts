/**
 * Relief mit begrenzter Steigung.
 *
 * Der Kern der Sache: kein Feld darf mehr als slope ueber oder unter seinem
 * Nachbarn stehen, sonst klaffen ohne Sockel Fugen. Und die lokale Suche muss
 * exakt dasselbe liefern wie ein Blick ueber einen grossen Umkreis - sonst
 * waere "lokal" nur eine Naeherung, die an Kanten sichtbar wird.
 */

import { describe, it, expect } from 'vitest';
import { reliefAt, reliefLimitedAt } from '../src/core/relief';
import { hexDistance, hexesInRange, neighbors } from '../src/core/coords';

const SLOPE = 4 / 64; // wie im Brett: 2 Kunstpixel bei Massstab 2, Deckel 64

describe('Relief mit begrenzter Steigung', () => {
  it('springt nie mehr als slope zu einem Nachbarn', () => {
    for (const seed of [2024, 7, 31337]) {
      for (const h of hexesInRange({ q: 0, r: 0 }, 14)) {
        const v = reliefLimitedAt(seed, h.q, h.r, SLOPE);
        for (const n of neighbors(h.q, h.r)) {
          const w = reliefLimitedAt(seed, n.q, n.r, SLOPE);
          expect(Math.abs(v - w)).toBeLessThanOrEqual(SLOPE + 1e-9);
        }
      }
    }
  });

  it('liegt nie ueber dem rohen Relief', () => {
    for (const h of hexesInRange({ q: 0, r: 0 }, 14)) {
      expect(reliefLimitedAt(2024, h.q, h.r, SLOPE)).toBeLessThanOrEqual(reliefAt(2024, h.q, h.r) + 1e-12);
    }
  });

  it('liefert exakt dasselbe wie eine Suche ueber einen grossen Umkreis', () => {
    const seed = 7;
    // 1/SLOPE = 16 - ein Umkreis von 25 ist sicher weiter als noetig.
    for (const h of hexesInRange({ q: 3, r: -2 }, 5)) {
      let best = Infinity;
      for (const c of hexesInRange(h, 25)) {
        best = Math.min(best, reliefAt(seed, c.q, c.r) + SLOPE * hexDistance(h, c));
      }
      expect(reliefLimitedAt(seed, h.q, h.r, SLOPE)).toBeCloseTo(best, 9);
    }
  });

  it('laesst Wasser auf Meereshoehe', () => {
    for (const h of hexesInRange({ q: 0, r: 0 }, 14)) {
      if (reliefAt(2024, h.q, h.r) === 0) expect(reliefLimitedAt(2024, h.q, h.r, SLOPE)).toBe(0);
    }
  });
});
