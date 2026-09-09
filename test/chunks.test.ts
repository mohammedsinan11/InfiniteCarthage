import { describe, it, expect } from 'vitest';
import { chunkOf, chunkHexes, chunkKey, chunkCenter, chunksCovering, CHUNK_HEXES } from '../src/core/chunks';
import { hexKey, hexesInRange, hexDistance } from '../src/core/coords';

describe('Aperture-7-Chunks', () => {
  it('jedes Hex gehoert zu genau einem Chunk, und dieser enthaelt es', () => {
    for (let q = -25; q <= 25; q++) {
      for (let r = -25; r <= 25; r++) {
        const c = chunkOf(q, r);
        const members = chunkHexes(c.m, c.n).map((h) => hexKey(h.q, h.r));
        expect(members).toContain(hexKey(q, r));
      }
    }
  });

  it('kachelt lueckenlos und ohne Ueberlappung', () => {
    // Jedes Hex im Testfeld wird von genau einem Chunk beansprucht.
    const claimedBy = new Map<string, string>();
    for (let m = -12; m <= 12; m++) {
      for (let n = -12; n <= 12; n++) {
        for (const h of chunkHexes(m, n)) {
          const k = hexKey(h.q, h.r);
          expect(claimedBy.has(k)).toBe(false); // keine Ueberlappung
          claimedBy.set(k, chunkKey(m, n));
        }
      }
    }
    // Lueckenlos: im Inneren des abgedeckten Bereichs fehlt nichts.
    for (const h of hexesInRange({ q: 0, r: 0 }, 15)) {
      expect(claimedBy.has(hexKey(h.q, h.r))).toBe(true);
    }
  });

  it('hat sieben Hexes je Chunk, alle verschieden', () => {
    for (let m = -5; m <= 5; m++) {
      for (let n = -5; n <= 5; n++) {
        const hs = chunkHexes(m, n);
        expect(hs).toHaveLength(CHUNK_HEXES);
        expect(new Set(hs.map((h) => hexKey(h.q, h.r))).size).toBe(CHUNK_HEXES);
      }
    }
  });

  it('alle Nicht-Zentrums-Hexes liegen Distanz 1 vom Zentrum', () => {
    const c = chunkCenter(3, -2);
    for (const h of chunkHexes(3, -2).slice(1)) {
      expect(hexDistance(c, h)).toBe(1);
    }
  });

  it('der Ursprung liegt im Chunk (0,0)', () => {
    expect(chunkOf(0, 0)).toEqual({ m: 0, n: 0 });
  });

  it('chunksCovering deckt Radius 3 mit einer handvoll Chunks ab', () => {
    const cs = chunksCovering(hexesInRange({ q: 0, r: 0 }, 3));
    const covered = new Set<string>();
    for (const c of cs) for (const h of chunkHexes(c.m, c.n)) covered.add(hexKey(h.q, h.r));
    for (const h of hexesInRange({ q: 0, r: 0 }, 3)) {
      expect(covered.has(hexKey(h.q, h.r))).toBe(true);
    }
  });
});
