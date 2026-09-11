/**
 * Das Heer: Ritter, Raubzuege, Fehden, Wanderer, Kaempfe, Lager und Ruinen.
 *
 * Alles geschieht im Takt der Runde. Bei jedem Zugende (endTurn) zieht jede
 * Einheit mit Ziel genau ein Feld. Raeuber pluendern erst, wenn sie eine
 * Siedlung erreichen, und tragen die Beute danach heim - wer sie auf dem
 * Rueckweg abfaengt, holt sie sich zurueck.
 *
 * FRAKTIONEN. Jedes Lager gehoert einer Bande oder einem Stamm
 * (core/factions.ts). Fraktionen sind einander feind und den Spielern ebenso
 * (core/combat.ts, feindlich). Stehen Feinde auf einem Feld, wird gekaempft,
 * Runde um Runde, bis nur noch eine Seite steht. Die Karte zeigt das mit zwei
 * Schwertern.
 *
 * REIHENFOLGE JE RUNDE
 *   1. Ziehen, nach Nummer. Wer in einen Kampf verwickelt ist, bleibt stehen.
 *      Ritter gehen, wohin man sie schickt, und erkunden Ruinen. Raubzuege
 *      suchen die naechste Siedlung, Heimkehrer ihr Lager, Fehden das feindliche
 *      Lager, Wanderer irgendein Ziel.
 *   2. Heimkehr: wer am eigenen Lager ankommt, geht darin auf. Die Beute ist fort.
 *   3. Angriff: wer diese Runde nicht gezogen ist, stuermt auf ein Nachbarfeld
 *      mit Feinden. So stellen Ritter, wer an ihnen vorbeiwill. Heimkehrer und
 *      Wanderer greifen nicht an.
 *   4. Kampf: eine Runde auf jedem Feld, auf dem Feinde stehen.
 *   5. Pluenderung: wer auf Raubzug an einer Siedlung steht und nicht kaempft,
 *      nimmt und kehrt um.
 *   6. Erholung: Ritter an eigenen Siedlungen bekommen ein Leben zurueck.
 *
 * KAMPF. Jeder Kaempfer wuerfelt einmal; er trifft bei Wurf + Angriff >= 6, mit
 * einer Sechs immer, mit einer Eins nie (core/combat.ts). Jeder Treffer kostet
 * einen zufaelligen Feind ein Leben, alle schlagen gleichzeitig. Ein Lager
 * kaempft mit: wer es angreift, rennt gegen die Palisade (-1), die Besatzung ist
 * ungeordnet (-2) und hat je Kopf ein Leben.
 *
 * LAGER FALLEN, wenn die Besatzung aufgerieben ist. Stehen Ritter darauf, wird es
 * zerstoert, und ihre Besitzer bekommen Beute. Stehen dort nur Leute einer
 * fremden Fraktion, erobern sie es und werden seine neue Besatzung.
 *
 * WUERFEL kommen aus dem rngState, wie der Ertrag: auf dem Server und nicht
 * vorhersagbar.
 *
 * ZU MEHREREN ist die Runde der Spielerzug (state.turn), wie ueberall im Spiel.
 * Zu viert ziehen Einheiten also viermal, bis man selbst wieder dran ist.
 */

import { Rng } from '../rng';
import { hexDistance, hexKey, hexesInRange, neighbors } from '../coords';
import type { Hex } from '../coords';
import { ensureGenerated } from '../world';
import type { World } from '../world';
import type { ChunkCoord } from '../chunks';
import { ruinAt, ruinResultFor } from '../ruins';
import type { RuinResult } from '../ruins';
import { RESOURCES } from '../types';
import { emptyHand, handSize, playerById } from '../state';
import type { GameState, Hand, PlayerId, UnitKind, UnitState } from '../state';
import {
  BESATZUNG_MAX,
  WERTE,
  einheitVorlage,
  garrisonOf,
  isLandAt,
  isNestActive,
  knightMusterHex,
  nestFraktionOf,
  nextStep,
  settlementApproaches,
} from '../units';
import {
  BESATZUNG_UNGEORDNET,
  NEUTRAL,
  PALISADE,
  feindlich,
  imKampf,
  istKampf,
  istSpielerSeite,
  kampfFelder,
  seitenAuf,
  seiteVon,
  trifft,
} from '../combat';
import type { Seite } from '../combat';
import { fraktionById } from '../factions';
import type { FraktionArt } from '../factions';
import { raidLoss, takeFromLargest } from './raid';
import { roundOf } from '../season';

/**
 * Lager bis zu dieser Entfernung von einer Siedlung schicken Raubzuege.
 *
 * Eine erste Fassung nahm 10. Im Spiel brachen damit in Runde 6 sechs Raubzuege
 * gleichzeitig auf - auf den grossen Kontinenten liegen im Zehnerumkreis schnell
 * fuenf, sechs Lager. Sechs Karten Verlust je grosser Runde gegen einen einzigen
 * Ritter ist keine Bedrohung mehr, sondern eine Steuer. Deshalb 8 - und dazu
 * die Obergrenze je Runde (maxAufbrueche).
 */
export const SPAWN_RANGE = 8;

/**
 * Wie viele Raubzuege je grosser Runde hoechstens aufbrechen: einer mehr, als
 * Spieler am Tisch sitzen - allein also zwei. Die naechsten Lager zuerst, damit
 * die Gefahr von dort kommt, wo man sie sieht.
 */
export const maxAufbrueche = (spieler: number): number => 1 + spieler;

/** Ab diesem Wurf uebersteht ein Ritter einen Hinterhalt in einer Ruine. */
export const HINTERHALT_UEBERSTEHT_AB = 3;
/** Wie weit eine alte Karte aus einer Ruine aufdeckt. */
export const KARTE_RADIUS = 8;
/** Wie weit ein Ritter beim Ziehen aufdeckt - wie beim Bauen. */
const ERKUNDUNG_RADIUS = 3;

/** Wie weit ein Lager ein feindliches angreift. */
export const FEHDE_REICHWEITE = 7;
/**
 * Fehden gibt es nur nahe den Spielern: was weit draussen geschieht, sieht
 * niemand, und die Wegsuche soll nicht die halbe Welt abgehen.
 */
const FEHDE_UM_SIEDLUNGEN = SPAWN_RANGE + 4;
/** So viele ziehen in eine Fehde. */
export const FEHDE_TRUPP = 2;
/** Chance je grosser Runde auf eine neue Fehde - hoechstens eine ist unterwegs. */
const FEHDE_CHANCE = 0.5;

/** Wie viele Runden ein Wanderer bleibt. */
export const WANDERER_DAUER = 20;
/** Hoechstens so viele Wanderer gleichzeitig: einer je Spieler. */
export const maxWanderer = (spieler: number): number => spieler;
/** Chance je grosser Runde, dass ein Wanderer auftaucht. */
const WANDERER_CHANCE = 0.6;

/** So weit sucht ein Heimkehrer ein anderes Lager seiner Fraktion, wenn seines fiel. */
const HEIMKEHR_SUCHE = 12;
const SUCHE_RITTER = 2500;
const SUCHE_RAEUBER = 900;
const UINT = 4294967296;

type Feind = FraktionArt;

/** Gefallene je Seite und Art. 'besatzung' zaehlt Verteidiger eines Lagers. */
export type Verlust = { seite: Seite; kind: UnitKind | 'besatzung'; anzahl: number };

export type ArmyEvent =
  | { t: 'knightReady'; player: PlayerId; unit: number; q: number; r: number }
  | {
      t: 'march';
      round: number;
      parties: { q: number; r: number; kind: Feind; fraktion: string }[];
    }
  | {
      t: 'feud';
      round: number;
      q: number;
      r: number;
      fraktion: string;
      gegen: string;
      zq: number;
      zr: number;
      anzahl: number;
    }
  | { t: 'wanderer'; q: number; r: number }
  | {
      /** Eine Kampfrunde auf einem Feld. */
      t: 'fight';
      q: number;
      r: number;
      /** Wer zu Beginn der Runde auf dem Feld kaempfte. */
      seiten: Seite[];
      /** Der Kampf hat in dieser Runde begonnen. */
      neu: boolean;
      /** Der Kampf ist mit dieser Runde vorbei. */
      ende: boolean;
      /** Wer am Ende steht - null, solange es weitergeht oder niemand bleibt. */
      sieger: Seite | null;
      verluste: Verlust[];
    }
  | {
      t: 'plunder';
      round: number;
      player: PlayerId;
      kind: Feind;
      fraktion: string;
      q: number;
      r: number;
      /** Was genommen wurde. Fuer Fremde redigiert (redact.ts). */
      taken: Hand;
      count: number;
    }
  | { t: 'homecoming'; q: number; r: number; fraktion: string; count: number }
  | {
      /** Ein Ritter hat einem Raeuber die Beute abgenommen. */
      t: 'lootRecovered';
      player: PlayerId;
      q: number;
      r: number;
      /** Fuer Fremde redigiert (redact.ts). */
      taken: Hand;
      count: number;
    }
  | { t: 'nestDestroyed'; q: number; r: number; kind: Feind; fraktion: string; players: PlayerId[] }
  | { t: 'nestCaptured'; q: number; r: number; von: string; an: string }
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
const nachNummer = (a: UnitState, b: UnitState): number => a.id - b.id;
const nachSchluessel = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const feld = (k: string): Hex => {
  const [q, r] = k.split(':').map(Number);
  return { q: q!, r: r! };
};

function aufstellen(s: GameState, vorlage: Omit<UnitState, 'id'>): UnitState {
  const u: UnitState = { ...vorlage, id: s.nextUnitId++ };
  s.units.push(u);
  return u;
}

function entfernen(s: GameState, weg: readonly UnitState[]): void {
  s.units = s.units.filter((x) => !weg.includes(x));
}

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

// --- Beute -----------------------------------------------------------------

/** Beute aufladen. Stammt sie von verschiedenen Beraubten, weiss keiner mehr, was es ist. */
function ladeAuf(u: UnitState, hand: Hand, beraubt: PlayerId | null): void {
  const vorher = u.traegt;
  if (!u.fracht) u.fracht = emptyHand();
  for (const r of RESOURCES) u.fracht[r] += hand[r];
  u.traegt = handSize(u.fracht);
  u.beraubt = vorher === 0 || u.beraubt === beraubt ? beraubt : null;
}

/** Was niemand mehr traegt, geht an die Bank zurueck. */
function frachtZurBank(s: GameState, u: UnitState): void {
  if (u.fracht) for (const r of RESOURCES) s.bank[r] += u.fracht[r];
  u.fracht = null;
  u.traegt = 0;
  u.beraubt = null;
}

/** Die Beute eines Gefallenen geht an den, der ihn schlug. */
function uebergib(s: GameState, tot: UnitState, erbe: UnitState, events: Ereignisse): void {
  const fracht = tot.fracht ?? emptyHand();
  const count = tot.traegt;
  if (erbe.owner !== null) {
    const p = playerById(s, erbe.owner);
    if (p) {
      for (const r of RESOURCES) p.hand[r] += fracht[r];
      events.push({ t: 'lootRecovered', player: erbe.owner, q: erbe.q, r: erbe.r, taken: { ...fracht }, count });
    } else {
      for (const r of RESOURCES) s.bank[r] += fracht[r];
    }
  } else {
    ladeAuf(erbe, fracht, tot.beraubt);
    // Wer Beute gemacht hat, bringt sie heim.
    if (erbe.auftrag === 'raub' || erbe.auftrag === 'fehde') {
      erbe.auftrag = 'heimkehr';
      erbe.ziel = null;
    }
  }
  tot.fracht = null;
  tot.traegt = 0;
  tot.beraubt = null;
}

// --- Aufbruch zu Beginn der grossen Runde -----------------------------------

/** Einen Ritter fuer diesen Spieler antreten lassen. null ohne Siedlung. */
export function spawnKnight(s: GameState, id: PlayerId, events: Ereignisse): UnitState | null {
  const feldAn = knightMusterHex(s, id);
  if (!feldAn) return null;
  const unit = aufstellen(s, einheitVorlage('ritter', feldAn.q, feldAn.r, { owner: id }));
  events.push({ t: 'knightReady', player: id, unit: unit.id, q: unit.q, r: unit.r });
  return unit;
}

/**
 * Raubzuege losschicken - zum Beginn jeder grossen Runde.
 *
 * Aktive Lager bis SPAWN_RANGE von einer Siedlung schicken einen Raubzug, sofern
 * keiner von dort schon unterwegs ist und ein Landweg existiert - die naechsten
 * zuerst, hoechstens maxAufbrueche je Runde. Lager weiter draussen bleiben
 * ruhig: auf einer Karte ohne Rand wuerde sonst die ganze Welt marschieren.
 */
export function sendRaiders(s: GameState, events: Ereignisse): void {
  const ziele = settlementApproaches(s);
  if (ziele.size === 0) return;
  const zielSet = new Set(ziele.keys());

  // Aktive Lager in Reichweite, jeweils mit dem Abstand zur naechsten Siedlung.
  const lager = new Map<string, { q: number; r: number; d: number }>();
  for (const k of ziele.keys()) {
    const an = feld(k);
    for (const c of hexesInRange(an, SPAWN_RANGE)) {
      if (!isNestActive(s, c.q, c.r)) continue;
      const ck = hexKey(c.q, c.r);
      const d = hexDistance(an, c);
      const bisher = lager.get(ck);
      if (!bisher || d < bisher.d) lager.set(ck, { q: c.q, r: c.r, d });
    }
  }

  const unterwegs = new Set(
    s.units.map((u) => u.heimat).filter((h): h is string => h !== null),
  );
  const grenze = maxAufbrueche(s.order.length);
  const parties: { q: number; r: number; kind: Feind; fraktion: string }[] = [];
  const reihe = [...lager].sort((a, b) => a[1].d - b[1].d || nachSchluessel(a[0], b[0]));
  for (const [k, nest] of reihe) {
    if (parties.length >= grenze) break;
    if (unterwegs.has(k)) continue;
    const schonDa = zielSet.has(k);
    const weg = schonDa ? null : nextStep(s.worldSeed, nest, zielSet, SUCHE_RAEUBER);
    if (!weg && !schonDa) continue;
    const fraktion = nestFraktionOf(s, nest.q, nest.r);
    const kind = fraktionById(s.worldSeed, fraktion).art;
    aufstellen(
      s,
      einheitVorlage(kind, nest.q, nest.r, {
        fraktion,
        heimat: k,
        auftrag: 'raub',
        ziel: weg ? weg.ziel : { q: nest.q, r: nest.r },
      }),
    );
    parties.push({ q: nest.q, r: nest.r, kind, fraktion });
  }
  if (parties.length > 0) events.push({ t: 'march', round: roundOf(s.turn), parties });
}

/**
 * Eine Fehde anzetteln: ein Lager nahe den Spielern schickt einen Trupp gegen
 * ein feindliches Lager in der Naehe. Hoechstens eine Fehde ist unterwegs, und
 * nicht jede grosse Runde bringt eine.
 */
export function sendFeud(s: GameState, rng: Rng, events: Ereignisse): void {
  if (s.units.some((u) => u.auftrag === 'fehde')) return;
  if (rng.next() / UINT >= FEHDE_CHANCE) return;
  const ziele = settlementApproaches(s);
  if (ziele.size === 0) return;

  const lager = new Map<string, Hex>();
  const geprueft = new Set<string>();
  for (const k of ziele.keys()) {
    for (const c of hexesInRange(feld(k), FEHDE_UM_SIEDLUNGEN)) {
      const ck = hexKey(c.q, c.r);
      if (geprueft.has(ck)) continue;
      geprueft.add(ck);
      if (isNestActive(s, c.q, c.r)) lager.set(ck, c);
    }
  }

  const unterwegs = new Set(s.units.map((u) => u.heimat).filter((h): h is string => h !== null));
  const paare: { von: Hex; vk: string; nach: Hex; nk: string }[] = [];
  for (const [vk, von] of [...lager].sort((a, b) => nachSchluessel(a[0], b[0]))) {
    if (unterwegs.has(vk) || garrisonOf(s, von.q, von.r) < FEHDE_TRUPP) continue;
    const eigene = nestFraktionOf(s, von.q, von.r);
    for (const c of hexesInRange(von, FEHDE_REICHWEITE)) {
      if (!isNestActive(s, c.q, c.r)) continue;
      if (!feindlich(eigene, nestFraktionOf(s, c.q, c.r))) continue;
      paare.push({ von, vk, nach: c, nk: hexKey(c.q, c.r) });
    }
  }

  for (let versuch = 0; versuch < 4 && paare.length > 0; versuch++) {
    const p = paare.splice(rng.int(paare.length), 1)[0]!;
    if (!nextStep(s.worldSeed, p.von, new Set([p.nk]), SUCHE_RAEUBER)) continue;
    const fraktion = nestFraktionOf(s, p.von.q, p.von.r);
    const kind = fraktionById(s.worldSeed, fraktion).art;
    for (let i = 0; i < FEHDE_TRUPP; i++) {
      aufstellen(
        s,
        einheitVorlage(kind, p.von.q, p.von.r, {
          fraktion,
          heimat: p.vk,
          auftrag: 'fehde',
          ziel: { q: p.nach.q, r: p.nach.r },
        }),
      );
    }
    events.push({
      t: 'feud',
      round: roundOf(s.turn),
      q: p.von.q,
      r: p.von.r,
      fraktion,
      gegen: nestFraktionOf(s, p.nach.q, p.nach.r),
      zq: p.nach.q,
      zr: p.nach.r,
      anzahl: FEHDE_TRUPP,
    });
    return;
  }
}

/**
 * Einen Wanderer auftauchen lassen: ein Stueck draussen, mit dem ersten Ziel an
 * einer Siedlung, damit man ihn vorbeiziehen sieht. Er ist neutral - noch tut er
 * nichts, er ist der Platz fuer Begegnungen, die spaeter kommen.
 */
export function sendWanderer(s: GameState, rng: Rng, events: Ereignisse): void {
  const zahl = s.units.filter((u) => u.kind === 'wanderer').length;
  if (zahl >= maxWanderer(s.order.length)) return;
  if (rng.next() / UINT >= WANDERER_CHANCE) return;
  const ziele = [...settlementApproaches(s).keys()];
  if (ziele.length === 0) return;
  const an = feld(ziele[rng.int(ziele.length)]!);
  const seed = s.worldSeed;
  const starts = hexesInRange(an, 9).filter(
    (h) => hexDistance(h, an) >= 7 && isLandAt(seed, h.q, h.r) && !isNestActive(s, h.q, h.r),
  );
  for (let versuch = 0; versuch < 4 && starts.length > 0; versuch++) {
    const start = starts.splice(rng.int(starts.length), 1)[0]!;
    if (!nextStep(seed, start, new Set([hexKey(an.q, an.r)]), SUCHE_RAEUBER)) continue;
    aufstellen(
      s,
      einheitVorlage('wanderer', start.q, start.r, { ziel: an, dauer: WANDERER_DAUER }),
    );
    events.push({ t: 'wanderer', q: start.q, r: start.r });
    return;
  }
}

/** Was zu Beginn jeder grossen Runde aufbricht. Nach dem Ziehen, damit Frische nicht sofort handeln. */
export function beginBigRound(s: GameState, events: Ereignisse): void {
  sendRaiders(s, events);
  const rng = new Rng(s.rngState);
  sendFeud(s, rng, events);
  sendWanderer(s, rng, events);
  s.rngState = rng.getState();
}

// --- Die Runde ---------------------------------------------------------------

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
    if (wurf(rng) < HINTERHALT_UEBERSTEHT_AB) {
      entfernen(s, [u]);
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

/** Das Lager, zu dem ein Heimkehrer zieht: sein eigenes, sonst das naechste seiner Fraktion. */
function heimFuer(s: GameState, u: UnitState): Hex | null {
  if (u.heimat) {
    const h = feld(u.heimat);
    if (isNestActive(s, h.q, h.r) && nestFraktionOf(s, h.q, h.r) === u.fraktion) return h;
  }
  let best: Hex | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of hexesInRange(u, HEIMKEHR_SUCHE)) {
    if (!isNestActive(s, c.q, c.r) || nestFraktionOf(s, c.q, c.r) !== u.fraktion) continue;
    const d = hexDistance(u, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Ein neues Ziel fuer einen Wanderer, fuenf bis acht Felder weiter. */
function wanderziel(s: GameState, rng: Rng, von: Hex): Hex | null {
  const kandidaten = hexesInRange(von, 8).filter(
    (h) =>
      hexDistance(h, von) >= 5 && isLandAt(s.worldSeed, h.q, h.r) && !isNestActive(s, h.q, h.r),
  );
  for (let versuch = 0; versuch < 4 && kandidaten.length > 0; versuch++) {
    const h = kandidaten.splice(rng.int(kandidaten.length), 1)[0]!;
    if (nextStep(s.worldSeed, von, new Set([hexKey(h.q, h.r)]), 600)) return h;
  }
  return null;
}

/** Ein Schritt. true, wenn die Einheit gezogen ist. */
function ziehe(
  s: GameState,
  world: World,
  rng: Rng,
  u: UnitState,
  siedlungen: ReadonlySet<string>,
  events: Ereignisse,
): boolean {
  const seed = s.worldSeed;
  const schritt = (h: Hex) => {
    u.q = h.q;
    u.r = h.r;
  };

  switch (u.auftrag) {
    case 'befehl': {
      if (!u.ziel) return false;
      const zk = hexKey(u.ziel.q, u.ziel.r);
      const weg = nextStep(seed, u, new Set([zk]), SUCHE_RITTER);
      if (weg) {
        schritt(weg.step);
        wachsen(s, world, u, ERKUNDUNG_RADIUS, events);
      }
      // Am Ziel oder ohne Weg: der Befehl ist erledigt.
      if (!weg || hexKey(u.q, u.r) === zk) u.ziel = null;
      return weg !== null;
    }

    case 'raub': {
      const weg = siedlungen.size > 0 ? nextStep(seed, u, siedlungen, SUCHE_RAEUBER) : null;
      if (weg) {
        schritt(weg.step);
        u.ziel = weg.ziel;
        return true;
      }
      if (siedlungen.has(hexKey(u.q, u.r))) {
        u.ziel = { q: u.q, r: u.r };
        return false;
      }
      // Nichts zu holen: umkehren.
      u.auftrag = 'heimkehr';
      u.ziel = null;
      return false;
    }

    case 'fehde': {
      const z = u.ziel;
      if (
        !z ||
        u.fraktion === null ||
        !isNestActive(s, z.q, z.r) ||
        !feindlich(u.fraktion, nestFraktionOf(s, z.q, z.r))
      ) {
        u.auftrag = 'heimkehr';
        u.ziel = null;
        return false;
      }
      const weg = nextStep(seed, u, new Set([hexKey(z.q, z.r)]), SUCHE_RAEUBER);
      if (weg) {
        schritt(weg.step);
        return true;
      }
      if (u.q !== z.q || u.r !== z.r) {
        u.auftrag = 'heimkehr';
        u.ziel = null;
      }
      return false;
    }

    case 'heimkehr': {
      const heim = heimFuer(s, u);
      if (!heim) {
        // Kein Lager mehr: der Trupp zerstreut sich.
        frachtZurBank(s, u);
        entfernen(s, [u]);
        return false;
      }
      const hk = hexKey(heim.q, heim.r);
      u.heimat = hk;
      u.ziel = heim;
      const weg = nextStep(seed, u, new Set([hk]), SUCHE_RAEUBER);
      if (weg) {
        schritt(weg.step);
        return true;
      }
      if (hexKey(u.q, u.r) !== hk) {
        frachtZurBank(s, u);
        entfernen(s, [u]);
      }
      return false;
    }

    case 'wandern': {
      if ((u.dauer ?? 0) <= 0) {
        entfernen(s, [u]);
        return false;
      }
      u.dauer = (u.dauer ?? 0) - 1;
      if (!u.ziel || (u.q === u.ziel.q && u.r === u.ziel.r)) u.ziel = wanderziel(s, rng, u);
      if (!u.ziel) return false;
      const weg = nextStep(seed, u, new Set([hexKey(u.ziel.q, u.ziel.r)]), SUCHE_RAEUBER);
      if (weg) {
        schritt(weg.step);
        return true;
      }
      u.ziel = null;
      return false;
    }
  }
}

/** Eine Kampfrunde auf einem Feld. */
function schlacht(
  s: GameState,
  rng: Rng,
  q: number,
  r: number,
  seiten: Seite[],
  neu: boolean,
  events: Ereignisse,
): void {
  const k = hexKey(q, r);
  const kaempfer = s.units
    .filter((u) => u.q === q && u.r === r && seiteVon(u) !== NEUTRAL)
    .sort(nachNummer);
  const lager = isNestActive(s, q, r);
  const lagerSeite = lager ? nestFraktionOf(s, q, r) : null;
  const besatzungVorher = lager ? garrisonOf(s, q, r) : 0;
  const besatzungArt = lagerSeite !== null ? fraktionById(s.worldSeed, lagerSeite).art : null;

  // Alle schlagen gleichzeitig: erst Treffer sammeln, dann anwenden.
  const schaden = new Map<number, number>();
  let besatzungTreffer = 0;
  const schlage = (seite: Seite, angriff: number, aufschlag: number) => {
    const einheiten = kaempfer.filter((x) => feindlich(seite, seiteVon(x)));
    const plaetze = lagerSeite !== null && feindlich(seite, lagerSeite) ? besatzungVorher : 0;
    const anzahl = einheiten.length + plaetze;
    if (anzahl === 0) return;
    if (!trifft(wurf(rng), angriff, aufschlag)) return;
    const i = rng.int(anzahl);
    if (i < einheiten.length) {
      const z = einheiten[i]!;
      schaden.set(z.id, (schaden.get(z.id) ?? 0) + 1);
    } else {
      besatzungTreffer += 1;
    }
  };
  for (const u of kaempfer) {
    const seite = seiteVon(u);
    schlage(seite, WERTE[u.kind].angriff, lagerSeite !== null && seite !== lagerSeite ? -PALISADE : 0);
  }
  if (lagerSeite !== null && besatzungArt !== null) {
    for (let i = 0; i < besatzungVorher; i++) {
      schlage(lagerSeite, WERTE[besatzungArt].angriff, -BESATZUNG_UNGEORDNET);
    }
  }

  const verluste = new Map<string, Verlust>();
  const zaehle = (seite: Seite, kind: Verlust['kind']) => {
    const key = seite + '|' + kind;
    const v = verluste.get(key);
    if (v) v.anzahl += 1;
    else verluste.set(key, { seite, kind, anzahl: 1 });
  };
  const gefallen: UnitState[] = [];
  for (const u of kaempfer) {
    const d = schaden.get(u.id) ?? 0;
    if (d === 0) continue;
    u.leben -= d;
    if (u.leben <= 0) {
      gefallen.push(u);
      zaehle(seiteVon(u), u.kind);
    }
  }
  const besatzungVerlust = Math.min(besatzungTreffer, besatzungVorher);
  for (let i = 0; i < besatzungVerlust; i++) zaehle(lagerSeite!, 'besatzung');
  entfernen(s, gefallen);
  const stehen = kaempfer.filter((x) => !gefallen.includes(x));

  // Beute der Gefallenen: an einen Feind, der noch steht, sonst an einen Kameraden.
  for (const tot of gefallen) {
    if (tot.traegt === 0 && !tot.fracht) continue;
    const seite = seiteVon(tot);
    const feinde = stehen.filter((x) => feindlich(seite, seiteVon(x)));
    const kameraden = stehen.filter((x) => seiteVon(x) === seite);
    const erben = feinde.length > 0 ? feinde : kameraden;
    if (erben.length === 0) frachtZurBank(s, tot);
    else uebergib(s, tot, erben[rng.int(erben.length)]!, events);
  }

  // Das Lager.
  if (lagerSeite !== null && besatzungArt !== null && besatzungVerlust > 0) {
    const rest = besatzungVorher - besatzungVerlust;
    if (rest > 0) {
      s.nestGarrison[k] = rest;
    } else {
      const eigene = stehen.filter((x) => seiteVon(x) === lagerSeite);
      const ritter = stehen.filter((x) => x.kind === 'ritter');
      const fremde = new Map<Seite, UnitState[]>();
      for (const x of stehen) {
        const seite = seiteVon(x);
        if (istSpielerSeite(seite) || !feindlich(seite, lagerSeite)) continue;
        fremde.set(seite, [...(fremde.get(seite) ?? []), x]);
      }

      if (eigene.length > 0) {
        // Wer vom eigenen Lager noch steht, zieht hinein.
        eigene.forEach((x) => frachtZurBank(s, x));
        s.nestGarrison[k] = Math.min(BESATZUNG_MAX, eigene.length);
        entfernen(s, eigene);
      } else if (ritter.length > 0 || fremde.size === 0) {
        const players = [...new Set(ritter.map((x) => x.owner!))].sort();
        s.destroyedNests.push(k);
        delete s.nestGarrison[k];
        delete s.nestFraktion[k];
        for (const o of players) {
          const p = playerById(s, o);
          if (p) p.loot += 1;
        }
        events.push({ t: 'nestDestroyed', q, r, kind: besatzungArt, fraktion: lagerSeite, players });
      } else {
        // Nur fremde Fraktionen: die staerkste erobert das Lager.
        const [an, leute] = [...fremde].sort(
          (a, b) => b[1].length - a[1].length || nachSchluessel(a[0], b[0]),
        )[0]!;
        leute.forEach((x) => frachtZurBank(s, x));
        s.nestFraktion[k] = an;
        s.nestGarrison[k] = Math.min(BESATZUNG_MAX, leute.length);
        entfernen(s, leute);
        events.push({ t: 'nestCaptured', q, r, von: lagerSeite, an });
      }
    }
  }

  const nachher = seitenAuf(s, q, r);
  const ende = !istKampf(nachher);
  const sieger = !ende
    ? null
    : (nachher[0] ?? (isNestActive(s, q, r) ? nestFraktionOf(s, q, r) : null));
  events.push({ t: 'fight', q, r, seiten, neu, ende, sieger, verluste: [...verluste.values()] });
}

/** Eine Runde des Heeres. Aendert Einheiten, Haende, Bank, Lager und Welt. */
export function tickArmy(s: GameState, world: World, events: Ereignisse): void {
  if (s.units.length === 0) return;
  const rng = new Rng(s.rngState);
  const seed = s.worldSeed;
  const vorher = new Set(kampfFelder(s).keys());
  const siedlungen = settlementApproaches(s);
  const siedlungsFelder = new Set(siedlungen.keys());
  const gezogen = new Set<number>();

  // 1. Ziehen.
  for (const u of [...s.units].sort(nachNummer)) {
    if (!s.units.includes(u) || imKampf(s, u)) continue;
    if (ziehe(s, world, rng, u, siedlungsFelder, events)) gezogen.add(u.id);
    const k = hexKey(u.q, u.r);
    if (
      s.units.includes(u) &&
      u.kind === 'ritter' &&
      u.owner !== null &&
      ruinAt(seed, u.q, u.r) &&
      !s.exploredRuins.includes(k)
    ) {
      erkunde(s, world, rng, u, events);
    }
  }

  // 2. Heimkehr: am eigenen Lager angekommen.
  for (const u of s.units.filter((x) => x.auftrag === 'heimkehr').sort(nachNummer)) {
    if (u.heimat !== hexKey(u.q, u.r) || u.fraktion === null) continue;
    if (!isNestActive(s, u.q, u.r) || nestFraktionOf(s, u.q, u.r) !== u.fraktion) continue;
    if (imKampf(s, u)) continue;
    const besatzung = Math.min(BESATZUNG_MAX, garrisonOf(s, u.q, u.r) + 1);
    if (besatzung !== garrisonOf(s, u.q, u.r)) s.nestGarrison[u.heimat] = besatzung;
    const count = u.traegt;
    frachtZurBank(s, u);
    entfernen(s, [u]);
    events.push({ t: 'homecoming', q: u.q, r: u.r, fraktion: u.fraktion, count });
  }

  // 3. Angriff: wer stand, stuermt auf Feinde nebenan.
  for (const u of [...s.units].sort(nachNummer)) {
    if (!s.units.includes(u) || gezogen.has(u.id)) continue;
    if (u.auftrag === 'heimkehr' || u.auftrag === 'wandern') continue;
    const eigene = seiteVon(u);
    if (eigene === NEUTRAL || imKampf(s, u)) continue;
    const nebenan = neighbors(u.q, u.r).find((n) =>
      s.units.some((x) => x.q === n.q && x.r === n.r && feindlich(eigene, seiteVon(x))),
    );
    if (!nebenan) continue;
    u.q = nebenan.q;
    u.r = nebenan.r;
    gezogen.add(u.id);
  }

  // 4. Kampf.
  const gekaempft = new Set<string>();
  for (const [k, seiten] of [...kampfFelder(s)].sort((a, b) => nachSchluessel(a[0], b[0]))) {
    gekaempft.add(k);
    const h = feld(k);
    schlacht(s, rng, h.q, h.r, seiten, !vorher.has(k), events);
  }

  // 5. Pluenderung.
  for (const u of s.units.filter((x) => x.auftrag === 'raub').sort(nachNummer)) {
    const owner = siedlungen.get(hexKey(u.q, u.r));
    if (owner === undefined || imKampf(s, u)) continue;
    const p = playerById(s, owner);
    if (!p) continue;
    const menge = raidLoss(s, owner, 1);
    const taken = takeFromLargest(p.hand, menge);
    for (const r of RESOURCES) p.hand[r] -= taken[r];
    ladeAuf(u, taken, owner);
    u.auftrag = 'heimkehr';
    u.ziel = null;
    events.push({
      t: 'plunder',
      round: roundOf(s.turn),
      player: owner,
      kind: u.kind as Feind,
      fraktion: u.fraktion ?? '',
      q: u.q,
      r: u.r,
      taken,
      count: menge,
    });
  }

  // 6. Erholung an eigenen Siedlungen.
  for (const u of s.units) {
    if (u.kind !== 'ritter' || u.leben >= WERTE.ritter.leben) continue;
    const k = hexKey(u.q, u.r);
    if (gekaempft.has(k) || siedlungen.get(k) !== u.owner) continue;
    u.leben += 1;
  }

  s.rngState = rng.getState();
}
