/**
 * Was ein Bau DIESEN Spieler kostet - und wie er bezahlt (ENGINE_KARTEN.md).
 *
 * Zwei Kartenwirkungen greifen hier: Rabatt (Zunfthaus: Staedte 1 Getreide
 * weniger) und Ersatz (Steinmetz: Erz zaehlt beim Stadtbau als Getreide;
 * Ziegelgold: Lehm zaehlt fuer alles). Bezahlt wird zuerst mit der echten
 * Sorte, der Rest mit dem Ersatz. Eine Funktion fuer Server und Anzeige, damit
 * "baubar" im Client dasselbe heisst wie im Reducer.
 */

import type { Modifiers } from '../cards/effects';
import type { Bauwerk } from '../cards/types';
import { RESOURCES } from '../types';
import type { Bundle, Resource } from '../types';

type Hand = Record<Resource, number>;

/** Die Kosten nach Rabatten - nie unter null je Sorte. */
export function kostenFuer(m: Modifiers, was: Bauwerk, basis: Bundle): Bundle {
  if (m.rabatt.length === 0) return basis;
  const out: Bundle = { ...basis };
  for (const r of m.rabatt) {
    if (r.bei !== was) continue;
    const alt = out[r.resource] ?? 0;
    if (alt > 0) out[r.resource] = Math.max(0, alt - r.amount);
  }
  return out;
}

/** Wie die Hand die Kosten deckt: je Sorte, was davon wirklich abgeht. null, wenn es nicht reicht. */
export function zahlweise(hand: Partial<Hand>, kosten: Bundle, m: Modifiers, was: Bauwerk): Partial<Hand> | null {
  const rest: Hand = Object.fromEntries(RESOURCES.map((r) => [r, hand[r] ?? 0])) as Hand;
  const ab: Partial<Hand> = {};
  const fehlt: Partial<Hand> = {};
  // Erst mit der echten Sorte.
  for (const r of RESOURCES) {
    const n = kosten[r] ?? 0;
    const echt = Math.min(n, rest[r]);
    rest[r] -= echt;
    if (echt > 0) ab[r] = (ab[r] ?? 0) + echt;
    if (n > echt) fehlt[r] = n - echt;
  }
  // Dann mit Ersatz, in der Reihenfolge der Karten.
  const ersatz = m.ersatz.filter((e) => e.bei === 'alle' || e.bei === was);
  for (const r of RESOURCES) {
    let offen = fehlt[r] ?? 0;
    for (const e of ersatz) {
      if (offen <= 0) break;
      if (e.fuer !== 'alle' && e.fuer !== r) continue;
      const n = Math.min(offen, rest[e.von]);
      if (n <= 0) continue;
      rest[e.von] -= n;
      ab[e.von] = (ab[e.von] ?? 0) + n;
      offen -= n;
    }
    if (offen > 0) return null;
  }
  return ab;
}

/** Reicht die Hand - mit Rabatt und Ersatz? */
export const kannBezahlen = (hand: Partial<Hand>, basis: Bundle, m: Modifiers, was: Bauwerk): boolean =>
  zahlweise(hand, kostenFuer(m, was, basis), m, was) !== null;

/** Bezahlen. false, wenn es nicht reicht - dann bleibt die Hand, wie sie ist. */
export function bezahle(hand: Hand, basis: Bundle, m: Modifiers, was: Bauwerk): boolean {
  const ab = zahlweise(hand, kostenFuer(m, was, basis), m, was);
  if (!ab) return false;
  for (const r of RESOURCES) hand[r] -= ab[r] ?? 0;
  return true;
}
