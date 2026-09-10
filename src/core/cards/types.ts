/**
 * Karten: Typen und Wirkungen.
 *
 * Eine Karte ist DATEN, kein Code. Ihre Wirkung wird als Beschreibung
 * abgelegt und an einer Stelle ausgewertet - nicht als Funktion, die den
 * Spielstand anfasst.
 *
 * Der Grund ist der Netzwerkteil: der Spielstand muss durch JSON und wieder
 * zurueck. Eine Karte, die eine Funktion mitbringt, ueberlebt das nicht. Und
 * eine Wirkung, die man ansehen kann, laesst sich anzeigen, testen und
 * spaeter uebersetzen - eine, die nur laeuft, nicht.
 */

import type { Resource, Terrain } from '../types';

export type Rarity = 'gewoehnlich' | 'ungewoehnlich' | 'selten' | 'episch' | 'legendaer';

export const RARITY_ORDER: readonly Rarity[] = [
  'gewoehnlich',
  'ungewoehnlich',
  'selten',
  'episch',
  'legendaer',
];

/**
 * Woher eine Auswahl stammt. Bestimmt, wie selten die Karten ausfallen und
 * ob sie etwas kosten.
 */
export type DraftSource = 'fund' | 'belohnung' | 'markt';

/**
 * Sofortwirkung - geschieht einmal beim Nehmen der Karte.
 */
export type Instant =
  /** Rohstoffe aus der Bank, soweit vorhanden. */
  | { t: 'gain'; resources: Partial<Record<Resource, number>> }
  /** Beliebige Rohstoffe nach Wahl - der Einfachheit halber gleichmaessig verteilt. */
  | { t: 'gainAny'; count: number };

/**
 * Dauerwirkung - gilt, solange man die Karte besitzt.
 *
 * Bewusst eine kleine, geschlossene Liste. Jede neue Art muss an genau einer
 * Stelle ausgewertet werden (siehe effects.ts), und jede Stelle ist ein Ort,
 * an dem sich Regeln widersprechen koennen.
 */
export type Lasting =
  /** Dieses Gelaende liefert je Ertrag zusaetzlich so viel. */
  | { t: 'terrainBonus'; terrain: Terrain; amount: number }
  /** Bankhandel wird um so viele Karten guenstiger, nie unter zwei. */
  | { t: 'tradeDiscount'; amount: number }
  /** Die Handkartengrenze vor dem Abwerfen steigt. */
  | { t: 'handLimit'; amount: number };

export type Card = {
  id: string;
  name: string;
  rarity: Rarity;
  /** Ein Satz, der die Wirkung erklaert - erscheint auf der Karte. */
  text: string;
  instant?: Instant;
  lasting?: Lasting;
};

/** Wie oft eine Seltenheitsstufe je Quelle gezogen wird. Summe egal, es wird gewichtet. */
export const RARITY_WEIGHTS: Record<DraftSource, Record<Rarity, number>> = {
  // Der Fund ist der seltene Moment - hier gibt es nichts Gewoehnliches.
  fund: { gewoehnlich: 0, ungewoehnlich: 2, selten: 6, episch: 3, legendaer: 1 },
  belohnung: { gewoehnlich: 3, ungewoehnlich: 6, selten: 3, episch: 1, legendaer: 0 },
  markt: { gewoehnlich: 8, ungewoehnlich: 4, selten: 1, episch: 0, legendaer: 0 },
};
