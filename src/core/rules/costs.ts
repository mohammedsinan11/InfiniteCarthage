/**
 * Baukosten.
 *
 * Die Bank ist unendlich (state.ts): wer bezahlt, gibt die Karten ab, und sie
 * sind fort. Knapp ist nur, was man selbst hat.
 */

import type { Hand } from '../state';
import { RESOURCES } from '../types';
import type { Bundle } from '../types';

/** Baukosten sind nur ein Rohstoffbuendel mit anderem Namen. */
export type Cost = Bundle;

export const COST_ROAD: Cost = { lumber: 1, brick: 1 };
export const COST_SETTLEMENT: Cost = { lumber: 1, brick: 1, wool: 1, grain: 1 };
export const COST_CITY: Cost = { ore: 3, grain: 2 };
export const COST_DEV: Cost = { ore: 1, wool: 1, grain: 1 };

/**
 * Ein Ritter. Erz, weil es Waffen und Ruestung sind; Getreide, weil er essen
 * muss. Bewusst anders als die Entwicklungskarte: wer gezielt einen Ritter will,
 * soll nicht auf das Kartendeck hoffen muessen.
 */
export const COST_KNIGHT: Cost = { ore: 2, grain: 1 };

/**
 * Ein Bogenschuetze (rules/army.ts, beschuss). Holz fuer Bogen und Pfeile,
 * Wolle fuer Sehne und Wams - billiger als ein Ritter, und ohne Erz.
 */
export const COST_ARCHER: Cost = { lumber: 2, wool: 1 };

/**
 * Ein Wachturm an einem eigenen Dorf oder einer Stadt. Holz fuer das Geruest,
 * Lehm fuer den Sockel, Erz fuer die Feuerschale oben.
 */
export const COST_TOWER: Cost = { lumber: 1, brick: 1, ore: 1 };

/**
 * Den Wachturm zum Geschuetzturm ausbauen (Stufe 2): Erz fuer die Winden und
 * Bolzen, Holz fuer das Geschuetz. Er schiesst dann selbst auf Feinde in
 * Reichweite (rules/army.ts, beschuss). PLATZHALTER fuers Balancing.
 */
export const COST_GESCHUETZTURM: Cost = { lumber: 2, brick: 1, ore: 2 };

/**
 * Den Geschuetzturm zum befestigten Turm ausbauen (Stufe 3): viel Lehm fuer
 * den verstaerkten, doppelten Zinnenkranz, dazu Holz und Erz fuer das
 * schwerere Geschuetz. Staerker im Beschuss UND in der Deckung, deshalb die
 * teuerste Stufe. PLATZHALTER fuers Balancing.
 */
export const COST_BEFESTIGTER_TURM: Cost = { lumber: 2, brick: 3, ore: 2 };

/**
 * Ein Stueck Palisade auf einer eigenen Kante: Holz fuer die Pfaehle, etwas
 * Lehm fuer den festgestampften Fuss. PLATZHALTER fuers Balancing.
 */
export const COST_MAUER: Cost = { lumber: 2, brick: 1 };

/**
 * Ein Tor statt eines Wandstuecks: weniger Holz, dafuer Erz fuer Angeln und
 * Beschlag. PLATZHALTER fuers Balancing.
 */
export const COST_TOR: Cost = { lumber: 1, ore: 1 };

/** Was ein Turm kostet, der auf diese Stufe ausgebaut wird. Stufe 1 ist der Bau selbst. */
export const COST_TURM_STUFE: Record<number, Cost> = { 2: COST_GESCHUETZTURM, 3: COST_BEFESTIGTER_TURM };

/**
 * Die Reichsbauten der Phase 2 (rules/reich.ts). Jeder kostet etwa eine
 * Stadt - sie sind kein Ersatz fuer Siedlungen, sondern das, was man baut,
 * wenn Siedlungen nicht mehr das Nadeloehr sind. PLATZHALTER fuers Balancing.
 */
export const COST_BURGFESTE: Cost = { lumber: 2, brick: 2, ore: 3 };
export const COST_HANDELSKONTOR: Cost = { lumber: 3, wool: 2, grain: 2 };
export const COST_TEMPEL: Cost = { brick: 3, wool: 2, ore: 2 };

/** Was ein Reichsbau dieser Art kostet. */
export const COST_REICHSBAU: Record<string, Cost> = {
  burgfeste: COST_BURGFESTE,
  handelskontor: COST_HANDELSKONTOR,
  tempel: COST_TEMPEL,
};

/**
 * Eine Hauptstadt auf einem Feld, das drei eigene Staedte und sechs eigene
 * Strassen umschliessen (rules/hauptstadt.ts). Etwas mehr als zwei Staedte -
 * den Ring hat man ohnehin schon bezahlt. PLATZHALTER fuers Balancing.
 */
export const COST_CAPITAL: Cost = { lumber: 2, brick: 2, grain: 2, ore: 3 };

/**
 * Die Hauptstadt zum Festungsring ausbauen: aus den Strassen des Rings wird
 * Mauer, aus den Staedten werden Bastionen. Vor allem Lehm und Erz fuer den
 * Stein. PLATZHALTER fuers Balancing.
 */
export const COST_FESTUNG: Cost = { lumber: 1, brick: 3, grain: 1, ore: 3 };

/**
 * Die dritte Stufe, der Koenigssitz: goldene Spitze und Krone, und mit ihm
 * beginnt Phase 2 (rules/hauptstadt.ts). Teurer als der Festungsring, mit
 * Wolle fuer den Hofstaat. PLATZHALTER fuers Balancing.
 */
export const COST_KOENIGSSITZ: Cost = { lumber: 2, brick: 3, wool: 2, grain: 3, ore: 4 };

/**
 * Was eine Hauptstadt kostet, die auf diese Stufe ausgebaut wird. Stufe 1
 * steht nicht darin - die gruendet man (COST_CAPITAL).
 */
export const COST_STUFE: Record<number, Cost> = { 2: COST_FESTUNG, 3: COST_KOENIGSSITZ };

/**
 * Eine abgebrannte Strasse wieder aufbauen: nur Holz. Der Damm liegt noch, es
 * fehlen die Bohlen - und wer gebrannt wurde, soll nicht doppelt zahlen.
 */
export const COST_REBUILD_ROAD: Cost = { lumber: 1 };

export function canAfford(hand: Hand, cost: Cost): boolean {
  for (const r of RESOURCES) {
    const need = cost[r] ?? 0;
    if (need > 0 && hand[r] < need) return false;
  }
  return true;
}

/** Zieht die Kosten von der Hand ab. */
export function pay(hand: Hand, cost: Cost): void {
  for (const r of RESOURCES) hand[r] -= cost[r] ?? 0;
}

