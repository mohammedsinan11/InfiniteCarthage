import { describe, it, expect } from 'vitest';
import {
  hexVertices,
  hexEdges,
  cornerVertex,
  sideEdge,
  vertexKey,
  edgeKey,
  vertexAdjacentHexes,
  vertexAdjacentEdges,
  vertexNeighborVertices,
  edgeEndpoints,
  edgeAdjacentHexes,
  hexCornerPixel,
  vertexToPixel,
  layoutFromSize,
  pixelToHex,
  hexToPixel,
  hexesInRange,
  hexDistance,
  neighbors,
  hexKey,
} from '../src/core/coords';

/** Testfeld: alle Hexes im Radius 3 um den Ursprung. */
const FIELD = hexesInRange({ q: 0, r: 0 }, 3);

describe('Ecken-Kanonisierung', () => {
  it('liefert fuer dieselbe Ecke aus allen drei Hexes denselben Schluessel', () => {
    for (const h of FIELD) {
      for (let c = 0; c < 6; c++) {
        const v = cornerVertex(h.q, h.r, c);
        // Ueber die drei Nachbarhexes zurueckrechnen: jedes muss dieselbe
        // Ecke unter irgendeinem seiner sechs Eckenindizes kennen.
        const hexes = vertexAdjacentHexes(v);
        expect(hexes).toHaveLength(3);
        for (const nb of hexes) {
          const found = hexVertices(nb.q, nb.r).map(vertexKey);
          expect(found).toContain(vertexKey(v));
        }
      }
    }
  });

  it('stimmt geometrisch: dieselbe Ecke liegt von jedem Hex aus am selben Punkt', () => {
    const L = layoutFromSize(10);
    for (const h of FIELD) {
      for (let c = 0; c < 6; c++) {
        const v = cornerVertex(h.q, h.r, c);
        const viaHex = hexCornerPixel(h.q, h.r, c, L);
        const viaVertex = vertexToPixel(v, L);
        expect(viaVertex.x).toBeCloseTo(viaHex.x, 9);
        expect(viaVertex.y).toBeCloseTo(viaHex.y, 9);
      }
    }
  });

  it('hat pro Hex sechs verschiedene Ecken', () => {
    for (const h of FIELD) {
      const keys = new Set(hexVertices(h.q, h.r).map(vertexKey));
      expect(keys.size).toBe(6);
    }
  });

  it('vertexAdjacentHexes liefert genau die Hexes, die die Ecke fuehren', () => {
    for (const h of FIELD) {
      for (let c = 0; c < 6; c++) {
        const v = cornerVertex(h.q, h.r, c);
        const owners = new Set(vertexAdjacentHexes(v).map((x) => hexKey(x.q, x.r)));
        expect(owners.has(hexKey(h.q, h.r))).toBe(true);
        expect(owners.size).toBe(3);
      }
    }
  });

  it('hat drei Nachbarecken, alle verschieden von sich selbst', () => {
    for (const h of FIELD) {
      for (let c = 0; c < 6; c++) {
        const v = cornerVertex(h.q, h.r, c);
        const nb = vertexNeighborVertices(v);
        expect(nb).toHaveLength(3);
        const keys = new Set(nb.map(vertexKey));
        expect(keys.size).toBe(3);
        expect(keys.has(vertexKey(v))).toBe(false);
      }
    }
  });

  it('Nachbarschaft ist symmetrisch', () => {
    for (const h of FIELD) {
      for (let c = 0; c < 6; c++) {
        const v = cornerVertex(h.q, h.r, c);
        for (const n of vertexNeighborVertices(v)) {
          const back = vertexNeighborVertices(n).map(vertexKey);
          expect(back).toContain(vertexKey(v));
        }
      }
    }
  });
});

describe('Kanten-Kanonisierung', () => {
  it('liefert fuer dieselbe Kante aus beiden Hexes denselben Schluessel', () => {
    for (const h of FIELD) {
      for (let s = 0; s < 6; s++) {
        const e = sideEdge(h.q, h.r, s);
        const [a, b] = edgeAdjacentHexes(e);
        for (const nb of [a, b]) {
          const found = hexEdges(nb.q, nb.r).map(edgeKey);
          expect(found).toContain(edgeKey(e));
        }
      }
    }
  });

  it('grenzt an genau die beiden Hexes, die sie fuehren', () => {
    for (const h of FIELD) {
      for (let s = 0; s < 6; s++) {
        const e = sideEdge(h.q, h.r, s);
        const owners = edgeAdjacentHexes(e).map((x) => hexKey(x.q, x.r));
        expect(owners).toContain(hexKey(h.q, h.r));
        expect(new Set(owners).size).toBe(2);
      }
    }
  });

  it('Kante 3..5 eines Hexes ist Kante 0..2 des jeweiligen Nachbarn', () => {
    for (const h of FIELD) {
      const nb = neighbors(h.q, h.r);
      for (let s = 0; s < 6; s++) {
        const e = sideEdge(h.q, h.r, s);
        const other = nb[s]!;
        // Die Kante liegt zwischen h und dem Nachbarn in Richtung s.
        const owners = edgeAdjacentHexes(e).map((x) => hexKey(x.q, x.r));
        expect(owners).toContain(hexKey(other.q, other.r));
      }
    }
  });

  it('hat pro Hex sechs verschiedene Kanten', () => {
    for (const h of FIELD) {
      const keys = new Set(hexEdges(h.q, h.r).map(edgeKey));
      expect(keys.size).toBe(6);
    }
  });

  it('Endpunkte einer Kante liegen geometrisch eine Kantenlaenge auseinander', () => {
    const L = layoutFromSize(10);
    const expected = 10; // Seitenlaenge eines Hexes = Radius
    for (const h of FIELD) {
      for (let s = 0; s < 6; s++) {
        const e = sideEdge(h.q, h.r, s);
        const [p, q] = edgeEndpoints(e).map((v) => vertexToPixel(v, L));
        const d = Math.hypot(p!.x - q!.x, p!.y - q!.y);
        expect(d).toBeCloseTo(expected, 9);
      }
    }
  });

  it('edgeEndpoints und vertexAdjacentEdges sind zueinander invers', () => {
    for (const h of FIELD) {
      for (let s = 0; s < 6; s++) {
        const e = sideEdge(h.q, h.r, s);
        for (const v of edgeEndpoints(e)) {
          const around = vertexAdjacentEdges(v).map(edgeKey);
          expect(around).toContain(edgeKey(e));
        }
      }
    }
    for (const h of FIELD) {
      for (let c = 0; c < 6; c++) {
        const v = cornerVertex(h.q, h.r, c);
        const es = vertexAdjacentEdges(v);
        expect(new Set(es.map(edgeKey)).size).toBe(3);
        for (const e of es) {
          expect(edgeEndpoints(e).map(vertexKey)).toContain(vertexKey(v));
        }
      }
    }
  });
});

describe('Pixel zurueck zu Hex', () => {
  const L = layoutFromSize(20);

  it('findet aus dem Mittelpunkt wieder dasselbe Feld', () => {
    for (const h of hexesInRange({ q: 0, r: 0 }, 6)) {
      const p = hexToPixel(h.q, h.r, L);
      expect(pixelToHex(p.x, p.y, L)).toEqual({ q: h.q, r: h.r });
    }
  });

  it('trifft auch abseits der Mitte das richtige Feld', () => {
    // Punkte dicht um den Mittelpunkt muessen beim eigenen Feld bleiben.
    for (const h of hexesInRange({ q: 0, r: 0 }, 4)) {
      const p = hexToPixel(h.q, h.r, L);
      for (const [dx, dy] of [
        [6, 0],
        [-6, 0],
        [0, 8],
        [0, -8],
        [5, 5],
        [-5, -5],
      ] as const) {
        expect(
          pixelToHex(p.x + dx, p.y + dy, L),
          `Versatz ${dx},${dy} bei ${h.q},${h.r}`,
        ).toEqual({ q: h.q, r: h.r });
      }
    }
  });

  it('liefert fuer jeden Punkt eines Rasters ein benachbartes Feld', () => {
    // Kein Punkt darf auf ein weit entferntes Feld zeigen - das waere ein
    // Vorzeichen- oder Rundungsfehler.
    for (let x = -200; x <= 200; x += 7) {
      for (let y = -200; y <= 200; y += 7) {
        const h = pixelToHex(x, y, L);
        const back = hexToPixel(h.q, h.r, L);
        const dist = Math.hypot(back.x - x, back.y - y);
        expect(dist, `Punkt ${x},${y} landet zu weit weg`).toBeLessThan(L.h * 0.6);
      }
    }
  });
});

describe('Hex-Grundlagen', () => {
  it('hexesInRange liefert 1, 7, 19, 37 Felder', () => {
    expect(hexesInRange({ q: 0, r: 0 }, 0)).toHaveLength(1);
    expect(hexesInRange({ q: 0, r: 0 }, 1)).toHaveLength(7);
    expect(hexesInRange({ q: 0, r: 0 }, 2)).toHaveLength(19);
    expect(hexesInRange({ q: 0, r: 0 }, 3)).toHaveLength(37);
  });

  it('alle sechs Nachbarn haben Distanz 1', () => {
    for (const n of neighbors(4, -2)) {
      expect(hexDistance({ q: 4, r: -2 }, n)).toBe(1);
    }
  });
});
