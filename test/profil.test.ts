/** Profil, Taten und Freischalten der Chronikstufen (client/profil.ts). */

import { describe, it, expect, beforeEach } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { redactStateFor } from '../src/core/redact';
import { leseProfil, werteAus } from '../src/client/profil';

class Speicher {
  daten = new Map<string, string>();
  getItem(k: string) { return this.daten.get(k) ?? null; }
  setItem(k: string, v: string) { this.daten.set(k, v); }
  removeItem(k: string) { this.daten.delete(k); }
  clear() { this.daten.clear(); }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Speicher }).localStorage = new Speicher();
});

function beendet(opts: { punkte: number; stufe?: number; durch?: 'ziel' | 'zeit' }) {
  const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77, 0, { stufe: opts.stufe ?? 0, rundenLimit: 60 });
  g.state.turn = 60;
  g.state.phase = { t: 'finished', winner: 'p0', durch: opts.durch ?? 'zeit' };
  g.state.chronik!.verlauf.push({ turn: 60, punkte: [opts.punkte] });
  g.state.players[0]!.haus = 'bergclan';
  return redactStateFor(g.state, 'p0');
}

describe('Profil', () => {
  it('wertet eine Partie genau einmal', () => {
    const s = beendet({ punkte: 12 });
    const a = werteAus(s, 'p0', 'RAUM01');
    expect(a.schonGewertet).toBe(false);
    expect(a.sieg).toBe(true);
    expect(a.neueTaten.map((t) => t.id)).toEqual(expect.arrayContaining(['erste_partie', 'erster_sieg', 'wertung100']));
    const b = werteAus(s, 'p0', 'RAUM01');
    expect(b.schonGewertet).toBe(true);
    expect(leseProfil().partien).toBe(1);
    expect(leseProfil().haeuser).toEqual(['bergclan']);
  });

  it('ein Jahr allein mit zu wenig Punkten ist kein Sieg', () => {
    const r = werteAus(beendet({ punkte: 4 }), 'p0', 'RAUM02');
    expect(r.sieg).toBe(false);
    expect(r.neueStufe).toBeNull();
  });

  it('ein Sieg schaltet die naechste Stufe frei - nur von der hoechsten aus', () => {
    expect(werteAus(beendet({ punkte: 12 }), 'p0', 'A').neueStufe).toBe(1);
    expect(werteAus(beendet({ punkte: 12, stufe: 0 }), 'p0', 'B').neueStufe).toBeNull();
    expect(werteAus(beendet({ punkte: 12, stufe: 1 }), 'p0', 'C').neueStufe).toBe(2);
    expect(leseProfil().stufeFrei).toBe(2);
  });

  it('traegt jede Partie einmal in die Ahnenhalle ein, neueste zuerst', () => {
    werteAus(beendet({ punkte: 12 }), 'p0', 'H1');
    werteAus(beendet({ punkte: 3 }), 'p0', 'H2');
    werteAus(beendet({ punkte: 3 }), 'p0', 'H2');
    const ahnen = leseProfil().ahnen;
    expect(ahnen).toHaveLength(2);
    expect(ahnen[0]!.wertung).toBe(30);
    expect(ahnen[1]!.sieg).toBe(true);
    expect(ahnen[0]!.welt).toBe('Kernland');
    expect(ahnen[0]!.tat).toMatch(/\.$/);
  });
});
