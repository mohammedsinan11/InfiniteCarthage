/** Ruhm: der gemeinsame Fortschrittspfad fuer Kampf, Auftraege und Veteranen. */

import { istSpielerSeite, spielerAus } from '../combat';
import type { GameState, PlayerId } from '../state';

export const RUHM_SCHWELLE = 5;

export type RuhmEvent = {
  t: 'glory';
  player: PlayerId;
  amount: number;
  reason: 'lager' | 'auftrag' | 'veteran' | 'morast';
};

type Ereignis = { t: string } & Record<string, unknown>;
type Ausgabe = { push(...e: RuhmEvent[]): number };

function fuehrer(s: GameState): PlayerId | null {
  const alt = s.ruhmreichster;
  let best = alt;
  let wert = alt ? (s.players.find((p) => p.id === alt)?.ruhm ?? RUHM_SCHWELLE - 1) : RUHM_SCHWELLE - 1;
  for (const p of s.players) {
    if (p.ruhm >= RUHM_SCHWELLE && p.ruhm > wert) {
      best = p.id;
      wert = p.ruhm;
    }
  }
  return best;
}

function geben(s: GameState, id: PlayerId, amount: number, reason: RuhmEvent['reason'], out: Ausgabe): void {
  const p = s.players.find((x) => x.id === id);
  if (!p || amount <= 0) return;
  p.ruhm += amount;
  out.push({ t: 'glory', player: id, amount, reason });
}

/** Ereignisse einer erfolgreichen Aktion genau einmal in Ruhm umrechnen. */
export function ruhmAusEreignissen(s: GameState, geschehen: readonly Ereignis[], out: Ausgabe): void {
  for (const e of geschehen) {
    if (e.t === 'nestDestroyed') {
      for (const id of (e.players as PlayerId[] | undefined) ?? []) geben(s, id, 2, 'lager', out);
    } else if (e.t === 'questDone') {
      geben(s, e.player as PlayerId, 1, 'auftrag', out);
    } else if (e.t === 'levelUp' && ((e.stufe as number) === 2 || (e.stufe as number) === 4)) {
      geben(s, e.player as PlayerId, 1, 'veteran', out);
    } else if (e.t === 'fight') {
      const verluste = (e.verluste as Array<{ kind: string }> | undefined) ?? [];
      if (!verluste.some((v) => v.kind === 'morast')) continue;
      const spieler = new Set(
        ((e.seiten as string[] | undefined) ?? []).filter(istSpielerSeite).map(spielerAus),
      );
      for (const id of spieler) geben(s, id, 3, 'morast', out);
    }
  }
  s.ruhmreichster = fuehrer(s);
}
