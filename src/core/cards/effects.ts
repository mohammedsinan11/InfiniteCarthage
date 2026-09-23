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
import { dauerwirkungen } from './types';
import type { Terrain } from '../types';

export type Modifiers = {
  /** Zusaetzlicher Ertrag je Gelaende, kann negativ sein. */
  terrainBonus: Partial<Record<Terrain, number>>;
  /** Wie viele Karten der Bankhandel guenstiger wird. */
  tradeDiscount: number;
  /** Um wie viel die Handkartengrenze steigt. */
  handLimitBonus: number;
  /** Eigene Haefen schliessen im Sturm nicht. */
  stormPorts: boolean;
};

const LEER: Modifiers = { terrainBonus: {}, tradeDiscount: 0, handLimitBonus: 0, stormPorts: false };

export function modifiersOf(cardIds: readonly string[]): Modifiers {
  if (cardIds.length === 0) return LEER;

  const m: Modifiers = { terrainBonus: {}, tradeDiscount: 0, handLimitBonus: 0, stormPorts: false };
  for (const id of cardIds) {
    const karte = cardById(id);
    if (!karte) continue;
    for (const l of dauerwirkungen(karte)) {
      switch (l.t) {
        case 'terrainBonus':
          m.terrainBonus[l.terrain] = Math.max(
            -1,
            Math.min(2, (m.terrainBonus[l.terrain] ?? 0) + l.amount),
          );
          break;
        case 'tradeDiscount':
          // Karten ergaenzen Haefen und Handelskontor, ersetzen sie aber nicht.
          m.tradeDiscount = Math.min(1, m.tradeDiscount + l.amount);
          break;
        case 'handLimit':
          // Nur die beste aktive Vorratskarte wirkt.
          m.handLimitBonus = Math.max(m.handLimitBonus, l.amount);
          break;
        case 'stormPorts':
          m.stormPorts = true;
          break;
      }
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
