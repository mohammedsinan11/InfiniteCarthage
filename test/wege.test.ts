/**
 * Wegsuche und Reichweite (core/units.ts).
 *
 * Der Client zeichnet damit die Wegvorschau und faerbt ein, wie weit eine
 * Einheit kommt. Der wichtigste Test steht deshalb unten: wegNach und der
 * nextStep, mit dem der Server wirklich zieht, muessen sich einig sein. Eine
 * Anzeige, die etwas anderes verspricht als der Zug, ist schlimmer als keine.
 */

import { describe, it, expect } from 'vitest';
import { isLandAt, nextStep, reichweite, wegNach } from '../src/core/units';
import { schritteFuer } from '../src/core/rules/army';
import { hexDistance, hexKey, hexesInRange, neighbors } from '../src/core/coords';

const SEED = 2024;

/** Ein Feld, um das herum in diesem Umkreis alles Land ist. */
function landInsel(radius: number) {
  const h = hexesInRange({ q: 0, r: 0 }, 10).find((x) =>
    hexesInRange(x, radius).every((y) => isLandAt(SEED, y.q, y.r)),
  );
  if (!h) throw new Error('keine Landinsel im Testseed gefunden');
  return h;
}

describe('Der Weg zu einem Ziel', () => {
  it('ist zusammenhaengend, endet am Ziel und ist der kuerzeste', () => {
    const start = landInsel(5);
    const ziel = hexesInRange(start, 4).find((h) => hexDistance(start, h) === 4 && isLandAt(SEED, h.q, h.r))!;

    const weg = wegNach(SEED, start, ziel)!;
    expect(weg).not.toBeNull();
    // Jeder Schritt liegt neben dem vorigen.
    let vorher = start;
    for (const s of weg) {
      expect(neighbors(vorher.q, vorher.r).some((n) => n.q === s.q && n.r === s.r)).toBe(true);
      expect(isLandAt(SEED, s.q, s.r)).toBe(true);
      vorher = s;
    }
    expect({ q: vorher.q, r: vorher.r }).toEqual({ q: ziel.q, r: ziel.r });
    // Auf freiem Land ist der kuerzeste Weg genau der Abstand.
    expect(weg.length).toBe(hexDistance(start, ziel));
  });

  it('ist leer, wenn man schon dort steht', () => {
    const start = landInsel(3);
    expect(wegNach(SEED, start, start)).toEqual([]);
  });

  it('gibt es nicht auf Wasser', () => {
    const start = landInsel(3);
    const wasser = hexesInRange(start, 12).find((h) => !isLandAt(SEED, h.q, h.r));
    // Nur pruefen, wenn der Seed hier ueberhaupt Wasser hat.
    if (wasser) expect(wegNach(SEED, start, wasser)).toBeNull();
  });

  it('gibt auf, statt endlos zu suchen', () => {
    const start = landInsel(3);
    const fern = { q: start.q + 300, r: start.r };
    expect(wegNach(SEED, start, fern, 200)).toBeNull();
  });
});

describe('Die Reichweite', () => {
  it('zaehlt das eigene Feld mit null', () => {
    const start = landInsel(3);
    const r = reichweite(SEED, start, 2);
    expect(r.get(hexKey(start.q, start.r))).toBe(0);
  });

  it('ist ohne Schritte nur das eigene Feld - der Fall im Schnee', () => {
    const start = landInsel(3);
    const r = reichweite(SEED, start, 0);
    expect(r.size).toBe(1);
    expect(r.get(hexKey(start.q, start.r))).toBe(0);
  });

  it('erfasst nach einem Schritt genau die Landnachbarn', () => {
    const start = landInsel(3);
    const r = reichweite(SEED, start, 1);
    const nachbarn = neighbors(start.q, start.r).filter((n) => isLandAt(SEED, n.q, n.r));
    expect(r.size).toBe(nachbarn.length + 1);
    for (const n of nachbarn) expect(r.get(hexKey(n.q, n.r))).toBe(1);
  });

  it('nennt fuer jedes Feld so viele Schritte, wie der Weg dorthin lang ist', () => {
    const start = landInsel(5);
    const r = reichweite(SEED, start, 3);
    for (const [k, schritte] of r) {
      if (schritte === 0) continue;
      const [q, s] = k.split(':').map(Number);
      const weg = wegNach(SEED, start, { q: q!, r: s! })!;
      expect(weg).not.toBeNull();
      expect(weg.length).toBe(schritte);
    }
  });
});

describe('Anzeige und Zug sind sich einig', () => {
  it('der erste Schritt des Weges ist der, den der Server zieht', () => {
    const start = landInsel(5);
    for (const ziel of hexesInRange(start, 4)) {
      if (!isLandAt(SEED, ziel.q, ziel.r)) continue;
      if (ziel.q === start.q && ziel.r === start.r) continue;

      const weg = wegNach(SEED, start, ziel);
      const schritt = nextStep(SEED, start, new Set([hexKey(ziel.q, ziel.r)]));
      if (weg === null) {
        expect(schritt).toBeNull();
        continue;
      }
      expect(schritt).not.toBeNull();
      expect({ q: weg[0]!.q, r: weg[0]!.r }).toEqual({ q: schritt!.step.q, r: schritt!.step.r });
    }
  });

  it('der Held zieht zwei Felder, sein Gefolge auch, alle anderen eins', () => {
    expect(schritteFuer('held')).toBe(2);
    expect(schritteFuer('ritter')).toBe(1);
    expect(schritteFuer('bogen')).toBe(1);
    // Wer mit dem Helden geht, haelt Schritt.
    expect(schritteFuer('ritter', true)).toBe(2);
  });
});
