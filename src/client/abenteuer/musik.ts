/**
 * Musik des Abenteuers - eigen, nichts aus der Strategie (client/audio.ts).
 *
 * Eine kleine Wanderweise in d-Dorisch, im Browser erzeugt: Laute (Dreieck)
 * zupft Akkorde, darueber eine Floete, darunter ein weicher Bass. Jede zweite
 * Runde schweigt die Floete, damit die Weise nicht ermuedet.
 * PLATZHALTER - die Musik wird neu gemacht; nur der Knopf bleibt.
 */

const SPEICHER = 'infinitecarthage.abenteuer.musik';
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

/** Musik starten - erst nach einer Geste (Tippen, Taste), sonst schweigt der Browser. */
export function starteMusik(): void {
  if (!musikAn() || uhr !== null) return;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (!haupt) {
      haupt = ctx.createGain();
      haupt.gain.value = 0.5;
      haupt.connect(ctx.destination);
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
