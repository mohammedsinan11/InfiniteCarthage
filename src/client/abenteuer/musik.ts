/**
 * Musik und Klaenge des Abenteuers - eigen, nichts aus der Strategie
 * (client/audio.ts). Ein Knopf schaltet beides.
 *
 * Eine kleine Wanderweise in d-Dorisch, im Browser erzeugt: Laute (Dreieck)
 * zupft Akkorde, darueber eine Floete, darunter ein weicher Bass. Jede zweite
 * Runde schweigt die Floete, damit die Weise nicht ermuedet.
 * PLATZHALTER - die Musik wird neu gemacht; nur der Knopf bleibt.
 */

const SPEICHER = 'infinitecarthage.abenteuer.musik';
const LAUT = 'infinitecarthage.abenteuer.laut';
/** Lautstaerke in Stufen von 0 bis LAUT_STUFEN. */
export const LAUT_STUFEN = 10;
const TEMPO = 92;
const ACHTEL = 60 / TEMPO / 2;

/** Die Weise: [Ton (MIDI) oder null, Laenge in Achteln], acht Takte. */
const WEISE: [number | null, number][][] = [
  [[69, 2], [67, 1], [65, 1], [62, 4]],
  [[64, 2], [65, 1], [67, 1], [64, 4]],
  [[65, 2], [62, 1], [65, 1], [70, 3], [69, 1]],
  [[67, 6], [null, 2]],
  [[69, 2], [72, 2], [74, 2], [72, 1], [69, 1]],
  [[67, 2], [64, 2], [67, 4]],
  [[65, 2], [67, 1], [65, 1], [62, 2], [60, 2]],
  [[62, 6], [null, 2]],
];
/** Akkord je Takt: Grundton im Bass, dazu die Zupftoene. */
const AKKORDE: { bass: number; zupf: number[] }[] = [
  { bass: 38, zupf: [50, 57, 62, 65] },
  { bass: 36, zupf: [48, 55, 60, 64] },
  { bass: 34, zupf: [46, 53, 58, 62] },
  { bass: 36, zupf: [48, 55, 60, 64] },
];

let ctx: AudioContext | null = null;
let haupt: GainNode | null = null;
let uhr: number | null = null;
let naechsterTakt = 0;
let taktNr = 0;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function musikAn(): boolean {
  try {
    return localStorage.getItem(SPEICHER) !== 'aus';
  } catch {
    return true;
  }
}

function ton(art: OscillatorType, midi: number, t: number, dauer: number, laut: number, anschlag = 0.01): void {
  if (!ctx || !haupt) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = art;
  o.frequency.value = hz(midi);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(laut, t + anschlag);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g).connect(haupt);
  o.start(t);
  o.stop(t + dauer + 0.05);
}

function planeTakt(t: number, nr: number): void {
  const akkord = AKKORDE[nr % AKKORDE.length]!;
  ton('sine', akkord.bass, t, ACHTEL * 7.5, 0.22, 0.05);
  // Die Laute zupft auf, ab, auf, ab.
  const folge = [0, 1, 2, 3, 2, 1, 2, 3];
  folge.forEach((i, k) => ton('triangle', akkord.zupf[i]!, t + k * ACHTEL, ACHTEL * 2.2, 0.07));
  // Die Floete spielt zwei Runden, dann eine Runde Pause.
  if (Math.floor(nr / WEISE.length) % 3 === 2) return;
  let pos = 0;
  for (const [n, l] of WEISE[nr % WEISE.length]!) {
    if (n !== null) ton('sine', n + 12, t + pos * ACHTEL, l * ACHTEL * 0.95, 0.09, 0.04);
    pos += l;
  }
}

function weiter(): void {
  if (!ctx) return;
  while (naechsterTakt < ctx.currentTime + 0.4) {
    planeTakt(naechsterTakt, taktNr++);
    naechsterTakt += ACHTEL * 8;
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

/** Musik starten - erst nach einer Geste (Tippen, Taste), sonst schweigt der Browser. */
export function starteMusik(): void {
  if (!musikAn() || uhr !== null) return;
  try {
    if (!kontext() || !ctx) return;
    if (!haupt) {
      haupt = ctx.createGain();
      haupt.gain.value = 0.5;
      haupt.connect(gesamtAusgang(ctx));
    }
    void ctx.resume();
    naechsterTakt = ctx.currentTime + 0.1;
    uhr = window.setInterval(weiter, 120);
    weiter();
  } catch {
    // Kein Ton - das Spiel geht auch still.
  }
}

export function stoppeMusik(): void {
  if (uhr !== null) window.clearInterval(uhr);
  uhr = null;
  if (ctx && haupt) {
    // Weich ausblenden, dann einen frischen Ausgang fuer den naechsten Start.
    const alt = haupt;
    alt.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    window.setTimeout(() => alt.disconnect(), 600);
    haupt = null;
  }
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

export type Klang = 'schritt' | 'huepf' | 'hieb' | 'treffer' | 'platsch' | 'geblockt' | 'leer' | 'warnung' | 'zerplatzt' | 'beben' | 'probe';

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
    case 'probe':
      gleit(c, t, 'triangle', 660, 660, 0.12, 0.2);
      break;
    case 'zerplatzt':
      gleit(c, t, 'sine', 600, 160, 0.18, 0.14);
      stoss(c, t, 0.2, 0.4, 'bandpass', 900, 300, 1.5);
      break;
  }
}
