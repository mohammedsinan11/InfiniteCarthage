/**
 * Pluenderungen.
 *
 * Alle fuenf Runden - zum Beginn jeder grossen Runde - holen sich die Nester
 * in Reichweite etwas aus den Vorraeten. Das ist der Preis dafuer, weit
 * hinauszubauen, und damit der Grund, warum eine Karte ohne Rand ueberhaupt
 * eine Richtung hat.
 *
 * OHNE PHASE, absichtlich. Eine Pluenderung trifft alle Spieler am selben
 * Rundenuebergang. Waere sie eine Phase, in der jeder erst auswaehlen muss,
 * was er abgibt, stuende die Partie still, bis der Letzte geklickt hat - und
 * bei einem abwesenden Spieler fuer immer. Raeuber nehmen sich, was sie
 * wollen; das ist zugleich das ehrlichere Bild.
 *
 * Genommen wird vom groessten Stapel. Kein Zufall: der Verlust soll
 * nachvollziehbar sein, und wer viel von einer Sorte haelt, verliert davon.
 *
 * WER GETROFFEN WIRD, entscheidet die Lage, nicht der Wuerfel - bis auf einen
 * Punkt: Horten zieht Raeuber an (siehe rangeFor). Damit ist die
 * Handkartengrenze wieder an etwas gebunden, das im Spiel steht, statt an
 * einen Wurf.
 *
 * VERTEIDIGUNG. Ein gespielter Ritter bezieht Wache. Greift ein Nest zu, stellt
 * sich ihm eine Wache entgegen und ist danach verbraucht - eine Wache je Nest.
 * Wer von zwei Nestern erreicht wird, braucht zwei Ritter, um ganz verschont zu
 * bleiben; mit einem kommt eines durch. Auch der Horterverlust greift nur, wenn
 * mindestens ein Nest durchkommt: wer alle abwehrt, verliert nichts, egal wie
 * voll das Lager ist.
 *
 * Die Wache kaempft, sobald ein Nest angreift - auch wenn gerade nichts zu holen
 * waere. Sie weiss nicht, was im Lager liegt; sie steht einfach da. Wachen, die
 * nicht gebraucht werden, bleiben stehen.
 */

import { hexDistance } from '../coords';
import { nestAt } from '../raiders';
import { RESOURCES } from '../types';
import { emptyHand, handSize } from '../state';
import { isHoarding } from './handlimit';
import { vertexAdjacentHexes, parseVertexKey } from '../coords';
import type { Hex } from '../coords';
import type { Resource } from '../types';
import type { GameState, Hand, PlayerId } from '../state';
import type { HandView } from './handlimit';

/**
 * Was die Bedrohungsrechnung vom Spielstand braucht. Schmal genug fuer die
 * redigierte Sicht des Clients - das Menue zeigt damit, wie viele Nester
 * heranreichen, und rechnet dabei nach denselben Regeln wie der Server.
 */
export type RaidView = HandView & Pick<GameState, 'worldSeed' | 'buildings'>;

/**
 * Wie weit ein Nest greift.
 *
 * Drei Felder, waehrend Nester mindestens drei Felder auseinanderliegen: so
 * ist eine Siedlung meist von keinem oder genau einem Nest bedroht. Zwei
 * gleichzeitig gibt es, aber es ist eine Lage, die man sich ausgesucht hat.
 */
export const RAID_RANGE = 3;

/** Die Reichweite gegenueber diesem Spieler. Horten zieht sie weiter. */
export function rangeFor(state: RaidView, id: PlayerId): number {
  return isHoarding(state, id) ? RAID_RANGE + 1 : RAID_RANGE;
}

/** Die Felder, auf denen dieser Spieler etwas stehen hat. */
function occupiedHexes(state: RaidView, id: PlayerId): Hex[] {
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const [key, b] of Object.entries(state.buildings)) {
    if (b.owner !== id) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(key))) {
      const k = h.q + ':' + h.r;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(h);
    }
  }
  return out;
}

/**
 * Welche Nester diesen Spieler bedrohen.
 *
 * Je Nest hoechstens einmal, egal wie viele Bauten in seiner Reichweite
 * stehen - sonst waere eine dichte Stadt naeher am Nest schlimmer als eine
 * weit verteilte, und das ist genau verkehrt herum.
 */
export function threateningNests(state: RaidView, id: PlayerId): Hex[] {
  const reichweite = rangeFor(state, id);
  const felder = occupiedHexes(state, id);
  if (felder.length === 0) return [];

  const gefunden = new Map<string, Hex>();
  for (const f of felder) {
    for (let dq = -reichweite; dq <= reichweite; dq++) {
      for (let dr = -reichweite; dr <= reichweite; dr++) {
        const h = { q: f.q + dq, r: f.r + dr };
        if (hexDistance(f, h) > reichweite) continue;
        const k = h.q + ':' + h.r;
        if (gefunden.has(k)) continue;
        if (nestAt(state.worldSeed, h.q, h.r)) gefunden.set(k, h);
      }
    }
  }
  return [...gefunden.values()];
}

/**
 * Wie viel dieser Spieler verliert.
 *
 * Eine Karte je bedrohendem Nest - wer hortet, verliert stattdessen die
 * Haelfte. Es gilt der groessere Verlust: die Nester bleiben die Untergrenze,
 * das Horten kann sie nur verschlimmern.
 */
export function raidLoss(state: GameState, id: PlayerId, nests: number): number {
  if (nests === 0) return 0;
  const p = state.players.find((x) => x.id === id);
  if (!p) return 0;
  const gehalten = handSize(p.hand);
  const gehortet = isHoarding(state, id) ? Math.floor(gehalten / 2) : 0;
  return Math.min(gehalten, Math.max(nests, gehortet));
}

/** Nimmt Karten vom jeweils groessten Stapel. Gibt zurueck, was genommen wurde. */
export function takeFromLargest(hand: Hand, count: number): Hand {
  const genommen = emptyHand();
  for (let i = 0; i < count; i++) {
    let beste: Resource | null = null;
    for (const r of RESOURCES) {
      const rest = hand[r] - genommen[r];
      if (rest <= 0) continue;
      // Bei Gleichstand gewinnt die fruehere Sorte - fest, nicht zufaellig.
      if (beste === null || rest > hand[beste] - genommen[beste]) beste = r;
    }
    if (beste === null) break;
    genommen[beste] += 1;
  }
  return genommen;
}

export type RaidHit = {
  player: PlayerId;
  /** Wie viele Nester zugegriffen haben. */
  nests: number;
  /** Wie viele davon Wachen abgehalten haben. */
  blocked: number;
  /** Was genommen wurde. Fuer Fremde redigiert (redact.ts). */
  taken: Hand;
  /** Wie viele Karten insgesamt - bleibt auch fuer Fremde sichtbar. */
  count: number;
};

/**
 * Die Pluenderung durchfuehren. Aendert Haende und Bank.
 *
 * Was genommen wird, geht an die Bank zurueck - Karten verschwinden nicht aus
 * dem Spiel, sonst liefe der Vorrat langsam leer.
 */
export function runRaid(state: GameState): RaidHit[] {
  const treffer: RaidHit[] = [];
  for (const id of state.order) {
    const nester = threateningNests(state, id);
    if (nester.length === 0) continue;

    const p = state.players.find((x) => x.id === id);
    if (!p) continue;

    // Wachen zuerst: jede haelt ein Nest ab und ist danach verbraucht.
    const abgewehrt = Math.min(p.guards, nester.length);
    p.guards -= abgewehrt;
    const durch = nester.length - abgewehrt;

    const menge = raidLoss(state, id, durch);
    // Auch eine reine Abwehr ist ein Ereignis - man soll sehen, dass die
    // Wache etwas getan hat.
    if (menge === 0 && abgewehrt === 0) continue;

    const genommen = takeFromLargest(p.hand, menge);
    for (const r of RESOURCES) {
      p.hand[r] -= genommen[r];
      state.bank[r] += genommen[r];
    }
    treffer.push({
      player: id,
      nests: nester.length,
      blocked: abgewehrt,
      taken: genommen,
      count: menge,
    });
  }
  return treffer;
}
