/**
 * Fraktionen und Feindschaft: wem die Lager gehoeren, wer wen angreift und wann
 * ein Schlag sitzt.
 */

import { describe, it, expect } from 'vitest';
import { FRAKTION_FARBEN, fraktionAt, fraktionById } from '../src/core/factions';
import {
  BESATZUNG_UNGEORDNET,
  NEUTRAL,
  PALISADE,
  feindlich,
  spielerSeite,
  trifft,
} from '../src/core/combat';
import { hexKey, hexesInRange, neighbors } from '../src/core/coords';
import { nestAt } from '../src/core/raiders';
import { WERTE, nestFraktionOf, nestOccupants } from '../src/core/units';
import { createGame } from '../src/core/rules/reducer';

const ORIGIN = { q: 0, r: 0 };

describe('Fraktionen', () => {
  it('sind rein und haben Namen und eine Farbe', () => {
    for (const h of hexesInRange(ORIGIN, 12)) {
      const a = fraktionAt(2024, h.q, h.r);
      expect(fraktionAt(2024, h.q, h.r)).toEqual(a);
      expect(fraktionById(2024, a.id)).toEqual(a);
      expect(a.name.length).toBeGreaterThan(4);
      expect(a.farbe).toBeGreaterThanOrEqual(0);
      expect(a.farbe).toBeLessThan(FRAKTION_FARBEN);
    }
  });

  it('bilden zusammenhaengende Gebiete', () => {
    let gleich = 0;
    let alle = 0;
    for (const h of hexesInRange(ORIGIN, 30)) {
      const eigene = fraktionAt(2024, h.q, h.r).id;
      for (const n of neighbors(h.q, h.r)) {
        alle++;
        if (fraktionAt(2024, n.q, n.r).id === eigene) gleich++;
      }
    }
    expect(gleich / alle).toBeGreaterThan(0.85);
  });

  it('benachbarte Gebiete tragen verschiedene Farben', () => {
    for (const seed of [2024, 7]) {
      for (const h of hexesInRange(ORIGIN, 45)) {
        const a = fraktionAt(seed, h.q, h.r);
        for (const n of neighbors(h.q, h.r)) {
          const b = fraktionAt(seed, n.q, n.r);
          if (a.id !== b.id) expect(b.farbe).not.toBe(a.farbe);
        }
      }
    }
  });

  it('gibt es als Raeuberbanden und Goblinstaemme, mit verschiedenen Namen', () => {
    const arten = new Set<string>();
    const namen = new Set<string>();
    for (const seed of [2024, 7, 31337]) {
      for (const h of hexesInRange(ORIGIN, 60)) {
        if (!nestAt(seed, h.q, h.r)) continue;
        const f = fraktionAt(seed, h.q, h.r);
        arten.add(f.art);
        namen.add(f.name);
        expect(nestOccupants(seed, h.q, h.r).kind).toBe(f.art);
      }
    }
    expect([...arten].sort()).toEqual(['goblin', 'raeuber']);
    expect(namen.size).toBeGreaterThan(5);
  });

  it('ein erobertes Lager gehoert der neuen Fraktion', () => {
    const s = createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15).state;
    const nest = hexesInRange(ORIGIN, 30).find((h) => nestAt(2024, h.q, h.r))!;
    expect(nestFraktionOf(s, nest.q, nest.r)).toBe(fraktionAt(2024, nest.q, nest.r).id);
    s.nestFraktion[hexKey(nest.q, nest.r)] = 'f:99:99';
    expect(nestFraktionOf(s, nest.q, nest.r)).toBe('f:99:99');
  });
});

describe('Feindschaft', () => {
  it('Fraktionen gegeneinander und gegen Spieler - Spieler nicht untereinander, Wanderer mit niemandem', () => {
    const a = 'f:0:0';
    const b = 'f:1:0';
    expect(feindlich(a, b)).toBe(true);
    expect(feindlich(a, a)).toBe(false);
    expect(feindlich(a, spielerSeite('p0'))).toBe(true);
    expect(feindlich(spielerSeite('p0'), spielerSeite('p1'))).toBe(false);
    expect(feindlich(NEUTRAL, a)).toBe(false);
    expect(feindlich(spielerSeite('p0'), NEUTRAL)).toBe(false);
  });

  it('eine Sechs trifft immer, eine Eins nie', () => {
    expect(trifft(6, -10)).toBe(true);
    expect(trifft(1, 10)).toBe(false);
  });

  it('ergibt die Werte der ersten Belagerung: Ritter ab 4, Raeuberbesatzung nur mit 6', () => {
    const ritter = WERTE.ritter.angriff;
    expect(trifft(3, ritter)).toBe(true);
    expect(trifft(2, ritter)).toBe(false);
    expect(trifft(4, ritter, -PALISADE)).toBe(true);
    expect(trifft(3, ritter, -PALISADE)).toBe(false);
    expect(trifft(5, WERTE.raeuber.angriff, -BESATZUNG_UNGEORDNET)).toBe(false);
    expect(trifft(6, WERTE.raeuber.angriff, -BESATZUNG_UNGEORDNET)).toBe(true);
  });
});
