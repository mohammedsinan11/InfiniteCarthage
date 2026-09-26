/**
 * Die Bestenliste der Tagesexpedition: ein Durable Object je Tag
 * (idFromName "tag:<datum>", core/tages.ts).
 *
 * Es haelt zwei Dinge:
 *
 *   den geheimen Seed des Tages - beim ersten Abruf gewuerfelt und dann
 *   behalten. Alle Raeume dieses Tages spielen damit dieselben Wuerfe und
 *   Karten, und niemand kann sie aus dem Quelltext vorausrechnen. Er geht nur
 *   an Raumobjekte (/seed); der oeffentliche Weg (/liste) kennt ihn nicht.
 *
 *   die Ergebnisse - eingetragen vom Raumobjekt, wenn eine Partie endet. Der
 *   Client meldet nichts selbst: die Wertung rechnet der Server aus seinem
 *   eigenen Spielstand aus.
 *
 * Faellt es aus, laeuft jede Partie weiter; nur Liste und Seed fehlen, und
 * der Raum startet dann mit einem zufaelligen Seed.
 */

import { bestenliste, istBestenEintrag } from '../core/tages';
import type { BestenEintrag } from '../core/tages';

const SEED = 'seed';
const PRAEFIX = 'e:';
/** Mehr als so viele Ergebnisse je Tag nimmt die Liste nicht an. */
const MAX_EINTRAEGE = 5000;

export class Bestenliste implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    env: unknown,
  ) {
    void env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/seed') {
      let seed = await this.ctx.storage.get<number>(SEED);
      if (seed === undefined) {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        seed = a[0]! | 0;
        await this.ctx.storage.put(SEED, seed);
      }
      return Response.json({ seed });
    }

    if (request.method === 'POST' && url.pathname === '/eintragen') {
      const e = (await request.json().catch(() => null)) as unknown;
      if (!istBestenEintrag(e)) return new Response('Ungueltiger Eintrag.', { status: 400 });
      const alle = await this.ctx.storage.list({ prefix: PRAEFIX, limit: MAX_EINTRAEGE });
      if (alle.size >= MAX_EINTRAEGE) return new Response('Liste voll.', { status: 429 });
      // Ein Raum traegt genau ein Ergebnis ein - derselbe Schluessel ueberschreibt.
      await this.ctx.storage.put(PRAEFIX + e.code, e);
      return new Response('ok');
    }

    if (request.method === 'GET' && url.pathname === '/liste') {
      const alle = await this.ctx.storage.list<BestenEintrag>({ prefix: PRAEFIX, limit: MAX_EINTRAEGE });
      return Response.json(bestenliste([...alle.values()]));
    }

    return new Response('Nicht gefunden.', { status: 404 });
  }
}
