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

import { WERTE, ZWEIG_WERTE, garrisonOf, isNestActive, nestFraktionOf } from './units';
import type { ArmyView } from './units';
import type { Abkommen, Auftrag, GameState, HeldZweig, PlayerId, UnitState } from './state';
import type { Terrain } from './types';
import { hexKey, hexVertices, vertexKey } from './coords';

export type Seite = string;

/** Wer fuer niemanden kaempft und von niemandem angegriffen wird. */
export const NEUTRAL: Seite = 'neutral';

export const spielerSeite = (id: PlayerId): Seite => `p:${id}`;
export const istSpielerSeite = (s: Seite): boolean => s.startsWith('p:');
/** Der Spieler hinter einer Spielerseite. */
export const spielerAus = (s: Seite): PlayerId => s.slice(2);

export function seiteVon(
  u: Pick<UnitState, 'kind' | 'owner' | 'fraktion'> & { auftrag?: Auftrag },
): Seite {
  if (u.kind === 'wanderer') return NEUTRAL;
  // Schleime sind bei Tag friedfertig: sie liegen herum, und niemand kaempft
  // mit ihnen. Erst die Nacht macht sie wieder zur Nacht (rules/army.ts).
  // Die Hexe ruht zwar auch - aber sie ist nie friedlich, sie bleibt nur stehen.
  if ((u.kind === 'schleim' || u.kind === 'morast') && u.auftrag === 'ruht') return NEUTRAL;
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

/**
 * Bogenschuetzen (rules/army.ts, beschuss) schiessen ein Feld weit, von der
 * eigenen Hauptstadt oder neben einem eigenen Wachturm zwei. Im Nahkampf
 * treffen sie um eins schlechter - wer sie erreicht, hat sie.
 */
export const BOGEN_REICHWEITE = 1;
export const BOGEN_REICHWEITE_ERHOEHT = 2;
export const BOGEN_NAHKAMPF = 1;

/**
 * DECKUNG. Wo einer steht, entscheidet mit, ob er getroffen wird. Im Wald und
 * im Gebirge ist er schwerer zu fassen, im Sumpf ein wenig; auf Wiese, Feld
 * und in der Wueste steht er frei. Der Abzug trifft den ANGREIFER - gerechnet
 * wird er beim Ziel (rules/army.ts, schlacht).
 */
export const DECKUNG: Readonly<Record<Terrain, number>> = {
  forest: 1,
  mountain: 1,
  hill: 0,
  pasture: 0,
  field: 0,
  desert: 0,
  water: 0,
};

/**
 * Wer hinter eigenem Mauerwerk steht, ist noch schwerer zu treffen: ein
 * Wachturm auf einer Ecke des Feldes oder eine eigene Hauptstadt darauf.
 * Gilt nur fuer Spieler - Lager haben ihre Palisade (PALISADE).
 */
export const DECKUNG_BAU = 1;
/** Ein befestigter Turm (Stufe 3) deckt seine Nachbarfelder staerker. */
export const DECKUNG_BAU_BEFESTIGT = 2;

/**
 * MORAL. Verliert eine Seite in einer Runde mindestens die Haelfte ihrer
 * Leute, weicht der Rest auf ein Nachbarfeld aus, statt bis zum letzten Mann
 * zu fallen. Der Held bleibt stehen - er ist der Grund, warum die anderen
 * ueberhaupt noch dastehen.
 */
export const MORAL_ANTEIL = 0.5;

/** Trifft dieser Wurf? Eine Sechs trifft immer, eine Eins nie. */
export function trifft(wurf: number, angriff: number, aufschlag = 0): boolean {
  if (wurf >= 6) return true;
  if (wurf <= 1) return false;
  return wurf + angriff + aufschlag >= TRIFFT_AB;
}

/**
 * STUFEN. Wer Feinde erschlaegt, steigt auf (rules/army.ts, siegGutschreiben).
 * Jede Stufe bringt einen Punkt Angriff und einen Punkt Leben - wenig genug,
 * dass eine Uebermacht eine Uebermacht bleibt, genug, dass ein Veteran sich
 * anders anfuehlt als ein frischer Ritter.
 */
export const STUFE_ANGRIFF = 1;
export const STUFE_LEBEN = 1;

/** So viele Siege kostet die jeweils naechste Stufe: 2, dann 4, dann 7, dann 11. */
export const STUFEN_AB: readonly number[] = [2, 4, 7, 11];

/** Ab dieser Stufe verdient sich eine Einheit einen Namen. */
export const NAME_AB_STUFE = 2;

/** Die Stufe, die zu so vielen Siegen gehoert. */
export function stufeFuer(siege: number): number {
  let stufe = 0;
  for (const ab of STUFEN_AB) if (siege >= ab) stufe += 1;
  return stufe;
}

/** Was eine Einheit von Haus aus kann - beim ernannten Helden sein Zweig. */
type Traeger = Pick<UnitState, 'kind'> & { zweig?: HeldZweig; stufe?: number };

const grundwerte = (u: Traeger) => (u.zweig ? ZWEIG_WERTE[u.zweig] : WERTE[u.kind]);

/**
 * Wie hart diese Einheit zuschlaegt: ihre Art - beim ernannten Helden sein
 * Zweig (rules/zweig.ts) - plus das, was der Rang ihr gegeben hat.
 */
export function angriffVon(u: Traeger): number {
  return grundwerte(u).angriff + STUFE_ANGRIFF * (u.stufe ?? 0);
}

/**
 * Wie viel Leben diese Einheit hoechstens hat.
 *
 * Der Rang zaehlt bewusst mit: sonst koennte sich ein aufgestiegener Ritter nie
 * ueber seinen Grundwert hinaus erholen, obwohl der Aufstieg ihn erhoeht hat
 * (rules/army.ts, Erholung).
 */
export function maxLeben(u: Traeger): number {
  return grundwerte(u).leben + STUFE_LEBEN * (u.stufe ?? 0);
}

/** Was die Deckungsregel vom Zustand braucht. */
export type DeckungSicht = {
  tuerme?: GameState['tuerme'];
  hauptstaedte?: GameState['hauptstaedte'];
};

/**
 * Wie schwer dieses Ziel zu treffen ist: Gelaende plus eigenes Mauerwerk.
 * Das Ergebnis wird vom Angriff des Schlagenden abgezogen.
 */
export function deckungFuer(
  view: DeckungSicht,
  terrain: Terrain,
  ziel: Pick<UnitState, 'q' | 'r' | 'owner'>,
): number {
  let d = DECKUNG[terrain] ?? 0;
  if (ziel.owner === null) return d;
  let bau = view.hauptstaedte?.[hexKey(ziel.q, ziel.r)]?.owner === ziel.owner ? DECKUNG_BAU : 0;
  for (const v of hexVertices(ziel.q, ziel.r)) {
    const turm = view.tuerme?.[vertexKey(v)];
    if (turm?.owner !== ziel.owner) continue;
    bau = Math.max(bau, turm.stufe >= 3 ? DECKUNG_BAU_BEFESTIGT : DECKUNG_BAU);
  }
  return d + bau;
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
