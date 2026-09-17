/**
 * Die Hexe und der Morast (core/hexe.ts, rules/army.ts).
 *
 * Das Hexenhaus liegt im Seed wie Lager und Ruinen, nur viel seltener. Die
 * Hexe steht dort und zieht nie weg. Der Morast kommt erst, wenn genug Gelee
 * gesammelt ist - und nur einer.
 */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { GELEE, MORAST_AB_GELEE, beginNight, derMorast, hexenWache, tickArmy } from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { HEXE_REGION, HEXE_SAFE_RADIUS, hexenhausAt } from '../src/core/hexe';
import { HEXE_FRAKTION, fraktionById } from '../src/core/factions';
import { feindlich, seiteVon, spielerSeite } from '../src/core/combat';
import { WERTE, isLandAt } from '../src/core/units';
import { hexDistance, hexVertices, hexesInRange, vertexKey } from '../src/core/coords';
import { nestAt } from '../src/core/raiders';
import { ruinAt } from '../src/core/ruins';

const ORIGIN = { q: 0, r: 0 };

/** Eine Partie, deren Welt ein Hexenhaus in Reichweite hat, mit Siedlung daneben. */
function spielMitHexenhaus() {
  for (let seed = 1; seed < 600; seed++) {
    const game = createGame([{ id: 'p0', name: 'A' }], seed, 4711, 0);
    game.state.phase = { t: 'main' };
    game.state.turn = 3;
    const haus = hexesInRange(ORIGIN, 30).find((h) => hexenhausAt(game.state.worldSeed, h.q, h.r));
    if (!haus) continue;
    const nah = hexesInRange(haus, 5).find((h) => isLandAt(game.state.worldSeed, h.q, h.r));
    if (!nah) continue;
    game.state.buildings[vertexKey(hexVertices(nah.q, nah.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    return { game, haus };
  }
  throw new Error('kein Hexenhaus gefunden');
}

describe('Das Hexenhaus', () => {
  it('liegt selten, nie am Ursprung und nie auf Lager, Ruine oder Wasser', () => {
    const seed = 2024;
    const felder = hexesInRange(ORIGIN, 40);
    const haeuser = felder.filter((h) => hexenhausAt(seed, h.q, h.r));
    // Selten: deutlich weniger als Lager.
    const lager = felder.filter((h) => nestAt(seed, h.q, h.r));
    expect(haeuser.length).toBeLessThan(lager.length);
    for (const h of haeuser) {
      expect(hexDistance(h, ORIGIN)).toBeGreaterThan(HEXE_SAFE_RADIUS);
      expect(nestAt(seed, h.q, h.r)).toBe(false);
      expect(ruinAt(seed, h.q, h.r)).toBe(false);
      expect(isLandAt(seed, h.q, h.r)).toBe(true);
    }
  });

  it('ist rein - derselbe Seed, dieselbe Stelle', () => {
    for (const h of hexesInRange(ORIGIN, 20)) {
      expect(hexenhausAt(7, h.q, h.r)).toBe(hexenhausAt(7, h.q, h.r));
    }
  });

  it('zwei Haeuser halten Abstand', () => {
    const haeuser = hexesInRange(ORIGIN, 60).filter((h) => hexenhausAt(99, h.q, h.r));
    for (let i = 0; i < haeuser.length; i++) {
      for (let j = i + 1; j < haeuser.length; j++) {
        expect(hexDistance(haeuser[i]!, haeuser[j]!)).toBeGreaterThan(HEXE_REGION / 2);
      }
    }
  });
});

describe('Die Hexe', () => {
  it('tritt bei ihrem Haus an - genau einmal', () => {
    const { game, haus } = spielMitHexenhaus();
    const events: ArmyEvent[] = [];
    hexenWache(game.state, events);

    const hexen = game.state.units.filter((u) => u.kind === 'hexe');
    expect(hexen).toHaveLength(1);
    expect(hexen[0]).toMatchObject({ q: haus.q, r: haus.r, fraktion: HEXE_FRAKTION });
    expect(events).toContainEqual({ t: 'witch', q: haus.q, r: haus.r });

    // Ein zweiter Aufruf stellt keine zweite auf.
    hexenWache(game.state, []);
    expect(game.state.units.filter((u) => u.kind === 'hexe')).toHaveLength(1);
  });

  it('gehoert sich selbst und ist den Spielern feind', () => {
    const { game } = spielMitHexenhaus();
    hexenWache(game.state, []);
    const hexe = game.state.units.find((u) => u.kind === 'hexe')!;
    expect(fraktionById(game.state.worldSeed, HEXE_FRAKTION).name).toBe('Die Hexe');
    // Sie ruht - aber anders als ein Schleim ist sie nie friedlich.
    expect(seiteVon(hexe)).toBe(HEXE_FRAKTION);
    expect(feindlich(seiteVon(hexe), spielerSeite('p0'), game.state)).toBe(true);
  });

  it('zieht nie von ihrem Haus weg', () => {
    const { game, haus } = spielMitHexenhaus();
    hexenWache(game.state, []);
    for (let i = 0; i < 8; i++) tickArmy(game.state, game.world, []);
    const hexe = game.state.units.find((u) => u.kind === 'hexe');
    if (hexe) expect({ q: hexe.q, r: hexe.r }).toEqual({ q: haus.q, r: haus.r });
  });
});

describe('Der Morast', () => {
  /** Eine Partie mit Siedlung und so viel Gelee, wie der Test braucht. */
  function mitGelee(menge: number): Game {
    const game = createGame([{ id: 'p0', name: 'A' }], 2024, 4711, 0);
    game.state.phase = { t: 'main' };
    game.state.turn = 3;
    const feld = hexesInRange(ORIGIN, 4).find((h) =>
      hexesInRange(h, 5).every((x) => isLandAt(game.state.worldSeed, x.q, x.r)),
    )!;
    game.state.buildings[vertexKey(hexVertices(feld.q, feld.r)[0]!)] = { owner: 'p0', type: 'settlement' };
    game.state.players[0]!.inventar[GELEE] = menge;
    return game;
  }

  it('kommt erst ab der Schwelle', () => {
    const zuWenig = mitGelee(MORAST_AB_GELEE - 1);
    derMorast(zuWenig.state, []);
    expect(zuWenig.state.units.some((u) => u.kind === 'morast')).toBe(false);

    const genug = mitGelee(MORAST_AB_GELEE);
    const events: ArmyEvent[] = [];
    derMorast(genug.state, events);
    const morast = genug.state.units.find((u) => u.kind === 'morast');
    expect(morast).toBeDefined();
    expect(morast!.leben).toBe(WERTE.morast.leben);
    expect(events.some((e) => e.t === 'morast' && e.gegen === 'p0')).toBe(true);
  });

  it('erhebt sich nur einmal, solange er lebt', () => {
    const game = mitGelee(MORAST_AB_GELEE * 3);
    derMorast(game.state, []);
    derMorast(game.state, []);
    beginNight(game.state, []);
    expect(game.state.units.filter((u) => u.kind === 'morast')).toHaveLength(1);
  });

  it('haelt mehr aus als ein Schleim und trifft haerter', () => {
    expect(WERTE.morast.leben).toBeGreaterThan(WERTE.schleim.leben * 4);
    expect(WERTE.morast.angriff).toBeGreaterThan(WERTE.schleim.angriff);
  });
});
