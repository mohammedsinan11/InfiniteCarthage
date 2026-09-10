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
import { expand, fbm, hexToField, ridged } from './noise';
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
const SALT_WARP_X = 51;
const SALT_WARP_Y = 52;
const SALT_RIDGE = 53;
const SALT_KONT_WARP_X = 54;
const SALT_KONT_WARP_Y = 55;
const SALT_KONTINENT = 56;
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
 * Verzerrung des Abtastpunktes (Domain Warping).
 *
 * Rauschen allein liefert weiche, blasige Kuesten - Formen, die nach Wolke
 * aussehen und nicht nach Land. Wird der Punkt, an dem man abtastet, selbst
 * durch ein zweites Rauschen verschoben, bekommen dieselben Formen Buchten,
 * Landzungen und Ausfransungen, ohne dass ein einziger Nachbar befragt wird.
 *
 * Die Verteilung aendert sich dadurch NICHT: es wird dasselbe Feld gelesen,
 * nur anderswo. Die Schwellen unten bleiben also gueltig.
 */
const WARP_SCALE = 11;
const WARP_STRENGTH = 2.2;

/**
 * Kammlinien im Hochland.
 *
 * Wirken nur oberhalb von RIDGE_FLOOR und dort mit wachsendem Gewicht. Im
 * Flachland und im Meer waeren sie schaedlich - sie wuerden Kuesten
 * zerschneiden und aus Seen Streifen machen.
 */
const RIDGE_SCALE = 3.6;
const RIDGE_STRENGTH = 0.32;
const RIDGE_FLOOR = 0.55;

/**
 * Kontinente.
 *
 * Land und Meer entscheidet ein eigenes, langsames Feld - nicht mehr das
 * Hoehenfeld, das auch Huegel und Berge verteilt. Vorher lag beides in einem
 * Feld mit Wellenlaenge 6,5: Land reichte selten weit vom Wasser weg (gemessen
 * Median 3, Maximum 13 Felder), und fuer grosse Hoehen fehlte der Platz. Ein
 * einziges langsames Feld haette die Kontinente vergroessert, aber auch die
 * Huegel- und Berggebiete - der Startbereich waere wieder durchgehend eine
 * Sorte gewesen.
 *
 * Getrennt geht beides: das Kontinentfeld zieht die Kueste, das Hoehenfeld
 * gliedert das Land darin. Gemessen ueber sechs Seeds liegt ein Landfeld jetzt
 * im Median 9 Felder vom Meer entfernt, p90 bei 19, hoechstens 33. Skala 28
 * gaebe noch groessere Kontinente, aber dann saehe man vom Start aus kaum noch
 * eine Kueste.
 *
 * Die Kueste bekommt eine eigene, groessere Verzerrung - mit der kleinen des
 * Hoehenfeldes saehe ein Kontinent aus wie ein aufgeblasener Kreis.
 */
const KONTINENT_SKALA = 22;
const KONTINENT_VERZERRUNG = KONTINENT_SKALA * 0.35;

/**
 * Schwellen - nicht geraten, sondern auf gemessene Anteile gesetzt.
 *
 * Neu vermessen mit Kontinenten (sechs Seeds, je 6.211 Felder). Ziel sind
 * dieselben Anteile wie vorher, nur anders angeordnet:
 *
 *   Kontinent < 0,259            Meer    (~20 %)
 *   Hoehe     < 0,024  im Land   See     (~3 %)
 *             > 0,907            Berg
 *             > 0,669            Huegel
 *   Feuchte   > 0,678            Wald
 *             > 0,424            Weide
 *             > 0,195            Feld
 *             sonst              Wueste
 *
 * Die Hoehenschwellen gelten nur noch fuer Land: Wasser haengt nicht mehr an
 * der Hoehe, also verteilen sich Huegel und Berge ueber das ganze Land statt nur
 * ueber seine hoeheren Teile. Wer an einem Feld dreht, muss hier nachmessen,
 * sonst verschiebt sich die Balance unbemerkt.
 */
export const SEA_LEVEL = 0.2593;
export const LAKE_LEVEL = 0.024;
const HILL_LEVEL = 0.6691;
const MOUNTAIN_LEVEL = 0.9065;
const FOREST_LEVEL = 0.6778;
const PASTURE_LEVEL = 0.4238;
const FIELD_LEVEL = 0.1951;

export type Fields = { elevation: number; moisture: number; kontinent: number };

/**
 * Gemerkte Feldwerte.
 *
 * Seit Kleckse entfernt werden und das Relief glaettet, wird jedes Feld nicht
 * mehr einmal gebraucht, sondern gut ein Dutzend Mal - einmal fuer sich und
 * immer wieder als Nachbar. Jede Auswertung sind mehrere Rauschlagen; ohne
 * dieses Gedaechtnis rechnet der Bildaufbau dieselben Werte staendig neu.
 *
 * Die Funktion bleibt rein: gleiche Eingabe, gleiches Ergebnis. Gemerkt wird
 * nur, was ohnehin herauskaeme.
 */
const FELD_MAX = 80000;
let feldSeed = Number.NaN;
const feldCache = new Map<string, Fields>();

/** Die beiden Felder an einem Hex. Rein. */
export function fieldsAt(seed: number, q: number, r: number): Fields {
  if (seed !== feldSeed) {
    feldCache.clear();
    feldSeed = seed;
  }
  const k = q + ':' + r;
  const da = feldCache.get(k);
  if (da !== undefined) return da;
  const v = berechneFelder(seed, q, r);
  if (feldCache.size >= FELD_MAX) feldCache.clear();
  feldCache.set(k, v);
  return v;
}

function berechneFelder(seed: number, q: number, r: number): Fields {
  const p = hexToField(q, r);

  // Abtastpunkt verzerren - dieselben Formen, aber mit Buchten statt Blasen.
  const wx = fbm(seed, p.x / WARP_SCALE, p.y / WARP_SCALE, SALT_WARP_X, 2) - 0.5;
  const wy = fbm(seed, p.x / WARP_SCALE, p.y / WARP_SCALE, SALT_WARP_Y, 2) - 0.5;
  const x = p.x + wx * WARP_STRENGTH;
  const y = p.y + wy * WARP_STRENGTH;

  const basis = expand(fbm(seed, x / ELEVATION_SCALE, y / ELEVATION_SCALE, SALT_ELEVATION, 3));

  // Kaemme erst ueber RIDGE_FLOOR, und dann allmaehlich staerker.
  let elevation = basis;
  if (basis > RIDGE_FLOOR) {
    const gewicht = (basis - RIDGE_FLOOR) / (1 - RIDGE_FLOOR);
    const kamm = ridged(fbm(seed, x / RIDGE_SCALE, y / RIDGE_SCALE, SALT_RIDGE, 2));
    elevation = Math.min(1, basis + RIDGE_STRENGTH * kamm * gewicht);
  }

  // Kontinent: eigenes Feld mit eigener, groesserer Verzerrung.
  const kws = KONTINENT_SKALA * 0.6;
  const kwx = fbm(seed, p.x / kws, p.y / kws, SALT_KONT_WARP_X, 2) - 0.5;
  const kwy = fbm(seed, p.x / kws, p.y / kws, SALT_KONT_WARP_Y, 2) - 0.5;
  const kontinent = expand(
    fbm(
      seed,
      (p.x + kwx * KONTINENT_VERZERRUNG) / KONTINENT_SKALA,
      (p.y + kwy * KONTINENT_VERZERRUNG) / KONTINENT_SKALA,
      SALT_KONTINENT,
      4,
    ),
  );

  return {
    elevation,
    moisture: expand(fbm(seed, x / MOISTURE_SCALE, y / MOISTURE_SCALE, SALT_MOISTURE, 2)),
    kontinent,
  };
}

/** Gelaende ohne Nachbarschaftskorrektur. */
function rawTerrainAt(seed: number, q: number, r: number): Terrain {
  const { elevation, moisture, kontinent } = fieldsAt(seed, q, r);
  if (kontinent < SEA_LEVEL) return 'water'; // Meer
  if (elevation < LAKE_LEVEL) return 'water'; // See im Land
  if (elevation > MOUNTAIN_LEVEL) return 'mountain';
  if (elevation > HILL_LEVEL) return 'hill';
  if (moisture > FOREST_LEVEL) return 'forest';
  if (moisture > PASTURE_LEVEL) return 'pasture';
  if (moisture > FIELD_LEVEL) return 'field';
  return 'desert';
}

/**
 * Ist dieses Feld Meer - im Unterschied zu einem See im Land?
 *
 * Nach dem rohen Kontinentfeld. Eine einzelne Insel, die der Kleckspass zu
 * Wasser macht, zaehlt damit nicht als Meer - sie liegt ohnehin mitten darin
 * und bekommt nur keinen Hafen.
 */
export function isSeaAt(seed: number, q: number, r: number): boolean {
  return fieldsAt(seed, q, r).kontinent < SEA_LEVEL;
}

/**
 * Gelaende an einem Hex, nach Entfernung der Kleckse.
 *
 * WAS EIN KLECKS IST: ein Feld, dessen Sorte bei keinem einzigen der sechs
 * Nachbarn vorkommt. Ein einzelner Berg mitten in der Steppe, eine Wueste von
 * genau einem Feld. Rauschen erzeugt so etwas staendig, und es sieht aus wie
 * verschuettetes Konfetti - man liest keine Landschaft mehr, sondern
 * Bildpunkte. Das Vorbild raeumt sie mit prune_specks weg; dort ist es ein
 * Durchgang ueber die ganze Karte, hier genuegt der Blick auf die Nachbarn.
 *
 * Der Klecks wird zur haeufigsten Sorte ringsum. Damit waechst er der Umgebung
 * zu, statt ein neues Loch zu reissen.
 *
 * WASSER BLEIBT. Ein einzelnes Wasserfeld im Land ist kein Fehler, sondern ein
 * Teich - und Seen sind sonst nichts, was wir haetten, weil echte Seen eine
 * Karte mit Rand brauchen. Umgekehrt darf eine einzelne Insel verschwinden.
 *
 * EIN DURCHGANG, nicht mehr. Er entscheidet anhand der ROHEN Nachbarn, nie
 * anhand bereits bereinigter - sonst haenge das Ergebnis davon ab, in welcher
 * Reihenfolge gefragt wird, und die Karte waere nicht mehr reproduzierbar.
 * Deshalb kann in seltenen Faellen ein neuer Klecks entstehen; gemessen sind
 * es zu wenige, um dafuer die Reinheit aufzugeben.
 */
export function terrainAt(seed: number, q: number, r: number): Terrain {
  const eigen = rawTerrainAt(seed, q, r);
  if (eigen === 'water') return eigen;

  const zaehl = new Map<Terrain, number>();
  let gleiche = 0;
  for (const n of neighbors(q, r)) {
    const t = rawTerrainAt(seed, n.q, n.r);
    if (t === eigen) gleiche++;
    zaehl.set(t, (zaehl.get(t) ?? 0) + 1);
  }
  if (gleiche > 0) return eigen;

  let beste: Terrain = eigen;
  let bestN = -1;
  // Feste Reihenfolge bei Gleichstand - eine Map allein waere Einfuegereihenfolge.
  for (const t of TERRAIN_ORDER) {
    const n = zaehl.get(t) ?? 0;
    if (n > bestN) {
      bestN = n;
      beste = t;
    }
  }
  return beste;
}

/** Feste Reihenfolge fuer Gleichstaende beim Kleckse-Entfernen. */
const TERRAIN_ORDER: readonly Terrain[] = [
  'water', 'mountain', 'hill', 'forest', 'pasture', 'field', 'desert',
];

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
    // Haefen nur am Meer - ein Hafen am Bergsee waere eine seltsame Handelsroute.
    port: terrain === 'water' && isSeaAt(seed, q, r) ? makePort(seed, q, r) : null,
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
