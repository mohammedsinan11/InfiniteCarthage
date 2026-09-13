/**
 * Auftraege der Wanderer.
 *
 * Kommt ein Wanderer an einer Siedlung vorbei - auf ihrem Feld oder daneben -,
 * bietet er ihrem Besitzer einen Auftrag an: ein Lager in seiner Naehe
 * zerstoeren oder eine Ruine erkunden. Wer annimmt und ihn erfuellt, bekommt
 * eine Kartenwahl als Beute (Player.loot) - zusaetzlich zu dem, was Lager oder
 * Ruine selbst hergeben.
 *
 *   Angebot   6 Runden Bedenkzeit, dann zieht es der Wanderer zurueck.
 *   Frist     30 Runden ab Annahme.
 *   Erfuellt  Lager: die eigenen Ritter oder der Held zerstoeren es.
 *             Ruine: ein eigener Ritter oder der Held erkundet sie.
 *   Verloren  wenn jemand anderes zuvorkommt.
 *
 * Jeder Wanderer bietet jedem Spieler hoechstens einen Auftrag an, und
 * niemand hat mehr als drei offene. Die Ziele liegen auf der aufgedeckten
 * Karte, damit man sie auch findet.
 */

import type { Rng } from '../rng';
import { hexDistance, hexKey, hexesInRange, neighbors } from '../coords';
import type { Hex } from '../coords';
import { feindlich, spielerSeite } from '../combat';
import { ruinAt } from '../ruins';
import { isNestActive, nestFraktionOf, settlementApproaches } from '../units';
import { isGenerated } from '../world';
import type { World } from '../world';
import { playerById } from '../state';
import type { GameState, PlayerId, WandererAuftrag } from '../state';
import type { ArmyEvent } from './army';

export const ANGEBOT_RUNDEN = 6;
export const AUFTRAG_RUNDEN = 30;
/** So weit um den Wanderer sucht er ein Ziel. */
export const AUFTRAG_REICHWEITE = 10;
export const MAX_AUFTRAEGE = 3;

export type AuftragEvent =
  | {
      t: 'questOffered';
      player: PlayerId;
      id: number;
      art: WandererAuftrag['art'];
      q: number;
      r: number;
      fraktion: string | null;
    }
  | { t: 'questAccepted'; player: PlayerId; id: number }
  | { t: 'questDone'; player: PlayerId; id: number; art: WandererAuftrag['art'] }
  | {
      t: 'questFailed';
      player: PlayerId;
      id: number;
      art: WandererAuftrag['art'];
      grund: 'abgelaufen' | 'verloren';
    };

type Ereignisse = { push(...e: AuftragEvent[]): number };

const offen = (a: WandererAuftrag) => a.status !== 'abgelehnt';

/** Ein Ziel fuer einen Auftrag nahe dem Wanderer, oder null. */
function zielFuer(
  s: GameState,
  world: World,
  rng: Rng,
  player: PlayerId,
  von: Hex,
): Pick<WandererAuftrag, 'art' | 'q' | 'r' | 'fraktion'> | null {
  const vergeben = new Set(
    s.auftraege.filter((a) => a.player === player && offen(a)).map((a) => hexKey(a.q, a.r)),
  );
  const lager: Hex[] = [];
  const ruinen: Hex[] = [];
  for (const h of hexesInRange(von, AUFTRAG_REICHWEITE)) {
    const k = hexKey(h.q, h.r);
    if (vergeben.has(k) || !isGenerated(world, h.q, h.r)) continue;
    if (isNestActive(s, h.q, h.r)) {
      if (feindlich(spielerSeite(player), nestFraktionOf(s, h.q, h.r), s)) lager.push(h);
    } else if (ruinAt(s.worldSeed, h.q, h.r) && !s.exploredRuins.includes(k)) {
      ruinen.push(h);
    }
  }
  const nachNaehe = (a: Hex, b: Hex) => hexDistance(von, a) - hexDistance(von, b) || a.q - b.q || a.r - b.r;
  lager.sort(nachNaehe);
  ruinen.sort(nachNaehe);
  const arten = [...(lager.length > 0 ? ['lager' as const] : []), ...(ruinen.length > 0 ? ['ruine' as const] : [])];
  if (arten.length === 0) return null;
  const art = arten[rng.int(arten.length)]!;
  const liste = art === 'lager' ? lager : ruinen;
  // Eines der drei naechsten - nicht immer dasselbe, aber nie am anderen Ende.
  const h = liste[rng.int(Math.min(3, liste.length))]!;
  return { art, q: h.q, r: h.r, fraktion: art === 'lager' ? nestFraktionOf(s, h.q, h.r) : null };
}

/** Nach jeder Runde: Wanderer an Siedlungen bieten Auftraege an. */
export function wandererBieten(s: GameState, world: World, rng: Rng, events: Ereignisse): void {
  const wanderer = s.units.filter((u) => u.kind === 'wanderer').sort((a, b) => a.id - b.id);
  if (wanderer.length === 0) return;
  const an = settlementApproaches(s);
  for (const w of wanderer) {
    const besitzer = new Set<PlayerId>();
    for (const h of [w, ...neighbors(w.q, w.r)]) {
      const o = an.get(hexKey(h.q, h.r));
      if (o !== undefined) besitzer.add(o);
    }
    for (const player of [...besitzer].sort()) {
      if (s.auftraege.some((a) => a.player === player && a.wanderer === w.id)) continue;
      if (s.auftraege.filter((a) => a.player === player && offen(a)).length >= MAX_AUFTRAEGE) continue;
      const ziel = zielFuer(s, world, rng, player, w);
      if (!ziel) continue;
      const auftrag: WandererAuftrag = {
        id: s.nextAuftragId++,
        player,
        ...ziel,
        status: 'angebot',
        bis: s.turn + ANGEBOT_RUNDEN,
        wanderer: w.id,
      };
      s.auftraege.push(auftrag);
      events.push({ t: 'questOffered', player, id: auftrag.id, art: auftrag.art, q: auftrag.q, r: auftrag.r, fraktion: auftrag.fraktion });
    }
  }
}

/** Einen Auftrag annehmen oder ablehnen. null bei Erfolg, sonst der Grund. */
export function aufAuftragAntworten(
  s: GameState,
  actor: PlayerId,
  id: number,
  annehmen: boolean,
  events: Ereignisse,
): string | null {
  const a = s.auftraege.find((x) => x.id === id);
  if (!a || a.player !== actor) return 'Diesen Auftrag gibt es nicht.';
  if (a.status !== 'angebot') return 'Darauf hast du schon geantwortet.';
  if (annehmen) {
    a.status = 'angenommen';
    a.bis = s.turn + AUFTRAG_RUNDEN;
    events.push({ t: 'questAccepted', player: actor, id });
  } else {
    // Bleibt als Absage stehen, bis die Bedenkzeit um ist - so fragt derselbe
    // Wanderer nicht in der naechsten Runde gleich wieder.
    a.status = 'abgelehnt';
  }
  return null;
}

type Nest = Extract<ArmyEvent, { t: 'nestDestroyed' }>;
type Ruine = Extract<ArmyEvent, { t: 'ruin' }>;

/**
 * Nach jeder Runde: erfuellte, verlorene und abgelaufene Auftraege.
 *
 * geschehen sind die Ereignisse dieser Runde - nur dort steht, WER ein Lager
 * zerstoert oder eine Ruine erkundet hat.
 */
export function auftraegePruefen(
  s: GameState,
  geschehen: ReadonlyArray<{ t: string } & Record<string, unknown>>,
  events: Ereignisse,
): void {
  if (s.auftraege.length === 0) return;
  const stand = (a: WandererAuftrag): 'offen' | 'erfuellt' | 'verloren' => {
    if (a.art === 'lager') {
      const fiel = geschehen.find((e): e is Nest => e.t === 'nestDestroyed' && (e as Nest).q === a.q && (e as Nest).r === a.r);
      if (fiel) return fiel.players.includes(a.player) ? 'erfuellt' : 'verloren';
      return isNestActive(s, a.q, a.r) ? 'offen' : 'verloren';
    }
    const erkundet = geschehen.find((e): e is Ruine => e.t === 'ruin' && (e as Ruine).q === a.q && (e as Ruine).r === a.r);
    if (erkundet) return erkundet.player === a.player ? 'erfuellt' : 'verloren';
    return s.exploredRuins.includes(hexKey(a.q, a.r)) ? 'verloren' : 'offen';
  };

  s.auftraege = s.auftraege.filter((a) => {
    const jetzt = stand(a);
    if (a.status !== 'angenommen') return jetzt === 'offen' && s.turn <= a.bis;
    if (jetzt === 'erfuellt') {
      const p = playerById(s, a.player);
      if (p) p.loot += 1;
      events.push({ t: 'questDone', player: a.player, id: a.id, art: a.art });
      return false;
    }
    if (jetzt === 'verloren' || s.turn > a.bis) {
      events.push({
        t: 'questFailed',
        player: a.player,
        id: a.id,
        art: a.art,
        grund: jetzt === 'verloren' ? 'verloren' : 'abgelaufen',
      });
      return false;
    }
    return true;
  });
}
