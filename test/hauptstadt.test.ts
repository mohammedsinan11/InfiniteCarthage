/**
 * Die Hauptstadt: sechs eigene Strassen und drei eigene Staedte ringsum
 * schliessen ein Feld, und darauf entsteht - einmal je Spieler - die Hauptstadt.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { FAST_GESCHLOSSEN, hauptstadtFelder, hauptstadtHindernis, umlandVon } from '../src/core/rules/hauptstadt';
import { COST_CAPITAL } from '../src/core/rules/costs';
import { edgeKey, hexEdges, hexKey, hexVertices, hexesInRange, vertexKey } from '../src/core/coords';
import { terrainAt } from '../src/core/worldgen';
import { HAUPTSTADT_PUNKTE, publicPoints } from '../src/core/state';
import { redactStateFor } from '../src/core/redact';
import { RESOURCES } from '../src/core/types';

function spiel(): Game {
  const game = createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], 2024, 4711, 0);
  game.state.phase = { t: 'main' };
  game.state.turn = 3;
  return game;
}

/** Ein Landfeld nahe der Mitte, dessen Nachbarn auch Land sind. */
function landFeld(game: Game, abstand = 0) {
  const seed = game.state.worldSeed;
  const felder = hexesInRange({ q: 0, r: 0 }, 12).filter((h) =>
    hexesInRange(h, 1).every((x) => terrainAt(seed, x.q, x.r) !== 'water'),
  );
  return felder[abstand]!;
}

/** Ring um ein Feld legen: alle sechs Strassen, an den Ecken 0/2/4 (oder 1/3/5) die angegebenen Gebaeude. */
function ring(game: Game, h: { q: number; r: number }, arten: ('city' | 'settlement' | null)[], owner = 'p0', satz = [0, 2, 4]) {
  for (const e of hexEdges(h.q, h.r)) game.state.roads[edgeKey(e)] = owner;
  const ecken = hexVertices(h.q, h.r).map(vertexKey);
  satz.forEach((i, n) => {
    const art = arten[n];
    if (art) game.state.buildings[ecken[i]!] = { owner, type: art };
  });
}

function geben(game: Game, pid: string) {
  const p = game.state.players.find((x) => x.id === pid)!;
  for (const r of RESOURCES) p.hand[r] += COST_CAPITAL[r] ?? 0;
}

describe('Umland', () => {
  it('drei Staedte und sechs Strassen schliessen das Feld', () => {
    const game = spiel();
    const h = landFeld(game);
    ring(game, h, ['city', 'city', 'city']);
    expect(umlandVon(game.state, 'p0', h.q, h.r)).toMatchObject({ strassen: 6, staedte: 3, fehlt: 0, bereit: true });
  });

  it('Doerfer zaehlen noch nicht - sie fehlen wie eine Stadt', () => {
    const game = spiel();
    const h = landFeld(game);
    ring(game, h, ['city', 'settlement', 'settlement']);
    const u = umlandVon(game.state, 'p0', h.q, h.r)!;
    expect(u).toMatchObject({ staedte: 1, doerfer: 2, fehlt: 2, bereit: false });
    expect(u.fehlt).toBeLessThanOrEqual(FAST_GESCHLOSSEN);
  });

  it('der andere Eckensatz zaehlt genauso', () => {
    const game = spiel();
    const h = landFeld(game);
    ring(game, h, ['city', 'city', 'city'], 'p0', [1, 3, 5]);
    expect(umlandVon(game.state, 'p0', h.q, h.r)?.bereit).toBe(true);
  });

  it('eine fremde Strasse oder Stadt verhindert den Ring', () => {
    const game = spiel();
    const h = landFeld(game);
    ring(game, h, ['city', 'city', 'city']);
    game.state.roads[edgeKey(hexEdges(h.q, h.r)[3]!)] = 'p1';
    expect(umlandVon(game.state, 'p0', h.q, h.r)).toMatchObject({ strassen: 5, bereit: false });
    game.state.roads[edgeKey(hexEdges(h.q, h.r)[3]!)] = 'p0';
    game.state.buildings[vertexKey(hexVertices(h.q, h.r)[2]!)] = { owner: 'p1', type: 'city' };
    expect(umlandVon(game.state, 'p0', h.q, h.r)?.bereit).toBe(false);
  });

  it('hauptstadtFelder findet fast geschlossene Felder an eigenen Gebaeuden', () => {
    const game = spiel();
    const h = landFeld(game);
    ring(game, h, ['city', 'city', 'settlement']);
    const felder = hauptstadtFelder(game.state, 'p0');
    expect(felder[0]).toMatchObject({ q: h.q, r: h.r, fehlt: 1 });
    expect(hauptstadtFelder(game.state, 'p1')).toEqual([]);
  });
});

describe('Hauptstadt gruenden', () => {
  it('kostet, zaehlt Punkte und ist oeffentlich', () => {
    const game = spiel();
    const h = landFeld(game);
    ring(game, h, ['city', 'city', 'city']);
    geben(game, 'p0');
    const vorher = publicPoints(game.state, 'p0');
    const res = applyAction(game, { t: 'foundCapital', q: h.q, r: h.r }, 'p0');
    expect(res.ok).toBe(true);
    expect(game.state.hauptstaedte[hexKey(h.q, h.r)]).toMatchObject({ owner: 'p0', stufe: 1 });
    expect(publicPoints(game.state, 'p0')).toBe(vorher + HAUPTSTADT_PUNKTE);
    expect(RESOURCES.every((r) => game.state.players[0]!.hand[r] === 0)).toBe(true);
    if (res.ok) expect(res.events).toContainEqual({ t: 'capital', player: 'p0', q: h.q, r: h.r });
    expect(redactStateFor(game.state, 'p1').hauptstaedte[hexKey(h.q, h.r)]?.owner).toBe('p0');
    expect(hauptstadtFelder(game.state, 'p0').some((u) => u.q === h.q && u.r === h.r)).toBe(false);
  });

  it('ohne geschlossenen Ring, ohne Rohstoffe oder ausser der Bauphase geht es nicht', () => {
    const game = spiel();
    const h = landFeld(game);
    ring(game, h, ['city', 'city', 'settlement']);
    geben(game, 'p0');
    expect(applyAction(game, { t: 'foundCapital', q: h.q, r: h.r }, 'p0').ok).toBe(false);

    game.state.buildings[vertexKey(hexVertices(h.q, h.r)[4]!)] = { owner: 'p0', type: 'city' };
    const arm = game.state.players[0]!;
    for (const r of RESOURCES) arm.hand[r] = 0;
    expect(applyAction(game, { t: 'foundCapital', q: h.q, r: h.r }, 'p0').ok).toBe(false);

    geben(game, 'p0');
    game.state.phase = { t: 'roll' };
    expect(applyAction(game, { t: 'foundCapital', q: h.q, r: h.r }, 'p0').ok).toBe(false);
  });

  it('nur eine Hauptstadt je Spieler', () => {
    const game = spiel();
    const a = landFeld(game, 0);
    const b = hexesInRange({ q: 0, r: 0 }, 12).find(
      (x) => Math.abs(x.q - a.q) + Math.abs(x.r - a.r) > 6 && hexesInRange(x, 1).every((y) => terrainAt(game.state.worldSeed, y.q, y.r) !== 'water'),
    )!;
    ring(game, a, ['city', 'city', 'city']);
    ring(game, b, ['city', 'city', 'city']);
    geben(game, 'p0');
    geben(game, 'p0');
    expect(applyAction(game, { t: 'foundCapital', q: a.q, r: a.r }, 'p0').ok).toBe(true);
    expect(hauptstadtHindernis(game.state, 'p0', b.q, b.r)).toBe('Du hast schon eine Hauptstadt.');
    expect(applyAction(game, { t: 'foundCapital', q: b.q, r: b.r }, 'p0').ok).toBe(false);
  });
});
