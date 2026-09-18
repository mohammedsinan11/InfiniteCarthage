/**
 * Der Held, den der Koenig ernennt (rules/zweig.ts).
 *
 * Mit dem Koenigssitz waehlt man genau einen: Krieger, Heilerin oder
 * Haendler. Die Wahl ist endgueltig, und er tritt ZUSAETZLICH zum
 * gewoehnlichen Helden an - beide haben ihre eigene Rueckkehr.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { HEILERIN_RADIUS, ZWEIGE, ZWEIG_BAU, ZWEIG_NAME, ernennungHindernis } from '../src/core/rules/zweig';
import { heldenRunde, spawnHeld, tickArmy } from '../src/core/rules/army';
import { tradeRatio } from '../src/core/rules/trade';
import { MAX_STUFE } from '../src/core/rules/hauptstadt';
import { REICH_ERWEITERUNG, REICH_RADIUS } from '../src/core/rules/reich';
import { COST_REICHSBAU } from '../src/core/rules/costs';
import { migriereStand } from '../src/core/rules/migration';
import { redactStateFor } from '../src/core/redact';
import { angriffVon, maxLeben } from '../src/core/combat';
import { isLandAt, isNestActive } from '../src/core/units';
import { COST_KNIGHT } from '../src/core/rules/costs';
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

/** Ein Reichsbau dieser Art neben dem Sitz - bezahlt und gesetzt. */
function baue(game: Game, sitz: { q: number; r: number }, art: string) {
  const p = game.state.players[0]!;
  for (const r of RESOURCES) p.hand[r] += COST_REICHSBAU[art]![r] ?? 0;
  const platz = hexesInRange(sitz, 1).find(
    (h) => (h.q !== sitz.q || h.r !== sitz.r) && !game.state.reichsbauten![hexKey(h.q, h.r)],
  )!;
  const res = applyAction(game, { t: 'buildReich', q: platz.q, r: platz.r, art }, 'p0');
  expect(res.ok).toBe(true);
  return platz;
}

const ernannter = (game: Game) =>
  game.state.units.find((u) => u.kind === 'held' && u.owner === 'p0' && u.zweig);
const gewoehnlicher = (game: Game) =>
  game.state.units.find((u) => u.kind === 'held' && u.owner === 'p0' && !u.zweig);

describe('Der Koenig ernennt', () => {
  it('erst mit dem Koenigssitz', () => {
    const { game, sitz } = mitKoenigssitz();
    // Stufe II reicht nicht.
    game.state.hauptstaedte[hexKey(sitz.q, sitz.r)] = { owner: 'p0', stufe: 2, seit: 1 };
    expect(ernennungHindernis(game.state, 'p0')).toContain('Koenigssitz');
    expect(applyAction(game, { t: 'ernenne', zweig: 'krieger' }, 'p0').ok).toBe(false);

    game.state.hauptstaedte[hexKey(sitz.q, sitz.r)] = { owner: 'p0', stufe: MAX_STUFE, seit: 1 };
    expect(ernennungHindernis(game.state, 'p0')).toBeNull();
    expect(applyAction(game, { t: 'ernenne', zweig: 'krieger' }, 'p0').ok).toBe(true);
  });

  it('genau einen - die Wahl ist endgueltig', () => {
    const { game, sitz } = mitKoenigssitz();
    // Eine Siedlung, damit der Ernannte ueberhaupt einen Platz zum Antreten hat.
    game.state.buildings[vertexKey(hexVertices(sitz.q, sitz.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    expect(applyAction(game, { t: 'ernenne', zweig: 'krieger' }, 'p0').ok).toBe(true);

    const zweiter = applyAction(game, { t: 'ernenne', zweig: 'haendler' }, 'p0');
    expect(zweiter.ok).toBe(false);
    if (!zweiter.ok) expect(zweiter.error).toContain('endgueltig');
    // Und es bleibt beim ersten.
    expect(game.state.players[0]!.ernannt?.zweig).toBe('krieger');
    expect(game.state.units.filter((u) => u.zweig).length).toBe(1);
  });

  it('ohne Platz gilt die Ernennung trotzdem - er tritt spaeter an', () => {
    const { game, sitz } = mitKoenigssitz();
    // Weder Siedlung noch Reichsbau: es gibt keinen Musterplatz.
    expect(applyAction(game, { t: 'ernenne', zweig: 'krieger' }, 'p0').ok).toBe(true);
    expect(game.state.players[0]!.ernannt?.zweig).toBe('krieger');
    expect(ernannter(game)).toBeUndefined();

    // Sobald eine Siedlung steht, holt ihn die naechste Runde aufs Feld.
    game.state.buildings[vertexKey(hexVertices(sitz.q, sitz.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    heldenRunde(game.state, []);
    expect(ernannter(game)).toBeDefined();
  });

  it('kennt nur diese drei', () => {
    const { game } = mitKoenigssitz();
    expect(ZWEIGE).toEqual(['krieger', 'heilerin', 'haendler']);
    expect(ZWEIG_NAME.heilerin).toBe('Heilerin');
    // Was der Client schickt, wird geprueft und nicht geglaubt.
    const quatsch = applyAction(game, { t: 'ernenne', zweig: 'drache' as 'krieger' }, 'p0');
    expect(quatsch.ok).toBe(false);
    expect(game.state.players[0]!.ernannt).toBeNull();
  });

  it('tritt sofort an - an seinem eigenen Reichsbau', () => {
    const { game, sitz } = mitKoenigssitz();
    const feste = baue(game, sitz, ZWEIG_BAU.krieger); // burgfeste
    expect(applyAction(game, { t: 'ernenne', zweig: 'krieger' }, 'p0').ok).toBe(true);

    const held = ernannter(game)!;
    expect(held).toBeDefined();
    expect({ q: held.q, r: held.r }).toEqual({ q: feste.q, r: feste.r });
    // Er traegt die Art 'held' - damit gelten alle Heldenregeln auch fuer ihn.
    expect(held.kind).toBe('held');
    expect(held.zweig).toBe('krieger');
  });

  it('steht neben dem gewoehnlichen Helden, nicht an seiner Stelle', () => {
    const { game, sitz } = mitKoenigssitz();
    // Eine Siedlung, damit der gewoehnliche Held einen Platz hat.
    game.state.buildings[vertexKey(hexVertices(sitz.q, sitz.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    expect(applyAction(game, { t: 'ernenne', zweig: 'heilerin' }, 'p0').ok).toBe(true);
    expect(spawnHeld(game.state, 'p0', [])).not.toBeNull();

    expect(ernannter(game)).toBeDefined();
    expect(gewoehnlicher(game)).toBeDefined();
    expect(game.state.units.filter((u) => u.kind === 'held' && u.owner === 'p0').length).toBe(2);
  });

  it('die Heilerin ist weiblich - ihr Amtsname ist es auch', () => {
    const { game } = mitKoenigssitz();
    expect(applyAction(game, { t: 'ernenne', zweig: 'heilerin' }, 'p0').ok).toBe(true);
    expect(game.state.players[0]!.ernannt?.lore.geschlecht).toBe('w');
  });

  it('faellt er, kehrt nur er zurueck - der andere bleibt stehen', () => {
    const { game, sitz } = mitKoenigssitz();
    baue(game, sitz, ZWEIG_BAU.krieger);
    expect(applyAction(game, { t: 'ernenne', zweig: 'krieger' }, 'p0').ok).toBe(true);

    // Sein Fall: die Einheit ist weg, seine Rueckkehr steht an.
    const s = game.state;
    s.units = s.units.filter((u) => !u.zweig);
    s.players[0]!.ernannt!.zurueck = s.turn;
    const vorher = s.players[0]!.heldZurueck;

    heldenRunde(s, []);
    expect(ernannter(game)).toBeDefined();
    expect(s.players[0]!.ernannt!.zurueck).toBeNull();
    // Die Rueckkehr des gewoehnlichen Helden ist davon unberuehrt.
    expect(s.players[0]!.heldZurueck).toBe(vorher);
  });

  it('die drei sind verschieden stark', () => {
    const krieger = { kind: 'held' as const, zweig: 'krieger' as const, stufe: 0 };
    const heilerin = { kind: 'held' as const, zweig: 'heilerin' as const, stufe: 0 };
    const schlicht = { kind: 'held' as const, stufe: 0 };

    expect(angriffVon(krieger)).toBeGreaterThan(angriffVon(schlicht));
    expect(angriffVon(heilerin)).toBeLessThan(angriffVon(schlicht));
    expect(maxLeben(krieger)).toBeGreaterThan(maxLeben(schlicht));
    // Der Rang zaehlt weiter mit.
    expect(maxLeben({ ...krieger, stufe: 2 })).toBeGreaterThan(maxLeben(krieger));
  });

  it('die Heilerin heilt die Einheiten neben sich - anderswo heilt niemand', () => {
    const { game, sitz } = mitKoenigssitz();
    // Eine Siedlung als Musterplatz fuer beide.
    game.state.buildings[vertexKey(hexVertices(sitz.q, sitz.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    expect(applyAction(game, { t: 'ernenne', zweig: 'heilerin' }, 'p0').ok).toBe(true);
    // applyAction KLONT den Stand: Rohstoffe gehoeren an game.state, nicht an
    // ein vorher festgehaltenes Objekt - das waere schon veraltet.
    for (const r of RESOURCES) game.state.players[0]!.hand[r] += COST_KNIGHT[r] ?? 0;
    expect(applyAction(game, { t: 'recruitKnight' }, 'p0').ok).toBe(true);

    // Ab hier aendert nur noch tickArmy, und das aendert an Ort und Stelle.
    const s = game.state;
    const heilerin = ernannter(game)!;
    const ritter = s.units.find((u) => u.kind === 'ritter')!;
    /*
     * Die Siedlungen kommen weg, und einen Tempel gibt es nicht: so kann nur
     * die Heilerin heilen. Sonst bewiese der Test nichts (rules/reich.ts).
     */
    s.buildings = {};
    s.units = [heilerin, ritter];

    ritter.q = heilerin.q;
    ritter.r = heilerin.r;
    ritter.leben = 1;
    tickArmy(s, game.world, []);
    expect(s.units.find((u) => u.kind === 'ritter')!.leben).toBe(2);

    // Weiter weg als HEILERIN_RADIUS erholt sich niemand.
    const fern = hexesInRange(sitz, 8).find(
      (h) =>
        hexDistance(h, heilerin) > HEILERIN_RADIUS &&
        isLandAt(s.worldSeed, h.q, h.r) &&
        !isNestActive(s, h.q, h.r),
    )!;
    const weg = s.units.find((u) => u.kind === 'ritter')!;
    weg.q = fern.q;
    weg.r = fern.r;
    weg.leben = 1;
    tickArmy(s, game.world, []);
    expect(s.units.find((u) => u.kind === 'ritter')!.leben).toBe(1);
  });

  it('der Haendler tauscht 2:1 - und nur, solange er steht', () => {
    const { game, sitz } = mitKoenigssitz();
    game.state.buildings[vertexKey(hexVertices(sitz.q, sitz.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    // Immer den aktuellen Stand fragen: applyAction klont, Verweise veralten.
    const satz = () => tradeRatio(game.state, game.world, 'p0', 'lumber');
    const vorher = satz();

    expect(applyAction(game, { t: 'ernenne', zweig: 'haendler' }, 'p0').ok).toBe(true);
    expect(ernannter(game)).toBeDefined();
    expect(satz()).toBe(2);
    expect(satz()).toBeLessThan(vorher);
    // Der Nachbar handelt davon unberuehrt weiter.
    expect(tradeRatio(game.state, game.world, 'p1', 'lumber')).toBe(4);

    // Seine Wirkung haengt an ihm: faellt er, ist sie weg, bis er zurueckkehrt.
    game.state.units = game.state.units.filter((u) => !u.zweig);
    expect(satz()).toBe(vorher);
  });

  it('ist fuer alle sichtbar, und alte Staende bekommen das Feld nachgereicht', () => {
    const { game } = mitKoenigssitz();
    expect(applyAction(game, { t: 'ernenne', zweig: 'haendler' }, 'p0').ok).toBe(true);
    const sicht = redactStateFor(game.state, 'p1');
    expect(sicht.players.find((p) => p.id === 'p0')?.ernannt?.zweig).toBe('haendler');

    delete (game.state.players[0] as { ernannt?: unknown }).ernannt;
    migriereStand(game.state);
    expect(game.state.players[0]!.ernannt).toBeNull();
  });
});
