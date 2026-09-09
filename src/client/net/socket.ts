/**
 * Duenne Huelle um den WebSocket zum Durable Object.
 *
 * Bewusst ohne automatischen Wiederverbindungsversuch: der Server haelt den
 * Platz ueber das Token offen, deshalb ist ein erneutes Verbinden eine
 * Entscheidung des Nutzers und kein stiller Nebeneffekt.
 */

import type { ClientMsg, ServerMsg } from '../../core/protocol';

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

export function openSocket(
  code: string,
  create: boolean,
  handlers: SocketHandlers,
): WebSocket {
  const base = SERVER_URL.replace(/^http/, 'ws').replace(/\/$/, '');
  const url = `${base}/room/${code}/ws${create ? '?create=1' : ''}`;
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

export function sendMsg(ws: WebSocket | null, msg: ClientMsg): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}
