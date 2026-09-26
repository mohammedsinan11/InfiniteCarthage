/**
 * Untergang: was passiert, wenn das Reich faellt.
 *
 * Bisher konnte einem Spieler nichts wirklich passieren: sein letztes Gebaeude
 * brannte nie nieder ("ein Ueberfall soll schmerzen, nicht die Partie
 * beenden"). Die Folge war, dass Raubzuege nur verzoegern konnten, nie
 * bedrohen - eine Verzoegerung ohne Gefahr fuehlt sich nicht wie
 * Herausforderung an, sondern wie Wartezeit.
 *
 * Jetzt kann auch das letzte Gebaeude fallen. Das ist selten - Feuer laesst
 * sich mit einer einzigen Karte loeschen, Tuerme und Festungsringe halten es
 * fern, ein Ritter daneben loescht es von selbst - aber es ist moeglich, und
 * wer nur ein Dorf hat, spuert es.
 *
 *   FALL      Steht kein Gebaeude mehr, beginnt eine Frist: UNTERGANG_ZUEGE
 *             eigene Zuege. In dieser Zeit darf der Spieler eine Siedlung
 *             ueberall setzen (auch ohne eigene Strasse davor), zum
 *             gewohnten Preis.
 *   RETTUNG   Steht wieder eines, endet die Frist.
 *   UNTERGANG Ist die Frist ohne Gebaeude verstrichen, scheidet der Spieler
 *             aus (besiegt). Er kommt nicht mehr an die Reihe.
 *
 * Das Ende der Partie: sind alle besiegt, ist sie verloren (winner null). Bleibt
 * bei mehr als einem Spieler nur einer uebrig, gewinnt der.
 */

import type { GameState, PlayerId } from '../state';

/** Eigene Zuege, die bleiben, um nach dem letzten Gebaeude wieder eines zu setzen. */
export const UNTERGANG_ZUEGE = 3;

export type UntergangEvent =
  | { t: 'fall'; player: PlayerId; bis: number }
  | { t: 'recovered'; player: PlayerId }
  | { t: 'defeated'; player: PlayerId }
  | { t: 'lost' };

type Ereignisse = { push(...e: (UntergangEvent | { t: 'win'; player: PlayerId })[]): number };

export const gebaeudeVon = (s: Pick<GameState, 'buildings'>, id: PlayerId): number =>
  Object.values(s.buildings).filter((b) => b.owner === id).length;

/** Steht dieser Spieler gerade vor dem Untergang? Dann gilt fuer ihn ein Notbau. */
export const imUntergang = (s: Pick<GameState, 'buildings' | 'players'>, id: PlayerId): boolean => {
  const p = s.players.find((x) => x.id === id);
  return !!p && !p.besiegt && p.untergang !== null && p.untergang !== undefined && gebaeudeVon(s, id) === 0;
};

/** Wer noch im Spiel ist, in Zugreihenfolge. */
export const imSpiel = (s: Pick<GameState, 'order' | 'players'>): PlayerId[] =>
  s.order.filter((id) => !s.players.find((p) => p.id === id)?.besiegt);

/**
 * Am Ende jedes Zuges: Faelle, Rettungen und Untergaenge feststellen, dann
 * pruefen, ob die Partie damit entschieden ist.
 */
export function untergangRunde(s: GameState, events: Ereignisse): void {
  if (s.phase.t === 'finished') return;
  for (const p of s.players) {
    if (p.besiegt) continue;
    const da = gebaeudeVon(s, p.id) > 0;
    if (da) {
      if (p.untergang !== null && p.untergang !== undefined) {
        p.untergang = null;
        events.push({ t: 'recovered', player: p.id });
      }
      continue;
    }
    // Vor dem ersten Aufbau steht noch nichts - das ist kein Fall.
    if (s.phase.t === 'setup') continue;
    if (p.untergang === null || p.untergang === undefined) {
      p.untergang = s.turn + UNTERGANG_ZUEGE * s.order.length;
      events.push({ t: 'fall', player: p.id, bis: p.untergang });
    } else if (s.turn >= p.untergang) {
      p.besiegt = true;
      p.untergang = null;
      events.push({ t: 'defeated', player: p.id });
    }
  }

  const uebrig = imSpiel(s);
  if (uebrig.length === 0) {
    s.phase = { t: 'finished', winner: null };
    events.push({ t: 'lost' });
  } else if (s.order.length > 1 && uebrig.length === 1) {
    s.phase = { t: 'finished', winner: uebrig[0]! };
    events.push({ t: 'win', player: uebrig[0]! });
  }
}

/** Den Zug an den naechsten weiterreichen, der noch im Spiel ist. */
export function ueberspringeBesiegte(s: GameState): void {
  for (let i = 0; i < s.order.length; i++) {
    const id = s.order[s.current]!;
    if (!s.players.find((p) => p.id === id)?.besiegt) return;
    s.current = (s.current + 1) % s.order.length;
  }
}
