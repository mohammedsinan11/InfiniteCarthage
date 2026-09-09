/**
 * Der aufgedeckte Teil der Welt und die Regel, nach der er waechst.
 *
 * Die Karte hat keine Grenze. Was sie stattdessen hat, ist eine Invariante:
 *
 *   Um jedes Bauteil ist das Gelaende mindestens GROWTH_RADIUS Hexes weit
 *   erzeugt.
 *
 * Daraus folgt alles Weitere von selbst. Eine Ecke ist nur bebaubar, wenn
 * ihre drei Nachbarhexes existieren - durch den Puffer ist das immer erfuellt,
 * solange man an bestehende Strassen anschliesst. Wer nach aussen baut,
 * schiebt die Welt vor sich her. Es gibt deshalb nirgends einen Sonderfall
 * fuer "Rand der Karte", weil der Rand nie erreichbar ist.
 */

import { generateChunk } from './worldgen';
import { chunkKey, chunksCovering } from './chunks';
import type { ChunkCoord, ChunkKey } from './chunks';
import { hexDistance, hexKey, hexesInRange } from './coords';
import type { Hex } from './coords';
import type { Chunk, PortType, Tile } from './types';

/** Wie weit ueber jedes Bauteil hinaus Gelaende bereitsteht. */
export const GROWTH_RADIUS = 3;

export type World = {
  seed: number;
  chunks: Map<ChunkKey, Chunk>;
  /** Flacher Index ueber alle Felder - der heisse Pfad bei Ertrag und Bauregeln. */
  tiles: Map<string, Tile>;
  /** Welche Ecke an welchem Hafen liegt. Wird beim Aufdecken mitgefuellt. */
  ports: Map<string, PortType>;
};

export function createWorld(seed: number): World {
  return { seed, chunks: new Map(), tiles: new Map(), ports: new Map() };
}

/** Chunk aufnehmen, falls noch nicht vorhanden. Liefert true, wenn er neu war. */
function addChunk(world: World, m: number, n: number): boolean {
  const key = chunkKey(m, n);
  if (world.chunks.has(key)) return false;
  const chunk = generateChunk(world.seed, m, n);
  world.chunks.set(key, chunk);
  for (const t of chunk.tiles) {
    world.tiles.set(hexKey(t.q, t.r), t);
    if (t.port) {
      for (const v of t.port.vertices) world.ports.set(v, t.port.type);
    }
  }
  return true;
}

/**
 * Stellt sicher, dass rund um center alles im Radius erzeugt ist.
 * Liefert die Chunks, die dabei neu dazugekommen sind - genau die Liste,
 * die der Server an die Clients schickt.
 */
export function ensureGenerated(
  world: World,
  center: Hex,
  radius: number = GROWTH_RADIUS,
): ChunkCoord[] {
  const added: ChunkCoord[] = [];
  for (const c of chunksCovering(hexesInRange(center, radius))) {
    if (addChunk(world, c.m, c.n)) added.push(c);
  }
  return added;
}

/**
 * Chunks aufnehmen, die der Server benannt hat. Der Client bekommt nur
 * Koordinaten - das Gelaende rechnet er aus dem Seed selbst aus.
 */
export function revealChunks(world: World, coords: Iterable<ChunkCoord>): void {
  for (const c of coords) addChunk(world, c.m, c.n);
}

export function tileAt(world: World, q: number, r: number): Tile | undefined {
  return world.tiles.get(hexKey(q, r));
}

export function isGenerated(world: World, q: number, r: number): boolean {
  return world.tiles.has(hexKey(q, r));
}

/** Der Hafentyp an dieser Ecke, falls dort einer liegt. */
export function portAt(world: World, vertex: string): PortType | undefined {
  return world.ports.get(vertex);
}

/** Alle bisher aufgedeckten Chunk-Koordinaten - fuer den Zustandsabgleich. */
export function chunkCoords(world: World): ChunkCoord[] {
  return [...world.chunks.values()].map((c) => ({ m: c.m, n: c.n }));
}

/**
 * Startplatz des Raeubers.
 *
 * Im Original steht er auf der Wueste. Seit das Gelaende aus Rauschen kommt,
 * ist keine garantiert in der Naehe - Wuesten liegen dort, wo es trocken ist,
 * nicht dort, wo das Spiel beginnt. Deshalb in dieser Reihenfolge:
 *
 *   1. die naechste Wueste,
 *   2. sonst das naechste Feld, das ohnehin nichts liefert,
 *   3. sonst das naechste Feld ueberhaupt.
 *
 * Fall 3 blockiert zum Start einen Ertrag. Das ist verschmerzbar und tritt
 * nur ein, wenn ringsum alles produziert - eine ausgesprochen gute Startlage.
 */
export function robberStart(world: World): Hex {
  const byDistance = [...world.tiles.values()].sort(
    (a, b) =>
      hexDistance({ q: a.q, r: a.r }, ORIGIN) - hexDistance({ q: b.q, r: b.r }, ORIGIN),
  );
  const desert = byDistance.find((t) => t.terrain === 'desert');
  if (desert) return { q: desert.q, r: desert.r };

  const barren = byDistance.find((t) => t.number === null && t.terrain !== 'water');
  if (barren) return { q: barren.q, r: barren.r };

  const any = byDistance[0];
  if (!any) throw new Error('Welt ist leer');
  return { q: any.q, r: any.r };
}

const ORIGIN: Hex = { q: 0, r: 0 };
