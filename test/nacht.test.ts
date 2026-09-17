/**
 * Die Nacht: mit ihrem Beginn kriechen Schleime aus dem Dunkel, sie ziehen auf
 * die Siedlungen zu und greifen an - pluendern aber nichts. Bei Tagesanbruch
 * verschwinden sie nicht, sie werden friedfertig. Wer sie erschlaegt, bekommt
 * Gelee (rules/army.ts, nachtVolk).
 */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { GELEE, SCHLEIM_ABSTAND, beginDay, beginNight, gelee, nachtVolk } from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { NACHT_ID, fraktionById } from '../src/core/factions';
import { NEUTRAL, feindlich, seiteVon, spielerSeite } from '../src/core/combat';
import { einheitVorlage, settlementApproaches } from '../src/core/units';
import { Rng } from '../src/core/rng';
import { hexDistance, hexKey, hexVertices, hexesInRange, vertexKey } from '../src/core/coords';
import { isLandAt } from '../src/core/units';

const ORIGIN = { q: 0, r: 0 };

/** Eine Partie mit einer eigenen Siedlung auf festem Land. */
function spiel(): { game: Game; feld: { q: number; r: number } } {
  const game = createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], 2024, 4711, 0);
  game.state.phase = { t: 'main' };
  game.state.turn = 3;
  const seed = game.state.worldSeed;
  const feld = hexesInRange(ORIGIN, 3).find((h) =>
    hexesInRange(h, SCHLEIM_ABSTAND + 1).every((x) => isLandAt(seed, x.q, x.r)),
  )!;
  game.state.buildings[vertexKey(hexVertices(feld.q, feld.r)[0]!)] = { owner: 'p0', type: 'settlement' };
  return { game, feld };
}

const schleime = (game: Game) => game.state.units.filter((u) => u.kind === 'schleim');

describe('Schleime bei Nacht', () => {
  it('kriechen bei Nachtbeginn aus dem Dunkel - fern der Siedlung', () => {
    const { game, feld } = spiel();
    const events: ArmyEvent[] = [];
    nachtVolk(game.state, new Rng(7), events);

    const neu = schleime(game);
    expect(neu.length).toBeGreaterThan(0);
    expect(events).toContainEqual({ t: 'slimes', anzahl: neu.length });
    for (const u of neu) {
      expect(u.fraktion).toBe(NACHT_ID);
      expect(u.auftrag).toBe('jagd');
      // Sie kommen aus dem Dunkel, nicht aus dem Vorgarten.
      const naechste = Math.min(
        ...[...settlementApproaches(game.state, 'p0').keys()].map((k) => {
          const [q, r] = k.split(':').map(Number);
          return hexDistance({ q: q!, r: r! }, u);
        }),
      );
      expect(naechste).toBeGreaterThanOrEqual(SCHLEIM_ABSTAND);
    }
    // Nicht uebereinander und nicht auf der Siedlung selbst.
    const orte = new Set(neu.map((u) => hexKey(u.q, u.r)));
    expect(orte.size).toBe(neu.length);
    expect(orte.has(hexKey(feld.q, feld.r))).toBe(false);
  });

  it('sind der Nacht zugehoerig und allen Spielern feind', () => {
    const { game } = spiel();
    nachtVolk(game.state, new Rng(7), []);
    const u = schleime(game)[0]!;
    expect(fraktionById(game.state.worldSeed, NACHT_ID).name).toBe('Die Nacht');
    expect(seiteVon(u)).toBe(NACHT_ID);
    expect(feindlich(seiteVon(u), spielerSeite('p0'), game.state)).toBe(true);
  });
});

describe('Schleime bei Tag', () => {
  it('verschwinden nicht, werden aber friedfertig', () => {
    const { game } = spiel();
    beginNight(game.state, []);
    const vorher = schleime(game).length;
    expect(vorher).toBeGreaterThan(0);

    const events: ArmyEvent[] = [];
    beginDay(game.state, events);
    // Sie stehen noch da - nur eben traege.
    expect(schleime(game).length).toBe(vorher);
    expect(events).toContainEqual({ t: 'slimesRest', anzahl: vorher });
    for (const u of schleime(game)) {
      expect(u.auftrag).toBe('ruht');
      expect(seiteVon(u)).toBe(NEUTRAL);
      // Niemand kaempft mit einem ruhenden Schleim.
      expect(feindlich(seiteVon(u), spielerSeite('p0'), game.state)).toBe(false);
    }
  });

  it('wachen mit der naechsten Nacht wieder auf', () => {
    const { game } = spiel();
    beginNight(game.state, []);
    beginDay(game.state, []);
    beginNight(game.state, []);
    for (const u of schleime(game)) expect(u.auftrag).toBe('jagd');
  });
});

describe('Gelee', () => {
  it('landet im Inventar, nicht in der Hand', () => {
    const { game } = spiel();
    const vorher = { ...game.state.players[0]!.hand };
    gelee(game.state, 'p0');
    gelee(game.state, 'p0');
    expect(game.state.players[0]!.inventar[GELEE]).toBe(2);
    expect(game.state.players[0]!.hand).toEqual(vorher);
  });

  it('faellt auch ohne vorhandenes Inventar an - alte Staende', () => {
    const { game } = spiel();
    delete (game.state.players[0] as { inventar?: unknown }).inventar;
    gelee(game.state, 'p0');
    expect(game.state.players[0]!.inventar[GELEE]).toBe(1);
  });
});

describe('Was die Nacht nicht tut', () => {
  it('pluendert nicht und legt kein Feuer', () => {
    const { game, feld } = spiel();
    const vk = Object.keys(game.state.buildings)[0]!;
    game.state.units.push({
      ...einheitVorlage('schleim', feld.q, feld.r, { fraktion: NACHT_ID, auftrag: 'jagd' }),
      id: 99,
    });
    const handVorher = { ...game.state.players[0]!.hand };

    // Mehrere Runden auf der Siedlung: nichts wird genommen, nichts brennt.
    for (let i = 0; i < 5; i++) {
      const events: ArmyEvent[] = [];
      beginNight(game.state, events);
      expect(events.some((e) => e.t === 'plunder')).toBe(false);
    }
    expect(game.state.players[0]!.hand).toEqual(handVorher);
    expect(game.state.braende).toEqual([]);
    expect(game.state.buildings[vk]).toBeDefined();
  });
});
