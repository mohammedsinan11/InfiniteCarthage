import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import { einheitVorlage } from '../src/core/units';
import { tacticBonus } from '../src/core/rules/tactics';

function spiel() {
  const game = createGame([{ id: 'p0', name: 'Alyssa' }], 3, 9, 0);
  game.state.phase = { t: 'main' };
  game.state.units = [
    { id: 1, ...einheitVorlage('held', 0, 0, { owner: 'p0', leben: 2 }) },
    { id: 2, ...einheitVorlage('ritter', 0, 0, { owner: 'p0' }) },
    { id: 3, ...einheitVorlage('bogen', 1, 0, { owner: 'p0' }) },
  ];
  return game;
}

describe('Taktikkarten', () => {
  it('heilt einen Helden und verbraucht die Karte', () => {
    const game = spiel();
    game.state.players[0]!.tactics.push('heilkraeuter');
    const r = applyAction(game, { t: 'playTactic', card: 'heilkraeuter', unit: 1 }, 'p0');
    expect(r.ok).toBe(true);
    expect(game.state.units[0]!.leben).toBe(4);
    expect(game.state.players[0]!.tactics).toEqual([]);
    expect(r.ok && r.events.some((e) => e.t === 'tacticPlayed')).toBe(true);
  });

  it('weist ein ungeeignetes Ziel ab, ohne die Karte zu verlieren', () => {
    const game = spiel();
    game.state.players[0]!.tactics.push('heilkraeuter');
    const r = applyAction(game, { t: 'playTactic', card: 'heilkraeuter', unit: 2 }, 'p0');
    expect(r).toEqual({ ok: false, error: 'Diese Karte braucht einen Helden.' });
    expect(game.state.players[0]!.tactics).toEqual(['heilkraeuter']);
  });

  it('legt Schlachtruf auf alle eigenen Truppen des Feldes', () => {
    const game = spiel();
    game.state.players[0]!.tactics.push('schlachtruf');
    const r = applyAction(game, { t: 'playTactic', card: 'schlachtruf', unit: 1 }, 'p0');
    expect(r.ok).toBe(true);
    expect(game.state.tacticBuffs[0]?.units).toEqual([1, 2]);
    game.state.turn += 1;
    expect(tacticBonus(game.state, 'attack', game.state.units[0]!)).toBe(1);
    expect(tacticBonus(game.state, 'attack', game.state.units[1]!)).toBe(1);
    expect(tacticBonus(game.state, 'attack', game.state.units[2]!)).toBe(0);
  });
});
