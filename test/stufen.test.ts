/**
 * Stufen: wer Feinde erschlaegt, dient sich hoch. Jede Stufe hebt Angriff und
 * Leben, ab NAME_AB_STUFE verdient sich die Einheit einen Namen
 * (core/combat.ts, stufeFuer; rules/army.ts, siegGutschreiben).
 */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { siegGutschreiben } from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { migriereStand } from '../src/core/rules/migration';
import { NAME_AB_STUFE, STUFEN_AB, STUFE_LEBEN, stufeFuer } from '../src/core/combat';
import { WERTE, einheitVorlage } from '../src/core/units';
import { Rng } from '../src/core/rng';

function spiel(): Game {
  const game = createGame([{ id: 'p0', name: 'A' }], 2024, 4711, 0);
  game.state.phase = { t: 'main' };
  game.state.turn = 3;
  return game;
}

/** Eine eigene Einheit auf der Karte. */
function einheit(game: Game, kind: 'ritter' | 'bogen' | 'held' | 'raeuber', id = 1) {
  const u = {
    ...einheitVorlage(kind, 0, 0, kind === 'raeuber' ? { fraktion: 'f:9:9' } : { owner: 'p0' }),
    id,
  };
  game.state.units.push(u);
  return u;
}

describe('Stufen aus Siegen', () => {
  it('die Schwellen liegen fest und steigen an', () => {
    expect(stufeFuer(0)).toBe(0);
    expect(stufeFuer(STUFEN_AB[0]! - 1)).toBe(0);
    expect(stufeFuer(STUFEN_AB[0]!)).toBe(1);
    expect(stufeFuer(STUFEN_AB[1]!)).toBe(2);
    expect(stufeFuer(999)).toBe(STUFEN_AB.length);
    // Jede Schwelle kostet mehr als die vorige.
    for (let i = 1; i < STUFEN_AB.length; i++) {
      expect(STUFEN_AB[i]! - STUFEN_AB[i - 1]!).toBeGreaterThan(0);
    }
  });

  it('zaehlt Siege und hebt an der Schwelle Stufe und Leben', () => {
    const game = spiel();
    const u = einheit(game, 'ritter');
    const rng = new Rng(7);
    const events: ArmyEvent[] = [];

    for (let i = 0; i < STUFEN_AB[0]! - 1; i++) siegGutschreiben(game.state, u, rng, events);
    expect(u.stufe).toBe(0);
    expect(u.leben).toBe(WERTE.ritter.leben);
    expect(events).toEqual([]);

    siegGutschreiben(game.state, u, rng, events);
    expect(u.siege).toBe(STUFEN_AB[0]);
    expect(u.stufe).toBe(1);
    // Das gewonnene Leben gibt es sofort - sonst bliebe der Aufstieg im Kampf wirkungslos.
    expect(u.leben).toBe(WERTE.ritter.leben + STUFE_LEBEN);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ t: 'levelUp', unit: u.id, player: 'p0', stufe: 1 });
  });

  it('ab der zweiten Stufe traegt sie einen Namen - und behaelt ihn', () => {
    const game = spiel();
    const u = einheit(game, 'bogen');
    const rng = new Rng(3);
    const events: ArmyEvent[] = [];
    for (let i = 0; i < STUFEN_AB[NAME_AB_STUFE - 1]!; i++) {
      siegGutschreiben(game.state, u, rng, events);
    }
    expect(u.stufe).toBe(NAME_AB_STUFE);
    expect(u.name).toBeTruthy();
    const name = u.name;
    for (let i = 0; i < 20; i++) siegGutschreiben(game.state, u, rng, events);
    expect(u.name).toBe(name);
  });

  it('Raeuber und Schleime dienen sich nicht hoch', () => {
    const game = spiel();
    const r = einheit(game, 'raeuber', 2);
    const rng = new Rng(5);
    const events: ArmyEvent[] = [];
    for (let i = 0; i < 20; i++) siegGutschreiben(game.state, r, rng, events);
    expect(r.stufe ?? 0).toBe(0);
    expect(r.name).toBeUndefined();
    expect(events).toEqual([]);
  });
});

describe('Alte Staende', () => {
  it('bekommen Siege und Stufe nachgereicht', () => {
    const game = spiel();
    const u = einheit(game, 'ritter');
    delete (u as { siege?: number }).siege;
    delete (u as { stufe?: number }).stufe;
    migriereStand(game.state);
    expect(u.siege).toBe(0);
    expect(u.stufe).toBe(0);
  });
});
