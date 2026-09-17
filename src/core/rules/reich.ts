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

import { hexKey, hexesInRange, parseHexKey, parseVertexKey, vertexAdjacentHexes } from '../coords';
import type { GameState, PlayerId } from '../state';
import { isLandAt, isNestActive } from '../units';
import { MAX_STUFE } from './hauptstadt';

/** Wie weit das Reich um einen frischen Koenigssitz reicht. */
export const REICH_RADIUS = 3;

/** Um so viel schiebt jeder eigene Bau im Gebiet die Grenze weiter. */
export const REICH_ERWEITERUNG = 2;

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

/** Was jeder von ihnen einmal bringen soll - noch Beschreibung, nicht Regel. */
export const REICHSBAU_ZWECK: Record<ReichsbauArt, string> = {
  burgfeste: 'Ritter und Bogenschuetzen aus dem Reich',
  handelskontor: 'besserer Tausch im ganzen Reich',
  tempel: 'heilt die Einheiten in der Naehe',
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
