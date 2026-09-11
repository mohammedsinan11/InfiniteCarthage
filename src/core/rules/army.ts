/**
 * Das Heer: Ritter, Raubzuege, Gefechte, Belagerungen und Ruinen.
 *
 * Alles geschieht im Takt der Runde. Bei jedem Zugende (endTurn) zieht jede
 * Einheit mit Ziel genau ein Feld. Frueher griffen Lager aus der Ferne zu,
 * sobald man in ihrer Naehe baute. Jetzt ziehen Raeuber sichtbar ueber die
 * Karte, und die Pluenderung wirkt erst, wenn sie eine Siedlung erreichen - wer
 * sie kommen sieht, kann sich wappnen.
 *
 * REIHENFOLGE JE RUNDE
 *   1. Ritter ziehen - und erkunden Ruinen, auf denen sie stehen.
 *   2. Raeuber und Goblins ziehen zur naechsten Siedlung.
 *   3. Gefechte: wer einem Ritter auf dessen Feld oder ein Nachbarfeld kommt,
 *      wird gestellt. Jeder Ritter kaempft hoechstens einmal je Runde.
 *   4. Pluenderung: wer noch steht und an einer Siedlung angekommen ist,
 *      pluendert und zieht mit der Beute ab.
 *   5. Belagerung: Ritter auf einem Lager kaempfen gegen seine Besatzung. Faellt
 *      der letzte Verteidiger, ist das Lager zerstoert, und es gibt Beute.
 *
 * WUERFEL. Gefechte, Belagerungen und Ruinen werden gewuerfelt - aus dem
 * rngState, wie der Ertrag: auf dem Server und nicht vorhersagbar.
 *   Gefecht:     der Ritter siegt ab 3 (zwei Drittel), sonst faellt er.
 *   Belagerung:  jeder Ritter trifft ab 4, jeder Verteidiger ab 6.
 *
 * ZU MEHREREN ist die Runde der Spielerzug (state.turn), wie ueberall im Spiel.
 * Zu viert ziehen Einheiten also viermal, bis man selbst wieder dran ist.
 */

import { Rng } from '../rng';
import { hexDistance, hexKey, hexesInRange } from '../coords';
import { ensureGenerated } from '../world';
import type { World } from '../world';
import type { ChunkCoord } from '../chunks';
import { ruinAt, ruinResultFor } from '../ruins';
import type { RuinResult } from '../ruins';
import { RESOURCES } from '../types';
import { emptyHand, playerById } from '../state';
import type { GameState, Hand, PlayerId, UnitState } from '../state';
import {
  garrisonOf,
  isNestActive,
  knightMusterHex,
  nestOccupants,
  nextStep,
  settlementApproaches,
} from '../units';
import { raidLoss, takeFromLargest } from './raid';
import { roundOf } from '../season';

/** Lager bis zu dieser Entfernung von einer Siedlung schicken Raubzuege. */
export const SPAWN_RANGE = 10;
/** Ab diesem Wurf siegt ein Ritter im Gefecht. */
export const RITTER_SIEGT_AB = 3;
/** Ab diesem Wurf trifft ein Ritter bei der Belagerung. */
export const BELAGERER_TRIFFT_AB = 4;
/** Ab diesem Wurf trifft ein Verteidiger den Belagerer. */
export const VERTEIDIGER_TRIFFT_AB = 6;
/** Wie weit eine alte Karte aus einer Ruine aufdeckt. */
export const KARTE_RADIUS = 8;
/** Wie weit ein Ritter beim Ziehen aufdeckt - wie beim Bauen. */
const ERKUNDUNG_RADIUS = 3;

const SUCHE_RITTER = 2500;
const SUCHE_RAEUBER = 900;

type Feind = 'raeuber' | 'goblin';

export type ArmyEvent =
  | { t: 'knightReady'; player: PlayerId; unit: number; q: number; r: number }
  | { t: 'march'; round: number; parties: { q: number; r: number; kind: Feind }[] }
  | {
      t: 'fight';
      q: number;
      r: number;
      owner: PlayerId | null;
      foe: Feind;
      roll: number;
      knightWon: boolean;
    }
  | {
      t: 'plunder';
      round: number;
      player: PlayerId;
      kind: Feind;
      q: number;
      r: number;
      /** Was genommen wurde. Fuer Fremde redigiert (redact.ts). */
      taken: Hand;
      count: number;
    }
  | {
      t: 'siege';
      q: number;
      r: number;
      owners: PlayerId[];
      hits: number;
      knightsLost: number;
      left: number;
    }
  | { t: 'nestDestroyed'; q: number; r: number; kind: Feind; players: PlayerId[] }
  | {
      t: 'ruin';
      q: number;
      r: number;
      player: PlayerId;
      result: RuinResult;
      gained: Hand;
      knightLost: boolean;
    }
  | { t: 'chunks'; coords: ChunkCoord[] };

/** Nimmt Heeresereignisse auf - ein GameEvent[] passt hinein. */
type Ereignisse = { push(...e: ArmyEvent[]): number };

const wurf = (rng: Rng): number => 1 + rng.int(6);

/** Welt um ein Feld wachsen lassen und die neuen Chunks melden - wie beim Bauen. */
function wachsen(
  s: GameState,
  world: World,
  h: { q: number; r: number },
  radius: number,
  events: Ereignisse,
): void {
  const neu = ensureGenerated(world, h, radius);
  if (neu.length === 0) return;
  s.chunks.push(...neu);
  events.push({ t: 'chunks', coords: neu });
}

/** Einen Ritter fuer diesen Spieler antreten lassen. null ohne Siedlung. */
export function spawnKnight(s: GameState, id: PlayerId, events: Ereignisse): UnitState | null {
  const feld = knightMusterHex(s, id);
  if (!feld) return null;
  const unit: UnitState = {
    id: s.nextUnitId++,
    kind: 'ritter',
    owner: id,
    q: feld.q,
    r: feld.r,
    ziel: null,
    heimat: null,
  };
  s.units.push(unit);
  events.push({ t: 'knightReady', player: id, unit: unit.id, q: unit.q, r: unit.r });
  return unit;
}

/**
 * Raubzuege losschicken - zum Beginn jeder grossen Runde.
 *
 * Jedes aktive Lager bis SPAWN_RANGE von einer Siedlung schickt einen Raubzug,
 * sofern keiner von dort schon unterwegs ist und ein Landweg existiert. Lager
 * weiter draussen bleiben ruhig: auf einer Karte ohne Rand wuerde sonst die
 * ganze Welt marschieren.
 */
export function sendRaiders(s: GameState, events: Ereignisse): void {
  const ziele = settlementApproaches(s);
  if (ziele.size === 0) return;
  const zielSet = new Set(ziele.keys());

  const lager = new Map<string, { q: number; r: number }>();
  for (const k of ziele.keys()) {
    const [q, r] = k.split(':').map(Number);
    for (const c of hexesInRange({ q: q!, r: r! }, SPAWN_RANGE)) {
      const ck = hexKey(c.q, c.r);
      if (lager.has(ck)) continue;
      if (isNestActive(s, c.q, c.r)) lager.set(ck, c);
    }
  }

  const unterwegs = new Set(
    s.units.map((u) => u.heimat).filter((h): h is string => h !== null),
  );
  const parties: { q: number; r: number; kind: Feind }[] = [];
  const sortiert = [...lager].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [k, nest] of sortiert) {
    if (unterwegs.has(k)) continue;
    const schonDa = zielSet.has(k);
    const weg = schonDa ? null : nextStep(s.worldSeed, nest, zielSet, SUCHE_RAEUBER);
    if (!weg && !schonDa) continue;
    const kind = nestOccupants(s.worldSeed, nest.q, nest.r).kind;
    s.units.push({
      id: s.nextUnitId++,
      kind,
      owner: null,
      q: nest.q,
      r: nest.r,
      ziel: weg ? weg.ziel : { q: nest.q, r: nest.r },
      heimat: k,
    });
    parties.push({ q: nest.q, r: nest.r, kind });
  }
  if (parties.length > 0) events.push({ t: 'march', round: roundOf(s.turn), parties });
}

/** Eine Ruine unter einem Ritter erkunden. */
function erkunde(
  s: GameState,
  world: World,
  rng: Rng,
  u: UnitState,
  events: Ereignisse,
): void {
  s.exploredRuins.push(hexKey(u.q, u.r));
  const owner = u.owner!;
  const p = playerById(s, owner);
  const result = ruinResultFor(wurf(rng));
  const gained = emptyHand();
  let knightLost = false;

  if (result === 'hinterhalt') {
    if (wurf(rng) < RITTER_SIEGT_AB) {
      s.units = s.units.filter((x) => x !== u);
      knightLost = true;
    }
  } else if (result === 'schatz' && p) {
    for (let i = 0; i < 3; i++) {
      const vorrat = RESOURCES.filter((r) => s.bank[r] > 0);
      if (vorrat.length === 0) break;
      const r = vorrat[rng.int(vorrat.length)]!;
      s.bank[r] -= 1;
      p.hand[r] += 1;
      gained[r] += 1;
    }
  } else if (result === 'beute' && p) {
    p.loot += 1;
  } else if (result === 'karte') {
    wachsen(s, world, u, KARTE_RADIUS, events);
  }
  events.push({ t: 'ruin', q: u.q, r: u.r, player: owner, result, gained, knightLost });
}

/** Eine Runde des Heeres. Aendert Einheiten, Haende, Bank, Lager und Welt. */
export function tickArmy(s: GameState, world: World, events: Ereignisse): void {
  if (s.units.length === 0) return;
  const rng = new Rng(s.rngState);
  const seed = s.worldSeed;

  // 1. Ritter ziehen und erkunden.
  for (const u of s.units.filter((x) => x.kind === 'ritter')) {
    if (!s.units.includes(u)) continue;
    if (u.ziel) {
      const zk = hexKey(u.ziel.q, u.ziel.r);
      const weg = nextStep(seed, u, new Set([zk]), SUCHE_RITTER);
      if (weg) {
        u.q = weg.step.q;
        u.r = weg.step.r;
        wachsen(s, world, u, ERKUNDUNG_RADIUS, events);
      }
      // Am Ziel oder ohne Weg: der Befehl ist erledigt.
      if (!weg || hexKey(u.q, u.r) === zk) u.ziel = null;
    }
    const k = hexKey(u.q, u.r);
    if (u.owner !== null && ruinAt(seed, u.q, u.r) && !s.exploredRuins.includes(k)) {
      erkunde(s, world, rng, u, events);
    }
  }

  // 2. Raeuber und Goblins ziehen zur naechsten Siedlung.
  const ziele = settlementApproaches(s);
  const zielSet = new Set(ziele.keys());
  if (zielSet.size > 0) {
    for (const u of s.units.filter((x) => x.kind !== 'ritter')) {
      const weg = nextStep(seed, u, zielSet, SUCHE_RAEUBER);
      if (weg) {
        u.q = weg.step.q;
        u.r = weg.step.r;
        u.ziel = weg.ziel;
      } else if (zielSet.has(hexKey(u.q, u.r))) {
        u.ziel = { q: u.q, r: u.r };
      }
    }
  }

  // 3. Gefechte: Ritter stellen, wer ihnen nahe kommt.
  const gefochten = new Set<number>();
  const feinde = s.units.filter((x) => x.kind !== 'ritter').sort((a, b) => a.id - b.id);
  for (const feind of feinde) {
    const ritter = s.units
      .filter((x) => x.kind === 'ritter' && !gefochten.has(x.id) && hexDistance(x, feind) <= 1)
      .sort((a, b) => hexDistance(a, feind) - hexDistance(b, feind) || a.id - b.id)[0];
    if (!ritter) continue;
    gefochten.add(ritter.id);
    const w = wurf(rng);
    const sieg = w >= RITTER_SIEGT_AB;
    s.units = s.units.filter((x) => x !== (sieg ? feind : ritter));
    events.push({
      t: 'fight',
      q: feind.q,
      r: feind.r,
      owner: ritter.owner,
      foe: feind.kind as Feind,
      roll: w,
      knightWon: sieg,
    });
  }

  // 4. Pluenderung: wer an einer Siedlung steht, nimmt und zieht ab.
  for (const u of s.units.filter((x) => x.kind !== 'ritter').sort((a, b) => a.id - b.id)) {
    const owner = ziele.get(hexKey(u.q, u.r));
    if (owner === undefined) continue;
    const p = playerById(s, owner);
    if (!p) continue;
    const menge = raidLoss(s, owner, 1);
    const taken = takeFromLargest(p.hand, menge);
    for (const r of RESOURCES) {
      p.hand[r] -= taken[r];
      s.bank[r] += taken[r];
    }
    s.units = s.units.filter((x) => x !== u);
    events.push({
      t: 'plunder',
      round: roundOf(s.turn),
      player: owner,
      kind: u.kind as Feind,
      q: u.q,
      r: u.r,
      taken,
      count: menge,
    });
  }

  // 5. Belagerung: Ritter auf aktiven Lagern gegen die Besatzung.
  const belagert = new Map<string, UnitState[]>();
  for (const u of s.units) {
    if (u.kind !== 'ritter' || !isNestActive(s, u.q, u.r)) continue;
    const k = hexKey(u.q, u.r);
    const liste = belagert.get(k);
    if (liste) liste.push(u);
    else belagert.set(k, [u]);
  }
  const lagerReihe = [...belagert].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [k, ritter] of lagerReihe) {
    const { q, r } = ritter[0]!;
    let rest = garrisonOf(s, q, r);
    let treffer = 0;
    for (let i = 0; i < ritter.length && rest > 0; i++) {
      if (wurf(rng) >= BELAGERER_TRIFFT_AB) {
        rest -= 1;
        treffer += 1;
      }
    }
    let verluste = 0;
    const lebend = [...ritter].sort((a, b) => a.id - b.id);
    for (let i = 0; i < rest && lebend.length > 0; i++) {
      if (wurf(rng) >= VERTEIDIGER_TRIFFT_AB) {
        const gefallen = lebend.shift()!;
        s.units = s.units.filter((x) => x !== gefallen);
        verluste += 1;
      }
    }
    const owners = [
      ...new Set(ritter.map((x) => x.owner).filter((o): o is PlayerId => o !== null)),
    ].sort();
    events.push({ t: 'siege', q, r, owners, hits: treffer, knightsLost: verluste, left: rest });

    if (rest <= 0) {
      s.destroyedNests.push(k);
      delete s.nestGarrison[k];
      for (const o of owners) {
        const p = playerById(s, o);
        if (p) p.loot += 1;
      }
      events.push({
        t: 'nestDestroyed',
        q,
        r,
        kind: nestOccupants(seed, q, r).kind,
        players: owners,
      });
    } else {
      s.nestGarrison[k] = rest;
    }
  }

  s.rngState = rng.getState();
}
