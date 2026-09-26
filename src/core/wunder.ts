/**
 * Wunderstaetten: Orte auf der Karte, an denen man ein Weltwunder errichtet.
 *
 * Wie Lager, Ruinen und Hexenhaeuser aus dem worldSeed abgeleitet - jede Welt
 * hat ihre eigenen, an eigenen Stellen, und jeder Client rechnet sie selbst
 * aus. Eine liegt immer in Reichweite des Starts (sechs Felder), weitere
 * selten in der Ferne: ein Grund, in eine bestimmte Richtung zu wachsen, und
 * ein Wettlauf, denn jede Staette traegt nur ein Wunder - wer zuerst baut,
 * hat es (REPLAYABILITY.md, J; IDEEN.md, Weltwunder).
 *
 * Bauen darf, wer ein Dorf oder eine Stadt an einer Ecke der Staette hat und
 * die Kosten zahlt. Das Wunder bringt Siegpunkte und eine eigene Wirkung, die
 * an einer bestehenden Stelle greift (Handel, Pluenderung, Ertrag, grosse
 * Runde).
 */

import { Rng } from './rng';
import { hash3i } from './hash';
import { hexDistance, hexKey, hexesInRange } from './coords';
import { nestAt } from './raiders';
import { ruinAt } from './ruins';
import { hexenhausAt } from './hexe';
import { terrainAt } from './worldgen';
import type { Cost } from './rules/costs';
import type { PlayerId } from './state';

export type WunderArt = 'kothon' | 'koloss' | 'gaerten' | 'sternwarte' | 'sonnentempel';

export type WunderTyp = {
  art: WunderArt;
  name: string;
  /** Was es bewirkt - ein Satz. */
  text: string;
  punkte: number;
};

export const WUNDER: Record<WunderArt, WunderTyp> = {
  kothon: { art: 'kothon', name: 'Der Kothon', text: 'Ein Kriegshafen im Kreis: Bankhandel 3:1 auf alles.', punkte: 3 },
  koloss: { art: 'koloss', name: 'Der Koloss', text: 'Ein Riese aus Erz wacht: Pluenderer nehmen dir 2 Karten weniger.', punkte: 3 },
  gaerten: { art: 'gaerten', name: 'Die Haengenden Gaerten', text: 'Terrassen voller Gruen: Felder und Weiden liefern dir 1 mehr.', punkte: 3 },
  sternwarte: { art: 'sternwarte', name: 'Die Sternwarte', text: 'Die Seher lesen die Sterne: zu Beginn jeder grossen Runde eine Kartenwahl.', punkte: 3 },
  sonnentempel: { art: 'sonnentempel', name: 'Der Sonnentempel', text: 'Ein Tempel, der weithin leuchtet: zu Beginn jeder grossen Runde 1 Ruhm.', punkte: 4 },
};

const ARTEN = Object.keys(WUNDER) as WunderArt[];

/** Was ein Wunder kostet - viel, aber aus allen fuenf Sorten. */
export const COST_WUNDER: Cost = { lumber: 2, brick: 3, wool: 2, grain: 2, ore: 3 };

const SALT_WUNDER = 173;
/** Kantenlaenge einer Region in der Ferne; jede traegt hoechstens eine Staette. */
const WUNDER_REGION = 16;
const WUNDER_CHANCE = 0.3;
/** Die Staette nahe dem Start liegt genau so weit weg. */
export const HEIMAT_ABSTAND = 6;

function frei(seed: number, q: number, r: number): boolean {
  const t = terrainAt(seed, q, r);
  return t !== 'water' && t !== 'desert' && !nestAt(seed, q, r) && !ruinAt(seed, q, r) && !hexenhausAt(seed, q, r);
}

const heimat = new Map<number, { q: number; r: number } | null>();

/**
 * Die Staette nahe dem Start: ein freies Landfeld auf dem Ring im Abstand 6 -
 * ist dort alles Wasser, auf den Ringen daneben.
 */
export function heimatStaette(seed: number): { q: number; r: number } | null {
  if (heimat.has(seed)) return heimat.get(seed)!;
  const rng = new Rng(hash3i(seed, 0, 0, SALT_WUNDER));
  let fund: { q: number; r: number } | null = null;
  for (const d of [HEIMAT_ABSTAND, HEIMAT_ABSTAND + 1, HEIMAT_ABSTAND - 1, HEIMAT_ABSTAND + 2]) {
    const ring = hexesInRange({ q: 0, r: 0 }, d).filter((h) => hexDistance(h, { q: 0, r: 0 }) === d);
    fund = rng.shuffle([...ring]).find((h) => frei(seed, h.q, h.r)) ?? null;
    if (fund) break;
  }
  heimat.set(seed, fund);
  return fund;
}

/** Welches Wunder an dieser Stelle zu bauen ist - oder null, wenn hier keine Staette liegt. */
export function wunderAt(seed: number, q: number, r: number): WunderArt | null {
  const h = heimatStaette(seed);
  const art = (): WunderArt => ARTEN[new Rng(hash3i(seed, q, r, SALT_WUNDER + 1)).int(ARTEN.length)]!;
  if (h && h.q === q && h.r === r) return art();
  if (hexDistance({ q, r }, { q: 0, r: 0 }) <= HEIMAT_ABSTAND + 3) return null;
  const rq = Math.floor(q / WUNDER_REGION);
  const rr = Math.floor(r / WUNDER_REGION);
  const rng = new Rng(hash3i(seed, rq, rr, SALT_WUNDER));
  if (rng.next() / 4294967296 > WUNDER_CHANCE) return null;
  const dq = 3 + rng.int(WUNDER_REGION - 6);
  const dr = 3 + rng.int(WUNDER_REGION - 6);
  if (q !== rq * WUNDER_REGION + dq || r !== rr * WUNDER_REGION + dr) return null;
  return frei(seed, q, r) ? art() : null;
}

/** Ein errichtetes Wunder im Spielstand. */
export type Wunder = { owner: PlayerId; art: WunderArt; seit: number };

type WunderSicht = { wunder?: Record<string, Wunder> };

/** Die Wunder dieses Spielers. */
export const wunderVon = (s: WunderSicht, id: PlayerId): Wunder[] => Object.values(s.wunder ?? {}).filter((w) => w.owner === id);

export const hatWunder = (s: WunderSicht, id: PlayerId, art: WunderArt): boolean => wunderVon(s, id).some((w) => w.art === art);

export const wunderPunkte = (s: WunderSicht, id: PlayerId): number =>
  wunderVon(s, id).reduce((n, w) => n + WUNDER[w.art].punkte, 0);

/** Alle Staetten im Umkreis - fuer die Liste im Menue. */
export function staettenBei(seed: number, mitte: { q: number; r: number }, radius: number): { q: number; r: number; art: WunderArt; key: string }[] {
  return hexesInRange(mitte, radius)
    .map((h) => ({ ...h, art: wunderAt(seed, h.q, h.r), key: hexKey(h.q, h.r) }))
    .filter((h): h is { q: number; r: number; art: WunderArt; key: string } => h.art !== null);
}
