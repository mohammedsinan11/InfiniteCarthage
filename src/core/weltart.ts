/**
 * Weltarten: jede Welt hat einen Charakter.
 *
 * Bisher war jede Karte dieselbe Mischung, nur anders verteilt. Jetzt kann
 * eine Welt ein Archipel sein, ein Hochland, ein Waldmeer, eine Kornkammer,
 * ein Grenzland voller Banden oder ein stilles Land (REPLAYABILITY.md, J -
 * World presets). Das aendert, was knapp ist, worum man handelt und wohin man
 * zieht - und damit, wie sich ein Lauf anfuehlt.
 *
 * DIE ART STECKT IM SEED. Gelaende, Lager und Zahlen sind reine Funktionen
 * des Seeds (worldgen.ts, raiders.ts), und viele Stellen kennen nur ihn. Statt
 * die Art ueberall mitzureichen, traegt der Seed sie selbst: das oberste Byte
 * ist eine Marke, die naechsten vier Bit sind die Art. Alte Seeds haben die
 * Marke (bis auf einen von 256) nicht und bleiben gewoehnliche Welten - laufende
 * Partien aendern sich also nicht. findPlayableSeed zaehlt nur die unteren
 * Bits hoch, die Art bleibt dabei erhalten.
 */

export type WeltArt = 'kernland' | 'archipel' | 'hochland' | 'waldmeer' | 'kornkammer' | 'grenzland' | 'stille';

export type WeltParameter = {
  /** Kontinentfeld unter dieser Schwelle ist Meer (worldgen.ts, SEA_LEVEL). */
  meer: number;
  huegel: number;
  berg: number;
  wald: number;
  weide: number;
  feld: number;
  /** Anteil der Regionen mit Lager (raiders.ts, NEST_CHANCE). */
  lager: number;
};

/** Die gewohnten Werte - worldgen.ts und raiders.ts, unveraendert. */
export const GEWOEHNLICH: WeltParameter = {
  meer: 0.2593,
  huegel: 0.6691,
  berg: 0.9065,
  wald: 0.6778,
  weide: 0.4238,
  feld: 0.1951,
  lager: 0.55,
};

export type WeltArtInfo = { art: WeltArt; name: string; text: string; p: WeltParameter };

export const WELTARTEN: readonly WeltArtInfo[] = [
  { art: 'kernland', name: 'Kernland', text: 'Die gewohnte Mischung aus allem.', p: GEWOEHNLICH },
  {
    art: 'archipel',
    name: 'Archipel',
    text: 'Inseln und Meerengen: viel Wasser, viele Haefen, wenig Platz.',
    p: { ...GEWOEHNLICH, meer: 0.44 },
  },
  {
    art: 'hochland',
    name: 'Hochland',
    text: 'Huegel und Berge: Erz und Lehm im Ueberfluss, Weiden sind rar.',
    p: { ...GEWOEHNLICH, huegel: 0.56, berg: 0.8 },
  },
  {
    art: 'waldmeer',
    name: 'Waldmeer',
    text: 'Endlose Waelder: Holz und Wolle reichlich, Felder selten.',
    p: { ...GEWOEHNLICH, wald: 0.5, weide: 0.3, feld: 0.15 },
  },
  {
    art: 'kornkammer',
    name: 'Kornkammer',
    text: 'Weite Ebenen: Getreide und Wolle reichlich, Erz ist kostbar.',
    p: { ...GEWOEHNLICH, huegel: 0.76, berg: 0.97, wald: 0.8, weide: 0.5, feld: 0.12 },
  },
  {
    art: 'grenzland',
    name: 'Grenzland',
    text: 'Dicht besiedelt von Banden: mehr Lager, mehr Raubzuege, mehr Beute.',
    p: { ...GEWOEHNLICH, lager: 0.72 },
  },
  {
    art: 'stille',
    name: 'Stille Lande',
    text: 'Ruhige Gegend: wenige Lager, Zeit zum Bauen.',
    p: { ...GEWOEHNLICH, lager: 0.3 },
  },
];

const NACH_ART = new Map(WELTARTEN.map((w) => [w.art, w]));

/** Die Marke im obersten Byte. */
const MARKE = 0xa7;

const istMarkiert = (seed: number): boolean => ((seed >>> 24) & 0xff) === MARKE;

/** Welche Art diese Welt hat. Ohne Marke: das gewohnte Kernland. */
export function weltArtVon(seed: number): WeltArtInfo {
  if (!istMarkiert(seed)) return WELTARTEN[0]!;
  const i = (seed >>> 20) & 0xf;
  return WELTARTEN[i % WELTARTEN.length]!;
}

let letzterSeed = Number.NaN;
let letzte: WeltParameter = GEWOEHNLICH;

/** Die Parameter dieser Welt - gemerkt, weil worldgen.ts sehr oft fragt. */
export function weltParameter(seed: number): WeltParameter {
  if (seed === letzterSeed) return letzte;
  letzterSeed = seed;
  letzte = weltArtVon(seed).p;
  return letzte;
}

/**
 * Einen Seed mit dieser Art versehen. Die unteren 20 Bit bleiben, wie sie
 * waren - sie bestimmen die Landschaft, die Art nur ihren Zuschnitt.
 */
export function mitWeltArt(seed: number, art: WeltArt): number {
  const i = WELTARTEN.findIndex((w) => w.art === art);
  if (i < 0) return seed;
  return ((MARKE << 24) | (i << 20) | (seed & 0xfffff)) | 0;
}

/** Eine zufaellige Art aus einer Zufallszahl - alle gleich oft (Spieltest: Kernland kam zu oft). */
export function zufallsArt(zufall: number): WeltArt {
  return WELTARTEN[Math.abs(zufall | 0) % WELTARTEN.length]!.art;
}

export const istWeltArt = (x: unknown): x is WeltArt => typeof x === 'string' && NACH_ART.has(x as WeltArt);

export const weltArtInfo = (art: WeltArt): WeltArtInfo => NACH_ART.get(art)!;
