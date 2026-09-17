/**
 * Phase 2: das Reich um den Koenigssitz (rules/reich.ts).
 *
 * Ohne Koenigssitz gibt es kein Gebiet. Mit ihm ein Kreis, den jeder eigene
 * Bau DARIN weiterschiebt - von innen nach aussen, ohne Inseln in der Ferne.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import {
  REICH_ERWEITERUNG,
  REICH_RADIUS,
  REICHSBAU_NAME,
  reichsbauHindernis,
  reichsgebiet,
} from '../src/core/rules/reich';
import { MAX_STUFE } from '../src/core/rules/hauptstadt';
import { COST_REICHSBAU } from '../src/core/rules/costs';
import { migriereStand } from '../src/core/rules/migration';
import { redactStateFor } from '../src/core/redact';
import { isLandAt } from '../src/core/units';
import { hexDistance, hexKey, hexVertices, hexesInRange, vertexKey } from '../src/core/coords';
import { RESOURCES } from '../src/core/types';

const ORIGIN = { q: 0, r: 0 };

/** Eine Partie mit Koenigssitz auf einem Feld, um das alles Land ist. */
function mitKoenigssitz(): { game: Game; sitz: { q: number; r: number } } {
  const game = createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], 2024, 4711, 0);
  game.state.phase = { t: 'main' };
  game.state.turn = 3;
  const seed = game.state.worldSeed;
  const sitz = hexesInRange(ORIGIN, 6).find((h) =>
    hexesInRange(h, REICH_RADIUS + REICH_ERWEITERUNG + 2).every((x) => isLandAt(seed, x.q, x.r)),
  )!;
  game.state.hauptstaedte[hexKey(sitz.q, sitz.r)] = { owner: 'p0', stufe: MAX_STUFE, seit: 1 };
  return { game, sitz };
}

function geben(game: Game, art: string) {
  const p = game.state.players[0]!;
  for (const r of RESOURCES) p.hand[r] += COST_REICHSBAU[art]![r] ?? 0;
}

describe('Das Reichsgebiet', () => {
  it('gibt es erst mit dem Koenigssitz', () => {
    const { game, sitz } = mitKoenigssitz();
    // Stufe II reicht nicht.
    game.state.hauptstaedte[hexKey(sitz.q, sitz.r)] = { owner: 'p0', stufe: 2, seit: 1 };
    expect(reichsgebiet(game.state, 'p0').size).toBe(0);

    game.state.hauptstaedte[hexKey(sitz.q, sitz.r)] = { owner: 'p0', stufe: MAX_STUFE, seit: 1 };
    expect(reichsgebiet(game.state, 'p0').size).toBeGreaterThan(0);
    // Der Nachbar hat keines.
    expect(reichsgebiet(game.state, 'p1').size).toBe(0);
  });

  it('reicht zuerst genau REICH_RADIUS weit', () => {
    const { game, sitz } = mitKoenigssitz();
    const gebiet = reichsgebiet(game.state, 'p0');
    for (const k of gebiet) {
      const [q, r] = k.split(':').map(Number);
      expect(hexDistance(sitz, { q: q!, r: r! })).toBeLessThanOrEqual(REICH_RADIUS);
    }
    expect(gebiet.has(hexKey(sitz.q, sitz.r))).toBe(true);
  });

  it('waechst mit einem eigenen Bau darin - aber nicht von einem fernen', () => {
    const { game, sitz } = mitKoenigssitz();
    const vorher = reichsgebiet(game.state, 'p0').size;

    // Weit weg: aendert nichts.
    const fern = { q: sitz.q + 40, r: sitz.r };
    game.state.buildings[vertexKey(hexVertices(fern.q, fern.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    expect(reichsgebiet(game.state, 'p0').size).toBe(vorher);

    // Am Rand des Gebiets: schiebt die Grenze weiter.
    const rand = hexesInRange(sitz, REICH_RADIUS).find((h) => hexDistance(sitz, h) === REICH_RADIUS)!;
    game.state.buildings[vertexKey(hexVertices(rand.q, rand.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    const nachher = reichsgebiet(game.state, 'p0');
    expect(nachher.size).toBeGreaterThan(vorher);
    // Und zwar um den Bau herum.
    const weiter = hexesInRange(rand, REICH_ERWEITERUNG).filter((h) => nachher.has(hexKey(h.q, h.r)));
    expect(weiter.length).toBeGreaterThan(0);
  });

  it('ein Grenzposten im Gebiet erweitert es ebenso', () => {
    const { game, sitz } = mitKoenigssitz();
    const vorher = reichsgebiet(game.state, 'p0').size;
    const rand = hexesInRange(sitz, REICH_RADIUS).find((h) => hexDistance(sitz, h) === REICH_RADIUS)!;
    game.state.tuerme[vertexKey(hexVertices(rand.q, rand.r)[0]!)] = { owner: 'p0', stufe: 1 };
    expect(reichsgebiet(game.state, 'p0').size).toBeGreaterThan(vorher);
  });
});

describe('Reichsbauten setzen', () => {
  it('nur im eigenen Gebiet, und dort mehrfach', () => {
    const { game, sitz } = mitKoenigssitz();
    const platz = hexesInRange(sitz, 1).find((h) => h.q !== sitz.q || h.r !== sitz.r)!;
    const zweiter = hexesInRange(sitz, 2).find(
      (h) => hexDistance(sitz, h) === 2 && reichsgebiet(game.state, 'p0').has(hexKey(h.q, h.r)),
    )!;

    geben(game, 'burgfeste');
    expect(applyAction(game, { t: 'buildReich', q: platz.q, r: platz.r, art: 'burgfeste' }, 'p0').ok).toBe(true);
    expect(game.state.reichsbauten![hexKey(platz.q, platz.r)]).toMatchObject({ owner: 'p0', art: 'burgfeste' });

    // Ein zweiter derselben Art ist erlaubt.
    geben(game, 'burgfeste');
    expect(applyAction(game, { t: 'buildReich', q: zweiter.q, r: zweiter.r, art: 'burgfeste' }, 'p0').ok).toBe(true);

    // Aber nicht zweimal auf dasselbe Feld.
    geben(game, 'tempel');
    const doppelt = applyAction(game, { t: 'buildReich', q: platz.q, r: platz.r, art: 'tempel' }, 'p0');
    expect(doppelt.ok).toBe(false);
    if (!doppelt.ok) expect(doppelt.error).toContain('Reichsbau');
  });

  it('nicht ausserhalb des Reichs, nicht auf der Hauptstadt, nicht ohne Koenigssitz', () => {
    const { game, sitz } = mitKoenigssitz();
    const fern = { q: sitz.q + 30, r: sitz.r };
    expect(reichsbauHindernis(game.state, 'p0', fern.q, fern.r)).toContain('ausserhalb');
    expect(reichsbauHindernis(game.state, 'p0', sitz.q, sitz.r)).toContain('Hauptstadt');
    expect(reichsbauHindernis(game.state, 'p1', sitz.q, sitz.r)).toBeTruthy();
  });

  it('kostet, und die Art muss es geben', () => {
    const { game, sitz } = mitKoenigssitz();
    const platz = hexesInRange(sitz, 1).find((h) => h.q !== sitz.q || h.r !== sitz.r)!;
    // Ohne Rohstoffe geht es nicht.
    const arm = applyAction(game, { t: 'buildReich', q: platz.q, r: platz.r, art: 'tempel' }, 'p0');
    expect(arm.ok).toBe(false);

    geben(game, 'tempel');
    expect(applyAction(game, { t: 'buildReich', q: platz.q, r: platz.r, art: 'tempel' }, 'p0').ok).toBe(true);
    expect(RESOURCES.every((r) => game.state.players[0]!.hand[r] === 0)).toBe(true);

    const quatsch = applyAction(game, { t: 'buildReich', q: platz.q, r: platz.r, art: 'raumschiff' }, 'p0');
    expect(quatsch.ok).toBe(false);
  });

  it('die drei Arten heissen wie im Entwurf', () => {
    expect(REICHSBAU_NAME.burgfeste).toBe('Burgfeste');
    expect(REICHSBAU_NAME.handelskontor).toBe('Handelskontor');
    expect(REICHSBAU_NAME.tempel).toBe('Tempel');
  });

  it('sind fuer alle sichtbar, und alte Staende bekommen das Feld nachgereicht', () => {
    const { game, sitz } = mitKoenigssitz();
    const platz = hexesInRange(sitz, 1).find((h) => h.q !== sitz.q || h.r !== sitz.r)!;
    geben(game, 'handelskontor');
    expect(applyAction(game, { t: 'buildReich', q: platz.q, r: platz.r, art: 'handelskontor' }, 'p0').ok).toBe(true);
    const sicht = redactStateFor(game.state, 'p1');
    expect(sicht.reichsbauten![hexKey(platz.q, platz.r)]).toMatchObject({ art: 'handelskontor' });

    delete (game.state as { reichsbauten?: unknown }).reichsbauten;
    migriereStand(game.state);
    expect(game.state.reichsbauten).toEqual({});
  });
});
