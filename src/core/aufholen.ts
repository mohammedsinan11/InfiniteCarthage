/**
 * Rivalen holen auf: ein Bot, der weit zurueckliegt, bekommt Hilfe.
 *
 * Spieltest 5: "20 zu 8 gewonnen, ohne das Heer anzufassen". Die Bots spielen
 * nach festen Vorlieben und handeln schlechter als ein Mensch - ohne Hilfe
 * verlieren sie das Rennen frueh, und dann fehlt der Druck. Liegt ein Bot drei
 * oder mehr sichtbare Punkte hinter dem Fuehrenden, bekommt er bei jedem
 * eigenen Wurf eine Karte seiner knappsten Sorte. Offen, nicht versteckt: das
 * Ereignis steht im Protokoll, und die Lobby sagt es beim Bot dazu.
 *
 * Nur in Partien mit Ereignissen und nur fuer Plaetze, die der Raum als Bot
 * meldet (state.bots).
 */

import { RESOURCES } from './types';
import type { Resource } from './types';
import { publicPoints } from './state';
import type { GameState, PlayerId } from './state';

/** Ab so vielen Punkten Rueckstand hilft das Spiel nach. */
export const AUFHOLEN_AB = 3;

export type AufholenEvent = { t: 'botCatchUp'; player: PlayerId; resource: Resource };

type Ereignisse = { push(...e: AufholenEvent[]): number };

export function botAufholen(s: GameState, id: PlayerId, events: Ereignisse): void {
  if (!s.ereignisseAn || !s.bots?.includes(id)) return;
  const p = s.players.find((x) => x.id === id);
  if (!p || p.besiegt) return;
  const vorn = Math.max(...s.players.filter((x) => !x.besiegt).map((x) => publicPoints(s, x.id)));
  if (vorn - publicPoints(s, id) < AUFHOLEN_AB) return;
  const r = RESOURCES.reduce((a, b) => (p.hand[b] < p.hand[a] ? b : a));
  p.hand[r] += 1;
  events.push({ t: 'botCatchUp', player: id, resource: r });
}
