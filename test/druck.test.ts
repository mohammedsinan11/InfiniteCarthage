/** Druck: Verderb ueber der Handkartengrenze (core/verderb.ts), Aufholen der Bots (core/aufholen.ts). */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { handSize } from '../src/core/state';
import { verderbAmZugende, verderbZahl } from '../src/core/verderb';
import { botAufholen } from '../src/core/aufholen';
import { limitFor } from '../src/core/rules/handlimit';

const sammeln = () => {
  const ev: unknown[] = [];
  return { ev, push: (...e: unknown[]) => ev.push(...e) };
};

describe('Verderb', () => {
  it('die Haelfte des Ueberschusses, aufgerundet', () => {
    expect(verderbZahl(7, 7)).toBe(0);
    expect(verderbZahl(8, 7)).toBe(1);
    expect(verderbZahl(12, 7)).toBe(3);
  });

  it('nimmt vom groessten Stapel und nur mit Ereignissen', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 1, 2, 10, { ereignisse: true });
    const p = g.state.players[0]!;
    p.hand = { lumber: 10, brick: 1, wool: 1, grain: 1, ore: 1 };
    const grenze = limitFor(g.state, 'p0');
    const vorher = handSize(p.hand);
    const e = sammeln();
    verderbAmZugende(g.state, 'p0', e);
    expect(handSize(p.hand)).toBe(vorher - verderbZahl(vorher, grenze));
    expect(p.hand.brick).toBe(1);
    expect(e.ev).toHaveLength(1);

    const alt = createGame([{ id: 'p0', name: 'S' }], 1, 2, 10, {});
    alt.state.players[0]!.hand = { lumber: 20, brick: 0, wool: 0, grain: 0, ore: 0 };
    verderbAmZugende(alt.state, 'p0', sammeln());
    expect(alt.state.players[0]!.hand.lumber).toBe(20);
  });
});

describe('Aufholen', () => {
  it('ein Bot drei Punkte hinten bekommt seine knappste Sorte, ein Mensch nie', () => {
    const g = createGame([{ id: 'p0', name: 'S' }, { id: 'bot_a', name: 'Hanno' }], 1, 2, 10, { ereignisse: true, bots: ['bot_a'] });
    // Drei Doerfer fuer den Menschen, keins fuer den Bot.
    g.state.buildings = { a: { owner: 'p0', type: 'settlement' }, b: { owner: 'p0', type: 'settlement' }, c: { owner: 'p0', type: 'settlement' } } as typeof g.state.buildings;
    const bot = g.state.players[1]!;
    bot.hand = { lumber: 2, brick: 2, wool: 0, grain: 2, ore: 2 };
    const e = sammeln();
    botAufholen(g.state, 'bot_a', e);
    expect(bot.hand.wool).toBe(1);
    botAufholen(g.state, 'p0', e);
    expect(e.ev).toHaveLength(1);
  });
});
