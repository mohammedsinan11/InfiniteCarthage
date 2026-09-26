/** Dynastie: der Held einer neuen Partie folgt dem der letzten (core/lore.ts). */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { benenneHeld } from '../src/core/rules/army';
import { istAhn, wuerfleHeld } from '../src/core/lore';
import { Rng } from '../src/core/rng';

describe('Dynastie', () => {
  it('der neue Held ist Nachfolger des Ahnen: dasselbe Haus, eine Generation weiter', () => {
    const ahn = { ...wuerfleHeld(new Rng(5)), folge: 3 };
    const g = createGame([{ id: 'p0', name: 'S', ahn }], 4242, 77);
    const held = benenneHeld(g.state, g.state.players[0]!);
    expect(held.haus).toBe(ahn.haus);
    expect(held.stamm).toBe(ahn.stamm);
    expect(held.folge).toBe(4);
  });

  it('nimmt nur Ahnen aus den eigenen Namenslisten an', () => {
    const echt = wuerfleHeld(new Rng(9));
    expect(istAhn(echt)).toBe(true);
    expect(istAhn({ ...echt, haus: '<b>Boese</b>' })).toBe(false);
    expect(istAhn({ ...echt, stamm: 'Xyz' })).toBe(false);
    expect(istAhn({ ...echt, folge: 1000 })).toBe(false);
    expect(istAhn(null)).toBe(false);
    const g = createGame([{ id: 'p0', name: 'S', ahn: { ...echt, haus: 'Fremd' } }], 4242, 77);
    expect(g.state.players[0]!.ahn).toBeUndefined();
  });
});
