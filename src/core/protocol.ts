/**
 * Nachrichten zwischen Client und Durable Object.
 *
 * Bewusst klein gehalten. Die groesste Ersparnis steckt darin, was hier
 * FEHLT: Gelaende. Der Zustand traegt worldSeed und die Liste der
 * aufgedeckten Chunks, daraus rechnet jeder Client die Landschaft selbst
 * aus (siehe worldgen.ts). Uebertragen werden nur Koordinatenpaare.
 */

import type { Action, GameEvent } from './rules/reducer';
import type { PublicState } from './redact';
import type { PlayerId } from './state';

export type Member = {
  id: PlayerId;
  name: string;
  connected: boolean;
};

export type RoomInfo = {
  code: string;
  hostId: PlayerId | null;
  started: boolean;
  targetPoints: number;
  members: Member[];
};

/**
 * Ein Spieler reicht. Allein zu siedeln ist kein Wettkampf, aber ein guter
 * Sandkasten: man sieht der Karte beim Wachsen zu, ohne auf Mitspieler zu
 * warten.
 */
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;

/**
 * 0 bedeutet: kein Siegpunktziel, die Partie endet nie von selbst.
 *
 * Der Mechanismus bleibt - checkWin prueft weiterhin auf <= 0 - aber als
 * Auswahl steht er nicht mehr zur Verfuegung. "Ohne Ziel" verwirrt mehr, als
 * es hilft; wer endlos siedeln will, nimmt 30 und hoert auf, wann er mag.
 */
export const NO_TARGET = 0;

/**
 * Hoehere Ziele als im Original, weil dies kein Catan ist: die Karte hat
 * keinen Rand, also darf eine Partie laenger laufen und weiter hinausfuehren.
 */
export const TARGET_POINTS_CHOICES = [15, 30] as const;
export const DEFAULT_TARGET_POINTS = 15;

export const targetPointsLabel = (n: number): string =>
  n === NO_TARGET ? 'ohne Ziel' : String(n);

export type ClientMsg =
  /** token stammt aus einer frueheren Sitzung und holt den Platz zurueck. */
  | { t: 'join'; name: string; token?: string }
  | { t: 'setOptions'; targetPoints: number }
  | { t: 'start' }
  | { t: 'action'; action: Action };

export type ServerMsg =
  /** Nur an den frisch Verbundenen: wer er ist und womit er wiederkommt. */
  | { t: 'welcome'; you: PlayerId; token: string; room: RoomInfo }
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
