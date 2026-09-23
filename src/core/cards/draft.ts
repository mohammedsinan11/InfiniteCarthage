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
import { RARITY_WEIGHTS, istEinzigartig } from './types';
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
function ziehStufe(rng: Rng, source: DraftSource, erlaubt?: ReadonlySet<Rarity>): Rarity | null {
  const gewichte = RARITY_WEIGHTS[source];
  const stufen = (Object.keys(gewichte) as Rarity[]).filter(
    (r) => gewichte[r] > 0 && (erlaubt === undefined || erlaubt.has(r)),
  );
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
  /** Bereits besessene einzigartige Karten werden nicht erneut angeboten. */
  owned: readonly string[] = [],
): string[] {
  const rng = new Rng(hash3i(secretSeed, turn, QUELLE_ZU_ZAHL[source], SALT_DRAFT));
  const besitzt = new Set(owned);
  const verfuegbar = CARDS.filter((c) => !istEinzigartig(c) || !besitzt.has(c.id));
  const stufen = new Set<Rarity>();
  for (const r of Object.keys(RARITY_WEIGHTS[source]) as Rarity[]) {
    if (verfuegbar.filter((c) => c.rarity === r).length >= DRAFT_SIZE) stufen.add(r);
  }

  // Eine Seltenheit fuer die ganze Auslage: drei echte Alternativen statt
  // einer offensichtlichen legendaer-gegen-ungewoehnlich-Entscheidung.
  const stufe = ziehStufe(rng, source, stufen);
  const passend: Card[] = stufe === null
    ? verfuegbar
    : verfuegbar.filter((c) => c.rarity === stufe);
  return rng.shuffle([...passend]).slice(0, DRAFT_SIZE).map((c) => c.id);
}
