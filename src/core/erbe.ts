/**
 * Erbstuecke: was eine Generation der naechsten hinterlaesst (OVERHAUL.md,
 * Abschnitt 3 - die Dynastie).
 *
 * Am Ende einer Partie waehlt man eines der Erbstuecke, die sie freigeschaltet
 * hat - wer ein Lager zerstoerte, darf das Kriegsbanner weitergeben, wer ein
 * Wunder baute, den Plan des Baumeisters. Der Nachfolger in der naechsten
 * Partie beginnt damit.
 *
 * FAIRNESS. Ein Erbstueck wirkt nur in gewoehnlichen Partien allein - nicht in
 * der Tagesexpedition und nicht im Szenario (dort zaehlen Vergleiche), und
 * nicht gegen Mitspieler. Dort ist es nur ein Name in der Chronik.
 *
 * Kleine Gaben zum Start, keine Regeln: ein paar Rohstoffe, eine Kartenwahl,
 * etwas Ruhm. Es soll sich nach Familie anfuehlen, nicht nach Aufruesten.
 */

import type { Hand } from './state';

export type ErbstueckId = 'grundstein' | 'kriegsbanner' | 'handelssiegel' | 'ahnenkarte' | 'bauplan' | 'andenken';

export type Erbstueck = {
  id: ErbstueckId;
  name: string;
  /** Was es in der naechsten Partie bewirkt. */
  wirkung: string;
  /** Wofuer es freigeschaltet wird - in Worten. */
  wofuer: string;
  gabe: { hand?: Partial<Hand>; beute?: number; ruhm?: number };
};

export const ERBSTUECKE: readonly Erbstueck[] = [
  { id: 'grundstein', name: 'Der Grundstein', wirkung: 'Start mit 1 Holz und 1 Lehm mehr.', wofuer: 'eine Stadt gebaut', gabe: { hand: { lumber: 1, brick: 1 } } },
  { id: 'kriegsbanner', name: 'Das Kriegsbanner', wirkung: 'Start mit 2 Ruhm.', wofuer: 'ein Lager zerstoert', gabe: { ruhm: 2 } },
  { id: 'handelssiegel', name: 'Das Handelssiegel', wirkung: 'Start mit 2 Wolle und 1 Getreide mehr.', wofuer: '10 Mal gehandelt', gabe: { hand: { wool: 2, grain: 1 } } },
  { id: 'ahnenkarte', name: 'Die Karte der Ahnen', wirkung: 'Start mit einer Kartenwahl (Beute).', wofuer: '2 Ruinen oder Auftraege', gabe: { beute: 1 } },
  { id: 'bauplan', name: 'Der Plan des Baumeisters', wirkung: 'Start mit 1 Erz und 1 Lehm mehr.', wofuer: 'ein Weltwunder errichtet', gabe: { hand: { ore: 1, brick: 1 } } },
  { id: 'andenken', name: 'Ein Andenken', wirkung: 'Nur eine Erinnerung - keine Gabe.', wofuer: 'jede Partie', gabe: {} },
];

export const erbstueckById = (id: string | null | undefined): Erbstueck | undefined => ERBSTUECKE.find((e) => e.id === id);

export const istErbstueck = (x: unknown): x is ErbstueckId => typeof x === 'string' && ERBSTUECKE.some((e) => e.id === x);

/** Was eine beendete Partie freischaltet - aus den Zahlen ihrer Chronik. */
export function freieErbstuecke(z: {
  staedte: number;
  lager: number;
  handel: number;
  ruinen: number;
  auftraege: number;
  wunder: number;
}): ErbstueckId[] {
  const out: ErbstueckId[] = [];
  if (z.staedte >= 1) out.push('grundstein');
  if (z.lager >= 1) out.push('kriegsbanner');
  if (z.handel >= 10) out.push('handelssiegel');
  if (z.ruinen + z.auftraege >= 2) out.push('ahnenkarte');
  if (z.wunder >= 1) out.push('bauplan');
  out.push('andenken');
  return out;
}

/** Die Familienart: woran man ein Haus ueber Generationen erkennt. */
export type Familienart = 'baumeister' | 'krieger' | 'haendler' | 'entdecker';

export const FAMILIENART: Record<Familienart, { name: string; text: string }> = {
  baumeister: { name: 'Baumeister', text: 'Dieses Haus baut Staedte, wo andere Zelte schlagen.' },
  krieger: { name: 'Krieger', text: 'Die Banden fuerchten den Namen dieses Hauses.' },
  haendler: { name: 'Haendler', text: 'Was dieses Haus anfasst, wird zu Handel.' },
  entdecker: { name: 'Entdecker', text: 'Kein Nebel haelt dieses Haus lange auf.' },
};

/** Die Art aus den Taten der letzten Generationen - was am haeufigsten ueberwog. */
export function familienart(zahlen: readonly { staedte: number; lager: number; handel: number; ruinen: number }[]): Familienart | null {
  if (zahlen.length === 0) return null;
  const sum = { baumeister: 0, krieger: 0, haendler: 0, entdecker: 0 };
  for (const z of zahlen) {
    sum.baumeister += z.staedte * 2;
    sum.krieger += z.lager * 3;
    sum.haendler += z.handel / 4;
    sum.entdecker += z.ruinen * 3;
  }
  const best = (Object.entries(sum) as [Familienart, number][]).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : null;
}
