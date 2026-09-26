/**
 * Untergang: das letzte Gebaeude kann fallen, danach bleibt eine Frist.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game, GameEvent } from '../src/core/rules/reducer';
import { UNTERGANG_ZUEGE, imUntergang, untergangRunde } from '../src/core/rules/untergang';
import { COST_SETTLEMENT } from '../src/core/rules/costs';
import { legalSettlementVertices } from '../src/core/rules/placement';
import { redactStateFor } from '../src/core/redact';
import { hexesInRange, vertexKey } from '../src/core/coords';

const ORIGIN = { q: 0, r: 0 };

function spiel(n = 1): Game {
  const game = createGame(
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `S${i}` })),
    2024,
    4711,
    15,
  );
  game.state.phase = { t: 'main' };
  game.state.turn = 10;
  return game;
}

const dorf = (game: Game, id: string, q: number, r: number) => {
  game.state.buildings[vertexKey({ q, r, d: 'N' })] = { owner: id, type: 'settlement' };
};

describe('Untergang', () => {
  it('beginnt mit dem Fall des letzten Gebaeudes eine Frist', () => {
    const game = spiel();
    const events: GameEvent[] = [];
    untergangRunde(game.state, events);
    expect(game.state.players[0]!.untergang).toBe(10 + UNTERGANG_ZUEGE);
    expect(events).toEqual([{ t: 'fall', player: 'p0', bis: 10 + UNTERGANG_ZUEGE }]);
    expect(imUntergang(game.state, 'p0')).toBe(true);
  });

  it('endet die Frist, sobald wieder ein Gebaeude steht', () => {
    const game = spiel();
    untergangRunde(game.state, []);
    dorf(game, 'p0', 3, 3);
    const events: GameEvent[] = [];
    game.state.turn = 11;
    untergangRunde(game.state, events);
    expect(game.state.players[0]!.untergang).toBeNull();
    expect(events).toEqual([{ t: 'recovered', player: 'p0' }]);
  });

  it('besiegt, wer die Frist verstreichen laesst - allein ist die Partie dann verloren', () => {
    const game = spiel();
    untergangRunde(game.state, []);
    game.state.turn = 10 + UNTERGANG_ZUEGE;
    const events: GameEvent[] = [];
    untergangRunde(game.state, events);
    expect(game.state.players[0]!.besiegt).toBe(true);
    expect(game.state.phase).toEqual({ t: 'finished', winner: null });
    expect(events.map((e) => e.t)).toEqual(['defeated', 'lost']);
  });

  it('macht den letzten Verbliebenen zum Sieger', () => {
    const game = spiel(2);
    dorf(game, 'p1', 5, 5);
    untergangRunde(game.state, []);
    game.state.turn = 10 + UNTERGANG_ZUEGE * 2;
    const events: GameEvent[] = [];
    untergangRunde(game.state, events);
    expect(game.state.players[0]!.besiegt).toBe(true);
    expect(game.state.phase).toEqual({ t: 'finished', winner: 'p1' });
    expect(events.map((e) => e.t)).toEqual(['defeated', 'win']);
  });

  it('zaehlt vor dem ersten Aufbau nicht als Fall', () => {
    const game = spiel();
    game.state.phase = { t: 'setup', step: 0, awaiting: 'settlement', lastVertex: null };
    untergangRunde(game.state, []);
    expect(game.state.players[0]!.untergang).toBeNull();
  });

  it('laesst im Untergang eine Siedlung ohne eigene Strasse zu - und nur dann', () => {
    const game = spiel();
    const legal = () => legalSettlementVertices(game.state, game.world, 'p0', { setup: false });
    expect(legal()).toHaveLength(0);

    untergangRunde(game.state, []);
    for (const r of Object.keys(game.state.players[0]!.hand)) (game.state.players[0]!.hand as Record<string, number>)[r] = 5;
    const ecke = legalSettlementVertices(game.state, game.world, 'p0', { setup: true })[0]!;
    const res = applyAction(game, { t: 'buildSettlement', vertex: ecke }, 'p0');
    expect(res.ok).toBe(true);
    expect(game.state.buildings[ecke]).toMatchObject({ owner: 'p0', type: 'settlement' });
    // Bezahlt wird zum gewohnten Preis.
    expect(game.state.players[0]!.hand.grain).toBe(5 - (COST_SETTLEMENT.grain ?? 0));
  });

  it('verweigert den Notbau, solange noch ein Gebaeude steht', () => {
    const game = spiel();
    const hex = hexesInRange(ORIGIN, 2)[0]!;
    dorf(game, 'p0', hex.q, hex.r);
    const ecke = legalSettlementVertices(game.state, game.world, 'p0', { setup: true })[0]!;
    for (const r of Object.keys(game.state.players[0]!.hand)) (game.state.players[0]!.hand as Record<string, number>)[r] = 5;
    expect(applyAction(game, { t: 'buildSettlement', vertex: ecke }, 'p0').ok).toBe(false);
  });

  it('verweigert einem Besiegten jede Aktion und ueberspringt ihn in der Reihenfolge', () => {
    const game = spiel(3);
    dorf(game, 'p0', 2, 2);
    dorf(game, 'p2', 8, 2);
    game.state.players[1]!.besiegt = true;
    expect(applyAction(game, { t: 'endTurn' }, 'p0').ok).toBe(true);
    expect(game.state.order[game.state.current]).toBe('p2');
    const res = applyAction(game, { t: 'roll' }, 'p1');
    expect(res).toEqual({ ok: false, error: 'Dein Reich ist gefallen.' });
  });

  it('erreicht ueber den Zug ende den Fall: das brennende letzte Dorf faellt', () => {
    const game = spiel();
    const ecke = { q: 4, r: 4, d: 'N' as const };
    game.state.buildings[vertexKey(ecke)] = { owner: 'p0', type: 'settlement' };
    game.state.braende.push({ key: vertexKey(ecke), art: 'dorf', owner: 'p0', fraktion: 'f:1:1', q: 4, r: 4, seit: game.state.turn });
    const res = applyAction(game, { t: 'endTurn' }, 'p0');
    expect(res.ok).toBe(true);
    expect(res.ok && res.events.map((e) => e.t)).toContain('burnedDown');
    expect(res.ok && res.events.map((e) => e.t)).toContain('fall');
    expect(game.state.buildings[vertexKey(ecke)]).toBeUndefined();
    expect(game.state.players[0]!.untergang).not.toBeNull();
    const oeffentlich = redactStateFor(game.state, 'p0').players[0]!;
    expect(oeffentlich.untergang).toBe(game.state.players[0]!.untergang);
    expect(oeffentlich.besiegt).toBe(false);
  });
});
