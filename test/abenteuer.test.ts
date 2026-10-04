/** Abenteuer (src/abenteuer/regeln.ts): wuerfeln, gehen, kaempfen, sammeln. */

import { describe, it, expect } from 'vitest';
import { benutzen, gelaende, neuesAbenteuer, taste, wuerfeln } from '../src/abenteuer/regeln';
import type { Abenteuer, Taste } from '../src/abenteuer/regeln';
import { hexDistance } from '../src/core/coords';

describe('Abenteuer', () => {
  it('beginnt auf Land, mit Schwert und ohne Wurf', () => {
    const a = neuesAbenteuer(42);
    expect(gelaende(42, a.pos.q, a.pos.r)).not.toBe('water');
    expect(a.ausruestung.waffe).toBe('schwert');
    expect(a.phase).toBe('wuerfeln');
    expect(a.erkundet.length).toBeGreaterThan(6);
  });

  it('der Wurf gibt Schritte, jeder Schritt kostet einen, dann ziehen die Schleime', () => {
    let a = wuerfeln(neuesAbenteuer(7));
    expect(a.phase).toBe('ziehen');
    expect(a.schritte).toBe(a.wurf);
    const start = a.pos;
    // Gehen, bis die Schritte verbraucht sind (Wasser ueberspringen).
    const tasten: Taste[] = ['d', 'e', 'c', 'a', 'q', 'z', 'w', 'x'];
    let i = 0;
    while (a.phase === 'ziehen' && i < 60) {
      a = taste(a, tasten[i % tasten.length]!);
      i += 1;
    }
    expect(a.phase === 'wuerfeln' || a.phase === 'tot' || a.phase === 'sieg').toBe(true);
    expect(a.zug).toBe(2);
    expect(hexDistance(start, a.pos)).toBeLessThanOrEqual(6);
  });

  it('Rasten beendet den Zug', () => {
    const a = taste(wuerfeln(neuesAbenteuer(9)), 's');
    expect(a.phase).toBe('wuerfeln');
    expect(a.zug).toBe(2);
  });

  it('ein Schritt auf einen Schleim ist ein Angriff', () => {
    let a: Abenteuer = wuerfeln(neuesAbenteuer(11));
    a = structuredClone(a);
    a.schleime = [{ id: 99, q: a.pos.q + 1, r: a.pos.r, leben: 1, gross: false }];
    a.schritte = 6;
    const vorher = a.pos;
    let b = a;
    for (let i = 0; i < 6 && b.schleime.length > 0; i++) b = taste(b, 'd');
    expect(b.pos).toEqual(vorher);
    if (b.schleime.length === 0) {
      expect(b.erschlagen).toBe(1);
      expect(b.inventar['gelee']).toBe(1);
    }
  });

  it('Kraut heilt, Ausruestung wird angelegt', () => {
    let a = structuredClone(neuesAbenteuer(5));
    a.leben = 2;
    a.inventar = { kraut: 1, axt: 1 };
    a = benutzen(a, 'kraut');
    expect(a.leben).toBe(4);
    a = benutzen(a, 'axt');
    expect(a.ausruestung.waffe).toBe('axt');
    expect(a.inventar['schwert']).toBe(1);
  });
});
