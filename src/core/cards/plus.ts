/**
 * Verbesserte Karten (A3, nach Slay the Spire): jede Karte hat eine Fassung
 * mit "+", ohne dass jemand hundert Varianten schreiben muss.
 *
 * Die Regeln sind einfach und fuer alle gleich:
 *   - Jeder Lohn eines Ausloesers: +1 (Rohstoffe, Ruhm, Zaehler, Heilung),
 *     jeZug +1.
 *   - Skalierung (je): jede Stufe eine Sache frueher, hoechstens 2 mehr.
 *   - Ertrag, Schutz, Siebengabe, Handgrenze, Marktrabatt, feste Punkte: +1.
 *   - Schluesselkarten: das Verbot faellt weg - das grosse Ziel eines Laufs.
 *   - Sofortwirkung: je Sorte 1 mehr.
 * Taktiken bleiben, wie sie sind.
 *
 * Eine verbesserte Karte heisst im Spiel `kennung+` (cards/catalog.ts,
 * cardById). Ihr Zaehler bleibt der der Grundkarte (basisKennung).
 */

import type { Card, Lasting, Lohn } from './types';

export const PLUS = '+';
export const istPlus = (id: string): boolean => id.endsWith(PLUS);
/** Die Kennung der Grundkarte - fuer Zaehler und Sippe. */
export const basisKennung = (id: string): string => (istPlus(id) ? id.slice(0, -1) : id);

function lohnPlus(l: Lohn): Lohn {
  switch (l.t) {
    case 'gain':
      return { ...l, resources: Object.fromEntries(Object.entries(l.resources).map(([r, n]) => [r, (n ?? 0) + 1])) };
    case 'gainAny':
      return { ...l, count: l.count + 1 };
    case 'ruhm':
      return { ...l, amount: l.amount + 1 };
    case 'zaehler':
      return typeof l.amount === 'number' ? { ...l, amount: l.amount + 1 } : l;
    case 'heilen':
      return { ...l, amount: l.amount + 1 };
    case 'gainJe':
      return { ...l, pro: Math.max(1, l.pro - 1), max: l.max + 1 };
    case 'wahl':
      return l;
  }
}

function wirkungPlus(l: Lasting): Lasting | null {
  switch (l.t) {
    case 'wenn': {
      const dann = Array.isArray(l.dann) ? (l.dann as readonly Lohn[]).map(lohnPlus) : lohnPlus(l.dann as Lohn);
      return { ...l, dann, ...(l.jeZug !== undefined ? { jeZug: l.jeZug + 1 } : {}) };
    }
    case 'je':
      return { ...l, pro: Math.max(1, l.pro - 1), max: l.max + 2 };
    case 'terrainBonus':
      return l.amount > 0 ? { ...l, amount: l.amount + 1 } : { ...l, amount: 0 };
    case 'handLimit':
      return { ...l, amount: l.amount + (l.amount < 0 ? 2 : 1) };
    case 'schutz':
    case 'marktRabatt':
    case 'bauGabe':
    case 'stadtRuhm':
    case 'punkte':
      return { ...l, amount: l.amount + 1 };
    case 'siebenGabe':
      return { ...l, anzahl: l.anzahl + 1 };
    case 'siegpunkte':
      return { ...l, pro: Math.max(1, l.pro - 1) };
    case 'rabatt':
      return { ...l, amount: l.amount + 1 };
    case 'ertragMal':
      return l.faktor > 1 ? { ...l, faktor: l.faktor + 1 } : l;
    case 'grundErtrag':
      return { ...l, dorf: l.dorf > 0 ? l.dorf + 1 : 0, stadt: l.stadt > 0 ? l.stadt + 1 : 0 };
    case 'sperre':
      // Das Verbot faellt weg.
      return null;
    default:
      return l;
  }
}

/** Was die Verbesserung bewirkt, in einem Satz. */
function plusText(c: Card): string {
  if (c.schluessel) return 'Verbessert: ohne Verbot, und alles wirkt staerker.';
  if (c.kind === 'taktik') return 'Verbessert.';
  const arten = new Set((Array.isArray(c.lasting) ? (c.lasting as readonly Lasting[]) : c.lasting ? [c.lasting as Lasting] : []).map((l) => l.t));
  const teile: string[] = [];
  if (arten.has('wenn')) teile.push('jeder Lohn +1');
  // "je N" wird je N-1, die Obergrenze steigt (Spieltest 15: es stand weiter "hoechstens 3").
  const liste = Array.isArray(c.lasting) ? (c.lasting as readonly Lasting[]) : c.lasting ? [c.lasting as Lasting] : [];
  const jeLohn = liste.some((l) => l.t === 'wenn' && (Array.isArray(l.dann) ? (l.dann as readonly Lohn[]) : [l.dann as Lohn]).some((d) => d.t === 'gainJe'));
  if (jeLohn) teile.push('"je" braucht eins weniger, hoechstens eins mehr');
  if (arten.has('je')) teile.push('waechst schneller (eins weniger je Stufe, zwei Stufen mehr)');
  if (arten.has('terrainBonus') || arten.has('schutz') || arten.has('punkte') || arten.has('siebenGabe') || arten.has('handLimit')) teile.push('+1');
  if (c.instant) teile.push('Sofort je Sorte +1');
  return `Verbessert: ${teile.length > 0 ? teile.join(', ') : 'staerker'}.`;
}

/** Die verbesserte Fassung einer Karte. */
export function verbessert(c: Card): Card {
  const liste = Array.isArray(c.lasting) ? (c.lasting as readonly Lasting[]) : c.lasting ? [c.lasting as Lasting] : [];
  const lasting = liste.map(wirkungPlus).filter((l): l is Lasting => l !== null);
  const instant =
    c.instant?.t === 'gain'
      ? { t: 'gain' as const, resources: Object.fromEntries(Object.entries(c.instant.resources).map(([r, n]) => [r, (n ?? 0) + 1])) }
      : c.instant?.t === 'gainAny'
        ? { t: 'gainAny' as const, count: c.instant.count + 1 }
        : undefined;
  return {
    ...c,
    id: c.id + PLUS,
    name: c.name + PLUS,
    text: `${c.text} ${plusText(c)}`,
    ...(liste.length > 0 ? { lasting: lasting.length === 1 ? lasting[0]! : lasting } : {}),
    ...(instant ? { instant } : {}),
  };
}
