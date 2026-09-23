import { describe, expect, it } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { ruhmAusEreignissen } from '../src/core/rules/ruhm';

describe('Ruhm', () => {
  it('belohnt Lager, Auftraege und Veteranenmeilensteine', () => {
    const game = createGame([{ id: 'p0', name: 'A' }], 1, 2, 0);
    const out: Parameters<typeof ruhmAusEreignissen>[2] extends infer T ? T : never = [];
    ruhmAusEreignissen(
      game.state,
      [
        { t: 'nestDestroyed', players: ['p0'] },
        { t: 'questDone', player: 'p0' },
        { t: 'levelUp', player: 'p0', stufe: 2 },
        { t: 'levelUp', player: 'p0', stufe: 3 },
      ],
      out,
    );
    expect(game.state.players[0]!.ruhm).toBe(4);
    expect(game.state.ruhmreichster).toBeNull();
  });

  it('vergibt den Titel ab fuenf Ruhm und behaelt ihn bei Gleichstand', () => {
    const game = createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], 1, 2, 0);
    game.state.players[0]!.ruhm = 4;
    game.state.players[1]!.ruhm = 5;
    ruhmAusEreignissen(game.state, [{ t: 'questDone', player: 'p0' }], []);
    expect(game.state.ruhmreichster).toBe('p0');
    // Gleichstand: der bestehende Titel wechselt nicht.
    ruhmAusEreignissen(game.state, [], []);
    expect(game.state.ruhmreichster).toBe('p0');
  });

  it('belohnt den Sieg ueber den Morast mit drei Ruhm', () => {
    const game = createGame([{ id: 'p0', name: 'A' }], 1, 2, 0);
    ruhmAusEreignissen(
      game.state,
      [{ t: 'fight', seiten: ['p:p0', 'morast'], verluste: [{ kind: 'morast' }] }],
      [],
    );
    expect(game.state.players[0]!.ruhm).toBe(3);
  });
});
