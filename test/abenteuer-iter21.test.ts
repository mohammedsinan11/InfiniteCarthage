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

describe('Abenteuer Iteration 29: Rammschleim', () => {
  it('ersetzt in zwei von drei Abenteuern einen der ersten beiden Bosse', async () => {
    const { naechsterBoss } = await import('../src/abenteuer/regeln');
    let mit = 0;
    let end = 0;
    for (let seed = 0; seed < 60; seed++) {
      const b1 = naechsterBoss({ akt: 1, seed, koenige: 0 });
      const b2 = naechsterBoss({ akt: 2, seed, koenige: 1 });
      expect(b1).not.toBe(b2);
      const b3 = naechsterBoss({ akt: 3, seed, koenige: 2 });
      expect(['koloss', 'ramm']).toContain(b3);
      // Kein Boss zweimal im selben Abenteuer.
      expect(new Set([b1, b2, b3]).size).toBe(3);
      if (b1 === 'ramm' || b2 === 'ramm') mit++;
      if (b3 === 'ramm') end++;
    }
    expect(mit).toBe(40);
    expect(end).toBeGreaterThan(5);
  });

  it('sagt einen Ansturm an; wer ausweicht, laesst ihn ins Leere rasen und taumeln', async () => {
    const { gelaende, taste, betretbar } = await import('../src/abenteuer/regeln');
    const { HEX_DIRS } = await import('../src/core/coords');
    const eben = (a: Parameters<typeof betretbar>[0], q: number, r: number) => {
      const g = gelaende(a.seed, q, r);
      return betretbar(a, q, r) && g !== 'berg' && g !== 'sumpf' && g !== 'fluss';
    };
    for (let seed = 1; seed < 80; seed++) {
      const a0 = structuredClone(wuerfeln(neuesAbenteuer(seed)));
      // Eine Linie aus vier ebenen Feldern ab dem Helden nach rechts (d), daneben ein ebenes Fluchtfeld.
      const linie = [0, 1, 2, 3].map((k) => ({ q: a0.pos.q + k, r: a0.pos.r }));
      if (!linie.every((h) => eben(a0, h.q, h.r))) continue;
      const [fq, fr] = HEX_DIRS[5]!;
      const flucht = { q: a0.pos.q + fq, r: a0.pos.r + fr };
      if (!betretbar(a0, flucht.q, flucht.r) || !eben(a0, flucht.q, flucht.r)) continue;
      let a = a0;
      a.schleime = [{ id: 99, q: a.pos.q + 3, r: a.pos.r, leben: 10, max: 10, gross: true, boss: true, bossArt: 'ramm', zaehler: 0 }];
      a.orte = [];
      a.wanderer = [];
      a.gefolge = [];
      a.tiere = [];
      a.schritte = 30;
      a.leben = 50;
      for (let i = 0; i < 8 && !a.schleime[0]?.flaeche; i++) a = taste(a, 's');
      const boss = a.schleime.find((x) => x.id === 99)!;
      if (!boss.flaeche) continue;
      expect(boss.flaeche.some((h) => h.q === a.pos.q && h.r === a.pos.r)).toBe(true);
      // Aus der Linie treten, dann warten, bis er rast.
      const tasteFlucht = (['e', 'd', 'x', 'z', 'a', 'q'] as const).find((t, i) => i === 5)!;
      a = taste(a, tasteFlucht);
      for (let i = 0; i < 6 && a.schleime.find((x) => x.id === 99)?.flaeche; i++) a = taste(a, 's');
      const nach = a.schleime.find((x) => x.id === 99)!;
      expect(nach.flaeche ?? null).toBeNull();
      expect(nach.q === a0.pos.q + 3 && nach.r === a0.pos.r).toBe(false);
      expect((nach.gebannt ?? 0) > a.zeit).toBe(true);
      return;
    }
    throw new Error('kein passendes Gelaende gefunden');
  });
});
