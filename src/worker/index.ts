/**
 * Einstieg des Workers. Reicht WebSocket-Verbindungen an das Durable Object
 * des jeweiligen Raums weiter - ein Objekt je Raumcode.
 *
 * Der Worker selbst haelt keinen Zustand. Er prueft nur Herkunft und Form
 * der Anfrage; alles Weitere entscheidet das Raumobjekt.
 */

import { GameRoom } from './room';
import type { Env } from './room';
import { Verzeichnis } from './directory';
import { Bestenliste } from './bestenliste';
import { isRoomCode } from '../core/protocol';
import { VERZEICHNIS_NAME } from '../core/lobby';
import { TAGES_RUNDEN, istTagesDatum, tagesDatum, tagesOmen } from '../core/tages';
import type { BestenEintrag, TagesInfo } from '../core/tages';

export { GameRoom, Verzeichnis, Bestenliste };

/**
 * Erlaubte Herkunft. In der Produktion die Pages-Adresse, in der Entwicklung
 * der Vite-Server. Ohne diese Pruefung koennte jede fremde Seite Verbindungen
 * im Namen des Nutzers oeffnen.
 */
function originAllowed(origin: string | null, env: Env): boolean {
  if (origin === null) return true; // native Clients und Tests
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true; // nicht konfiguriert: nicht blockieren
  if (allowed.includes(origin)) return true;
  return /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    }

    // Die oeffentliche Raumliste fuer die Startseite (core/lobby.ts). Die Seite
    // liegt auf github.io, der Worker woanders - deshalb die CORS-Kopfzeile fuer
    // erlaubte Herkuenfte.
    if (url.pathname === '/rooms' && request.method === 'GET') {
      const origin = request.headers.get('Origin');
      if (!originAllowed(origin, env)) {
        return new Response('Herkunft nicht erlaubt.', { status: 403 });
      }
      const stub = env.VERZEICHNIS.get(env.VERZEICHNIS.idFromName(VERZEICHNIS_NAME));
      const antwort = await stub.fetch('https://verzeichnis/liste');
      const headers = new Headers({
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      if (origin !== null) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Vary', 'Origin');
      }
      return new Response(antwort.body, { status: antwort.status, headers });
    }

    // Die Tagesexpedition (core/tages.ts): Datum, Omen und Bestenliste. Der
    // geheime Seed des Tages bleibt im Objekt - diesen Weg kennt er nicht.
    if (url.pathname === '/daily' && request.method === 'GET') {
      const origin = request.headers.get('Origin');
      if (!originAllowed(origin, env)) {
        return new Response('Herkunft nicht erlaubt.', { status: 403 });
      }
      const gefragt = url.searchParams.get('datum');
      const datum = istTagesDatum(gefragt) ? gefragt : tagesDatum();
      let eintraege: BestenEintrag[] = [];
      try {
        const stub = env.BESTENLISTE.get(env.BESTENLISTE.idFromName('tag:' + datum));
        const antwort = await stub.fetch('https://bestenliste/liste');
        if (antwort.ok) eintraege = (await antwort.json()) as BestenEintrag[];
      } catch {
        // Ohne Liste zeigt die Startseite nur Datum und Omen.
      }
      const info: TagesInfo = { datum, omens: tagesOmen(datum), runden: TAGES_RUNDEN, eintraege };
      const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
      if (origin !== null) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Vary', 'Origin');
      }
      return new Response(JSON.stringify(info), { headers });
    }

    // /room/<CODE>/ws
    const match = /^\/room\/([A-Z0-9]+)\/ws$/.exec(url.pathname);
    if (!match) return new Response('Nicht gefunden.', { status: 404 });

    const code = match[1]!;
    if (!isRoomCode(code)) return new Response('Ungueltiger Raumcode.', { status: 400 });

    if (!originAllowed(request.headers.get('Origin'), env)) {
      return new Response('Herkunft nicht erlaubt.', { status: 403 });
    }

    // idFromName bindet den Raumcode an genau ein Objekt - weltweit eines.
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const forward = new URL(request.url);
    forward.searchParams.set('code', code);
    return stub.fetch(new Request(forward, request));
  },
};
