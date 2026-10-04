/** Abenteuer (src/abenteuer/regeln.ts): wuerfeln, gehen, kaempfen, sammeln - im Takt der Spieluhr. */

import { describe, it, expect } from 'vitest';
import { BOSS_LEBEN, BOSS_NACH, GRUND_LEBEN, angriffVon, maxLebenVon, benutzen, debugAktion, ladungVon, gegenstand, normalisiere, fundAuf, gelaende, neuesAbenteuer, taste, tasteZu, wuerfeln, zugBeenden } from '../src/abenteuer/regeln';
import type { Abenteuer, Taste } from '../src/abenteuer/regeln';
import { HEX_DIRS, hexDistance } from '../src/core/coords';

/** Ein Abenteuer im Zug, mit festen Schritten und nur den gegebenen Schleimen. */
function imZug(seed: number, schleime: Abenteuer['schleime'] = [], schritte = 6): Abenteuer {
  const a = structuredClone(wuerfeln(neuesAbenteuer(seed)));
  a.schleime = schleime;
  a.schritte = schritte;
  return a;
}

/** Eine Taste, die vom Start auf begehbares, flaches Land fuehrt. */
function freieTaste(a: Abenteuer): Taste {
  for (const t of ['d', 'e', 'x', 'z', 'a', 'q'] as Taste[]) {
    const ziel = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t)]!;
    const g = gelaende(a.seed, a.pos.q + ziel[0], a.pos.r + ziel[1]);
    if (g && g !== 'water' && g !== 'mountain') return t;
  }
  throw new Error('kein freier Nachbar');
}

/** Den naechsten Schritt im Hin und Her: zurueck, wenn man draussen steht, sonst hinaus. */
function i6(a: Abenteuer, hin: Taste, zurueck: Taste): Taste {
  return a.pfad.length % 2 === 0 ? zurueck : hin;
}

describe('Abenteuer', () => {
  it('beginnt auf Land, mit Schwert und ohne Wurf', () => {
    const a = neuesAbenteuer(42);
    expect(gelaende(42, a.pos.q, a.pos.r)).not.toBe('water');
    expect(a.ausruestung.waffe).toBe('schwert');
    expect(a.phase).toBe('wuerfeln');
    expect(a.erkundet.length).toBeGreaterThan(6);
  });

  it('der Ritter beginnt nie im Wasser - auch nicht, wenn um den Ursprung nur Meer ist', () => {
    // 774553834: im Umkreis von sechs Feldern lag nur ein Berg (Spieltest).
    for (const seed of [774553834, 1844960718, 978983017, -1288175827, 2049389901, 1, 2, 3]) {
      const a = neuesAbenteuer(seed);
      const t = gelaende(seed, a.pos.q, a.pos.r);
      expect(t).not.toBe('water');
      expect(t).not.toBeNull();
    }
  });

  it('ein alter Spielstand mit dem Ritter im Wasser setzt ihn beim Laden an Land', () => {
    const a = structuredClone(neuesAbenteuer(774553834));
    // Ein Wasserfeld in der Naehe suchen und den Ritter darauf stellen (wie ein alter Stand).
    let wasser: { q: number; r: number } | null = null;
    for (let q = -6; q <= 6 && !wasser; q++) for (let r = -6; r <= 6 && !wasser; r++) if (gelaende(a.seed, q, r) === 'water') wasser = { q, r };
    expect(wasser).not.toBeNull();
    a.pos = wasser!;
    const b = normalisiere(a);
    expect(gelaende(b.seed, b.pos.q, b.pos.r)).not.toBe('water');
  });

  it('Schwerter liegen in Truhen; eine bessere Waffe kommt gleich in die Hand', () => {
    expect(gegenstand('runenklinge')?.krit).toBe(3);
    expect(gegenstand('flammenschwert')?.angriff).toBe(3);
    // Eine Truhe mit einem Schwert finden und hinlaufen.
    for (let seed = 1; seed < 3000; seed++) {
      const a0 = neuesAbenteuer(seed);
      for (const k of ['d', 'e', 'x', 'z', 'a', 'q'] as Taste[]) {
        const [dq, dr] = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(k)]!;
        const h = { q: a0.pos.q + dq, r: a0.pos.r + dr };
        if (fundAuf(a0, h.q, h.r) !== 'truhe' || gelaende(seed, h.q, h.r) === 'mountain') continue;
        const b = taste(imZug(seed), k);
        const waffe = b.ausruestung.waffe!;
        if (waffe === 'schwert') continue;
        expect(['axt', 'breitschwert', 'runenklinge', 'flammenschwert']).toContain(waffe);
        expect(b.inventar['schwert']).toBe(1);
        return;
      }
    }
    throw new Error('keine Truhe mit Waffe gefunden');
  });

  it('die Tasten liegen wie die Nachbarn eines Sechsecks um S', () => {
    const o = { q: 0, r: 0 };
    expect(tasteZu(o, { q: 1, r: -1 })).toBe('e');
    expect(tasteZu(o, { q: 1, r: 0 })).toBe('d');
    expect(tasteZu(o, { q: 0, r: 1 })).toBe('x');
    expect(tasteZu(o, { q: -1, r: 1 })).toBe('z');
    expect(tasteZu(o, { q: -1, r: 0 })).toBe('a');
    expect(tasteZu(o, { q: 0, r: -1 })).toBe('q');
    expect(tasteZu(o, o)).toBe('s');
    expect(tasteZu(o, { q: 2, r: 0 })).toBeNull();
  });

  it('jeder Schritt ist ein Tick: die Schleime huepfen mit', () => {
    const a0 = neuesAbenteuer(7);
    const s = { id: 99, q: a0.pos.q + 4, r: a0.pos.r, leben: 2, gross: false };
    const a = imZug(7, [s]);
    const b = taste(a, 's');
    expect(b.zeit).toBe(a.zeit + 1);
    expect(b.schritte).toBe(5);
    // Der Schleim wittert den Ritter und huepft einen Schritt naeher.
    expect(hexDistance(b.schleime[0]!, b.pos)).toBe(3);
    expect(b.ereignisse.some((e) => e.art === 'gehen' && e.wer === 99)).toBe(true);
  });

  it('sind die Schritte verbraucht, wird wieder gewuerfelt', () => {
    let a = imZug(9, [], 2);
    a = taste(a, 's');
    expect(a.phase).toBe('ziehen');
    a = taste(a, 's');
    expect(a.phase).toBe('wuerfeln');
    expect(a.zug).toBe(2);
  });

  it('Zug beenden wartet die restlichen Schritte ab - jeder ein Tick', () => {
    const a = imZug(9, [], 5);
    const b = zugBeenden(a);
    expect(b.phase).toBe('wuerfeln');
    expect(b.zeit).toBe(a.zeit + 5);
  });

  it('ein Schritt auf einen Schleim ist ein Angriff', () => {
    const a0 = neuesAbenteuer(11);
    let b = imZug(11, [{ id: 99, q: a0.pos.q + 1, r: a0.pos.r, leben: 1, gross: false }]);
    const vorher = b.pos;
    for (let i = 0; i < 6 && b.schleime.length > 0 && b.phase === 'ziehen'; i++) b = taste(b, 'd');
    expect(b.pos).toEqual(vorher);
    expect(b.ereignisse.some((e) => e.art === 'hieb' && e.wer === 'ritter')).toBe(true);
    if (b.schleime.length === 0) {
      expect(b.erschlagen).toBe(1);
      expect(b.inventar['gelee']).toBe(1);
    }
  });

  it('ein Schleim nebenan sagt seinen Angriff an und trifft im naechsten Takt', () => {
    const a0 = neuesAbenteuer(13);
    let a = imZug(13, [{ id: 5, q: a0.pos.q, r: a0.pos.r - 1, leben: 2, gross: false }]);
    a = taste(a, 's');
    expect(a.ereignisse.some((e) => e.art === 'ansage' && e.wer === 5)).toBe(true);
    expect(a.schleime[0]!.angriff).toEqual(a.pos);
    const leben = a.leben;
    a = taste(a, 's');
    expect(a.ereignisse.some((e) => e.art === 'hieb' && e.wer === 5 && e.ziel === 'ritter')).toBe(true);
    // Ohne Schild trifft ein angesagter Hieb immer.
    expect(a.leben).toBe(leben - 1);
  });

  it('wer dem angesagten Feld ausweicht, wird nicht getroffen', () => {
    const a0 = neuesAbenteuer(21);
    let a = imZug(21, []);
    const t = freieTaste(a);
    // Der Schleim steht auf der Gegenseite der freien Richtung.
    const ri = ['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t);
    const gegen = HEX_DIRS[(ri + 3) % 6]!;
    a.schleime = [{ id: 7, q: a0.pos.q + gegen[0], r: a0.pos.r + gegen[1], leben: 2, gross: false, angriff: { ...a0.pos } }];
    const leben = a.leben;
    a = taste(a, t);
    expect(a.ereignisse.some((e) => e.art === 'hieb' && e.wer === 7 && e.ziel === null)).toBe(true);
    expect(a.leben).toBe(leben);
  });

  it('der Ritter geht auf ein Nachbarfeld', () => {
    const a = imZug(21);
    const t = freieTaste(a);
    const b = taste(a, t);
    expect(hexDistance(a.pos, b.pos)).toBe(1);
    expect(b.pfad.length).toBe(2);
    expect(b.ereignisse[0]).toMatchObject({ art: 'gehen', wer: 'ritter', takt: 0 });
  });

  it('Herzen liegen in der Welt und heilen beim Aufheben', () => {
    const a = neuesAbenteuer(3);
    let herzen = 0;
    for (let q = -30; q < 30; q++) for (let r = -30; r < 30; r++) if (fundAuf(a, q, r)?.endsWith('herz')) herzen++;
    expect(herzen).toBeGreaterThan(0);
  });

  it('mit dem letzten Schritt kommt man immer auf einen Berg - niemand sitzt fest', () => {
    // Einen Start neben einem Berg suchen.
    for (let seed = 1; seed < 300; seed++) {
      const a0 = neuesAbenteuer(seed);
      const i = HEX_DIRS.findIndex(([dq, dr]) => gelaende(seed, a0.pos.q + dq, a0.pos.r + dr) === 'mountain');
      if (i < 0) continue;
      const t = (['e', 'd', 'x', 'z', 'a', 'q'] as Taste[])[i]!;
      const a = imZug(seed, [], 1);
      const b = taste(a, t);
      expect(hexDistance(a.pos, b.pos)).toBe(1);
      expect(b.phase).toBe('wuerfeln');
      return;
    }
    throw new Error('kein Start neben einem Berg');
  });

  it('nach acht Schleimen erwacht der Schleimkoenig - wer ihn bezwingt, gewinnt', () => {
    const a0 = neuesAbenteuer(11);
    let b = imZug(11, [{ id: 99, q: a0.pos.q + 1, r: a0.pos.r, leben: 1, gross: false }], 20);
    b.erschlagen = BOSS_NACH - 1;
    for (let i = 0; i < 20 && b.schleime.some((x) => x.id === 99) && b.phase === 'ziehen'; i++) b = taste(b, 'd');
    expect(b.erschlagen).toBe(BOSS_NACH);
    const koenig = b.schleime.find((x) => x.boss);
    expect(koenig?.leben).toBe(BOSS_LEBEN);
    expect(b.bossErwacht).toBe(true);
    expect(b.phase).not.toBe('sieg');
    // Der Koenig faellt: Sieg.
    const c = structuredClone(b);
    c.phase = 'ziehen';
    c.schritte = 30;
    c.leben = 99;
    c.schleime = [{ ...koenig!, q: c.pos.q + 1, r: c.pos.r, leben: 1, angriff: null, flaeche: null }];
    let d = c;
    for (let i = 0; i < 30 && d.phase === 'ziehen'; i++) d = taste(d, 'd');
    expect(d.phase).toBe('sieg');
  });

  it('der Koenig sagt Schlag oder Ring an und handelt nur jeden zweiten Tick', () => {
    const a0 = neuesAbenteuer(13);
    let a = imZug(13, [{ id: 50, q: a0.pos.q, r: a0.pos.r - 1, leben: BOSS_LEBEN, gross: true, boss: true, zaehler: 0 }], 10);
    a.leben = 99;
    const ansagen: number[] = [];
    for (let i = 0; i < 8; i++) {
      a = taste(a, 's');
      for (const e of a.ereignisse) if (e.art === 'ansage' && e.wer === 50) ansagen.push(a.zeit);
    }
    expect(ansagen.length).toBeGreaterThan(0);
    // Nur an geraden Ticks.
    for (const z of ansagen) expect(z % 2).toBe(0);
  });

  it('der Spuckschleim sagt eine Linie an und trifft, wer darin stehen bleibt', () => {
    const a0 = neuesAbenteuer(13);
    let a = imZug(13, [{ id: 7, q: a0.pos.q + 2, r: a0.pos.r, leben: 2, gross: false, art: 'spuck' }], 10);
    a.leben = 99;
    a = taste(a, 's');
    const linie = a.schleime[0]!.flaeche;
    expect(linie).toHaveLength(3);
    expect(linie!.some((h) => h.q === a.pos.q && h.r === a.pos.r)).toBe(true);
    const leben = a.leben;
    a = taste(a, 's');
    expect(a.ereignisse.some((e) => e.art === 'spuck')).toBe(true);
    expect(a.leben).toBe(leben - 1);
  });

  it('der Springschleim sagt sein Landefeld an - wer ausweicht, unter dem landet er nicht', () => {
    const a0 = neuesAbenteuer(21);
    let a = imZug(21, [], 10);
    const t = freieTaste(a);
    const ri = ['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t);
    const gegen = HEX_DIRS[(ri + 3) % 6]!;
    // Drei Felder entfernt auf der Gegenseite - wenn das Land ist.
    const sp = { q: a0.pos.q + gegen[0] * 3, r: a0.pos.r + gegen[1] * 3 };
    a.schleime = [{ id: 8, q: sp.q, r: sp.r, leben: 2, gross: false, art: 'spring' }];
    a.leben = 99;
    a = taste(a, 's');
    expect(a.schleime[0]!.angriff).toEqual(a.pos);
    const leben = a.leben;
    const start = a.pos;
    a = taste(a, t);
    expect(a.leben).toBe(leben);
    // Er ist gesprungen - auf das leere Feld, wenn es Land ist.
    if (gelaende(21, start.q, start.r) !== 'water') expect(a.schleime[0]).toMatchObject({ q: start.q, r: start.r });
  });

  it('der Panzerschleim braucht einen Wurf ab 5', () => {
    const a0 = neuesAbenteuer(11);
    let b = imZug(11, [{ id: 9, q: a0.pos.q + 1, r: a0.pos.r, leben: 3, gross: false, art: 'panzer' }], 30);
    b.leben = 99;
    let treffer = 0;
    for (let i = 0; i < 30 && b.phase === 'ziehen' && b.schleime.length; i++) {
      b = taste(b, 'd');
      for (const e of b.ereignisse) if (e.art === 'hieb' && e.wer === 'ritter') {
        expect(e.schaden > 0).toBe(e.wurf + 1 >= 5);
        if (e.schaden > 0) treffer++;
      }
    }
    expect(treffer).toBeGreaterThan(0);
  });

  it('Waffen laden mit Schritten und Treffern; voll wirkt ihre Faehigkeit', () => {
    const a0 = neuesAbenteuer(21);
    let a = debugAktion(imZug(21, [], 20), { t: 'waffe', id: 'flammenschwert' });
    expect(ladungVon(a)).toMatchObject({ ist: 0, voll: 7, faehigkeit: 'feuerkreis' });
    const t = freieTaste(a);
    const zurueck = (['e', 'd', 'x', 'z', 'a', 'q'] as Taste[])[(['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t) + 3) % 6]!;
    for (let i = 0; i < 6; i++) a = taste(a, i % 2 ? zurueck : t);
    expect(a.ladung).toBe(6);
    // Der siebte Schritt fuellt den Balken: Feuerkreis um den Ritter.
    a.schleime = [{ id: 70, q: a0.pos.q, r: a0.pos.r - 1, leben: 2, gross: false }];
    a = taste(a, i6(a, t, zurueck));
    expect(a.ereignisse.some((e) => e.art === 'faehigkeit' && e.name === 'feuerkreis')).toBe(true);
    expect(a.ladung).toBe(0);
  });

  it('Debug: Ladung voll loest die Faehigkeit sofort aus', () => {
    const a0 = neuesAbenteuer(13);
    let a = debugAktion(imZug(13, [{ id: 71, q: a0.pos.q + 1, r: a0.pos.r, leben: 2, gross: false }]), { t: 'waffe', id: 'flammenschwert' });
    a = debugAktion(a, { t: 'ladung' });
    expect(a.schleime).toHaveLength(0);
    a = debugAktion(debugAktion(a, { t: 'waffe', id: 'breitschwert' }), { t: 'ladung' });
    expect(a.bereit).toBe('schutzwall');
  });

  it('Legendaer: Solo-Leveling gibt Level mit Statups, der Herzcontainer ein leeres Herz', () => {
    let a = imZug(5);
    const max = maxLebenVon(a);
    a = debugAktion(a, { t: 'legendaer', id: 'herzcontainer' });
    expect(maxLebenVon(a)).toBe(max + 1);
    expect(a.leben).toBe(GRUND_LEBEN);
    a = debugAktion(a, { t: 'legendaer', id: 'sololeveling' });
    expect(a.stufe).toEqual({ lv: 1, ep: 0 });
    a = debugAktion(a, { t: 'ep' });
    expect(a.stufe?.lv).toBe(2);
    expect(maxLebenVon(a)).toBe(max + 2);
    const angriff = angriffVon(a);
    a = debugAktion(a, { t: 'ep' });
    expect(angriffVon(a)).toBe(angriff + 1);
    expect(a.legendaer).toEqual(['herzcontainer', 'sololeveling']);
  });

  it('Herzen werden gleich verbraucht - bei vollem Leben bleiben sie liegen', () => {
    // Ein Herz direkt neben den Start legen: das Feld suchen, auf dem eines liegt.
    let seed = 0;
    let ziel: { q: number; r: number } | null = null;
    let t: Taste | null = null;
    for (seed = 1; seed < 400 && !ziel; seed++) {
      const a0 = neuesAbenteuer(seed);
      for (const k of ['d', 'e', 'x', 'z', 'a', 'q'] as Taste[]) {
        const [dq, dr] = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(k)]!;
        const h = { q: a0.pos.q + dq, r: a0.pos.r + dr };
        if (fundAuf(a0, h.q, h.r) === 'herz' && gelaende(seed, h.q, h.r) !== 'mountain') {
          ziel = h;
          t = k;
          break;
        }
      }
    }
    seed -= 1;
    expect(ziel).not.toBeNull();
    const voll = taste(imZug(seed), t!);
    expect(voll.inventar['herz']).toBeUndefined();
    expect(fundAuf(voll, ziel!.q, ziel!.r)).toBe('herz');
    const wund = structuredClone(imZug(seed));
    wund.leben = 3;
    const b = taste(wund, t!);
    expect(b.leben).toBe(4);
    expect(b.inventar['herz']).toBeUndefined();
    expect(fundAuf(b, ziel!.q, ziel!.r)).toBeNull();
  });

  it('Kraut heilt, Ausruestung wird angelegt, halbe Herzen zaehlen halb', () => {
    let a = structuredClone(neuesAbenteuer(5));
    a.leben = 2;
    a.inventar = { kraut: 1, axt: 1, halbherz: 1 };
    a = benutzen(a, 'kraut');
    expect(a.leben).toBe(4);
    a = benutzen(a, 'halbherz');
    expect(a.leben).toBe(4.5);
    a = benutzen(a, 'axt');
    expect(a.ausruestung.waffe).toBe('axt');
    expect(a.inventar['schwert']).toBe(1);
  });
});
