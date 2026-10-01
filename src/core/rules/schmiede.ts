/**
 * Die Schmiede (A3, nach Slay the Spire): eine Karte verbessern oder
 * verbrennen.
 *
 * VERBESSERN macht aus einer Karte ihre Plus-Fassung (cards/plus.ts) - bei
 * Schluesselkarten faellt das Verbot weg, das grosse Ziel eines Laufs.
 * VERBRENNEN nimmt eine Karte ganz aus dem Spiel: aus Besitz, Plaetzen und
 * Krone, mit ihrem Zaehler - und ihre Sippe zaehlt eine Karte weniger. So
 * steuert man, welche zwei Familien wirken.
 *
 * Schmiedearbeiten gibt es fuer jeden bezwungenen Boss (core/akte.ts) und
 * beim Schmied auf Wanderschaft (core/ereignis.ts).
 */

import { cardById } from '../cards/catalog';
import { sippeVon } from '../cards/sippen';
import { playerById } from '../state';
import type { GameState, PlayerId } from '../state';

export type SchmiedeArt = 'verbessern' | 'verbrennen';

export type SchmiedeEvent = { t: 'geschmiedet'; player: PlayerId; card: string; art: SchmiedeArt };

type Ereignisse = { push(...e: SchmiedeEvent[]): number };

/** Eine Schmiedearbeit ausfuehren. Gibt einen Grund zurueck, wenn es nicht geht. */
export function schmieden(s: GameState, id: PlayerId, card: string, art: SchmiedeArt, events: Ereignisse): string | null {
  const p = playerById(s, id);
  if (!p) return 'Unbekannter Spieler.';
  if ((p.schmiede ?? 0) <= 0) return 'Du hast keine Schmiedearbeit offen.';
  if (!p.cards.includes(card)) return 'Diese Karte besitzt du nicht.';
  const c = cardById(card);
  if (!c) return 'Unbekannte Karte.';
  if (art === 'verbessern') {
    if ((p.plus ?? []).includes(card)) return 'Diese Karte ist schon verbessert.';
    if (c.kind === 'taktik') return 'Taktiken lassen sich nicht verbessern.';
    p.plus = [...(p.plus ?? []), card];
  } else {
    // Eine Kopie verschwindet; liegt keine mehr da, auch Platz, Krone und Zaehler.
    const i = p.cards.indexOf(card);
    p.cards = [...p.cards.slice(0, i), ...p.cards.slice(i + 1)];
    if (!p.cards.includes(card)) {
      p.activeCards = p.activeCards.filter((x) => x !== card);
      if (p.krone === card) p.krone = null;
      p.plus = (p.plus ?? []).filter((x) => x !== card);
      if (p.zaehler && card in p.zaehler) {
        const { [card]: _weg, ...rest } = p.zaehler;
        void _weg;
        p.zaehler = rest;
      }
    }
    const sippe = sippeVon(card);
    if (sippe && (p.sippe?.[sippe] ?? 0) > 0) p.sippe = { ...p.sippe, [sippe]: p.sippe![sippe]! - 1 };
  }
  p.schmiede = (p.schmiede ?? 0) - 1;
  events.push({ t: 'geschmiedet', player: id, card, art });
  return null;
}
