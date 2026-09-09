/**
 * Zerlegung der unendlichen Hex-Ebene in Chunks zu je sieben Hexes.
 *
 * Ein Chunk ist ein Hex plus seine sechs Nachbarn. Solche Siebener-Cluster
 * kacheln die Ebene lueckenlos (Aperture-7-Hierarchie): die Chunk-Zentren
 * liegen selbst auf einem Hex-Gitter, aufgespannt von
 *
 *     e1 = (3, -1)     e2 = (1, 2)
 *
 * Die Determinante dieser Basis ist 3*2 - (-1)*1 = 7, also genau die Anzahl
 * Hexes pro Chunk. Der kuerzeste Gittervektor hat Hex-Distanz 3, waehrend
 * zwei Zellen desselben Clusters hoechstens Distanz 2 haben - deshalb kann
 * kein Hex zu zwei Chunks gehoeren.
 *
 * Warum ueberhaupt Chunks: Gelaende und Zahlen sollen als Paket ausgewuerfelt
 * werden (jeder Chunk enthaelt garantiert alle fuenf Rohstoffe), und die
 * Erzeugung soll rein von der Chunk-Koordinate abhaengen - nie davon, in
 * welcher Reihenfolge die Spieler die Karte aufdecken.
 */

import { HEX_DIRS, hexKey } from './coords';
import type { Hex } from './coords';

export type ChunkCoord = { m: number; n: number };
export type ChunkKey = string;

export const CHUNK_HEXES = 7;

export const chunkKey = (m: number, n: number): ChunkKey => m + ':' + n;

export function parseChunkKey(k: ChunkKey): ChunkCoord {
  const i = k.indexOf(':');
  return { m: Number(k.slice(0, i)), n: Number(k.slice(i + 1)) };
}

/** Basisvektoren des Chunk-Gitters, in Hex-Koordinaten. */
const E1 = [3, -1] as const;
const E2 = [1, 2] as const;

/** Die sieben Hexes eines Chunks, relativ zum Chunk-Zentrum. Feste Reihenfolge. */
const CLUSTER: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  ...HEX_DIRS,
];

/** Zentrum des Chunks (m,n) in Hex-Koordinaten. */
export function chunkCenter(m: number, n: number): Hex {
  return { q: E1[0] * m + E2[0] * n, r: E1[1] * m + E2[1] * n };
}

/** Die sieben Hexes des Chunks (m,n). Index 0 ist immer das Zentrum. */
export function chunkHexes(m: number, n: number): Hex[] {
  const c = chunkCenter(m, n);
  return CLUSTER.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));
}

/**
 * Zu welchem Chunk gehoert das Hex (q,r)?
 *
 * Die Basis invertiert liefert m = (2q - r)/7, n = (q + 3r)/7. Das trifft
 * nur fuer Chunk-Zentren glatt; fuer die uebrigen sechs Hexes liegt das
 * Ergebnis daneben. Statt uns auf Rundung zu verlassen - die bei negativen
 * Koordinaten gern schiefgeht - pruefen wir die neun Kandidaten um den
 * gerundeten Wert und nehmen den, dessen Cluster das Hex wirklich enthaelt.
 */
export function chunkOf(q: number, r: number): ChunkCoord {
  const m0 = Math.round((2 * q - r) / 7);
  const n0 = Math.round((q + 3 * r) / 7);
  for (let dm = -1; dm <= 1; dm++) {
    for (let dn = -1; dn <= 1; dn++) {
      const m = m0 + dm;
      const n = n0 + dn;
      const c = chunkCenter(m, n);
      const dq = q - c.q;
      const dr = r - c.r;
      for (const [oq, or_] of CLUSTER) {
        if (dq === oq && dr === or_) return { m, n };
      }
    }
  }
  // Unerreichbar, solange die Basis stimmt - aber lieber laut scheitern als
  // still ein falsches Chunk liefern.
  throw new Error('kein Chunk fuer Hex ' + hexKey(q, r));
}

export const chunkKeyOf = (q: number, r: number): ChunkKey => {
  const c = chunkOf(q, r);
  return chunkKey(c.m, c.n);
};

/** Alle Chunks, die mindestens ein Hex aus der Liste enthalten. */
export function chunksCovering(hexes: Iterable<Hex>): ChunkCoord[] {
  const seen = new Map<ChunkKey, ChunkCoord>();
  for (const h of hexes) {
    const c = chunkOf(h.q, h.r);
    seen.set(chunkKey(c.m, c.n), c);
  }
  return [...seen.values()];
}
