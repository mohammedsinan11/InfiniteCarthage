/**
 * Verbaende: alle eigenen Einheiten eines Feldes ziehen auf einen Befehl
 * gemeinsam - im Tempo des Langsamsten, und sie warten, solange einer kaempft.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { tickArmy } from '../src/core/rules/army';
import { hexDistance, hexesInRange } from '../src/core/coords';
import { einheitVorlage, isLandAt } from '../src/core/units';
import { ensureGenerated } from '../src/core/world';
import { nestAt } from '../src/core/raiders';
import { ruinAt } from '../src/core/ruins';
import type { UnitState } from '../src/core/state';

const ORIGIN = { q: 0, r: 0 };
const solo = (): Game => createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15);

function must(game: Game, action: Parameters<typeof applyAction>[1]) {
  const res = applyAction(game, action, 'p0');
  if (!res.ok) throw new Error(res.error);
}

function landFlaeche(game: Game, radius: number) {
  const seed = game.state.worldSeed;
  const h = hexesInRange(ORIGIN, 20).find((c) =>
    hexesInRange(c, radius).every(
      (x) => isLandAt(seed, x.q, x.r) && !nestAt(seed, x.q, x.r) && !ruinAt(seed, x.q, x.r),
    ),
  );
  if (!h) throw new Error('keine freie Landflaeche');
  // Befehle gehen nur auf aufgedecktes Land.
  ensureGenerated(game.world, h, radius + 2);
  return h;
}

function einheit(game: Game, u: Omit<UnitState, 'id'>): UnitState {
  const neu = { ...u, id: game.state.nextUnitId++ };
  game.state.units.push(neu);
  return neu;
}

const von = (game: Game, id: number) => game.state.units.find((x) => x.id === id)!;

describe('Verbaende', () => {
  it('ein Befehl mit Verband schickt alle eigenen Einheiten des Feldes - im Tempo des Langsamsten', () => {
    const game = solo();
    game.state.phase = { t: 'main' };
    game.state.turn = 1;
    const mitte = landFlaeche(game, 4);
    const held = einheit(game, einheitVorlage('held', mitte.q, mitte.r, { owner: 'p0' }));
    const r1 = einheit(game, einheitVorlage('ritter', mitte.q, mitte.r, { owner: 'p0' }));
    const r2 = einheit(game, einheitVorlage('ritter', mitte.q, mitte.r, { owner: 'p0' }));
    const fremd = einheit(game, einheitVorlage('ritter', mitte.q, mitte.r, { owner: 'p9' }));
    const ziel = { q: mitte.q + 4, r: mitte.r };

    must(game, { t: 'orderUnit', unit: r1.id, ...ziel, verband: true });
    for (const id of [held.id, r1.id, r2.id]) {
      expect(von(game, id).ziel).toEqual(ziel);
      expect(von(game, id).verband).toBe(r1.id);
    }
    expect(von(game, fremd.id).ziel).toBeNull();

    tickArmy(game.state, game.world, []);
    // Der Held zoege allein zwei Felder - im Verband geht er mit den Rittern.
    for (const id of [held.id, r1.id, r2.id]) expect(hexDistance(von(game, id), ziel)).toBe(3);
  });

  it('ohne Verband zieht nur die eine Einheit, und am Ziel loest sich der Verband', () => {
    const game = solo();
    game.state.phase = { t: 'main' };
    game.state.turn = 1;
    const mitte = landFlaeche(game, 4);
    const r1 = einheit(game, einheitVorlage('ritter', mitte.q, mitte.r, { owner: 'p0' }));
    const r2 = einheit(game, einheitVorlage('ritter', mitte.q, mitte.r, { owner: 'p0' }));

    must(game, { t: 'orderUnit', unit: r1.id, q: mitte.q + 2, r: mitte.r });
    expect(von(game, r1.id).verband).toBeNull();
    expect(von(game, r2.id).ziel).toBeNull();

    must(game, { t: 'orderUnit', unit: r2.id, q: mitte.q + 1, r: mitte.r, verband: true });
    // r1 hatte schon einen eigenen Befehl, steht aber noch auf dem Feld - er zieht mit.
    expect(von(game, r1.id).verband).toBe(r2.id);
    tickArmy(game.state, game.world, []);
    for (const id of [r1.id, r2.id]) {
      expect(hexDistance(von(game, id), { q: mitte.q + 1, r: mitte.r })).toBe(0);
      expect(von(game, id).verband).toBeNull();
      expect(von(game, id).ziel).toBeNull();
    }
  });

  it('ein Verband wartet, solange einer von ihnen kaempft', () => {
    const game = solo();
    game.state.turn = 1;
    const mitte = landFlaeche(game, 4);
    const ziel = { q: mitte.q + 3, r: mitte.r };
    const a = einheit(game, { ...einheitVorlage('ritter', mitte.q - 1, mitte.r, { owner: 'p0' }), ziel, verband: 1 });
    einheit(game, { ...einheitVorlage('ritter', mitte.q + 1, mitte.r, { owner: 'p0' }), ziel, verband: 1 });
    einheit(game, { ...einheitVorlage('raeuber', mitte.q + 1, mitte.r, { fraktion: 'f:99:99', auftrag: 'heimkehr' }), leben: 99 });

    tickArmy(game.state, game.world, []);
    expect(a.q).toBe(mitte.q - 1);
  });
});
