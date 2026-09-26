/**
 * Geruechte: was man sich in den Doerfern erzaehlt.
 *
 * Ruinen, Wunderstaetten und Hexenhaeuser liegen fest im Seed, auch dort, wo
 * noch Nebel ist. Ein Geruecht verraet Richtung und ungefaehre Entfernung des
 * naechsten unentdeckten Ortes jeder Art - ein Grund, in eine bestimmte
 * Richtung zu ziehen, und eine Hilfe fuer alle, die auf der offenen Karte
 * nicht wissen, wohin (Spieltest: "Wohin als naechstes?").
 *
 * Rein aus oeffentlichen Daten: Seed, Gebaeude, erkundete Ruinen, Wunder und
 * die eigene Sicht. Der Server erfaehrt davon nichts.
 */

import { hexDistance, hexKey, hexesInRange, parseVertexKey, vertexAdjacentHexes } from '../core/coords';
import { ruinAt } from '../core/ruins';
import { hexenhausAt } from '../core/hexe';
import { WUNDER, wunderAt } from '../core/wunder';
import type { PublicState } from '../core/redact';

export type Geruecht = { art: 'ruine' | 'wunder' | 'hexe'; text: string; q: number; r: number; weit: number };

const RICHTUNG = ['Osten', 'Suedosten', 'Sueden', 'Suedwesten', 'Westen', 'Nordwesten', 'Norden', 'Nordosten'] as const;

/** Himmelsrichtung von a nach b - auf der Karte, wie man sie sieht (Norden ist oben). */
export function richtung(a: { q: number; r: number }, b: { q: number; r: number }): string {
  const dx = b.q - a.q + (b.r - a.r) / 2;
  const dy = ((b.r - a.r) * Math.sqrt(3)) / 2;
  const winkel = Math.atan2(dy, dx); // y waechst nach unten, also nach Sueden
  const i = Math.round(winkel / (Math.PI / 4));
  return RICHTUNG[(i + 8) % 8]!;
}

/** Ungefaehr, wie man es sich erzaehlt - keine genaue Zahl. */
function entfernung(d: number): string {
  if (d <= 6) return 'ganz in der Naehe';
  if (d <= 11) return 'ein paar Tagesmaersche entfernt';
  if (d <= 17) return 'weit draussen';
  return 'sehr weit draussen';
}

const SUCHE = 22;

export function geruechte(state: PublicState, you: string, sicht: ReadonlySet<string> | null): Geruecht[] {
  const eigene = Object.entries(state.buildings).filter(([, b]) => b.owner === you);
  if (eigene.length === 0) return [];
  // Die Mitte des eigenen Reichs - von dort aus erzaehlt man.
  const felder = eigene.flatMap(([vk]) => vertexAdjacentHexes(parseVertexKey(vk)));
  const mitte = {
    q: Math.round(felder.reduce((n, h) => n + h.q, 0) / felder.length),
    r: Math.round(felder.reduce((n, h) => n + h.r, 0) / felder.length),
  };
  const erkundet = new Set(state.exploredRuins);
  const gebaut = new Set(Object.keys(state.wunder ?? {}));
  const seed = state.worldSeed;
  const naechste: Partial<Record<Geruecht['art'], { q: number; r: number; d: number; wunder?: string }>> = {};
  for (const h of hexesInRange(mitte, SUCHE)) {
    const k = hexKey(h.q, h.r);
    // Was man schon sieht, braucht kein Geruecht.
    if (sicht?.has(k)) continue;
    const d = hexDistance(mitte, h);
    const merke = (art: Geruecht['art'], wunder?: string) => {
      const alt = naechste[art];
      if (!alt || d < alt.d) naechste[art] = { q: h.q, r: h.r, d, ...(wunder ? { wunder } : {}) };
    };
    if (!erkundet.has(k) && ruinAt(seed, h.q, h.r)) merke('ruine');
    const w = wunderAt(seed, h.q, h.r);
    if (w && !gebaut.has(k)) merke('wunder', WUNDER[w].name);
    if (hexenhausAt(seed, h.q, h.r)) merke('hexe');
  }
  const out: Geruecht[] = [];
  const r = naechste.ruine;
  if (r) {
    out.push({
      art: 'ruine',
      q: r.q,
      r: r.r,
      weit: r.d,
      text: `Hirten erzaehlen von alten Mauern im ${richtung(mitte, r)}, ${entfernung(r.d)}. Wer weiss, was darin liegt.`,
    });
  }
  const w = naechste.wunder;
  if (w) {
    out.push({
      art: 'wunder',
      q: w.q,
      r: w.r,
      weit: w.d,
      text: `Im ${richtung(mitte, w)}, ${entfernung(w.d)}, sollen die Steine einer uralten Staette liegen. Dort liesse sich ein Wunder errichten: ${w.wunder}.`,
    });
  }
  const x = naechste.hexe;
  if (x) {
    out.push({
      art: 'hexe',
      q: x.q,
      r: x.r,
      weit: x.d,
      text: `Man fluestert von einem Haus im ${richtung(mitte, x)}, ${entfernung(x.d)}, in dem eine Hexe wohnt. Niemand geht freiwillig hin.`,
    });
  }
  return out.sort((a, b) => a.weit - b.weit);
}
