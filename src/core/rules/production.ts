/**
 * Rohstoffertrag nach einem Wurf.
 *
 * Die Bank ist unendlich (state.ts) - jeder bekommt, was seine Felder liefern.
 * Frueher fiel ein Rohstoff fuer alle aus, wenn die Bank nicht fuer jeden
 * reichte; das ist mit dem Bestand verschwunden.
 */

import { hexVertices, hexKey, vertexKey } from '../coords';
import type { World } from '../world';
import { TERRAIN_RESOURCE } from '../types';
import type { Resource } from '../types';
import type { GameState, PlayerId } from '../state';
import { modifiersOf, terrainBonusFor } from '../cards/effects';
import { emptyHand } from '../state';
import type { Hand } from '../state';
import { regnet, wetterOf } from '../zeit';
import type { Wetter } from '../zeit';

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
  /**
   * Das Wetter der Runde (core/zeit.ts). Bei Regen liefern Getreidefelder die
   * Haelfte, abgerundet: ein Dorf dort nichts, eine Stadt eins.
   */
  wetter: Wetter = 'klar',
): ProductionSource[] {
  const out: ProductionSource[] = [];
  const nass = regnet(wetter);
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
      const voll = terrainBonusFor(mods, tile.terrain, grund);
      const amount = nass && tile.terrain === 'field' ? Math.floor(voll / 2) : voll;
      if (amount > 0) out.push({ hex: hk, owner: b.owner, resource, amount });
    }
  }
  return out;
}

/** Was der Wurf einbringt, je Spieler - ohne den Zustand zu aendern. */
export function computeProduction(
  state: GameState,
  world: World,
  roll: number,
): { payout: Payout } {
  const payout: Payout = {};
  for (const q of productionSources(state, world, roll, wetterOf(state.worldSeed, state.turn))) {
    payout[q.owner] ??= emptyHand();
    payout[q.owner]![q.resource] += q.amount;
  }
  return { payout };
}
