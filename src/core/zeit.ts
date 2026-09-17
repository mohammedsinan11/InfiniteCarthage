/**
 * Tageszeit und Wetter.
 *
 * Wie die Jahreszeit (season.ts) aus der Zugnummer abgeleitet - das Wetter
 * zusaetzlich aus dem oeffentlichen Seed. Nichts wird gespeichert oder
 * uebertragen, und alle am Tisch sehen dasselbe Wetter.
 *
 * TAGESZEIT. Ein Tag dauert zehn Runden: zwei Morgen, vier Tag, zwei Abend,
 * zwei Nacht. Anfangs war jede grosse Runde ein Tag (fuenf Runden) - Licht und
 * Stimmung wechselten dabei so schnell, dass man sie kaum wahrnahm, bevor schon
 * die naechste kam. Die Nacht aendert Regeln: die Sicht wird kuerzer (units.ts,
 * sightOf), und Goblins ziehen in Horden los (rules/army.ts, beginNight).
 *
 * WETTER haelt fuenf Runden, gewichtet nach Jahreszeit - im Winter schneit es
 * statt zu regnen, im Sommer ist es meist klar. Es wirkt auf die Regeln
 * (WETTER_WIRKUNG):
 *
 *   Regen, Gewitter  Getreidefelder liefern die Haelfte (rules/production.ts)
 *                    und Feuer gehen aus (rules/feuer.ts)
 *   Gewitter         Sturm: die Haefen sind geschlossen (rules/trade.ts)
 *   Schnee           Einheiten ziehen nur jede zweite Runde (rules/army.ts)
 *   Nebel            die Sicht reicht ein Feld weniger weit (units.ts, sightOf)
 */

import { hash3i } from './hash';
import { roundOf, seasonOf } from './season';
import type { Season } from './season';

export const TAGESZEITEN = ['morgen', 'tag', 'abend', 'nacht'] as const;
export type Tageszeit = (typeof TAGESZEITEN)[number];

export const TAGESZEIT_NAME: Record<Tageszeit, string> = {
  morgen: 'Morgen',
  tag: 'Tag',
  abend: 'Abend',
  nacht: 'Nacht',
};

/** Der Ablauf eines Tages - eine Stelle je Runde. */
const ABLAUF: readonly Tageszeit[] = [
  'morgen',
  'morgen',
  'tag',
  'tag',
  'tag',
  'tag',
  'abend',
  'abend',
  'nacht',
  'nacht',
];

/** Runden je Tag. */
export const TAG_RUNDEN = ABLAUF.length;

export function tageszeitOf(turn: number): Tageszeit {
  return ABLAUF[(roundOf(turn) - 1) % TAG_RUNDEN]!;
}

export const istNacht = (turn: number): boolean => tageszeitOf(turn) === 'nacht';

/** Beginnt mit diesem Zug die Nacht? Einmal je Nacht, wie bigRoundChangedAt. */
export function nachtBeginntAt(turn: number): boolean {
  return turn >= 1 && istNacht(turn) && !istNacht(turn - 1);
}

/** Beginnt mit diesem Zug der Tag? Gegenstueck zu nachtBeginntAt. */
export function tagBeginntAt(turn: number): boolean {
  return turn >= 1 && !istNacht(turn) && istNacht(turn - 1);
}

/** Wie viele Runden die laufende Tageszeit noch dauert, diese eingerechnet. */
export function rundenBisTageszeit(turn: number): number {
  const jetzt = tageszeitOf(turn);
  let n = 1;
  while (n < TAG_RUNDEN && tageszeitOf(Math.max(1, turn) + n) === jetzt) n++;
  return n;
}

export const WETTER_ARTEN = ['klar', 'wolkig', 'regen', 'gewitter', 'schnee', 'nebel'] as const;
export type Wetter = (typeof WETTER_ARTEN)[number];

export const WETTER_NAME: Record<Wetter, string> = {
  klar: 'Klar',
  wolkig: 'Bewoelkt',
  regen: 'Regen',
  gewitter: 'Gewitter',
  schnee: 'Schnee',
  nebel: 'Nebel',
};

/** Was ein Wetter an den Regeln aendert, in Worten. Leer: nichts. */
export const WETTER_WIRKUNG: Record<Wetter, string> = {
  klar: '',
  wolkig: '',
  regen: 'Getreidefelder liefern die Haelfte, Feuer gehen aus',
  gewitter: 'Sturm: Haefen geschlossen, Getreide halb, Feuer gehen aus',
  schnee: 'Einheiten ziehen nur jede zweite Runde',
  nebel: 'Die Sicht reicht ein Feld weniger weit',
};

/** Wie oft welches Wetter je Jahreszeit kommt. */
const GEWICHTE: Record<Season, ReadonlyArray<readonly [Wetter, number]>> = {
  spring: [['klar', 4], ['wolkig', 3], ['regen', 3], ['gewitter', 1], ['nebel', 1]],
  summer: [['klar', 6], ['wolkig', 2], ['regen', 1], ['gewitter', 2]],
  autumn: [['klar', 2], ['wolkig', 3], ['regen', 3], ['gewitter', 1], ['nebel', 3]],
  winter: [['klar', 2], ['wolkig', 3], ['schnee', 5], ['nebel', 2]],
};

/** Runden, die ein Wetter haelt. Anfangs zwei - zu kurz, um sich darauf einzustellen. */
export const WETTER_RUNDEN = 5;

const SALT_WETTER = 919;

export function wetterOf(seed: number, turn: number): Wetter {
  const abschnitt = Math.floor((roundOf(turn) - 1) / WETTER_RUNDEN);
  const liste = GEWICHTE[seasonOf(turn)];
  const summe = liste.reduce((n, [, g]) => n + g, 0);
  let wurf = (hash3i(seed, abschnitt, 0, SALT_WETTER) >>> 0) % summe;
  for (const [art, g] of liste) {
    if (wurf < g) return art;
    wurf -= g;
  }
  return 'klar';
}

/** Wie viele Runden das laufende Wetter noch haelt, diese eingerechnet. */
export function rundenBisWetter(turn: number): number {
  return WETTER_RUNDEN - ((roundOf(turn) - 1) % WETTER_RUNDEN);
}

// --- Wirkungen ----------------------------------------------------------------

/** Regnet es? Dann liefern Getreidefelder die Haelfte, und Feuer gehen aus. */
export const regnet = (w: Wetter): boolean => w === 'regen' || w === 'gewitter';

/** Sturm: die Haefen sind geschlossen. */
export const sturm = (w: Wetter): boolean => w === 'gewitter';

/**
 * Stehen die Einheiten in dieser Runde still? Im Schnee ziehen sie nur jede
 * zweite Runde - in den geraden bleiben sie stehen. Kaempfe und Pluenderungen
 * laufen weiter.
 */
export const einheitenRasten = (seed: number, turn: number): boolean =>
  wetterOf(seed, turn) === 'schnee' && turn % 2 === 0;

/** Was die Sicht verkuerzt. */
export type SichtLage = { nacht: boolean; nebel: boolean };

export function sichtLage(seed: number, turn: number): SichtLage {
  return { nacht: istNacht(turn), nebel: wetterOf(seed, turn) === 'nebel' };
}
