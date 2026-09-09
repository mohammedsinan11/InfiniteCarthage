/**
 * Rohstoffertrag nach einem Wurf.
 *
 * Die feine Regel, die oft falsch umgesetzt wird: reicht die Bank fuer einen
 * Rohstoff nicht aus und haetten MEHRERE Spieler Anspruch, bekommt niemand
 * etwas davon. Nur wenn genau ein Spieler Anspruch hat, erhaelt er, was noch
 * da ist. Auf unserer Karte trifft das oefter zu als im Original, weil eine
 * lange Partie die Bank leerraeumt.
 */

import { hexVertices, hexKey, vertexKey } from '../coords';
import type { World } from '../world';
import { RESOURCES, TERRAIN_RESOURCE } from '../types';
import type { Resource } from '../types';
import type { GameState, PlayerId } from '../state';
import { emptyHand } from '../state';
import type { Hand } from '../state';

export type Payout = Record<PlayerId, Hand>;

/**
 * Was der Wurf einbringt, ohne den Zustand zu aendern.
 * Liefert je Spieler die Karten und die Rohstoffe, die wegen Bankmangel
 * ausgefallen sind.
 */
export function computeProduction(
  state: GameState,
  world: World,
  roll: number,
): { payout: Payout; shortfall: Resource[] } {
  // Erst den Anspruch sammeln, dann gegen die Bank pruefen.
  const claims: Record<Resource, Map<PlayerId, number>> = {
    lumber: new Map(),
    wool: new Map(),
    grain: new Map(),
    brick: new Map(),
    ore: new Map(),
  };

  for (const tile of world.tiles.values()) {
    if (tile.number !== roll) continue;
    if (hexKey(tile.q, tile.r) === state.robber) continue;
    const res = TERRAIN_RESOURCE[tile.terrain];
    if (res === null) continue;

    for (const v of hexVertices(tile.q, tile.r)) {
      const b = state.buildings[vertexKey(v)];
      if (b === undefined) continue;
      const n = b.type === 'city' ? 2 : 1;
      const m = claims[res];
      m.set(b.owner, (m.get(b.owner) ?? 0) + n);
    }
  }

  const payout: Payout = {};
  const shortfall: Resource[] = [];

  for (const res of RESOURCES) {
    const m = claims[res];
    if (m.size === 0) continue;
    let total = 0;
    for (const n of m.values()) total += n;

    if (total > state.bank[res]) {
      if (m.size > 1) {
        // Mehrere Anspruchsberechtigte, zu wenig in der Bank: niemand bekommt etwas.
        shortfall.push(res);
        continue;
      }
      // Genau einer: er bekommt den Rest der Bank.
      const [only] = [...m.keys()];
      m.set(only!, state.bank[res]);
      if (state.bank[res] < total) shortfall.push(res);
    }

    for (const [pid, n] of m) {
      if (n <= 0) continue;
      payout[pid] ??= emptyHand();
      payout[pid]![res] += n;
    }
  }

  return { payout, shortfall };
}
