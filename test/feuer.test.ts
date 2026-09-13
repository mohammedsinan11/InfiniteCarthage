/**
 * Feuer: es brennt erst, laesst sich loeschen und brennt sonst ab.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { brandRunde, feuerLegen, loeschFelder } from '../src/core/rules/feuer';
import type { FeuerEvent } from '../src/core/rules/feuer';
import {
  edgeEndpoints,
  edgeKey,
  hexEdges,
  hexesInRange,
  parseEdgeKey,
  vertexAdjacentHexes,
  vertexKey,
} from '../src/core/coords';
import { einheitVorlage, isLandAt } from '../src/core/units';
import { nestAt } from '../src/core/raiders';
import { ruinAt } from '../src/core/ruins';
import { Rng } from '../src/core/rng';
import { RESOURCES } from '../src/core/types';
import { regnet, wetterOf } from '../src/core/zeit';
import type { Brand, GameState } from '../src/core/state';

const ORIGIN = { q: 0, r: 0 };
const solo = (geheim = 4711): Game => createGame([{ id: 'p0', name: 'Solo' }], 2024, geheim, 15);

function landFlaeche(game: Game, radius: number, suche = 20) {
  const seed = game.state.worldSeed;
  const h = hexesInRange(ORIGIN, suche).find((c) =>
    hexesInRange(c, radius).every(
      (x) => isLandAt(seed, x.q, x.r) && !nestAt(seed, x.q, x.r) && !ruinAt(seed, x.q, x.r),
    ),
  );
  if (!h) throw new Error('keine freie Landflaeche');
  return h;
}

/** Ein Zug, in dem es und im naechsten nicht regnet. */
function trocken(s: GameState): number {
  for (let t = 1; t < 500; t++) {
    if (!regnet(wetterOf(s.worldSeed, t)) && !regnet(wetterOf(s.worldSeed, t + 1))) return t;
  }
  throw new Error('kein trockener Zug');
}

/** Ein Dorf mit einer Strasse daran, die gerade brennt. */
function brennendeStrasse(game: Game, suche = 20) {
  const s = game.state;
  const mitte = landFlaeche(game, 2, suche);
  const ecke = vertexKey({ q: mitte.q, r: mitte.r, d: 'N' });
  s.buildings[ecke] = { owner: 'p0', type: 'settlement' };
  const ek = hexEdges(mitte.q, mitte.r)
    .map(edgeKey)
    .find((k) => edgeEndpoints(parseEdgeKey(k)).some((v) => vertexKey(v) === ecke))!;
  s.roads[ek] = 'p0';
  s.turn = trocken(s);
  const brand: Brand = { key: ek, art: 'strasse', owner: 'p0', fraktion: 'f:9:9', q: mitte.q, r: mitte.r, seit: s.turn };
  s.braende.push(brand);
  return { mitte, ecke, ek, brand };
}

describe('Feuer', () => {
  it('brennt ab, sobald sein Besitzer einen ganzen Zug hat verstreichen lassen', () => {
    const game = solo();
    const s = game.state;
    const { ek } = brennendeStrasse(game);
    const events: FeuerEvent[] = [];

    brandRunde(s, 'p9', s.turn, events); // der Zug eines anderen
    brandRunde(s, 'p0', s.turn - 1, events); // ein eigener Zug, der vor dem Feuer lag
    expect(s.braende).toHaveLength(1);
    expect(s.roads[ek]).toBe('p0');

    brandRunde(s, 'p0', s.turn, events);
    expect(s.braende).toHaveLength(0);
    expect(s.roads[ek]).toBeUndefined();
    expect(s.asche[ek]).toBe('p0');
    expect(events.map((e) => e.t)).toEqual(['burnedDown']);
  });

  it('allein brennt es am Ende des naechsten Zugs ab', () => {
    const game = solo();
    const { ek } = brennendeStrasse(game);
    game.state.phase = { t: 'main' };
    const res = applyAction(game, { t: 'endTurn' }, 'p0');
    expect(res.ok).toBe(true);
    expect(game.state.roads[ek]).toBeUndefined();
    expect(game.state.asche[ek]).toBe('p0');
  });

  it('laesst sich mit einer Rohstoffkarte loeschen', () => {
    const game = solo();
    const s = game.state;
    const { ek } = brennendeStrasse(game);
    s.phase = { t: 'main' };
    for (const r of RESOURCES) s.players[0]!.hand[r] = 0;
    expect(applyAction(game, { t: 'putOut', key: ek, mit: 'wool' }, 'p0').ok).toBe(false);

    game.state.players[0]!.hand.wool = 1;
    const bank = game.state.bank.wool;
    const res = applyAction(game, { t: 'putOut', key: ek, mit: 'wool' }, 'p0');
    expect(res.ok).toBe(true);
    expect(game.state.braende).toHaveLength(0);
    expect(game.state.players[0]!.hand.wool).toBe(0);
    expect(game.state.bank.wool).toBe(bank + 1);
    expect(game.state.roads[ek]).toBe('p0');
  });

  it('ein Ritter oder der Held daneben loescht von selbst', () => {
    for (const kind of ['ritter', 'held'] as const) {
      const game = solo();
      const s = game.state;
      const { brand, ek } = brennendeStrasse(game);
      const [feld] = loeschFelder(brand);
      s.units.push({ ...einheitVorlage(kind, feld!.q, feld!.r, { owner: 'p0' }), id: 1 });
      const events: FeuerEvent[] = [];
      brandRunde(s, 'p0', s.turn, events);
      expect(s.braende).toHaveLength(0);
      expect(s.roads[ek]).toBe('p0');
      expect(events).toMatchObject([{ t: 'extinguished', durch: kind }]);
    }
  });

  it('der Regen loescht', () => {
    const game = solo();
    const s = game.state;
    const { ek } = brennendeStrasse(game);
    for (let t = 1; t < 500; t++) {
      if (regnet(wetterOf(s.worldSeed, t))) {
        s.turn = t;
        break;
      }
    }
    const events: FeuerEvent[] = [];
    brandRunde(s, 'p0', s.turn, events);
    expect(s.roads[ek]).toBe('p0');
    expect(events).toMatchObject([{ t: 'extinguished', durch: 'regen' }]);
  });

  it('ein Wachturm laesst Brandstifter nicht an Haus und Strassen', () => {
    const game = solo();
    const s = game.state;
    const mitte = landFlaeche(game, 2);
    const ecke = { q: mitte.q, r: mitte.r, d: 'N' as const };
    const vk = vertexKey(ecke);
    s.buildings[vk] = { owner: 'p0', type: 'city', turm: true };
    const an = vertexAdjacentHexes(ecke).find((h) => isLandAt(s.worldSeed, h.q, h.r))!;
    for (const e of hexEdges(an.q, an.r)) {
      const k = edgeKey(e);
      if (edgeEndpoints(e).some((v) => vertexKey(v) === vk)) s.roads[k] = 'p0';
    }
    const pluenderer = { ...einheitVorlage('raeuber', an.q, an.r, { fraktion: 'f:9:9' }), id: 7 };
    let abgewehrt = false;
    for (let i = 1; i <= 40; i++) {
      const events: FeuerEvent[] = [];
      feuerLegen(s, new Rng(i), pluenderer, 'p0', events);
      expect(s.braende).toHaveLength(0);
      if (events.some((e) => e.t === 'burnPrevented')) abgewehrt = true;
    }
    expect(abgewehrt).toBe(true);
  });

  it('eine abgebrannte Strasse baut ihr Besitzer fuer ein Holz wieder auf', () => {
    const game = solo();
    const s = game.state;
    const { ek } = brennendeStrasse(game, 4);
    s.braende = [];
    delete s.roads[ek];
    s.phase = { t: 'main' };
    for (const r of RESOURCES) s.players[0]!.hand[r] = 0;
    s.players[0]!.hand.lumber = 1;

    expect(applyAction(game, { t: 'buildRoad', edge: ek }, 'p0').ok).toBe(false);
    game.state.asche[ek] = 'p0';
    const res = applyAction(game, { t: 'buildRoad', edge: ek }, 'p0');
    expect(res.ok).toBe(true);
    expect(game.state.roads[ek]).toBe('p0');
    expect(game.state.asche[ek]).toBeUndefined();
    expect(game.state.players[0]!.hand.lumber).toBe(0);
  });
});
