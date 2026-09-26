/** Punkte-, Regel-, Sieben- und Schildkarten (cards/effects.ts). */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame, wuerfelFuer } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { productionSources } from '../src/core/rules/production';
import { raidLoss } from '../src/core/rules/raid';
import { kartenPunkte, modifiersOf } from '../src/core/cards/effects';
import { publicPoints } from '../src/core/state';
import { hexKey, hexVertices, vertexKey } from '../src/core/coords';
import { legalRoadEdges, legalSettlementVertices } from '../src/core/rules/placement';
import { currentPlayerId } from '../src/core/state';

function solo(): Game {
  return createGame([{ id: 'p0', name: 'S' }], 4242, 77);
}

function dorfAn(g: Game, zahl: number) {
  const t = [...g.world.tiles.values()].find((x) => x.number === zahl && x.terrain !== 'desert' && x.terrain !== 'water')!;
  const ecke = vertexKey(hexVertices(t.q, t.r)[0]!);
  g.state.buildings[ecke] = { owner: 'p0', type: 'settlement' };
  return hexKey(t.q, t.r);
}

describe('Regelkarten', () => {
  it('Gluecksstraehne: bei einer 6 liefern auch die 8er-Felder - nur fuer den Besitzer', () => {
    const g = solo();
    g.state.buildings = {};
    const acht = dorfAn(g, 8);
    const ohne = productionSources(g.state, g.world, 6).filter((q) => q.hex === acht);
    expect(ohne).toHaveLength(0);
    g.state.players[0]!.activeCards = ['gluecksstraehne'];
    const mit = productionSources(g.state, g.world, 6).filter((q) => q.hex === acht);
    expect(mit.length).toBeGreaterThan(0);
  });

  it('Doppelernte: bei 2 und 12 doppelter Ertrag', () => {
    const g = solo();
    g.state.buildings = {};
    const zwoelf = dorfAn(g, 12);
    const menge = () =>
      productionSources(g.state, g.world, 12)
        .filter((q) => q.hex === zwoelf)
        .reduce((n, q) => n + q.amount, 0);
    const vorher = menge();
    g.state.players[0]!.activeCards = ['doppelernte'];
    expect(menge()).toBe(vorher * 2);
  });

  it('Schlangenaugen: 2 und 12 liefern fuereinander mit', () => {
    const m = modifiersOf(['schlangenaugen']);
    expect(m.alsZahl).toEqual([
      [2, 12],
      [12, 2],
    ]);
  });
});

describe('Schild und Sieben', () => {
  it('Wehrhafte Doerfer: eine Karte weniger je Pluenderung', () => {
    const g = solo();
    g.state.players[0]!.hand.lumber = 5;
    expect(raidLoss(g.state, 'p0', 2)).toBe(2);
    g.state.players[0]!.activeCards = ['wehrhafte_doerfer'];
    expect(raidLoss(g.state, 'p0', 2)).toBe(1);
  });

  it('Glueckliche Hand: bei einer 7 zwei Rohstoffe fuer den Besitzer', () => {
    const g = solo();
    // Aufbau
    while (g.state.phase.t === 'setup') {
      const p = currentPlayerId(g.state);
      const ph = g.state.phase;
      if (ph.awaiting === 'settlement') applyAction(g, { t: 'placeSettlement', vertex: legalSettlementVertices(g.state, g.world, p, { setup: true })[0]! }, p);
      else applyAction(g, { t: 'placeRoad', edge: legalRoadEdges(g.state, g.world, p, ph.lastVertex ?? undefined)[0]! }, p);
    }
    g.state.players[0]!.activeCards = ['glueckliche_hand'];
    // Einen Zug finden, in dem eine 7 faellt.
    let t = g.state.turn;
    while (wuerfelFuer(g.state.secretSeed, t).reduce((a, b) => a + b, 0) !== 7) t++;
    g.state.turn = t;
    const vorher = Object.values(g.state.players[0]!.hand).reduce((a, b) => a + b, 0);
    const r = applyAction(g, { t: 'roll' }, 'p0');
    expect(r.ok).toBe(true);
    const nachher = Object.values(g.state.players[0]!.hand).reduce((a, b) => a + b, 0);
    expect(nachher - vorher).toBe(2);
  });
});

describe('Punktekarten', () => {
  it('je 2 Staedte ein Punkt - nur solange die Karte aktiv ist', () => {
    const g = solo();
    g.state.buildings = {
      a: { owner: 'p0', type: 'city' },
      b: { owner: 'p0', type: 'city' },
      c: { owner: 'p0', type: 'city' },
    };
    expect(publicPoints(g.state, 'p0')).toBe(6);
    g.state.players[0]!.activeCards = ['baumeistergilde'];
    expect(kartenPunkte(g.state, 'p0')).toBe(1);
    expect(publicPoints(g.state, 'p0')).toBe(7);
    g.state.players[0]!.activeCards = ['grosse_bauhuette'];
    expect(publicPoints(g.state, 'p0')).toBe(9);
  });

  it('Lager, Ruinen und Auftraege zaehlen aus der Chronik', () => {
    const g = solo();
    g.state.chronik!.stats.p0!.lager = 4;
    g.state.chronik!.stats.p0!.ruinen = 3;
    g.state.players[0]!.activeCards = ['trophaeenhalle', 'kartograph'];
    expect(kartenPunkte(g.state, 'p0')).toBe(2 + 1);
  });
});
