/**
 * Wiedereinstieg: die gemerkten Partien im Browser und die Platz-PIN.
 */

import { describe, it, expect } from 'vitest';
import { PARTIEN_MAX, PARTIEN_TAGE, lesePartien, merkePartie, vergissPartie } from '../src/client/net/partien';
import type { Speicher } from '../src/client/net/partien';
import { PIN_LENGTH, isPin, normalizePin, randomPin } from '../src/core/protocol';

function speicher(): Speicher & { daten: Map<string, string> } {
  const daten = new Map<string, string>();
  return {
    daten,
    getItem: (k) => daten.get(k) ?? null,
    setItem: (k, v) => void daten.set(k, v),
  };
}

const TAG = 24 * 60 * 60 * 1000;

describe('Deine Partien', () => {
  it('merkt je Raumcode einen Eintrag, der zuletzt gespielte zuerst', () => {
    const sp = speicher();
    merkePartie(sp, { code: 'AAAAAA', token: 't1', name: 'Anna', zuletzt: 1000 }, 1000);
    merkePartie(sp, { code: 'BBBBBB', token: 't2', name: 'Anna', zuletzt: 2000 }, 2000);
    merkePartie(sp, { code: 'AAAAAA', token: 't3', name: 'Anna', zuletzt: 3000 }, 3000);
    const liste = lesePartien(sp, 3000);
    expect(liste.map((p) => p.code)).toEqual(['AAAAAA', 'BBBBBB']);
    expect(liste[0]!.token).toBe('t3');
  });

  it('vergisst auf Wunsch, nach Ablauf und ueber der Obergrenze', () => {
    const sp = speicher();
    for (let i = 0; i < PARTIEN_MAX + 3; i++) {
      merkePartie(sp, { code: `R${i}`, token: 't', name: 'A', zuletzt: i }, i);
    }
    expect(lesePartien(sp, PARTIEN_MAX + 3)).toHaveLength(PARTIEN_MAX);
    vergissPartie(sp, `R${PARTIEN_MAX + 2}`, PARTIEN_MAX + 3);
    expect(lesePartien(sp, PARTIEN_MAX + 3).some((p) => p.code === `R${PARTIEN_MAX + 2}`)).toBe(false);
    expect(lesePartien(sp, (PARTIEN_TAGE + 1) * TAG)).toEqual([]);
  });

  it('uebersteht kaputten Speicher', () => {
    const sp = speicher();
    sp.setItem('infinitecarthage.partien', '{kaputt');
    expect(lesePartien(sp, 0)).toEqual([]);
    sp.setItem('infinitecarthage.partien', JSON.stringify([{ code: 'X' }, 5]));
    expect(lesePartien(sp, 0)).toEqual([]);
    expect(lesePartien(null, 0)).toEqual([]);
  });
});

describe('Platz-PIN', () => {
  it('hat vier Zeichen ohne Verwechsler und verzeiht Eingabefehler', () => {
    const pin = randomPin(new Uint8Array([0, 7, 31, 200]));
    expect(pin).toHaveLength(PIN_LENGTH);
    expect(isPin(pin)).toBe(true);
    expect(isPin('O1IL')).toBe(false);
    expect(normalizePin(' k7q2 ')).toBe('K7Q2');
    expect(normalizePin('k7-q2')).toBe('K7Q2');
  });
});
