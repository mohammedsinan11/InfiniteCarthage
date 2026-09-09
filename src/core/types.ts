/**
 * Grundtypen der Welt. Spielzustand und Aktionen kommen in M2 dazu.
 */

export type Resource = 'lumber' | 'wool' | 'grain' | 'brick' | 'ore';

export const RESOURCES: readonly Resource[] = ['lumber', 'wool', 'grain', 'brick', 'ore'];

export type Terrain =
  | 'forest'   // Holz
  | 'pasture'  // Wolle
  | 'field'    // Getreide
  | 'hill'     // Lehm
  | 'mountain' // Erz
  | 'desert'
  | 'water';

export const TERRAIN_RESOURCE: Readonly<Record<Terrain, Resource | null>> = {
  forest: 'lumber',
  pasture: 'wool',
  field: 'grain',
  hill: 'brick',
  mountain: 'ore',
  desert: null,
  water: null,
};

/** Die fuenf Gelaende, die Rohstoffe liefern. Jeder Chunk enthaelt jedes davon. */
export const PRODUCTIVE_TERRAIN: readonly Terrain[] = [
  'forest',
  'pasture',
  'field',
  'hill',
  'mountain',
];

/** 'any' ist der 3:1-Hafen, ein Rohstoff der jeweilige 2:1-Hafen. */
export type PortType = Resource | 'any';

export type Port = {
  type: PortType;
  /** Die beiden Ecken, an denen der Hafen genutzt werden kann. */
  vertices: [string, string];
};

export type Tile = {
  q: number;
  r: number;
  terrain: Terrain;
  /** Wuerfelzahl; null bei Wueste und Wasser. */
  number: number | null;
  /** Nur Wasser-Hexes tragen Haefen. */
  port: Port | null;
};

export type Chunk = {
  m: number;
  n: number;
  tiles: Tile[];
};
