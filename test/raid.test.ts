/**
 * Raeubernester und Pluenderungen.
 *
 * Die Nester sind wie das Gelaende: rein aus dem Seed. Was hier zaehlt, ist
 * nicht nur "sie sind da", sondern dass sie GLEICHMAESSIG da sind - eine
 * Verteilung mit Klumpen und Loechern waere schlimmer als gar keine, weil man
 * ihr nicht ausweichen kann.
 */

import { describe, it, expect } from 'vitest';
import { NEST_REGION, NEST_SAFE_RADIUS, nestAt, nestsInRange } from '../src/core/raiders';
import { hexDistance, hexesInRange, vertexKey } from '../src/core/coords';
import { terrainAt } from '../src/core/worldgen';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { RAID_RANGE, raidLoss, takeFromLargest, threateningNests } from '../src/core/rules/raid';
import { HAND_LIMIT, limitFor } from '../src/core/rules/handlimit';
import { bigRoundChangedAt, ROUNDS_PER_BIG_ROUND } from '../src/core/season';
import { redactEventsFor } from '../src/core/redact';
import { emptyHand, handSize } from '../src/core/state';
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

describe('Bedrohung haengt an der Lage', () => {
  it('zaehlt jedes Nest hoechstens einmal, egal wie viele Bauten daneben stehen', () => {
    const game = solo();
    const s = game.state;

    // Ein Nest suchen und rundherum mehrere Siedlungen setzen.
    const nest = hexesInRange(ORIGIN, 20).find((h) => nestAt(s.worldSeed, h.q, h.r))!;
    expect(nest).toBeDefined();

    const einzeln = { q: nest.q + 1, r: nest.r };
    s.buildings[vertexKey({ q: einzeln.q, r: einzeln.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    const mitEiner = threateningNests(s, 'p0').length;

    s.buildings[vertexKey({ q: einzeln.q, r: einzeln.r, d: 'S' })] = { owner: 'p0', type: 'settlement' };
    s.buildings[vertexKey({ q: nest.q, r: nest.r + 1, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    const mitDreien = threateningNests(s, 'p0').length;

    expect(mitEiner).toBeGreaterThan(0);
    expect(mitDreien, 'dichter bauen darf nicht schlimmer sein').toBe(mitEiner);
  });

  it('laesst wer nichts gebaut hat auch nichts verlieren', () => {
    const game = solo();
    expect(threateningNests(game.state, 'p0')).toEqual([]);
  });

  it('zieht bei Hortern weiter - Vorraete locken Raeuber an', () => {
    const game = solo();
    const s = game.state;
    const p = s.players[0]!;

    // Eine Siedlung genau RAID_RANGE+1 von einem Nest entfernt: ausser
    // Reichweite, solange die Hand klein ist.
    const nest = hexesInRange(ORIGIN, 20).find((h) => nestAt(s.worldSeed, h.q, h.r))!;
    const weg = { q: nest.q + RAID_RANGE + 1, r: nest.r };
    s.buildings[vertexKey({ q: weg.q, r: weg.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };

    for (const r of RESOURCES) p.hand[r] = 0;
    const knapp = threateningNests(s, 'p0').length;

    // Jetzt horten.
    for (const r of RESOURCES) p.hand[r] = 3;
    expect(handSize(p.hand)).toBeGreaterThan(limitFor(s, 'p0'));
    const reich = threateningNests(s, 'p0').length;

    expect(reich, 'Horten muss die Reichweite weiten').toBeGreaterThanOrEqual(knapp);
  });
});

describe('Was die Pluenderung nimmt', () => {
  it('nimmt eine Karte je Nest', () => {
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

  it('nimmt nichts ohne Nest', () => {
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

describe('Die Redaktion der Pluenderung', () => {
  it('zeigt nur dem Betroffenen, WAS genommen wurde', () => {
    const ereignis = {
      t: 'raid' as const,
      round: 6,
      hits: [
        { player: 'p0', nests: 1, taken: { ...emptyHand(), ore: 2 }, count: 2 },
        { player: 'p1', nests: 2, taken: { ...emptyHand(), lumber: 3 }, count: 3 },
      ],
    };

    const fuerP0 = redactEventsFor([ereignis], 'p0')[0]!;
    if (fuerP0.t !== 'raid') throw new Error('falsches Ereignis');

    // Eigener Verlust: vollstaendig.
    expect(fuerP0.hits[0]!.taken.ore).toBe(2);
    // Fremder Verlust: die Anzahl bleibt, die Sorte nicht.
    expect(fuerP0.hits[1]!.count).toBe(3);
    expect(handSize(fuerP0.hits[1]!.taken)).toBe(0);
  });

  it('laesst das Original unberuehrt', () => {
    const ereignis = {
      t: 'raid' as const,
      round: 6,
      hits: [{ player: 'p1', nests: 1, taken: { ...emptyHand(), wool: 1 }, count: 1 }],
    };
    redactEventsFor([ereignis], 'p0');
    expect(ereignis.hits[0]!.taken.wool, 'Redaktion darf nicht am Zustand schnitzen').toBe(1);
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

describe('Die Pluenderung im Spielverlauf', () => {
  // Die Einzelteile stimmen; hier zaehlt, ob die Kette haelt: Zugende ->
  // neue grosse Runde -> Zugriff -> Ereignis -> weniger Karten.
  it('feuert am Rundenwechsel und nimmt wirklich etwas weg', () => {
    const game = solo();
    const s = game.state;
    const p = s.players[0]!;

    // Eine Siedlung direkt neben ein Nest stellen.
    const nest = hexesInRange(ORIGIN, 20).find((h) => nestAt(s.worldSeed, h.q, h.r))!;
    s.buildings[vertexKey({ q: nest.q, r: nest.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    expect(threateningNests(s, 'p0').length).toBeGreaterThan(0);

    for (const r of RESOURCES) p.hand[r] = 2; // 10 Karten - ueber der Grenze
    const vorher = handSize(p.hand);
    const bankVorher = RESOURCES.reduce((n, r) => n + s.bank[r], 0);

    // applyAction arbeitet auf einem Klon und haengt ihn neu ein - der
    // Zustand muss nach jedem Zug frisch gelesen werden.
    game.state.phase = { t: 'main' };
    let raid: { count: number; nests: number } | null = null;
    for (let i = 0; i < ROUNDS_PER_BIG_ROUND + 2; i++) {
      const res = applyAction(game, { t: 'endTurn' }, 'p0');
      if (!res.ok) throw new Error(res.error);
      const e = res.events.find((x) => x.t === 'raid');
      if (e && e.t === 'raid') { raid = e.hits[0]!; break; }
      // Wuerfelphase ueberspringen, ohne den Ertrag zu verfaelschen.
      game.state.phase = { t: 'main' };
    }

    expect(raid, 'in einer ganzen grossen Runde kam keine Pluenderung').not.toBeNull();
    expect(raid!.nests).toBeGreaterThan(0);
    expect(raid!.count).toBe(Math.floor(vorher / 2)); // Horter verliert die Haelfte

    const nachher = handSize(game.state.players[0]!.hand);
    expect(nachher).toBe(vorher - raid!.count);

    // Genommenes geht an die Bank zurueck - nichts faellt aus dem Spiel.
    const bankNachher = RESOURCES.reduce((n, r) => n + game.state.bank[r], 0);
    expect(bankNachher).toBe(bankVorher + raid!.count);
  });

  it('laesst den in Ruhe, der eng am Ursprung baut', () => {
    const game = solo();
    const s = game.state;
    const p = s.players[0]!;

    // Nur im geschuetzten Kern bauen.
    s.buildings[vertexKey({ q: 0, r: 0, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    for (const r of RESOURCES) p.hand[r] = 1;
    const vorher = handSize(p.hand);

    game.state.phase = { t: 'main' };
    for (let i = 0; i < ROUNDS_PER_BIG_ROUND + 2; i++) {
      const res = applyAction(game, { t: 'endTurn' }, 'p0');
      if (!res.ok) throw new Error(res.error);
      expect(res.events.some((x) => x.t === 'raid')).toBe(false);
      game.state.phase = { t: 'main' };
    }
    expect(handSize(game.state.players[0]!.hand)).toBe(vorher);
  });
});
