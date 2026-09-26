/**
 * Nachrichten zwischen Client und Durable Object.
 *
 * Bewusst klein gehalten. Die groesste Ersparnis steckt darin, was hier
 * FEHLT: Gelaende. Der Zustand traegt worldSeed und die Liste der
 * aufgedeckten Chunks, daraus rechnet jeder Client die Landschaft selbst
 * aus (siehe worldgen.ts). Uebertragen werden nur Koordinatenpaare.
 */

import type { WeltArt } from './weltart';
import type { HeldLore } from './lore';
import type { Action, GameEvent } from './rules/reducer';
import type { PublicState } from './redact';
import type { PlayerId } from './state';

export type Member = {
  id: PlayerId;
  name: string;
  connected: boolean;
  /** Ein Bot (core/bot.ts): der Raum spielt seine Zuege selbst. */
  bot?: boolean;
};

/** Namen fuer Bots - karthagische Namen, damit die Rivalen nach etwas klingen. */
export const BOT_NAMEN = ['Hanno', 'Dido', 'Hamilkar', 'Magon', 'Elissa', 'Hasdrubal'] as const;

export type RoomInfo = {
  code: string;
  hostId: PlayerId | null;
  started: boolean;
  targetPoints: number;
  members: Member[];
  /** In der oeffentlichen Raumliste sichtbar (core/lobby.ts). */
  oeffentlich: boolean;
  /** Die Omen der kommenden Partie (core/omen.ts) - schon in der Lobby sichtbar. */
  omens: string[];
  /** Rundengrenze der Partie, null ohne (core/chronik.ts, wertung). */
  rundenLimit: number | null;
  /** Tagesexpedition: ihr Datum. null bei einem gewoehnlichen Raum (core/tages.ts). */
  tagesDatum: string | null;
  /** Die Welt einer frueheren Partie ("Diese Welt nochmal"). null: eine neue. */
  weltSeed: number | null;
  /** Chronikstufe (core/stufe.ts): je Stufe ein Fluch mehr. */
  stufe: number;
  /** Gemeinsam gegen die Wildnis (ein Jahr, ein Ziel fuer alle). */
  koop: boolean;
  /** Ein Szenario (core/szenario.ts) - allein, feste Omen und Frist. */
  szenario: string | null;
  /** Die Weltart der kommenden Partie (core/weltart.ts). Fehlt bei alten Servern. */
  weltArt?: WeltArt;
};

/**
 * Ein Spieler reicht. Allein zu siedeln ist kein Wettkampf, aber ein guter
 * Sandkasten: man sieht der Karte beim Wachsen zu, ohne auf Mitspieler zu
 * warten.
 */
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;

/**
 * 0 bedeutet: kein Siegpunktziel, die Partie endet nie von selbst (checkWin
 * prueft auf <= 0). Das Endlosspiel - in der Lobby "unendlich".
 */
export const NO_TARGET = 0;

/**
 * Hoehere Ziele als im Original, weil dies kein Catan ist: die Karte hat
 * keinen Rand, und mit Hauptstaedten, Helden und Fraktionen gibt es mehr zu
 * tun, als 15 Punkte Zeit lassen. Wer nie aufhoeren will, nimmt "unendlich".
 */
export const TARGET_POINTS_CHOICES = [20, 30, 60, NO_TARGET] as const;
export const DEFAULT_TARGET_POINTS = 20;

export const targetPointsLabel = (n: number): string =>
  n === NO_TARGET ? 'unendlich' : String(n);

/**
 * Die Laenge einer Partie: offen (nur das Siegpunktziel zaehlt) oder ein Jahr
 * zu 60 Runden, nach dem die hoechste Wertung gewinnt. Das Jahr macht eine
 * Partie planbar - und Ergebnisse vergleichbar.
 */
export const RUNDEN_LIMIT_CHOICES = [null, 60] as const;

export const rundenLimitLabel = (n: number | null): string =>
  n === null ? 'offen' : n === 60 ? 'ein Jahr' : `${n} Runden`;

export type ClientMsg =
  /**
   * token stammt aus einer frueheren Sitzung und holt den Platz zurueck. Auf
   * einem anderen Geraet gibt es kein Token: dann seat (der Platz) und pin.
   */
  | {
      t: 'join';
      name: string;
      token?: string;
      seat?: PlayerId;
      pin?: string;
      /** Der Held der letzten Partie dieses Browsers - der neue wird sein Nachfolger (core/lore.ts, istAhn). */
      ahn?: HeldLore;
    }
  /** Nur der Gastgeber, nur vor dem Start. Was fehlt, bleibt, wie es ist. */
  | {
      t: 'setOptions';
      targetPoints?: number;
      oeffentlich?: boolean;
      /** Omen neu wuerfeln oder ohne Omen spielen (core/omen.ts). */
      omens?: 'neu' | 'keine';
      rundenLimit?: number | null;
      /** Chronikstufe (core/stufe.ts). */
      stufe?: number;
      /** Gemeinsam statt gegeneinander. */
      koop?: boolean;
      /** Weltart waehlen oder neu wuerfeln (core/weltart.ts). */
      weltArt?: WeltArt | 'neu';
    }
  | { t: 'start' }
  /** Nur der Gastgeber, nur vor dem Start: einen Bot dazusetzen oder entfernen. */
  | { t: 'addBot' }
  | { t: 'removeBot'; id: PlayerId }
  | { t: 'action'; action: Action };

export type ServerMsg =
  /**
   * Nur an den frisch Verbundenen: wer er ist und womit er wiederkommt - das
   * Token fuer diesen Browser, die PIN fuer ein anderes Geraet.
   */
  | { t: 'welcome'; you: PlayerId; token: string; pin: string; room: RoomInfo }
  /** Die Partie laeuft, und ohne Token hat man keinen Platz: waehlen und PIN nennen. */
  | { t: 'seats'; room: RoomInfo }
  /** Derselbe Platz wurde anderswo geoeffnet - diese Verbindung gibt ihn ab. */
  | { t: 'replaced' }
  | { t: 'room'; room: RoomInfo }
  | { t: 'state'; state: PublicState }
  | { t: 'events'; events: GameEvent[] }
  | { t: 'error'; message: string };

export function parseClientMsg(raw: string): ClientMsg | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v !== 'object' || v === null) return null;
    const t = (v as { t?: unknown }).t;
    if (typeof t !== 'string') return null;
    return v as ClientMsg;
  } catch {
    return null;
  }
}

/** Raumcodes ohne 0/O und 1/I - die werden am Telefon zu oft verwechselt. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function isRoomCode(s: string): boolean {
  if (s.length !== ROOM_CODE_LENGTH) return false;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return false;
  return true;
}

export function randomRoomCode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Die Platz-PIN: wer auf einem anderen Geraet weiterspielt, nennt den Raumcode,
 * waehlt seinen Platz und gibt diese PIN ein. Der Raumcode allein genuegt
 * nicht - oeffentliche Raeume stehen mit Code in der Liste. Die PIN gilt nur
 * innerhalb ihres Raums, also braucht es keinen zweiten, weltweit eindeutigen
 * Code. Dasselbe Alphabet wie der Raumcode: nichts zum Verwechseln.
 */
export const PIN_LENGTH = 4;

/** Eingabe aufraeumen: Leerzeichen und Kleinschreibung verzeihen. */
export const normalizePin = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function isPin(s: string): boolean {
  if (s.length !== PIN_LENGTH) return false;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return false;
  return true;
}

export function randomPin(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < PIN_LENGTH; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}
