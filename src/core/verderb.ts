/**
 * Verderb: was ueber die Handkartengrenze hinaus lagert, verdirbt.
 *
 * Spieltest 5: 28 Karten auf der Hand bei einer Grenze von 6, und nichts
 * geschah - Pluenderer nahmen die Haelfte, aber nur, wenn sie ankamen. Jetzt
 * beisst die Grenze bei jedem eigenen Zugende: die Haelfte des Ueberschusses
 * (aufgerundet) verdirbt, von den groessten Stapeln. Wer hortet, verliert;
 * wer baut, tauscht oder auf den Markt geht, nicht. Vorbild: Against the
 * Storm, wo Vorraete verderben, wenn das Lager voll ist.
 *
 * Nur in Partien mit Ereignissen; alte Staende und Tests bleiben, wie sie sind.
 */

import { RESOURCES } from './types';
import type { Resource } from './types';
import { handSize } from './state';
import type { GameState, PlayerId } from './state';
import { limitFor } from './rules/handlimit';

export type VerderbEvent = {
  t: 'spoiled';
  player: PlayerId;
  lost: Partial<Record<Resource, number>>;
  count: number;
};

type Ereignisse = { push(...e: VerderbEvent[]): number };

/** Wie viele Karten beim Zugende verderben wuerden - fuer Warnungen im Client. */
export function verderbZahl(karten: number, grenze: number): number {
  return karten > grenze ? Math.ceil((karten - grenze) / 2) : 0;
}

/** Am Ende des eigenen Zuges: der halbe Ueberschuss verdirbt. */
export function verderbAmZugende(s: GameState, id: PlayerId, events: Ereignisse): void {
  if (!s.ereignisseAn) return;
  const p = s.players.find((x) => x.id === id);
  if (!p || p.besiegt) return;
  const n = verderbZahl(handSize(p.hand), limitFor(s, id));
  if (n === 0) return;
  const lost: Partial<Record<Resource, number>> = {};
  for (let i = 0; i < n; i++) {
    // Vom groessten Stapel; bei Gleichstand in der festen Reihenfolge.
    const r = RESOURCES.reduce((a, b) => (p.hand[b] > p.hand[a] ? b : a));
    if (p.hand[r] <= 0) break;
    p.hand[r] -= 1;
    lost[r] = (lost[r] ?? 0) + 1;
  }
  events.push({ t: 'spoiled', player: id, lost, count: n });
}
