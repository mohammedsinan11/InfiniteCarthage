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
 * Drei getrennte Kartenbereiche.
 *
 * Reichskarten bauen die Wirtschaft auf und koennen Dauerwirkungen tragen.
 * Taktikkarten liegen spielbereit auf der Hand und werden beim Einsatz
 * verbraucht. Ausruestung ist fuer die Heldenplaetze vorbereitet; die ersten
 * Gegenstaende folgen mit dem Abenteuerzweig.
 */
export type CardKind = 'reich' | 'taktik' | 'ausruestung';

/**
 * Sofortwirkung - geschieht einmal beim Nehmen der Karte.
 */
export type Instant =
  /** Diese Rohstoffe. */
  | { t: 'gain'; resources: Partial<Record<Resource, number>> }
  /** So viele zufaellige Rohstoffe, einzeln gezogen (rules/reducer.ts). */
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
  | { t: 'handLimit'; amount: number }
  /** Haefen bleiben auch im Sturm geoeffnet. */
  | { t: 'stormPorts' }
  /**
   * Siegpunkte fuer eine Spielweise (cards/effects.ts, kartenPunkte): je `pro`
   * Staedte, zerstoerte Lager, erkundete Ruinen, erfuellte Auftraege oder
   * Strassen einen Punkt. Das macht aus einer Karte eine Richtung.
   */
  | { t: 'siegpunkte'; je: KartenPunkteQuelle; pro: number }
  /** Regelkarte: faellt `von`, liefern deine Felder mit `zu` ebenfalls. */
  | { t: 'alsZahl'; von: number; zu: number }
  /** Regelkarte: bei diesen Zahlen liefern deine Felder doppelt. */
  | { t: 'doppelZahl'; zahlen: readonly number[] }
  /** Bei jeder 7 - gleich wer wuerfelt - so viele zufaellige Rohstoffe. */
  | { t: 'siebenGabe'; anzahl: number }
  /** Pluenderer nehmen dir so viele Karten weniger. */
  | { t: 'schutz'; amount: number };

export type KartenPunkteQuelle = 'stadt' | 'lager' | 'ruine' | 'auftrag' | 'strasse';

/** Eine ausspielbare Taktik. value speist dasselbe Balancemodell wie Reichskarten. */
export type TacticEffect =
  | { t: 'healUnit'; amount: number; heroOnly?: boolean; value: number }
  | { t: 'healField'; amount: number; value: number }
  | { t: 'attack'; amount: number; value: number }
  | { t: 'cover'; amount: number; value: number }
  | { t: 'morale'; value: number }
  | { t: 'siege'; value: number }
  | { t: 'heroReroll'; value: number }
  | { t: 'rangedAttack'; amount: number; value: number };

export type Card = {
  id: string;
  name: string;
  rarity: Rarity;
  /** Fehlt bei alten Reichskarten bewusst; cardKind normalisiert den Wert. */
  kind?: CardKind;
  /** Ein Satz, der die Wirkung erklaert - erscheint auf der Karte. */
  text: string;
  instant?: Instant;
  /** Eine oder mehrere Dauerwirkungen. */
  lasting?: Lasting | readonly Lasting[];
  /** Eine oder mehrere Wirkungen einer ausspielbaren Taktikkarte. */
  tactic?: TacticEffect | readonly TacticEffect[];
};

export const cardKind = (c: Pick<Card, 'kind'>): CardKind => c.kind ?? 'reich';

/** Die Dauerwirkungen einer Karte als Liste - ob sie eine oder mehrere hat. */
export function dauerwirkungen(c: Pick<Card, 'lasting'>): readonly Lasting[] {
  if (c.lasting === undefined) return [];
  return Array.isArray(c.lasting) ? (c.lasting as readonly Lasting[]) : [c.lasting as Lasting];
}

export function taktikwirkungen(c: Pick<Card, 'tactic'>): readonly TacticEffect[] {
  if (c.tactic === undefined) return [];
  return Array.isArray(c.tactic)
    ? (c.tactic as readonly TacticEffect[])
    : [c.tactic as TacticEffect];
}

/** Dauerhafte Reichskarten und Ausruestung sind einzigartig; Verbrauchskarten duerfen wiederkommen. */
export function istEinzigartig(c: Card): boolean {
  return cardKind(c) === 'ausruestung' || dauerwirkungen(c).length > 0;
}

/**
 * Darf eine schon besessene einzigartige Karte noch einmal angeboten werden?
 * Ja, wenn sie eine Sofortwirkung hat: die Dauerwirkung liegt dann schon vor,
 * und beim zweiten Nehmen zaehlt nur noch der Sofortteil (rules/reducer.ts,
 * chooseCard). Karten ohne Sofortwirkung waeren dann leer und bleiben draussen.
 *
 * Ohne das wurde der Topf mit jeder Dauerkarte kleiner: ab etwa Runde 120
 * konnten episch und legendaer nie mehr fallen (draft.ts verlangt drei
 * Kandidaten je Stufe), und der Fund zeigte immer dieselben drei Karten.
 */
export const wiederholbar = (c: Card): boolean => c.instant !== undefined;

/** Wie oft eine Seltenheitsstufe je Quelle gezogen wird. Summe egal, es wird gewichtet. */
export const RARITY_WEIGHTS: Record<DraftSource, Record<Rarity, number>> = {
  // Der Fund ist der seltene Moment - hier gibt es nichts Gewoehnliches.
  fund: { gewoehnlich: 0, ungewoehnlich: 2, selten: 6, episch: 3, legendaer: 1 },
  belohnung: { gewoehnlich: 3, ungewoehnlich: 6, selten: 3, episch: 1, legendaer: 0 },
  markt: { gewoehnlich: 8, ungewoehnlich: 4, selten: 1, episch: 0, legendaer: 0 },
};
