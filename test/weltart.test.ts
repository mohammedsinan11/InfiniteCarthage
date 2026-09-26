/** Weltarten (core/weltart.ts): die Art steckt im Seed und praegt die Karte. */

import { describe, it, expect } from 'vitest';
import { WELTARTEN, mitWeltArt, weltArtVon, zufallsArt } from '../src/core/weltart';
import { findPlayableSeed, isPlayableStart, terrainAt } from '../src/core/worldgen';
import { nestAt } from '../src/core/raiders';
import { hexesInRange } from '../src/core/coords';
import { tagesWeltSeed } from '../src/core/tages';

function anteil(art: (typeof WELTARTEN)[number]['art'], was: (s: number, q: number, r: number) => boolean): number {
  let n = 0;
  let alle = 0;
  for (let k = 0; k < 6; k++) {
    const s = findPlayableSeed(mitWeltArt(500 + k * 7919, art));
    for (const h of hexesInRange({ q: 0, r: 0 }, 18)) {
      alle++;
      if (was(s, h.q, h.r)) n++;
    }
  }
  return n / alle;
}

describe('Weltarten', () => {
  it('alte Seeds ohne Marke bleiben Kernland - laufende Partien aendern sich nicht', () => {
    for (const s of [0, 1, 4242, 77, -5, 123456789]) expect(weltArtVon(s).art).toBe('kernland');
  });

  it('die Art steckt im Seed und uebersteht die Suche nach einem guten Start', () => {
    for (const w of WELTARTEN) {
      const s = findPlayableSeed(mitWeltArt(99, w.art));
      expect(weltArtVon(s).art).toBe(w.art);
      expect(isPlayableStart(s)).toBe(true);
    }
  });

  it('ein Archipel hat deutlich mehr Wasser, ein Grenzland mehr Lager als die stillen Lande', () => {
    const wasser = (s: number, q: number, r: number) => terrainAt(s, q, r) === 'water';
    expect(anteil('archipel', wasser)).toBeGreaterThan(anteil('kernland', wasser) + 0.1);
    expect(anteil('grenzland', nestAt)).toBeGreaterThan(anteil('stille', nestAt) * 1.8);
  });

  it('der Zufall trifft jede Art', () => {
    const arten = new Set(Array.from({ length: 200 }, (_, i) => zufallsArt(i * 2654435761)));
    expect(arten.size).toBe(WELTARTEN.length);
  });

  it('Tageswelten vor dem Stichtag bleiben, wie sie waren', () => {
    expect(weltArtVon(tagesWeltSeed('2026-09-26')).art).toBe('kernland');
    const spaeter = new Set(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].map((d) => weltArtVon(tagesWeltSeed(d)).art));
    expect(spaeter.size).toBeGreaterThan(1);
  });
});
