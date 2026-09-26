/**
 * Omen: Regeln, die fuer eine ganze Partie gelten.
 *
 * Die vierte Kartenart aus DESIGN.md ("Regel") - nur nicht als Karte, die
 * einer nimmt, sondern als Vorzeichen, unter dem die Partie fuer alle steht.
 * Jede Partie bekommt in der Lobby zwei davon, meist einen Segen und einen
 * Fluch. Sie machen Partien unterscheidbar, ohne dass eine neue Mechanik
 * noetig waere: jedes Omen greift an genau einer Stelle, die es schon gibt.
 *
 *   Ertrag        rules/production.ts  (ertragsBonus)
 *   Bankhandel    rules/trade.ts       (handelsAufschlag)
 *   Handgrenze    rules/handlimit.ts   (handGrenzeBonus)
 *   Raubzuege     rules/army.ts        (sendRaiders, beginBigRound)
 *   Horden        rules/army.ts        (sendHorde)
 *   Schleime      rules/army.ts        (nachtVolk)
 *   Aufbau, Fund  rules/reducer.ts
 *
 * Wie Gelaende und Kartenwahl eine reine Funktion: dieselbe Zahl ergibt
 * dieselben Omen. Die Tagesexpedition (core/tages.ts) nutzt das - alle, die
 * am selben Tag spielen, stehen unter denselben Vorzeichen.
 *
 * Oeffentlich: im Spielstand steht nur die Liste der Kennungen, und die sieht
 * jeder. Ein Omen, das man nicht kennt, waere kein Vorzeichen, sondern eine
 * Falle.
 */

import { Rng } from './rng';
import type { Terrain } from './types';

export type OmenArt = 'segen' | 'fluch';

export type Omen = {
  id: string;
  name: string;
  art: OmenArt;
  /** Ein Satz, wie auf einer Karte. */
  text: string;
  /** Kennungen, die nicht gleichzeitig gelten koennen - sie heben sich auf. */
  gegen?: string[];
};

export const OMEN: readonly Omen[] = [
  // --- Segen -----------------------------------------------------------------
  {
    id: 'reiche_adern',
    name: 'Reiche Adern',
    art: 'segen',
    text: 'Berge liefern allen 1 Erz mehr.',
  },
  {
    id: 'saftige_weiden',
    name: 'Saftige Weiden',
    art: 'segen',
    text: 'Weiden liefern allen 1 Wolle mehr.',
    gegen: ['magere_weiden'],
  },
  {
    id: 'dichte_waelder',
    name: 'Dichte Waelder',
    art: 'segen',
    text: 'Waelder liefern allen 1 Holz mehr.',
  },
  {
    id: 'handelswinde',
    name: 'Handelswinde',
    art: 'segen',
    text: 'Bankhandel 3:1 fuer alle, auch ohne Hafen.',
    gegen: ['zoellner'],
  },
  {
    id: 'glueckliche_sieben',
    name: 'Glueckliche Sieben',
    art: 'segen',
    text: 'Bei einer 7 gibt es zum Fund noch 2 zufaellige Rohstoffe.',
  },
  {
    id: 'gruenderzeit',
    name: 'Gruenderzeit',
    art: 'segen',
    text: 'Jeder beginnt mit einer Beute - einer Kartenwahl.',
  },
  {
    id: 'volle_speicher',
    name: 'Volle Speicher',
    art: 'segen',
    text: 'Die Handkartengrenze steigt um 3.',
    gegen: ['leere_taschen'],
  },
  {
    id: 'ruhige_grenzen',
    name: 'Ruhige Grenzen',
    art: 'segen',
    text: 'Raubzuege brechen nur in jeder zweiten grossen Runde auf.',
    gegen: ['unruhige_staemme'],
  },

  // --- Fluch -----------------------------------------------------------------
  {
    id: 'magere_weiden',
    name: 'Magere Weiden',
    art: 'fluch',
    text: 'Weiden liefern allen 1 Wolle weniger - ein Dorf dort nichts.',
    gegen: ['saftige_weiden'],
  },
  {
    id: 'zoellner',
    name: 'Zoellner',
    art: 'fluch',
    text: 'Jeder Bankhandel kostet eine Karte mehr.',
    gegen: ['handelswinde'],
  },
  {
    id: 'leere_taschen',
    name: 'Leere Taschen',
    art: 'fluch',
    text: 'Die Handkartengrenze sinkt um 2.',
    gegen: ['volle_speicher'],
  },
  {
    id: 'blutmond',
    name: 'Blutmond',
    art: 'fluch',
    text: 'Jede Nacht kommt eine Goblin-Horde, und sie ist 2 Goblins staerker.',
  },
  {
    id: 'unruhige_staemme',
    name: 'Unruhige Staemme',
    art: 'fluch',
    text: 'Je grosser Runde bricht ein Raubzug mehr auf.',
    gegen: ['ruhige_grenzen'],
  },
  {
    id: 'dunkle_naechte',
    name: 'Dunkle Naechte',
    art: 'fluch',
    text: 'Jede Nacht kriechen doppelt so viele Schleime aus dem Dunkel.',
  },
];

const NACH_ID = new Map(OMEN.map((o) => [o.id, o]));

export const omenById = (id: string): Omen | undefined => NACH_ID.get(id);

/** Nur bekannte Kennungen, ohne Doppelte - was der Client schickt, wird nicht geglaubt. */
export function gueltigeOmen(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !NACH_ID.has(id) || out.includes(id)) continue;
    if (out.some((o) => NACH_ID.get(o)!.gegen?.includes(id))) continue;
    out.push(id);
  }
  return out;
}

/**
 * Die Omen einer Partie, aus einer Zahl.
 *
 * Ein Segen und ein Fluch als Grundform: so ist keine Partie nur leichter oder
 * nur schwerer, sondern anders. flueche erlaubt die haertere Tagesexpedition.
 * Was sich gegenseitig aufhebt, kommt nie zusammen.
 */
export function wuerfleOmen(seed: number, segen = 1, flueche = 1): string[] {
  const rng = new Rng(seed ^ 0x6f6d656e);
  const out: string[] = [];
  const ziehe = (art: OmenArt, n: number): void => {
    const topf = rng.shuffle(OMEN.filter((o) => o.art === art).map((o) => o.id));
    for (const id of topf) {
      if (out.filter((x) => NACH_ID.get(x)!.art === art).length >= n) break;
      if (out.some((x) => NACH_ID.get(x)!.gegen?.includes(id))) continue;
      out.push(id);
    }
  };
  ziehe('segen', segen);
  ziehe('fluch', flueche);
  return out;
}

// --- Wirkungen --------------------------------------------------------------
//
// Jede Regel fragt hier nach, statt die Kennungen selbst zu kennen. Alle
// nehmen eine Liste, die fehlen darf: alte Spielstaende haben keine Omen.

type Omina = readonly string[] | undefined;

const gilt = (omen: Omina, id: string): boolean => omen?.includes(id) ?? false;

/** Mehr oder weniger Ertrag je Gelaende, fuer alle. */
export function ertragsBonus(omen: Omina, terrain: Terrain): number {
  let n = 0;
  if (terrain === 'mountain' && gilt(omen, 'reiche_adern')) n += 1;
  if (terrain === 'pasture' && gilt(omen, 'saftige_weiden')) n += 1;
  if (terrain === 'pasture' && gilt(omen, 'magere_weiden')) n -= 1;
  if (terrain === 'forest' && gilt(omen, 'dichte_waelder')) n += 1;
  return n;
}

/** Der Bankhandel: hoechstens so teuer (Handelswinde) - null, wenn nichts gilt. */
export function handelsDeckel(omen: Omina): number | null {
  return gilt(omen, 'handelswinde') ? 3 : null;
}

/** Aufschlag auf jeden Bankhandel (Zoellner). */
export function handelsAufschlag(omen: Omina): number {
  return gilt(omen, 'zoellner') ? 1 : 0;
}

/** Aenderung der Handkartengrenze. */
export function handGrenzeBonus(omen: Omina): number {
  return (gilt(omen, 'volle_speicher') ? 3 : 0) - (gilt(omen, 'leere_taschen') ? 2 : 0);
}

/** Zusaetzliche Raubzuege je grosser Runde. */
export const mehrRaubzuege = (omen: Omina): number => (gilt(omen, 'unruhige_staemme') ? 1 : 0);

/** Bricht in dieser grossen Runde ueberhaupt ein Raubzug auf? */
export const raubzugRunde = (omen: Omina, grosseRunde: number): boolean =>
  !gilt(omen, 'ruhige_grenzen') || grosseRunde % 2 === 0;

/** Horde: kommt sie sicher, und wie viele mehr? */
export const blutmond = (omen: Omina): boolean => gilt(omen, 'blutmond');

/** Wie viele Schleime je Spieler und Nacht. */
export const schleimFaktor = (omen: Omina): number => (gilt(omen, 'dunkle_naechte') ? 2 : 1);

/** Rohstoffe zusaetzlich zum Fund bei einer 7. */
export const siebenerBonus = (omen: Omina): number => (gilt(omen, 'glueckliche_sieben') ? 2 : 0);

/** Beute zu Beginn, fuer jeden. */
export const startBeute = (omen: Omina): number => (gilt(omen, 'gruenderzeit') ? 1 : 0);
