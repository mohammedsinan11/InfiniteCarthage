/** Farben fuer Gelaende und Spieler. Nur Darstellung, keine Regeln. */

import type { Terrain } from '../core/types';

export const TERRAIN_COLOR: Record<Terrain, string> = {
  forest: '#2f6b3a',
  pasture: '#7fbf5f',
  field: '#e3bd4d',
  hill: '#bc7448',
  mountain: '#8a8f97',
  desert: '#ddd0a6',
  water: '#3f74a8',
};

export const TERRAIN_NAME: Record<Terrain, string> = {
  forest: 'Wald',
  pasture: 'Weide',
  field: 'Feld',
  hill: 'Huegel',
  mountain: 'Berg',
  desert: 'Wueste',
  water: 'Wasser',
};

/** Sechs klar unterscheidbare Spielerfarben. */
export const PLAYER_COLORS = [
  '#d94f4f',
  '#3b7dd8',
  '#e8a33d',
  '#43a566',
  '#9b59b6',
  '#e8e2d6',
];

export const playerColor = (i: number): string =>
  PLAYER_COLORS[i % PLAYER_COLORS.length]!;
