/**
 * Fraktionen: wem die Lager gehoeren.
 *
 * Bisher stand jedes Lager fuer sich - Raeuber hier, Goblins dort, ohne Namen
 * und ohne Verhaeltnis zueinander. Jetzt gehoert jedes Lager einer Fraktion,
 * einer Raeuberbande oder einem Goblinstamm, mit Namen und Farbe. Fraktionen
 * sind einander feind (core/combat.ts, feindlich): wo sich ihre Leute treffen,
 * wird gekaempft. Spaeter soll Diplomatie das aendern koennen.
 *
 * GEBIETE. Die Ebene ist in Zellen von FRAKTION_REGION Feldern geteilt, jede mit
 * einem verschobenen Mittelpunkt. Ein Feld gehoert der Fraktion, deren
 * Mittelpunkt ihm am naechsten liegt. So entstehen zusammenhaengende Gebiete
 * mit unregelmaessigen Grenzen statt eines Schachbretts; in einem Gebiet liegen
 * meist drei bis sechs Lager.
 *
 * Rein wie Gelaende und Lager: aus Seed und Koordinate, nie gespeichert und nie
 * uebertragen. Im Spielstand steht nur, wer ein fremdes Lager erobert hat
 * (GameState.nestFraktion).
 *
 * FARBEN. Neun, verteilt nach (cx mod 3, cy mod 3). Zwei Zellen derselben Farbe
 * liegen damit mindestens drei Zellen auseinander - Nachbarn unterscheiden sich
 * immer. Der Kern kennt nur die Nummer, die Farbe selbst ist Darstellung
 * (client/theme.ts).
 */

import { hash3i } from './hash';
import { Rng } from './rng';

/** Kantenlaenge einer Fraktionszelle in Axialkoordinaten. */
export const FRAKTION_REGION = 18;

/** So viele Fraktionsfarben gibt es. */
export const FRAKTION_FARBEN = 9;

/** Anteil der Goblinstaemme - wie frueher etwa jedes dritte Lager. */
const GOBLIN_ANTEIL = 0.35;

const SALT_MITTE = 81;
const SALT_ART = 82;
const SALT_NAME = 83;

const UINT = 4294967296;

export type FraktionArt = 'raeuber' | 'goblin';

export type Fraktion = {
  /** "f:cx:cy" - die Zelle, aus der sie stammt. */
  id: string;
  art: FraktionArt;
  name: string;
  /** Nummer der Farbe, 0 bis FRAKTION_FARBEN-1. */
  farbe: number;
};

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Axial nach kartesisch - Abstaende sollen rund sein, nicht schief. */
const kartesisch = (q: number, r: number) => ({ x: q + r / 2, y: (r * Math.sqrt(3)) / 2 });

/** Der verschobene Mittelpunkt einer Zelle. */
function mitte(seed: number, cx: number, cy: number): { x: number; y: number } {
  const rng = new Rng(hash3i(seed, cx, cy, SALT_MITTE));
  const q = (cx + 0.15 + 0.7 * (rng.next() / UINT)) * FRAKTION_REGION;
  const r = (cy + 0.15 + 0.7 * (rng.next() / UINT)) * FRAKTION_REGION;
  return kartesisch(q, r);
}

/** Zu welcher Zelle ein Feld gehoert: der naechste Mittelpunkt ringsum. */
export function fraktionsZelle(seed: number, q: number, r: number): [number, number] {
  const p = kartesisch(q, r);
  const cq = Math.floor(q / FRAKTION_REGION);
  const cr = Math.floor(r / FRAKTION_REGION);
  let best = Number.POSITIVE_INFINITY;
  let bx = cq;
  let by = cr;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const m = mitte(seed, cq + dx, cr + dy);
      const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2;
      if (d < best) {
        best = d;
        bx = cq + dx;
        by = cr + dy;
      }
    }
  }
  return [bx, by];
}

const RAEUBER_VORN = ['Asche', 'Blut', 'Nebel', 'Eisen', 'Moor', 'Dorn', 'Rost', 'Schatten', 'Kohle', 'Galgen', 'Stein', 'Brand'];
const RAEUBER_TIER = ['woelfe', 'ratten', 'fuechse', 'geier', 'eber', 'nattern', 'hunde', 'marder', 'raben', 'keiler'];
const RAEUBER_ORT = ['Galgenberg', 'Kraehenfels', 'Schwarzmoor', 'Dornental', 'Wolfsgrund', 'Rabenstein', 'Aschenhain', 'Brandheide', 'Eisenklamm', 'Nebelbruch'];
const GOBLIN_SILBE = ['Grutz', 'Snik', 'Murk', 'Blarg', 'Zog', 'Krik', 'Nag', 'Gnarz', 'Rotz', 'Knorz'];
const GOBLIN_ENDE = ['maul', 'zahn', 'ohr', 'fratz', 'knack', 'schlick', 'beiss', 'nase', 'kralle', 'bauch'];
const GOBLIN_STOFF = ['Schlamm', 'Pilz', 'Knochen', 'Kroeten', 'Moder', 'Schimmel', 'Wurzel', 'Kiesel'];
const GOBLIN_MEHR = ['zaehne', 'fresser', 'beisser', 'kriecher', 'schlucker', 'nager'];

function nameFuer(seed: number, cx: number, cy: number, art: FraktionArt): string {
  const rng = new Rng(hash3i(seed, cx, cy, SALT_NAME));
  const eins = (liste: readonly string[]) => liste[rng.int(liste.length)]!;
  if (art === 'goblin') {
    return rng.int(2) === 0
      ? `Stamm ${eins(GOBLIN_SILBE)}${eins(GOBLIN_ENDE)}`
      : `Die ${eins(GOBLIN_STOFF)}${eins(GOBLIN_MEHR)}`;
  }
  return rng.int(2) === 0
    ? `Die ${eins(RAEUBER_VORN)}${eins(RAEUBER_TIER)}`
    : `Bande von ${eins(RAEUBER_ORT)}`;
}

const MERK_MAX = 4000;
const merkId = new Map<string, Fraktion>();
const merkFeld = new Map<string, string>();
let merkSeed = Number.NaN;

function merkePruefen(seed: number): void {
  if (seed === merkSeed) return;
  merkId.clear();
  merkFeld.clear();
  merkSeed = seed;
}

export const fraktionsId = (cx: number, cy: number): string => `f:${cx}:${cy}`;

/** Ist das eine Fraktionskennung? Spieler und Neutrale sind es nicht. */
export const istFraktion = (id: string): boolean => id.startsWith('f:');

/** Eine Fraktion aus ihrer Kennung. Rein - gemerkt, weil die Karte oft fragt. */
export function fraktionById(seed: number, id: string): Fraktion {
  merkePruefen(seed);
  const da = merkId.get(id);
  if (da) return da;
  const [, a, b] = id.split(':');
  const cx = Number(a);
  const cy = Number(b);
  const art: FraktionArt =
    new Rng(hash3i(seed, cx, cy, SALT_ART)).next() / UINT < GOBLIN_ANTEIL ? 'goblin' : 'raeuber';
  const f: Fraktion = {
    id,
    art,
    name: nameFuer(seed, cx, cy, art),
    farbe: mod(cx, 3) + 3 * mod(cy, 3),
  };
  if (merkId.size >= MERK_MAX) merkId.clear();
  merkId.set(id, f);
  return f;
}

/** Die Fraktion, der ein Feld von Natur aus gehoert - Eroberungen nicht mitgerechnet. */
export function fraktionAt(seed: number, q: number, r: number): Fraktion {
  merkePruefen(seed);
  const k = q + ':' + r;
  let id = merkFeld.get(k);
  if (id === undefined) {
    const [cx, cy] = fraktionsZelle(seed, q, r);
    id = fraktionsId(cx, cy);
    if (merkFeld.size >= MERK_MAX) merkFeld.clear();
    merkFeld.set(k, id);
  }
  return fraktionById(seed, id);
}
