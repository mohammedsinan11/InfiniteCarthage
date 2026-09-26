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
const SALT_WESEN = 84;

const UINT = 4294967296;

export type FraktionArt = 'raeuber' | 'goblin' | 'nacht';

/**
 * Das Wesen einer Fraktion: jede Bande und jeder Stamm hat einen Charakter,
 * der sich im Spiel bemerkbar macht (REPLAYABILITY.md, J - Fraktionen mit
 * Persoenlichkeit). So ist der Nachbar in jeder Welt ein anderer: mit den
 * Gierigen verhandelt man anders als mit den Zaudernden.
 */
export type FraktionsWesen = 'gierig' | 'kriegerisch' | 'zaudernd' | 'kraemerisch';

export const WESEN: Record<FraktionsWesen, { name: string; text: string; ziel: string }> = {
  gierig: { name: 'gierig', text: 'Pluendern 1 Karte mehr.', ziel: 'will Beute - jede heimgebrachte Karte macht sie staerker' },
  kriegerisch: { name: 'kriegerisch', text: 'Ziehen mit einem Mann mehr los.', ziel: 'sucht den Kampf und neues Land' },
  zaudernd: { name: 'zaudernd', text: 'Brechen nur jede zweite grosse Runde auf.', ziel: 'wartet ab und sammelt Kraefte' },
  kraemerisch: { name: 'kraemerisch', text: 'Tribut kostet 1 Karte weniger; auch als Goblins nehmen sie Frieden.', ziel: 'will Handel und Tribut, nicht Krieg' },
};

const WESEN_LISTE = Object.keys(WESEN) as FraktionsWesen[];

export type Fraktion = {
  /** "f:cx:cy" - die Zelle, aus der sie stammt. Die Nacht hat keine. */
  id: string;
  art: FraktionArt;
  name: string;
  /** Nummer der Farbe, 0 bis FRAKTION_FARBEN-1. */
  farbe: number;
  /** Ihr Wesen - Nacht und Hexe haben keins. */
  wesen?: FraktionsWesen;
  /** Wer sie anfuehrt, mit Titel. Nacht und Hexe haben niemanden. */
  anfuehrer?: string;
};

/**
 * Die Nacht ist keine Bande mit Gebiet, sondern ueberall dieselbe: eine feste
 * Fraktion ohne Zelle, der die Schleime gehoeren (rules/army.ts, nachtVolk).
 * Mit ihr laesst sich kein Frieden schliessen - sie verhandelt nicht
 * (rules/diplomatie.ts fragt nach der Art 'raeuber'). Bei Tag werden ihre
 * Leute nur muede (core/combat.ts, seiteVon).
 */
export const NACHT_ID = 'nacht';
const NACHT: Fraktion = { id: NACHT_ID, art: 'nacht', name: 'Die Nacht', farbe: 8 };

/**
 * Die Hexe gehoert keiner Bande: eine Fraktion aus einer einzigen Person, die
 * bei ihrem Haus bleibt (core/hexe.ts). Auch mit ihr wird nicht verhandelt.
 */
export const HEXE_FRAKTION = 'hexe';
const HEXE: Fraktion = { id: HEXE_FRAKTION, art: 'nacht', name: 'Die Hexe', farbe: 6 };

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

/*
 * Anfuehrer: Name und Beiname passen im Geschlecht zusammen - "Ida die
 * Schlaue", nicht "Ida der Schoene". Titel ebenso: Hauptmann oder Hauptfrau.
 */
const HAUPTLEUTE: Record<'m' | 'w', { namen: readonly string[]; bei: readonly string[]; titel: string }> = {
  m: {
    namen: ['Ulf', 'Brandt', 'Harm', 'Wolfram', 'Kuno', 'Radulf', 'Tanko', 'Egbert', 'Gisbert', 'Hartwig'],
    bei: ['der Einaeugige', 'der Rote', 'der Lange', 'Eisenfaust', 'der Schlaue', 'der Stumme', 'Krummbein', 'der Wilde', 'der Schoene', 'Aschebart'],
    titel: 'Hauptmann',
  },
  w: {
    namen: ['Grete', 'Ida', 'Mechthild', 'Sieghild', 'Berta', 'Adelheid', 'Walburga', 'Irmgard', 'Hedwig', 'Kunigunde'],
    bei: ['die Einaeugige', 'die Rote', 'die Lange', 'Eisenfaust', 'die Schlaue', 'die Stumme', 'Krummbein', 'die Wilde', 'die Schoene', 'Rabenhaar'],
    titel: 'Hauptfrau',
  },
};
const HAEUPTLING_SILBE = ['Gnork', 'Zagg', 'Muffl', 'Skrit', 'Borb', 'Wizz', 'Grot', 'Nubb', 'Knatz', 'Plork', 'Rutz', 'Schnagg'];
const HAEUPTLING_BEI = ['der Grosse', 'Dreizahn', 'Pilzkoenig', 'Knochenbrecher', 'der Laute', 'Schlammfuss', 'Langfinger', 'Warzennase', 'der Gierige'];

/** Wesen und Anfuehrer - aus einer eigenen Zahlenfolge, damit Namen und Arten gleich bleiben. */
function wesenFuer(seed: number, cx: number, cy: number, art: FraktionArt): { wesen: FraktionsWesen; anfuehrer: string } {
  const rng = new Rng(hash3i(seed, cx, cy, SALT_WESEN));
  const eins = (liste: readonly string[]) => liste[rng.int(liste.length)]!;
  const wesen = WESEN_LISTE[rng.int(WESEN_LISTE.length)]!;
  if (art === 'goblin') return { wesen, anfuehrer: `Haeuptling ${eins(HAEUPTLING_SILBE)} ${eins(HAEUPTLING_BEI)}` };
  const h = HAUPTLEUTE[rng.int(2) === 0 ? 'm' : 'w'];
  // Der Name haengt an der Zelle, nicht am Zufall: benachbarte Zellen
  // bekommen verschiedene Namen, so heissen zwei Nachbarn nie gleich.
  const name = h.namen[mod(cx * 3 + cy, h.namen.length)]!;
  return { wesen, anfuehrer: `${h.titel} ${name} ${eins(h.bei)}` };
}

/**
 * Ein Nachfolger fuer einen gefallenen Anfuehrer (core/fraktionsleben.ts):
 * ein anderer Name und ein anderes Wesen - die Fraktion bleibt, ihr
 * Charakter wechselt. Rein aus Seed, Zelle und Generation.
 */
export function nachfolgerFuer(
  seed: number,
  id: string,
  generation: number,
  altesWesen: FraktionsWesen | undefined,
): { anfuehrer: string; wesen: FraktionsWesen } {
  const [, a, b] = id.split(':');
  const cx = Number(a);
  const cy = Number(b);
  const art = fraktionById(seed, id).art;
  const rng = new Rng(hash3i(seed, cx * 131 + generation, cy, SALT_WESEN + 7));
  const eins = (liste: readonly string[]) => liste[rng.int(liste.length)]!;
  const andere = WESEN_LISTE.filter((w) => w !== altesWesen);
  const wesen = andere[rng.int(andere.length)]!;
  if (art === 'goblin') return { wesen, anfuehrer: `Haeuptling ${eins(HAEUPTLING_SILBE)} ${eins(HAEUPTLING_BEI)}` };
  const h = HAUPTLEUTE[rng.int(2) === 0 ? 'm' : 'w'];
  return { wesen, anfuehrer: `${h.titel} ${eins(h.namen)} ${eins(h.bei)}` };
}

/** Das Wesen einer Fraktion, oder null (Nacht, Hexe). */
export const wesenVon = (seed: number, id: string): FraktionsWesen | null => fraktionById(seed, id).wesen ?? null;

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
  // Nacht und Hexe stammen aus keiner Zelle - sie haben keine Koordinate zum Zerlegen.
  if (id === NACHT_ID) return NACHT;
  if (id === HEXE_FRAKTION) return HEXE;
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
    ...wesenFuer(seed, cx, cy, art),
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
