/**
 * Was eine Pluenderung nimmt.
 *
 * Seit Raeuber als Einheiten ueber die Karte ziehen (rules/army.ts), entscheidet
 * nicht mehr die Naehe zu einem Lager, sondern die Ankunft: erst wer eine
 * Siedlung erreicht, pluendert. Hier steht nur noch die Rechnung dazu.
 *
 * Genommen wird vom groessten Stapel. Kein Zufall: der Verlust soll
 * nachvollziehbar sein, und wer viel von einer Sorte haelt, verliert davon.
 * Horten wird bestraft - wer ueber der Handkartengrenze liegt, verliert die
 * Haelfte statt einer Karte. Was genommen wird, geht an die Bank zurueck.
 */

import { RESOURCES } from '../types';
import { emptyHand, handSize } from '../state';
import { isHoarding } from './handlimit';
import type { Resource } from '../types';
import type { GameState, Hand, PlayerId } from '../state';

/**
 * Wie viel dieser Spieler verliert: eine Karte je ankommendem Raeuber - wer
 * hortet, stattdessen die Haelfte. Es gilt der groessere Verlust.
 */
export function raidLoss(state: GameState, id: PlayerId, raiders: number): number {
  if (raiders === 0) return 0;
  const p = state.players.find((x) => x.id === id);
  if (!p) return 0;
  const gehalten = handSize(p.hand);
  const gehortet = isHoarding(state, id) ? Math.floor(gehalten / 2) : 0;
  return Math.min(gehalten, Math.max(raiders, gehortet));
}

/** Nimmt Karten vom jeweils groessten Stapel. Gibt zurueck, was genommen wurde. */
export function takeFromLargest(hand: Hand, count: number): Hand {
  const genommen = emptyHand();
  for (let i = 0; i < count; i++) {
    let beste: Resource | null = null;
    for (const r of RESOURCES) {
      const rest = hand[r] - genommen[r];
      if (rest <= 0) continue;
      // Bei Gleichstand gewinnt die fruehere Sorte - fest, nicht zufaellig.
      if (beste === null || rest > hand[beste] - genommen[beste]) beste = r;
    }
    if (beste === null) break;
    genommen[beste] += 1;
  }
  return genommen;
}
