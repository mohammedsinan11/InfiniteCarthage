import { describe, it, expect } from 'vitest';
import { generateChunk, terrainAt } from '../src/core/worldgen';
import { chunkOf, chunkHexes } from '../src/core/chunks';
import { neighbors, hexKey } from '../src/core/coords';
import { PRODUCTIVE_TERRAIN, TERRAIN_RESOURCE } from '../src/core/types';
import type { Tile } from '../src/core/types';

const SEEDS = [1, 12345, 99999, -777];

/** Alle Felder der Chunks im Bereich [-R..R]^2, indiziert nach Hex. */
function field(seed: number, R: number): Map<string, Tile> {
  const map = new Map<string, Tile>();
  for (let m = -R; m <= R; m++) {
    for (let n = -R; n <= R; n++) {
      for (const t of generateChunk(seed, m, n).tiles) map.set(hexKey(t.q, t.r), t);
    }
  }
  return map;
}

describe('Determinismus', () => {
  it('liefert bei gleicher Eingabe exakt dasselbe Ergebnis', () => {
    for (const seed of SEEDS) {
      for (const [m, n] of [[0, 0], [3, -2], [-5, 4]] as const) {
        expect(generateChunk(seed, m, n)).toEqual(generateChunk(seed, m, n));
      }
    }
  });

  it('haengt nicht von der Reihenfolge der Erzeugung ab', () => {
    // Einmal vorwaerts, einmal rueckwaerts erzeugen - der Cache in worldgen
    // darf das Ergebnis nicht beeinflussen.
    const coords: Array<[number, number]> = [];
    for (let m = -3; m <= 3; m++) for (let n = -3; n <= 3; n++) coords.push([m, n]);

    const forward = new Map(coords.map(([m, n]) => [m + ':' + n, generateChunk(7, m, n)]));
    const backward = new Map(
      [...coords].reverse().map(([m, n]) => [m + ':' + n, generateChunk(7, m, n)]),
    );
    for (const [k, v] of forward) expect(backward.get(k)).toEqual(v);
  });

  it('verschiedene Seeds liefern verschiedene Welten', () => {
    expect(generateChunk(1, 0, 0)).not.toEqual(generateChunk(2, 0, 0));
  });
});

describe('Chunk-Balance', () => {
  it('jeder Chunk enthaelt alle fuenf Rohstoffgelaende', () => {
    for (const seed of SEEDS) {
      for (let m = -6; m <= 6; m++) {
        for (let n = -6; n <= 6; n++) {
          const terrains = new Set(generateChunk(seed, m, n).tiles.map((t) => t.terrain));
          for (const p of PRODUCTIVE_TERRAIN) {
            expect(terrains.has(p), `Chunk ${m},${n} ohne ${p}`).toBe(true);
          }
        }
      }
    }
  });

  it('hat sieben Felder je Chunk, passend zu chunkHexes', () => {
    const c = generateChunk(42, 2, -1);
    expect(c.tiles).toHaveLength(7);
    const expected = new Set(chunkHexes(2, -1).map((h) => hexKey(h.q, h.r)));
    for (const t of c.tiles) expect(expected.has(hexKey(t.q, t.r))).toBe(true);
  });

  it('jedes Feld liegt in dem Chunk, der es ausgibt', () => {
    for (let m = -4; m <= 4; m++) {
      for (let n = -4; n <= 4; n++) {
        for (const t of generateChunk(3, m, n).tiles) {
          expect(chunkOf(t.q, t.r)).toEqual({ m, n });
        }
      }
    }
  });
});

describe('Zahlen', () => {
  it('vergibt Zahlen genau an produzierende Felder', () => {
    for (const t of field(1, 5).values()) {
      const producing = TERRAIN_RESOURCE[t.terrain] !== null;
      expect(t.number === null).toBe(!producing);
      if (t.number !== null) {
        expect(t.number).toBeGreaterThanOrEqual(2);
        expect(t.number).toBeLessThanOrEqual(12);
        expect(t.number).not.toBe(7);
      }
    }
  });

  it('setzt nie zwei rote Zahlen (6 oder 8) nebeneinander', () => {
    for (const seed of SEEDS) {
      const map = field(seed, 8);
      let checked = 0;
      for (const t of map.values()) {
        if (t.number !== 6 && t.number !== 8) continue;
        for (const nb of neighbors(t.q, t.r)) {
          const o = map.get(hexKey(nb.q, nb.r));
          if (!o) continue; // Rand des Testfelds
          checked++;
          expect(
            o.number === 6 || o.number === 8,
            `rote Nachbarn ${hexKey(t.q, t.r)} und ${hexKey(nb.q, nb.r)}`,
          ).toBe(false);
        }
      }
      expect(checked).toBeGreaterThan(500); // der Test hat wirklich etwas geprueft
    }
  });
});

describe('Startchunk', () => {
  it('enthaelt genau eine Wueste und kein Wasser', () => {
    for (const seed of SEEDS) {
      const tiles = generateChunk(seed, 0, 0).tiles;
      expect(tiles.filter((t) => t.terrain === 'desert')).toHaveLength(1);
      expect(tiles.filter((t) => t.terrain === 'water')).toHaveLength(0);
    }
  });
});

describe('Haefen', () => {
  it('haengen nur an Wasser und zeigen auf Land', () => {
    for (const t of field(1, 6).values()) {
      if (t.terrain !== 'water') {
        expect(t.port).toBeNull();
        continue;
      }
      if (t.port === null) continue; // ringsum Wasser
      expect(t.port.vertices).toHaveLength(2);
      expect(t.port.vertices[0]).not.toBe(t.port.vertices[1]);
      // Mindestens ein Landnachbar muss existieren, sonst haette es keinen Hafen gegeben.
      const hasLand = neighbors(t.q, t.r).some((nb) => terrainAt(1, nb.q, nb.r) !== 'water');
      expect(hasLand).toBe(true);
    }
  });

  it('erzeugt ueberhaupt Haefen und mehr als einen Typ', () => {
    const ports = [...field(1, 8).values()].map((t) => t.port).filter((p) => p !== null);
    expect(ports.length).toBeGreaterThan(20);
    expect(new Set(ports.map((p) => p!.type)).size).toBeGreaterThan(1);
  });
});
