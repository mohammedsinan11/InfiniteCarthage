// Iteration 21: Endboss durch Runenfunken, Ladung beim Waffentausch.
import { describe, it, expect } from 'vitest';
import { neuesAbenteuer, wuerfeln } from '../src/abenteuer/regeln';

describe('Abenteuer Iteration 21', () => {
  it('Faellt der Endboss durch Runenfunken beim Wurf, ist das Abenteuer gewonnen', () => {
    let gefunden = false;
    for (let seed = 1; seed < 200 && !gefunden; seed++) {
      const a = structuredClone(neuesAbenteuer(seed));
      a.akt = 3;
      a.ausruestung = { ...a.ausruestung, wuerfel: 'runenwuerfel' };
      a.schleime = [{ id: 99, q: a.pos.q + 1, r: a.pos.r, leben: 1, gross: true, boss: true, bossArt: 'koloss' }];
      const b = wuerfeln(a);
      if (b.wurf !== 5 && b.wurf !== 6) continue;
      gefunden = true;
      expect(b.phase).toBe('sieg');
      expect(b.schleime.some((s) => s.boss)).toBe(false);
    }
    expect(gefunden).toBe(true);
  });
});
