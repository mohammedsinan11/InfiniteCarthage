/**
 * Fraktionsleben: Banden und Staemme, die sich veraendern (OVERHAUL.md,
 * Abschnitt 1 - eine Welt, die ohne dich lebt).
 *
 * Bisher war eine Fraktion fest: derselbe Anfuehrer, dasselbe Wesen, von der
 * ersten bis zur letzten Runde. Jetzt:
 *
 *  - ANFUEHRER FALLEN. Wird ein Lager zerstoert oder erobert, kann der
 *    Anfuehrer dabei gefallen sein. Ein Nachfolger mit anderem Wesen tritt an -
 *    aus den zaudernden Aschewoelfen werden vielleicht gierige.
 *  - BEUTE MACHT STARK. Was Raeuber heimbringen, sammelt sich. Ist genug
 *    beisammen, zieht der naechste Raubzug mit einem Mann mehr los - wer
 *    Pluenderer entkommen laesst, fuettert sie.
 *  - STIMMUNG. Jede Fraktion merkt sich, wie ein Haus sie behandelt: Lager
 *    zerstoeren und Krieg erklaeren macht feindselig, Tribut und Frieden
 *    versoehnlich. Wer ihnen verhasst ist, bekommt keinen Frieden mehr.
 *
 * Alles im Spielstand (GameState.fraktionen), nur fuer Partien mit
 * Ereignissen; ohne Eintrag gilt, was der Seed sagt (core/factions.ts).
 * Rein: der Zufall kommt aus dem geheimen Seed und der Zugnummer.
 */

import { fraktionById, istFraktion, nachfolgerFuer } from './factions';
import type { Fraktion, FraktionsWesen } from './factions';
import { hash3i } from './hash';
import type { GameState, PlayerId } from './state';

export type FraktionsStand = {
  /** Wer sie fuehrt, wenn nicht mehr der erste (Nachfolger). */
  anfuehrer?: string;
  wesen?: FraktionsWesen;
  /** Der wievielte Anfuehrer - der erste ist 1. */
  generation: number;
  /** Heimgebrachte Beute, noch nicht in Staerke umgesetzt. */
  beute: number;
  /** Wie sie zu jedem Haus steht: negativ feindselig, positiv wohlgesonnen. */
  stimmung: Record<PlayerId, number>;
};

type Sicht = { worldSeed: number; fraktionen?: Record<string, FraktionsStand> };

/** Die Fraktion, wie sie jetzt ist - mit Nachfolger und neuem Wesen. */
export function fraktionIn(s: Sicht, id: string): Fraktion {
  const f = fraktionById(s.worldSeed, id);
  const o = s.fraktionen?.[id];
  if (!o) return f;
  return { ...f, ...(o.anfuehrer ? { anfuehrer: o.anfuehrer } : {}), ...(o.wesen ? { wesen: o.wesen } : {}) };
}

export const wesenIn = (s: Sicht, id: string): FraktionsWesen | null => fraktionIn(s, id).wesen ?? null;

/** Ab so viel heimgebrachter Beute zieht der naechste Raubzug verstaerkt los. */
export const ERSTARKT_AB = 10;

export const erstarkt = (s: Sicht, id: string): boolean => (s.fraktionen?.[id]?.beute ?? 0) >= ERSTARKT_AB;

/** Die Staerke verbrauchen, wenn ein verstaerkter Raubzug aufbricht. */
export function staerkeVerbrauchen(s: GameState, id: string): void {
  const f = s.fraktionen?.[id];
  if (f) s.fraktionen = { ...s.fraktionen, [id]: { ...f, beute: Math.max(0, f.beute - ERSTARKT_AB) } };
}

export const stimmungVon = (s: Sicht, fraktion: string, spieler: PlayerId): number =>
  s.fraktionen?.[fraktion]?.stimmung[spieler] ?? 0;

/** Ab hier nehmen sie keinen Frieden mehr an. */
export const VERHASST = -4;

export function stimmungText(n: number): string {
  if (n <= VERHASST) return 'verhasst';
  if (n <= -2) return 'feindselig';
  if (n < 2) return 'gleichgueltig';
  return 'wohlgesonnen';
}

/** Wie wahrscheinlich ein Anfuehrer mit seinem Lager faellt, in Prozent. */
const FALL_ZERSTOERT = 35;
const FALL_EROBERT = 50;
const SALT = 401;

export type FraktionsEvent = {
  t: 'chiefChanged';
  fraktion: string;
  alt: string;
  neu: string;
  wesen: FraktionsWesen;
};

type Ereignisse = { push(...e: FraktionsEvent[]): number };
type Ereignis = { t: string } & Record<string, unknown>;

function stand(s: GameState, id: string): FraktionsStand {
  return s.fraktionen?.[id] ?? { generation: 1, beute: 0, stimmung: {} };
}

function setze(s: GameState, id: string, f: FraktionsStand): void {
  s.fraktionen = { ...(s.fraktionen ?? {}), [id]: f };
}

function stimmungAendern(s: GameState, id: string, spieler: PlayerId, um: number): void {
  const f = stand(s, id);
  const neu = Math.max(-8, Math.min(6, (f.stimmung[spieler] ?? 0) + um));
  setze(s, id, { ...f, stimmung: { ...f.stimmung, [spieler]: neu } });
}

/** Faellt der Anfuehrer? Dann tritt der Nachfolger an. */
function vielleichtFaellt(s: GameState, id: string, prozent: number, q: number, r: number, events: Ereignisse): void {
  if (!istFraktion(id)) return;
  const vorher = fraktionIn(s, id);
  if (!vorher.anfuehrer) return;
  if (hash3i(s.secretSeed, s.turn * 7 + q, r, SALT) % 100 >= prozent) return;
  const f = stand(s, id);
  const generation = f.generation + 1;
  const neu = nachfolgerFuer(s.worldSeed, id, generation, vorher.wesen);
  setze(s, id, { ...f, generation, anfuehrer: neu.anfuehrer, wesen: neu.wesen });
  events.push({ t: 'chiefChanged', fraktion: id, alt: vorher.anfuehrer, neu: neu.anfuehrer, wesen: neu.wesen });
}

/**
 * Nach jeder Aktion: was die Ereignisse fuer die Fraktionen bedeuten. Liest
 * nur, was ohnehin geschah - keine Regel muss davon wissen.
 */
export function fraktionsLeben(s: GameState, geschehen: readonly Ereignis[], events: Ereignisse): void {
  if (!s.ereignisseAn) return;
  for (const e of geschehen) {
    switch (e.t) {
      case 'homecoming': {
        const id = e.fraktion as string;
        const n = (e.count as number) ?? 0;
        if (n > 0 && istFraktion(id)) {
          const f = stand(s, id);
          setze(s, id, { ...f, beute: f.beute + n });
        }
        break;
      }
      case 'nestDestroyed': {
        const id = e.fraktion as string;
        if (!istFraktion(id)) break;
        for (const p of (e.players as PlayerId[]) ?? []) stimmungAendern(s, id, p, -2);
        vielleichtFaellt(s, id, FALL_ZERSTOERT, e.q as number, e.r as number, events);
        break;
      }
      case 'nestCaptured':
        vielleichtFaellt(s, e.von as string, FALL_EROBERT, e.q as number, e.r as number, events);
        break;
      case 'pact':
        if (istFraktion(e.fraktion as string)) stimmungAendern(s, e.fraktion as string, e.player as PlayerId, e.art === 'frieden' ? 2 : 1);
        break;
      case 'tribute':
        if (istFraktion(e.fraktion as string)) stimmungAendern(s, e.fraktion as string, e.player as PlayerId, 1);
        break;
      case 'war':
        if (e.grund === 'erklaert' && istFraktion(e.fraktion as string)) stimmungAendern(s, e.fraktion as string, e.player as PlayerId, -2);
        break;
      default:
        break;
    }
  }
}
