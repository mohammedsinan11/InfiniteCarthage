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
import { RARITY_WEIGHTS, cardKind, istEinzigartig } from './types';
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
  const gewaehlt = rng.shuffle([...passend]);

  /*
   * HOECHSTENS EINE TAKTIK JE AUSLAGE.
   *
   * Taktiken sind nicht einzigartig (istEinzigartig) und bleiben deshalb nach
   * jedem Ausspielen wieder im Topf - anders als Reichskarten verschwinden sie
   * nie aus der Auswahl. Ohne diese Grenze konnte eine Seltenheitsstufe mit
   * vielen Taktiken (z.B. "selten": drei von acht) leicht eine Auslage aus
   * zwei oder drei Taktiken auf einmal ergeben - keine echte Wahl, sondern
   * fast nur Karten aus einer einzigen, engen Schublade.
   */
  const genommen: Card[] = [];
  const genommenIds = new Set<string>();
  let taktikDrin = false;
  for (const c of gewaehlt) {
    if (genommen.length >= DRAFT_SIZE) break;
    if (cardKind(c) === 'taktik') {
      if (taktikDrin) continue;
      taktikDrin = true;
    }
    genommen.push(c);
    genommenIds.add(c.id);
  }
  // Reichte das nicht (z.B. fast nur Taktiken in dieser Stufe), lieber eine
  // zweite Taktik als eine kuerzere Auslage - dieselbe Abwaegung wie oben.
  if (genommen.length < DRAFT_SIZE) {
    for (const c of gewaehlt) {
      if (genommen.length >= DRAFT_SIZE) break;
      if (genommenIds.has(c.id)) continue;
      genommen.push(c);
      genommenIds.add(c.id);
    }
  }
  return genommen.map((c) => c.id);
}
