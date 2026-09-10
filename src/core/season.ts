/**
 * Runden und Jahreszeiten.
 *
 * Alles hier ist ABGELEITET aus state.turn - es gibt keinen zusaetzlichen
 * Zustand, nichts zu speichern, nichts zu uebertragen und nichts, was aus
 * dem Tritt geraten kann. Wer die Zugnummer kennt, kennt Runde, grosse Runde
 * und Jahreszeit.
 *
 * Das Modell:
 *
 *   Runde        = ein Zug = ein Wurf
 *   Grosse Runde = 5 Runden
 *   Jahreszeit   = 15 Runden, also 3 grosse Runden
 *   Jahr         = 4 Jahreszeiten = 60 Runden
 *
 * Noch aendern die Jahreszeiten nur das Aussehen. Sobald sie Regeln
 * beeinflussen sollen, liest der Reducer dieselbe Funktion - die Zeitrechnung
 * muss dafuer nicht angefasst werden.
 */

export const ROUNDS_PER_BIG_ROUND = 5;
export const ROUNDS_PER_SEASON = 15;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_NAME: Record<Season, string> = {
  spring: 'Fruehling',
  summer: 'Sommer',
  autumn: 'Herbst',
  winter: 'Winter',
};

/**
 * Vor dem ersten Zug steht turn auf 0, waehrend des Aufbaus ebenfalls.
 * Gerechnet wird ab Runde 1, damit die erste Runde nicht Runde 0 heisst.
 */
const asRound = (turn: number): number => Math.max(1, turn);

/** Die laufende Runde. Identisch mit der Zugnummer, nur nie kleiner als 1. */
export const roundOf = (turn: number): number => asRound(turn);

/** Die laufende grosse Runde, ab 1 gezaehlt. */
export const bigRoundOf = (turn: number): number =>
  Math.floor((asRound(turn) - 1) / ROUNDS_PER_BIG_ROUND) + 1;

/** Das laufende Jahr, ab 1 gezaehlt. */
export const yearOf = (turn: number): number =>
  Math.floor((asRound(turn) - 1) / (ROUNDS_PER_SEASON * SEASONS.length)) + 1;

/** Die laufende Jahreszeit. */
export function seasonOf(turn: number): Season {
  const index = Math.floor((asRound(turn) - 1) / ROUNDS_PER_SEASON) % SEASONS.length;
  return SEASONS[index]!;
}

/** Wie viele Runden die laufende Jahreszeit noch dauert. */
export function roundsLeftInSeason(turn: number): number {
  return ROUNDS_PER_SEASON - ((asRound(turn) - 1) % ROUNDS_PER_SEASON);
}

/** Wechselt mit diesem Zug die Jahreszeit? Fuer Meldungen und spaeter Effekte. */
export function seasonChangedAt(turn: number): boolean {
  return asRound(turn) > 1 && (asRound(turn) - 1) % ROUNDS_PER_SEASON === 0;
}
