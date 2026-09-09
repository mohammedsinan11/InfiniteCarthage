/**
 * Hex-Geometrie fuer ein unbegrenztes Brett.
 *
 * Hexes liegen in axialen Koordinaten {q, r} als Pointy-Top (Spitze oben).
 * Es gibt kein Array und keine Grenze - die Karte reicht so weit, wie
 * Zahlen reichen.
 *
 * Der wichtigste Teil dieser Datei ist die Kanonisierung von Ecken und
 * Kanten. Eine Ecke gehoert zu drei Hexes, eine Kante zu zwei. Ohne eine
 * eindeutige ID wuerde dieselbe Siedlung je nach Blickrichtung unter drei
 * verschiedenen Schluesseln landen. Der Trick:
 *
 *   - Jede Ecke ist die Nord- ODER die Sued-Ecke GENAU EINES Hexes.
 *   - Jede Kante ist eine der drei "eigenen" Kanten (NO, O, SO) genau eines Hexes.
 *
 * Damit ist "q:r:N" bzw. "q:r:0" eine echte Identitaet, kein Alias.
 */

export type Hex = { q: number; r: number };

/** Ecke: Nord- oder Sued-Spitze des Hexes (q,r). */
export type Vertex = { q: number; r: number; d: 'N' | 'S' };

/** Kante 0 = Nordost, 1 = Ost, 2 = Suedost des Hexes (q,r). */
export type Edge = { q: number; r: number; e: 0 | 1 | 2 };

export type HexKey = string;
export type VertexKey = string;
export type EdgeKey = string;

export const hexKey = (q: number, r: number): HexKey => q + ':' + r;
export const vertexKey = (v: Vertex): VertexKey => v.q + ':' + v.r + ':' + v.d;
export const edgeKey = (e: Edge): EdgeKey => e.q + ':' + e.r + ':' + e.e;

export function parseHexKey(k: HexKey): Hex {
  const i = k.indexOf(':');
  return { q: Number(k.slice(0, i)), r: Number(k.slice(i + 1)) };
}

export function parseVertexKey(k: VertexKey): Vertex {
  const p = k.split(':');
  return { q: Number(p[0]), r: Number(p[1]), d: p[2] as 'N' | 'S' };
}

export function parseEdgeKey(k: EdgeKey): Edge {
  const p = k.split(':');
  return { q: Number(p[0]), r: Number(p[1]), e: Number(p[2]) as 0 | 1 | 2 };
}

/**
 * Die sechs Nachbarn in EINEM Umlaufsinn: NO, O, SO, SW, W, NW.
 *
 * Diese Reihenfolge ist bewusst dieselbe wie bei Ecken und Kanten weiter
 * unten: Kante i liegt zwischen Ecke i und Ecke i+1 und trennt das Hex vom
 * Nachbarn i. Wer hier eine zweite Reihenfolge einfuehrt, bricht still
 * jeden Code, der ueber Seiten iteriert.
 */
export const HEX_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
];

export function neighbor(q: number, r: number, dir: number): Hex {
  const d = HEX_DIRS[dir]!;
  return { q: q + d[0], r: r + d[1] };
}

export function neighbors(q: number, r: number): Hex[] {
  return HEX_DIRS.map((d) => ({ q: q + d[0], r: r + d[1] }));
}

/** Hex-Distanz in axialen Koordinaten. */
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Alle Hexes mit Distanz <= radius um ein Zentrum. */
export function hexesInRange(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}

// --- Ecken -----------------------------------------------------------------

/**
 * Ecke i (0=N, 1=NO, 2=SO, 3=S, 4=SW, 5=NW) eines Hexes auf ihre kanonische
 * Form. Nur i=0 und i=3 gehoeren dem Hex selbst; die vier anderen sind die
 * N- bzw. S-Spitze eines Nachbarn.
 */
const CORNER_TO_VERTEX: ReadonlyArray<readonly [number, number, 'N' | 'S']> = [
  [0, 0, 'N'],
  [1, -1, 'S'],
  [0, 1, 'N'],
  [0, 0, 'S'],
  [-1, 1, 'N'],
  [0, -1, 'S'],
];

export function cornerVertex(q: number, r: number, corner: number): Vertex {
  const c = CORNER_TO_VERTEX[corner]!;
  return { q: q + c[0], r: r + c[1], d: c[2] };
}

/** Die sechs Ecken eines Hexes, kanonisiert. */
export function hexVertices(q: number, r: number): Vertex[] {
  return [0, 1, 2, 3, 4, 5].map((i) => cornerVertex(q, r, i));
}

/** Die drei Hexes, an die eine Ecke grenzt. */
export function vertexAdjacentHexes(v: Vertex): Hex[] {
  return v.d === 'N'
    ? [
        { q: v.q, r: v.r },
        { q: v.q, r: v.r - 1 },
        { q: v.q + 1, r: v.r - 1 },
      ]
    : [
        { q: v.q, r: v.r },
        { q: v.q, r: v.r + 1 },
        { q: v.q - 1, r: v.r + 1 },
      ];
}

/** Die drei Kanten, die von einer Ecke ausgehen. */
export function vertexAdjacentEdges(v: Vertex): Edge[] {
  return v.d === 'N'
    ? [
        { q: v.q, r: v.r, e: 0 },
        { q: v.q, r: v.r - 1, e: 1 },
        { q: v.q, r: v.r - 1, e: 2 },
      ]
    : [
        { q: v.q, r: v.r, e: 2 },
        { q: v.q - 1, r: v.r + 1, e: 0 },
        { q: v.q - 1, r: v.r + 1, e: 1 },
      ];
}

/** Die drei benachbarten Ecken (ueber je eine Kante erreichbar). */
export function vertexNeighborVertices(v: Vertex): Vertex[] {
  const key = vertexKey(v);
  const out: Vertex[] = [];
  for (const e of vertexAdjacentEdges(v)) {
    for (const end of edgeEndpoints(e)) {
      if (vertexKey(end) !== key) out.push(end);
    }
  }
  return out;
}

// --- Kanten ----------------------------------------------------------------

/**
 * Kante i (0=NO, 1=O, 2=SO, 3=SW, 4=W, 5=NW) eines Hexes auf ihre kanonische
 * Form - gleicher Umlauf wie HEX_DIRS, also trennt Kante i vom Nachbarn i.
 * Form. Die Kanten 3..5 gehoeren jeweils dem Nachbarn auf dieser Seite.
 */
const EDGE_CANON: ReadonlyArray<readonly [number, number, 0 | 1 | 2]> = [
  [0, 0, 0],
  [0, 0, 1],
  [0, 0, 2],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 2],
];

export function sideEdge(q: number, r: number, side: number): Edge {
  const c = EDGE_CANON[side]!;
  return { q: q + c[0], r: r + c[1], e: c[2] };
}

/** Die sechs Kanten eines Hexes, kanonisiert. */
export function hexEdges(q: number, r: number): Edge[] {
  return [0, 1, 2, 3, 4, 5].map((i) => sideEdge(q, r, i));
}

/** Die beiden Ecken, die eine Kante verbindet. */
export function edgeEndpoints(e: Edge): [Vertex, Vertex] {
  switch (e.e) {
    case 0:
      return [
        { q: e.q, r: e.r, d: 'N' },
        { q: e.q + 1, r: e.r - 1, d: 'S' },
      ];
    case 1:
      return [
        { q: e.q + 1, r: e.r - 1, d: 'S' },
        { q: e.q, r: e.r + 1, d: 'N' },
      ];
    default:
      return [
        { q: e.q, r: e.r + 1, d: 'N' },
        { q: e.q, r: e.r, d: 'S' },
      ];
  }
}

/** Die beiden Hexes beiderseits einer Kante. */
export function edgeAdjacentHexes(e: Edge): [Hex, Hex] {
  switch (e.e) {
    case 0:
      return [{ q: e.q, r: e.r }, { q: e.q + 1, r: e.r - 1 }];
    case 1:
      return [{ q: e.q, r: e.r }, { q: e.q + 1, r: e.r }];
    default:
      return [{ q: e.q, r: e.r }, { q: e.q, r: e.r + 1 }];
  }
}

// --- Pixel -----------------------------------------------------------------

/**
 * Ein Hex in Pixeln, beschrieben durch Breite und Hoehe statt durch einen
 * Radius.
 *
 * Der Grund ist die Grafik: die Kacheln sind 26 x 32 Pixel, also etwas
 * schmaler als ein mathematisch exaktes Hex (0,8125 statt 0,866). Mit einem
 * einzelnen Radius liesse sich das nur durch Verzerren der Bilder abbilden -
 * bei Pixel-Art die eine Suende, die sofort auffaellt. Ueber Breite und Hoehe
 * folgt das Raster stattdessen der Grafik.
 *
 * Die Kacheln liegen dabei trotzdem lueckenlos: der Spaltenabstand ist genau
 * die Breite, der Zeilenabstand drei Viertel der Hoehe.
 */
export type Layout = { w: number; h: number };

/** Layout eines exakten Hexes mit gegebenem Radius. */
export const layoutFromSize = (size: number): Layout => ({
  w: Math.sqrt(3) * size,
  h: 2 * size,
});

/** Mittelpunkt eines Hexes in Pixeln (Pointy-Top, y nach unten). */
export function hexToPixel(q: number, r: number, L: Layout): { x: number; y: number } {
  return {
    x: L.w * (q + r / 2),
    y: L.h * 0.75 * r,
  };
}

/**
 * Ecke 0..5 als Vielfache von halber Breite und Hoehe, gleiche Reihenfolge
 * wie hexVertices: N, NO, SO, S, SW, NW.
 */
const CORNER_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -0.5],
  [0.5, -0.25],
  [0.5, 0.25],
  [0, 0.5],
  [-0.5, 0.25],
  [-0.5, -0.25],
];

export function hexCornerPixel(
  q: number,
  r: number,
  corner: number,
  L: Layout,
): { x: number; y: number } {
  const c = hexToPixel(q, r, L);
  const o = CORNER_OFFSETS[corner]!;
  return { x: c.x + o[0] * L.w, y: c.y + o[1] * L.h };
}

/** Mittelpunkt einer Ecke in Pixeln - unabhaengig davon, ueber welches Hex sie kam. */
export function vertexToPixel(v: Vertex, L: Layout): { x: number; y: number } {
  return hexCornerPixel(v.q, v.r, v.d === 'N' ? 0 : 3, L);
}
