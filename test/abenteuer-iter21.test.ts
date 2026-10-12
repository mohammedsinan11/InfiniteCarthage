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

describe('Abenteuer Iteration 25', () => {
  it('Eine Begegnung zu entdecken haelt den Boss zwei Zuege hin', async () => {
    const { ansprechen, waehlen, zuegeBisBoss, ENTDECKER_ZUEGE } = await import('../src/abenteuer/regeln');
    for (let seed = 1; seed < 60; seed++) {
      const a = structuredClone(neuesAbenteuer(seed));
      const o = (a.orte ?? []).find((x) => x.art === 'ereignis');
      if (!o) continue;
      a.pos = { q: o.q + 1, r: o.r };
      a.schleime = [];
      a.inventar = { ...a.inventar, gold: 50 };
      const b = ansprechen(a, o.id);
      if (!b.wahl) continue;
      const nr = b.wahl.optionen.findIndex((x) => x !== 'ev_weiter');
      const c = waehlen(b, nr);
      expect(zuegeBisBoss(c)).toBe(zuegeBisBoss(a) + ENTDECKER_ZUEGE);
      return;
    }
    throw new Error('keine Begegnung gefunden');
  });

  it('Eine Wahl auf dem letzten Schritt beendet danach den Zug', async () => {
    const { waehlen } = await import('../src/abenteuer/regeln');
    const a = structuredClone(wuerfeln(neuesAbenteuer(5)));
    a.schritte = 0;
    a.wahl = { art: 'rast', titel: 'Rast', optionen: ['rast_gold', 'rast_kraut', 'rast_schleifen'] };
    const b = waehlen(a, 0);
    expect(b.wahl).toBeNull();
    expect(b.phase).toBe('wuerfeln');
  });
});
