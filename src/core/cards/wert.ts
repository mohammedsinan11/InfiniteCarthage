/**
 * Was eine Karte wert ist - die Grundlage der Balance.
 *
 * Ein grobes, aber ausdrueckliches Modell, gerechnet in "Rohstoffkarten ueber
 * eine Partie":
 *
 *   ein bestimmter Rohstoff sofort     1
 *   ein beliebiger Rohstoff sofort     1,1 - etwas mehr wert, aber gleichmaessig
 *                                      verteilt statt frei gewaehlt
 *   +1 Ertrag eines Gelaendes          8 - ein Feld dieser Sorte trifft etwa
 *                                      jeden zehnten Wurf, und ueber eine
 *                                      Partie haengen zwei bis vier eigene
 *                                      Gebaeude daran: rund 40 Wuerfe x 2 bis 3
 *                                      Treffer je zehn Wuerfe
 *   -1 Ertrag                          -4 - halb so schwer, weil der Ertrag nie
 *                                      unter null faellt
 *   Bankhandel 1 / 2 / 3 guenstiger    5 / 12 / 18 - von 4:1 auf 2:1 halbiert
 *                                      jeden Tausch
 *   +1 Handkarte                       0,6 - schuetzt nur vor Pluenderungen
 *
 * Jede Seltenheit hat eine Wertspanne (WERT_SPANNE); ein Test prueft, dass
 * jede Karte in ihrer liegt. Wer eine Karte aendert oder neu schreibt, sieht
 * so sofort, ob sie in die richtige Stufe gehoert.
 */

import { dauerwirkungen, taktikwirkungen } from './types';
import type { Card, Rarity } from './types';
import { RESOURCES } from '../types';

export const WERT = {
  rohstoff: 1,
  // Eine echte Wahl schliesst gezielt die eine Luecke in den Baukosten und
  // ist deutlich mehr wert als die fruehere automatische Verteilung.
  beliebig: 1.3,
  gelaende: 8,
  gelaendeMinus: 3,
  handel: [0, 5, 12, 18] as const,
  handkarte: 1.2,
  sturmhafen: 5,
  /** Ein Siegpunkt je `pro` einer Sache: grob, was ein Punkt ueber die Partie wert ist. */
  siegpunkt: 24,
  /** Regelkarte: eine zweite Zahl liefert mit - ihre Wahrscheinlichkeit x 72. */
  zahlWahrscheinlichkeit: 72,
  siebenGabe: 3,
  schutz: 7,
};

/** Wie oft eine Zahl mit zwei Wuerfeln faellt, in 36steln. */
const WEGE: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

/** Wertspanne je Seltenheit, einschliesslich. */
export const WERT_SPANNE: Record<Rarity, readonly [number, number]> = {
  gewoehnlich: [3, 6],
  ungewoehnlich: [6, 10],
  selten: [10, 14],
  episch: [15, 20],
  legendaer: [22, 30],
};

export function kartenWert(c: Card): number {
  let w = 0;
  if (c.instant?.t === 'gain') {
    for (const r of RESOURCES) w += (c.instant.resources[r] ?? 0) * WERT.rohstoff;
  } else if (c.instant?.t === 'gainAny') {
    w += c.instant.count * WERT.beliebig;
  }
  for (const l of dauerwirkungen(c)) {
    switch (l.t) {
      case 'terrainBonus':
        w += l.amount >= 0 ? l.amount * WERT.gelaende : l.amount * WERT.gelaendeMinus;
        break;
      case 'tradeDiscount':
        w += WERT.handel[Math.min(3, l.amount)] ?? 0;
        break;
      case 'handLimit':
        w += l.amount * WERT.handkarte;
        break;
      case 'stormPorts':
        w += WERT.sturmhafen;
        break;
      case 'siegpunkte':
        w += WERT.siegpunkt / l.pro;
        break;
      case 'alsZahl':
        w += ((WEGE[l.von] ?? 0) / 36) * WERT.zahlWahrscheinlichkeit;
        break;
      case 'doppelZahl':
        w += l.zahlen.reduce((n, z) => n + ((WEGE[z] ?? 0) / 36) * WERT.zahlWahrscheinlichkeit, 0);
        break;
      case 'siebenGabe':
        w += l.anzahl * WERT.siebenGabe;
        break;
      case 'schutz':
        w += l.amount * WERT.schutz;
        break;
    }
  }
  for (const t of taktikwirkungen(c)) w += t.value;
  return Math.round(w * 10) / 10;
}
