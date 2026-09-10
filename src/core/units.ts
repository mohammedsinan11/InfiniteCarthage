/**
 * Einheiten auf der Karte.
 *
 * Eine Einheit steht auf einem Feld, gehoert jemandem oder niemandem und hat
 * eine Art. Mehr ist es vorerst nicht - und bewusst noch nicht im Spielstand:
 * alles, was heute auf der Karte steht, laesst sich ableiten. Die Bewohner eines
 * Nests folgen aus dem Seed, die Wachen eines Spielers aus seiner Zahl stehender
 * Wachen und der Lage seiner Siedlungen.
 *
 * Sobald Einheiten sich bewegen und eigene Entscheidungen tragen (DESIGN.md,
 * Einheiten), wandern sie in den Spielstand. Das Zeichnen bleibt dasselbe, weil
 * es nur diese Liste liest.
 */

import { hash3i } from './hash';
import { hexDistance, hexesInRange, parseVertexKey, vertexAdjacentHexes } from './coords';
import { nestAt } from './raiders';
import { terrainAt } from './worldgen';
import type { Hex } from './coords';
import type { GameState, PlayerId } from './state';

export type UnitKind = 'raeuber' | 'goblin' | 'ritter';

export type Unit = {
  kind: UnitKind;
  q: number;
  r: number;
  /** Wem sie gehoert - null fuer Raeuber und Goblins. */
  owner: PlayerId | null;
};

const SALT_LAGER = 73;

/** Hoechstens so viele Figuren stehen auf einem Feld; mehr waere Gewimmel. */
export const MAX_JE_FELD = 3;

/**
 * Wer ein Nest bewohnt.
 *
 * Etwa jedes dritte Nest ist ein Goblinlager. Fuer die Regeln ist das gleich -
 * beide pluendern -, aber die Karte bekommt dadurch zwei Gegner statt eines,
 * und die Goblin-Sprites haben einen Platz. Rein: dasselbe Nest hat immer
 * dieselben Bewohner.
 */
export function nestOccupants(
  seed: number,
  q: number,
  r: number,
): { kind: 'raeuber' | 'goblin'; count: number } {
  const h = hash3i(seed, q, r, SALT_LAGER) >>> 0;
  return { kind: h % 3 === 0 ? 'goblin' : 'raeuber', count: 2 + ((h >>> 8) % 2) };
}

/** Die Bewohner aller Nester unter den gegebenen Feldern. */
export function nestUnits(seed: number, hexes: Iterable<Hex>): Unit[] {
  const out: Unit[] = [];
  for (const h of hexes) {
    if (!nestAt(seed, h.q, h.r)) continue;
    const b = nestOccupants(seed, h.q, h.r);
    for (let i = 0; i < b.count; i++) out.push({ kind: b.kind, q: h.q, r: h.r, owner: null });
  }
  return out;
}

/** Was die Wachaufstellung vom Spielstand braucht - die redigierte Sicht genuegt. */
export type GuardView = Pick<GameState, 'worldSeed' | 'buildings'> & {
  players: ReadonlyArray<{ id: PlayerId; guards: number }>;
};

/** Wie weit ein Posten nach Nestern Ausschau haelt. */
const AUSSCHAU = 6;

/**
 * Wo die Wachen eines Spielers stehen.
 *
 * Auf Landfeldern an seinen Siedlungen, und zuerst dort, wo das naechste Nest am
 * naechsten ist - eine Wache stellt man dahin, woher die Gefahr kommt. Je Feld
 * hoechstens drei; weitere ruecken auf das naechstbeste Feld.
 *
 * Die Stelle ist Anschauung. Fuer die Abwehr zaehlt nur die Zahl (rules/raid.ts),
 * nicht, wo die Figur steht.
 */
export function guardPosts(state: GuardView, id: PlayerId, count: number): Hex[] {
  if (count <= 0) return [];
  const seed = state.worldSeed;
  const felder = new Map<string, Hex>();
  for (const [vk, b] of Object.entries(state.buildings)) {
    if (b.owner !== id) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) {
      if (terrainAt(seed, h.q, h.r) === 'water' || nestAt(seed, h.q, h.r)) continue;
      felder.set(h.q + ':' + h.r, h);
    }
  }
  if (felder.size === 0) return [];

  const gefahr = (h: Hex): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const c of hexesInRange(h, AUSSCHAU)) {
      if (nestAt(seed, c.q, c.r)) best = Math.min(best, hexDistance(h, c));
    }
    return best;
  };
  const reihe = [...felder.values()]
    .map((h) => ({ h, d: gefahr(h) }))
    // Feste Reihenfolge bei Gleichstand, sonst springen die Figuren.
    .sort((a, b) => a.d - b.d || a.h.q - b.h.q || a.h.r - b.h.r)
    .map((x) => x.h);

  const out: Hex[] = [];
  for (let i = 0; out.length < count; i++) {
    out.push(reihe[Math.floor(i / MAX_JE_FELD) % reihe.length]!);
  }
  return out;
}

/** Alle Wachen aller Spieler als Einheiten. */
export function guardUnits(state: GuardView): Unit[] {
  const out: Unit[] = [];
  for (const p of state.players) {
    for (const h of guardPosts(state, p.id, p.guards)) {
      out.push({ kind: 'ritter', q: h.q, r: h.r, owner: p.id });
    }
  }
  return out;
}
