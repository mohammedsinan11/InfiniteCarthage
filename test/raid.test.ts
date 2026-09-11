/**
 * Raeuberlager und was eine Pluenderung nimmt.
 *
 * Die Lager sind wie das Gelaende: rein aus dem Seed. Was hier zaehlt, ist
 * nicht nur "sie sind da", sondern dass sie GLEICHMAESSIG da sind - eine
 * Verteilung mit Klumpen und Loechern waere schlimmer als gar keine, weil man
 * ihr nicht ausweichen kann. Wie Raeuber ziehen und kaempfen, pruefen
 * test/army.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { NEST_REGION, NEST_SAFE_RADIUS, nestAt, nestsInRange } from '../src/core/raiders';
import { hexDistance, hexesInRange } from '../src/core/coords';
import { terrainAt } from '../src/core/worldgen';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { raidLoss, takeFromLargest } from '../src/core/rules/raid';
import { HAND_LIMIT, limitFor } from '../src/core/rules/handlimit';
import { bigRoundChangedAt, ROUNDS_PER_BIG_ROUND } from '../src/core/season';
import { redactEventsFor } from '../src/core/redact';
import { emptyHand, handSize } from '../src/core/state';
import type { Hand } from '../src/core/state';
import { RESOURCES } from '../src/core/types';

const ORIGIN = { q: 0, r: 0 };

function solo(seed = 2024): Game {
  return createGame([{ id: 'p0', name: 'Solo' }], seed, 4711, 15);
}

describe('Nester liegen fest', () => {
  it('sind rein: gleicher Seed, gleiche Nester', () => {
    const a = hexesInRange(ORIGIN, 18).filter((h) => nestAt(2024, h.q, h.r));
    const b = hexesInRange(ORIGIN, 18).filter((h) => nestAt(2024, h.q, h.r));
    expect(a).toEqual(b);
  });

  it('haengen am Seed', () => {
    const a = hexesInRange(ORIGIN, 18).filter((h) => nestAt(1, h.q, h.r)).length;
    const b = hexesInRange(ORIGIN, 18).filter((h) => nestAt(2, h.q, h.r)).length;
    // Nicht die Anzahl muss sich unterscheiden, sondern die Lage.
    const lageA = hexesInRange(ORIGIN, 18).filter((h) => nestAt(1, h.q, h.r)).map((h) => h.q + ':' + h.r);
    const lageB = hexesInRange(ORIGIN, 18).filter((h) => nestAt(2, h.q, h.r)).map((h) => h.q + ':' + h.r);
    expect(lageA).not.toEqual(lageB);
    expect(a + b).toBeGreaterThan(0);
  });

  it('lassen den Ursprung in Ruhe', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const h of hexesInRange(ORIGIN, NEST_SAFE_RADIUS)) {
        expect(nestAt(seed, h.q, h.r), `Seed ${seed} hat ein Nest bei ${h.q}:${h.r}`).toBe(false);
      }
    }
  });

  it('stehen nie im Wasser', () => {
    for (const seed of [2024, 7, 31337]) {
      for (const h of hexesInRange(ORIGIN, 25)) {
        if (!nestAt(seed, h.q, h.r)) continue;
        expect(terrainAt(seed, h.q, h.r)).not.toBe('water');
      }
    }
  });

  it('halten Abstand - keine Klumpen', () => {
    for (const seed of [2024, 7, 31337, 555]) {
      const nester = hexesInRange(ORIGIN, 30).filter((h) => nestAt(seed, h.q, h.r));
      for (let i = 0; i < nester.length; i++) {
        for (let j = i + 1; j < nester.length; j++) {
          expect(
            hexDistance(nester[i]!, nester[j]!),
            `Seed ${seed}: Nester zu nah beieinander`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('lassen keine grossen Loecher - die Bedrohung ist ueberall erreichbar', () => {
    for (const seed of [2024, 7, 31337]) {
      const proben = hexesInRange(ORIGIN, 22);
      const ohne = proben.filter((h) => nestsInRange(seed, h, 10).length === 0);
      // Ein Zehnerumkreis ohne jedes Nest waere eine sichere Ecke, in der man
      // ungestoert wachsen koennte. Vereinzelt in Ordnung, flaechig nicht.
      expect(ohne.length / proben.length, `Seed ${seed} hat zu viele sichere Felder`).toBeLessThan(0.1);
    }
  });

  it('sind so dicht wie gedacht - ein Nest je rund 60 bis 140 Felder', () => {
    for (const seed of [2024, 7, 31337, 555, 90210]) {
      const felder = hexesInRange(ORIGIN, 30);
      const nester = felder.filter((h) => nestAt(seed, h.q, h.r));
      const dichte = felder.length / Math.max(1, nester.length);
      expect(dichte, `Seed ${seed}: ein Nest je ${dichte.toFixed(0)} Felder`).toBeGreaterThan(50);
      expect(dichte, `Seed ${seed}: ein Nest je ${dichte.toFixed(0)} Felder`).toBeLessThan(160);
    }
  });

  it('sitzen im Inneren ihrer Region, nie am Rand', () => {
    for (const h of hexesInRange(ORIGIN, 25)) {
      if (!nestAt(2024, h.q, h.r)) continue;
      const dq = ((h.q % NEST_REGION) + NEST_REGION) % NEST_REGION;
      const dr = ((h.r % NEST_REGION) + NEST_REGION) % NEST_REGION;
      expect(dq).toBeGreaterThanOrEqual(1);
      expect(dq).toBeLessThanOrEqual(NEST_REGION - 2);
      expect(dr).toBeGreaterThanOrEqual(1);
      expect(dr).toBeLessThanOrEqual(NEST_REGION - 2);
    }
  });
});

describe('Was die Pluenderung nimmt', () => {
  it('nimmt eine Karte je Raeuber', () => {
    const game = solo();
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 1; // 5 Karten, unter der Grenze
    expect(raidLoss(game.state, 'p0', 2)).toBe(2);
  });

  it('nimmt Hortern die Haelfte', () => {
    const game = solo();
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 4; // 20 Karten
    expect(raidLoss(game.state, 'p0', 1)).toBe(10);
  });

  it('nimmt nie mehr, als jemand hat', () => {
    const game = solo();
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 0;
    p.hand.lumber = 1;
    expect(raidLoss(game.state, 'p0', 5)).toBe(1);
  });

  it('nimmt nichts ohne Raeuber', () => {
    const game = solo();
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 9;
    expect(raidLoss(game.state, 'p0', 0)).toBe(0);
  });

  it('greift den groessten Stapel an', () => {
    const hand = { ...emptyHand(), lumber: 5, ore: 1 };
    const genommen = takeFromLargest(hand, 3);
    expect(genommen.lumber).toBe(3);
    expect(genommen.ore).toBe(0);
  });

  it('gleicht die Stapel an, statt einen leerzuraeumen', () => {
    const hand = { ...emptyHand(), lumber: 4, ore: 4 };
    const genommen = takeFromLargest(hand, 4);
    expect(genommen.lumber).toBe(2);
    expect(genommen.ore).toBe(2);
  });

  it('bricht ab, wenn die Hand leer ist', () => {
    const hand = { ...emptyHand(), lumber: 2 };
    expect(handSize(takeFromLargest(hand, 10))).toBe(2);
  });
});

describe('Der Takt', () => {
  it('schlaegt zum Beginn jeder grossen Runde', () => {
    expect(bigRoundChangedAt(1)).toBe(false);
    expect(bigRoundChangedAt(ROUNDS_PER_BIG_ROUND)).toBe(false);
    expect(bigRoundChangedAt(ROUNDS_PER_BIG_ROUND + 1)).toBe(true);
    expect(bigRoundChangedAt(2 * ROUNDS_PER_BIG_ROUND + 1)).toBe(true);
    expect(bigRoundChangedAt(2 * ROUNDS_PER_BIG_ROUND + 2)).toBe(false);
  });
});

describe('Die Sieben ist nur noch der Fund', () => {
  it('kennt keine Abwerfphase mehr', () => {
    const game = solo();
    // Die Phase existiert im Typ nicht mehr - hier zaehlt, dass ein Wurf mit
    // voller Hand direkt in den Fund fuehrt statt ins Abwerfen.
    const phasen = new Set<string>();
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 9; // weit ueber der Grenze
    for (let i = 0; i < 200; i++) {
      // Als string lesen: TypeScript kann nicht wissen, dass applyAction den
      // Zustand austauscht, und wuerde die Phase sonst auf 'roll' festnageln.
      const vorher: string = game.state.phase.t;
      if (vorher !== 'roll') break;
      const res = applyAction(game, { t: 'roll' }, 'p0');
      if (!res.ok) break;
      const danach: string = game.state.phase.t;
      phasen.add(danach);
      if (danach === 'draft') break;
      if (danach === 'main') applyAction(game, { t: 'endTurn' }, 'p0');
    }
    expect([...phasen]).not.toContain('discard');
  });
});

describe('Der Takt', () => {
  it('schlaegt zum Beginn jeder grossen Runde', () => {
    expect(bigRoundChangedAt(1)).toBe(false);
    expect(bigRoundChangedAt(ROUNDS_PER_BIG_ROUND)).toBe(false);
    expect(bigRoundChangedAt(ROUNDS_PER_BIG_ROUND + 1)).toBe(true);
    expect(bigRoundChangedAt(2 * ROUNDS_PER_BIG_ROUND + 1)).toBe(true);
    expect(bigRoundChangedAt(2 * ROUNDS_PER_BIG_ROUND + 2)).toBe(false);
  });
});

describe('Die Sieben ist nur noch der Fund', () => {
  it('kennt keine Abwerfphase mehr', () => {
    const game = solo();
    const phasen = new Set<string>();
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 9; // weit ueber der Grenze
    for (let i = 0; i < 200; i++) {
      // Als string lesen: TypeScript kann nicht wissen, dass applyAction den
      // Zustand austauscht, und wuerde die Phase sonst auf 'roll' festnageln.
      const vorher: string = game.state.phase.t;
      if (vorher !== 'roll') break;
      const res = applyAction(game, { t: 'roll' }, 'p0');
      if (!res.ok) break;
      const danach: string = game.state.phase.t;
      phasen.add(danach);
      if (danach === 'draft') break;
      if (danach === 'main') applyAction(game, { t: 'endTurn' }, 'p0');
    }
    expect([...phasen]).not.toContain('discard');
  });
});

describe('Die Redaktion der Pluenderung', () => {
  const pluenderung = (player: string, taken: Hand, count: number) => ({
    t: 'plunder' as const,
    round: 6,
    player,
    kind: 'raeuber' as const,
    fraktion: 'f:0:0',
    q: 0,
    r: 0,
    taken,
    count,
  });

  it('zeigt nur dem Betroffenen, WAS genommen wurde', () => {
    const [eigen, fremd] = redactEventsFor(
      [pluenderung('p0', { ...emptyHand(), ore: 2 }, 2), pluenderung('p1', { ...emptyHand(), lumber: 3 }, 3)],
      'p0',
    );
    if (!eigen || eigen.t !== 'plunder' || !fremd || fremd.t !== 'plunder') {
      throw new Error('falsches Ereignis');
    }
    // Eigener Verlust: vollstaendig.
    expect(eigen.taken.ore).toBe(2);
    // Fremder Verlust: die Anzahl bleibt, die Sorte nicht.
    expect(fremd.count).toBe(3);
    expect(handSize(fremd.taken)).toBe(0);
  });

  it('laesst das Original unberuehrt', () => {
    const e = pluenderung('p1', { ...emptyHand(), wool: 1 }, 1);
    redactEventsFor([e], 'p0');
    expect(e.taken.wool, 'Redaktion darf nicht am Zustand schnitzen').toBe(1);
  });
});

describe('Die Handkartengrenze', () => {
  it('liegt bei sieben und steigt mit Karten', () => {
    const game = solo();
    expect(limitFor(game.state, 'p0')).toBe(HAND_LIMIT);
    game.state.players[0]!.cards.push('vorratskammer');
    expect(limitFor(game.state, 'p0')).toBeGreaterThan(HAND_LIMIT);
  });
});
