/**
 * Karawanen: Handel, den man auf der Karte sieht (OVERHAUL.md, Abschnitt 1 -
 * "traders on the roads"; Vorbild Against the Storm).
 *
 * Wer zwei Siedlungen hat, die weit genug auseinander liegen, bekommt zu
 * Beginn einer grossen Runde eine Karawane. Sie zieht von selbst zwischen den
 * beiden hin und her; jede Ankunft bringt zwei Karten der Sorten, von denen
 * man am wenigsten hat - Handel ohne Bank. Raeuber halten sie fuer Beute: wer
 * sie schuetzen will, schickt Ritter mit. Faellt sie, kommt die naechste erst
 * zur naechsten grossen Runde.
 *
 * Eine je Spieler, nur in Partien mit Ereignissen. Die Karawane gehoert dem
 * Spieler (sie ist seine Seite im Kampf), laesst sich aber nicht befehligen.
 */

import { hexDistance, hexKey, parseHexKey } from './coords';
import type { Hex } from './coords';
import { RESOURCES } from './types';
import type { Resource } from './types';
import type { GameState, PlayerId, UnitState } from './state';
import { einheitVorlage, nextStep, settlementApproaches } from './units';

/** So weit muessen die Endpunkte auseinander liegen. */
export const KARAWANE_ABSTAND = 4;
/** Was eine Ankunft bringt. */
export const KARAWANE_LOHN = 2;
const SUCHE = 900;

export type KarawanenEvent =
  | { t: 'caravanSet'; player: PlayerId; q: number; r: number }
  | { t: 'caravanArrived'; player: PlayerId; q: number; r: number; gained: Partial<Record<Resource, number>> };

type Ereignisse = { push(...e: KarawanenEvent[]): number };

/** Die zwei am weitesten auseinander liegenden Felder an eigenen Siedlungen - mit Landweg. */
function endpunkte(s: GameState, id: PlayerId): [Hex, Hex] | null {
  const felder = [...settlementApproaches(s, id).keys()].map(parseHexKey);
  let best: [Hex, Hex] | null = null;
  let weit = KARAWANE_ABSTAND - 1;
  for (let i = 0; i < felder.length; i++) {
    for (let j = i + 1; j < felder.length; j++) {
      const d = hexDistance(felder[i]!, felder[j]!);
      if (d > weit) {
        weit = d;
        best = [felder[i]!, felder[j]!];
      }
    }
  }
  if (!best) return null;
  return nextStep(s.worldSeed, best[0], new Set([hexKey(best[1].q, best[1].r)]), SUCHE) ? best : null;
}

/** Zu Beginn jeder grossen Runde: wer keine hat und zwei Siedlungen weit genug auseinander, bekommt eine. */
export function karawanenRunde(s: GameState, events: Ereignisse, aufstellen: (u: Omit<UnitState, 'id'>) => void): void {
  if (!s.ereignisseAn) return;
  for (const p of s.players) {
    if (p.besiegt) continue;
    if (s.units.some((u) => u.kind === 'karawane' && u.owner === p.id)) continue;
    const e = endpunkte(s, p.id);
    if (!e) continue;
    const [a, b] = e;
    aufstellen(einheitVorlage('karawane', a.q, a.r, { owner: p.id, ziel: b, heimat: hexKey(a.q, a.r) }));
    events.push({ t: 'caravanSet', player: p.id, q: a.q, r: a.r });
  }
}

/** Angekommen: Waren abliefern und umkehren. */
export function karawaneAngekommen(s: GameState, u: UnitState, events: Ereignisse): void {
  const p = s.players.find((x) => x.id === u.owner);
  if (!p || !u.ziel) return;
  // Die knappsten Sorten zuerst - der Grund, warum man sonst zur Bank ginge.
  const knapp = [...RESOURCES].sort((x, y) => p.hand[x] - p.hand[y]);
  const gained: Partial<Record<Resource, number>> = {};
  for (let i = 0; i < KARAWANE_LOHN; i++) {
    const r = knapp[i % knapp.length]!;
    p.hand[r] += 1;
    gained[r] = (gained[r] ?? 0) + 1;
  }
  events.push({ t: 'caravanArrived', player: p.id, q: u.q, r: u.r, gained });
  const zurueck = u.heimat ? parseHexKey(u.heimat) : null;
  u.heimat = hexKey(u.ziel.q, u.ziel.r);
  u.ziel = zurueck;
}
