/**
 * Die Hauptstadt.
 *
 * Ein Feld wird zur Hauptstadt, wenn es ringsum geschlossen ist: alle sechs
 * Kanten tragen eigene Strassen, und an drei Ecken im Wechsel stehen eigene
 * Staedte. Mehr als drei Gebaeude passen wegen der Abstandsregel ohnehin nicht
 * an ein Feld. Doerfer zaehlen vorerst nicht - erst drei Staedte schliessen den
 * Ring (DESIGN.md, Hauptstadt).
 *
 * Beliebig viele je Spieler - jedes geschlossene Feld darf eine werden. Die
 * Ecken bleiben, was sie sind: Ertrag und Punkte der Staedte aendern sich
 * nicht, die Hauptstadt kommt obendrauf.
 */

import { edgeKey, hexEdges, hexKey, hexVertices, parseHexKey, parseVertexKey, vertexAdjacentHexes, vertexKey } from '../coords';
import type { GameState, PlayerId } from '../state';
import { terrainAt } from '../worldgen';

/** Was die Regel sehen muss - der redigierte Stand im Client genuegt. */
export type HauptstadtSicht = Pick<GameState, 'buildings' | 'roads' | 'worldSeed'> & {
  hauptstaedte?: GameState['hauptstaedte'];
};

/** Wie weit ein Feld geschlossen ist. */
export type Umland = {
  q: number;
  r: number;
  /** Eigene Strassen an den sechs Kanten. */
  strassen: number;
  /** Eigene Staedte an den drei Ecken des besten Wechsels. */
  staedte: number;
  /** Eigene Doerfer an diesen Ecken - sie muessen noch Stadt werden. */
  doerfer: number;
  /** Was noch fehlt: jede fehlende Strasse und jede fehlende Stadt zaehlt eins. */
  fehlt: number;
  bereit: boolean;
};

/** Ab so wenig Fehlendem gilt ein Feld als fast geschlossen - dann zeigt der Client die Krone. */
export const FAST_GESCHLOSSEN = 2;

/** Die beiden Eckensaetze, die die Abstandsregel an einem Feld erlaubt. */
const WECHSEL = [
  [0, 2, 4],
  [1, 3, 5],
] as const;

/**
 * Das Umland eines Feldes fuer einen Spieler, oder null, wenn eine fremde
 * Siedlung an beiden Eckensaetzen den Ring fuer immer verhindert.
 */
export function umlandVon(view: HauptstadtSicht, player: PlayerId, q: number, r: number): Umland | null {
  const strassen = hexEdges(q, r).filter((e) => view.roads[edgeKey(e)] === player).length;
  const ecken = hexVertices(q, r).map(vertexKey);
  let beste: Umland | null = null;
  for (const satz of WECHSEL) {
    let staedte = 0;
    let doerfer = 0;
    let fremd = false;
    for (const i of satz) {
      const b = view.buildings[ecken[i]!];
      if (!b) continue;
      if (b.owner !== player) {
        fremd = true;
        break;
      }
      if (b.type === 'city') staedte += 1;
      else doerfer += 1;
    }
    if (fremd) continue;
    const fehlt = 6 - strassen + (3 - staedte);
    if (!beste || fehlt < beste.fehlt) {
      beste = { q, r, strassen, staedte, doerfer, fehlt, bereit: fehlt === 0 };
    }
  }
  return beste;
}

/**
 * Liegt diese Ecke am Ring einer Hauptstadt? Dort steht vorerst kein Wachturm:
 * neben Burg und Mauer brachte er nichts Eigenes - eine neue Aufgabe fuer ihn
 * kommt spaeter (DESIGN.md, Hauptstadt).
 */
export function anHauptstadt(view: Pick<HauptstadtSicht, 'hauptstaedte'>, vk: string): boolean {
  if (!view.hauptstaedte) return false;
  return vertexAdjacentHexes(parseVertexKey(vk)).some((h) => view.hauptstaedte![hexKey(h.q, h.r)] !== undefined);
}

/**
 * Alle Felder an eigenen Gebaeuden, sortiert nach dem, was fehlt. Wasser und
 * Felder, auf denen schon eine Hauptstadt steht, fallen weg.
 */
export function hauptstadtFelder(view: HauptstadtSicht, player: PlayerId): Umland[] {
  const gesehen = new Set<string>();
  const out: Umland[] = [];
  for (const [vk, b] of Object.entries(view.buildings)) {
    if (b.owner !== player) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) {
      const k = hexKey(h.q, h.r);
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      if (view.hauptstaedte?.[k]) continue;
      if (terrainAt(view.worldSeed, h.q, h.r) === 'water') continue;
      const u = umlandVon(view, player, h.q, h.r);
      if (u) out.push(u);
    }
  }
  return out.sort((a, b) => a.fehlt - b.fehlt);
}

/** Warum hier (noch) keine Hauptstadt entstehen kann - oder null. */
export function hauptstadtHindernis(view: HauptstadtSicht, player: PlayerId, q: number, r: number): string | null {
  if (view.hauptstaedte?.[hexKey(q, r)]) return 'Hier steht schon eine Hauptstadt.';
  if (terrainAt(view.worldSeed, q, r) === 'water') return 'Auf Wasser entsteht keine Hauptstadt.';
  const u = umlandVon(view, player, q, r);
  if (!u || !u.bereit) return 'Das Feld braucht ringsum sechs eigene Strassen und drei eigene Staedte.';
  return null;
}

// --- Ausbaustufen -----------------------------------------------------------

/** Namen der Ausbaustufen. */
export const STUFE_NAME: Record<number, string> = { 1: 'Residenz', 2: 'Festungsring', 3: 'Koenigssitz' };

/**
 * Die hoechste Stufe. Steht der Koenigssitz, beginnt fuer diesen Spieler
 * Phase 2: der Koenig ernennt seine Helden und laesst eigene Bauten setzen
 * (DESIGN.md, Hauptstadt).
 */
export const MAX_STUFE = 3;

/**
 * Warum diese Hauptstadt (noch) nicht eine Stufe hoeher kann - oder null. Der
 * Ring muss dafuer noch geschlossen sein: eine abgebrannte Strasse will erst
 * wieder aufgebaut werden.
 */
export function ausbauHindernis(view: HauptstadtSicht, player: PlayerId, q: number, r: number): string | null {
  const h = view.hauptstaedte?.[hexKey(q, r)];
  if (!h || h.owner !== player) return 'Das ist nicht deine Hauptstadt.';
  if (h.stufe >= MAX_STUFE) return `Der ${STUFE_NAME[MAX_STUFE]} steht schon.`;
  const u = umlandVon(view, player, q, r);
  if (!u || !u.bereit) return 'Der Ring ist nicht mehr geschlossen - Strassen oder Staedte fehlen.';
  return null;
}

/** Auf welche Stufe diese Hauptstadt als naechstes ausgebaut wuerde - null, wenn sie oben ist. */
export function naechsteStufe(view: HauptstadtSicht, q: number, r: number): number | null {
  const h = view.hauptstaedte?.[hexKey(q, r)];
  if (!h || h.stufe >= MAX_STUFE) return null;
  return h.stufe + 1;
}

/** Steht irgendwo ein Koenigssitz dieses Spielers? Daran haengt Phase 2. */
export function hatKoenigssitz(view: Pick<HauptstadtSicht, 'hauptstaedte'>, player: PlayerId): boolean {
  return Object.values(view.hauptstaedte ?? {}).some((h) => h.owner === player && h.stufe >= MAX_STUFE);
}

/**
 * Was ein Festungsring schuetzt: die sechs Kanten und die eigenen Gebaeude an
 * den Ecken jeder eigenen Hauptstadt ab Stufe II. Die Mauer brennt nicht, die
 * Bastionen fangen kein Feuer (rules/feuer.ts).
 */
export function festungsSchutz(
  view: Pick<GameState, 'buildings'> & { hauptstaedte?: GameState['hauptstaedte'] },
  owner: PlayerId,
): { kanten: Set<string>; ecken: Set<string> } {
  const kanten = new Set<string>();
  const ecken = new Set<string>();
  for (const [hk, h] of Object.entries(view.hauptstaedte ?? {})) {
    if (h.owner !== owner || h.stufe < 2) continue;
    const { q, r } = parseHexKey(hk);
    for (const e of hexEdges(q, r)) kanten.add(edgeKey(e));
    for (const v of hexVertices(q, r)) {
      const vk = vertexKey(v);
      if (view.buildings[vk]?.owner === owner) ecken.add(vk);
    }
  }
  return { kanten, ecken };
}
