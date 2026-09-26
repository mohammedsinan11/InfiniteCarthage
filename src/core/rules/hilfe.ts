/**
 * Mangelhilfe: wer eine Sorte gar nicht erzeugt, bekommt sie ab und zu.
 *
 * Im ersten Testspiel (REPLAYABILITY.md, P1) lag an keiner Siedlung ein Wald -
 * sechzig Runden lang kein Holz, jede Strasse ein 4:1-Tausch. Fuer Einsteiger
 * ist das eine Sackgasse, aus der sie nicht wissen, wie sie herauskommen: die
 * Partie fuehlt sich verloren an, bevor sie begonnen hat.
 *
 * Die Hilfe ist bewusst klein: zu Beginn jeder grossen Runde (alle fuenf
 * Runden) eine Karte einer Sorte, fuer die kein eigenes Gebaeude an einem
 * liefernden Feld steht. Fehlen mehrere, wechselt sie reihum. Wer alles
 * erzeugt, bekommt nichts - sie ersetzt keinen guten Bauplatz, sie verhindert
 * nur den Stillstand.
 *
 * Rein aus Spielstand und Welt, ohne Zufall.
 */

import { hexVertices, vertexKey } from '../coords';
import type { World } from '../world';
import { RESOURCES, TERRAIN_RESOURCE } from '../types';
import type { Resource } from '../types';
import type { GameState, PlayerId } from '../state';
import { bigRoundOf } from '../season';

export type HilfeEvent = {
  t: 'aid';
  player: PlayerId;
  resource: Resource;
  /** 'durst': nach mehreren Wuerfen ohne Ertrag (durstLindern). Fehlt: Mangelhilfe. */
  grund?: 'durst';
};

type Ereignisse = { push(...e: HilfeEvent[]): number };

/** Welche Sorten die Gebaeude dieses Spielers ueberhaupt erzeugen koennen. */
export function erzeugteSorten(
  state: Pick<GameState, 'buildings'>,
  world: World,
  id: PlayerId,
): Set<Resource> {
  const out = new Set<Resource>();
  for (const tile of world.tiles.values()) {
    if (tile.number === null || tile.number === undefined) continue;
    const res = TERRAIN_RESOURCE[tile.terrain];
    if (res === null || out.has(res)) continue;
    for (const v of hexVertices(tile.q, tile.r)) {
      if (state.buildings[vertexKey(v)]?.owner === id) {
        out.add(res);
        break;
      }
    }
  }
  return out;
}

/** Was diesem Spieler fehlt, in fester Reihenfolge. */
export function fehlendeSorten(state: Pick<GameState, 'buildings'>, world: World, id: PlayerId): Resource[] {
  const da = erzeugteSorten(state, world, id);
  return RESOURCES.filter((r) => !da.has(r));
}

/** Zu Beginn jeder grossen Runde: je Spieler eine fehlende Sorte. */
export function mangelHilfe(s: GameState, world: World, events: Ereignisse): void {
  const runde = bigRoundOf(s.turn);
  for (const p of s.players) {
    if (p.besiegt) continue;
    if (!Object.values(s.buildings).some((b) => b.owner === p.id)) continue;
    const fehlt = fehlendeSorten(s, world, p.id);
    if (fehlt.length === 0) continue;
    const r = fehlt[runde % fehlt.length]!;
    p.hand[r] += 1;
    events.push({ t: 'aid', player: p.id, resource: r });
  }
}

/**
 * Durststrecke: so viele Wuerfe in Folge ohne jeden Ertrag, dann hilft ein
 * Nachbar mit einer Karte (Spieltest: zu viele leere Zuege am Stueck).
 */
export const DURST_GRENZE = 4;

/**
 * Nach jedem Wurf ausser der 7: wer nichts bekam, zaehlt weiter; bei der Grenze
 * gibt es eine Karte der Sorte, von der man am wenigsten hat. Nur in Partien mit
 * Ereignissen (die neuen Raeume) - alte Staende und Tests bleiben, wie sie waren.
 */
export function durstLindern(
  s: GameState,
  payout: Record<PlayerId, Record<Resource, number>>,
  events: Ereignisse,
): void {
  if (!s.ereignisseAn) return;
  const durst = { ...(s.durst ?? {}) };
  for (const p of s.players) {
    if (p.besiegt) continue;
    if (!Object.values(s.buildings).some((b) => b.owner === p.id)) continue;
    const bekam = payout[p.id] ? RESOURCES.reduce((n, r) => n + (payout[p.id]![r] ?? 0), 0) : 0;
    if (bekam > 0) {
      durst[p.id] = 0;
      continue;
    }
    durst[p.id] = (durst[p.id] ?? 0) + 1;
    if (durst[p.id]! < DURST_GRENZE) continue;
    const r = RESOURCES.reduce((a, b) => (p.hand[b] < p.hand[a] ? b : a));
    p.hand[r] += 1;
    durst[p.id] = 0;
    events.push({ t: 'aid', player: p.id, resource: r, grund: 'durst' });
  }
  s.durst = durst;
}
