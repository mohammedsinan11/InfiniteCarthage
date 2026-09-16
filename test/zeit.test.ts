/**
 * Tageszeit, Wetter und was beides an den Regeln aendert.
 */

import { describe, it, expect } from 'vitest';
import {
  TAG_RUNDEN,
  WETTER_RUNDEN,
  einheitenRasten,
  istNacht,
  nachtBeginntAt,
  rundenBisTageszeit,
  rundenBisWetter,
  tageszeitOf,
  wetterOf,
} from '../src/core/zeit';
import type { Wetter } from '../src/core/zeit';
import { ROUNDS_PER_SEASON } from '../src/core/season';
import { createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { tickArmy } from '../src/core/rules/army';
import { productionSources } from '../src/core/rules/production';
import { tradeRatio } from '../src/core/rules/trade';
import { SICHT_TURM, einheitVorlage, isLandAt, sightOf } from '../src/core/units';
import { hexDistance, hexKey, hexVertices, hexesInRange, vertexKey } from '../src/core/coords';
import { nestAt } from '../src/core/raiders';
import { ruinAt } from '../src/core/ruins';
import { RESOURCES } from '../src/core/types';
import { ensureGenerated } from '../src/core/world';
import type { UnitState } from '../src/core/state';

const solo = (): Game => createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15);

function ritterBei(q: number, r: number, felder: Partial<UnitState> = {}): UnitState {
  return { ...einheitVorlage('ritter', q, r, { owner: 'p0' }), id: 1, ...felder };
}

/** Der erste Zug mit diesem Wetter, der die Bedingung erfuellt. */
function zugMit(seed: number, wetter: Wetter, passt: (t: number) => boolean = () => true): number {
  for (let t = 1; t < 2000; t++) if (wetterOf(seed, t) === wetter && passt(t)) return t;
  throw new Error(`kein Zug mit ${wetter}`);
}

describe('Tageszeit', () => {
  it('ein Tag dauert zehn Runden: zwei Morgen, vier Tag, zwei Abend, zwei Nacht', () => {
    expect(TAG_RUNDEN).toBe(10);
    expect([1, 2, 3, 6, 7, 8, 9, 10, 11].map(tageszeitOf)).toEqual([
      'morgen',
      'morgen',
      'tag',
      'tag',
      'abend',
      'abend',
      'nacht',
      'nacht',
      'morgen',
    ]);
    expect(istNacht(0)).toBe(false);
  });

  it('meldet den Beginn der Nacht genau einmal je Nacht', () => {
    const beginn = Array.from({ length: 31 }, (_, t) => t).filter(nachtBeginntAt);
    expect(beginn).toEqual([9, 19, 29]);
  });

  it('zaehlt die Runden bis zum Wechsel', () => {
    expect(rundenBisTageszeit(1)).toBe(2);
    expect(rundenBisTageszeit(3)).toBe(4);
    expect(rundenBisTageszeit(10)).toBe(1);
  });
});

describe('Wetter', () => {
  it('ist rein und passt zur Jahreszeit', () => {
    const winter = new Set<string>();
    for (const seed of [2024, 7, 31337]) {
      for (let t = 1; t <= 240; t++) {
        const w = wetterOf(seed, t);
        expect(wetterOf(seed, t)).toBe(w);
        const imJahr = (t - 1) % (4 * ROUNDS_PER_SEASON);
        if (imJahr >= ROUNDS_PER_SEASON && imJahr < 2 * ROUNDS_PER_SEASON) {
          expect(w).not.toBe('schnee'); // Sommer
        }
        if (imJahr >= 3 * ROUNDS_PER_SEASON) {
          expect(['regen', 'gewitter']).not.toContain(w); // Winter
          winter.add(w);
        }
      }
    }
    expect(winter.has('schnee')).toBe(true);
  });

  it('haelt fuenf Runden', () => {
    expect(WETTER_RUNDEN).toBe(5);
    for (const seed of [2024, 7]) {
      for (let t = 2; t <= 5; t++) expect(wetterOf(seed, t)).toBe(wetterOf(seed, 1));
      for (let t = 7; t <= 10; t++) expect(wetterOf(seed, t)).toBe(wetterOf(seed, 6));
    }
    expect(rundenBisWetter(1)).toBe(5);
    expect(rundenBisWetter(5)).toBe(1);
    expect(rundenBisWetter(6)).toBe(5);
  });
});

describe('Sicht', () => {
  it('reicht nachts und im Nebel je ein Feld weniger weit', () => {
    const s = solo().state;
    s.buildings[vertexKey({ q: 0, r: 0, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    s.units.push(ritterBei(20, 0));
    const tag = sightOf(s, 'p0');
    const nacht = sightOf(s, 'p0', true);
    const nebel = sightOf(s, 'p0', { nebel: true });
    const beides = sightOf(s, 'p0', { nacht: true, nebel: true });
    expect(nacht.size).toBeLessThan(tag.size);
    expect(nebel.size).toBe(nacht.size);
    expect(beides.size).toBeLessThan(nacht.size);
    for (const k of beides) expect(nacht.has(k)).toBe(true);
    expect(beides.has('20:0')).toBe(true);
  });

  it('Wachtuerme und der Held sehen weit - auch nachts', () => {
    const s = solo().state;
    // Der Wachturm steht fuer sich auf seiner Ecke (state.tuerme).
    s.tuerme[vertexKey({ q: 0, r: 0, d: 'N' })] = { owner: 'p0', stufe: 1 };
    s.units.push({ ...einheitVorlage('held', 30, 0, { owner: 'p0' }), id: 2 });
    const nacht = sightOf(s, 'p0', true);
    expect(nacht.has(hexKey(SICHT_TURM, 0))).toBe(true);
    expect(nacht.has(hexKey(33, 0))).toBe(true);
    expect(nacht.has(hexKey(34, 0))).toBe(false);
  });
});

describe('Wetter wirkt', () => {
  it('Regen halbiert den Ertrag der Getreidefelder, abgerundet', () => {
    const game = solo();
    const feld = [...game.world.tiles.values()].find((t) => t.terrain === 'field' && t.number !== null)!;
    const [ecke] = hexVertices(feld.q, feld.r).map(vertexKey);
    const vonFeld = (wetter: Wetter) =>
      productionSources(game.state, game.world, feld.number!, wetter)
        .filter((q) => q.hex === hexKey(feld.q, feld.r))
        .map((q) => q.amount);
    game.state.buildings[ecke!] = { owner: 'p0', type: 'city' };
    expect(vonFeld('klar')).toEqual([2]);
    expect(vonFeld('regen')).toEqual([1]);
    game.state.buildings[ecke!] = { owner: 'p0', type: 'settlement' };
    expect(vonFeld('klar')).toEqual([1]);
    expect(vonFeld('gewitter')).toEqual([]);
  });

  it('Sturm schliesst die Haefen', () => {
    const game = solo();
    const s = game.state;
    // Die Startkarte hat nicht immer einen Hafen - weiter aufdecken, bis einer da ist.
    for (let radius = 8; game.world.ports.size === 0 && radius <= 40; radius += 4) {
      ensureGenerated(game.world, { q: 0, r: 0 }, radius);
    }
    const [hafen] = [...game.world.ports.keys()];
    expect(hafen).toBeDefined();
    s.buildings[hafen!] = { owner: 'p0', type: 'settlement' };
    const bester = () => Math.min(...RESOURCES.map((r) => tradeRatio(s, game.world, 'p0', r)));
    s.turn = zugMit(s.worldSeed, 'klar');
    expect(bester()).toBeLessThan(4);
    s.turn = zugMit(s.worldSeed, 'gewitter');
    expect(bester()).toBe(4);
  });

  it('im Schnee ziehen Einheiten nur jede zweite Runde', () => {
    const game = solo();
    const s = game.state;
    const seed = s.worldSeed;
    const mitte = hexesInRange({ q: 0, r: 0 }, 20).find((c) =>
      hexesInRange(c, 3).every((x) => isLandAt(seed, x.q, x.r) && !nestAt(seed, x.q, x.r) && !ruinAt(seed, x.q, x.r)),
    )!;
    const u = ritterBei(mitte.q, mitte.r, { ziel: { q: mitte.q + 3, r: mitte.r } });
    s.units.push(u);
    s.nextUnitId = 2;

    s.turn = zugMit(seed, 'schnee', (t) => t % 2 === 0 && wetterOf(seed, t + 1) === 'schnee');
    expect(einheitenRasten(seed, s.turn)).toBe(true);
    tickArmy(s, game.world, []);
    expect(hexDistance(u, mitte)).toBe(0);

    s.turn += 1;
    expect(einheitenRasten(seed, s.turn)).toBe(false);
    tickArmy(s, game.world, []);
    expect(hexDistance(u, mitte)).toBe(1);
  });
});
