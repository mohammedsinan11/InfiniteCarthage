/**
 * Einzelspieler und Sandkasten.
 *
 * Diese Datei entstand aus einem Fehler: MIN_PLAYERS im Protokoll wurde auf 1
 * gesetzt, createGame hatte aber seine eigene Schranke "mindestens zwei
 * Spieler". Der Typecheck sah nichts, die Tests auch nicht - erst der Klick
 * auf "Allein starten" brachte es ans Licht. Also decken wir den Ablauf
 * jetzt ab, statt ihn nur einmal von Hand zu pruefen.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Action, Game } from '../src/core/rules/reducer';
import {
  legalRoadEdges,
  legalSettlementVertices,
} from '../src/core/rules/placement';
import { currentPlayerId, playerById, totalPoints } from '../src/core/state';
import type { PlayerId } from '../src/core/state';
import { MIN_PLAYERS, NO_TARGET } from '../src/core/protocol';

function solo(targetPoints = NO_TARGET): Game {
  return createGame([{ id: 'p0', name: 'Solo' }], 4242, 77, targetPoints);
}

function must(game: Game, action: Action, actor: PlayerId) {
  const r = applyAction(game, action, actor);
  if (!r.ok) throw new Error(`${action.t} scheiterte: ${r.error}`);
  return r;
}

const phaseOf = (game: Game): string => game.state.phase.t;

function runSetup(game: Game): void {
  let guard = 0;
  while (game.state.phase.t === 'setup') {
    if (guard++ > 50) throw new Error('Aufbau endet nicht');
    const p = currentPlayerId(game.state);
    const ph = game.state.phase;
    if (ph.awaiting === 'settlement') {
      const vs = legalSettlementVertices(game.state, game.world, p, { setup: true });
      expect(vs.length).toBeGreaterThan(0);
      must(game, { t: 'placeSettlement', vertex: vs[0]! }, p);
    } else {
      const es = legalRoadEdges(game.state, game.world, p, ph.lastVertex ?? undefined);
      expect(es.length).toBeGreaterThan(0);
      must(game, { t: 'placeRoad', edge: es[0]! }, p);
    }
  }
}

/** Nach dem Wurf eine eventuelle Sieben abarbeiten: abwerfen, dann waehlen. */
function resolveSeven(game: Game): void {
  let guard = 0;
  while (phaseOf(game) === 'draft') {
    if (guard++ > 20) throw new Error('Fund-Phase endet nicht');
    // Der Fund: die erste angebotene Karte nehmen.
    const cur = currentPlayerId(game.state);
    must(game, { t: 'chooseCard', card: game.state.draft!.options[0]! }, cur);
  }
}

describe('Allein spielen', () => {
  it('erlaubt laut Protokoll einen einzigen Spieler', () => {
    expect(MIN_PLAYERS).toBe(1);
  });

  it('legt eine Partie mit einem Spieler an', () => {
    const game = solo();
    expect(game.state.players).toHaveLength(1);
    expect(game.state.order).toEqual(['p0']);
    expect(game.state.phase).toMatchObject({ t: 'setup', step: 0 });
  });

  it('laeuft die Aufbau-Schlange zweimal ueber denselben Spieler', () => {
    const game = solo();
    const seen: PlayerId[] = [];
    let guard = 0;
    while (game.state.phase.t === 'setup') {
      if (guard++ > 50) throw new Error('Aufbau endet nicht');
      const ph = game.state.phase;
      const p = currentPlayerId(game.state);
      if (ph.awaiting === 'settlement') {
        seen[ph.step] = p;
        must(game, { t: 'placeSettlement', vertex: legalSettlementVertices(game.state, game.world, p, { setup: true })[0]! }, p);
      } else {
        must(game, { t: 'placeRoad', edge: legalRoadEdges(game.state, game.world, p, ph.lastVertex ?? undefined)[0]! }, p);
      }
    }
    expect(seen).toEqual(['p0', 'p0']);
    expect(Object.keys(game.state.buildings)).toHaveLength(2);
    expect(phaseOf(game)).toBe('roll');
  });

  it('gibt den Zug an sich selbst zurueck', () => {
    const game = solo();
    runSetup(game);
    for (let i = 0; i < 3; i++) {
      expect(currentPlayerId(game.state)).toBe('p0');
      must(game, { t: 'roll' }, 'p0');
      resolveSeven(game);
      expect(phaseOf(game)).toBe('main');
      must(game, { t: 'endTurn' }, 'p0');
    }
    expect(game.state.turn).toBe(4);
  });

  it('laesst die Karte auch allein weiterwachsen', () => {
    const game = solo();
    runSetup(game);
    const vorher = game.state.chunks.length;

    for (let i = 0; i < 15; i++) {
      must(game, { t: 'roll' }, 'p0');
      resolveSeven(game);
      if (phaseOf(game) !== 'main') break;
      const p = playerById(game.state, 'p0')!;
      // Baumaterial zuschiessen, damit wirklich nach aussen gebaut wird.
      p.hand.lumber += 2;
      p.hand.brick += 2;
      game.state.bank.lumber -= 2;
      game.state.bank.brick -= 2;
      const es = legalRoadEdges(game.state, game.world, 'p0');
      // Strassen gibt es beliebig viele - gebaut wird, solange Platz ist.
      if (es.length > 0) {
        must(game, { t: 'buildRoad', edge: es[es.length - 1]! }, 'p0');
      }
      must(game, { t: 'endTurn' }, 'p0');
    }
    expect(game.state.chunks.length).toBeGreaterThan(vorher);
  });
});

describe('Sandkasten ohne Siegbedingung', () => {
  it('beendet die Partie nie, egal wie viele Punkte zusammenkommen', () => {
    const game = solo(NO_TARGET);
    runSetup(game);
    must(game, { t: 'roll' }, 'p0');
    resolveSeven(game);
    expect(phaseOf(game)).toBe('main');

    // Genug fuer mehrere Staedte zuschiessen.
    const p = playerById(game.state, 'p0')!;
    p.hand.ore += 12;
    p.hand.grain += 8;

    const meine = Object.entries(game.state.buildings)
      .filter(([, b]) => b.owner === 'p0' && b.type === 'settlement')
      .map(([vk]) => vk);
    for (const vk of meine) must(game, { t: 'buildCity', vertex: vk }, 'p0');

    expect(totalPoints(game.state, 'p0')).toBeGreaterThanOrEqual(4);
    expect(phaseOf(game)).not.toBe('finished');
    // Und es laesst sich normal weiterspielen.
    must(game, { t: 'endTurn' }, 'p0');
    expect(phaseOf(game)).toBe('roll');
  });

  it('beendet sie dagegen bei gesetztem Ziel', () => {
    const game = solo(3);
    runSetup(game);
    must(game, { t: 'roll' }, 'p0');
    resolveSeven(game);
    expect(phaseOf(game)).toBe('main');

    const p = playerById(game.state, 'p0')!;
    p.hand.ore += 3;
    p.hand.grain += 2;
    const mine = Object.entries(game.state.buildings).find(
      ([, b]) => b.owner === 'p0' && b.type === 'settlement',
    )!;
    must(game, { t: 'buildCity', vertex: mine[0] }, 'p0');

    expect(game.state.phase).toEqual({ t: 'finished', winner: 'p0' });
  });
});
