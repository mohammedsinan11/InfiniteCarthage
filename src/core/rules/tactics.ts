/** Ausspielbare Karten fuer Heilung und die naechste Heeresrunde. */

import { cardById } from '../cards/catalog';
import { cardKind, taktikwirkungen } from '../cards/types';
import type { TacticEffect } from '../cards/types';
import { imKampf } from '../combat';
import { maxLeben } from '../combat';
import { befehlbar } from '../units';
import type { GameState, PlayerId, TacticBuff, UnitState } from '../state';

export type TacticEvent = {
  t: 'tacticPlayed';
  player: PlayerId;
  card: string;
  units: number[];
};

type Ereignisse = { push(...e: TacticEvent[]): number };

/**
 * Wie viele Runden ein ausgespielter Puffer auf seinen Einsatz wartet.
 *
 * s.turn zaehlt jedes endTurn IRGENDEINES Spielers, nicht eine ganze Runde
 * aller - ein Fenster von nur einer Runde traf den naechsten tickArmy oft
 * genug, aber nicht sicher: kaempfte das Ziel ausgerechnet in genau diesem
 * einen Zug nicht, verpuffte die Karte spurlos, obwohl die Truppe kurz danach
 * durchaus in den Kampf zog. Ein paar Runden Vorlauf geben dem vorbereiteten
 * Kampf eine echte Chance, ohne den Puffer auf Dauer zu halten.
 */
const TAKTIK_FENSTER = 3;

const IST_PUFFER = new Set<TacticBuff['kind']>([
  'attack',
  'cover',
  'morale',
  'siege',
  'heroReroll',
  'rangedAttack',
]);

function einheitenAmZiel(s: GameState, ziel: UnitState): UnitState[] {
  return s.units.filter(
    (u) => u.owner === ziel.owner && u.q === ziel.q && u.r === ziel.r && befehlbar(u.kind),
  );
}

const pufferArt = (e: TacticEffect): TacticBuff['kind'] | null =>
  IST_PUFFER.has(e.t as TacticBuff['kind']) ? (e.t as TacticBuff['kind']) : null;

export function playTactic(
  s: GameState,
  player: PlayerId,
  cardId: string,
  unitId: number,
  events: Ereignisse,
): string | null {
  const p = s.players.find((x) => x.id === player);
  if (!p) return 'Unbekannter Spieler.';
  const index = p.tactics.indexOf(cardId);
  if (index < 0) return 'Diese Taktikkarte hast du nicht.';
  const card = cardById(cardId);
  if (!card || cardKind(card) !== 'taktik') return 'Das ist keine Taktikkarte.';
  const ziel = s.units.find((u) => u.id === unitId && u.owner === player);
  if (!ziel || !befehlbar(ziel.kind)) return 'Waehle eine eigene Einheit.';
  const wirkungen = taktikwirkungen(card);
  const feld = einheitenAmZiel(s, ziel);

  // Erst alles pruefen, damit ein spaeter Fehler keine halbe Karte ausloest.
  for (const e of wirkungen) {
    if (e.t === 'healUnit' && e.heroOnly && ziel.kind !== 'held') return 'Diese Karte braucht einen Helden.';
    if (e.t === 'healUnit' && imKampf(s, ziel)) return 'Im laufenden Kampf kann diese Wunde nicht versorgt werden.';
    if (e.t === 'healField' && feld.some((u) => imKampf(s, u))) return 'Auf diesem Feld wird noch gekaempft.';
    if (e.t === 'heroReroll' && ziel.kind !== 'held') return 'Diese Karte braucht einen Helden.';
    if (e.t === 'rangedAttack' && ziel.kind !== 'bogen') return 'Diese Karte braucht einen Bogenschuetzen.';
    const art = pufferArt(e);
    if (art && s.tacticBuffs.some((b) => b.player === player && b.kind === art && b.units.some((id) => feld.some((u) => u.id === id)))) {
      return 'Eine gleichartige Taktik wirkt auf diese Truppen bereits.';
    }
  }

  for (const e of wirkungen) {
    if (e.t === 'healUnit') {
      ziel.leben = Math.min(maxLeben(ziel), ziel.leben + e.amount);
      continue;
    }
    if (e.t === 'healField') {
      for (const u of feld) u.leben = Math.min(maxLeben(u), u.leben + e.amount);
      continue;
    }
    const art = pufferArt(e);
    if (!art) continue;
    const nurZiel = e.t === 'heroReroll' || e.t === 'rangedAttack';
    s.tacticBuffs.push({
      player,
      kind: art,
      units: nurZiel ? [ziel.id] : feld.map((u) => u.id),
      amount: 'amount' in e ? e.amount : 1,
      expiresTurn: s.turn + TAKTIK_FENSTER,
    });
  }

  p.tactics.splice(index, 1);
  events.push({ t: 'tacticPlayed', player, card: cardId, units: feld.map((u) => u.id) });
  return null;
}

export function tacticBonus(
  s: Pick<GameState, 'tacticBuffs' | 'turn'>,
  kind: TacticBuff['kind'],
  unit: Pick<UnitState, 'id' | 'owner'>,
): number {
  if (unit.owner === null) return 0;
  return s.tacticBuffs
    .filter((b) => b.expiresTurn >= s.turn && b.player === unit.owner && b.kind === kind && b.units.includes(unit.id))
    .reduce((n, b) => Math.max(n, b.amount), 0);
}

export const hasTactic = (
  s: Pick<GameState, 'tacticBuffs' | 'turn'>,
  kind: TacticBuff['kind'],
  unit: Pick<UnitState, 'id' | 'owner'>,
): boolean => tacticBonus(s, kind, unit) > 0;

export function clearExpiredTactics(s: Pick<GameState, 'tacticBuffs' | 'turn'>): void {
  s.tacticBuffs = s.tacticBuffs.filter((b) => b.expiresTurn > s.turn);
}
