/**
 * Welche drei Karten stehen zur Wahl?
 *
 * Eine REINE Funktion aus geheimem Seed, Runde und Quelle - kein gemischter
 * Stapel.
 *
 * Der Grund ist derselbe wie beim Gelaende: ein Stapel waere Zustand. Er
 * muesste gespeichert, uebertragen und beim Wiedereinstieg wiederhergestellt
 * werden, und bei jedem Fehler waere unklar, was eigentlich noch drin liegt.
 * Diese Funktion braucht nichts davon: dieselbe Runde ergibt immer dieselben
 * drei Karten, auch nach einem Neuladen oder wenn das Durable Object
 * zwischendurch geschlafen hat.
 *
 * Unvorhersehbar bleibt es trotzdem, weil der secretSeed den Server nie
 * verlaesst. Ein Client kann nicht ausrechnen, was als Naechstes kommt.
 *
 * Preis: "diese Karte kommt nur einmal vor" laesst sich so nicht zusichern.
 * Wer das braucht, muesste genommene Karten im Spielstand mitfuehren.
 */

import { Rng } from '../rng';
import { hash3i } from '../hash';
import { CARDS } from './catalog';
import { RARITY_WEIGHTS } from './types';
import type { Card, DraftSource, Rarity } from './types';

const SALT_DRAFT = 61;

/** Wie viele Karten zur Auswahl stehen. */
export const DRAFT_SIZE = 3;

const QUELLE_ZU_ZAHL: Record<DraftSource, number> = {
  fund: 1,
  belohnung: 2,
  markt: 3,
};

/** Eine Seltenheitsstufe nach den Gewichten der Quelle ziehen. */
function ziehStufe(rng: Rng, source: DraftSource): Rarity | null {
  const gewichte = RARITY_WEIGHTS[source];
  const stufen = (Object.keys(gewichte) as Rarity[]).filter((r) => gewichte[r] > 0);
  const summe = stufen.reduce((n, r) => n + gewichte[r], 0);
  if (summe === 0) return null;

  let wurf = rng.int(summe);
  for (const r of stufen) {
    wurf -= gewichte[r];
    if (wurf < 0) return r;
  }
  return stufen[stufen.length - 1]!;
}

/**
 * Die Auswahl fuer eine Runde.
 *
 * Doppelte werden vermieden, aber nicht um jeden Preis: gibt der Katalog
 * nicht genug verschiedene Karten her, ist eine Wiederholung besser als eine
 * kuerzere Auswahl.
 */
export function draftOptions(
  secretSeed: number,
  turn: number,
  source: DraftSource,
): string[] {
  const rng = new Rng(hash3i(secretSeed, turn, QUELLE_ZU_ZAHL[source], SALT_DRAFT));
  const gewaehlt: string[] = [];

  for (let i = 0; i < DRAFT_SIZE; i++) {
    let karte: Card | undefined;
    // Mehrere Anlaeufe, um eine noch nicht gezogene Karte zu finden.
    for (let versuch = 0; versuch < 12 && !karte; versuch++) {
      const stufe = ziehStufe(rng, source);
      if (stufe === null) break;
      const passend = CARDS.filter(
        (c) => c.rarity === stufe && !gewaehlt.includes(c.id),
      );
      if (passend.length > 0) karte = passend[rng.int(passend.length)];
    }
    // Notnagel: irgendeine noch nicht gewaehlte Karte.
    if (!karte) {
      const rest = CARDS.filter((c) => !gewaehlt.includes(c.id));
      karte = rest.length > 0 ? rest[rng.int(rest.length)] : CARDS[rng.int(CARDS.length)];
    }
    if (karte) gewaehlt.push(karte.id);
  }

  return gewaehlt;
}
