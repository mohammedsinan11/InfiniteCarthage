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
import { modifiersOf, terrainBonusFor } from '../cards/effects';
import { emptyHand } from '../state';
import type { Hand } from '../state';

export type Payout = Record<PlayerId, Hand>;

/** Ein einzelner Ertrag: dieses Feld gibt diesem Spieler so viel davon. */
export type ProductionSource = {
  /** Hexschluessel des liefernden Feldes. */
  hex: string;
  owner: PlayerId;
  resource: Resource;
  /** 1 fuer eine Siedlung, 2 fuer eine Stadt. */
  amount: number;
};

/**
 * Woher kommt der Ertrag im Einzelnen?
 *
 * computeProduction fasst das zu Summen je Spieler zusammen - fuer die Regel
 * genuegt das. Die Oberflaeche braucht aber die Herkunft: welches Feld
 * aufleuchten soll und von wo eine Karte zur Hand fliegt.
 *
 * Bewusst hier und nicht im Client: sonst gaebe es die Ertragsregel zweimal,
 * und die Anzeige koennte etwas anderes behaupten als die Abrechnung.
 * Bankmangel bleibt draussen - das ist eine Frage der Abrechnung, nicht der
 * Herkunft.
 */
export function productionSources(
  /**
   * Gelesen werden nur belegte Ecken und die Karten der Spieler - beides
   * oeffentlich. So passt auch die redigierte Sicht des Clients hinein und
   * die Ertragsregel bleibt einmalig.
   */
  state: Pick<GameState, 'buildings'> & { players: ReadonlyArray<{ id: PlayerId; cards: string[] }> },
  world: World,
  roll: number,
): ProductionSource[] {
  const out: ProductionSource[] = [];
  const cardsOf = (id: PlayerId): string[] =>
    state.players.find((p) => p.id === id)?.cards ?? [];
  for (const tile of world.tiles.values()) {
    if (tile.number !== roll) continue;
    const hk = hexKey(tile.q, tile.r);
    const resource = TERRAIN_RESOURCE[tile.terrain];
    if (resource === null) continue;

    for (const v of hexVertices(tile.q, tile.r)) {
      const b = state.buildings[vertexKey(v)];
      if (b === undefined) continue;
      const grund = b.type === 'city' ? 2 : 1;
      // Karten koennen den Ertrag heben oder senken, aber nie unter null.
      const mods = modifiersOf(cardsOf(b.owner));
      const amount = terrainBonusFor(mods, tile.terrain, grund);
      if (amount > 0) out.push({ hex: hk, owner: b.owner, resource, amount });
    }
  }
  return out;
}

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

  for (const q of productionSources(state, world, roll)) {
    const m = claims[q.resource];
    m.set(q.owner, (m.get(q.owner) ?? 0) + q.amount);
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
