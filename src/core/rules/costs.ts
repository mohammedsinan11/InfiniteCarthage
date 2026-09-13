/**
 * Baukosten.
 *
 * Die Bank ist unendlich (state.ts): wer bezahlt, gibt die Karten ab, und sie
 * sind fort. Knapp ist nur, was man selbst hat.
 */

import type { Hand } from '../state';
import { RESOURCES } from '../types';
import type { Bundle } from '../types';

/** Baukosten sind nur ein Rohstoffbuendel mit anderem Namen. */
export type Cost = Bundle;

export const COST_ROAD: Cost = { lumber: 1, brick: 1 };
export const COST_SETTLEMENT: Cost = { lumber: 1, brick: 1, wool: 1, grain: 1 };
export const COST_CITY: Cost = { ore: 3, grain: 2 };
export const COST_DEV: Cost = { ore: 1, wool: 1, grain: 1 };

/**
 * Ein Ritter. Erz, weil es Waffen und Ruestung sind; Getreide, weil er essen
 * muss. Bewusst anders als die Entwicklungskarte: wer gezielt einen Ritter will,
 * soll nicht auf das Kartendeck hoffen muessen.
 */
export const COST_KNIGHT: Cost = { ore: 2, grain: 1 };

/**
 * Ein Wachturm an einem eigenen Dorf oder einer Stadt. Holz fuer das Geruest,
 * Lehm fuer den Sockel, Erz fuer die Feuerschale oben.
 */
export const COST_TOWER: Cost = { lumber: 1, brick: 1, ore: 1 };

/**
 * Eine abgebrannte Strasse wieder aufbauen: nur Holz. Der Damm liegt noch, es
 * fehlen die Bohlen - und wer gebrannt wurde, soll nicht doppelt zahlen.
 */
export const COST_REBUILD_ROAD: Cost = { lumber: 1 };

export function canAfford(hand: Hand, cost: Cost): boolean {
  for (const r of RESOURCES) {
    const need = cost[r] ?? 0;
    if (need > 0 && hand[r] < need) return false;
  }
  return true;
}

/** Zieht die Kosten von der Hand ab. */
export function pay(hand: Hand, cost: Cost): void {
  for (const r of RESOURCES) hand[r] -= cost[r] ?? 0;
}

