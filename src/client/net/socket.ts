/**
 * Duenne Huelle um den WebSocket zum Durable Object.
 *
 * Bewusst ohne automatischen Wiederverbindungsversuch: der Server haelt den
 * Platz ueber das Token offen, deshalb ist ein erneutes Verbinden eine
 * Entscheidung des Nutzers und kein stiller Nebeneffekt.
 */

import type { ClientMsg, ServerMsg } from '../../core/protocol';

/** In der Produktion per VITE_SERVER_URL gesetzt, lokal der wrangler-Port. */
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'ws://127.0.0.1:8787';

/**
 * Fehlt die Variable im Pages-Build, zeigt die Seite sonst stumm eine
 * Verbindung, die nie zustande kommt - der haeufigste Stolperstein beim
 * ersten Bereitstellen. Lieber einmal laut im Log.
 */
if (
  import.meta.env.VITE_SERVER_URL === undefined &&
  typeof location !== 'undefined' &&
  location.hostname !== 'localhost' &&
  location.hostname !== '127.0.0.1'
) {
  console.error(
    'VITE_SERVER_URL ist nicht gesetzt. Der Client versucht, sich mit ' +
      SERVER_URL +
      ' zu verbinden, was ausserhalb der Entwicklung nicht funktioniert. ' +
      'Die Variable im Pages-Workflow hinterlegen (siehe README).',
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
