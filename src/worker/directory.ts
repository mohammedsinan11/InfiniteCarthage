/**
 * Das Verzeichnis: ein einziges Durable Object, bei dem sich alle Raeume
 * melden, damit die Startseite sie auflisten kann (core/lobby.ts).
 *
 * Es haelt je Raum einen Eintrag und nichts weiter - keine Spielstaende, keine
 * Verbindungen. Faellt es aus, laeuft jede Partie weiter; nur die Liste fehlt.
 * Abgelaufene Eintraege (VERFALL_TAGE ohne Aktivitaet) werden beim Abfragen
 * geloescht.
 */

import { istAbgelaufen, istRaumEintrag, sichtbareRaeume } from '../core/lobby';
import type { RaumEintrag } from '../core/lobby';

const PRAEFIX = 'raum:';
/** Mehr Schluessel nimmt storage.delete auf einmal nicht. */
const LOESCHEN_JE_AUFRUF = 128;

export class Verzeichnis implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    env: unknown,
  ) {
    void env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/melden') {
      const eintrag = (await request.json().catch(() => null)) as unknown;
      if (!istRaumEintrag(eintrag)) return new Response('Ungueltiger Eintrag.', { status: 400 });
      await this.ctx.storage.put(PRAEFIX + eintrag.code, eintrag);
      return new Response('ok');
    }

    if (request.method === 'GET' && url.pathname === '/liste') {
      const jetzt = Date.now();
      const alle = await this.ctx.storage.list<RaumEintrag>({ prefix: PRAEFIX });
      const abgelaufen: string[] = [];
      const eintraege: RaumEintrag[] = [];
      for (const [k, e] of alle) {
        if (istAbgelaufen(e, jetzt)) abgelaufen.push(k);
        else eintraege.push(e);
      }
      for (let i = 0; i < abgelaufen.length; i += LOESCHEN_JE_AUFRUF) {
        await this.ctx.storage.delete(abgelaufen.slice(i, i + LOESCHEN_JE_AUFRUF));
      }
      return Response.json(sichtbareRaeume(eintraege, jetzt));
    }

    return new Response('Nicht gefunden.', { status: 404 });
  }
}
