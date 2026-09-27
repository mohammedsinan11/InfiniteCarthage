/**
 * Handelswege: wofuer Strassen gut sind (Spieltest 6 - "was bringt mir die
 * Strasse?").
 *
 * Bisher war eine Strasse nur der Eintritt fuer das naechste Dorf. Jetzt
 * traegt das Strassennetz drei Dinge:
 *
 *  - Die Karawane (core/karawane.ts) zieht nur auf eigenen Strassen, zwischen
 *    den zwei Siedlungen mit dem laengsten Weg dazwischen. Je laenger der Weg,
 *    desto mehr bringt jede Ankunft (handelsLohn).
 *  - Eigene Einheiten ziehen auf eigenen Strassen schneller (rules/army.ts,
 *    schreite): ein Feld mehr je Runde, solange sie auf dem Netz bleiben.
 *  - Die Handelsstrasse: wer den laengsten Weg zwischen zwei eigenen
 *    Siedlungen hat (mindestens HANDELSSTRASSE_AB Strassen), traegt den Titel
 *    und zwei Siegpunkte - wie die laengste Strasse bei Catan, aber gemessen
 *    zwischen Siedlungen, also als Handelsweg und nicht als Schlange.
 *
 * Gezaehlt wird im Graph der Ecken: jede eigene Strasse verbindet ihre zwei
 * Ecken. Eine fremde Siedlung auf einer Ecke unterbricht den Weg.
 *
 * Nur in Partien mit Ereignissen.
 */

import { edgeAdjacentHexes, edgeEndpoints, hexKey, parseEdgeKey, parseVertexKey, vertexAdjacentHexes, vertexKey } from './coords';
import { isLandAt } from './units';
import type { GameState, PlayerId } from './state';

/** Ab so vielen Strassen zaehlt ein Weg als Handelsstrasse. */
export const HANDELSSTRASSE_AB = 5;
/** Was der Titel wert ist. */
export const HANDELSSTRASSE_PUNKTE = 2;
/** So lang muss ein Weg mindestens sein, damit eine Karawane darauf zieht. */
export const KARAWANE_MIN_WEG = 3;

type Netz = Pick<GameState, 'roads' | 'buildings'>;

/** Die Nachbarecken jeder Ecke im eigenen Strassennetz. */
function eckenGraph(s: Netz, id: PlayerId): Map<string, string[]> {
  const g = new Map<string, string[]>();
  for (const [ek, owner] of Object.entries(s.roads)) {
    if (owner !== id) continue;
    const [a, b] = edgeEndpoints(parseEdgeKey(ek)).map(vertexKey) as [string, string];
    (g.get(a) ?? g.set(a, []).get(a)!).push(b);
    (g.get(b) ?? g.set(b, []).get(b)!).push(a);
  }
  return g;
}

export type Route = { von: string; nach: string; laenge: number };

/**
 * Der laengste Weg zwischen zwei eigenen Siedlungen - gemessen als kuerzeste
 * Verbindung im Strassennetz, also der Weg, den eine Karawane nimmt. null,
 * wenn keine zwei Siedlungen verbunden sind.
 */
export function laengsteRoute(s: Netz, id: PlayerId): Route | null {
  const g = eckenGraph(s, id);
  const eigene = Object.keys(s.buildings)
    .filter((vk) => s.buildings[vk]!.owner === id && g.has(vk))
    .sort();
  const fremd = (vk: string) => {
    const b = s.buildings[vk];
    return b !== undefined && b.owner !== id;
  };
  let best: Route | null = null;
  for (const start of eigene) {
    const dist = new Map<string, number>([[start, 0]]);
    const warte = [start];
    for (let i = 0; i < warte.length; i++) {
      const v = warte[i]!;
      // Durch eine fremde Siedlung fuehrt kein Weg - nur bis an sie heran.
      if (v !== start && fremd(v)) continue;
      for (const n of g.get(v) ?? []) {
        if (dist.has(n)) continue;
        dist.set(n, dist.get(v)! + 1);
        warte.push(n);
      }
    }
    for (const ziel of eigene) {
      if (ziel <= start) continue;
      const d = dist.get(ziel);
      if (d === undefined) continue;
      if (!best || d > best.laenge) best = { von: start, nach: ziel, laenge: d };
    }
  }
  return best;
}

/** Was eine Karawanenankunft auf einem Weg dieser Laenge bringt: 1 und je 4 Strassen eine mehr, hoechstens 4. */
export const handelsLohn = (laenge: number): number => Math.min(4, 1 + Math.floor(laenge / 4));

/** Die Felder am eigenen Strassennetz und an den eigenen Siedlungen - dort ziehen Karawanen, dort geht es schneller. */
export function strassenFelder(s: Pick<GameState, 'roads' | 'buildings' | 'worldSeed'>, id: PlayerId): Set<string> {
  const out = new Set<string>();
  for (const [ek, owner] of Object.entries(s.roads)) {
    if (owner !== id) continue;
    for (const h of edgeAdjacentHexes(parseEdgeKey(ek))) if (isLandAt(s.worldSeed, h.q, h.r)) out.add(hexKey(h.q, h.r));
  }
  for (const [vk, b] of Object.entries(s.buildings)) {
    if (b.owner !== id) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) if (isLandAt(s.worldSeed, h.q, h.r)) out.add(hexKey(h.q, h.r));
  }
  return out;
}

/** Ein Feld an einer Siedlung, das am Netz liegt - Start und Ziel der Karawane. */
export function routenFeld(s: Pick<GameState, 'roads' | 'buildings' | 'worldSeed'>, id: PlayerId, vk: string): { q: number; r: number } | null {
  const netz = strassenFelder({ ...s, buildings: {} }, id);
  const felder = vertexAdjacentHexes(parseVertexKey(vk)).filter((h) => isLandAt(s.worldSeed, h.q, h.r));
  return felder.find((h) => netz.has(hexKey(h.q, h.r))) ?? felder[0] ?? null;
}

/**
 * Wer die Handelsstrasse traegt. Der bisherige Traeger behaelt sie bei
 * Gleichstand; faellt sein Weg unter die Schwelle, geht sie an den Laengsten
 * oder an niemanden.
 */
export function handelsstrasseNeu(s: Pick<GameState, 'roads' | 'buildings' | 'players' | 'handelsstrasse'>): PlayerId | null {
  const laenge = new Map(s.players.filter((p) => !p.besiegt).map((p) => [p.id, laengsteRoute(s, p.id)?.laenge ?? 0]));
  const alt = s.handelsstrasse ?? null;
  const altWert = alt ? (laenge.get(alt) ?? 0) : 0;
  let best: PlayerId | null = alt !== null && altWert >= HANDELSSTRASSE_AB ? alt : null;
  let bestWert = best ? altWert : HANDELSSTRASSE_AB - 1;
  for (const [id, n] of laenge) {
    if (n > bestWert) {
      best = id;
      bestWert = n;
    }
  }
  return best;
}
