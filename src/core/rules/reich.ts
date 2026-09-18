/**
 * Phase 2: das Reich um den Koenigssitz.
 *
 * Solange kein Koenigssitz steht, gibt es kein Reichsgebiet - Phase 2 beginnt
 * mit ihm (rules/hauptstadt.ts, hatKoenigssitz). Dann liegt um jeden
 * Koenigssitz ein Kreis von REICH_RADIUS Feldern, und jeder eigene Bau DARIN
 * schiebt das Gebiet um REICH_ERWEITERUNG weiter: Doerfer, Staedte,
 * Grenzposten und die Reichsbauten selbst.
 *
 * Das waechst also von innen nach aussen. Eine ferne Siedlung am anderen Ende
 * der Karte erweitert nichts - sonst haette man Inseln von Bauland ohne
 * Zusammenhang, und "Umgebung des Koenigssitzes" hiesse gar nichts mehr.
 *
 * Reine Funktionen ueber die redigierte Sicht: der Client faerbt damit die
 * erlaubten Kacheln ein, der Server prueft damit die Aktion - dieselbe Regel,
 * einmal geschrieben.
 */

import { hexDistance, hexKey, hexesInRange, parseHexKey, parseVertexKey, vertexAdjacentHexes } from '../coords';
import type { Hex } from '../coords';
import type { GameState, PlayerId } from '../state';
import { isLandAt, isNestActive } from '../units';
import { MAX_STUFE } from './hauptstadt';

/** Wie weit das Reich um einen frischen Koenigssitz reicht. */
export const REICH_RADIUS = 3;

/** Um so viel schiebt jeder eigene Bau im Gebiet die Grenze weiter. */
export const REICH_ERWEITERUNG = 2;

/** Wie weit ein Tempel heilt. */
export const TEMPEL_RADIUS = 2;

/** Was die Reichsregeln vom Zustand lesen. */
export type ReichSicht = Pick<GameState, 'worldSeed' | 'buildings'> & {
  hauptstaedte?: GameState['hauptstaedte'];
  tuerme?: GameState['tuerme'];
  reichsbauten?: GameState['reichsbauten'];
  destroyedNests?: GameState['destroyedNests'];
  nestFraktion?: GameState['nestFraktion'];
};

/** Die drei Reichsbauten, die der Koenigssitz freischaltet. */
export type ReichsbauArt = 'burgfeste' | 'handelskontor' | 'tempel';

export const REICHSBAU_NAME: Record<ReichsbauArt, string> = {
  burgfeste: 'Burgfeste',
  handelskontor: 'Handelskontor',
  tempel: 'Tempel',
};

/** Was jeder von ihnen bringt - die Regeln dazu stehen unten in dieser Datei. */
export const REICHSBAU_ZWECK: Record<ReichsbauArt, string> = {
  burgfeste: 'hier treten Ritter und Bogenschuetzen an, auch fern der Siedlungen',
  handelskontor: 'Tausch 3:1 auf alles im ganzen Reich, auch bei Sturm',
  tempel: `heilt eigene Einheiten ${TEMPEL_RADIUS} Felder weit je Runde`,
};

/**
 * Die Felder, auf denen dieser Spieler in Phase 2 bauen darf. Leer, solange
 * kein Koenigssitz steht.
 */
export function reichsgebiet(view: ReichSicht, player: PlayerId): Set<string> {
  const gebiet = new Set<string>();
  const land = (q: number, r: number) => isLandAt(view.worldSeed, q, r);
  const dazu = (q: number, r: number, radius: number) => {
    for (const h of hexesInRange({ q, r }, radius)) {
      if (land(h.q, h.r)) gebiet.add(hexKey(h.q, h.r));
    }
  };

  for (const [hk, h] of Object.entries(view.hauptstaedte ?? {})) {
    if (h.owner !== player || h.stufe < MAX_STUFE) continue;
    const { q, r } = parseHexKey(hk);
    dazu(q, r, REICH_RADIUS);
  }
  if (gebiet.size === 0) return gebiet;

  /*
   * Ausbreiten, bis nichts mehr dazukommt: ein Bau erweitert nur, wenn er
   * selbst schon im Gebiet liegt. Die Schranke ist Vorsicht, keine Regel -
   * die Schleife steht ohnehin, sobald nichts Neues mehr faellt.
   */
  const plaetze: { q: number; r: number }[] = [];
  for (const [vk, b] of Object.entries(view.buildings)) {
    if (b.owner !== player) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) plaetze.push(h);
  }
  for (const [vk, t] of Object.entries(view.tuerme ?? {})) {
    if (t.owner !== player) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) plaetze.push(h);
  }
  for (const [hk, b] of Object.entries(view.reichsbauten ?? {})) {
    if (b.owner !== player) continue;
    plaetze.push(parseHexKey(hk));
  }

  for (let runde = 0; runde < 20; runde++) {
    const vorher = gebiet.size;
    for (const p of plaetze) {
      if (!gebiet.has(hexKey(p.q, p.r))) continue;
      dazu(p.q, p.r, REICH_ERWEITERUNG);
    }
    if (gebiet.size === vorher) break;
  }
  return gebiet;
}

/**
 * Warum hier kein Reichsbau entstehen kann - oder null. Die drei duerfen
 * mehrfach stehen; ein Feld traegt aber nur einen, und die Hauptstadt behaelt
 * ihr eigenes.
 */
export function reichsbauHindernis(
  view: ReichSicht,
  player: PlayerId,
  q: number,
  r: number,
  gebiet?: ReadonlySet<string>,
): string | null {
  const k = hexKey(q, r);
  if (view.reichsbauten?.[k]) return 'Auf diesem Feld steht schon ein Reichsbau.';
  if (view.hauptstaedte?.[k]) return 'Das Feld traegt schon eine Hauptstadt.';
  if (!isLandAt(view.worldSeed, q, r)) return 'Auf Wasser wird nicht gebaut.';
  if (isNestActive({ worldSeed: view.worldSeed, destroyedNests: view.destroyedNests ?? [] }, q, r)) {
    return 'Dort steht ein Lager.';
  }
  const feld = gebiet ?? reichsgebiet(view, player);
  if (feld.size === 0) return 'Erst der Koenigssitz macht dich zum Reich.';
  if (!feld.has(k)) return 'Das Feld liegt ausserhalb deines Reichs.';
  return null;
}

// --- Was die drei bewirken ---------------------------------------------------

/*
 * Die Wirkungen lesen nur die Reichsbauten selbst, nicht das Gebiet: wer den
 * Bau hat, hat die Wirkung. Sonst haetten sie aufgehoert zu wirken, sobald das
 * Reich einmal anders verlaeuft - ein Tempel steht, wo er steht.
 */

/** Was die Wirkungen vom Zustand lesen - weniger als ReichSicht. */
export type BautenSicht = { reichsbauten?: GameState['reichsbauten'] };

/** Die Felder mit einem eigenen Reichsbau dieser Art. */
export function reichsbauFelder(view: BautenSicht, player: PlayerId, art: ReichsbauArt): Hex[] {
  const out: Hex[] = [];
  for (const [hk, b] of Object.entries(view.reichsbauten ?? {})) {
    if (b.owner === player && b.art === art) out.push(parseHexKey(hk));
  }
  return out;
}

/** Hat dieser Spieler einen Reichsbau dieser Art? */
export function hatReichsbau(view: BautenSicht, player: PlayerId, art: ReichsbauArt): boolean {
  return Object.values(view.reichsbauten ?? {}).some((b) => b.owner === player && b.art === art);
}

/**
 * Heilt hier ein eigener Tempel? Er wirkt TEMPEL_RADIUS Felder weit, ohne dass
 * eine Siedlung in der Naehe sein muesste - genau das ist sein Sinn: ein
 * verwundeter Ritter muss nicht mehr heimkehren (rules/army.ts, Schritt 6).
 */
export function tempelNah(view: BautenSicht, player: PlayerId, q: number, r: number): boolean {
  return reichsbauFelder(view, player, 'tempel').some((h) => hexDistance(h, { q, r }) <= TEMPEL_RADIUS);
}
