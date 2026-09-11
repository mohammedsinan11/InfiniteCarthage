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

/**
 * Grundpegel ueber dem Regler.
 *
 * Die Klaenge waren insgesamt zu leise - besonders Ertrag und Karten, also
 * genau die Momente, die sich lohnen sollen. Statt jeden Klang einzeln
 * aufzudrehen, hebt dieser Faktor alles an; der Kompressor dahinter faengt die
 * Spitzen ab, wenn mehreres gleichzeitig klingt.
 */
const PEGEL = 1.8;

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
  master.gain.value = volume * PEGEL;
  // Lauter heisst sonst schnell uebersteuert, sobald Ertrag, Karte und Wuerfel
  // zusammenfallen.
  const kompressor = ctx.createDynamicsCompressor();
  kompressor.threshold.value = -14;
  kompressor.knee.value = 10;
  kompressor.ratio.value = 4;
  kompressor.attack.value = 0.004;
  kompressor.release.value = 0.18;
  master.connect(kompressor).connect(ctx.destination);
}

export function getVolume(): number {
  return volume;
}

export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  if (master && ctx) master.gain.setTargetAtTime(volume * PEGEL, ctx.currentTime, 0.01);
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

/**
 * Feld unter dem Zeiger.
 *
 * Das passiert bei jeder Mausbewegung dutzendfach, also muss es fast
 * unhoerbar sein - ein Anstupsen, kein Ton. Ein erster Entwurf war deutlich
 * lauter und wurde schnell laestig.
 *
 * Zusaetzlich eine Sperre: wer schnell ueber die Karte faehrt, loest sonst
 * ein Maschinengewehr aus.
 */
let letzterHover = 0;
const HOVER_MIN_MS = 90;

export function playHover(): void {
  const jetzt = Date.now();
  if (jetzt - letzterHover < HOVER_MIN_MS) return;
  letzterHover = jetzt;
  blip(1180, 0.022, 0.012, 0, 'sine');
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

/**
 * Ertrag: ein kleiner aufsteigender Dreiklang.
 *
 * Aufsteigend, weil es sich nach Zugewinn anfuehlen soll - dieselben Toene
 * abwaerts klaengen nach Verlust. Der Versatz laesst mehrere Karten
 * nacheinander eintreffen statt als Klumpen.
 */
export function playGain(index = 0): void {
  const t = index * 0.09;
  // Leicht verstimmt je Karte, damit eine Serie nicht mechanisch klingt.
  const f = 1 + ((index % 3) - 1) * 0.02;
  blip(523 * f, 0.12, 0.16, t, 'sine');
  blip(659 * f, 0.13, 0.14, t + 0.05, 'sine');
  blip(784 * f, 0.18, 0.13, t + 0.1, 'sine');
  // Heller Glanz obendrauf - das Klimpern einer Muenze.
  blip(1568 * f, 0.09, 0.05, t + 0.12, 'triangle');
  noise(0.05, 5200, 0.06, t + 0.1);
}

/**
 * Pluenderung: ein absteigender Dreiklang mit Trommel darunter.
 *
 * Bewusst das Spiegelbild von playGain - dieselbe Figur abwaerts statt
 * aufwaerts. Wer den Ertrag kennt, hoert sofort, dass hier das Gegenteil
 * passiert, ohne dass es jemand erklaeren muss.
 */
export function playRaid(): void {
  noise(0.22, 220, 0.32);
  blip(392, 0.14, 0.09, 0, 'triangle');
  blip(311, 0.16, 0.08, 0.09, 'triangle');
  blip(233, 0.24, 0.08, 0.18, 'triangle');
}


/** Ton mit Tonhoehenverlauf - fuer Wischer, Glanz und Zerfall. */
function glide(
  from: number,
  to: number,
  duration: number,
  gain: number,
  when = 0,
  type: OscillatorType = 'sine',
): void {
  if (!ctx || !master || volume === 0) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// --- Karten -----------------------------------------------------------------
//
// PLATZHALTER wie die Karteneffekte: sie tragen die Wahl, solange es keine
// gezeichneten Karten und keinen richtigen Klang dafuer gibt.

/** Kartenwahl oeffnet: drei Karten werden ausgeteilt - drei Wischer. */
export function playCardDeal(): void {
  for (let i = 0; i < 3; i++) {
    const t = 0.08 + i * 0.13;
    noise(0.09, 2600, 0.22, t);
    glide(900, 1400, 0.08, 0.05, t, 'triangle');
  }
}

/** Zeiger ueber einer Karte: leise, aber hoerbar. */
let letzteKarte = 0;
export function playCardHover(): void {
  const jetzt = performance.now();
  if (jetzt - letzteKarte < 60) return;
  letzteKarte = jetzt;
  blip(1320, 0.05, 0.035, 0, 'triangle');
}

/**
 * Karte genommen - je seltener, desto groesser.
 *
 * Gewoehnlich ein Anschlag, dann mit jeder Stufe eine Note mehr; ab episch ein
 * Schimmern darueber, legendaer dazu Pauke und Grundton. Die Stufe soll man
 * hoeren, bevor man den Rahmen gesehen hat.
 */
export function playCardPick(stufe: number): void {
  const st = Math.max(0, Math.min(4, stufe));
  const grund = [392, 440, 523, 587, 659][st]!;
  const leiter = [1, 1.25, 1.5, 2, 2.5, 3];
  const noten = 2 + st;
  noise(0.06, 1800, 0.18, 0);
  for (let i = 0; i < noten; i++) {
    blip(grund * leiter[i]!, 0.22 + st * 0.04, 0.12, i * 0.07, i % 2 ? 'triangle' : 'sine');
  }
  if (st >= 3) {
    glide(1800, 3600, 0.5, 0.045, noten * 0.07, 'sine');
    for (let i = 0; i < 5; i++) blip(2400 + i * 300, 0.06, 0.03, noten * 0.07 + 0.1 + i * 0.06, 'triangle');
  }
  if (st === 4) {
    noise(0.35, 140, 0.4, 0);
    blip(grund / 2, 0.7, 0.14, 0.02, 'triangle');
  }
}

/** Die nicht gewaehlten Karten zerfallen. */
export function playCardVanish(): void {
  glide(700, 180, 0.35, 0.05, 0.05, 'sawtooth');
  noise(0.3, 900, 0.1, 0.05);
}

// --- Verteidigung -----------------------------------------------------------

/** Ein Ritter bezieht Wache: Metall auf Metall, dann ein tiefer Schritt. */
export function playGuard(): void {
  blip(1046, 0.25, 0.1, 0, 'square');
  blip(1397, 0.3, 0.07, 0.01, 'triangle');
  noise(0.08, 3800, 0.2, 0);
  blip(262, 0.18, 0.12, 0.08, 'triangle');
}

/**
 * Pluenderung abgewehrt: Schwertklang, dann ein aufsteigender Ruf.
 *
 * Aufsteigend, wo die Pluenderung absteigt - dieselbe Sprache wie Ertrag gegen
 * Verlust.
 */
export function playDefend(): void {
  noise(0.12, 4200, 0.28, 0);
  blip(880, 0.3, 0.09, 0, 'square');
  blip(1175, 0.35, 0.06, 0.02, 'triangle');
  blip(392, 0.14, 0.12, 0.2, 'triangle');
  blip(523, 0.14, 0.12, 0.3, 'triangle');
  blip(784, 0.3, 0.12, 0.4, 'triangle');
}

// --- Heer -------------------------------------------------------------------

/** Ein Raubzug bricht auf: dumpfe Trommel, drei Schlaege. */
export function playMarch(): void {
  for (let i = 0; i < 3; i++) {
    noise(0.18, 110, 0.45, i * 0.22);
    blip(82, 0.2, 0.14, i * 0.22, 'sine');
  }
}

/** Eine Ruine wird erkundet: ein fallender, hallender Ton, dann ein Schimmer. */
export function playRuin(): void {
  glide(660, 330, 0.6, 0.06, 0, 'triangle');
  blip(988, 0.4, 0.04, 0.35, 'sine');
  blip(1318, 0.5, 0.03, 0.45, 'sine');
}
