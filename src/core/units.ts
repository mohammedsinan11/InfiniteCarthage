/**
 * Einheiten: wohin der Weg fuehrt, was man sieht, wer in den Lagern haust.
 *
 * Reine Hilfen ohne Zustandsaenderung. Die Regeln, nach denen Einheiten ziehen,
 * kaempfen und pluendern, stehen in rules/army.ts. Hier liegt, was auch der
 * Client braucht - Wege fuer Befehle, Sicht fuer den Nebel, Besatzungen fuer
 * die Anzeige - und was deshalb mit der redigierten Sicht auskommen muss.
 */

import { hash3i } from './hash';
import {
  hexDistance,
  hexKey,
  hexesInRange,
  neighbors,
  parseVertexKey,
  vertexAdjacentHexes,
} from './coords';
import { nestAt } from './raiders';
import { terrainAt } from './worldgen';
import type { Hex } from './coords';
import type { GameState, PlayerId, UnitKind, UnitState } from './state';

export type { UnitKind };
export type Unit = UnitState;

/** Was die Heeresrechnung vom Spielstand braucht - die redigierte Sicht genuegt. */
export type ArmyView = Pick<
  GameState,
  'worldSeed' | 'buildings' | 'units' | 'destroyedNests' | 'nestGarrison'
>;

const SALT_LAGER = 73;

/** Wie weit man um eine Siedlung sieht. */
export const SICHT_SIEDLUNG = 3;
/** Wie weit eine Einheit sieht. */
export const SICHT_EINHEIT = 2;

/**
 * Wer ein Lager bewohnt.
 *
 * Etwa jedes dritte ist ein Goblinlager. Fuer die Regeln ist das gleich, aber
 * die Karte bekommt zwei Gegner statt eines. Rein: dasselbe Lager hat immer
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

/**
 * Ist hier Land? Gemerkt, weil die Wegsuche es tausendfach fragt - und
 * terrainAt ist seit dem Kleckspass nicht mehr billig.
 */
const LAND_MAX = 80000;
let landSeed = Number.NaN;
const landCache = new Map<string, boolean>();

export function isLandAt(seed: number, q: number, r: number): boolean {
  if (seed !== landSeed) {
    landCache.clear();
    landSeed = seed;
  }
  const k = hexKey(q, r);
  const da = landCache.get(k);
  if (da !== undefined) return da;
  const v = terrainAt(seed, q, r) !== 'water';
  if (landCache.size >= LAND_MAX) landCache.clear();
  landCache.set(k, v);
  return v;
}

/** Steht hier ein Lager, das noch nicht zerstoert ist? */
export function isNestActive(
  view: Pick<GameState, 'worldSeed' | 'destroyedNests'>,
  q: number,
  r: number,
): boolean {
  return nestAt(view.worldSeed, q, r) && !view.destroyedNests.includes(hexKey(q, r));
}

/** Wie viele Verteidiger ein Lager noch hat. */
export function garrisonOf(
  view: Pick<GameState, 'worldSeed' | 'nestGarrison'>,
  q: number,
  r: number,
): number {
  const rest = view.nestGarrison[hexKey(q, r)];
  return rest ?? nestOccupants(view.worldSeed, q, r).count;
}

/**
 * Die Besatzung aktiver Lager unter den Feldern - nur zur Anzeige. Diese
 * Figuren sind keine Einheiten im Spielstand, deshalb die Nummer -1.
 */
export function garrisonUnits(view: ArmyView, hexes: Iterable<Hex>): Unit[] {
  const out: Unit[] = [];
  for (const h of hexes) {
    if (!isNestActive(view, h.q, h.r)) continue;
    const kind = nestOccupants(view.worldSeed, h.q, h.r).kind;
    const n = garrisonOf(view, h.q, h.r);
    for (let i = 0; i < n; i++) {
      out.push({ id: -1, kind, owner: null, q: h.q, r: h.r, ziel: null, heimat: hexKey(h.q, h.r) });
    }
  }
  return out;
}

/**
 * Die Landfelder an Gebaeuden - wer dort steht, steht an einer Siedlung.
 * Schluessel des Feldes -> Besitzer. Beruehrt ein Feld Gebaeude mehrerer
 * Besitzer, gilt das erste nach Eckenschluessel, damit es reproduzierbar bleibt.
 */
export function settlementApproaches(
  view: Pick<GameState, 'worldSeed' | 'buildings'>,
  owner?: PlayerId,
): Map<string, PlayerId> {
  const out = new Map<string, PlayerId>();
  for (const vk of Object.keys(view.buildings).sort()) {
    const b = view.buildings[vk]!;
    if (owner !== undefined && b.owner !== owner) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) {
      if (!isLandAt(view.worldSeed, h.q, h.r)) continue;
      const k = hexKey(h.q, h.r);
      if (!out.has(k)) out.set(k, b.owner);
    }
  }
  return out;
}

export type Step = { step: Hex; ziel: Hex };

/**
 * Der naechste Schritt auf dem kuerzesten Landweg zu einem der Ziele.
 *
 * Breitensuche ueber Landfelder, begrenzt auf maxKnoten - auf einer Karte ohne
 * Rand darf keine Suche unbegrenzt laufen. Wasser ist unpassierbar. null, wenn
 * die Einheit schon an einem Ziel steht oder kein Weg in Reichweite liegt.
 */
export function nextStep(
  seed: number,
  from: Hex,
  ziele: ReadonlySet<string>,
  maxKnoten = 2500,
): Step | null {
  const start = hexKey(from.q, from.r);
  if (ziele.has(start)) return null;
  const herkunft = new Map<string, string>();
  herkunft.set(start, '');
  const warte: Hex[] = [{ q: from.q, r: from.r }];
  for (let i = 0; i < warte.length && herkunft.size <= maxKnoten; i++) {
    const h = warte[i]!;
    const hk = hexKey(h.q, h.r);
    for (const n of neighbors(h.q, h.r)) {
      const k = hexKey(n.q, n.r);
      if (herkunft.has(k)) continue;
      if (!isLandAt(seed, n.q, n.r)) continue;
      herkunft.set(k, hk);
      if (ziele.has(k)) {
        // Zurueck bis zu dem Feld, das direkt am Start liegt.
        let schritt = k;
        while (herkunft.get(schritt) !== start) schritt = herkunft.get(schritt)!;
        const [sq, sr] = schritt.split(':').map(Number);
        return { step: { q: sq!, r: sr! }, ziel: { q: n.q, r: n.r } };
      }
      warte.push(n);
    }
  }
  return null;
}

/** Wie weit ein neuer Ritter nach Gefahr Ausschau haelt. */
const AUSSCHAU = 8;

/**
 * Wo ein neuer Ritter antritt: an einer eigenen Siedlung, auf der Seite, von
 * der das naechste aktive Lager droht. null ohne Siedlung.
 */
export function knightMusterHex(view: ArmyView, id: PlayerId): Hex | null {
  const felder = [...settlementApproaches(view, id).keys()]
    .map((k) => {
      const [q, r] = k.split(':').map(Number);
      return { q: q!, r: r! };
    })
    .filter((h) => !isNestActive(view, h.q, h.r));
  if (felder.length === 0) return null;
  const gefahr = (h: Hex): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const c of hexesInRange(h, AUSSCHAU)) {
      if (isNestActive(view, c.q, c.r)) best = Math.min(best, hexDistance(h, c));
    }
    return best;
  };
  return felder
    .map((h) => ({ h, d: gefahr(h) }))
    .sort((a, b) => a.d - b.d || a.h.q - b.h.q || a.h.r - b.h.r)[0]!.h;
}

/**
 * Was ein Spieler gerade sieht: rund um seine Siedlungen und seine Einheiten.
 *
 * Nebel ist Anschauung, keine Geheimhaltung - die Karte folgt ohnehin aus dem
 * oeffentlichen Seed. Er zeigt, wo man gerade hinsieht und wo nicht, und
 * verbirgt dort fremde Einheiten.
 */
export function sightOf(
  view: Pick<GameState, 'buildings' | 'units'>,
  id: PlayerId,
): Set<string> {
  const out = new Set<string>();
  const dazu = (h: Hex, radius: number) => {
    for (const c of hexesInRange(h, radius)) out.add(hexKey(c.q, c.r));
  };
  for (const [vk, b] of Object.entries(view.buildings)) {
    if (b.owner !== id) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) dazu(h, SICHT_SIEDLUNG);
  }
  for (const u of view.units) if (u.owner === id) dazu(u, SICHT_EINHEIT);
  return out;
}
