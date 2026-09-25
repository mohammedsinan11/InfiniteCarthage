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
  hexKey,
  hexVertices,
  hexesInRange,
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
export type BoardView = Pick<GameState, 'buildings' | 'roads'> & {
  /** Wachtuerme - optional, damit aeltere Staende und Teilsichten weiter passen. */
  tuerme?: GameState['tuerme'];
  /** Palisade - optional, aus demselben Grund. */
  mauern?: GameState['mauern'];
};

/**
 * Wie weit der Einflussbereich um ein eigenes Bauteil reicht, in Hex-Abstand
 * von seinen Nachbarfeldern aus. Eine Stadt zieht am weitesten, eine Strasse
 * nur ihre eigenen Nachbarfelder.
 */
const EINFLUSS_STADT = 3;
const EINFLUSS_DORF = 2;
const EINFLUSS_TURM = 2;
const EINFLUSS_STRASSE = 1;

/**
 * Alle Felder im eigenen Einflussbereich - dort, wo ausserhalb der eigenen
 * Strassen noch gebaut werden darf (Wachturm, Palisade). Dieselbe Bauform wie
 * sightOf (core/units.ts): je eigenem Bauteil ein Ring um seine Nachbarfelder,
 * alles zusammen ein Feldschluessel-Set.
 *
 * Absichtlich keine eigene Fassung je Aufrufer: legalTowerVertices und
 * legalMauerEdges brauchen dasselbe Set fuer viele Ecken/Kanten hintereinander
 * und berechnen es deshalb einmal vorab, statt es in canPlaceTower/canPlaceMauer
 * bei jedem einzelnen Aufruf neu aufzubauen.
 */
export function einflussFelder(state: BoardView, player: PlayerId): Set<string> {
  const out = new Set<string>();
  const dazu = (hexes: readonly { q: number; r: number }[], radius: number) => {
    for (const h of hexes) for (const c of hexesInRange(h, radius)) out.add(hexKey(c.q, c.r));
  };
  for (const [vk, b] of Object.entries(state.buildings)) {
    if (b.owner !== player) continue;
    dazu(vertexAdjacentHexes(parseVertexKey(vk)), b.type === 'city' ? EINFLUSS_STADT : EINFLUSS_DORF);
  }
  for (const [vk, t] of Object.entries(state.tuerme ?? {})) {
    if (t.owner !== player) continue;
    dazu(vertexAdjacentHexes(parseVertexKey(vk)), EINFLUSS_TURM);
  }
  for (const [ek, owner] of Object.entries(state.roads)) {
    if (owner !== player) continue;
    dazu(edgeAdjacentHexes(parseEdgeKey(ek)), EINFLUSS_STRASSE);
  }
  return out;
}

/** Beruehrt diese Ecke ein Feld im Einflussbereich? */
export function vertexInEinfluss(felder: ReadonlySet<string>, v: Vertex): boolean {
  return vertexAdjacentHexes(v).some((h) => felder.has(hexKey(h.q, h.r)));
}

/** Beruehrt diese Kante ein Feld im Einflussbereich? */
export function edgeInEinfluss(felder: ReadonlySet<string>, e: Edge): boolean {
  return edgeAdjacentHexes(e).some((h) => felder.has(hexKey(h.q, h.r)));
}

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

/**
 * Ein Wachturm steht fuer sich - auf einer freien Ecke wie ein Dorf, nur ohne
 * Abstandsregel: er darf dicht an Doerfern, Staedten und anderen Tuermen
 * stehen. Erreicht werden muss er entweder von einer eigenen Strasse aus,
 * oder er liegt im eigenen Einflussbereich (einflussFelder) - Tuerme muessen
 * nicht mehr zwingend an der Strasse kleben, sondern duerfen die Grenze des
 * Reichs selbst markieren. Ein Turm erweitert seinerseits den Einflussbereich,
 * ein naechster darf sich also an ihm entlanghangeln.
 *
 * einfluss: vorab berechnetes einflussFelder(state, player), fuer
 * legalTowerVertices - sonst wird es hier einmalig berechnet.
 */
export function canPlaceTower(
  state: BoardView,
  world: World,
  player: PlayerId,
  vk: string,
  einfluss?: ReadonlySet<string>,
): string | null {
  const v = parseVertexKey(vk);
  if (state.buildings[vk] !== undefined) return 'Dort steht schon ein Haus.';
  if (state.tuerme?.[vk] !== undefined) return 'Dort steht schon ein Wachturm.';
  if (!vertexBuildable(world, v)) return 'Dort laesst sich nicht bauen.';
  const anStrasse = vertexAdjacentEdges(v).some((e) => state.roads[edgeKey(e)] === player);
  if (anStrasse) return null;
  const felder = einfluss ?? einflussFelder(state, player);
  if (!vertexInEinfluss(felder, v)) {
    return 'Weder eigene Strasse noch eigener Einflussbereich an dieser Ecke.';
  }
  return null;
}

/**
 * Ein Stueck Palisade auf einer eigenen Kante - Wand oder Tor, dieselbe Regel
 * fuer beide. Anders als eine Strasse muss sie nicht an das eigene Netz
 * anschliessen: sie darf ueberall im eigenen Einflussbereich stehen, auch
 * einzeln vorab, bevor der Ring geschlossen ist.
 */
export function canPlaceMauer(
  state: BoardView,
  world: World,
  player: PlayerId,
  ek: string,
  einfluss?: ReadonlySet<string>,
): string | null {
  const e = parseEdgeKey(ek);
  if (state.roads[ek] !== undefined) return 'Dort verlaeuft schon eine Strasse.';
  if (state.mauern?.[ek] !== undefined) return 'Dort steht schon eine Palisade.';
  if (!edgeBuildable(world, e)) return 'Dort laesst sich nicht bauen.';
  const felder = einfluss ?? einflussFelder(state, player);
  if (!edgeInEinfluss(felder, e)) return 'Das liegt ausserhalb deines Einflussbereichs.';
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

export function legalTowerVertices(state: BoardView, world: World, player: PlayerId): string[] {
  const felder = einflussFelder(state, player);
  return allVertices(world)
    .map(vertexKey)
    .filter((vk) => canPlaceTower(state, world, player, vk, felder) === null);
}

export function legalMauerEdges(state: BoardView, world: World, player: PlayerId): string[] {
  const felder = einflussFelder(state, player);
  return allEdges(world)
    .map(edgeKey)
    .filter((ek) => canPlaceMauer(state, world, player, ek, felder) === null);
}

export function legalCityVertices(state: BoardView, player: PlayerId): string[] {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.owner === player && b.type === 'settlement')
    .map(([vk]) => vk);
}
