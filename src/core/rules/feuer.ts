/**
 * Feuer: gelegt, geloescht, abgebrannt.
 *
 * Nach einer Pluenderung wuerfelt der Pluenderer (feuerLegen):
 *
 *   1-3  nichts weiter
 *   4-5  eine Strasse des Spielers an diesem Feld faengt Feuer
 *   6    ein Gebaeude an diesem Feld - ausser dem letzten Gebaeude des
 *        Spielers; dann trifft es eine Strasse
 *
 * Frueher brannte es sofort nieder. Jetzt BRENNT es erst: das Feuer steht auf
 * der Karte, bis sein Besitzer einen eigenen Zug hinter sich hat (brandRunde).
 * In diesem Zug laesst es sich loeschen:
 *
 *   - mit einer Karte: eine beliebige Rohstoffkarte (putOut im Reducer)
 *   - mit einem Ritter oder dem Helden des Besitzers auf einem Feld daneben,
 *     der nicht gerade kaempft - er loescht von selbst
 *   - vom Regen: bei Regen und Gewitter geht jedes Feuer aus (core/zeit.ts)
 *
 * Wer nicht loescht, verliert: die Strasse brennt ab und hinterlaesst Asche -
 * dort baut ihr frueherer Besitzer sie fuer ein Holz wieder auf -, die Stadt
 * brennt zum Dorf herunter, das Dorf nieder.
 *
 * WACHTUERME. Ein Dorf oder eine Stadt mit Wachturm faengt kein Feuer, ebenso
 * die Strassen, die an dieser Ecke enden. Die Waechter sehen die Brandstifter
 * kommen. Findet ein Pluenderer nur Geschuetztes, meldet das burnPrevented.
 *
 * FESTUNGSRING. Ab Stufe II ist der Ring einer Hauptstadt Mauer: seine sechs
 * Strassen brennen nicht, und die Bastionen an seinen Ecken fangen kein Feuer
 * (rules/hauptstadt.ts, festungsSchutz).
 *
 * Das letzte Gebaeude eines Spielers brennt nie nieder: ohne Siedlung kann kein
 * Ritter mehr antreten und nichts mehr wachsen - ein Ueberfall soll schmerzen,
 * nicht die Partie beenden.
 */

import type { Rng } from '../rng';
import {
  edgeAdjacentHexes,
  edgeEndpoints,
  edgeKey,
  hexEdges,
  hexVertices,
  parseEdgeKey,
  parseVertexKey,
  vertexAdjacentHexes,
  vertexKey,
  vertexNeighborVertices,
} from '../coords';
import type { Hex } from '../coords';
import { imKampf } from '../combat';
import { regnet, wetterOf } from '../zeit';
import { playerById } from '../state';
import { festungsSchutz } from './hauptstadt';
import type { Brand, GameState, PlayerId, UnitState } from '../state';
import { RESOURCES } from '../types';
import type { Resource } from '../types';

/** Ab diesem Wurf legt ein Pluenderer Feuer an eine Strasse. */
export const BRAND_STRASSE_AB = 4;
/** Ab diesem Wurf trifft das Feuer ein Gebaeude. */
export const BRAND_GEBAEUDE_AB = 6;

type Basis = { player: PlayerId; key: string; art: Brand['art']; q: number; r: number };

export type FeuerEvent =
  | ({ t: 'burn'; fraktion: string } & Basis)
  | { t: 'burnPrevented'; player: PlayerId; fraktion: string; q: number; r: number }
  | ({
      t: 'extinguished';
      /** verschont: das letzte Gebaeude eines Spielers brennt nicht nieder. */
      durch: 'karte' | 'ritter' | 'bogen' | 'held' | 'regen' | 'verschont';
    } & Basis)
  | ({ t: 'burnedDown'; fraktion: string } & Basis);

type Ereignisse = { push(...e: FeuerEvent[]): number };

/** Brennt es hier? */
export const brennt = (s: Pick<GameState, 'braende'>, key: string): boolean =>
  s.braende.some((b) => b.key === key);

/** Was die Brandregeln von Tuermen wissen muessen. */
type TurmSicht = { tuerme?: GameState['tuerme'] };

/** Steht auf dieser Ecke ein Wachturm dieses Spielers? */
const turmAn = (s: TurmSicht, owner: PlayerId, vk: string): boolean => s.tuerme?.[vk]?.owner === owner;

/**
 * Steht ein eigener Wachturm an einer der drei Nachbarecken? Seit er fuer sich
 * steht (state.tuerme), schuetzt er die Haeuser um sich herum statt das eine,
 * an dem er frueher klebte.
 */
const turmNeben = (s: TurmSicht, owner: PlayerId, vk: string): boolean =>
  vertexNeighborVertices(parseVertexKey(vk)).some((v) => turmAn(s, owner, vertexKey(v)));

/** Schuetzt ein Wachturm diese Strasse - endet sie an seiner Ecke? Oder ist sie Mauer eines Festungsrings? */
export function strasseGeschuetzt(
  s: Pick<GameState, 'buildings'> & { hauptstaedte?: GameState['hauptstaedte'] } & TurmSicht,
  owner: PlayerId,
  ek: string,
): boolean {
  if (festungsSchutz(s, owner).kanten.has(ek)) return true;
  return edgeEndpoints(parseEdgeKey(ek)).some((v) => turmAn(s, owner, vertexKey(v)));
}

/** Von diesen Feldern aus laesst sich ein Feuer loeschen. */
export function loeschFelder(b: Pick<Brand, 'art' | 'key'>): Hex[] {
  return b.art === 'strasse'
    ? edgeAdjacentHexes(parseEdgeKey(b.key))
    : vertexAdjacentHexes(parseVertexKey(b.key));
}

/** Nach einer Pluenderung: legt der Pluenderer Feuer? */
export function feuerLegen(
  s: GameState,
  rng: Rng,
  u: UnitState,
  owner: PlayerId,
  events: Ereignisse,
): void {
  const wurf = 1 + rng.int(6);
  if (wurf < BRAND_STRASSE_AB) return;
  const fraktion = u.fraktion ?? '';
  const legen = (key: string, art: Brand['art']) => {
    s.braende.push({ key, art, owner, fraktion, q: u.q, r: u.r, seit: s.turn });
    events.push({ t: 'burn', player: owner, fraktion, q: u.q, r: u.r, art, key });
  };
  let abgewehrt = false;

  if (wurf >= BRAND_GEBAEUDE_AB) {
    const gebaeude = Object.values(s.buildings).filter((b) => b.owner === owner).length;
    const ecken = hexVertices(u.q, u.r)
      .map(vertexKey)
      .filter((vk) => {
        const b = s.buildings[vk];
        return b !== undefined && b.owner === owner && !brennt(s, vk) && (b.type === 'city' || gebaeude > 1);
      })
      .sort();
    const bastionen = festungsSchutz(s, owner).ecken;
    const offen = ecken.filter((vk) => !turmNeben(s, owner, vk) && !bastionen.has(vk));
    if (offen.length > 0) {
      const vk = offen[rng.int(offen.length)]!;
      legen(vk, s.buildings[vk]!.type === 'city' ? 'stadt' : 'dorf');
      return;
    }
    if (ecken.length > 0) abgewehrt = true;
  }

  const kanten = hexEdges(u.q, u.r)
    .map(edgeKey)
    .filter((ek) => s.roads[ek] === owner && !brennt(s, ek))
    .sort();
  const offen = kanten.filter((ek) => !strasseGeschuetzt(s, owner, ek));
  if (offen.length > 0) {
    legen(offen[rng.int(offen.length)]!, 'strasse');
    return;
  }
  if (kanten.length > 0) abgewehrt = true;
  if (abgewehrt) events.push({ t: 'burnPrevented', player: owner, fraktion, q: u.q, r: u.r });
}

/** Steht noch, was da brennt? Sonst ist das Feuer gegenstandslos. */
function stehtNoch(s: GameState, b: Brand): boolean {
  if (b.art === 'strasse') return s.roads[b.key] === b.owner;
  const g = s.buildings[b.key];
  return g !== undefined && g.owner === b.owner && g.type === (b.art === 'stadt' ? 'city' : 'settlement');
}

const basis = (b: Brand): Basis => ({ player: b.owner, key: b.key, art: b.art, q: b.q, r: b.r });

function abbrennen(s: GameState, b: Brand, events: Ereignisse): void {
  if (b.art === 'strasse') {
    delete s.roads[b.key];
    s.asche[b.key] = b.owner;
  } else if (b.art === 'stadt') {
    s.buildings[b.key]!.type = 'settlement';
  } else {
    const gebaeude = Object.values(s.buildings).filter((g) => g.owner === b.owner).length;
    if (gebaeude <= 1) {
      events.push({ t: 'extinguished', ...basis(b), durch: 'verschont' });
      return;
    }
    delete s.buildings[b.key];
  }
  events.push({ t: 'burnedDown', ...basis(b), fraktion: b.fraktion });
}

/**
 * Nach jeder Runde des Heeres: Regen und Helfer loeschen, und was der Besitzer
 * einen ganzen eigenen Zug lang hat brennen lassen, brennt ab.
 *
 * ender ist der Spieler, dessen Zug gerade endete, beendet dessen Zugnummer.
 * Ein Feuer von Zug t brennt also ab, sobald sein Besitzer einen Zug >= t
 * beendet - allein am Ende des naechsten Zugs, zu mehreren am Ende des
 * naechsten eigenen. Wer es gelegt bekommt, hat immer genau einen Zug.
 */
export function brandRunde(s: GameState, ender: PlayerId, beendet: number, events: Ereignisse): void {
  if (s.braende.length === 0) return;
  const nass = regnet(wetterOf(s.worldSeed, s.turn));
  const rest: Brand[] = [];
  for (const b of s.braende) {
    if (!stehtNoch(s, b)) continue;
    if (nass) {
      events.push({ t: 'extinguished', ...basis(b), durch: 'regen' });
      continue;
    }
    const felder = loeschFelder(b);
    const helfer = s.units
      .filter(
        (u) =>
          u.owner === b.owner &&
          (u.kind === 'ritter' || u.kind === 'bogen' || u.kind === 'held') &&
          felder.some((h) => h.q === u.q && h.r === u.r) &&
          !imKampf(s, u),
      )
      .sort((x, y) => x.id - y.id)[0];
    if (helfer) {
      events.push({ t: 'extinguished', ...basis(b), durch: helfer.kind === 'held' ? 'held' : helfer.kind === 'bogen' ? 'bogen' : 'ritter' });
      continue;
    }
    if (b.owner === ender && b.seit <= beendet) {
      abbrennen(s, b, events);
      continue;
    }
    rest.push(b);
  }
  s.braende = rest;
}

/** Ein Feuer mit einer Rohstoffkarte loeschen. null bei Erfolg, sonst der Grund. */
export function mitKarteLoeschen(
  s: GameState,
  actor: PlayerId,
  key: string,
  mit: Resource,
  events: Ereignisse,
): string | null {
  const b = s.braende.find((x) => x.key === key);
  if (!b) return 'Dort brennt nichts.';
  if (b.owner !== actor) return 'Das ist nicht dein Feuer.';
  if (!(RESOURCES as readonly string[]).includes(mit)) return 'Unbekannter Rohstoff.';
  const p = playerById(s, actor);
  if (!p || p.hand[mit] < 1) return 'Dafuer fehlt dir die Karte.';
  p.hand[mit] -= 1;
  s.braende = s.braende.filter((x) => x !== b);
  events.push({ t: 'extinguished', ...basis(b), durch: 'karte' });
  return null;
}
