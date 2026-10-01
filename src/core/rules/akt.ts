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
import type { GameState, PlayerId } from '../state';
import { RESOURCES } from '../types';
import type { Resource } from '../types';
import { bossHeerAufstellen } from './army';

export type AktEvent =
  /** Ein neuer Akt beginnt - mit diesem Boss gegen diesen Spieler. */
  | { t: 'aktBeginn'; player: PlayerId; akt: number; boss: string; bis: number }
  /** Das Heer eines Bosses bricht auf. */
  | { t: 'bossNaht'; player: PlayerId; boss: string; q: number; r: number; anzahl: number }
  | { t: 'bossBesiegt'; player: PlayerId; akt: number; boss: string; punkte: number }
  | { t: 'bossVerfehlt'; player: PlayerId; akt: number; boss: string; verloren: number }
  /** Tribut eingezahlt. */
  | { t: 'bossGezahlt'; player: PlayerId; resource: Resource; anzahl: number };

type Ereignisse = { push(...e: AktEvent[]): number };

const punkteVon = (s: GameState) => (id: PlayerId) => publicPoints(s, id);

/** Bestanden: Siegpunkte in Hoehe der Aktzahl und eine Trophaee. */
function besiegt(s: GameState, st: BossStand, id: PlayerId, events: Ereignisse): void {
  st.ergebnis = 'besiegt';
  const akte = s.akte!;
  akte.siege[id] = [...(akte.siege[id] ?? []), st.akt];
  const p = playerById(s, id);
  if (p) p.trophaeen = (p.trophaeen ?? 0) + 1;
  events.push({ t: 'bossBesiegt', player: id, akt: st.akt, boss: st.boss, punkte: st.akt });
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
      // Wer gepluendert hat, ist entkommen - dann ist der Akt nicht mehr zu gewinnen.
      if (f.ids && s.units.some((u) => f.ids!.includes(u.id) && (u.traegt > 0 || u.auftrag === 'heimkehr'))) f.entkommen = true;
    }

    // Frueh geschafft: sofort belohnen.
    if (erfuellt(s, p.id, st.forderung, punkte)) besiegt(s, st, p.id, events);
  }
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
