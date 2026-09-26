/**
 * Bevoelkerung: Menschen in den Siedlungen (OVERHAUL.md, Abschnitt 1 -
 * "villages that have people"; Vorbild Against the Storm).
 *
 * Bewusst klein gehalten:
 *  - Jede Siedlung hat Einwohner. Ein neues Dorf beginnt mit einem, jede
 *    grosse Runde kommt einer dazu - zwei, wenn ein Feld oder eine Weide
 *    nebenan Nahrung liefert. Ein Dorf fasst 3, eine Stadt 5.
 *  - Raubzuege und Feuer kosten Menschen: eine Pluenderung einen, ein
 *    niedergebranntes Gebaeude alle.
 *  - Menschen braucht, wer waechst: eine Stadt nur aus einem Dorf mit
 *    wenigstens 2 Einwohnern, ein Ritter nimmt einen aus der vollsten Siedlung.
 *
 * So lohnt es, Doerfer zu schuetzen, und wo man siedelt, zaehlt doppelt.
 * Nur in Partien mit Ereignissen; alte Staende kennen keine Einwohner.
 */

import { parseVertexKey, vertexAdjacentHexes, hexVertices, vertexKey } from './coords';
import type { World } from './world';
import { tileAt } from './world';
import type { GameState, PlayerId } from './state';

export const EINWOHNER_DORF = 3;
export const EINWOHNER_STADT = 5;
/** So viele braucht ein Dorf, um Stadt zu werden. */
export const EINWOHNER_FUER_STADT = 2;

type Sicht = Pick<GameState, 'buildings'> & { einwohner?: GameState['einwohner'] };

/** Wie viele in dieser Siedlung leben. Ohne Eintrag: einer. */
export const einwohnerVon = (s: Sicht, vk: string): number => s.einwohner?.[vk] ?? (s.buildings[vk] ? 1 : 0);

export const platzFuer = (s: Sicht, vk: string): number =>
  s.buildings[vk]?.type === 'city' ? EINWOHNER_STADT : EINWOHNER_DORF;

/** Alle Einwohner eines Spielers. */
export function einwohnerGesamt(s: Sicht, id: PlayerId): number {
  let n = 0;
  for (const [vk, b] of Object.entries(s.buildings)) if (b.owner === id) n += einwohnerVon(s, vk);
  return n;
}

/** Liegt Nahrung nebenan - ein Feld oder eine Weide mit Zahl? */
export function hatNahrung(world: World, vk: string): boolean {
  return vertexAdjacentHexes(parseVertexKey(vk)).some((h) => {
    const t = tileAt(world, h.q, h.r);
    return !!t && t.number !== null && t.number !== undefined && (t.terrain === 'field' || t.terrain === 'pasture');
  });
}

export type BevoelkerungEvent =
  | { t: 'growth'; player: PlayerId; zuwachs: number; gesamt: number }
  | { t: 'peopleLost'; player: PlayerId; at: string; count: number };

type Ereignisse = { push(...e: BevoelkerungEvent[]): number };

/** Zu Beginn jeder grossen Runde: die Siedlungen wachsen. */
export function bevoelkerungRunde(s: GameState, world: World, events: Ereignisse): void {
  if (!s.ereignisseAn) return;
  const neu = { ...(s.einwohner ?? {}) };
  const zuwachs = new Map<PlayerId, number>();
  for (const [vk, b] of Object.entries(s.buildings)) {
    const jetzt = neu[vk] ?? 1;
    const dazu = Math.max(0, Math.min(platzFuer(s, vk) - jetzt, hatNahrung(world, vk) ? 2 : 1));
    neu[vk] = jetzt + dazu;
    if (dazu > 0) zuwachs.set(b.owner, (zuwachs.get(b.owner) ?? 0) + dazu);
  }
  // Wer nicht mehr steht, hat keine Einwohner mehr.
  for (const vk of Object.keys(neu)) if (!s.buildings[vk]) delete neu[vk];
  s.einwohner = neu;
  for (const [player, n] of zuwachs) events.push({ t: 'growth', player, zuwachs: n, gesamt: einwohnerGesamt(s, player) });
}

/** Menschen verlieren - bei einer Pluenderung an diesem Feld die vollste Siedlung des Opfers daneben. */
export function einwohnerVerlieren(s: GameState, player: PlayerId, q: number, r: number, count: number, events: Ereignisse): void {
  if (!s.ereignisseAn) return;
  const nebenan = hexVertices(q, r)
    .map((v) => vertexKey(v))
    .filter((vk) => s.buildings[vk]?.owner === player)
    .sort((a, b) => einwohnerVon(s, b) - einwohnerVon(s, a));
  const vk = nebenan[0];
  if (!vk) return;
  const vorher = einwohnerVon(s, vk);
  const nachher = Math.max(1, vorher - count);
  if (nachher === vorher) return;
  s.einwohner = { ...(s.einwohner ?? {}), [vk]: nachher };
  events.push({ t: 'peopleLost', player, at: vk, count: vorher - nachher });
}

/** Einen Menschen aus der vollsten Siedlung nehmen (fuer einen Ritter). false, wenn keine genug hat. */
export function einwohnerNehmen(s: GameState, player: PlayerId): boolean {
  if (!s.ereignisseAn) return true;
  const vk = Object.keys(s.buildings)
    .filter((k) => s.buildings[k]!.owner === player && einwohnerVon(s, k) >= 2)
    .sort((a, b) => einwohnerVon(s, b) - einwohnerVon(s, a) || (a < b ? -1 : 1))[0];
  if (!vk) return false;
  s.einwohner = { ...(s.einwohner ?? {}), [vk]: einwohnerVon(s, vk) - 1 };
  return true;
}

/** Nach jeder Aktion: neue Siedlungen bekommen ihren ersten Einwohner, verschwundene verlieren alle. */
export function einwohnerAbgleichen(s: GameState): void {
  if (!s.ereignisseAn) return;
  const neu = { ...(s.einwohner ?? {}) };
  let anders = false;
  for (const vk of Object.keys(s.buildings)) {
    if (neu[vk] === undefined) {
      neu[vk] = 1;
      anders = true;
    } else if (neu[vk]! > platzFuer(s, vk)) {
      neu[vk] = platzFuer(s, vk);
      anders = true;
    }
  }
  for (const vk of Object.keys(neu)) {
    if (!s.buildings[vk]) {
      delete neu[vk];
      anders = true;
    }
  }
  if (anders) s.einwohner = neu;
}

/** Welche Doerfer schon Stadt werden koennen - alle, wenn es keine Einwohner gibt. */
export const stadtReif = (s: Sicht & { ereignisseAn?: boolean }, vk: string): boolean =>
  !s.ereignisseAn || einwohnerVon(s, vk) >= EINWOHNER_FUER_STADT;
