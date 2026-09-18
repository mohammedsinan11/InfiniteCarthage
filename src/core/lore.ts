/**
 * Heldenlore: Name, Beiname, Haus, Titel.
 *
 * Ein Held heisst nicht "Held", sondern "Aldebrand der Kuehne, Markgraf von
 * Sturmfels". Der Name entsteht aus dem rngState der Partie - wie Wuerfel und
 * Deck also auf dem Server und nirgends sonst (Math.random ist in src/core
 * verboten).
 *
 * Gebaut fuer das Adelshaus, das spaeter kommt: der Vorname zerfaellt in Stamm
 * und Endung. Ein Nachfolger behaelt Stamm, Haus und Titel und bekommt eine
 * neue Endung samt eigenem Geschlecht - so bleibt das Haus dasselbe und der
 * Mensch ist ein anderer (DESIGN.md, Heldenlore).
 *
 * Alles ohne Umlaute, wie ueberall im Projekt: ue, oe, ae.
 */

import { Rng } from './rng';

export type Geschlecht = 'm' | 'w';

export type HeldLore = {
  /** Der ganze Vorname: Stamm und Endung, etwa "Aldebrand". */
  vorname: string;
  /** Nur der Stamm, etwa "Alde" - daran erkennt man den Nachfolger. */
  stamm: string;
  /** Mit Artikel, etwa "der Kuehne". */
  beiname: string;
  /** Das Adelshaus, etwa "Sturmfels". Es ueberlebt seinen Traeger. */
  haus: string;
  /** Der Titel in der Form, die zum Geschlecht passt, etwa "Markgraefin". */
  titel: string;
  geschlecht: Geschlecht;
  /** Der wievielte seines Hauses - der erste ist 1. */
  folge: number;
  /**
   * Wie er aussieht: 0 bis GESTALTEN-1. Der Client zeichnet danach eine von
   * zehn Figuren (client/units.ts). Der Nachfolger bekommt eine andere - das
   * Haus bleibt, das Gesicht wechselt. Fehlt bei alten Staenden.
   */
  gestalt?: number;
};

/** So viele Heldenfiguren gibt es. */
export const GESTALTEN = 10;

/** Stamm des Vornamens - er bleibt im Haus. */
const STAEMME = [
  'Alde', 'Bran', 'Diet', 'Ecke', 'Falk', 'Gero', 'Hag', 'Isen', 'Jor', 'Kuno',
  'Lud', 'Mar', 'Nor', 'Ort', 'Rag', 'Sieg', 'Thur', 'Ul', 'Wal', 'Wolf',
] as const;

/** Endungen, aus denen der einzelne Mensch wird. */
const ENDUNG: Record<Geschlecht, readonly string[]> = {
  m: ['bert', 'brand', 'fried', 'ger', 'hard', 'mar', 'mund', 'olf', 'rich', 'win'],
  w: ['burg', 'gard', 'hild', 'lind', 'run', 'swind', 'traut', 'trud'],
};

/** Das Haus: vorderer und hinterer Teil, zusammengesetzt. */
const HAUS_VORN = [
  'Sturm', 'Eisen', 'Raben', 'Drachen', 'Wolfs', 'Nebel', 'Feuer', 'Eichen',
  'Silber', 'Nord', 'Mond', 'Dorn', 'Falken', 'Winter', 'Hoch',
] as const;
const HAUS_HINTEN = [
  'fels', 'wald', 'stein', 'furt', 'moor', 'horst', 'bach', 'mark', 'au', 'grund', 'tal', 'klamm',
] as const;

/** Titel als Paar: erst maennlich, dann weiblich. */
const TITEL: readonly (readonly [string, string])[] = [
  ['Graf', 'Graefin'],
  ['Markgraf', 'Markgraefin'],
  ['Burggraf', 'Burggraefin'],
  ['Freiherr', 'Freifrau'],
  ['Herzog', 'Herzogin'],
  ['Fuerst', 'Fuerstin'],
  ['Vogt', 'Voegtin'],
];

/** Beinamen, schon in der gebeugten Form - davor kommt nur der Artikel. */
const BEIWORT = [
  'Kuehne', 'Unbeugsame', 'Stille', 'Wachsame', 'Grimmige', 'Standhafte',
  'Listige', 'Eiserne', 'Getreue', 'Weitgereiste', 'Junge', 'Schweigsame',
  'Rastlose', 'Milde', 'Jaehe', 'Hartnaeckige',
] as const;

const zieh = <T>(rng: Rng, liste: readonly T[]): T => liste[rng.int(liste.length)]!;

/** Der Beiname mit Artikel: "der Kuehne", "die Kuehne". */
const mitArtikel = (wort: string, g: Geschlecht) => `${g === 'm' ? 'der' : 'die'} ${wort}`;

/**
 * Ein frischer Held: neues Haus, neuer Titel, neuer Name.
 *
 * nurGeschlecht legt es fest, statt es zu wuerfeln - fuer die Heilerin, deren
 * Amtsname weiblich ist (rules/zweig.ts). Ein Mann mit dem Titel "Heilerin"
 * laese sich wie ein Fehler.
 */
export function wuerfleHeld(rng: Rng, nurGeschlecht?: Geschlecht): HeldLore {
  const geschlecht: Geschlecht = nurGeschlecht ?? (rng.int(2) === 0 ? 'm' : 'w');
  const stamm = zieh(rng, STAEMME);
  const titel = zieh(rng, TITEL);
  return {
    vorname: stamm + zieh(rng, ENDUNG[geschlecht]),
    stamm,
    beiname: mitArtikel(zieh(rng, BEIWORT), geschlecht),
    haus: zieh(rng, HAUS_VORN) + zieh(rng, HAUS_HINTEN),
    titel: titel[geschlecht === 'm' ? 0 : 1],
    geschlecht,
    folge: 1,
    gestalt: rng.int(GESTALTEN),
  };
}

/**
 * Der Nachfolger: derselbe Stamm, dasselbe Haus, derselbe Titel - nur Endung,
 * Geschlecht und Beiname sind neu. Faellt die Endung genauso aus wie beim
 * Vorgaenger, wird die naechste genommen: zwei gleiche Namen hintereinander
 * lesen sich wie ein Fehler.
 */
export function nachfolger(rng: Rng, alt: HeldLore): HeldLore {
  const geschlecht: Geschlecht = rng.int(2) === 0 ? 'm' : 'w';
  const endungen = ENDUNG[geschlecht];
  let i = rng.int(endungen.length);
  if (alt.stamm + endungen[i]! === alt.vorname) i = (i + 1) % endungen.length;
  const titel = TITEL.find(([m, w]) => m === alt.titel || w === alt.titel);
  return {
    vorname: alt.stamm + endungen[i]!,
    stamm: alt.stamm,
    beiname: mitArtikel(zieh(rng, BEIWORT), geschlecht),
    haus: alt.haus,
    titel: titel ? titel[geschlecht === 'm' ? 0 : 1] : alt.titel,
    geschlecht,
    folge: alt.folge + 1,
    // Nie dieselbe Gestalt wie der Vorgaenger - sonst sieht der Nachfolger aus wie er.
    gestalt: ((alt.gestalt ?? 0) + 1 + rng.int(GESTALTEN - 1)) % GESTALTEN,
  };
}

/**
 * Der Name einer einfachen Einheit, die sich hochgedient hat: Vorname und
 * Beiname, ohne Haus und ohne Titel - sie ist niemand von Stand, sie hat sich
 * das Recht auf einen Namen erkaempft (rules/army.ts, STUFEN_AB).
 *
 * Bewusst aus denselben Bausteinen wie der Held: dasselbe Land, dieselben
 * Namen. Nur der Rang fehlt.
 */
export function einheitName(rng: Rng): string {
  const geschlecht: Geschlecht = rng.int(2) === 0 ? 'm' : 'w';
  const vorname = zieh(rng, STAEMME) + zieh(rng, ENDUNG[geschlecht]);
  return `${vorname} ${mitArtikel(zieh(rng, BEIWORT), geschlecht)}`;
}

/** Wie der Held ueber seiner Figur steht: "Aldebrand der Kuehne". */
export const heldKurz = (l: HeldLore): string => `${l.vorname} ${l.beiname}`;

/** Der volle Name mit Titel und Haus - fuer Tafeln und Meldungen. */
export const heldVoll = (l: HeldLore): string => `${heldKurz(l)}, ${l.titel} von ${l.haus}`;
