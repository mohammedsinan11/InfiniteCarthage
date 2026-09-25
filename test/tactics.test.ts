import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import { einheitVorlage } from '../src/core/units';
import { clearExpiredTactics, tacticBonus } from '../src/core/rules/tactics';

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

  it('wirkt ueber mehrere Kampfrunden, nicht nur die allererste', () => {
    // tickArmy laeuft bei JEDEM endTurn irgendeines Spielers, nicht einmal je
    // ganzer Runde - ein Fenster von nur einer Runde traf oft daneben, wenn
    // die Truppe ausgerechnet in genau diesem einen Zug nicht kaempfte. Das
    // Fenster deckt jetzt mehrere Runden, bis es tatsaechlich genutzt wird
    // oder ausblasst.
    const game = spiel();
    game.state.players[0]!.tactics.push('schlachtruf');
    const r = applyAction(game, { t: 'playTactic', card: 'schlachtruf', unit: 1 }, 'p0');
    expect(r.ok).toBe(true);
    const start = game.state.turn;
    game.state.turn = start + 1;
    expect(tacticBonus(game.state, 'attack', game.state.units[0]!)).toBe(1);
    game.state.turn = start + 2;
    expect(tacticBonus(game.state, 'attack', game.state.units[0]!)).toBe(1);
    game.state.turn = start + 3;
    expect(tacticBonus(game.state, 'attack', game.state.units[0]!)).toBe(1);
    // Irgendwann laeuft es ab, sonst waere es keine Vorbereitung mehr, sondern
    // ein Dauerbonus.
    game.state.turn = start + 4;
    expect(tacticBonus(game.state, 'attack', game.state.units[0]!)).toBe(0);
  });

  it('raeumt einen abgelaufenen Puffer aus dem Spielstand', () => {
    const game = spiel();
    game.state.players[0]!.tactics.push('schlachtruf');
    applyAction(game, { t: 'playTactic', card: 'schlachtruf', unit: 1 }, 'p0');
    expect(game.state.tacticBuffs).toHaveLength(1);
    game.state.turn += 1;
    clearExpiredTactics(game.state);
    expect(game.state.tacticBuffs).toHaveLength(1);
    game.state.turn += 10;
    clearExpiredTactics(game.state);
    expect(game.state.tacticBuffs).toHaveLength(0);
  });
});
