/**
 * Tageszeit und Wetter.
 *
 * Wie die Jahreszeit (season.ts) aus der Zugnummer abgeleitet - das Wetter
 * zusaetzlich aus dem oeffentlichen Seed. Nichts wird gespeichert oder
 * uebertragen, und alle am Tisch sehen dasselbe Wetter.
 *
 * TAGESZEIT. Jede grosse Runde ist ein Tag: Morgen, Tag, Tag, Abend, Nacht.
 * Die Nacht aendert Regeln - die Sicht wird kuerzer (units.ts, sightOf), und
 * Goblins ziehen in Horden los (rules/army.ts, beginNight).
 *
 * WETTER wechselt alle zwei Runden und haengt von der Jahreszeit ab: im Winter
 * schneit es statt zu regnen, im Sommer ist es meist klar. Es ist bisher reine
 * Anschauung (client/board/WetterSchicht.tsx).
 */

import { hash3i } from './hash';
import { ROUNDS_PER_BIG_ROUND, roundOf, seasonOf } from './season';
import type { Season } from './season';

export const TAGESZEITEN = ['morgen', 'tag', 'abend', 'nacht'] as const;
export type Tageszeit = (typeof TAGESZEITEN)[number];

export const TAGESZEIT_NAME: Record<Tageszeit, string> = {
  morgen: 'Morgen',
  tag: 'Tag',
  abend: 'Abend',
  nacht: 'Nacht',
};

/** Der Ablauf eines Tages - eine Stelle je Runde der grossen Runde. */
const ABLAUF: readonly Tageszeit[] = ['morgen', 'tag', 'tag', 'abend', 'nacht'];

export function tageszeitOf(turn: number): Tageszeit {
  return ABLAUF[(roundOf(turn) - 1) % ROUNDS_PER_BIG_ROUND]!;
}

export const istNacht = (turn: number): boolean => tageszeitOf(turn) === 'nacht';

/** Beginnt mit diesem Zug die Nacht? Einmal je Nacht, wie bigRoundChangedAt. */
export function nachtBeginntAt(turn: number): boolean {
  return turn >= 1 && istNacht(turn) && !istNacht(turn - 1);
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

/** Wie oft welches Wetter je Jahreszeit kommt. */
const GEWICHTE: Record<Season, ReadonlyArray<readonly [Wetter, number]>> = {
  spring: [['klar', 4], ['wolkig', 3], ['regen', 3], ['gewitter', 1], ['nebel', 1]],
  summer: [['klar', 6], ['wolkig', 2], ['regen', 1], ['gewitter', 2]],
  autumn: [['klar', 2], ['wolkig', 3], ['regen', 3], ['gewitter', 1], ['nebel', 3]],
  winter: [['klar', 2], ['wolkig', 3], ['schnee', 5], ['nebel', 2]],
};

/** Runden, die ein Wetter haelt. */
export const WETTER_RUNDEN = 2;

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
