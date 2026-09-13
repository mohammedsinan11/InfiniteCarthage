/**
 * Balance der Karten: jede Karte liegt in der Wertspanne ihrer Seltenheit.
 */

import { describe, it, expect } from 'vitest';
import { CARDS } from '../src/core/cards/catalog';
import { RARITY_ORDER, dauerwirkungen } from '../src/core/cards/types';
import { WERT_SPANNE, kartenWert } from '../src/core/cards/wert';
import { modifiersOf } from '../src/core/cards/effects';

describe('Kartenwert', () => {
  it('jede Karte liegt in der Spanne ihrer Seltenheit', () => {
    const ausserhalb = CARDS.filter((c) => {
      const [min, max] = WERT_SPANNE[c.rarity];
      const w = kartenWert(c);
      return w < min || w > max;
    }).map((c) => `${c.id} (${c.rarity}): ${kartenWert(c)}`);
    expect(ausserhalb).toEqual([]);
  });

  it('jede Stufe hat mindestens zwei Karten, und die Kennungen sind eindeutig', () => {
    for (const stufe of RARITY_ORDER) {
      expect(CARDS.filter((c) => c.rarity === stufe).length).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  });

  it('mehrere Dauerwirkungen auf einer Karte wirken alle', () => {
    const tal = CARDS.find((c) => c.id === 'fruchtbares_tal')!;
    expect(dauerwirkungen(tal)).toHaveLength(2);
    const m = modifiersOf(['fruchtbares_tal']);
    expect(m.terrainBonus.field).toBe(1);
    expect(m.terrainBonus.pasture).toBe(1);
  });
});
