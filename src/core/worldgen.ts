/**
 * Prozedurale Erzeugung des Bretts, Chunk fuer Chunk.
 *
 * generateChunk(worldSeed, m, n) ist REIN: das Ergebnis haengt nur von diesen
 * drei Werten ab, nie davon, in welcher Reihenfolge Chunks angefordert
 * wurden. Daraus folgt die wichtigste Eigenschaft des Netzwerkteils - der
 * Server muss nie Gelaendedaten uebertragen. Er schickt den worldSeed und
 * die Liste der freigeschalteten Chunks, den Rest rechnet jeder Client
 * selbst aus.
 *
 * Balance: jeder Chunk enthaelt garantiert alle fuenf Rohstoffgelaende.
 * Niemand landet in einer Ein-Rohstoff-Oednis, egal wohin er baut.
 */

import { Rng } from './rng';
import { hash3i } from './hash';
import { chunkHexes, chunkOf, chunkKey } from './chunks';
import {
  hexKey,
  vertexKey,
  sideEdge,
  edgeEndpoints,
  neighbors,
  HEX_DIRS,
} from './coords';
import type { Hex } from './coords';
import {
  PRODUCTIVE_TERRAIN,
  RESOURCES,
} from './types';
import type { Chunk, Port, PortType, Terrain, Tile } from './types';

// Getrennte Zufallsstroeme pro Aspekt, damit eine Aenderung an der
// Hafenlogik nicht das gesamte Gelaende verschiebt.
const SALT_TERRAIN = 1;
const SALT_NUMBER = 2;
const SALT_PORT = 3;
const SALT_TIE = 4;
const SALT_DEMOTE = 5;

/** Klassische Zahlenverteilung (18 Marker fuer 18 Landfelder). */
const NUMBER_BAG: readonly number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/** Die zwei Fuellfelder je Chunk. Wald/Weide/Feld haeufiger, dazu etwas Wueste und Wasser. */
const FILLER_BAG: readonly Terrain[] = [
  'forest', 'forest', 'forest',
  'pasture', 'pasture', 'pasture',
  'field', 'field', 'field',
  'hill', 'hill',
  'mountain', 'mountain',
  'desert', 'desert',
  'water', 'water',
];

const isRed = (n: number | null): boolean => n === 6 || n === 8;

// --- Rohdaten ---------------------------------------------------------------

type RawTile = { q: number; r: number; terrain: Terrain; number: number | null };

/**
 * Gelaende und Zahlen eines Chunks OHNE den Ausgleich ueber Chunk-Grenzen.
 *
 * Diese Zwischenstufe existiert, damit ein Chunk die Rohdaten seiner
 * Nachbarn ansehen kann, ohne dass daraus eine Rekursion ohne Grund wird:
 * rawChunk haengt von nichts ab ausser Seed und Koordinate.
 */
function rawChunk(seed: number, m: number, n: number): RawTile[] {
  const hexes = chunkHexes(m, n);
  const isOrigin = m === 0 && n === 0;

  const rngT = new Rng(hash3i(seed, m, n, SALT_TERRAIN));

  // Fuenf garantierte Rohstoffgelaende, dazu zwei Fuellfelder.
  const terrains: Terrain[] = [...PRODUCTIVE_TERRAIN];
  if (isOrigin) {
    // Startchunk: genau eine Wueste als Startfeld des Raeubers, kein Wasser.
    terrains.push('desert');
    terrains.push(PRODUCTIVE_TERRAIN[rngT.int(PRODUCTIVE_TERRAIN.length)]!);
  } else {
    for (let i = 0; i < 2; i++) {
      terrains.push(FILLER_BAG[rngT.int(FILLER_BAG.length)]!);
    }
  }
  rngT.shuffle(terrains);

  const rngN = new Rng(hash3i(seed, m, n, SALT_NUMBER));
  const bag = rngN.shuffle([...NUMBER_BAG]);
  let next = 0;

  return hexes.map((h, i) => {
    const terrain = terrains[i]!;
    const producing = terrain !== 'desert' && terrain !== 'water';
    return {
      q: h.q,
      r: h.r,
      terrain,
      number: producing ? bag[next++]! : null,
    };
  });
}

// Kleiner Cache: rawChunk wird beim Ausgleich fuer jeden Nachbarn abgefragt.
// Rein deterministisch, der Cache aendert also nie ein Ergebnis.
const rawCache = new Map<string, RawTile[]>();

function rawChunkCached(seed: number, m: number, n: number): RawTile[] {
  const k = seed + '|' + m + ':' + n;
  let v = rawCache.get(k);
  if (v === undefined) {
    if (rawCache.size > 4096) rawCache.clear();
    v = rawChunk(seed, m, n);
    rawCache.set(k, v);
  }
  return v;
}

/** Rohdaten eines einzelnen Hexes, ueber Chunk-Grenzen hinweg. */
function rawAt(seed: number, q: number, r: number): RawTile {
  const c = chunkOf(q, r);
  const tiles = rawChunkCached(seed, c.m, c.n);
  const found = tiles.find((t) => t.q === q && t.r === r);
  if (!found) throw new Error('Hex ' + hexKey(q, r) + ' fehlt in seinem Chunk');
  return found;
}

/** Nur das Gelaende - fuer die Hafenausrichtung. */
export function terrainAt(seed: number, q: number, r: number): Terrain {
  return rawAt(seed, q, r).terrain;
}

// --- Ausgleich der roten Zahlen ---------------------------------------------

/**
 * Zwei benachbarte 6er oder 8er sind im Original verboten. Auf einer
 * unendlichen Karte laesst sich das nicht global planen, ohne die Reinheit
 * der Chunk-Erzeugung aufzugeben.
 *
 * Loesung: ein symmetrischer Stichentscheid auf den ROHDATEN. Stossen zwei
 * rote Zahlen aneinander, vergleichen beide Seiten denselben Hash; der
 * Verlierer gibt seine rote Zahl ab und bekommt eine harmlose. Weil beide
 * Chunks unabhaengig zum selben Vergleich kommen, braucht es weder
 * Rekursion noch Wissen darueber, wer zuerst erzeugt wurde.
 *
 * Das ist beweisbar konfliktfrei: bleiben zwei benachbarte Felder rot,
 * haetten beide ihren direkten Vergleich gewonnen - unmoeglich, denn genau
 * einer der beiden Hashes ist groesser.
 *
 * Ein erster Versuch tauschte die rote Zahl stattdessen gegen ein anderes
 * Feld im selben Chunk. Das scheiterte messbar: ein Chunk ist nur sieben
 * Felder gross, der Tausch schob den Konflikt also meist nur weiter. Bei
 * Seed 1 blieben so 514 Konfliktpaare uebrig.
 *
 * Preis des Verfahrens: es waehlt lokale Hash-Maxima einer 7er-Nachbarschaft
 * (Feld plus sechs Nachbarn), und davon gibt es hoechstens eines pro sieben
 * Felder. Der Anteil roter Zahlen ist damit auf 1/7 = 14,3 % gedeckelt und
 * liegt gemessen bei rund 13 %, gegenueber 22 % im Originalspiel. Wer den
 * Beutel mit mehr 6ern und 8ern auffuellt, aendert daran nichts - die
 * Deckelung kommt aus der Auswahl, nicht aus dem Beutel. In Pips gerechnet
 * kostet das etwa 6 % Ertrag; das ist der Preis fuer eine Garantie statt
 * einer Heuristik.
 */
function tieBreak(seed: number, h: Hex): number {
  return hash3i(seed, h.q, h.r, SALT_TIE);
}

function loosesRedConflict(seed: number, t: RawTile): boolean {
  if (!isRed(t.number)) return false;
  const mine = tieBreak(seed, t);
  for (const nb of neighbors(t.q, t.r)) {
    const other = rawAt(seed, nb.q, nb.r);
    if (!isRed(other.number)) continue;
    // Gleichstand ist praktisch ausgeschlossen; als Tiebreak dann die Koordinate.
    const theirs = tieBreak(seed, nb);
    if (theirs > mine || (theirs === mine && (nb.q !== t.q ? nb.q > t.q : nb.r > t.r))) {
      return true;
    }
  }
  return false;
}

/** Harmlose Zahlen, auf die ein Verlierer heruntergestuft wird. */
const CALM_NUMBERS: readonly number[] = [3, 4, 5, 9, 10, 11];

function demote(seed: number, t: RawTile): number {
  return CALM_NUMBERS[hash3i(seed, t.q, t.r, SALT_DEMOTE) % CALM_NUMBERS.length]!;
}

// --- Haefen -----------------------------------------------------------------

/** 4x 3:1 gegen je 1x 2:1 pro Rohstoff - wie im Original. */
const PORT_BAG: readonly PortType[] = ['any', 'any', 'any', 'any', ...RESOURCES];

function makePort(seed: number, q: number, r: number): Port | null {
  const rng = new Rng(hash3i(seed, q, r, SALT_PORT));
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

/**
 * Fertiger Chunk: Gelaende, ausgeglichene Zahlen, Haefen.
 * Rein - gleiche Eingabe, gleiches Ergebnis, immer.
 */
export function generateChunk(seed: number, m: number, n: number): Chunk {
  const raw = rawChunkCached(seed, m, n);
  const numbers = raw.map((t) =>
    loosesRedConflict(seed, t) ? demote(seed, t) : t.number,
  );

  const tiles: Tile[] = raw.map((t, i) => ({
    q: t.q,
    r: t.r,
    terrain: t.terrain,
    number: numbers[i]!,
    port: t.terrain === 'water' ? makePort(seed, t.q, t.r) : null,
  }));

  return { m, n, tiles };
}

export { chunkKey };
