/**
 * Hintergrundmusik.
 *
 * Zwei Quellen: Stuecke, die im Repo liegen, und eine im Browser erzeugte
 * Melodie als Rueckfallebene. Der Spieler waehlt im Menue.
 *
 * WARUM KEIN YOUTUBE
 *
 * Eine Playlist als versteckte Tonquelle einzubinden scheitert dreifach:
 * YouTubes Bedingungen verlangen einen sichtbaren, unverdeckten Player, die
 * Musik ist urheberrechtlich geschuetzt und wir veroeffentlichen die Seite
 * oeffentlich, und Browser blockieren ohnehin automatisch startenden Ton.
 *
 * EINGEBAUTE STUECKE
 *
 * Alles, was in src/assets/music liegt, erscheint automatisch als Auswahl -
 * siehe das README dort, was lizenzrechtlich geht und was nicht. Solange der
 * Ordner leer ist, gibt es nur die erzeugte Musik.
 *
 * ERZEUGT
 *
 * Eine langsame Melodie in dorischem Modus ueber einem liegenden Bordunton,
 * dazu ein leiser Trommelschlag. Dorisch klingt mittelalterlich, ohne in
 * Kitsch zu kippen; der Bordun ist genau das, was eine Drehleier den ganzen
 * Abend macht. Die Toene gehen in kleinen Schritten statt zu springen, sonst
 * klingt es nach Zufallsgenerator statt nach Melodie.
 */

/**
 * Stuecke aus dem Repo. Der Glob laeuft beim Bauen; ein leerer Ordner
 * ergibt eine leere Liste, ohne dass hier etwas anzupassen waere.
 */
const DATEIEN = import.meta.glob('../assets/music/*.{mp3,ogg,m4a,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export type Track = { id: string; name: string; url: string };

export const TRACKS: Track[] = Object.entries(DATEIEN)
  .map(([pfad, url]) => {
    const datei = pfad.slice(pfad.lastIndexOf('/') + 1);
    const name = datei.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    return { id: datei, name, url };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const MODE_KEY = 'infinitecarthage.musik';

/** 'aus', 'erzeugt' oder die Kennung eines eingebauten Stuecks. */
export type MusicMode = string;

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let modus: MusicMode = ladeModus();
let lautstaerke = 0.35;

/** Fuer den erzeugten Modus. */
let timer: number | null = null;
let stufe = 0;

/** Fuer den Dateimodus. */
let element: HTMLAudioElement | null = null;
let objektUrl: string | null = null;

function ladeModus(): MusicMode {
  try {
    const v = localStorage.getItem(MODE_KEY) ?? 'aus';
    // Ein gemerktes Stueck kann inzwischen fehlen - dann lieber still sein
    // als ins Leere greifen.
    if (v !== 'aus' && v !== 'erzeugt' && !TRACKS.some((t) => t.id === v)) return 'aus';
    return v;
  } catch {
    return 'aus';
  }
}

function sichereModus(m: MusicMode): void {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // Privater Modus - dann gilt die Wahl eben nur jetzt.
  }
}

function ensureCtx(): boolean {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;
  ctx = new Ctor();
  bus = ctx.createGain();
  bus.gain.value = lautstaerke;
  bus.connect(ctx.destination);
  return true;
}

// --- Erzeugte Musik ---------------------------------------------------------

/** D-dorisch: die Tonleiter, die mittelalterlich klingt, ohne traurig zu sein. */
const SKALA = [0, 2, 3, 5, 7, 9, 10];
const GRUNDTON = 146.83; // D3

const halbtonZuHz = (halb: number): number => GRUNDTON * Math.pow(2, halb / 12);

/** Ein gezupfter Ton - schneller Anschlag, langes Ausklingen. */
function zupf(freq: number, dauer: number, gain: number, wann: number): void {
  if (!ctx || !bus) return;
  const t = ctx.currentTime + wann;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2400, t);
  filter.frequency.exponentialRampToValueAtTime(700, t + dauer);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);

  osc.connect(filter).connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + dauer + 0.05);
}

/** Liegender Bordunton - Grundton und Quinte, wie eine Drehleier. */
function bordun(dauer: number): void {
  if (!ctx || !bus) return;
  const t = ctx.currentTime;
  for (const halb of [-12, -5]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = halbtonZuHz(halb);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1.2);
    g.gain.setValueAtTime(0.05, t + dauer - 1.2);
    g.gain.linearRampToValueAtTime(0, t + dauer);

    osc.connect(filter).connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dauer + 0.1);
  }
}

/** Ein Takt: vier Schlaege, mal ein Ton, mal eine Pause. */
const TAKT_MS = 2400;

function spieleTakt(): void {
  if (!ctx || modus !== 'erzeugt') return;
  bordun(TAKT_MS / 1000);

  for (let schlag = 0; schlag < 4; schlag++) {
    // Nicht auf jedem Schlag ein Ton - Luft gehoert dazu.
    if (Math.random() < 0.25) continue;
    // Kleine Schritte statt Spruenge, damit eine Linie entsteht.
    stufe += Math.floor(Math.random() * 5) - 2;
    stufe = Math.max(0, Math.min(SKALA.length * 2 - 1, stufe));
    const oktave = Math.floor(stufe / SKALA.length);
    const halb = SKALA[stufe % SKALA.length]! + 12 * oktave;
    zupf(halbtonZuHz(halb), 1.1, 0.12, (schlag * TAKT_MS) / 4000);
  }
}

function startErzeugt(): void {
  stoppeAlles();
  if (!ensureCtx()) return;
  spieleTakt();
  timer = window.setInterval(spieleTakt, TAKT_MS);
}

// --- Eigene Datei -----------------------------------------------------------

/** Ein eingebautes Stueck in Schleife abspielen. */
function spieleTrack(track: Track): void {
  stoppeAlles();
  element = new Audio(track.url);
  element.loop = true;
  element.volume = lautstaerke;
  void element.play().catch(() => {
    // Ohne Nutzergeste verweigert der Browser - dann bleibt es eben still,
    // bis der naechste Klick kommt.
  });
}

// --- Steuerung --------------------------------------------------------------

function stoppeAlles(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  if (element) {
    element.pause();
    element = null;
  }
  if (objektUrl) {
    URL.revokeObjectURL(objektUrl);
    objektUrl = null;
  }
}

export function getMusicMode(): MusicMode {
  return modus;
}

export function setMusicMode(m: MusicMode): void {
  modus = m;
  sichereModus(m);
  if (m === 'erzeugt') {
    startErzeugt();
    return;
  }
  if (m === 'aus') {
    stoppeAlles();
    return;
  }
  const track = TRACKS.find((t) => t.id === m);
  if (track) spieleTrack(track);
  else stoppeAlles();
}

export function getMusicVolume(): number {
  return lautstaerke;
}

export function setMusicVolume(v: number): void {
  lautstaerke = Math.min(1, Math.max(0, v));
  if (bus && ctx) bus.gain.setTargetAtTime(lautstaerke, ctx.currentTime, 0.05);
  if (element) element.volume = lautstaerke;
}
