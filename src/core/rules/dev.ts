/**
 * Entwicklungskarten.
 *
 * Das Original hat ein Deck von 25 Karten, und wenn es leer ist, ist Schluss.
 * Auf einer unendlichen Karte waeren lange Partien damit irgendwann karten-
 * los. Stattdessen kommen die Karten in Paecken zu 25: ist eines leer, wird
 * aus secretSeed und der Packnummer das naechste gemischt. Die Verteilung
 * innerhalb eines Packs bleibt die klassische, also aendert sich an den
 * Wahrscheinlichkeiten nichts - es geht nur weiter.
 */

import { Rng } from '../rng';
import { hash3i } from '../hash';
import type { DevCardType, GameState } from '../state';

const SALT_DECK = 11;

/**
 * Zusammensetzung eines Packs: das klassische ohne die 14 Ritter - 11 Karten.
 * Ritter kommen nicht mehr aus dem Kartendeck, sondern werden angeworben
 * (Truppen, rules/army.ts). Wer noch eine Ritterkarte aus einem alten Stand
 * haelt, kann sie weiter spielen.
 */
const PACK: readonly DevCardType[] = [
  ...Array<DevCardType>(5).fill('victoryPoint'),
  ...Array<DevCardType>(2).fill('roadBuilding'),
  ...Array<DevCardType>(2).fill('yearOfPlenty'),
  ...Array<DevCardType>(2).fill('monopoly'),
];

export const PACK_SIZE = PACK.length;

/** Ein frisch gemischtes Pack. Deterministisch aus Seed und Packnummer. */
export function makePack(secretSeed: number, packIndex: number): DevCardType[] {
  const rng = new Rng(hash3i(secretSeed, packIndex, 0, SALT_DECK));
  return rng.shuffle([...PACK]);
}

/**
 * Zieht die oberste Karte und legt bei Bedarf ein neues Pack nach.
 * Aendert state.deck und state.packIndex.
 */
export function drawDevCard(state: GameState): DevCardType {
  if (state.deck.length === 0) {
    state.deck = makePack(state.secretSeed, state.packIndex);
    state.packIndex += 1;
  }
  return state.deck.pop()!;
}
