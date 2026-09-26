/**
 * Szenarien: kurze, gebaute Herausforderungen auf erzeugten Karten.
 *
 * Ein Ziel, eine Frist, feste Omen, eine Bewertung in Sternen: je schneller,
 * desto mehr. Die Karte ist jedes Mal neu (der Raum wuerfelt die Welt), die
 * Aufgabe bleibt - so lernt man ein System nach dem anderen und hat einen
 * Grund, es noch einmal besser zu machen (REPLAYABILITY.md, G).
 *
 * Nur Daten und eine reine Pruefung. Der Reducer fragt nach jeder Aktion, ob
 * das Ziel erreicht ist (szenarioPruefen); die Rundengrenze beendet ein
 * verfehltes Szenario wie jede andere Partie mit Grenze.
 */

import type { GameState, PlayerId } from './state';
import { totalPoints } from './state';

export type SzenarioZiel =
  | { t: 'staedte'; n: number }
  | { t: 'lager'; n: number }
  | { t: 'ruinen'; n: number }
  | { t: 'auftraege'; n: number }
  | { t: 'wunder' }
  /** Bis zum Ende durchhalten: nichts brennt nieder, und am Ende mindestens n Siegpunkte. */
  | { t: 'unversehrt'; punkte: number };

export type Szenario = {
  id: string;
  name: string;
  /** Die Geschichte dazu, zwei Saetze. */
  text: string;
  /** Das Ziel in einem Satz, wie es auf dem Schild steht. */
  aufgabe: string;
  ziel: SzenarioZiel;
  runden: number;
  omens: string[];
  /** Bis zu welcher Runde es 3 und 2 Sterne gibt; danach 1. */
  sterne: [number, number];
  /** So viele Runden bricht kein Raubzug auf - Zeit, sich einzurichten. */
  schonfrist?: number;
};

export const SZENARIEN: readonly Szenario[] = [
  {
    id: 'gruendung',
    name: 'Die Gruendung',
    text: 'Eine Handvoll Siedler, volle Speicher und ein ruhiger Fruehling. Aus Doerfern sollen Staedte werden - bevor die Banden kommen.',
    aufgabe: 'Besitze 4 Staedte.',
    ziel: { t: 'staedte', n: 4 },
    runden: 45,
    omens: ['volle_speicher'],
    sterne: [28, 36],
    schonfrist: 12,
  },
  {
    id: 'wunder',
    name: 'Das Wunder',
    text: 'Unweit der Siedlung liegen die Steine einer uralten Staette. Wer dort baut, wird erinnert.',
    aufgabe: 'Errichte ein Weltwunder.',
    ziel: { t: 'wunder' },
    runden: 45,
    omens: ['reiche_adern'],
    sterne: [26, 35],
  },
  {
    id: 'kundschafter',
    name: 'Die Kundschafter',
    text: 'Das Land ist voller Ruinen, und niemand weiss, was darin liegt. Der Held soll es herausfinden.',
    aufgabe: 'Erkunde 3 Ruinen.',
    ziel: { t: 'ruinen', n: 3 },
    runden: 40,
    omens: ['glueckliche_sieben'],
    sterne: [20, 30],
  },
  {
    id: 'lagerbrecher',
    name: 'Die Lagerbrecher',
    text: 'Die Staemme werden unruhig und schicken mehr Raubzuege als je zuvor. Es ist Zeit, zurueckzuschlagen.',
    aufgabe: 'Zerstoere 2 Lager.',
    ziel: { t: 'lager', n: 2 },
    runden: 50,
    omens: ['unruhige_staemme', 'volle_speicher'],
    sterne: [30, 40],
  },
  {
    id: 'wanderer',
    name: 'Freund der Wanderer',
    text: 'Auf den Strassen ziehen Wanderer, und jeder hat ein Anliegen. Wer hilft, dem wird geholfen.',
    aufgabe: 'Erfuelle 2 Auftraege von Wanderern.',
    ziel: { t: 'auftraege', n: 2 },
    runden: 50,
    omens: ['ruhige_grenzen'],
    sterne: [30, 40],
  },
  {
    id: 'blutmond',
    name: 'Die Blutmondnaechte',
    text: 'Der Mond steht rot, jede Nacht kommen die Horden, und das Dunkel ist voller Schleime. Haltet durch.',
    aufgabe: 'Lass bis Runde 40 nichts niederbrennen und habe am Ende 6 Siegpunkte.',
    ziel: { t: 'unversehrt', punkte: 6 },
    runden: 40,
    omens: ['blutmond', 'dunkle_naechte'],
    sterne: [40, 40],
  },
];

const NACH_ID = new Map(SZENARIEN.map((s) => [s.id, s]));
export const szenarioById = (id: string | null | undefined): Szenario | undefined => (id ? NACH_ID.get(id) : undefined);

/** Wie weit ist dieser Spieler? [erreicht, noetig] - fuer Schild und Pruefung. */
export function szenarioStand(s: GameState | { buildings: GameState['buildings']; chronik?: GameState['chronik'] | null; wunder?: GameState['wunder'] }, id: PlayerId, ziel: SzenarioZiel): [number, number] {
  const stats = s.chronik?.stats[id];
  switch (ziel.t) {
    case 'staedte':
      return [Object.values(s.buildings).filter((b) => b.owner === id && b.type === 'city').length, ziel.n];
    case 'lager':
      return [stats?.lager ?? 0, ziel.n];
    case 'ruinen':
      return [stats?.ruinen ?? 0, ziel.n];
    case 'auftraege':
      return [stats?.auftraege ?? 0, ziel.n];
    case 'wunder':
      return [Object.values(s.wunder ?? {}).some((w) => w.owner === id) ? 1 : 0, 1];
    case 'unversehrt':
      return [stats?.abgebrannt ?? 0, 0];
  }
}

/** Ist das Ziel erreicht? Unversehrt entscheidet erst die Rundengrenze. */
export function szenarioErreicht(s: GameState, id: PlayerId, ziel: SzenarioZiel): boolean {
  if (ziel.t === 'unversehrt') return false;
  const [ist, soll] = szenarioStand(s, id, ziel);
  return ist >= soll;
}

/** Bei Ablauf der Frist: gilt "unversehrt" als geschafft? */
export function unversehrtGeschafft(s: GameState, id: PlayerId, ziel: SzenarioZiel): boolean {
  return ziel.t === 'unversehrt' && (s.chronik?.stats[id]?.abgebrannt ?? 0) === 0 && totalPoints(s, id) >= ziel.punkte;
}

/** Sterne fuer eine Runde, in der das Ziel erreicht wurde. */
export function sterneFuer(sz: Szenario, runde: number): 1 | 2 | 3 {
  if (runde <= sz.sterne[0]) return 3;
  if (runde <= sz.sterne[1]) return 2;
  return 1;
}
