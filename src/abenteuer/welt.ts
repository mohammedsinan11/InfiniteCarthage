/**
 * Die Welt des Abenteuers - ein eigener Generator, getrennt von der
 * Strategie (core/worldgen.ts).
 *
 * Spieltest: "Die Biome muessen groesser sein, sonst wechselt die Musik die
 * ganze Zeit" und "alle Kacheltypen des Pakets einfuegen - wir wollen mit dem
 * Weltgenerator spielen". Darum hier:
 *
 *   HOEHE    grosse, weiche Rauschlagen: Meere, Kuesten, Huegel, Gebirge
 *   KLIMA    Waerme und Feuchte in noch groesserem Massstab - so entstehen
 *            weite Landschaften: Wiesen und Felder, Waelder, Dschungel,
 *            Taiga und Schnee, Suempfe, Wuesten mit Duenen, Steppe aus Erde
 *            und Lehm
 *   BAECHE   gerade Laeufe ueber Wiesen und Felder (die Flusskacheln des
 *            Pakets zeigen einen diagonalen Bach) - watbar, und man kann
 *            darin angeln
 *
 * Jede Kachel des Pakets kommt vor (BODEN_KACHEL). Alles ist eine reine
 * Funktion von Seed und Feld, mit einem kleinen Zwischenspeicher.
 */

import { expand, fbm, hexToField } from '../core/noise';
import { hash3i } from '../core/hash';

export type Boden =
  | 'wiese'
  | 'feld'
  | 'erde'
  | 'lehm'
  | 'wald'
  | 'dschungel'
  | 'taiga'
  | 'schnee'
  | 'sumpf'
  | 'sand'
  | 'duenen'
  | 'huegel'
  | 'berg'
  | 'fluss'
  | 'flach'
  | 'wasser'
  | 'tief';

export const BODEN_NAME: Record<Boden, string> = {
  wiese: 'Wiese',
  feld: 'Feld',
  erde: 'Erde',
  lehm: 'Lehm',
  wald: 'Wald',
  dschungel: 'Dschungel',
  taiga: 'Taiga',
  schnee: 'Schnee',
  sumpf: 'Sumpf',
  sand: 'Sand',
  duenen: 'Duenen',
  huegel: 'Huegel',
  berg: 'Berge',
  fluss: 'Bach',
  flach: 'Flachwasser',
  wasser: 'Wasser',
  tief: 'Tiefes Wasser',
};

/** Die Kachelsorte(n) des Pakets je Boden - mehrere: Varianten nach Feld. */
export const BODEN_KACHEL: Record<Boden, string[]> = {
  wiese: ['grass'],
  feld: ['wheat'],
  erde: ['dirt'],
  lehm: ['clay'],
  wald: ['forest'],
  dschungel: ['jungle'],
  taiga: ['taiga'],
  schnee: ['snow'],
  sumpf: ['swamp', 'swamp_reeds', 'swamp_pads'],
  sand: ['sand'],
  duenen: ['dunes'],
  huegel: ['hills'],
  berg: ['mountains'],
  fluss: ['river_l', 'river_r'],
  flach: ['shallow_water'],
  wasser: ['water'],
  tief: ['deep_water'],
};

/** Farbe je Boden fuer die Uebersichtskarte. */
export const BODEN_FARBE: Record<Boden, string> = {
  wiese: '#6fad42',
  feld: '#cbbf5d',
  erde: '#8a6048',
  lehm: '#a8674a',
  wald: '#3d6a45',
  dschungel: '#2f7a3a',
  taiga: '#2b5246',
  schnee: '#d4e8f3',
  sumpf: '#4f6b3a',
  sand: '#e0c26d',
  duenen: '#d6a94e',
  huegel: '#7c9a4a',
  berg: '#7d7c82',
  fluss: '#4d919e',
  flach: '#7abcc2',
  wasser: '#327297',
  tief: '#1f4f78',
};

export const istWasser = (b: Boden | null): boolean => b === 'flach' || b === 'wasser' || b === 'tief';

/**
 * Die Stellschrauben des Generators - im Debugfenster (Reiter "Welt") zum
 * Spielen. hoehe: Groesse von Kontinenten und Gebirgen; klima: Groesse der
 * Landschaften (Biome); meer: Meeresspiegel.
 */
export const WELT_VORGABE = { hoehe: 26, klima: 52, meer: 0.3 };
export const einstellung = { ...WELT_VORGABE };

/** Eine Stellschraube aendern - der Zwischenspeicher wird verworfen. */
export function setzeEinstellung(neu: Partial<typeof einstellung>): void {
  Object.assign(einstellung, neu);
  speicher.clear();
}
const SALT_HOEHE = 501;
const SALT_WAERME = 502;
const SALT_FEUCHTE = 503;
const SALT_DETAIL = 504;
const SALT_BACH = 505;

/** Hoehe, Waerme, Feuchte eines Feldes - je 0 bis 1. */
export function klima(seed: number, q: number, r: number): { hoehe: number; waerme: number; feuchte: number } {
  const { x, y } = hexToField(q, r);
  let hoehe = expand(fbm(seed, x / einstellung.hoehe, y / einstellung.hoehe, SALT_HOEHE, 4), 1.9);
  // Rund um den Ursprung hebt sich Land: der Ritter beginnt nicht im Meer.
  const d = Math.hypot(x, y);
  hoehe = Math.min(1, hoehe + 0.22 * Math.max(0, 1 - d / 14));
  const k = einstellung.klima;
  const waerme = expand(fbm(seed, x / k + 40, y / k, SALT_WAERME, 3), 2);
  const feuchte = expand(fbm(seed, x / k, y / k + 70, SALT_FEUCHTE, 3), 2);
  return { hoehe, waerme, feuchte };
}

/** Der Boden ohne Baeche. */
function grundboden(seed: number, q: number, r: number): Boden {
  const { hoehe, waerme, feuchte } = klima(seed, q, r);
  const meer = einstellung.meer;
  if (hoehe < meer - 0.13) return 'tief';
  if (hoehe < meer - 0.05) return 'wasser';
  if (hoehe < meer) return 'flach';
  if (hoehe > 0.84) return waerme < 0.25 ? 'schnee' : 'berg';
  if (hoehe > 0.75) return waerme < 0.25 ? 'taiga' : 'huegel';
  const { x, y } = hexToField(q, r);
  const detail = fbm(seed, x / 6, y / 6, SALT_DETAIL, 2);
  // Kalt: Schnee und Taiga.
  if (waerme < 0.22) return feuchte > 0.45 ? 'taiga' : 'schnee';
  // Heiss: Wueste, Steppe oder Dschungel.
  if (waerme > 0.7) {
    if (feuchte < 0.4) return detail > 0.55 ? 'duenen' : 'sand';
    if (feuchte > 0.66) return 'dschungel';
    return detail > 0.5 ? 'lehm' : 'erde';
  }
  // Gemaessigt: Sumpf, Wald, Wiese und Felder.
  if (feuchte > 0.78) return 'sumpf';
  if (feuchte > 0.57) return 'wald';
  if (feuchte < 0.27) return detail > 0.45 ? 'feld' : 'erde';
  return detail > 0.6 ? 'feld' : 'wiese';
}

/** Bachrichtungen: nach rechts unten (river_l) und links unten (river_r). */
const BACH_RICHTUNG: readonly [number, number, string][] = [
  [0, 1, 'river_l'],
  [-1, 1, 'river_r'],
];
const BACH_LAENGE = 9;
const wiesig = (b: Boden) => b === 'wiese' || b === 'feld';

/** Liegt hier ein Bach? Dann welche Kachel. Ein Bach entspringt selten und laeuft gerade bergab. */
function bach(seed: number, q: number, r: number, grund: (q: number, r: number) => Boden): string | null {
  if (!wiesig(grund(q, r))) return null;
  for (const [dq, dr, kachel] of BACH_RICHTUNG) {
    for (let k = 0; k < BACH_LAENGE; k++) {
      const sq = q - dq * k;
      const sr = r - dr * k;
      if (!wiesig(grund(sq, sr))) break;
      // Die Quelle: selten, und nur eine Richtung je Quelle.
      const h = hash3i(seed, sq, sr, SALT_BACH);
      if (h % 37 === 0 && (h >> 8) % 2 === BACH_RICHTUNG.findIndex((x) => x[2] === kachel)) return kachel;
    }
  }
  return null;
}

const speicher = new Map<number, Map<string, { boden: Boden; kachel: string }>>();

/** Boden und Kachelsorte eines Feldes. */
export function feldInfo(seed: number, q: number, r: number): { boden: Boden; kachel: string } {
  let m = speicher.get(seed);
  if (!m) {
    if (speicher.size > 4) speicher.clear();
    m = new Map();
    speicher.set(seed, m);
  }
  const k = q + ':' + r;
  const da = m.get(k);
  if (da) return da;
  const grundSpeicher = new Map<string, Boden>();
  const grund = (gq: number, gr: number) => {
    const gk = gq + ':' + gr;
    let b = grundSpeicher.get(gk);
    if (!b) {
      b = grundboden(seed, gq, gr);
      grundSpeicher.set(gk, b);
    }
    return b;
  };
  let boden = grund(q, r);
  const varianten = BODEN_KACHEL[boden];
  let kachel = varianten[hash3i(seed, q, r, SALT_DETAIL + 1) % varianten.length]!;
  const b = bach(seed, q, r, grund);
  if (b) {
    boden = 'fluss';
    kachel = b;
  }
  const info = { boden, kachel };
  if (m.size > 200000) m.clear();
  m.set(k, info);
  return info;
}

export const boden = (seed: number, q: number, r: number): Boden => feldInfo(seed, q, r).boden;
