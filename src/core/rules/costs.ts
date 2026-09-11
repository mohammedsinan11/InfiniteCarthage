/**
 * Baukosten und Kontobewegungen zwischen Spieler und Bank.
 *
 * Die Bank ist endlich (19 je Rohstoff). Auf einer unendlichen Karte ist das
 * die einzige verbleibende Knappheit - ohne sie wuerde eine lange Partie
 * jede Spannung verlieren.
 */

import type { Hand } from '../state';
import { emptyHand } from '../state';
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

export function canAfford(hand: Hand, cost: Cost): boolean {
  for (const r of RESOURCES) {
    const need = cost[r] ?? 0;
    if (need > 0 && hand[r] < need) return false;
  }
  return true;
}

/** Zieht die Kosten ab und gibt sie der Bank zurueck. */
export function pay(hand: Hand, bank: Hand, cost: Cost): void {
  for (const r of RESOURCES) {
    const need = cost[r] ?? 0;
    hand[r] -= need;
    bank[r] += need;
  }
}

/**
 * Gibt Karten aus der Bank aus, soweit vorhanden. Liefert, was wirklich
 * geflossen ist - der Aufrufer soll den Unterschied melden koennen.
 */
export function payout(hand: Hand, bank: Hand, want: Cost): Hand {
  const given = emptyHand();
  for (const r of RESOURCES) {
    const n = Math.min(want[r] ?? 0, bank[r]);
    if (n <= 0) continue;
    bank[r] -= n;
    hand[r] += n;
    given[r] = n;
  }
  return given;
}
