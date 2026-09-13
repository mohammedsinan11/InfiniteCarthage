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
import type { Abkommen, PlayerId, UnitState } from './state';

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

/** Was die Feindschaft vom Spielstand braucht: die Abkommen. */
export type PaktSicht = { abkommen: readonly Abkommen[] };

/** Das Abkommen zwischen einem Spieler und einer Fraktion, falls eines gilt. */
export function abkommenVon(
  view: PaktSicht,
  player: PlayerId,
  fraktion: string,
): Abkommen | undefined {
  return view.abkommen.find((a) => a.player === player && a.fraktion === fraktion);
}

/**
 * Sind zwei Seiten einander feind?
 *
 * Jede Fraktion gegen jede andere und gegen alle Spieler; Spieler untereinander
 * nicht, Wanderer mit niemandem. Hat ein Spieler mit einer Fraktion Frieden
 * oder zahlt Tribut (rules/diplomatie.ts), sind beide einander nicht feind.
 * Alle Kampfregeln fragen nur diese eine Funktion - ohne Spielstand (view)
 * gilt der Krieg, etwa fuer Tests der reinen Regel.
 */
export function feindlich(a: Seite, b: Seite, view?: PaktSicht): boolean {
  if (a === b || a === NEUTRAL || b === NEUTRAL) return false;
  const sa = istSpielerSeite(a);
  const sb = istSpielerSeite(b);
  if (sa && sb) return false;
  if (view && sa !== sb) {
    const [spieler, fraktion] = sa ? [spielerAus(a), b] : [spielerAus(b), a];
    if (abkommenVon(view, spieler, fraktion)) return false;
  }
  return true;
}

/**
 * Wer mit einem Helden auf einem Feld steht, trifft leichter: +1 fuer die Ritter
 * seines Spielers (rules/army.ts, schlacht).
 */
export const ANFUEHRUNG = 1;

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
export function istKampf(seiten: readonly Seite[], view?: PaktSicht): boolean {
  for (let i = 0; i < seiten.length; i++) {
    for (let j = i + 1; j < seiten.length; j++) {
      if (feindlich(seiten[i]!, seiten[j]!, view)) return true;
    }
  }
  return false;
}

/** Steckt diese Einheit in einem Kampf - steht auf ihrem Feld ein Feind? */
export function imKampf(view: ArmyView, u: UnitState): boolean {
  const eigene = seiteVon(u);
  if (eigene === NEUTRAL) return false;
  return seitenAuf(view, u.q, u.r).some((s) => feindlich(eigene, s, view));
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
    if (istKampf(seiten, view)) out.set(k, seiten);
  }
  return out;
}
