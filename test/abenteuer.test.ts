/** Abenteuer (src/abenteuer/regeln.ts): wuerfeln, gehen, kaempfen, sammeln - im Takt der Spieluhr. */

import { describe, it, expect } from 'vitest';
import { benutzen, fundAuf, gelaende, neuesAbenteuer, taste, tasteZu, wuerfeln, zugBeenden } from '../src/abenteuer/regeln';
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

describe('Abenteuer', () => {
  it('beginnt auf Land, mit Schwert und ohne Wurf', () => {
    const a = neuesAbenteuer(42);
    expect(gelaende(42, a.pos.q, a.pos.r)).not.toBe('water');
    expect(a.ausruestung.waffe).toBe('schwert');
    expect(a.phase).toBe('wuerfeln');
    expect(a.erkundet.length).toBeGreaterThan(6);
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
