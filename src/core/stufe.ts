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

export const MAX_STUFE = LEITER.length;

export const STUFE_NAME = ['Chronist', 'Knappe', 'Ritter', 'Vogt', 'Graf', 'Herzog', 'Koenig'] as const;

/**
 * Die Omen einer Partie auf dieser Stufe: die gewuerfelten plus je Stufe ein
 * Fluch aus der Leiter. Was sich mit einem Segen beisst (Zoellner gegen
 * Handelswinde), verdraengt den Segen - die Stufe geht vor.
 */
export function omenMitStufe(omens: readonly string[], stufe: number): string[] {
  const n = Math.max(0, Math.min(MAX_STUFE, Math.floor(stufe)));
  const flueche: string[] = [...LEITER.slice(0, n)];
  const gegen = new Set(flueche.flatMap((id) => OMEN.find((o) => o.id === id)?.gegen ?? []));
  const rest = omens.filter((id) => !gegen.has(id) && !flueche.includes(id));
  return gueltigeOmen([...flueche, ...rest]);
}

export const istStufe = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_STUFE;
