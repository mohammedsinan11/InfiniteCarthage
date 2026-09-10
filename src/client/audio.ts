/**
 * Klaenge, im Browser erzeugt statt aus Dateien geladen.
 *
 * Warum synthetisch: es braucht keine Assets, keine Lizenzfragen und keine
 * Ladezeit, und der Klang passt zur Pixel-Grafik. Ein Wuerfelrasseln aus
 * gefiltertem Rauschen kostet ein paar Zeilen; eine Aufnahme kostet eine
 * Datei, eine Herkunft und eine Erlaubnis.
 *
 * Browser verbieten Ton, bevor der Nutzer etwas angeklickt hat. Deshalb wird
 * der Audiokontext erst bei der ersten Eingabe erzeugt - vorher tut jeder
 * Aufruf hier schlicht nichts, statt eine Ausnahme zu werfen.
 */

const VOLUME_KEY = 'infinitecarthage.volume';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** 0 = stumm, 1 = voll. */
let volume = load();

function load(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Muss aus einem echten Klick heraus aufgerufen werden. Mehrfachaufrufe sind
 * unschaedlich.
 */
export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
}

export function getVolume(): number {
  return volume;
}

export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Privater Modus - dann gilt die Lautstaerke eben nur diese Sitzung.
  }
}

/** Kurzes Rauschen, gefiltert - Grundbaustein fuer Wuerfel und Bauen. */
function noise(duration: number, filterHz: number, gain: number, when = 0): void {
  if (!ctx || !master || volume === 0) return;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Zum Ende hin leiser, sonst klingt es wie ein abgeschnittenes Band.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = filterHz;
  bp.Q.value = 1.2;

  const g = ctx.createGain();
  g.gain.value = gain;

  src.connect(bp).connect(g).connect(master);
  src.start(ctx.currentTime + when);
}

/** Kurzer Ton. Fuer Rueckmeldungen, die sich "digital" anfuehlen duerfen. */
function blip(freq: number, duration: number, gain: number, when = 0, type: OscillatorType = 'square'): void {
  if (!ctx || !master || volume === 0) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);

  const g = ctx.createGain();
  // Weich ein- und ausblenden, sonst knackt es an beiden Enden.
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Feld unter dem Zeiger. Sehr leise - das passiert staendig. */
export function playHover(): void {
  blip(880, 0.045, 0.045, 0, 'triangle');
}

/** Rasseln, solange die Wuerfel rollen. */
export function playDiceRoll(duration = 0.9): void {
  if (!ctx) return;
  // Mehrere kurze Anschlaege statt eines langen Rauschens - das klingt nach
  // Wuerfeln im Becher statt nach Regen.
  for (let t = 0; t < duration; t += 0.055 + Math.random() * 0.05) {
    noise(0.05, 1400 + Math.random() * 1800, 0.16, t);
  }
}

/** Aufschlag, wenn die Wuerfel liegen. */
export function playDiceLand(): void {
  noise(0.13, 320, 0.4);
  blip(160, 0.1, 0.12, 0.01, 'sine');
}

/** Bauen: ein kurzer, holziger Schlag. */
export function playBuild(): void {
  noise(0.09, 900, 0.3);
  blip(320, 0.08, 0.1, 0.01, 'triangle');
}

/** Bestaetigung, etwa beim Zugwechsel. */
export function playChime(): void {
  blip(660, 0.12, 0.08, 0, 'sine');
  blip(990, 0.14, 0.06, 0.07, 'sine');
}
