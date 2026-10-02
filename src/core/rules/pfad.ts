/**
 * Der Heldenpfad im Ablauf (core/heldenpfad.ts): Ziele anbieten, aufbrechen,
 * ankommen, Proben wuerfeln, Erfahrung und Eigenschaften, Relikte.
 */

import {
  RELIKTE,
  eigenschaftAngebot,
  eigenschaftById,
  heldStufeVon,
  lebenBonus,
  pfadZiele,
  probeBonus,
  zufallsRelikt,
} from '../heldenpfad';
import type { PfadZiel, Probe } from '../heldenpfad';
import { hexDistance, hexKey, hexesInRange } from '../coords';
import { ruinAt } from '../ruins';
import { isLandAt, isNestActive, nestFraktionOf } from '../units';
import { fraktionIn } from '../fraktionsleben';
import { hatSystem } from '../systeme';
import { hash3i } from '../hash';
import { Rng } from '../rng';
import { maxLeben } from '../combat';
import { playerById } from '../state';
import type { GameState, Player, PlayerId, UnitState } from '../state';
import type { Folge } from '../ereignis';

export type PfadEvent =
  | { t: 'pfadAngebot'; player: PlayerId; anzahl: number }
  | { t: 'pfadAufbruch'; player: PlayerId; name: string; q: number; r: number }
  | { t: 'pfadAnkunft'; player: PlayerId; name: string; begegnung: string }
  | { t: 'heldStufe'; player: PlayerId; stufe: number }
  | { t: 'eigenschaft'; player: PlayerId; id: string }
  | { t: 'relikt'; player: PlayerId; id: string }
  | { t: 'relikteVerloren'; player: PlayerId; anzahl: number };

type Ereignisse = { push(...e: PfadEvent[]): number };

/** So weit sucht der Pfad nach Zielen um den Helden. */
const PFAD_WEITE = 12;

export const heldVon = (s: GameState, id: PlayerId): UnitState | undefined =>
  s.units.find((u) => u.owner === id && u.kind === 'held' && !u.zweig);

const istBot = (s: GameState, id: PlayerId) => (s.bots ?? []).includes(id);

/** Zum Beginn jeder grossen Runde: dem Helden Ziele anbieten (nur Menschen). */
export function pfadRunde(s: GameState, events: Ereignisse): void {
  if (!s.ereignisseAn || !hatSystem(s, 'held')) return;
  for (const p of s.players) {
    if (p.besiegt || istBot(s, p.id)) continue;
    const held = heldVon(s, p.id);
    if (!held) continue;
    const stand = s.pfade?.[p.id];
    if (stand?.aktiv || stand?.angebot) continue;
    let ruine: { q: number; r: number; d: number } | null = null;
    let lager: { q: number; r: number; d: number; name: string } | null = null;
    const orte: { q: number; r: number }[] = [];
    for (const h of hexesInRange(held, PFAD_WEITE)) {
      const d = hexDistance(held, h);
      if (d < 2 || !isLandAt(s.worldSeed, h.q, h.r)) continue;
      const k = hexKey(h.q, h.r);
      if (ruinAt(s.worldSeed, h.q, h.r) && !s.exploredRuins.includes(k)) {
        if (!ruine || d < ruine.d) ruine = { q: h.q, r: h.r, d };
      } else if (isNestActive(s, h.q, h.r)) {
        if (!lager || d < lager.d) lager = { q: h.q, r: h.r, d, name: fraktionIn(s, nestFraktionOf(s, h.q, h.r)).name };
      } else if (d >= 5 && d <= 9 && hash3i(s.worldSeed, h.q, h.r, 421) % 23 === 0) {
        orte.push({ q: h.q, r: h.r });
      }
    }
    const angebot = pfadZiele(s.worldSeed, s.turn, s.order.indexOf(p.id), ruine, lager, orte);
    if (angebot.length === 0) continue;
    s.pfade = { ...(s.pfade ?? {}), [p.id]: { angebot, aktiv: null } };
    events.push({ t: 'pfadAngebot', player: p.id, anzahl: angebot.length });
  }
}

/** Ein Ziel waehlen (oder keines): der Held bricht auf. */
export function pfadWaehlen(s: GameState, id: PlayerId, index: number | null, events: Ereignisse): string | null {
  const stand = s.pfade?.[id];
  if (!stand?.angebot) return 'Es steht kein Pfad zur Wahl.';
  if (index === null) {
    s.pfade = { ...s.pfade, [id]: { angebot: null, aktiv: null } };
    return null;
  }
  const ziel = stand.angebot[index];
  if (!ziel) return 'Diesen Pfad gibt es nicht.';
  const held = heldVon(s, id);
  if (!held) return 'Dein Held ist nicht auf der Karte.';
  held.ziel = { q: ziel.q, r: ziel.r };
  held.auftrag = 'befehl';
  s.pfade = { ...s.pfade, [id]: { angebot: null, aktiv: ziel } };
  events.push({ t: 'pfadAufbruch', player: id, name: ziel.name, q: ziel.q, r: ziel.r });
  return null;
}

/** Nach jeder Aktion: ist ein Held angekommen? Dann wartet die Begegnung. */
export function pfadAnkunft(s: GameState, events: Ereignisse): void {
  for (const [id, stand] of Object.entries(s.pfade ?? {})) {
    const z: PfadZiel | null = stand.aktiv;
    if (!z) continue;
    const held = heldVon(s, id);
    const p = playerById(s, id);
    if (!held || !p) continue;
    if (hexDistance(held, z) > (z.art === 'lager' ? 1 : 0)) continue;
    p.begegnung = z.begegnung;
    s.pfade = { ...s.pfade, [id]: { angebot: null, aktiv: null } };
    events.push({ t: 'pfadAnkunft', player: id, name: z.name, begegnung: z.begegnung });
  }
}

/** Erfahrung fuer den Helden; eine neue Stufe bietet drei Eigenschaften an. */
export function heldWachsen(s: GameState, p: Player, xp: number, events: Ereignisse): void {
  if (xp <= 0) return;
  const vorher = heldStufeVon(p.heldXp ?? 0);
  p.heldXp = (p.heldXp ?? 0) + xp;
  const nachher = heldStufeVon(p.heldXp);
  if (nachher > vorher) {
    events.push({ t: 'heldStufe', player: p.id, stufe: nachher });
    const angebot = eigenschaftAngebot(s.worldSeed, nachher, s.order.indexOf(p.id), p.eigenschaften ?? []);
    if (angebot.length > 0) {
      // Bots nehmen die erste - sie haben keine Tafel.
      if (istBot(s, p.id)) eigenschaftNehmen(s, p, angebot[0]!, events);
      else p.eigenschaftAngebot = angebot;
    }
  }
}

function eigenschaftNehmen(s: GameState, p: Player, id: string, events: Ereignisse): void {
  p.eigenschaften = [...(p.eigenschaften ?? []), id];
  p.eigenschaftAngebot = null;
  // Mehr Leben gilt sofort fuer den Helden auf der Karte.
  const held = heldVon(s, p.id);
  if (held) {
    held.extraLeben = lebenBonus(p.eigenschaften);
    if (eigenschaftById(id)?.leben) held.leben = Math.min(maxLeben(held), held.leben + eigenschaftById(id)!.leben!);
  }
  events.push({ t: 'eigenschaft', player: p.id, id });
}

/** Eine angebotene Eigenschaft waehlen. */
export function eigenschaftWaehlen(s: GameState, id: PlayerId, eig: string, events: Ereignisse): string | null {
  const p = playerById(s, id);
  if (!p?.eigenschaftAngebot?.includes(eig)) return 'Diese Eigenschaft steht nicht zur Wahl.';
  eigenschaftNehmen(s, p, eig, events);
  return null;
}

/** Was eine Folge am Helden bewirkt: Relikt, Erfahrung, Wunden, Heilung. */
export function heldFolge(s: GameState, p: Player, f: Folge, events: Ereignisse): void {
  if (f.relikt) {
    const id = f.relikt === 'zufall' ? zufallsRelikt(s.worldSeed, s.turn, p.equipment) : f.relikt;
    if (id && RELIKTE.some((r) => r.id === id) && !p.equipment.includes(id)) {
      p.equipment = [...p.equipment, id];
      events.push({ t: 'relikt', player: p.id, id });
    } else if (id) {
      // Schon im Besitz: dafuer eine Kartenwahl.
      p.loot += 1;
    }
  }
  const held = heldVon(s, p.id);
  if (held && f.wunde) held.leben = Math.max(1, held.leben - f.wunde);
  if (held && f.heilen) held.leben = Math.min(maxLeben(held), held.leben + f.heilen);
  if (f.xp) heldWachsen(s, p, f.xp, events);
}

/** Eine Probe wuerfeln: zwei Wuerfel plus Bonus des Helden. */
export function probeWuerfeln(s: GameState, p: Player, art: Probe, ziel: number): { wurf: number; bonus: number; gelungen: boolean } {
  const rng = new Rng(s.rngState);
  const wurf = 2 + rng.int(6) + rng.int(6);
  s.rngState = rng.getState();
  const bonus = probeBonus(heldStufeVon(p.heldXp ?? 0), p.eigenschaften ?? [], art);
  return { wurf, bonus, gelungen: wurf + bonus >= ziel };
}

/** Faellt der Held, gehen seine Relikte bis auf eines verloren (C11). */
export function relikteBeiFall(p: Player, events: Ereignisse): void {
  const relikte = p.equipment.filter((id) => RELIKTE.some((r) => r.id === id));
  if (relikte.length <= 1) return;
  const bleibt = relikte[0]!;
  p.equipment = p.equipment.filter((id) => !relikte.includes(id) || id === bleibt);
  events.push({ t: 'relikteVerloren', player: p.id, anzahl: relikte.length - 1 });
}
