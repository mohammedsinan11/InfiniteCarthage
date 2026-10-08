// Iteration 5: Vorzeichen, mindestens zwei Schritte, Eile, Boss taumelt, Schafe tauschen.
import { describe, it, expect } from 'vitest';
import { istWasser } from '../src/abenteuer/welt';
import { abenteuerPunkte, gelaende, neuesAbenteuer, OMEN, OMEN_IDS, omenFuer, sichtVon, taste, wuerfeln, zuegeBisBoss, SCHRITTE_MIN } from '../src/abenteuer/regeln';
import type { Abenteuer, Taste } from '../src/abenteuer/regeln';
import { HEX_DIRS } from '../src/core/coords';

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
    expect(b.tiere!.find((x) => x.id === 999)).toMatchObject(vorher);
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
