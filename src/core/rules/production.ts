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
import { ertragsBonus } from '../omen';
import { hausGelaende, hausRegenfest } from '../haus';
import { JAHRESZEIT_WIRKUNG, seasonOf } from '../season';
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
  state: Pick<GameState, 'buildings'> & {
    players: ReadonlyArray<{ id: PlayerId; activeCards: string[]; haus?: string | null }>;
    /** Die Omen der Partie (core/omen.ts) - sie gelten fuer alle. */
    omens?: readonly string[];
    /** Die Zugnummer - fuer die Jahreszeit (core/season.ts). Fehlt: keine Wirkung. */
    turn?: number;
  },
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
  const saison = state.turn !== undefined && state.turn > 0 ? JAHRESZEIT_WIRKUNG[seasonOf(state.turn)] : null;
  const cardsOf = (id: PlayerId): string[] =>
    state.players.find((p) => p.id === id)?.activeCards ?? [];
  // Regelkarten (cards/effects.ts): "die 6 zaehlt auch als 8" - dann liefern
  // bei einer 6 auch die 8er-Felder, aber nur an den Besitzer der Karte.
  const alsZahlVon = (id: PlayerId): number[] =>
    modifiersOf(cardsOf(id))
      .alsZahl.filter(([von]) => von === roll)
      .map(([, zu]) => zu);
  const auchZahlen = new Set(state.players.flatMap((p) => alsZahlVon(p.id)));
  for (const tile of world.tiles.values()) {
    if (tile.number !== roll && !auchZahlen.has(tile.number ?? -1)) continue;
    const hk = hexKey(tile.q, tile.r);
    const resource = TERRAIN_RESOURCE[tile.terrain];
    if (resource === null) continue;

    for (const v of hexVertices(tile.q, tile.r)) {
      const b = state.buildings[vertexKey(v)];
      if (b === undefined) continue;
      if (tile.number !== roll && !alsZahlVon(b.owner).includes(tile.number ?? -1)) continue;
      const grund = b.type === 'city' ? 2 : 1;
      // Karten koennen den Ertrag heben oder senken, aber nie unter null.
      const mods = modifiersOf(cardsOf(b.owner));
      const omen = ertragsBonus(state.omens, tile.terrain);
      // Das Haus des Besitzers (core/haus.ts) - etwa der Bergclan an Bergen.
      const haus = state.players.find((p) => p.id === b.owner)?.haus;
      const jahr = tile.terrain === 'pasture' ? (saison?.weide ?? 0) : tile.terrain === 'field' ? (saison?.feld ?? 0) : 0;
      const voll = Math.max(0, terrainBonusFor(mods, tile.terrain, grund) + omen + hausGelaende(haus, tile.terrain) + jahr);
      // Regen und Winter halbieren die Felder - die Ebene ist dagegen gefeit (core/haus.ts).
      const halb = (nass || (saison?.feldHalb ?? false)) && tile.terrain === 'field' && !hausRegenfest(haus);
      const doppelt = mods.doppelZahlen.includes(roll) ? 2 : 1;
      const amount = (halb ? Math.floor(voll / 2) : voll) * doppelt;
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
