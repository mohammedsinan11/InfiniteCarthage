/**
 * Die oeffentliche Raumliste: welche Raeume sichtbar sind, in welcher
 * Reihenfolge, und was das Verzeichnis annimmt.
 */

import { describe, it, expect } from 'vitest';
import {
  VERFALL_MS,
  istAbgelaufen,
  istRaumEintrag,
  sichtbareRaeume,
  zuletztText,
} from '../src/core/lobby';
import type { RaumEintrag } from '../src/core/lobby';
import { createWorld, ensureGenerated, mitAufgedeckt } from '../src/core/world';

const JETZT = 1_800_000_000_000;
const MIN = 60_000;

const raum = (felder: Partial<RaumEintrag>): RaumEintrag => ({
  code: 'ABC234',
  oeffentlich: true,
  status: 'lobby',
  gastgeber: 'Anna',
  spieler: ['Anna'],
  maxSpieler: 6,
  runde: null,
  zielpunkte: 15,
  erstellt: JETZT - 60 * MIN,
  zuletzt: JETZT - 5 * MIN,
  ...felder,
});

describe('Raumliste', () => {
  it('zeigt nur oeffentliche Raeume mit Spielern, nicht aelter als sieben Tage', () => {
    const liste = sichtbareRaeume(
      [
        raum({ code: 'OFFEN1' }),
        raum({ code: 'PRIVAT', oeffentlich: false }),
        raum({ code: 'LEER22', spieler: [] }),
        raum({ code: 'ALT222', zuletzt: JETZT - VERFALL_MS - MIN }),
        raum({ code: 'KNAPP2', zuletzt: JETZT - VERFALL_MS + MIN }),
      ],
      JETZT,
    );
    expect(liste.map((r) => r.code)).toEqual(['OFFEN1', 'KNAPP2']);
  });

  it('stellt offene Raeume vor laufende und beendete, sonst das zuletzt Aktive nach oben', () => {
    const liste = sichtbareRaeume(
      [
        raum({ code: 'LAEUFT', status: 'laeuft', runde: 12, zuletzt: JETZT - MIN }),
        raum({ code: 'FERTIG', status: 'beendet', zuletzt: JETZT }),
        raum({ code: 'LOBALT', zuletzt: JETZT - 50 * MIN }),
        raum({ code: 'LOBNEU', zuletzt: JETZT - 2 * MIN }),
      ],
      JETZT,
    );
    expect(liste.map((r) => r.code)).toEqual(['LOBNEU', 'LOBALT', 'LAEUFT', 'FERTIG']);
  });

  it('erkennt abgelaufene Eintraege', () => {
    expect(istAbgelaufen(raum({ zuletzt: JETZT - VERFALL_MS - 1 }), JETZT)).toBe(true);
    expect(istAbgelaufen(raum({ zuletzt: JETZT - VERFALL_MS }), JETZT)).toBe(false);
  });

  it('liest "zuletzt gespielt" in Worten', () => {
    expect(zuletztText(JETZT - 20_000, JETZT)).toBe('gerade eben');
    expect(zuletztText(JETZT - 7 * MIN, JETZT)).toBe('vor 7 Min');
    expect(zuletztText(JETZT - 3 * 60 * MIN, JETZT)).toBe('vor 3 Std');
    expect(zuletztText(JETZT - 26 * 60 * MIN, JETZT)).toBe('vor 1 Tag');
    expect(zuletztText(JETZT - 5 * 24 * 60 * MIN, JETZT)).toBe('vor 5 Tagen');
  });

  it('das Verzeichnis nimmt nur vollstaendige Eintraege an', () => {
    expect(istRaumEintrag(raum({}))).toBe(true);
    expect(istRaumEintrag(JSON.parse(JSON.stringify(raum({ status: 'laeuft', runde: 4 }))))).toBe(true);
    expect(istRaumEintrag(null)).toBe(false);
    expect(istRaumEintrag({ ...raum({}), status: 'kaputt' })).toBe(false);
    expect(istRaumEintrag({ ...raum({}), spieler: [1, 2] })).toBe(false);
    expect(istRaumEintrag({ ...raum({}), code: '' })).toBe(false);
    const { zuletzt: _weg, ...ohneZeit } = raum({});
    void _weg;
    expect(istRaumEintrag(ohneZeit)).toBe(false);
  });
});

describe('Aufdecken im Client', () => {
  it('liefert eine neue Welt, sobald Chunks dazukommen - sonst dieselbe', () => {
    const server = createWorld(2024);
    const client = createWorld(2024);
    const start = ensureGenerated(server, { q: 0, r: 0 }, 3);
    const w1 = mitAufgedeckt(client, start);
    expect(w1).not.toBe(client);
    expect(w1.tiles.size).toBeGreaterThan(0);

    // Derselbe Stand noch einmal: nichts Neues, dasselbe Objekt.
    expect(mitAufgedeckt(w1, start)).toBe(w1);

    // Ein Ritter zieht hinaus: neue Chunks, neues Objekt mit den neuen Feldern.
    const neu = ensureGenerated(server, { q: 20, r: -4 }, 3);
    const w2 = mitAufgedeckt(w1, [...start, ...neu]);
    expect(w2).not.toBe(w1);
    expect(w2.tiles.has('20:-4')).toBe(true);
  });
});
