/**
 * Siegwege: mehr als ein Weg zum Sieg.
 *
 * Bisher gewann nur, wer zuerst die Siegpunkte beisammen hatte - jede Partie
 * lief auf dieselbe Rechnung hinaus. Jetzt gewinnt auch, wer auf einem
 * eigenen Weg weit genug kommt: als Eroberer, Entdecker, Wunderbauer oder
 * Handelsfuerst (REPLAYABILITY.md, D - alternative victories). Das laesst
 * Strategien auseinanderlaufen und gibt dem Haus und der Welt, die man
 * gewuerfelt hat, eine Richtung: im Grenzland lockt der Eroberer, im Archipel
 * der Handel.
 *
 * Nur in gewoehnlichen Partien mit Siegpunktziel und Ereignissen (die neuen
 * Raeume) - nicht gemeinsam, nicht im Szenario, nicht in alten Staenden. Die
 * Schwellen wachsen mit dem Siegpunktziel.
 */

import type { GameState, PlayerId } from './state';

export type SiegwegId = 'eroberer' | 'entdecker' | 'wunderbauer' | 'handelsfuerst';

export type Siegweg = {
  id: SiegwegId;
  name: string;
  /** Was zu tun ist - mit {n} fuer die Schwelle. */
  text: string;
  /** Die Schwelle bei 20 Siegpunkten Ziel. */
  basis: number;
  /** Waechst die Schwelle mit dem Ziel? Wunder nicht - es gibt zu wenige Staetten. */
  waechst: boolean;
};

export const SIEGWEGE: readonly Siegweg[] = [
  { id: 'eroberer', name: 'Eroberer', text: 'Zerstoere {n} Lager.', basis: 5, waechst: true },
  { id: 'entdecker', name: 'Entdecker', text: 'Erkunde {n} Ruinen.', basis: 6, waechst: true },
  { id: 'wunderbauer', name: 'Wunderbauer', text: 'Errichte {n} Weltwunder.', basis: 2, waechst: false },
  { id: 'handelsfuerst', name: 'Handelsfuerst', text: 'Handle {n} Mal.', basis: 40, waechst: true },
];

type Sicht = Pick<GameState, 'targetPoints'> & {
  koop?: boolean;
  szenario?: string | null;
  ereignisseAn?: boolean;
  chronik?: GameState['chronik'] | null;
  wunder?: GameState['wunder'];
};

/** Gelten Siegwege in dieser Partie? */
export const siegwegeAn = (s: Sicht): boolean => s.targetPoints > 0 && !s.koop && !s.szenario && s.ereignisseAn === true;

/** Die Schwelle dieses Weges bei diesem Ziel. */
export const schwelle = (w: Siegweg, ziel: number): number =>
  w.waechst ? Math.max(w.basis, Math.round((w.basis * ziel) / 20)) : w.basis;

/** Wie weit dieser Spieler auf diesem Weg ist. */
export function fortschritt(s: Sicht, id: PlayerId, w: Siegweg): number {
  const st = s.chronik?.stats[id];
  switch (w.id) {
    case 'eroberer':
      return st?.lager ?? 0;
    case 'entdecker':
      return st?.ruinen ?? 0;
    case 'wunderbauer':
      return Object.values(s.wunder ?? {}).filter((x) => x.owner === id).length;
    case 'handelsfuerst':
      return st?.handel ?? 0;
  }
}

/** Der erste erfuellte Weg dieses Spielers - oder null. */
export function erfuellterWeg(s: Sicht, id: PlayerId): Siegweg | null {
  if (!siegwegeAn(s)) return null;
  return SIEGWEGE.find((w) => fortschritt(s, id, w) >= schwelle(w, s.targetPoints)) ?? null;
}

export const siegwegById = (id: string | undefined): Siegweg | undefined => SIEGWEGE.find((w) => w.id === id);

/** Der Text mit eingesetzter Schwelle. */
export const siegwegText = (w: Siegweg, ziel: number): string => w.text.replace('{n}', String(schwelle(w, ziel)));
