/**
 * Die Schlusswertung: Basis mal Mult (A4, nach Balatro).
 *
 * Bisher: Siegpunkte x 10 + Ruhm. Fuer Partien mit Akten (core/akte.ts) wird
 * daraus eine Rechnung, in der der Bau des Reiches multipliziert:
 *
 *   Basis = Siegpunkte x 10 + Ruhm x 3 + Summe der Kartenzaehler
 *   Mult  = 1 + 0,5 je wirkende Sippenstufe + 1 fuer eine Krone
 *             + 0,5 je bezwungenem Boss
 *   Wertung = Basis x Mult, gerundet
 *
 * So lohnt eine Engine am Ende sichtbar - die grosse Zahl, auf die man
 * hinarbeitet. Ohne Akte bleibt es bei der alten Formel (Tagesbestenliste
 * alter Staende, Sandkasten).
 */

import { sippenBoni } from './cards/sippen';
import { eigeneWirkKarten, sippenRegeln } from './cards/wirkung';
import type { KartenSpieler } from './cards/wirkung';
import type { AkteStand } from './akte';

export type WertungsTeile = {
  basis: number;
  mult: number;
  gesamt: number;
  /** Woraus Basis und Mult bestehen - fuer die Anzeige. */
  basisZeilen: { text: string; wert: number }[];
  multZeilen: { text: string; wert: number }[];
};

export type WertungsSicht = {
  akte?: AkteStand | null;
  players: ReadonlyArray<KartenSpieler & { ruhm: number }>;
};

/** Die Summe der Kartenzaehler - ohne die inneren (#), die nur mitzaehlen. */
export const zaehlerSumme = (z: Record<string, number> | undefined): number =>
  Object.entries(z ?? {})
    .filter(([k]) => !k.includes('#'))
    .reduce((n, [, v]) => n + v, 0);

export function wertungTeile(s: WertungsSicht, id: string, punkte: number): WertungsTeile {
  const p = s.players.find((x) => x.id === id);
  const ruhm = p?.ruhm ?? 0;
  if (!s.akte || !p) {
    const gesamt = punkte * 10 + ruhm;
    return {
      basis: gesamt,
      mult: 1,
      gesamt,
      basisZeilen: [
        { text: `${punkte} Siegpunkte x 10`, wert: punkte * 10 },
        { text: `${ruhm} Ruhm`, wert: ruhm },
      ],
      multZeilen: [],
    };
  }
  const zaehler = zaehlerSumme(p.zaehler);
  const basisZeilen = [
    { text: `${punkte} Siegpunkte x 10`, wert: punkte * 10 },
    { text: `${ruhm} Ruhm x 3`, wert: ruhm * 3 },
    ...(zaehler > 0 ? [{ text: 'Kartenzaehler', wert: zaehler }] : []),
  ];
  const stufen = sippenBoni(p.sippe, p.sippeSeit, sippenRegeln(eigeneWirkKarten(p))).length;
  const bosse = (s.akte.siege[id] ?? []).length + (s.akte.zugaben?.[id] ?? 0);
  const multZeilen = [
    { text: 'Grundwert', wert: 1 },
    ...(stufen > 0 ? [{ text: `${stufen} Sippenstufen x 0,5`, wert: stufen * 0.5 }] : []),
    ...(p.krone ? [{ text: 'Krone', wert: 1 }] : []),
    ...(bosse > 0 ? [{ text: `${bosse} ${bosse === 1 ? 'Boss' : 'Bosse'} x 0,5`, wert: bosse * 0.5 }] : []),
  ];
  const basis = basisZeilen.reduce((n, z) => n + z.wert, 0);
  const mult = multZeilen.reduce((n, z) => n + z.wert, 0);
  return { basis, mult, gesamt: Math.round(basis * mult), basisZeilen, multZeilen };
}
