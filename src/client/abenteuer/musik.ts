/**
 * Musik und Klaenge des Abenteuers - eigen, nichts aus der Strategie
 * (client/audio.ts). Ein Knopf schaltet beides.
 *
 * MUSIK. Viele Stuecke, im Browser erzeugt, je Landschaft (Biom) eine
 * Warteschlange: Wiese, Wald, Wueste, Berge, Schnee, Sumpf - und je Boss ein
 * eigenes Thema. Ein Stueck ist in Teile gegliedert (Vorspiel, A, B, ein
 * Zwischenspiel nur mit Begleitung, A mit anderem Klang ...) und spielt seine
 * ganze Folge - zwei bis vier Minuten -, dann blendet das naechste der
 * Warteschlange ueber. Wechselt der Ritter die Landschaft, blendet das alte
 * Thema aus und das neue ein (UEBERBLENDEN Sekunden). Die Nummer und der
 * Name des laufenden Stuecks stehen unter der Lautstaerke.
 *
 * Spieltest: "Ueberarbeite #3 Waldlied. Mache die Musik laenger und
 * abwechslungsreicher." Darum Teile und Folgen (TEIL), Weisen mit Motiven, die
 * wiederkehren, und mehr Begleitmuster.
 */

const SPEICHER = 'infinitecarthage.abenteuer.musik';
const LAUT = 'infinitecarthage.abenteuer.laut';
/** Lautstaerke in Stufen von 0 bis LAUT_STUFEN. */
export const LAUT_STUFEN = 10;
/** So viele Sekunden blendet ein Stueck ins naechste. */
const UEBERBLENDEN = 3;

export type Biom = 'wiese' | 'wald' | 'wueste' | 'berg' | 'schnee' | 'sumpf' | 'boss';
export const BIOM_NAME: Record<Biom, string> = { wiese: 'Wiese', wald: 'Wald', wueste: 'Wueste', berg: 'Berge', schnee: 'Schnee', sumpf: 'Sumpf', boss: 'Boss' };

/** echo: ein leiseres Nachklingen der Weise (Anteil der Lautstaerke). */
type Instrument = { art: OscillatorType; laut: number; anschlag: number; dauer: number; filter?: number; oktave?: number; echo?: number };
type Weise = [number | null, number][][];
type Muster = 'zupf' | 'akkord' | 'bordun' | 'treiben' | 'harfe' | 'puls';
type Trommel = 'tamburin' | 'pauke' | 'marsch';

/** Ein Teil eines Stuecks. Was fehlt, nimmt er vom Stueck. */
type Teil = {
  /** Stufe der Tonleiter je Takt - der Akkordgrundton. */
  akkorde: number[];
  /** Von Hand geschriebene Weise (Achtel) - sonst erzeugt aus seed. */
  weise?: Weise;
  seed?: number;
  muster?: Muster;
  /** null: dieser Teil spielt ohne Weise, nur Begleitung. */
  lead?: Instrument | null;
  begleit?: Instrument;
  trommel?: Trommel | null;
};

type Track = {
  id: number;
  name: string;
  biom: Biom;
  /** Fuer welchen Boss (bossArt) - sonst fuer jeden. */
  fuer?: string;
  tempo: number;
  /** Grundton (MIDI) und Tonleiter (Halbtonschritte). */
  grund: number;
  skala: number[];
  /** Akkorde des Hauptteils A - und des Gegenteils B (sonst AKKORDE_B). */
  akkorde: number[];
  akkordeB?: number[];
  weise?: Weise;
  seed: number;
  bass: Instrument;
  begleit: Instrument;
  lead: Instrument;
  muster: Muster;
  trommel?: Trommel;
  /** Eigene Teile und ihre Folge - sonst die Standardfolge (standardTeile). */
  teile?: Record<string, Teil>;
  folge?: string[];
};

const DUR = [0, 2, 4, 5, 7, 9, 11];
const DORISCH = [0, 2, 3, 5, 7, 9, 10];
const MOLL = [0, 2, 3, 5, 7, 8, 10];
const HARM_MOLL = [0, 2, 3, 5, 7, 8, 11];
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];
const LYDISCH = [0, 2, 4, 6, 7, 9, 11];
const PHRYGISCH = [0, 1, 3, 5, 7, 8, 10];

const ZUPF: Instrument = { art: 'triangle', laut: 0.07, anschlag: 0.005, dauer: 2.2 };
const FLOETE: Instrument = { art: 'sine', laut: 0.09, anschlag: 0.04, dauer: 0.95, oktave: 12 };
const BASS: Instrument = { art: 'sine', laut: 0.22, anschlag: 0.05, dauer: 7.5 };
const FLAECHE: Instrument = { art: 'sine', laut: 0.05, anschlag: 0.3, dauer: 7.5 };
const HARFE: Instrument = { art: 'triangle', laut: 0.06, anschlag: 0.004, dauer: 1.8 };
const GLOCKE: Instrument = { art: 'sine', laut: 0.075, anschlag: 0.003, dauer: 2.6, oktave: 12, echo: 0.35 };
const LAUTE: Instrument = { art: 'triangle', laut: 0.08, anschlag: 0.005, dauer: 0.7, oktave: 12 };

const WANDERWEISE: Weise = [
  [[69, 2], [67, 1], [65, 1], [62, 4]],
  [[64, 2], [65, 1], [67, 1], [64, 4]],
  [[65, 2], [62, 1], [65, 1], [70, 3], [69, 1]],
  [[67, 6], [null, 2]],
  [[69, 2], [72, 2], [74, 2], [72, 1], [69, 1]],
  [[67, 2], [64, 2], [67, 4]],
  [[65, 2], [67, 1], [65, 1], [62, 2], [60, 2]],
  [[62, 6], [null, 2]],
];

/** Waldlied, Teil A - E dorisch, ueber Em A Em D Em A Bm Em. */
const WALD_A: Weise = [
  [[64, 2], [67, 1], [69, 1], [71, 3], [69, 1]],
  [[73, 2], [71, 1], [69, 1], [69, 4]],
  [[71, 2], [67, 2], [64, 2], [67, 2]],
  [[66, 2], [69, 1], [66, 1], [62, 4]],
  [[64, 2], [67, 1], [69, 1], [71, 2], [74, 2]],
  [[76, 3], [73, 1], [69, 2], [71, 1], [73, 1]],
  [[74, 2], [71, 2], [66, 2], [69, 2]],
  [[67, 1], [66, 1], [64, 6]],
];

/** Waldlied, Teil B - hoeher, ueber G D A Em G D Bm Bm, fuehrt zurueck nach A. */
const WALD_B: Weise = [
  [[71, 3], [74, 1], [71, 2], [67, 2]],
  [[69, 3], [66, 1], [62, 4]],
  [[64, 2], [69, 2], [73, 2], [76, 2]],
  [[74, 1], [73, 1], [71, 6]],
  [[74, 3], [76, 1], [74, 2], [71, 2]],
  [[74, 2], [69, 2], [66, 4]],
  [[71, 2], [69, 1], [71, 1], [74, 2], [73, 2]],
  [[71, 4], [null, 2], [66, 1], [69, 1]],
];

const WALD_AKK_A = [0, 3, 0, 6, 0, 3, 4, 0];

export const TRACKS: readonly Track[] = [
  { id: 1, name: 'Wanderweise', biom: 'wiese', tempo: 92, grund: 62, skala: DORISCH, akkorde: [0, 6, 5, 6], weise: WANDERWEISE, seed: 1, bass: BASS, begleit: ZUPF, lead: FLOETE, muster: 'zupf' },
  { id: 2, name: 'Morgenlied', biom: 'wiese', tempo: 100, grund: 67, skala: DUR, akkorde: [0, 3, 4, 0, 5, 3, 4, 4], seed: 2, bass: BASS, begleit: { ...ZUPF, laut: 0.06 }, lead: LAUTE, muster: 'zupf' },
  {
    id: 3,
    name: 'Waldlied',
    biom: 'wald',
    tempo: 80,
    grund: 64,
    skala: DORISCH,
    akkorde: WALD_AKK_A,
    seed: 3,
    bass: BASS,
    begleit: { ...ZUPF, laut: 0.05, dauer: 3 },
    lead: { ...FLOETE, laut: 0.1 },
    muster: 'zupf',
    // Vorspiel im Moos, das Lied, dasselbe auf der Harfe mit Echo, der hohe
    // Teil B, eine Lichtung mit neuer Weise - zusammen gut drei Minuten.
    teile: {
      vor: { akkorde: [0, 3, 0, 3], lead: null, muster: 'akkord', begleit: FLAECHE },
      A: { akkorde: WALD_AKK_A, weise: WALD_A },
      A2: { akkorde: WALD_AKK_A, weise: WALD_A, muster: 'harfe', begleit: HARFE, lead: { ...LAUTE, laut: 0.07, echo: 0.3 } },
      B: { akkorde: [2, 6, 3, 0, 2, 6, 4, 4], weise: WALD_B, trommel: 'tamburin' },
      lichtung: { akkorde: [0, 6, 2, 3, 0, 6, 4, 4], seed: 33, muster: 'akkord', begleit: FLAECHE, lead: { art: 'sine', laut: 0.08, anschlag: 0.06, dauer: 1.4, oktave: 12, echo: 0.4 } },
      nach: { akkorde: [0, 3, 0, 0], lead: null, muster: 'harfe', begleit: HARFE },
    },
    folge: ['vor', 'A', 'A2', 'B', 'A', 'lichtung', 'B', 'A2', 'nach'],
  },
  { id: 4, name: 'Moos und Farn', biom: 'wald', tempo: 72, grund: 57, skala: MOLL, akkorde: [0, 5, 3, 4], seed: 4, bass: { ...BASS, laut: 0.18 }, begleit: FLAECHE, lead: { art: 'sine', laut: 0.08, anschlag: 0.08, dauer: 1.2, oktave: 12 }, muster: 'akkord' },
  { id: 5, name: 'Wuestenwind', biom: 'wueste', tempo: 96, grund: 62, skala: HIJAZ, akkorde: [0, 0, 6, 0, 5, 6, 1, 0], seed: 5, bass: { art: 'sine', laut: 0.2, anschlag: 0.1, dauer: 8 }, begleit: { art: 'triangle', laut: 0.08, anschlag: 0.003, dauer: 0.9 }, lead: { art: 'triangle', laut: 0.09, anschlag: 0.005, dauer: 0.7, oktave: 12 }, muster: 'bordun', trommel: 'tamburin' },
  { id: 6, name: 'Sandsturm', biom: 'wueste', tempo: 112, grund: 64, skala: HIJAZ, akkorde: [0, 1, 0, 6, 0, 1, 5, 0], seed: 6, bass: { art: 'triangle', laut: 0.16, anschlag: 0.02, dauer: 1.8 }, begleit: { art: 'triangle', laut: 0.07, anschlag: 0.003, dauer: 0.6 }, lead: { art: 'square', laut: 0.035, anschlag: 0.01, dauer: 0.8, oktave: 12, filter: 1800 }, muster: 'treiben', trommel: 'tamburin' },
  { id: 7, name: 'Bergklang', biom: 'berg', tempo: 70, grund: 60, skala: MOLL, akkorde: [0, 5, 2, 6, 0, 3, 4, 0], seed: 7, bass: { ...BASS, laut: 0.24 }, begleit: { art: 'sawtooth', laut: 0.035, anschlag: 0.4, dauer: 7.5, filter: 900 }, lead: { art: 'sawtooth', laut: 0.04, anschlag: 0.06, dauer: 1.6, filter: 1400 }, muster: 'akkord', trommel: 'pauke' },
  { id: 8, name: 'Schleimkoenig', biom: 'boss', fuer: 'koenig', tempo: 132, grund: 62, skala: HARM_MOLL, akkorde: [0, 0, 5, 4, 0, 0, 3, 4], seed: 8, bass: { art: 'square', laut: 0.06, anschlag: 0.005, dauer: 0.45, filter: 700 }, begleit: { art: 'triangle', laut: 0.06, anschlag: 0.003, dauer: 0.5 }, lead: { art: 'sawtooth', laut: 0.035, anschlag: 0.01, dauer: 0.9, oktave: 12, filter: 2200 }, muster: 'treiben', trommel: 'pauke' },
  { id: 9, name: 'Feldweg', biom: 'wiese', tempo: 108, grund: 65, skala: DUR, akkorde: [0, 4, 5, 3, 0, 4, 3, 4], akkordeB: [5, 3, 0, 4, 5, 3, 1, 4], seed: 9, bass: BASS, begleit: HARFE, lead: LAUTE, muster: 'harfe', trommel: 'tamburin' },
  { id: 10, name: 'Eulenhain', biom: 'wald', tempo: 66, grund: 62, skala: MOLL, akkorde: [0, 5, 2, 6], seed: 10, bass: { ...BASS, laut: 0.18 }, begleit: FLAECHE, lead: { art: 'sine', laut: 0.085, anschlag: 0.05, dauer: 1.3, oktave: 12, echo: 0.4 }, muster: 'akkord' },
  { id: 11, name: 'Oase', biom: 'wueste', tempo: 84, grund: 60, skala: HIJAZ, akkorde: [0, 1, 0, 6, 0, 5, 1, 0], seed: 11, bass: { art: 'sine', laut: 0.2, anschlag: 0.1, dauer: 8 }, begleit: { art: 'triangle', laut: 0.07, anschlag: 0.003, dauer: 1.2 }, lead: { art: 'sine', laut: 0.09, anschlag: 0.03, dauer: 1, oktave: 12, echo: 0.35 }, muster: 'bordun' },
  { id: 12, name: 'Gipfelwind', biom: 'berg', tempo: 76, grund: 55, skala: DORISCH, akkorde: [0, 6, 3, 0, 0, 6, 2, 4], seed: 12, bass: { ...BASS, laut: 0.24 }, begleit: { art: 'sawtooth', laut: 0.03, anschlag: 0.02, dauer: 0.8, filter: 1100 }, lead: { art: 'sawtooth', laut: 0.04, anschlag: 0.05, dauer: 1.4, oktave: 12, filter: 1600, echo: 0.3 }, muster: 'puls', trommel: 'pauke' },
  { id: 13, name: 'Frostnacht', biom: 'schnee', tempo: 70, grund: 67, skala: LYDISCH, akkorde: [0, 1, 0, 4, 0, 1, 5, 4], seed: 13, bass: { ...BASS, laut: 0.18 }, begleit: HARFE, lead: GLOCKE, muster: 'harfe' },
  { id: 14, name: 'Kristallhang', biom: 'schnee', tempo: 88, grund: 64, skala: DUR, akkorde: [0, 5, 3, 4], seed: 14, bass: BASS, begleit: { ...ZUPF, laut: 0.05 }, lead: { ...GLOCKE, echo: 0.25 }, muster: 'zupf' },
  { id: 15, name: 'Nebelmoor', biom: 'sumpf', tempo: 64, grund: 57, skala: PHRYGISCH, akkorde: [0, 1, 0, 6, 0, 1, 3, 0], seed: 15, bass: { ...BASS, laut: 0.2 }, begleit: { art: 'sawtooth', laut: 0.03, anschlag: 0.5, dauer: 7.5, filter: 700 }, lead: { art: 'sawtooth', laut: 0.04, anschlag: 0.08, dauer: 1.5, oktave: 12, filter: 1000, echo: 0.4 }, muster: 'bordun' },
  { id: 16, name: 'Irrlicht', biom: 'sumpf', tempo: 92, grund: 60, skala: MOLL, akkorde: [0, 5, 6, 4], seed: 16, bass: { ...BASS, laut: 0.18 }, begleit: { art: 'triangle', laut: 0.05, anschlag: 0.005, dauer: 0.6 }, lead: { art: 'triangle', laut: 0.07, anschlag: 0.01, dauer: 0.9, oktave: 12, echo: 0.35 }, muster: 'puls' },
  { id: 17, name: 'Schattentanz', biom: 'boss', fuer: 'schatten', tempo: 140, grund: 60, skala: PHRYGISCH, akkorde: [0, 1, 0, 6, 0, 1, 5, 6], seed: 17, bass: { art: 'square', laut: 0.055, anschlag: 0.005, dauer: 0.4, filter: 600 }, begleit: { art: 'triangle', laut: 0.06, anschlag: 0.003, dauer: 0.45 }, lead: { art: 'square', laut: 0.03, anschlag: 0.01, dauer: 0.8, oktave: 12, filter: 1900, echo: 0.3 }, muster: 'treiben', trommel: 'pauke' },
  { id: 18, name: 'Gelee-Koloss', biom: 'boss', fuer: 'koloss', tempo: 104, grund: 55, skala: HARM_MOLL, akkorde: [0, 0, 5, 5, 3, 3, 4, 4], seed: 18, bass: { art: 'sawtooth', laut: 0.05, anschlag: 0.01, dauer: 0.6, filter: 500 }, begleit: { art: 'sawtooth', laut: 0.03, anschlag: 0.02, dauer: 0.5, filter: 1200 }, lead: { art: 'sawtooth', laut: 0.04, anschlag: 0.02, dauer: 1.2, oktave: 12, filter: 1700 }, muster: 'treiben', trommel: 'marsch' },
  { id: 19, name: 'Hexenzirkel', biom: 'boss', fuer: 'penta', tempo: 120, grund: 57, skala: HARM_MOLL, akkorde: [0, 5, 1, 4, 0, 5, 3, 4], seed: 19, bass: { art: 'square', laut: 0.05, anschlag: 0.005, dauer: 0.5, filter: 650 }, begleit: HARFE, lead: { art: 'sawtooth', laut: 0.035, anschlag: 0.02, dauer: 1, oktave: 12, filter: 2000, echo: 0.35 }, muster: 'harfe', trommel: 'pauke' },
];

let ctx: AudioContext | null = null;
let uhr: number | null = null;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function musikAn(): boolean {
  try {
    return localStorage.getItem(SPEICHER) !== 'aus';
  } catch {
    return true;
  }
}

/** Die eingestellte Lautstaerke (Stufe 0 bis LAUT_STUFEN, voreingestellt 7). */
export function lautstaerke(): number {
  try {
    const n = Number(localStorage.getItem(LAUT));
    return localStorage.getItem(LAUT) !== null && Number.isFinite(n) ? Math.max(0, Math.min(LAUT_STUFEN, Math.round(n))) : 7;
  } catch {
    return 7;
  }
}

/** Stufe -> Verstaerkung: quadratisch, wie das Ohr hoert; Stufe 7 ist etwa wie bisher. */
const verstaerkung = (stufe: number) => 1.8 * (stufe / LAUT_STUFEN) ** 2;

/** Der gemeinsame Ausgang: Musik und Klaenge laufen hier durch die Lautstaerke. */
let gesamt: GainNode | null = null;
function gesamtAusgang(c: AudioContext): GainNode {
  if (!gesamt) {
    gesamt = c.createGain();
    gesamt.gain.value = verstaerkung(lautstaerke());
    gesamt.connect(c.destination);
  }
  return gesamt;
}

/** Lautstaerke setzen - und ein kurzer Ton, damit man hoert, wie laut es ist. */
export function setzeLautstaerke(stufe: number): number {
  const n = Math.max(0, Math.min(LAUT_STUFEN, Math.round(stufe)));
  try {
    localStorage.setItem(LAUT, String(n));
  } catch {
    // ohne Speicher nur fuer jetzt
  }
  const c = kontext();
  if (c) gesamtAusgang(c).gain.setTargetAtTime(verstaerkung(n), c.currentTime, 0.03);
  klang('probe');
  return n;
}

function kontext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

// --- Spieler: ein Stueck mit eigenem Ausgang (fuers Ueberblenden) ----------

/** Ein geplanter Takt: Akkord, Weise (oder keine) und wie begleitet wird. */
type Takt = { akk: number; noten: [number | null, number][] | null; muster: Muster; trommel: Trommel | null; lead: Instrument; begleit: Instrument };

type Spieler = { track: Track; aus: GainNode; naechster: number; takt: number; ende: number | null; plan: Takt[] };
let spieler: Spieler[] = [];
let biom: Biom = 'wiese';
let bossWahl: string | undefined;
/** Position in der Warteschlange je Biom. */
const platz: Record<Biom, number> = { wiese: 0, wald: 0, wueste: 0, berg: 0, schnee: 0, sumpf: 0, boss: 0 };
const hoerer = new Set<(t: Track | null) => void>();

/** Zufall aus einem Startwert - jedes Stueck klingt bei jedem Start gleich. */
function zufall(seed: number): () => number {
  let x = seed * 2654435761 >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
}

/**
 * Eine Weise erzeugen: Akkordtoene auf den Schlaegen, Durchgaenge dazwischen.
 * Je vier Takte: zwei Takte Motiv, ein freier Takt, ein ruhiger Schluss - und
 * das Motiv kehrt in der naechsten Vierergruppe wieder, auf dem neuen Akkord.
 */
function erzeugeWeise(t: Track, akkorde: number[], seed: number): Weise {
  const z = zufall(seed);
  const RHYTHMEN = [[2, 2, 2, 2], [2, 1, 1, 4], [3, 1, 2, 2], [4, 2, 2], [1, 1, 2, 1, 1, 2], [2, 2, 4], [3, 1, 3, 1], [2, 1, 1, 2, 2]];
  const SCHLUSS = [[4, 4], [2, 2, 4], [6, 2], [3, 1, 4]];
  type Gestalt = { r: number[]; s: number[]; start: number };
  const neu = (r: number[]): Gestalt => ({ r, s: r.map(() => [-2, -1, -1, 1, 1, 2][Math.floor(z() * 6)]!), start: Math.floor(z() * 3) });
  const motiv = [neu(RHYTHMEN[Math.floor(z() * RHYTHMEN.length)]!), neu(RHYTHMEN[Math.floor(z() * RHYTHMEN.length)]!)];
  return akkorde.map((akk, i) => {
    const pos = i % 4;
    const g = pos < 2 ? motiv[pos]! : neu(pos === 2 ? RHYTHMEN[Math.floor(z() * RHYTHMEN.length)]! : SCHLUSS[Math.floor(z() * SCHLUSS.length)]!);
    let stufe = akk + [0, 2, 4][g.start]!;
    const takt: [number | null, number][] = g.r.map((laenge, k) => {
      if (k > 0) stufe = Math.max(-1, Math.min(9, stufe + g.s[k]!));
      const pause = k > 0 && pos !== 3 && z() < 0.1;
      return [pause ? null : tonVon(t, Math.min(9, stufe)), laenge];
    });
    // Jede Vierergruppe endet ruhig auf dem Akkordton.
    if (pos === 3) takt[takt.length - 1] = [tonVon(t, akk), takt[takt.length - 1]![1]];
    return takt;
  });
}

function tonVon(t: Track, stufe: number): number {
  const n = t.skala.length;
  const okt = Math.floor(stufe / n);
  return t.grund + okt * 12 + t.skala[((stufe % n) + n) % n]!;
}

/** Gegenteil B, wenn ein Stueck keines hat: Unterdominante, zurueck zur Dominante. */
const AKKORDE_B = [3, 0, 5, 4, 3, 0, 4, 4];
/** Auf acht Takte bringen - kurze Akkordfolgen wiederholen sich. */
const achtTakte = (akk: number[]) => Array.from({ length: Math.max(8, akk.length) }, (_, i) => akk[i % akk.length]!);

/**
 * Die Standardfolge fuer Stuecke ohne eigene Teile: A, A, B, A, ein
 * Zwischenspiel ohne Weise, B, und A im anderen Klang (Echo, Harfe).
 */
function standardTeile(t: Track): { teile: Record<string, Teil>; folge: string[] } {
  const a = achtTakte(t.akkorde);
  const anders: Muster = t.muster === 'harfe' ? 'zupf' : t.muster === 'treiben' ? 'treiben' : 'harfe';
  return {
    teile: {
      A: { akkorde: a, weise: t.weise, seed: t.seed },
      B: { akkorde: achtTakte(t.akkordeB ?? AKKORDE_B), seed: t.seed + 100 },
      zwischen: { akkorde: a.slice(0, 4), lead: null, trommel: null },
      A2: { akkorde: a, weise: t.weise, seed: t.seed, muster: anders, lead: { ...t.lead, echo: t.lead.echo ?? 0.3 } },
    },
    folge: ['A', 'A', 'B', 'A', 'zwischen', 'B', 'A2'],
  };
}

/** Das ganze Stueck Takt fuer Takt - so lange spielt es, bevor das naechste kommt. */
function planeStueck(t: Track): Takt[] {
  const { teile, folge } = t.teile && t.folge ? { teile: t.teile, folge: t.folge } : standardTeile(t);
  const weisen = new Map<string, Weise>();
  const plan: Takt[] = [];
  for (const name of folge) {
    const teil = teile[name]!;
    let weise = weisen.get(name);
    if (!weise) {
      weise = teil.weise ?? erzeugeWeise(t, teil.akkorde, teil.seed ?? t.seed);
      weisen.set(name, weise);
    }
    teil.akkorde.forEach((akk, i) =>
      plan.push({
        akk,
        noten: teil.lead === null ? null : weise![i % weise!.length]!,
        muster: teil.muster ?? t.muster,
        trommel: teil.trommel === undefined ? (t.trommel ?? null) : teil.trommel,
        lead: teil.lead ?? t.lead,
        begleit: teil.begleit ?? t.begleit,
      }),
    );
  }
  return plan;
}

/** Wie lange ein Stueck dauert (Sekunden) - fuer die Anzeige. */
export function stueckDauer(t: Track): number {
  return (planeStueck(t).length * 8 * 60) / t.tempo / 2;
}

function spiele(sp: Spieler, inst: Instrument, midi: number, t: number, laenge: number): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = inst.art;
  o.frequency.value = hz(midi + (inst.oktave ?? 0));
  const dauer = laenge * inst.dauer;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(inst.laut, t + inst.anschlag);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(inst.anschlag + 0.02, dauer));
  let kette: AudioNode = o;
  if (inst.filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = inst.filter;
    kette = o.connect(f);
  }
  kette.connect(g).connect(sp.aus);
  o.start(t);
  o.stop(t + dauer + 0.05);
}

function schlag(sp: Spieler, t: number, art: 'tamburin' | 'pauke', laut: number): void {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = rauschBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = art === 'tamburin' ? 'highpass' : 'lowpass';
  f.frequency.value = art === 'tamburin' ? 6000 : 180;
  const g = ctx.createGain();
  const dauer = art === 'tamburin' ? 0.08 : 0.3;
  g.gain.setValueAtTime(laut, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  src.connect(f).connect(g).connect(sp.aus);
  src.start(t, Math.random() * 0.2);
  src.stop(t + dauer + 0.02);
}

function planeTakt(sp: Spieler, t: number): void {
  const tr = sp.track;
  const achtel = 60 / tr.tempo / 2;
  const takt = sp.plan[sp.takt % sp.plan.length]!;
  const { akk, muster, begleit } = takt;
  const grund = tonVon(tr, akk) - 24;
  const dreiklang = [akk, akk + 2, akk + 4, akk + 7, akk + 9].map((x) => tonVon(tr, x) - 12);
  // Bass und Begleitung.
  if (muster === 'treiben') {
    for (let k = 0; k < 8; k++) spiele(sp, tr.bass, grund + (k % 4 === 3 ? 7 : 0), t + k * achtel, achtel);
    [0, 2, 4, 6].forEach((k, i) => spiele(sp, begleit, dreiklang[i % 3]! + 12, t + k * achtel + achtel, achtel));
  } else {
    spiele(sp, tr.bass, grund, t, achtel);
    if (muster === 'zupf') [0, 1, 2, 3, 2, 1, 2, 3].forEach((i, k) => spiele(sp, begleit, dreiklang[i]!, t + k * achtel, achtel));
    else if (muster === 'akkord') dreiklang.slice(0, 3).forEach((n) => spiele(sp, begleit, n, t, achtel));
    else if (muster === 'harfe') {
      // Hinauf und hinab ueber gut eine Oktave.
      [0, 1, 2, 3, 4, 3, 2, 1].forEach((i, k) => spiele(sp, begleit, dreiklang[i]!, t + k * achtel, achtel));
    } else if (muster === 'puls') {
      // Der Akkord auf 1, 2+ und 4 - ein ruhiges Stolpern.
      spiele(sp, tr.bass, grund + 7, t + 4 * achtel, achtel);
      [0, 3, 6].forEach((k) => dreiklang.slice(0, 3).forEach((n) => spiele(sp, { ...begleit, laut: begleit.laut * 0.6 }, n, t + k * achtel, achtel)));
    } else if (muster === 'bordun') {
      // Wueste: ein liegender Grundton, die Laute zupft Grundton und Quinte im Wechsel.
      [0, 3, 4, 6].forEach((k, i) => spiele(sp, begleit, i % 2 ? grund + 31 : grund + 24, t + k * achtel, achtel));
    }
  }
  if (takt.trommel === 'tamburin') [1, 3, 5, 6, 7].forEach((k) => schlag(sp, t + k * achtel, 'tamburin', k % 2 ? 0.05 : 0.08));
  if (takt.trommel === 'pauke') [0, 4].forEach((k) => schlag(sp, t + k * achtel, 'pauke', 0.35));
  if (takt.trommel === 'marsch') {
    [0, 3, 4].forEach((k) => schlag(sp, t + k * achtel, 'pauke', 0.35));
    [2, 6].forEach((k) => schlag(sp, t + k * achtel, 'tamburin', 0.07));
  }
  // Die Weise - mit leisem Nachklang, wenn das Instrument ein Echo hat.
  if (!takt.noten) return;
  const lead = takt.lead;
  let pos = 0;
  for (const [n, l] of takt.noten) {
    if (n !== null) {
      spiele(sp, lead, n, t + pos * achtel, l * achtel);
      if (lead.echo) spiele(sp, { ...lead, laut: lead.laut * lead.echo }, n, t + (pos + 3) * achtel, l * achtel);
    }
    pos += l;
  }
}

function weiter(): void {
  if (!ctx) return;
  const jetzt = ctx.currentTime;
  for (const sp of spieler) {
    const achtel = 60 / sp.track.tempo / 2;
    while (sp.naechster < jetzt + 0.4 && (sp.ende === null || sp.naechster < sp.ende)) {
      planeTakt(sp, sp.naechster);
      sp.takt += 1;
      sp.naechster += achtel * 8;
    }
  }
  // Ausgeblendete Stuecke wegraeumen.
  for (const sp of spieler.filter((x) => x.ende !== null && x.ende + 1 < jetzt)) sp.aus.disconnect();
  spieler = spieler.filter((x) => x.ende === null || x.ende + 1 >= jetzt);
  // Hat das laufende Stueck seine Folge gespielt, kommt das naechste der Warteschlange.
  const laufend = spieler.find((x) => x.ende === null);
  if (laufend && laufend.takt >= laufend.plan.length) {
    platz[biom] += 1;
    blendeZu(trackFuer(biom, bossWahl));
  }
}

/** Das Stueck fuer eine Landschaft - beim Boss sein eigenes Thema, wenn es eines gibt. */
function trackFuer(b: Biom, wahl?: string): Track {
  const alle = TRACKS.filter((t) => t.biom === b);
  const eigene = wahl ? alle.filter((t) => t.fuer === wahl) : [];
  const liste = eigene.length ? eigene : alle;
  return liste[platz[b] % liste.length]!;
}

/** Zum Stueck t ueberblenden: das alte leiser, das neue lauter. */
function blendeZu(t: Track): void {
  if (!ctx) return;
  const jetzt = ctx.currentTime;
  for (const sp of spieler) {
    if (sp.ende !== null) continue;
    sp.ende = jetzt + UEBERBLENDEN;
    sp.aus.gain.cancelScheduledValues(jetzt);
    sp.aus.gain.setValueAtTime(sp.aus.gain.value, jetzt);
    sp.aus.gain.linearRampToValueAtTime(0.0001, jetzt + UEBERBLENDEN);
  }
  const aus = ctx.createGain();
  aus.gain.setValueAtTime(0.0001, jetzt);
  aus.gain.linearRampToValueAtTime(0.5, jetzt + (spieler.length ? UEBERBLENDEN : 0.3));
  aus.connect(gesamtAusgang(ctx));
  spieler.push({ track: t, aus, naechster: jetzt + 0.1, takt: 0, ende: null, plan: planeStueck(t) });
  for (const h of hoerer) h(t);
}

/** Das laufende Stueck - fuer die Anzeige unter der Lautstaerke. */
export function laufenderTrack(): Track | null {
  return spieler.find((x) => x.ende === null)?.track ?? null;
}

/** Bescheid geben, wenn ein neues Stueck beginnt. */
export function beiTrack(fn: (t: Track | null) => void): () => void {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

/** Die Landschaft des Ritters - wechselt sie, blendet ihr Thema ein. Beim Boss: welcher (bossArt). */
export function setzeBiom(b: Biom, wahl?: string): void {
  if (b === biom && (b !== 'boss' || wahl === bossWahl)) return;
  biom = b;
  bossWahl = b === 'boss' ? wahl : undefined;
  if (uhr !== null) blendeZu(trackFuer(b, bossWahl));
}

/** Musik starten - erst nach einer Geste (Tippen, Taste), sonst schweigt der Browser. */
export function starteMusik(): void {
  if (!musikAn() || uhr !== null) return;
  try {
    if (!kontext() || !ctx) return;
    void ctx.resume();
    uhr = window.setInterval(weiter, 120);
    blendeZu(trackFuer(biom, bossWahl));
    weiter();
  } catch {
    // Kein Ton - das Spiel geht auch still.
  }
}

export function stoppeMusik(): void {
  if (uhr !== null) window.clearInterval(uhr);
  uhr = null;
  if (ctx) {
    const jetzt = ctx.currentTime;
    for (const sp of spieler) {
      const aus = sp.aus;
      aus.gain.setTargetAtTime(0, jetzt, 0.1);
      window.setTimeout(() => aus.disconnect(), 600);
    }
  }
  spieler = [];
  for (const h of hoerer) h(null);
}

export function setzeMusik(an: boolean): void {
  try {
    localStorage.setItem(SPEICHER, an ? 'an' : 'aus');
  } catch {
    // ohne Speicher gilt es nur fuer jetzt
  }
  if (an) starteMusik();
  else stoppeMusik();
}

// --- Klaenge --------------------------------------------------------------

let rauschen: AudioBuffer | null = null;
let klangAusgang: GainNode | null = null;

function rauschBuffer(c: AudioContext): AudioBuffer {
  if (rauschen) return rauschen;
  const b = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  rauschen = b;
  return b;
}

function ausgang(c: AudioContext): GainNode {
  if (!klangAusgang) {
    klangAusgang = c.createGain();
    klangAusgang.gain.value = 0.6;
    klangAusgang.connect(gesamtAusgang(c));
  }
  return klangAusgang;
}

/** Ein Rauschstoss durch einen Filter - Schritte, Hiebe, Platscher. */
function stoss(c: AudioContext, t: number, dauer: number, laut: number, filter: BiquadFilterType, von: number, bis = von, q = 1): void {
  const src = c.createBufferSource();
  src.buffer = rauschBuffer(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(von, t);
  f.frequency.exponentialRampToValueAtTime(bis, t + dauer);
  const g = c.createGain();
  g.gain.setValueAtTime(laut, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  src.connect(f).connect(g).connect(ausgang(c));
  src.start(t, Math.random() * 0.3);
  src.stop(t + dauer + 0.02);
}

/** Ein Ton, der in der Hoehe gleitet - Huepfer, Plopp, Warnung. */
function gleit(c: AudioContext, t: number, art: OscillatorType, von: number, bis: number, dauer: number, laut: number): void {
  const o = c.createOscillator();
  o.type = art;
  o.frequency.setValueAtTime(von, t);
  o.frequency.exponentialRampToValueAtTime(bis, t + dauer);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(laut, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g).connect(ausgang(c));
  o.start(t);
  o.stop(t + dauer + 0.02);
}

export type Klang = 'schritt' | 'huepf' | 'hieb' | 'treffer' | 'platsch' | 'geblockt' | 'leer' | 'warnung' | 'zerplatzt' | 'beben' | 'probe' | 'wuerfelKlack' | 'wuerfelLand' | 'spuck' | 'feuer' | 'blitz' | 'bereit' | 'legende' | 'stufe' | 'autsch';

/** Ein kurzer Klang - nur, wenn der Ton an ist. */
export function klang(art: Klang): void {
  if (!musikAn()) return;
  const c = kontext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + 0.005;
  switch (art) {
    case 'schritt':
      // Ein dumpfer Tritt auf Erde.
      stoss(c, t, 0.08, 0.5, 'lowpass', 900, 300);
      break;
    case 'huepf':
      gleit(c, t, 'sine', 260, 560, 0.09, 0.05);
      break;
    case 'hieb':
      // Die Klinge pfeift durch die Luft.
      stoss(c, t, 0.16, 0.35, 'bandpass', 3200, 700, 2);
      break;
    case 'treffer':
      gleit(c, t, 'square', 150, 55, 0.12, 0.12);
      stoss(c, t, 0.06, 0.4, 'lowpass', 1800, 400);
      break;
    case 'platsch':
      // Ein Schleim klatscht auf den Ritter.
      stoss(c, t, 0.18, 0.5, 'lowpass', 600, 150);
      gleit(c, t, 'sine', 200, 80, 0.16, 0.15);
      break;
    case 'geblockt':
      gleit(c, t, 'triangle', 1400, 1100, 0.12, 0.1);
      stoss(c, t, 0.05, 0.25, 'highpass', 3000);
      break;
    case 'leer':
      stoss(c, t, 0.14, 0.2, 'lowpass', 500, 200);
      break;
    case 'warnung':
      gleit(c, t, 'triangle', 330, 300, 0.07, 0.08);
      gleit(c, t + 0.09, 'triangle', 250, 220, 0.09, 0.08);
      break;
    case 'beben':
      // Der Koenig: ein tiefes Grollen.
      gleit(c, t, 'sine', 70, 38, 0.6, 0.35);
      stoss(c, t, 0.5, 0.5, 'lowpass', 250, 60);
      break;
    case 'wuerfelKlack': {
      // Holz auf Holz: ein kurzer, heller Klack, jedes Mal ein wenig anders.
      const h = 1800 + Math.random() * 1400;
      stoss(c, t, 0.03, 0.35, 'bandpass', h, h * 0.8, 6);
      gleit(c, t, 'triangle', h / 3, h / 4, 0.03, 0.05);
      break;
    }
    case 'wuerfelLand':
      // Der Wuerfel liegt: ein dumpfer Plock und ein letzter Klack.
      gleit(c, t, 'sine', 220, 110, 0.12, 0.25);
      stoss(c, t, 0.05, 0.45, 'bandpass', 1500, 900, 4);
      stoss(c, t + 0.06, 0.025, 0.2, 'bandpass', 2400, 2000, 6);
      break;
    case 'spuck':
      // Ein nasses "Ptoo".
      gleit(c, t, 'sine', 900, 300, 0.12, 0.12);
      stoss(c, t, 0.1, 0.3, 'bandpass', 1200, 500, 3);
      break;
    case 'feuer':
      // Ein Fauchen, das aufsteigt.
      stoss(c, t, 0.5, 0.5, 'bandpass', 300, 1800, 1.2);
      gleit(c, t, 'sawtooth', 90, 60, 0.4, 0.06);
      break;
    case 'blitz':
      stoss(c, t, 0.08, 0.6, 'highpass', 4000, 2000);
      stoss(c, t + 0.05, 0.3, 0.4, 'lowpass', 900, 120);
      break;
    case 'bereit':
      gleit(c, t, 'triangle', 520, 780, 0.12, 0.12);
      gleit(c, t + 0.1, 'triangle', 780, 1040, 0.16, 0.1);
      break;
    case 'legende':
      // Ein Akkord, der aufsteigt.
      [523, 659, 784, 1046].forEach((hz, i) => gleit(c, t + i * 0.09, 'triangle', hz, hz, 0.6, 0.09));
      break;
    case 'stufe':
      [440, 554, 659, 880].forEach((hz, i) => gleit(c, t + i * 0.06, 'square', hz, hz * 1.01, 0.18, 0.05));
      break;
    case 'autsch':
      // Der Ritter wird getroffen: ein kurzes, dumpfes Aechzen mit Blechklang.
      gleit(c, t, 'square', 220, 110, 0.14, 0.07);
      gleit(c, t, 'sawtooth', 160, 90, 0.18, 0.05);
      stoss(c, t, 0.05, 0.25, 'bandpass', 2600, 1800, 5);
      break;
    case 'probe':
      gleit(c, t, 'triangle', 660, 660, 0.12, 0.2);
      break;
    case 'zerplatzt':
      gleit(c, t, 'sine', 600, 160, 0.18, 0.14);
      stoss(c, t, 0.2, 0.4, 'bandpass', 900, 300, 1.5);
      break;
  }
}
