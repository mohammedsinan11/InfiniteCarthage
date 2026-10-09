// Iteration 5: Vorzeichen, mindestens zwei Schritte, Eile, Boss taumelt, Schafe tauschen.
import { describe, it, expect } from 'vitest';
import { istWasser } from '../src/abenteuer/welt';
import { abenteuerPunkte, angriffVon, gelaende, neuesAbenteuer, OMEN, OMEN_IDS, omenFuer, sichtVon, taste, wuerfeln, zuegeBisBoss, SCHRITTE_MIN } from '../src/abenteuer/regeln';
import type { Abenteuer, Taste } from '../src/abenteuer/regeln';
import { HEX_DIRS, hexDistance } from '../src/core/coords';

const TASTE_DIR: Taste[] = ['e', 'd', 'x', 'z', 'a', 'q'];
function freieTaste(a: Abenteuer): Taste {
  for (let i = 0; i < 6; i++) {
    const [dq, dr] = HEX_DIRS[i]!;
    const g = gelaende(a.seed, a.pos.q + dq, a.pos.r + dr);
    if (g && !istWasser(g) && g !== 'berg' && g !== 'sumpf' && g !== 'fluss') return TASTE_DIR[i]!;
  }
  throw new Error('kein freier Nachbar');
}

describe('Abenteuer Iteration 5', () => {
  it('Vorzeichen: nur auf Wunsch, aus dem Seed, mit Wirkung', () => {
    expect(neuesAbenteuer(5).omen).toBeUndefined();
    const a = neuesAbenteuer(5, { omen: true });
    expect(a.omen).toBe(omenFuer(5));
    expect(a.log.some((z) => z.startsWith('Vorzeichen:'))).toBe(true);
    // Alle Vorzeichen kommen vor.
    expect(new Set(Array.from({ length: 60 }, (_, i) => omenFuer(i))).size).toBe(OMEN_IDS.length);
    expect(sichtVon(neuesAbenteuer(5, { omen: 'nebel' }))).toBe(sichtVon(neuesAbenteuer(5)) - 1);
    expect(zuegeBisBoss(neuesAbenteuer(5, { omen: 'eile' }))).toBe(10);
    expect(neuesAbenteuer(5, { omen: 'segen' }).wahl).toBeTruthy();
    const b = neuesAbenteuer(5);
    b.erschlagen = 10;
    const blut = { ...b, omen: 'blutmond' as const };
    expect(abenteuerPunkte(blut)).toBe(Math.round(abenteuerPunkte(b) * OMEN.blutmond.punkte));
  });

  it('Jeder Wurf gibt mindestens zwei Schritte', () => {
    for (let seed = 1; seed < 40; seed++) {
      const a = wuerfeln(neuesAbenteuer(seed));
      expect(a.schritte).toBeGreaterThanOrEqual(SCHRITTE_MIN);
    }
  });

  it('Ein Schaf tauscht den Platz statt den Weg zu versperren', () => {
    const a0 = wuerfeln(neuesAbenteuer(21));
    const t = freieTaste(a0);
    const d = HEX_DIRS[TASTE_DIR.indexOf(t)]!;
    const a = structuredClone(a0);
    a.schleime = [];
    a.schritte = 4;
    a.tiere = [{ id: 999, q: a.pos.q + d[0], r: a.pos.r + d[1], art: 'schaf' } as NonNullable<Abenteuer['tiere']>[number]];
    const vorher = { ...a.pos };
    const b = taste(a, t);
    expect(b.pos).toEqual({ q: vorher.q + d[0], r: vorher.r + d[1] });
    // Das Schaf hat Platz gemacht (es kann danach weitergrasen).
    expect(b.tiere!.find((x) => x.id === 999)).not.toMatchObject(b.pos);
  });

  it('Der Boss taumelt, wenn man seinem Schlag ausweicht', () => {
    const a0 = wuerfeln(neuesAbenteuer(13));
    const t = freieTaste(a0);
    let a = structuredClone(a0);
    a.leben = 99;
    a.schritte = 6;
    a.zeit = 11;
    a.schleime = [{ id: 7, q: a.pos.q, r: a.pos.r - 1, leben: 8, max: 8, gross: true, boss: true, bossArt: 'koenig', zaehler: 1, angriff: { ...a.pos } }];
    for (let i = 0; i < 3 && !a.ereignisse.some((e) => e.art === 'hieb' && e.wer === 7); i++) a = taste(a, i === 0 ? t : 's');
    const hieb = a.ereignisse.find((e) => e.art === 'hieb' && e.wer === 7);
    expect(hieb && hieb.art === 'hieb' && hieb.ziel).toBe(null);
    expect(a.schleime[0]!.gebannt ?? 0).toBeGreaterThan(a.zeit);
  });
});

describe('Abenteuer Iteration 6', () => {
  it('Begegnungen: eine nahe am Start, sie oeffnet eine Wahl und ist danach vorbei', async () => {
    const { ansprechen, waehlen } = await import('../src/abenteuer/regeln');
    let gefunden = 0;
    for (let seed = 1; seed < 30; seed++) {
      const a = neuesAbenteuer(seed);
      const o = (a.orte ?? []).find((x) => x.art === 'ereignis');
      if (!o) continue;
      gefunden++;
      expect(o.ereignis).toBeTruthy();
      const b = structuredClone(a);
      b.pos = { q: o.q + 1, r: o.r };
      b.inventar = { ...b.inventar, gold: 20, gelee: 3 };
      const c = ansprechen(b, o.id);
      expect(c.wahl?.art).toBe('ereignis');
      const d = waehlen(c, 0);
      expect(d.orte!.find((x) => x.id === o.id)!.benutzt).toBe(true);
      expect(ansprechen(d, o.id)).toBe(d);
    }
    expect(gefunden).toBeGreaterThan(20);
  });
});

describe('Abenteuer Iteration 8', () => {
  it('Rudel: in Akt 1 jagen hoechstens drei Gegner zugleich', async () => {
    const { RUDEL_AKT1 } = await import('../src/abenteuer/regeln');
    const a0 = wuerfeln(neuesAbenteuer(13));
    const a = structuredClone(a0);
    a.zeit = 10;
    a.leben = 99;
    a.schritte = 6;
    const ring = HEX_DIRS.map(([dq, dr]) => ({ q: a.pos.q + dq * 4, r: a.pos.r + dr * 4 })).filter((h) => {
      const g = gelaende(a.seed, h.q, h.r);
      return g && !istWasser(g);
    });
    a.schleime = ring.map((h, i) => ({ id: 500 + i, q: h.q, r: h.r, leben: 2, gross: false }));
    const b = taste(a, 's');
    const naeher = b.schleime.filter((s) => {
      const vorher = a.schleime.find((x) => x.id === s.id);
      if (!vorher) return false;
      return hexDistance(s, b.pos) < hexDistance(vorher, a.pos);
    });
    expect(naeher.length).toBeLessThanOrEqual(RUDEL_AKT1);
  });
});

describe('Abenteuer Iteration 9', () => {
  it('Trefferschwellen: eine 1 verfehlt, spaetere Akte und Elite sind schwerer', async () => {
    const { trefferAb, noetigFuer } = await import('../src/abenteuer/regeln');
    const a = neuesAbenteuer(3);
    expect(noetigFuer({ akt: 1 }, {})).toBe(4);
    expect(noetigFuer({ akt: 3 }, { elite: true })).toBe(6);
    a.ausruestung = { ...a.ausruestung, waffe: 'flammenschwert' };
    expect(trefferAb(a, {})).toBe(2);
    expect(trefferAb({ ...a, akt: 3 }, { art: 'panzer', elite: true })).toBe(Math.min(6, Math.max(2, 7 - angriffVon(a))));
  });

  it('Deckung (G): ein Schritt ohne Fokus, der naechste Treffer macht einen Schaden weniger', async () => {
    const { decken } = await import('../src/abenteuer/regeln');
    const a = structuredClone(wuerfeln(neuesAbenteuer(13)));
    a.schritte = 4;
    a.leben = 6;
    a.zeit = 10;
    a.schleime = [{ id: 7, q: a.pos.q, r: a.pos.r - 1, leben: 9, gross: false, angriff: { ...a.pos } }];
    const b = decken(a);
    expect(b.fokus ?? 0).toBe(0);
    expect(b.schritte).toBe(3);
    const hieb = b.ereignisse.find((e) => e.art === 'hieb' && e.wer === 7);
    if (hieb && hieb.art === 'hieb' && hieb.wurf > 0) expect(hieb.schaden).toBeLessThanOrEqual(0);
  });

  it('Taste 1 ohne volle Ladung sagt, wie weit die Waffe ist', async () => {
    const { faehigkeitNutzen } = await import('../src/abenteuer/regeln');
    const a = neuesAbenteuer(3);
    const b = faehigkeitNutzen(a);
    expect(b.log[b.log.length - 1]).toMatch(/laedt noch/);
  });
});

describe('Abenteuer Iteration 13', () => {
  it('Konter: wer neben dir ins Leere schlaegt, nimmt sofort Schaden', async () => {
    const { legendaerAnwenden } = await import('../src/abenteuer/regeln');
    const a0 = wuerfeln(neuesAbenteuer(13));
    const t = freieTaste(a0);
    const d = HEX_DIRS[TASTE_DIR.indexOf(t)]!;
    let a = structuredClone(a0);
    legendaerAnwenden(a, 'konter', 0);
    a.leben = 99;
    a.schritte = 6;
    a.zeit = 10;
    // Der Gegner steht so, dass er nach dem Schritt neben dem Ritter ins Leere schlaegt.
    a.schleime = [{ id: 7, q: a.pos.q + d[0] * 2, r: a.pos.r + d[1] * 2, leben: 9, gross: false, angriff: { ...a.pos } }];
    a = taste(a, t);
    const s = a.schleime.find((x) => x.id === 7);
    expect(s?.leben ?? 0).toBeLessThan(9);
  });
});

describe('Abenteuer Iteration 17', () => {
  it('Schatzkarte: jeder Akt hat ein Versteck; wer hingeht, bekommt Truhe und Gold', async () => {
    const a0 = neuesAbenteuer(9, { omen: true });
    expect(a0.versteck).toBeTruthy();
    const v = a0.versteck!;
    expect(hexDistance(v, a0.pos)).toBeGreaterThanOrEqual(7);
    // Neben das Versteck stellen und hineingehen.
    const a = structuredClone(wuerfeln(a0));
    a.wahl = null;
    a.schleime = [];
    const i = HEX_DIRS.findIndex(([dq, dr]) => {
      const g = gelaende(a.seed, v.q - dq, v.r - dr);
      return g && !istWasser(g) && g !== 'berg';
    });
    const [dq, dr] = HEX_DIRS[i]!;
    a.pos = { q: v.q - dq, r: v.r - dr };
    a.schritte = 3;
    const gold = a.inventar['gold'] ?? 0;
    const b = taste(a, TASTE_DIR[i]!);
    expect(b.versteck).toBeNull();
    expect(b.inventar['gold'] ?? 0).toBeGreaterThan(gold);
    expect(b.wahl?.art).toBe('truhe');
  });
});
