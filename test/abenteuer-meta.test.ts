/** Fortschritt ueber die Abenteuer (client/abenteuer/meta): Ruhm, Erfolge, Freischaltungen. */

import { describe, it, expect } from 'vitest';
import { neuesAbenteuer } from '../src/abenteuer/regeln';
import { belohne, freieLegenden, freischalten, naechsteFreischaltung } from '../src/client/abenteuer/meta';
import type { Meta } from '../src/client/abenteuer/meta';

const leer: Meta = { ruhm: 0, frei: [], klasse: 'ritter', stufe: 0, stufeMax: 0, bester: 0, laeufe: 0, siege: 0, tage: {}, belohnt: [], erfolge: [], siegKlassen: [], zuletzt: [] };

describe('Abenteuer-Meta', () => {
  it('ein Sieg bringt Ruhm, Erfolge, die naechste Heldenstufe - Erfolge nur einmal', () => {
    const a = neuesAbenteuer(5);
    a.phase = 'sieg';
    a.koenige = 3;
    a.zug = 50;
    const m = belohne(leer, a, 100);
    expect(m.siege).toBe(1);
    expect(m.stufeMax).toBe(1);
    expect(m.erfolge).toEqual(expect.arrayContaining(['erster', 'sieg', 'allein', 'schnell']));
    expect(m.ruhm).toBeGreaterThan(100 + 15 + 40);
    expect(m.zuletzt.some((z) => z.includes('Heldenstufe 1'))).toBe(true);
    const m2 = belohne(m, a, 100);
    expect(m2.ruhm - m.ruhm).toBe(100);
  });

  it('Freischalten kostet Ruhm; Legendaeres kommt danach in den Pool', () => {
    let m: Meta = { ...leer, ruhm: 60 };
    expect(naechsteFreischaltung(m)?.id).toBe('kraeuter');
    m = freischalten(m, 'legende', 'ruhepuls');
    expect(m.ruhm).toBe(10);
    expect(freieLegenden(m)).toEqual(['ruhepuls']);
    // Zu teuer: nichts passiert.
    expect(freischalten(m, 'klasse', 'schwarz')).toBe(m);
    const a = neuesAbenteuer(5, { legenden: freieLegenden(m) });
    expect(a.legenden).toEqual(['ruhepuls']);
  });
});
