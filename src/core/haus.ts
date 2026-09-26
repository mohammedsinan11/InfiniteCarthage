/**
 * Adelshaeuser: wer man in dieser Partie ist.
 *
 * Vor dem Aufbau bekommt jeder Spieler drei Haeuser angeboten und waehlt
 * eines (Phase 'hauswahl', rules/reducer.ts). Jedes Haus hat EINE Staerke
 * und EINE Schwaeche - nie reine Macht. So spielt man mit dem Bergclan
 * anders als mit Karthago, und die zweite Partie beginnt nicht wie die erste
 * (REPLAYABILITY.md, A).
 *
 * Fuer Einsteiger bewusst schlicht: jede Wirkung ist ein Satz, und jede greift
 * an einer Stelle, die es schon gibt - Ertrag, Bankhandel, Handkartengrenze,
 * Pluenderung, Startausstattung. Keine neue Mechanik, die man erst lernen
 * muesste.
 *
 * lore.ts erzeugt fuer jeden Helden ein Adelshaus mit Namen ("Sturmfels").
 * Das hier ist etwas anderes: die Art des Hauses, nicht sein Name. Der Held
 * behaelt seinen Hausnamen, das Haus bestimmt, wofuer es steht.
 *
 * Wie Omen oeffentlich: jeder sieht, welches Haus die anderen fuehren.
 */

import { Rng } from './rng';
import { hash3i } from './hash';
import type { Bundle, Terrain } from './types';

export type HausWirkung = {
  /** Mehr oder weniger Ertrag je Gelaende - nur fuer dieses Haus. */
  gelaende?: Partial<Record<Terrain, number>>;
  /** Bankhandel hoechstens so teuer (3 = 3:1 auf alles). */
  handelsDeckel?: number;
  /** Aufschlag auf jeden Bankhandel. */
  handelsAufschlag?: number;
  /** Aenderung der Handkartengrenze. */
  handGrenze?: number;
  /** So viele Karten mehr (oder weniger) nimmt jede Pluenderung. */
  pluenderung?: number;
  /** Regen halbiert die eigenen Felder nicht. */
  regenfest?: boolean;
  /** Was nach dem Aufbau zusaetzlich auf der Hand liegt. */
  startHand?: Bundle;
  /** Kartenwahlen (Beute) nach dem Aufbau. */
  startBeute?: number;
  /** Ritter, die nach dem Aufbau an einer Siedlung antreten. */
  startRitter?: number;
  /** Die zweite Siedlung bringt beim Aufbau keinen Ertrag. */
  keinStartErtrag?: boolean;
};

export type Haus = {
  id: string;
  name: string;
  /** Wofuer es steht, zwei, drei Worte - fuer die Tafel. */
  motto: string;
  staerke: string;
  schwaeche: string;
  /** Kurzer Rat fuer Einsteiger: wie spielt man es? */
  rat: string;
  wirkung: HausWirkung;
};

export const HAEUSER: readonly Haus[] = [
  {
    id: 'karthago',
    name: 'Haus Karthago',
    motto: 'Haendler und Seefahrer',
    staerke: 'Bankhandel 3:1 auf alles, auch ohne Hafen.',
    schwaeche: 'Die Handkartengrenze sinkt um 1.',
    rat: 'Siedle dort, wo viel von einer Sorte faellt, und tausche den Rest.',
    wirkung: { handelsDeckel: 3, handGrenze: -1 },
  },
  {
    id: 'bergclan',
    name: 'Der Bergclan',
    motto: 'Erz und Stein',
    staerke: 'Berge liefern dir 1 Erz mehr.',
    schwaeche: 'Jeder Bankhandel kostet dich eine Karte mehr.',
    rat: 'Siedle an Bergen und baue frueh Staedte.',
    wirkung: { gelaende: { mountain: 1 }, handelsAufschlag: 1 },
  },
  {
    id: 'waldvolk',
    name: 'Das Waldvolk',
    motto: 'Holz und Weg',
    staerke: 'Waelder liefern dir 1 Holz mehr. Du beginnst mit 2 Holz und 2 Lehm.',
    schwaeche: 'Jede Pluenderung nimmt dir eine Karte mehr.',
    rat: 'Baue schnell Strassen nach aussen und stelle frueh eine Wache.',
    wirkung: { gelaende: { forest: 1 }, startHand: { lumber: 2, brick: 2 }, pluenderung: 1 },
  },
  {
    id: 'ebene',
    name: 'Haus der Ebene',
    motto: 'Korn und Herde',
    staerke: 'Felder liefern dir 1 Getreide mehr, und Regen halbiert sie nicht.',
    schwaeche: 'Jede Pluenderung nimmt dir eine Karte mehr.',
    rat: 'Getreide ist der Stoff fuer Staedte und Ritter - tausche es gezielt.',
    wirkung: { gelaende: { field: 1 }, regenfest: true, pluenderung: 1 },
  },
  {
    id: 'klingen',
    name: 'Haus der Klingen',
    motto: 'Schwert und Ruhm',
    staerke: 'Du beginnst mit zwei Rittern an deinen Siedlungen.',
    schwaeche: 'Die Handkartengrenze sinkt um 1.',
    rat: 'Schicke die Ritter frueh gegen das naechste Lager - Beute ist Karten wert.',
    wirkung: { startRitter: 2, handGrenze: -1 },
  },
  {
    id: 'seher',
    name: 'Die Seher',
    motto: 'Karten und Zeichen',
    staerke: 'Du beginnst mit zwei Kartenwahlen.',
    schwaeche: 'Jeder Bankhandel kostet dich eine Karte mehr.',
    rat: 'Loese die Beute gleich ein - Dauerkarten wirken vom ersten Wurf an.',
    wirkung: { startBeute: 2, handelsAufschlag: 1 },
  },
  {
    id: 'speicher',
    name: 'Die Speicherherren',
    motto: 'Vorrat und Geduld',
    staerke: 'Die Handkartengrenze steigt um 4, und Pluenderer nehmen dir eine Karte weniger.',
    schwaeche: 'Deine zweite Siedlung bringt beim Aufbau keinen Ertrag.',
    rat: 'Spare fuer grosse Bauten - dir nimmt man nicht so leicht etwas weg.',
    wirkung: { handGrenze: 4, pluenderung: -1, keinStartErtrag: true },
  },
];

const NACH_ID = new Map(HAEUSER.map((h) => [h.id, h]));

export const hausById = (id: string | null | undefined): Haus | undefined =>
  id ? NACH_ID.get(id) : undefined;

/** Wie viele Haeuser jeder zur Wahl bekommt. */
export const HAUS_ANGEBOT = 3;

const SALT_HAUS = 131;

/**
 * Die drei Haeuser, die ein Spieler angeboten bekommt - rein aus geheimem Seed
 * und Platz. Bei der Tagesexpedition (gleicher Seed, ein Platz) bekommt so
 * jeder dieselbe Auswahl.
 */
export function hausAngebot(secretSeed: number, platz: number): string[] {
  const rng = new Rng(hash3i(secretSeed, platz, SALT_HAUS, 0));
  return rng.shuffle(HAEUSER.map((h) => h.id)).slice(0, HAUS_ANGEBOT);
}

// --- Wirkungen --------------------------------------------------------------

const w = (haus: string | null | undefined): HausWirkung => hausById(haus)?.wirkung ?? {};

export const hausGelaende = (haus: string | null | undefined, t: Terrain): number => w(haus).gelaende?.[t] ?? 0;
export const hausHandelsDeckel = (haus: string | null | undefined): number | null => w(haus).handelsDeckel ?? null;
export const hausHandelsAufschlag = (haus: string | null | undefined): number => w(haus).handelsAufschlag ?? 0;
export const hausHandGrenze = (haus: string | null | undefined): number => w(haus).handGrenze ?? 0;
export const hausPluenderung = (haus: string | null | undefined): number => w(haus).pluenderung ?? 0;
export const hausRegenfest = (haus: string | null | undefined): boolean => w(haus).regenfest ?? false;
export const hausWirkung = w;
