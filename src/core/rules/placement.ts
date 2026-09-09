/**
 * Wo darf gebaut werden?
 *
 * Diese Datei ist der Grund, warum die Regeln nur einmal existieren: der
 * Server prueft damit eingehende Aktionen, der Client faerbt damit die
 * anklickbaren Stellen ein. Jede Funktion liefert null bei "erlaubt" oder
 * einen Klartextgrund - damit kann der Server eine Fehlermeldung schicken
 * und der Client einen Tooltip zeigen, ohne dass jemand Text doppelt pflegt.
 */

import {
  edgeAdjacentHexes,
  edgeEndpoints,
  edgeKey,
  hexEdges,
  hexVertices,
  parseEdgeKey,
  parseVertexKey,
  vertexAdjacentEdges,
  vertexAdjacentHexes,
  vertexKey,
  vertexNeighborVertices,
} from '../coords';
import type { Edge, Vertex } from '../coords';
import { isGenerated, tileAt } from '../world';
import type { World } from '../world';
import type { GameState, PlayerId } from '../state';

/**
 * Was die Bauregeln vom Zustand wirklich lesen: belegte Ecken und Kanten.
 *
 * Bewusst so eng gefasst, damit auch die REDIGIERTE Sicht des Clients passt.
 * Sonst muesste der Client die Regeln nachbauen, um legale Bauplaetze zu
 * markieren - und genau diese Verdopplung soll es nicht geben.
 */
export type BoardView = Pick<GameState, 'buildings' | 'roads'>;

/** Land = erzeugt und kein Wasser. Auf Wasser wird nicht gebaut. */
export function isLand(world: World, q: number, r: number): boolean {
  const t = tileAt(world, q, r);
  return t !== undefined && t.terrain !== 'water';
}

/**
 * Eine Ecke ist ueberhaupt bebaubar, wenn alle drei Nachbarhexes erzeugt sind
 * und mindestens eines davon Land ist.
 *
 * Die erste Bedingung klingt nach einem Sonderfall fuer den Kartenrand, ist
 * aber keiner: der Wachstumsradius in world.ts sorgt dafuer, dass sie an
 * jeder erreichbaren Ecke erfuellt ist. Sie steht hier als Zusicherung, nicht
 * als Einschraenkung.
 */
export function vertexBuildable(world: World, v: Vertex): boolean {
  const hexes = vertexAdjacentHexes(v);
  if (!hexes.every((h) => isGenerated(world, h.q, h.r))) return false;
  return hexes.some((h) => isLand(world, h.q, h.r));
}

/** Eine Kante traegt eine Strasse, wenn sie an mindestens ein Landfeld grenzt. */
export function edgeBuildable(world: World, e: Edge): boolean {
  const hexes = edgeAdjacentHexes(e);
  if (!hexes.every((h) => isGenerated(world, h.q, h.r))) return false;
  return hexes.some((h) => isLand(world, h.q, h.r));
}

/** Abstandsregel: an den drei Nachbarecken darf nichts stehen. */
function distanceRuleOk(state: BoardView, v: Vertex): boolean {
  return vertexNeighborVertices(v).every((n) => state.buildings[vertexKey(n)] === undefined);
}

/**
 * Laeuft an dieser Ecke eine eigene Verbindung zusammen?
 *
 * Eine fremde Siedlung unterbricht die eigene Strasse - das ist die klassische
 * Blockaderegel und der Grund, warum hier nicht einfach nach Strassen gesucht wird.
 */
function connectsAt(state: BoardView, player: PlayerId, v: Vertex): boolean {
  const b = state.buildings[vertexKey(v)];
  if (b !== undefined) return b.owner === player;
  return vertexAdjacentEdges(v).some((e) => state.roads[edgeKey(e)] === player);
}

export function canPlaceSettlement(
  state: BoardView,
  world: World,
  player: PlayerId,
  vk: string,
  opts: { setup: boolean },
): string | null {
  const v = parseVertexKey(vk);
  if (state.buildings[vk] !== undefined) return 'Dort steht schon etwas.';
  if (!vertexBuildable(world, v)) return 'Dort laesst sich nicht bauen.';
  if (!distanceRuleOk(state, v)) return 'Zu nah an einer anderen Siedlung.';
  if (!opts.setup) {
    const touchesOwnRoad = vertexAdjacentEdges(v).some(
      (e) => state.roads[edgeKey(e)] === player,
    );
    if (!touchesOwnRoad) return 'Keine eigene Strasse an dieser Ecke.';
  }
  return null;
}

export function canPlaceRoad(
  state: BoardView,
  world: World,
  player: PlayerId,
  ek: string,
  /** Im Aufbau muss die Strasse an der eben gesetzten Siedlung haengen. */
  mustTouchVertex?: string,
): string | null {
  const e = parseEdgeKey(ek);
  if (state.roads[ek] !== undefined) return 'Dort liegt schon eine Strasse.';
  if (!edgeBuildable(world, e)) return 'Dort laesst sich keine Strasse bauen.';
  const ends = edgeEndpoints(e);
  if (mustTouchVertex !== undefined) {
    return ends.some((v) => vertexKey(v) === mustTouchVertex)
      ? null
      : 'Die Strasse muss an der neuen Siedlung anliegen.';
  }
  if (!ends.some((v) => connectsAt(state, player, v))) {
    return 'Keine Verbindung zum eigenen Strassennetz.';
  }
  return null;
}

export function canPlaceCity(
  state: BoardView,
  player: PlayerId,
  vk: string,
): string | null {
  const b = state.buildings[vk];
  if (b === undefined) return 'Dort steht keine Siedlung.';
  if (b.owner !== player) return 'Das ist nicht deine Siedlung.';
  if (b.type === 'city') return 'Dort steht schon eine Stadt.';
  return null;
}

// --- Aufzaehlung fuer die Oberflaeche ---------------------------------------

/** Alle Ecken der aufgedeckten Welt - Grundlage der Zuege im Aufbau. */
function allVertices(world: World): Vertex[] {
  const seen = new Set<string>();
  const out: Vertex[] = [];
  for (const t of world.tiles.values()) {
    for (const v of hexVertices(t.q, t.r)) {
      const k = vertexKey(v);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

function allEdges(world: World): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const t of world.tiles.values()) {
    for (const e of hexEdges(t.q, t.r)) {
      const k = edgeKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
  }
  return out;
}

export function legalSettlementVertices(
  state: BoardView,
  world: World,
  player: PlayerId,
  opts: { setup: boolean },
): string[] {
  return allVertices(world)
    .map(vertexKey)
    .filter((vk) => canPlaceSettlement(state, world, player, vk, opts) === null);
}

export function legalRoadEdges(
  state: BoardView,
  world: World,
  player: PlayerId,
  mustTouchVertex?: string,
): string[] {
  return allEdges(world)
    .map(edgeKey)
    .filter((ek) => canPlaceRoad(state, world, player, ek, mustTouchVertex) === null);
}

export function legalCityVertices(state: BoardView, player: PlayerId): string[] {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.owner === player && b.type === 'settlement')
    .map(([vk]) => vk);
}
