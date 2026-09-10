/**
 * Was die Karten eines Spielers dauerhaft bewirken.
 *
 * An EINER Stelle zusammengerechnet, damit Ertrag, Handel und Handkarten-
 * grenze dieselbe Antwort bekommen. Wuerde jede Regel selbst durch die Karten
 * laufen, gaebe es drei Gelegenheiten, sich zu widersprechen.
 *
 * Die Dauerwirkungen leben NICHT als eigener Zustand, sondern werden bei
 * Bedarf aus der Kartenliste abgeleitet. Damit kann der Bonus nicht von den
 * Karten abweichen - es gibt nur eine Wahrheit, und das ist die Liste.
 */

import { cardById } from './catalog';
import type { Terrain } from '../types';

export type Modifiers = {
  /** Zusaetzlicher Ertrag je Gelaende, kann negativ sein. */
  terrainBonus: Partial<Record<Terrain, number>>;
  /** Wie viele Karten der Bankhandel guenstiger wird. */
  tradeDiscount: number;
  /** Um wie viel die Handkartengrenze steigt. */
  handLimitBonus: number;
};

const LEER: Modifiers = { terrainBonus: {}, tradeDiscount: 0, handLimitBonus: 0 };

export function modifiersOf(cardIds: readonly string[]): Modifiers {
  if (cardIds.length === 0) return LEER;

  const m: Modifiers = { terrainBonus: {}, tradeDiscount: 0, handLimitBonus: 0 };
  for (const id of cardIds) {
    const karte = cardById(id);
    const l = karte?.lasting;
    if (!l) continue;
    switch (l.t) {
      case 'terrainBonus':
        m.terrainBonus[l.terrain] = (m.terrainBonus[l.terrain] ?? 0) + l.amount;
        break;
      case 'tradeDiscount':
        m.tradeDiscount += l.amount;
        break;
      case 'handLimit':
        m.handLimitBonus += l.amount;
        break;
    }
  }
  return m;
}

/**
 * Ertragsbonus fuer ein Gelaende.
 *
 * Nie unter null insgesamt: eine Karte darf einen Ertrag schmaelern, aber
 * nicht ins Negative drehen. "Karge Jahre" soll die Weide schwaechen, nicht
 * dazu fuehren, dass man beim Wuerfeln Karten abgibt.
 */
export function terrainBonusFor(m: Modifiers, terrain: Terrain, base: number): number {
  return Math.max(0, base + (m.terrainBonus[terrain] ?? 0));
}
