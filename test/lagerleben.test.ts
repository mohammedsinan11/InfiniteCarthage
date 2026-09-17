/**
 * Lager mit eigenem Leben: Wachwechsel, Feste und der grosse Goblin
 * (rules/army.ts, lagerLeben). Nur im Umkreis der Spieler - was niemand
 * sieht, braucht kein Leben.
 */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { FEST_DAUER, feiert, lagerLeben, sendRaiders } from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { migriereStand } from '../src/core/rules/migration';
import {
  BESATZUNG_MAX,
  einheitVorlage,
  garrisonOf,
  garrisonUnits,
  isLandAt,
  nestFraktionOf,
} from '../src/core/units';
import { fraktionById } from '../src/core/factions';
import { nestAt } from '../src/core/raiders';
import { Rng } from '../src/core/rng';
import { hexKey, hexVertices, hexesInRange, vertexKey } from '../src/core/coords';
import { roundOf } from '../src/core/season';

const ORIGIN = { q: 0, r: 0 };

/**
 * Eine Partie mit einer eigenen Siedlung neben einem aktiven Lager. art:
 * nur ein Lager dieser Fraktionsart nehmen - Feste feiern nur Goblins.
 */
function spielMitLager(art?: 'goblin' | 'raeuber') {
  for (let seed = 1; seed < 400; seed++) {
    const game = createGame([{ id: 'p0', name: 'A' }], seed, 4711, 0);
    game.state.phase = { t: 'main' };
    game.state.turn = 3;
    const lager = hexesInRange(ORIGIN, 14).find((h) => {
      if (!nestAt(game.state.worldSeed, h.q, h.r)) return false;
      if (!art) return true;
      return fraktionById(game.state.worldSeed, nestFraktionOf(game.state, h.q, h.r)).art === art;
    });
    if (!lager) continue;
    // Eine eigene Siedlung in Sichtweite, damit das Lagerleben greift.
    const nah = hexesInRange(lager, 4).find((h) => isLandAt(game.state.worldSeed, h.q, h.r));
    if (!nah) continue;
    game.state.buildings[vertexKey(hexVertices(nah.q, nah.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    return { game, lager, k: hexKey(lager.q, lager.r) };
  }
  throw new Error('kein Lager gefunden');
}

describe('Wachwechsel', () => {
  it('zieht fehlende Koepfe nach, hoechstens bis zur vollen Besatzung', () => {
    const { game, lager, k } = spielMitLager();
    game.state.nestGarrison[k] = 1;

    const events: ArmyEvent[] = [];
    lagerLeben(game.state, new Rng(5), events);
    expect(garrisonOf(game.state, lager.q, lager.r)).toBe(2);
    expect(events.some((e) => e.t === 'watch')).toBe(true);

    // Weiter bis zur Obergrenze, dann ist Schluss.
    for (let i = 0; i < 6; i++) lagerLeben(game.state, new Rng(i + 9), []);
    expect(garrisonOf(game.state, lager.q, lager.r)).toBe(BESATZUNG_MAX);
    const nachher: ArmyEvent[] = [];
    lagerLeben(game.state, new Rng(3), nachher);
    expect(nachher.some((e) => e.t === 'watch')).toBe(false);
  });

  it('mit einem Schamanen im Lager geht es doppelt so schnell', () => {
    const { game, lager, k } = spielMitLager();
    game.state.nestGarrison[k] = 1;
    game.state.units.push({
      ...einheitVorlage('schamane', lager.q, lager.r, { fraktion: 'f:0:0', heimat: k }),
      id: 42,
    });

    const events: ArmyEvent[] = [];
    lagerLeben(game.state, new Rng(5), events);
    expect(garrisonOf(game.state, lager.q, lager.r)).toBe(3);
    expect(events.find((e) => e.t === 'watch')).toMatchObject({ schamane: true, anzahl: 2 });
  });
});

describe('Feste', () => {
  it('wer feiert, hat volle Besatzung und schickt niemanden los', () => {
    // Ueber viele Seeds, bis irgendein Goblinlager in Sicht tatsaechlich feiert.
    // Geprueft wird das Lager AUS DEM EREIGNIS - im Umkreis liegen mehrere.
    for (let seed = 1; seed < 60; seed++) {
      const { game } = spielMitLager('goblin');
      const events: ArmyEvent[] = [];
      lagerLeben(game.state, new Rng(seed), events);
      const fest = events.find((e) => e.t === 'feast');
      if (!fest) continue;

      const gefeiert = hexKey(fest.q, fest.r);
      expect(feiert(game.state, gefeiert)).toBe(true);
      expect(garrisonOf(game.state, fest.q, fest.r)).toBe(BESATZUNG_MAX);
      expect(fest.bis).toBe(roundOf(game.state.turn) + FEST_DAUER);

      // Aus diesem Lager bricht jetzt kein Raubzug auf.
      const raub: ArmyEvent[] = [];
      sendRaiders(game.state, raub);
      const auf = raub.find((e) => e.t === 'march');
      if (auf) {
        for (const p of auf.parties) expect(hexKey(p.q, p.r)).not.toBe(gefeiert);
      }
      return;
    }
    throw new Error('kein Fest in 60 Anlaeufen');
  });
});

describe('Der grosse Goblin', () => {
  it('steht in jedem Goblinlager - genau einer', () => {
    const { game, lager } = spielMitLager('goblin');
    const leute = garrisonUnits(game.state, [lager]);
    expect(leute.length).toBeGreaterThan(0);
    expect(leute.filter((u) => u.kind === 'haeuptling')).toHaveLength(1);
    expect(leute[0]!.kind).toBe('haeuptling');
  });

  it('ein Raeuberlager hat keinen', () => {
    const { game, lager } = spielMitLager('raeuber');
    const leute = garrisonUnits(game.state, [lager]);
    expect(leute.some((u) => u.kind === 'haeuptling')).toBe(false);
  });
});

describe('Alte Staende', () => {
  it('bekommen die Festliste nachgereicht', () => {
    const { game } = spielMitLager();
    delete (game.state as { feste?: unknown }).feste;
    migriereStand(game.state);
    expect(game.state.feste).toEqual({});
  });
});
