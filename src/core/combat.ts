/**
 * Kampf: wer wem feind ist, wie hart wer zuschlaegt, wo gerade gekaempft wird.
 *
 * Reine Hilfen ohne Zustandsaenderung - ausgetragen wird in rules/army.ts. Hier
 * liegt, was auch der Client braucht: die Schwerter auf der Karte fragen
 * dieselbe Funktion (kampfFelder), nach der die Regel kaempfen laesst.
 *
 * SEITEN. Jede Einheit kaempft fuer eine Seite: ein Spieler ("p:<id>"), eine
 * Fraktion ("f:cx:cy", core/factions.ts) oder niemand (NEUTRAL - Wanderer).
 * Die Besatzung eines Lagers kaempft fuer die Fraktion des Lagers.
 */

import { garrisonOf, isNestActive, nestFraktionOf } from './units';
import type { ArmyView } from './units';
import type { PlayerId, UnitState } from './state';

export type Seite = string;

/** Wer fuer niemanden kaempft und von niemandem angegriffen wird. */
export const NEUTRAL: Seite = 'neutral';

export const spielerSeite = (id: PlayerId): Seite => `p:${id}`;
export const istSpielerSeite = (s: Seite): boolean => s.startsWith('p:');
/** Der Spieler hinter einer Spielerseite. */
export const spielerAus = (s: Seite): PlayerId => s.slice(2);

export function seiteVon(u: Pick<UnitState, 'kind' | 'owner' | 'fraktion'>): Seite {
  if (u.kind === 'wanderer') return NEUTRAL;
  if (u.owner !== null) return spielerSeite(u.owner);
  return u.fraktion ?? NEUTRAL;
}

/**
 * Sind zwei Seiten einander feind?
 *
 * Vorerst fest: jede Fraktion gegen jede andere und gegen alle Spieler. Spieler
 * untereinander nicht - dafuer gibt es noch keine Regeln. Hier soll spaeter die
 * Diplomatie ansetzen; alle Kampfregeln fragen nur diese eine Funktion.
 */
export function feindlich(a: Seite, b: Seite): boolean {
  if (a === b || a === NEUTRAL || b === NEUTRAL) return false;
  if (istSpielerSeite(a) && istSpielerSeite(b)) return false;
  return true;
}

/** Ab dieser Summe aus Wurf, Angriff und Aufschlag sitzt ein Treffer. */
export const TRIFFT_AB = 6;

/** Wer ein Lager angreift, rennt gegen die Palisade. */
export const PALISADE = 1;

/**
 * Die Besatzung eines Lagers ist nicht zum Kampf geruestet - sie wird
 * ueberrascht. So trifft ein Ritter ein Lager ab 4 und die Raeuberbesatzung ihn
 * nur mit einer 6: dieselben Werte wie bei der ersten Belagerung.
 */
export const BESATZUNG_UNGEORDNET = 2;

/** Trifft dieser Wurf? Eine Sechs trifft immer, eine Eins nie. */
export function trifft(wurf: number, angriff: number, aufschlag = 0): boolean {
  if (wurf >= 6) return true;
  if (wurf <= 1) return false;
  return wurf + angriff + aufschlag >= TRIFFT_AB;
}

/** Die kaempfenden Seiten auf einem Feld, sortiert - Einheiten und, wenn dort jemand steht, die Besatzung. */
export function seitenAuf(view: ArmyView, q: number, r: number): Seite[] {
  const seiten = new Set<Seite>();
  for (const u of view.units) {
    if (u.q !== q || u.r !== r) continue;
    const s = seiteVon(u);
    if (s !== NEUTRAL) seiten.add(s);
  }
  if (seiten.size > 0 && isNestActive(view, q, r) && garrisonOf(view, q, r) > 0) {
    seiten.add(nestFraktionOf(view, q, r));
  }
  return [...seiten].sort();
}

/** Stehen unter diesen Seiten Feinde? */
export function istKampf(seiten: readonly Seite[]): boolean {
  for (let i = 0; i < seiten.length; i++) {
    for (let j = i + 1; j < seiten.length; j++) {
      if (feindlich(seiten[i]!, seiten[j]!)) return true;
    }
  }
  return false;
}

/** Steckt diese Einheit in einem Kampf - steht auf ihrem Feld ein Feind? */
export function imKampf(view: ArmyView, u: UnitState): boolean {
  const eigene = seiteVon(u);
  if (eigene === NEUTRAL) return false;
  return seitenAuf(view, u.q, u.r).some((s) => feindlich(eigene, s));
}

/** Alle Felder, auf denen gekaempft wird: Feldschluessel -> kaempfende Seiten. */
export function kampfFelder(view: ArmyView): Map<string, Seite[]> {
  const out = new Map<string, Seite[]>();
  const gesehen = new Set<string>();
  for (const u of view.units) {
    const k = u.q + ':' + u.r;
    if (gesehen.has(k)) continue;
    gesehen.add(k);
    const seiten = seitenAuf(view, u.q, u.r);
    if (istKampf(seiten)) out.set(k, seiten);
  }
  return out;
}
