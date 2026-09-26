/**
 * Ereignisse: kleine Geschichten mit einer Wahl.
 *
 * Alle paar Zuege klopft nach dem Wurf etwas an die Tuer - Fluechtlinge, ein
 * Schmied auf Wanderschaft, ein harter Winter. Zwei oder drei Antworten, jede
 * mit einer kleinen Folge: Rohstoffe geben oder bekommen, Ruhm, eine
 * Kartenwahl, ein Ritter. So erzaehlt jede Partie ihre eigene Geschichte, und
 * die Entscheidungen haengen davon ab, was man gerade braucht
 * (REPLAYABILITY.md, K).
 *
 * Bewusst eine kleine, geschlossene Liste von Folgen - keine Mechanik fuer
 * beliebige Wirkungen. Jede Wahl, die etwas kostet, ist nur waehlbar, wenn man
 * es hat; mindestens eine Wahl ist immer frei (test/ereignisse.test.ts).
 *
 * Welches Ereignis kommt, folgt aus geheimem Seed und Zugnummer, gewichtet
 * nach Jahreszeit; schon gesehene kommen erst wieder, wenn alle durch sind.
 */

import { Rng } from './rng';
import { hash3i } from './hash';
import type { Bundle, Resource } from './types';
import type { Season } from './season';

export type Folge = {
  /** Das bekommt man. */
  gib?: Bundle;
  /** Das kostet es - nur waehlbar, wenn man es hat. */
  zahle?: Bundle;
  /** So viele zufaellige Rohstoffe dazu. */
  zufall?: number;
  /** So viele Karten verliert man, vom groessten Stapel (wie beim Pluendern). */
  verliere?: number;
  /** Kartenwahlen (Beute). */
  beute?: number;
  ruhm?: number;
  /** Ritter, die an einer Siedlung antreten. */
  ritter?: number;
};

export type Wahl = {
  text: string;
  folge: Folge;
  /** Nur mit Held auf der Karte waehlbar. */
  brauchtHeld?: boolean;
};

export type Ereignis = {
  id: string;
  titel: string;
  text: string;
  /** Nur in diesen Jahreszeiten - fehlt: jederzeit. */
  zeit?: readonly Season[];
  wahlen: readonly Wahl[];
};

const r = (b: Partial<Record<Resource, number>>): Bundle => b;

export const EREIGNISSE: readonly Ereignis[] = [
  {
    id: 'fluechtlinge',
    titel: 'Fluechtlinge am Tor',
    text: 'Eine Familie aus einem gepluenderten Dorf bittet um Obdach. Sie haben nichts - ausser dem, was sie wissen.',
    wahlen: [
      { text: 'Aufnehmen (2 Getreide): +1 Ruhm und eine Kartenwahl', folge: { zahle: r({ grain: 2 }), ruhm: 1, beute: 1 } },
      { text: 'Mit Proviant weiterschicken (1 Getreide): +1 Ruhm', folge: { zahle: r({ grain: 1 }), ruhm: 1 } },
      { text: 'Die Tore bleiben zu', folge: {} },
    ],
  },
  {
    id: 'wanderschmied',
    titel: 'Ein Schmied auf Wanderschaft',
    text: 'Er sucht einen Herrn, dem er dienen kann. Sein Hammer ist schwer, sein Lohn auch.',
    wahlen: [
      { text: 'Anwerben (2 Erz): ein Ritter tritt an', folge: { zahle: r({ ore: 2 }), ritter: 1 } },
      { text: 'Ihm Holz zum Arbeiten geben (2 Holz): 2 Erz', folge: { zahle: r({ lumber: 2 }), gib: r({ ore: 2 }) } },
      { text: 'Weiterziehen lassen', folge: {} },
    ],
  },
  {
    id: 'schatzkarte',
    titel: 'Eine zerrissene Schatzkarte',
    text: 'Ein Haendler verkauft das halbe Blatt einer alten Karte. Die andere Haelfte? "Liegt irgendwo im Osten."',
    wahlen: [
      { text: 'Kaufen (1 Wolle, 1 Getreide): eine Kartenwahl', folge: { zahle: r({ wool: 1, grain: 1 }), beute: 1 } },
      { text: 'Den Helden selbst suchen lassen: 3 zufaellige Rohstoffe', folge: { zufall: 3 }, brauchtHeld: true },
      { text: 'Ablehnen', folge: {} },
    ],
  },
  {
    id: 'turnier',
    titel: 'Ein Turnier',
    text: 'Die Herren der Umgebung messen sich. Ein Sieg spricht sich herum.',
    wahlen: [
      { text: 'Ausrichten (1 Erz, 1 Wolle, 1 Getreide): +3 Ruhm', folge: { zahle: r({ ore: 1, wool: 1, grain: 1 }), ruhm: 3 } },
      { text: 'Den Helden antreten lassen: +1 Ruhm', folge: { ruhm: 1 }, brauchtHeld: true },
      { text: 'Fernbleiben', folge: {} },
    ],
  },
  {
    id: 'pilger',
    titel: 'Pilger auf dem Weg',
    text: 'Sie ziehen singend vorbei und bitten um Brot.',
    wahlen: [
      { text: 'Brot geben (1 Getreide): +1 Ruhm', folge: { zahle: r({ grain: 1 }), ruhm: 1 } },
      { text: 'Einen Wegzoll verlangen: 1 zufaelliger Rohstoff', folge: { zufall: 1 } },
    ],
  },
  {
    id: 'alte_muenzen',
    titel: 'Alte Muenzen im Acker',
    text: 'Beim Pfluegen stoesst ein Bauer auf einen Topf voller Muenzen aus einer vergessenen Zeit.',
    wahlen: [
      { text: 'In die Schatzkammer: 2 zufaellige Rohstoffe', folge: { zufall: 2 } },
      { text: 'Dem Bauern lassen: +1 Ruhm', folge: { ruhm: 1 } },
    ],
  },
  {
    id: 'baumeister',
    titel: 'Ein Baumeister aus der Fremde',
    text: 'Er hat Kathedralen gesehen und will hier etwas Bleibendes schaffen.',
    wahlen: [
      { text: 'Ihn bezahlen (1 Wolle, 1 Getreide): 2 Holz, 2 Lehm', folge: { zahle: r({ wool: 1, grain: 1 }), gib: r({ lumber: 2, brick: 2 }) } },
      { text: 'Ihm eine Unterkunft geben: 1 Lehm', folge: { gib: r({ brick: 1 }) } },
    ],
  },
  {
    id: 'seuche',
    titel: 'Fieber in den Doerfern',
    text: 'In den Huetten liegen die Leute mit Fieber. Ein Heiler koennte helfen - er ist nicht billig.',
    wahlen: [
      { text: 'Den Heiler rufen (1 Erz, 1 Getreide)', folge: { zahle: r({ ore: 1, grain: 1 }) } },
      { text: 'Abwarten: du verlierst 2 Karten', folge: { verliere: 2 } },
    ],
  },
  {
    id: 'marktag',
    titel: 'Markttag',
    text: 'Haendler aus dem ganzen Land schlagen ihre Staende auf.',
    wahlen: [
      { text: 'Lehm verkaufen (2 Lehm): 1 Erz, 1 Getreide', folge: { zahle: r({ brick: 2 }), gib: r({ ore: 1, grain: 1 }) } },
      { text: 'Holz verkaufen (2 Holz): 1 Wolle, 1 Getreide', folge: { zahle: r({ lumber: 2 }), gib: r({ wool: 1, grain: 1 }) } },
      { text: 'Nur schauen', folge: {} },
    ],
  },
  {
    id: 'fruehlingsfest',
    titel: 'Fruehlingsfest',
    text: 'Das Eis ist geschmolzen, die Wiesen bluehen. Die Leute wollen feiern.',
    zeit: ['spring'],
    wahlen: [
      { text: 'Ein Fest ausrichten (1 Wolle, 1 Getreide): +2 Ruhm', folge: { zahle: r({ wool: 1, grain: 1 }), ruhm: 2 } },
      { text: 'Aussaat geht vor: 1 Getreide', folge: { gib: r({ grain: 1 }) } },
    ],
  },
  {
    id: 'schafschur',
    titel: 'Die Schafschur',
    text: 'Die Herden sind fett geworden. Die Wolle stapelt sich.',
    zeit: ['spring', 'summer'],
    wahlen: [
      { text: 'Alles scheren: 2 Wolle', folge: { gib: r({ wool: 2 }) } },
      { text: 'Die Haelfte verkaufen: 1 Wolle, 1 zufaelliger Rohstoff', folge: { gib: r({ wool: 1 }), zufall: 1 } },
    ],
  },
  {
    id: 'duerre',
    titel: 'Duerre',
    text: 'Seit Wochen kein Regen. Die Felder vertrocknen.',
    zeit: ['summer'],
    wahlen: [
      { text: 'Brunnen graben (2 Lehm)', folge: { zahle: r({ brick: 2 }) } },
      { text: 'Hoffen: du verlierst 2 Karten', folge: { verliere: 2 } },
    ],
  },
  {
    id: 'hitzegewitter',
    titel: 'Sommergewitter',
    text: 'Ein Blitz faellt in den Wald. Das Feuer ist schnell geloescht - das Holz liegt nun am Boden.',
    zeit: ['summer'],
    wahlen: [
      { text: 'Das Holz sammeln: 2 Holz', folge: { gib: r({ lumber: 2 }) } },
      { text: 'Den Wald aufforsten lassen: +1 Ruhm', folge: { ruhm: 1 } },
    ],
  },
  {
    id: 'erntedank',
    titel: 'Erntedank',
    text: 'Die Scheunen sind voll. Die Frage ist nur, was man damit macht.',
    zeit: ['autumn'],
    wahlen: [
      { text: 'Einlagern: 3 Getreide', folge: { gib: r({ grain: 3 }) } },
      { text: 'Ein Erntefest (keine Kosten): +2 Ruhm', folge: { ruhm: 2 } },
    ],
  },
  {
    id: 'zugvoegel',
    titel: 'Fremde Zugvoegel',
    text: 'Sie kommen aus einer Richtung, aus der noch nie Voegel kamen. Die Seher sind unruhig.',
    zeit: ['autumn'],
    wahlen: [
      { text: 'Die Seher befragen (1 Wolle): eine Kartenwahl', folge: { zahle: r({ wool: 1 }), beute: 1 } },
      { text: 'Aberglaube', folge: {} },
    ],
  },
  {
    id: 'wintereinbruch',
    titel: 'Frueher Frost',
    text: 'Ueber Nacht ist alles gefroren. Die Leute frieren.',
    zeit: ['winter'],
    wahlen: [
      { text: 'Holz verteilen (2 Holz): +1 Ruhm', folge: { zahle: r({ lumber: 2 }), ruhm: 1 } },
      { text: 'Die Leute muessen durchhalten: du verlierst 2 Karten', folge: { verliere: 2 } },
    ],
  },
  {
    id: 'woelfe',
    titel: 'Woelfe',
    text: 'Ein hungriges Rudel reisst Schafe am Waldrand.',
    zeit: ['winter', 'autumn'],
    wahlen: [
      { text: 'Den Helden auf die Jagd schicken: +1 Ruhm, 1 Wolle', folge: { ruhm: 1, gib: r({ wool: 1 }) }, brauchtHeld: true },
      { text: 'Einen Zaun bauen (1 Holz)', folge: { zahle: r({ lumber: 1 }) } },
      { text: 'Die Schafe opfern: du verlierst 1 Karte', folge: { verliere: 1 } },
    ],
  },
  {
    id: 'wintergast',
    titel: 'Ein Gast im Winter',
    text: 'Ein alter Soldat bittet um einen Platz am Feuer. Er erzaehlt von Lagern und Ruinen, die er kennt.',
    zeit: ['winter'],
    wahlen: [
      { text: 'Aufnehmen (1 Getreide): eine Kartenwahl', folge: { zahle: r({ grain: 1 }), beute: 1 } },
      { text: 'Ihn als Wache anstellen (1 Getreide, 1 Erz): ein Ritter', folge: { zahle: r({ grain: 1, ore: 1 }), ritter: 1 } },
      { text: 'Die Tuer bleibt zu', folge: {} },
    ],
  },
];

const NACH_ID = new Map(EREIGNISSE.map((e) => [e.id, e]));
export const ereignisById = (id: string): Ereignis | undefined => NACH_ID.get(id);

/** Ab dem wievielten eigenen Zug, und in welchem Abstand, ein Ereignis kommt. */
export const EREIGNIS_AB = 4;
export const EREIGNIS_ALLE = 8;

/** Der wievielte eigene Zug ist das? Zug 1 ist der erste nach dem Aufbau. */
export const eigenerZug = (turn: number, spieler: number): number => Math.floor((turn - 1) / Math.max(1, spieler)) + 1;

/** Kommt in diesem Zug ein Ereignis? */
export function ereignisFaellig(turn: number, spieler: number): boolean {
  const k = eigenerZug(turn, spieler);
  return k >= EREIGNIS_AB && (k - EREIGNIS_AB) % EREIGNIS_ALLE === 0;
}

const SALT_EREIGNIS = 157;

/**
 * Welches Ereignis kommt - aus geheimem Seed und Zug, passend zur Jahreszeit,
 * ohne Wiederholung, solange es noch ungesehene gibt.
 */
export function waehleEreignis(secretSeed: number, turn: number, jahreszeit: Season, gesehen: readonly string[]): string {
  const passend = EREIGNISSE.filter((e) => !e.zeit || e.zeit.includes(jahreszeit));
  const neu = passend.filter((e) => !gesehen.includes(e.id));
  const topf = neu.length > 0 ? neu : passend;
  const rng = new Rng(hash3i(secretSeed, turn, SALT_EREIGNIS, 0));
  return topf[rng.int(topf.length)]!.id;
}
