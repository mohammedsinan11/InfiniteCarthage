/**
 * Akte und Bosse im Ablauf (core/akte.ts).
 *
 * akteFortschreiben laeuft nach jeder Aktion - aendert sich nichts, tut sie
 * nichts. Beim Zugende (beendet gesetzt) faellt ausserdem die Entscheidung
 * ueber jeden Akt, dessen letzte Runde gerade gespielt wurde; das geschieht
 * VOR der Rundengrenze, damit auch der dritte Boss noch zaehlt.
 */

import { AKTE, aktVon, bossById, erfuellt, forderungFuer } from '../akte';
import type { BossStand } from '../akte';
import { handSize, playerById, publicPoints } from '../state';
import type { BossLohn, GameState, PlayerId } from '../state';
import { hatSystem } from '../systeme';
import { heldFolge } from './pfad';
import type { PfadEvent } from './pfad';
import { geben } from './ruhm';
import type { RuhmEvent } from './ruhm';
import { RESOURCES } from '../types';
import type { Resource } from '../types';
import { bossHeerAufstellen } from './army';
import { stufeRegel } from '../stufe';

export type AktEvent =
  /** Ein neuer Akt beginnt - mit diesem Boss gegen diesen Spieler. */
  | { t: 'aktBeginn'; player: PlayerId; akt: number; boss: string; bis: number }
  /** Das Heer eines Bosses bricht auf. */
  | { t: 'bossNaht'; player: PlayerId; boss: string; q: number; r: number; anzahl: number }
  | { t: 'bossBesiegt'; player: PlayerId; akt: number; boss: string; punkte: number; zugabe?: number }
  /** Der letzte Boss ist frueh geschlagen und fordert noch einmal (Zugabe). */
  | { t: 'bossZugabe'; player: PlayerId; boss: string; zugabe: number; bis: number }
  | { t: 'bossVerfehlt'; player: PlayerId; akt: number; boss: string; verloren: number }
  /** Tribut eingezahlt. */
  | { t: 'bossGezahlt'; player: PlayerId; resource: Resource; anzahl: number }
  /** Das Heer des Bosses hat gepluendert - der Akt ist verloren. */
  | { t: 'bossEntkommen'; player: PlayerId; boss: string }
  /** Der Lohn eines Bosses ist gewaehlt (B8). */
  | { t: 'bossLohn'; player: PlayerId; wahl: BossLohn };

type Ereignisse = { push(...e: (AktEvent | PfadEvent | RuhmEvent)[]): number };

const punkteVon = (s: GameState) => (id: PlayerId) => publicPoints(s, id);

/** So viele Runden muessen fuer eine Zugabe mindestens bleiben. */
const ZUGABE_MIN_RUNDEN = 3;

/** Bestanden: Siegpunkte in Hoehe der Aktzahl und eine Trophaee. */
function besiegt(s: GameState, st: BossStand, id: PlayerId, events: Ereignisse): void {
  st.ergebnis = 'besiegt';
  const akte = s.akte!;
  if (st.zugabe) {
    // Eine Zugabe bringt einen Siegpunkt - und zaehlt im Mult wie ein Boss (core/wertung.ts).
    akte.siege[id] = [...(akte.siege[id] ?? []), 1];
    events.push({ t: 'bossBesiegt', player: id, akt: st.akt, boss: st.boss, punkte: 1, zugabe: st.zugabe });
    zugabe(s, st, id, events);
    return;
  }
  akte.siege[id] = [...(akte.siege[id] ?? []), st.akt];
  const p = playerById(s, id);
  // Dazu ein Lohn zur Wahl (B8): seltene Karte, Schmiedearbeiten, Relikt oder Ruhm.
  // Bots nehmen die Trophaee - sie haben keine Tafel.
  if (p) {
    const angebot: BossLohn[] = ['trophaee', 'schmiede', hatSystem(s, 'held') ? 'relikt' : 'ruhm'];
    if ((s.bots ?? []).includes(id)) bossLohnNehmen(s, id, 'trophaee', events);
    else p.bossLohn = angebot;
  }
  events.push({ t: 'bossBesiegt', player: id, akt: st.akt, boss: st.boss, punkte: st.akt });
  zugabe(s, st, id, events);
}

/**
 * Der letzte Boss frueh geschlagen: statt elf Runden ohne Ziel (Spieltest 10)
 * fordert er noch einmal - mit einer frischen Forderung des dritten Aktes.
 */
function zugabe(s: GameState, st: BossStand, id: PlayerId, events: Ereignisse): void {
  if (st.akt < AKTE || st.bis - s.turn < ZUGABE_MIN_RUNDEN * s.order.length) return;
  const boss = bossById(st.boss);
  if (!boss) return;
  const n = (st.zugabe ?? 0) + 1;
  const punkte = punkteVon(s);
  const neu: BossStand = { akt: st.akt, boss: boss.id, bis: st.bis, forderung: forderungFuer(s, boss, AKTE, id, s.turn, st.bis, punkte), ergebnis: 'offen', zugabe: n };
  s.akte!.stand[id] = neu;
  events.push({ t: 'bossZugabe', player: id, boss: boss.id, zugabe: n, bis: st.bis });
}

/** Verfehlt: die Haelfte der Hand (von den groessten Stapeln) und ein Punkt Ruhm. */
function verfehlt(s: GameState, st: BossStand, id: PlayerId, events: Ereignisse): void {
  st.ergebnis = 'verfehlt';
  const p = playerById(s, id);
  let verloren = 0;
  if (p) {
    let n = Math.floor(handSize(p.hand) / 2);
    while (n > 0) {
      const r = [...RESOURCES].sort((a, b) => p.hand[b] - p.hand[a])[0]!;
      if (p.hand[r] <= 0) break;
      p.hand[r] -= 1;
      n -= 1;
      verloren += 1;
    }
    p.ruhm = Math.max(0, p.ruhm - 1);
  }
  // Chronikstufe 10: ein verfehlter Boss kostet einen Siegpunkt.
  if (stufeRegel(s.stufe, 10) && s.akte) s.akte.strafe = { ...(s.akte.strafe ?? {}), [id]: (s.akte.strafe?.[id] ?? 0) + 1 };
  events.push({ t: 'bossVerfehlt', player: id, akt: st.akt, boss: st.boss, verloren });
}

export function akteFortschreiben(s: GameState, events: Ereignisse, beendet: number | null): void {
  const akte = s.akte;
  if (!akte) return;
  const phase = s.phase.t;
  if (phase === 'finished' || phase === 'setup' || phase === 'hauswahl' || s.turn < 1) return;
  const punkte = punkteVon(s);

  for (const p of s.players) {
    if (p.besiegt) continue;
    let st = akte.stand[p.id];

    // Die letzte Runde des Aktes ist gespielt: Entscheidung.
    if (st && st.ergebnis === 'offen' && beendet !== null && beendet >= st.bis) {
      if (erfuellt(s, p.id, st.forderung, punkte)) besiegt(s, st, p.id, events);
      // Eine offene Zugabe kostet nichts - sie war ein Angebot, keine Drohung.
      else if (st.zugabe) st.ergebnis = 'verfehlt';
      else verfehlt(s, st, p.id, events);
    }

    // Ein neuer Akt beginnt (auch der erste, gleich nach dem Aufbau).
    const akt = aktVon(akte, s.turn);
    if ((!st || (st.akt < akt && s.turn > st.bis)) && akt <= AKTE) {
      const boss = bossById(akte.bosse[akt - 1]);
      if (boss) {
        const beginn = (akt - 1) * akte.laenge + 1;
        const bis = akt * akte.laenge;
        st = { akt, boss: boss.id, bis, forderung: forderungFuer(s, boss, akt, p.id, beginn, bis, punkte), ergebnis: 'offen' };
        akte.stand[p.id] = st;
        events.push({ t: 'aktBeginn', player: p.id, akt, boss: boss.id, bis });
      }
    }
    if (!st || st.ergebnis !== 'offen') continue;

    const f = st.forderung;
    if (f.t === 'heer') {
      // Zur Mitte des Aktes bricht das Heer auf.
      if (f.ids === null && s.turn >= f.abRunde) {
        const heer = bossHeerAufstellen(s, p.id, f.anzahl, f.rang);
        if (heer) {
          f.ids = heer.ids;
          events.push({ t: 'bossNaht', player: p.id, boss: st.boss, q: heer.q, r: heer.r, anzahl: heer.ids.length });
        } else {
          // Kein Weg ins Reich - dann verlangt der Boss Wachstum statt Blut.
          const start = Object.values(s.buildings).filter((b) => b.owner === p.id).length;
          st.forderung = { t: 'ziel', mass: 'siedlungen', start, soll: start + 1 };
        }
      }
      // Wer gepluendert hat, ist entkommen - dann ist der Akt nicht mehr zu
      // gewinnen. Nur echte Beute zaehlt, und es wird laut gesagt (Spieltest 11:
      // "der Akt war still verloren, ich dachte, ich gewinne den Kampf").
      if (f.ids && !f.entkommen && s.units.some((u) => f.ids!.includes(u.id) && u.traegt > 0)) {
        f.entkommen = true;
        events.push({ t: 'bossEntkommen', player: p.id, boss: st.boss });
      }
    }

    // Frueh geschafft: sofort belohnen.
    if (erfuellt(s, p.id, st.forderung, punkte)) besiegt(s, st, p.id, events);
  }
}

/** Den Lohn eines bezwungenen Bosses nehmen. Gibt einen Grund zurueck, wenn es nicht geht. */
export function bossLohnNehmen(s: GameState, id: PlayerId, wahl: BossLohn, events: Ereignisse): string | null {
  const p = playerById(s, id);
  if (!p) return 'Unbekannter Spieler.';
  const bot = (s.bots ?? []).includes(id);
  if (!bot && !p.bossLohn?.includes(wahl)) return 'Dieser Lohn steht nicht zur Wahl.';
  p.bossLohn = null;
  if (wahl === 'trophaee') p.trophaeen = (p.trophaeen ?? 0) + 1;
  else if (wahl === 'schmiede') p.schmiede = (p.schmiede ?? 0) + 2;
  else if (wahl === 'relikt') heldFolge(s, p, { relikt: 'zufall', xp: 2 }, events);
  else geben(s, id, 3, 'boss', events);
  events.push({ t: 'bossLohn', player: id, wahl });
  return null;
}

/**
 * Tribut einzahlen: so viele Karten dieser Sorte, wie noch fehlen und auf der
 * Hand liegen. Gibt einen Grund zurueck, wenn es nicht geht.
 */
export function bossZahlen(s: GameState, id: PlayerId, r: Resource, events: Ereignisse): string | null {
  const st = s.akte?.stand[id];
  if (!st || st.ergebnis !== 'offen' || st.forderung.t !== 'tribut') return 'Es wird kein Tribut gefordert.';
  const p = playerById(s, id);
  if (!p) return 'Unbekannter Spieler.';
  const f = st.forderung;
  const fehlt = (f.soll[r] ?? 0) - (f.gezahlt[r] ?? 0);
  if (fehlt <= 0) return 'Davon ist genug gezahlt.';
  const n = Math.min(fehlt, p.hand[r]);
  if (n <= 0) return 'Davon hast du nichts auf der Hand.';
  p.hand[r] -= n;
  f.gezahlt = { ...f.gezahlt, [r]: (f.gezahlt[r] ?? 0) + n };
  events.push({ t: 'bossGezahlt', player: id, resource: r, anzahl: n });
  return null;
}
