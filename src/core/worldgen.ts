/**
 * Prozedurale Erzeugung des Bretts.
 *
 * generateChunk(worldSeed, m, n) ist REIN: das Ergebnis haengt nur von diesen
 * drei Werten ab, nie davon, in welcher Reihenfolge Chunks angefordert
 * wurden. Daraus folgt die wichtigste Eigenschaft des Netzwerkteils - der
 * Server muss nie Gelaendedaten uebertragen. Er schickt den worldSeed und
 * die Liste der freigeschalteten Chunks, den Rest rechnet jeder Client
 * selbst aus.
 *
 * ZUR VERTEILUNG
 *
 * Eine fruehere Fassung zog je Chunk einen Beutel mit allen fuenf
 * Rohstoffgelaenden. Das war perfekt ausgewogen und sah furchtbar aus: wenn
 * sieben benachbarte Felder garantiert fuenf verschiedene Sorten tragen,
 * kann kein Wald zusammenhaengen. Die Karte wirkte wie Konfetti.
 *
 * Jetzt entscheidet Rauschen. Hoehe trennt Wasser, Land, Huegel und Berge;
 * Feuchte teilt das Land in Wald, Weide, Feld und Wueste. Beides sind
 * langwellige Felder, also entstehen Seen, Waldguertel und Gebirgszuege -
 * und ein Feld sieht meist aus wie seine Nachbarn.
 *
 * Die Ausgewogenheit ist damit nicht verschwunden, sondern verschoben: sie
 * gilt nicht mehr ueberall, sondern dort, wo sie zaehlt. createGame sucht
 * einen Seed, dessen STARTGEBIET alle fuenf Rohstoffe traegt. Weiter draussen
 * hat jede Gegend ihren eigenen Charakter - was auf einer unbegrenzten Karte
 * ein Grund ist, sich zu bewegen, statt ein Mangel.
 */

import { Rng } from './rng';
import { hash3i } from './hash';
import { expand, fbm, hexToField } from './noise';
import { chunkHexes, chunkOf, chunkKey } from './chunks';
import {
  hexKey,
  hexesInRange,
  vertexKey,
  sideEdge,
  edgeEndpoints,
  neighbors,
  HEX_DIRS,
} from './coords';
import { RESOURCES, TERRAIN_RESOURCE } from './types';
import type { Chunk, Port, PortType, Terrain, Tile } from './types';

// Getrennte Zufallsstroeme, damit eine Aenderung an den Haefen nicht das
// gesamte Gelaende verschiebt.
const SALT_ELEVATION = 41;
const SALT_MOISTURE = 42;
const SALT_NUMBER = 2;
const SALT_PORT = 3;
const SALT_TIE = 4;
const SALT_DEMOTE = 5;

/**
 * Groesse der Landschaftsformen in Hexfeldern.
 *
 * Der entscheidende Regler fuer den Eindruck. Zu gross, und das sichtbare
 * Gebiet liegt vollstaendig in EINER Region - die Karte wirkt dann einfarbig,
 * nicht abwechslungsreich. Genau das passierte bei 11: der Startbereich war
 * durchgehend Huegelland.
 *
 * Die Vorlage von hexmap sieht auch deshalb so vielfaeltig aus, weil sie
 * hunderte Felder breit ist. Bei uns sind gut 50 gleichzeitig zu sehen, also
 * muessen die Regionen kleiner sein, damit mehrere davon ins Bild passen -
 * ohne so klein zu werden, dass das Gelaende wieder springt.
 */
const ELEVATION_SCALE = 6.5;
const MOISTURE_SCALE = 5;

/**
 * Schwellen fuer Hoehe und Feuchte.
 *
 * Nicht geraten, sondern auf gemessene Perzentile der beiden Felder gesetzt.
 * Ein erster Versuch mit runden Zahlen ergab 27 % Berge und 4 % Weide - die
 * Verteilung von fbm ist eben nicht gleichmaessig, und wer Schwellen nach
 * Gefuehl waehlt, trifft danach.
 *
 * Ziel ist eine Karte, auf der man Catan spielen kann: rund ein Fuenftel
 * Wasser, die Haelfte flaches Land, der Rest Huegel und Berge.
 *
 *   Hoehe  < p22 (0,310)  Wasser
 *          > p87 (0,831)  Berg
 *          > p72 (0,694)  Huegel
 */
const SEA_LEVEL = 0.31;
const HILL_LEVEL = 0.694;
const MOUNTAIN_LEVEL = 0.831;

/**
 * Feuchte teilt das flache Land auf - ebenfalls nach Perzentilen:
 *   > p70 (0,697)  Wald
 *   > p40 (0,438)  Weide
 *   > p16 (0,184)  Feld
 *   sonst          Wueste
 */
const FOREST_LEVEL = 0.697;
const PASTURE_LEVEL = 0.438;
const FIELD_LEVEL = 0.184;

export type Fields = { elevation: number; moisture: number };

/** Die beiden Felder an einem Hex. Rein. */
export function fieldsAt(seed: number, q: number, r: number): Fields {
  const p = hexToField(q, r);
  return {
    elevation: expand(fbm(seed, p.x / ELEVATION_SCALE, p.y / ELEVATION_SCALE, SALT_ELEVATION, 3)),
    moisture: expand(fbm(seed, p.x / MOISTURE_SCALE, p.y / MOISTURE_SCALE, SALT_MOISTURE, 2)),
  };
}

/** Gelaende an einem Hex. Rein - haengt nur von Seed und Koordinate ab. */
export function terrainAt(seed: number, q: number, r: number): Terrain {
  const { elevation, moisture } = fieldsAt(seed, q, r);
  if (elevation < SEA_LEVEL) return 'water';
  if (elevation > MOUNTAIN_LEVEL) return 'mountain';
  if (elevation > HILL_LEVEL) return 'hill';
  if (moisture > FOREST_LEVEL) return 'forest';
  if (moisture > PASTURE_LEVEL) return 'pasture';
  if (moisture > FIELD_LEVEL) return 'field';
  return 'desert';
}

const produces = (t: Terrain): boolean => TERRAIN_RESOURCE[t] !== null;

// --- Zahlen -----------------------------------------------------------------

/**
 * Klassische Verteilung als Nachschlagetabelle: 18 Eintraege, jede Zahl so
 * oft wie im Original. Ein Griff per Hash trifft damit dieselbe Haeufigkeit
 * wie ein gemischter Beutel, braucht aber keinen - und bleibt rein pro Feld.
 */
const NUMBER_TABLE: readonly number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/** Harmlose Zahlen, auf die ein Verlierer des Stichentscheids faellt. */
const CALM_NUMBERS: readonly number[] = [3, 4, 5, 9, 10, 11];

const isRed = (n: number | null): boolean => n === 6 || n === 8;

/** Rohzahl eines Feldes, noch ohne Entzerrung. */
function rawNumber(seed: number, q: number, r: number): number | null {
  if (!produces(terrainAt(seed, q, r))) return null;
  return NUMBER_TABLE[hash3i(seed, q, r, SALT_NUMBER) % NUMBER_TABLE.length]!;
}

/**
 * Zwei benachbarte 6er oder 8er sind im Original verboten. Auf einer
 * unendlichen Karte laesst sich das nicht global planen.
 *
 * Loesung: ein symmetrischer Stichentscheid auf den ROHZAHLEN. Stossen zwei
 * rote Zahlen aneinander, vergleichen beide Seiten denselben Hash; der
 * Verlierer gibt seine rote Zahl ab. Weil beide Felder unabhaengig zum selben
 * Vergleich kommen, braucht es weder Rekursion noch Wissen darueber, welches
 * zuerst erzeugt wurde.
 *
 * Beweisbar konfliktfrei: blieben zwei Nachbarn rot, haetten beide ihren
 * direkten Vergleich gewonnen - unmoeglich, denn genau einer der beiden
 * Hashes ist groesser.
 *
 * Preis: das Verfahren waehlt lokale Hash-Maxima einer Siebener-Nachbarschaft,
 * der Anteil roter Zahlen ist damit auf 1/7 gedeckelt und liegt bei rund 13 %
 * statt 22 %. Wer die Tabelle mit 6ern auffuellt, aendert daran nichts - die
 * Deckelung kommt aus der Auswahl, nicht aus der Verteilung.
 */
function numberAt(seed: number, q: number, r: number): number | null {
  const own = rawNumber(seed, q, r);
  if (own === null) return null;
  if (!isRed(own)) return own;

  const mine = hash3i(seed, q, r, SALT_TIE);
  for (const nb of neighbors(q, r)) {
    if (!isRed(rawNumber(seed, nb.q, nb.r))) continue;
    const theirs = hash3i(seed, nb.q, nb.r, SALT_TIE);
    const loses =
      theirs > mine || (theirs === mine && (nb.q !== q ? nb.q > q : nb.r > r));
    if (loses) {
      return CALM_NUMBERS[hash3i(seed, q, r, SALT_DEMOTE) % CALM_NUMBERS.length]!;
    }
  }
  return own;
}

// --- Haefen -----------------------------------------------------------------

/** 4x 3:1 gegen je 1x 2:1 pro Rohstoff - wie im Original. */
const PORT_BAG: readonly PortType[] = ['any', 'any', 'any', 'any', ...RESOURCES];

/**
 * Nur ein Teil der Wasserfelder traegt einen Hafen. Bekaeme jedes einen, waere
 * der Vorteil keiner mehr - und die Kuesten waeren zugepflastert.
 */
const PORT_CHANCE = 0.16;

function makePort(seed: number, q: number, r: number): Port | null {
  const rng = new Rng(hash3i(seed, q, r, SALT_PORT));
  if (rng.next() / 4294967296 > PORT_CHANCE) return null;

  const type = PORT_BAG[rng.int(PORT_BAG.length)]!;

  // Der Hafen zeigt zum Land. Startseite deterministisch drehen, damit nicht
  // alle Haefen in dieselbe Richtung schauen.
  const start = rng.int(HEX_DIRS.length);
  for (let i = 0; i < HEX_DIRS.length; i++) {
    const side = (start + i) % HEX_DIRS.length;
    const d = HEX_DIRS[side]!;
    if (terrainAt(seed, q + d[0], r + d[1]) === 'water') continue;
    const [a, b] = edgeEndpoints(sideEdge(q, r, side));
    return { type, vertices: [vertexKey(a), vertexKey(b)] };
  }
  return null; // ringsum Wasser: kein Hafen
}

// --- Oeffentliche Erzeugung -------------------------------------------------

/** Ein einzelnes Feld. Rein und ohne Chunk-Umweg. */
export function tileAtCoord(seed: number, q: number, r: number): Tile {
  const terrain = terrainAt(seed, q, r);
  return {
    q,
    r,
    terrain,
    number: numberAt(seed, q, r),
    port: terrain === 'water' ? makePort(seed, q, r) : null,
  };
}

/**
 * Fertiger Chunk. Rein - gleiche Eingabe, gleiches Ergebnis, immer.
 *
 * Der Chunk ist nur noch die Einheit, in der die Welt aufgedeckt und
 * uebertragen wird; das Gelaende selbst kennt ihn nicht mehr.
 */
export function generateChunk(seed: number, m: number, n: number): Chunk {
  return { m, n, tiles: chunkHexes(m, n).map((h) => tileAtCoord(seed, h.q, h.r)) };
}

// --- Startgebiet ------------------------------------------------------------

/**
 * Wie weit um den Ursprung geprueft wird.
 *
 * Radius 4 (61 Felder), weil beim Start ohnehin sieben Chunks - rund 49
 * Felder - aufgedeckt werden. Bei Radius 3 waere die Pruefung enger als das,
 * was der Spieler tatsaechlich sieht.
 */
const START_RADIUS = 4;
/** Wie viele der 61 Felder Land sein muessen. */
const MIN_START_LAND = 38;

/**
 * Taugt dieser Seed als Startgebiet?
 *
 * Verlangt nur genug Land - eine Partie soll nicht mitten im Ozean beginnen.
 * Mehr nicht.
 *
 * Eine strengere Fassung verlangte zusaetzlich alle fuenf Rohstoffgelaende in
 * Reichweite. Gemessen erfuellten das nur 4 % der Seeds, und der Grund ist
 * kein Zufall: Gelaende, das Regionen bildet, hat wenig oertliche Vielfalt.
 * Wer beides gleichzeitig will - Landschaft und Catan-Ausgewogenheit -,
 * bekommt eines davon schlecht.
 *
 * Diese Welt ist kein Turnier-Catan. Wenn eine Gegend arm an Erz ist, ist das
 * ein Grund weiterzuziehen, und auf einer Karte ohne Rand kann man das.
 */
export function isPlayableStart(seed: number): boolean {
  let land = 0;
  for (const h of hexesInRange({ q: 0, r: 0 }, START_RADIUS)) {
    if (terrainAt(seed, h.q, h.r) !== 'water') land++;
  }
  return land >= MIN_START_LAND;
}

/**
 * Naechster Seed ab dem gewuenschten, dessen Startgebiet taugt.
 *
 * So bleibt die Ausgewogenheit erhalten, ohne dass eine Regel die Landschaft
 * zerhackt: die Karte wird nicht zurechtgebogen, es wird nur eine gute
 * ausgesucht. Der Unterschied ist unsichtbar - jeder Seed erzeugt eine
 * gleichermassen natuerliche Welt.
 */
export function findPlayableSeed(seed: number, attempts = 512): number {
  for (let i = 0; i < attempts; i++) {
    const s = (seed + i) | 0;
    if (isPlayableStart(s)) return s;
  }
  return seed; // sollte nie eintreten; lieber spielen als scheitern
}

/** Nur fuer Diagnose und Tests. */
export function debugAt(seed: number, q: number, r: number): string {
  const f = fieldsAt(seed, q, r);
  return `${hexKey(q, r)} h=${f.elevation.toFixed(2)} f=${f.moisture.toFixed(2)} ${terrainAt(seed, q, r)}`;
}

export { chunkKey, chunkOf };
