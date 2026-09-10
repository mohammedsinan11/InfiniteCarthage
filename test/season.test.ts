/**
 * Die Zeitrechnung ist reine Ableitung aus der Zugnummer - genau deshalb
 * laesst sie sich vollstaendig durchpruefen, ohne ein Spiel zu starten.
 */

import { describe, it, expect } from 'vitest';
import {
  ROUNDS_PER_BIG_ROUND,
  ROUNDS_PER_SEASON,
  SEASONS,
  bigRoundOf,
  roundOf,
  roundsLeftInSeason,
  seasonChangedAt,
  seasonOf,
  yearOf,
} from '../src/core/season';

describe('Runden', () => {
  it('faengt bei 1 an, auch vor dem ersten Zug', () => {
    expect(roundOf(0)).toBe(1);
    expect(roundOf(-3)).toBe(1);
    expect(roundOf(1)).toBe(1);
    expect(roundOf(7)).toBe(7);
  });

  it('fasst je fuenf Runden zu einer grossen zusammen', () => {
    expect(bigRoundOf(1)).toBe(1);
    expect(bigRoundOf(5)).toBe(1);
    expect(bigRoundOf(6)).toBe(2);
    expect(bigRoundOf(10)).toBe(2);
    expect(bigRoundOf(11)).toBe(3);
  });
});

describe('Jahreszeiten', () => {
  it('wechselt alle fuenfzehn Runden in fester Reihenfolge', () => {
    expect(seasonOf(1)).toBe('spring');
    expect(seasonOf(15)).toBe('spring');
    expect(seasonOf(16)).toBe('summer');
    expect(seasonOf(30)).toBe('summer');
    expect(seasonOf(31)).toBe('autumn');
    expect(seasonOf(46)).toBe('winter');
    // Nach vier Jahreszeiten geht es von vorn los.
    expect(seasonOf(61)).toBe('spring');
  });

  it('haelt jede Jahreszeit genau fuenfzehn Runden', () => {
    const zaehler = new Map<string, number>();
    for (let t = 1; t <= ROUNDS_PER_SEASON * SEASONS.length; t++) {
      const s = seasonOf(t);
      zaehler.set(s, (zaehler.get(s) ?? 0) + 1);
    }
    for (const s of SEASONS) expect(zaehler.get(s)).toBe(ROUNDS_PER_SEASON);
  });

  it('zaehlt die verbleibenden Runden herunter', () => {
    expect(roundsLeftInSeason(1)).toBe(15);
    expect(roundsLeftInSeason(2)).toBe(14);
    expect(roundsLeftInSeason(15)).toBe(1);
    // Direkt nach dem Wechsel wieder voll.
    expect(roundsLeftInSeason(16)).toBe(15);
  });

  it('meldet den Wechsel genau einmal je Jahreszeit', () => {
    const wechsel: number[] = [];
    for (let t = 1; t <= 61; t++) if (seasonChangedAt(t)) wechsel.push(t);
    expect(wechsel).toEqual([16, 31, 46, 61]);
    // Der erste Zug ist kein Wechsel.
    expect(seasonChangedAt(1)).toBe(false);
  });
});

describe('Jahre', () => {
  it('umfasst vier Jahreszeiten', () => {
    const proJahr = ROUNDS_PER_SEASON * SEASONS.length;
    expect(proJahr).toBe(60);
    expect(yearOf(1)).toBe(1);
    expect(yearOf(proJahr)).toBe(1);
    expect(yearOf(proJahr + 1)).toBe(2);
  });

  it('haengt luecken- und sprungfrei zusammen', () => {
    // Ueber zweieinhalb Jahre darf nichts springen oder ausfallen.
    let jahr = 1;
    let saison = seasonOf(1);
    for (let t = 2; t <= 150; t++) {
      const j = yearOf(t);
      const s = seasonOf(t);
      expect(j - jahr).toBeLessThanOrEqual(1);
      if (s !== saison) expect(seasonChangedAt(t)).toBe(true);
      jahr = j;
      saison = s;
    }
    expect(ROUNDS_PER_BIG_ROUND).toBe(5);
  });
});
