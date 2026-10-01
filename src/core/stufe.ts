/**
 * Chronikstufen: eine Leiter der Schwierigkeit.
 *
 * Wer eine Partie gewinnt, schaltet die naechste Stufe frei (client/profil.ts,
 * je Browser - es gibt keine Konten). Jede Stufe legt einen Fluch mehr auf die
 * Partie, zusaetzlich zu den gewuerfelten Omen. Das ist der Kern der
 * Wiederholung in Roguelikes: dieselbe Welt, aber jedes Mal ein Stueck
 * haerter, und man sieht, wie weit man gekommen ist (REPLAYABILITY.md, H).
 *
 * Stufe 0 ist das gewohnte Spiel - Einsteiger merken von der Leiter nichts,
 * bis sie einmal gewonnen haben.
 *
 * Die Flueche sind die Omen (core/omen.ts), in fester Reihenfolge: jede Stufe
 * nimmt den naechsten, der zu den schon geltenden passt.
 */

import { OMEN, gueltigeOmen } from './omen';

/** Die Reihenfolge, in der die Stufen Flueche auflegen - erst milde, dann harte. */
const LEITER = ['magere_weiden', 'dunkle_naechte', 'zoellner', 'unruhige_staemme', 'leere_taschen', 'blutmond'] as const;

/**
 * Nach den Fluechen kommen Regeln (E15, nach der Ascension von Slay the
 * Spire): ab Stufe 7 wird nicht die Welt haerter, sondern das Spiel selbst.
 * Jede Stufe behaelt alles, was die vorigen auflegten.
 */
export const STUFE_REGELN: readonly { ab: number; text: string }[] = [
  { ab: 7, text: 'Die Bosse fordern mehr: Tribut +2, Wachstum +1, ein Kaempfer mehr.' },
  { ab: 8, text: 'Ein Kartenplatz weniger.' },
  { ab: 9, text: 'Die Rivalen beginnen mit 3 Rohstoffen und einer Kartenwahl mehr.' },
  { ab: 10, text: 'Ein verfehlter Boss kostet einen Siegpunkt.' },
];

export const MAX_STUFE = LEITER.length + STUFE_REGELN.length;

export const STUFE_NAME = ['Chronist', 'Knappe', 'Ritter', 'Vogt', 'Graf', 'Herzog', 'Koenig', 'Kaiser', 'Legende', 'Mythos', 'Ewiger'] as const;

/** Gilt die Regel ab dieser Stufe? */
export const stufeRegel = (stufe: number | undefined, ab: 7 | 8 | 9 | 10): boolean => (stufe ?? 0) >= ab;

/** Was eine Stufe ueber die Flueche hinaus auflegt - fuer Lobby und Chronik. */
export const stufeRegelnBis = (stufe: number): string[] => STUFE_REGELN.filter((r) => stufe >= r.ab).map((r) => r.text);

/**
 * Die Omen einer Partie auf dieser Stufe: die gewuerfelten plus je Stufe ein
 * Fluch aus der Leiter. Was sich mit einem Segen beisst (Zoellner gegen
 * Handelswinde), verdraengt den Segen - die Stufe geht vor.
 */
export function omenMitStufe(omens: readonly string[], stufe: number): string[] {
  const n = Math.max(0, Math.min(LEITER.length, Math.floor(stufe)));
  // Ist ein Fluch der Leiter schon gewuerfelt, nimmt die Stufe den naechsten -
  // sonst fuegte sie nichts hinzu (Spieltest 7).
  const flueche: string[] = [];
  for (const id of LEITER) {
    if (flueche.length >= n) break;
    flueche.push(id);
  }
  let extra = 0;
  for (const id of omens) if ((LEITER as readonly string[]).includes(id) && flueche.includes(id)) extra += 1;
  for (const id of LEITER) {
    if (extra <= 0) break;
    if (flueche.includes(id) || omens.includes(id)) continue;
    flueche.push(id);
    extra -= 1;
  }
  const gegen = new Set(flueche.flatMap((id) => OMEN.find((o) => o.id === id)?.gegen ?? []));
  const rest = omens.filter((id) => !gegen.has(id) && !flueche.includes(id));
  return gueltigeOmen([...flueche, ...rest]);
}

export const istStufe = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_STUFE;
