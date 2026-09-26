/**
 * Duenne Huelle um den WebSocket zum Durable Object.
 *
 * Bewusst ohne automatischen Wiederverbindungsversuch: der Server haelt den
 * Platz ueber das Token offen, deshalb ist ein erneutes Verbinden eine
 * Entscheidung des Nutzers und kein stiller Nebeneffekt.
 */

import type { ClientMsg, ServerMsg } from '../../core/protocol';
import { ROOM_CODE_LENGTH, randomRoomCode } from '../../core/protocol';
import { istRaumEintrag } from '../../core/lobby';
import type { RaumEintrag } from '../../core/lobby';
import { istTagesInfo } from '../../core/tages';
import type { TagesInfo } from '../../core/tages';

/**
 * Serveradresse aus dem Build.
 *
 * Der Trim ist kein Schoenheitsfehler-Fang, sondern der eigentliche Fall:
 * der Pages-Workflow setzt VITE_SERVER_URL aus `${{ vars.VITE_SERVER_URL }}`.
 * Fehlt die Repository-Variable, expandiert das nicht zu "nicht gesetzt",
 * sondern zum LEEREN STRING. Ein `??` faengt das nicht ab - es reagiert nur
 * auf null und undefined - und Vite kompiliert die leere Adresse ein.
 *
 * Die Folge war eine Seite, die `new WebSocket("/room/ABC123/ws")` oeffnet.
 * Das loest relativ zur Seite auf, landet auf github.io statt beim Worker
 * und scheitert ohne erkennbaren Grund.
 */
const CONFIGURED = (import.meta.env.VITE_SERVER_URL ?? '').trim();

const DEV_FALLBACK = 'ws://127.0.0.1:8787';

const SERVER_URL = CONFIGURED === '' ? DEV_FALLBACK : CONFIGURED;

/** Ist eine echte Serveradresse hinterlegt, oder laufen wir auf dem Notnagel? */
export const SERVER_CONFIGURED = CONFIGURED !== '';

const onLocalhost =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

/**
 * Ausserhalb der Entwicklung ist der Notnagel wertlos. Das gehoert nicht nur
 * ins Log, sondern auch auf den Bildschirm - siehe Home.tsx.
 */
export const SERVER_MISSING = !SERVER_CONFIGURED && !onLocalhost;

if (SERVER_MISSING) {
  console.error(
    'VITE_SERVER_URL ist leer oder nicht gesetzt. Ohne Serveradresse laesst ' +
      'sich kein Raum oeffnen. Die Repository-Variable hinterlegen und den ' +
      'Pages-Workflow neu laufen lassen (siehe README).',
  );
}

export type SocketHandlers = {
  onMessage: (msg: ServerMsg) => void;
  onOpen: () => void;
  onClose: () => void;
};

/** Ein frischer Raumcode - ohne 0/O und 1/I, die beim Vorlesen verwechselt werden. */
export function neuerRaumCode(): string {
  const a = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(a);
  return randomRoomCode(a);
}

/** Was ein neuer Raum ausser dem Code mitbringt. */
export type RaumWunsch = { tages?: boolean; welt?: number };

export function openSocket(
  code: string,
  create: boolean,
  oeffentlich: boolean,
  handlers: SocketHandlers,
  /**
   * Nur beim Eroeffnen: ein Raum fuer die Tagesexpedition (core/tages.ts),
   * oder eine Welt aus einer frueheren Partie ("Diese Welt nochmal").
   */
  neu: RaumWunsch = {},
): WebSocket {
  const base = SERVER_URL.replace(/^http/, 'ws').replace(/\/$/, '');
  const extra = (neu.tages ? '&tages=1' : '') + (neu.welt !== undefined ? `&welt=${neu.welt | 0}` : '');
  const url = `${base}/room/${code}/ws${create ? `?create=1${oeffentlich ? '' : '&public=0'}${extra}` : ''}`;
  const ws = new WebSocket(url);

  ws.onopen = handlers.onOpen;
  ws.onclose = handlers.onClose;
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    try {
      handlers.onMessage(JSON.parse(ev.data) as ServerMsg);
    } catch {
      // Unlesbare Nachricht ignorieren - der Server schickt sonst nichts.
    }
  };
  return ws;
}

/**
 * Die oeffentliche Raumliste vom Worker (GET /rooms). Wirft, wenn er nicht
 * antwortet - die Startseite zeigt das an, statt eine leere Liste vorzutaeuschen.
 */
export async function holeRaeume(): Promise<RaumEintrag[]> {
  const base = SERVER_URL.replace(/^ws/, 'http').replace(/\/$/, '');
  const res = await fetch(`${base}/rooms`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Raumliste: ${res.status}`);
  const daten = (await res.json()) as unknown;
  return Array.isArray(daten) ? daten.filter(istRaumEintrag) : [];
}

/**
 * Die Tagesexpedition vom Worker (GET /daily): Datum, Omen und Bestenliste.
 * Wirft, wenn er nicht antwortet.
 */
export async function holeTagesInfo(): Promise<TagesInfo> {
  const base = SERVER_URL.replace(/^ws/, 'http').replace(/\/$/, '');
  const res = await fetch(`${base}/daily`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Tagesexpedition: ${res.status}`);
  const daten = (await res.json()) as unknown;
  if (!istTagesInfo(daten)) throw new Error('Tagesexpedition: unlesbar');
  return daten;
}

export function sendMsg(ws: WebSocket | null, msg: ClientMsg): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}
