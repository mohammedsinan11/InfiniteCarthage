/**
 * Umgebungsgeraeusche - die Welt klingt, auch wenn niemand etwas tut.
 *
 * Zwei liegende Schichten und eine Handvoll Einzelklaenge, alles im Browser
 * erzeugt wie audio.ts:
 *
 *   Wind    tiefes, gefiltertes Rauschen mit langsamen Boeen - staerker bei
 *           Wolken, Schnee und Sturm, nachts ein wenig mehr
 *   Regen   helles Rauschen bei Regen und Gewitter, dazu einzelne Tropfen
 *   Voegel  morgens und tagsueber, nicht bei Regen und nicht im Winter
 *   Grillen abends und nachts, ebenso
 *   Eule    selten, nachts
 *   Feuer   Knistern, solange auf der Karte etwas brennt
 *   Hammer  hin und wieder tagsueber, fern, aus einem Dorf
 *
 * Game.tsx meldet Tageszeit, Wetter und Feuer (setAmbiente); verlaesst man die
 * Partie, blendet alles aus. PLATZHALTER (ASSETS.md) - echte Aufnahmen tragen
 * hier mehr als bei jedem anderen Klang.
 */

import { audioKontext, initAudio } from './audio';
import type { Tageszeit, Wetter } from '../core/zeit';

const KEY = 'infinitecarthage.umgebung';
/** Grundpegel ueber dem Regler. */
const PEGEL = 1.6;

export type AmbienteLage = {
  tageszeit: Tageszeit;
  wetter: Wetter;
  /** Wie viele Feuer brennen. */
  feuer: number;
  winter: boolean;
  /** Laeuft eine Partie? Sonst ist es still. */
  aktiv: boolean;
};

let lautstaerke = laden();
let lage: AmbienteLage = { tageszeit: 'tag', wetter: 'klar', feuer: 0, winter: false, aktiv: false };

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let windPegel: GainNode | null = null;
let regenPegel: GainNode | null = null;
let takt: number | null = null;

function laden(): number {
  try {
    const v = Number(localStorage.getItem(KEY) ?? 'x');
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.6;
  } catch {
    return 0.6;
  }
}

/** Rauschen als Puffer. braun: weicher, tiefer - fuer Wind. */
function rauschPuffer(c: AudioContext, braun: boolean): AudioBuffer {
  const n = Math.floor(c.sampleRate * 4);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  let letzter = 0;
  for (let i = 0; i < n; i++) {
    const weiss = Math.random() * 2 - 1;
    if (braun) {
      letzter = (letzter + 0.02 * weiss) / 1.02;
      d[i] = letzter * 3.5;
    } else {
      d[i] = weiss;
    }
  }
  return buf;
}

function schleife(c: AudioContext, puffer: AudioBuffer): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = puffer;
  src.loop = true;
  src.start();
  return src;
}

/** Die liegenden Schichten einmal aufbauen - erst, wenn der Browser Ton erlaubt. */
function aufbauen(): boolean {
  initAudio();
  const c = audioKontext();
  if (!c) return false;
  if (ctx === c && bus) return true;
  ctx = c;
  bus = c.createGain();
  bus.gain.value = lautstaerke * PEGEL;
  bus.connect(c.destination);

  // Wind: braunes Rauschen durch einen wandernden Tiefpass, dazu Boeen.
  const wind = schleife(c, rauschPuffer(c, true));
  const windFilter = c.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 420;
  windFilter.Q.value = 0.8;
  const wandern = c.createOscillator();
  wandern.frequency.value = 0.07;
  const wandernTiefe = c.createGain();
  wandernTiefe.gain.value = 220;
  wandern.connect(wandernTiefe).connect(windFilter.frequency);
  wandern.start();
  const boeen = c.createGain();
  boeen.gain.value = 0.75;
  const boeenLfo = c.createOscillator();
  boeenLfo.frequency.value = 0.13;
  const boeenTiefe = c.createGain();
  boeenTiefe.gain.value = 0.35;
  boeenLfo.connect(boeenTiefe).connect(boeen.gain);
  boeenLfo.start();
  windPegel = c.createGain();
  windPegel.gain.value = 0;
  wind.connect(windFilter).connect(boeen).connect(windPegel).connect(bus);

  // Regen: weisses Rauschen, oben und unten beschnitten.
  const regen = schleife(c, rauschPuffer(c, false));
  const hoch = c.createBiquadFilter();
  hoch.type = 'highpass';
  hoch.frequency.value = 1100;
  const tief = c.createBiquadFilter();
  tief.type = 'lowpass';
  tief.frequency.value = 6500;
  regenPegel = c.createGain();
  regenPegel.gain.value = 0;
  regen.connect(hoch).connect(tief).connect(regenPegel).connect(bus);
  return true;
}

// --- Einzelklaenge ---------------------------------------------------------------

function ton(freq: number, bis: number, dauer: number, pegel: number, wann = 0, art: OscillatorType = 'sine'): void {
  if (!ctx || !bus) return;
  const t = ctx.currentTime + wann;
  const osc = ctx.createOscillator();
  osc.type = art;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(bis, t + dauer);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pegel, t + Math.min(0.02, dauer / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + dauer + 0.02);
}

function knack(dauer: number, freq: number, pegel: number, wann = 0): void {
  if (!ctx || !bus) return;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dauer));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.value = pegel;
  src.connect(bp).connect(g).connect(bus);
  src.start(ctx.currentTime + wann);
}

function vogel(): void {
  const grund = 2200 + Math.random() * 1400;
  const rufe = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < rufe; i++) {
    const hoch = grund * (1 + Math.random() * 0.25);
    ton(hoch, hoch * (Math.random() < 0.5 ? 1.3 : 0.8), 0.07, 0.035, i * (0.08 + Math.random() * 0.05));
  }
}

function grille(): void {
  for (let i = 0; i < 3; i++) ton(4300, 4250, 0.028, 0.012, i * 0.045, 'triangle');
}

function eule(): void {
  ton(410, 370, 0.32, 0.05, 0);
  ton(400, 350, 0.55, 0.045, 0.5);
}

function knistern(): void {
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) knack(0.015 + Math.random() * 0.03, 1800 + Math.random() * 2600, 0.09, i * 0.05);
}

function hammer(): void {
  for (let i = 0; i < 3; i++) {
    knack(0.035, 1700, 0.05, i * 0.38);
    ton(560, 500, 0.08, 0.018, i * 0.38, 'triangle');
  }
}

function tropfen(): void {
  const f = 1100 + Math.random() * 1200;
  ton(f, f * 1.6, 0.03, 0.012);
}

/** Viermal je Sekunde: welche Einzelklaenge jetzt kommen. */
function ticken(): void {
  if (!ctx || !bus || !lage.aktiv || lautstaerke === 0) return;
  const { tageszeit, wetter, feuer, winter } = lage;
  const nass = wetter === 'regen' || wetter === 'gewitter';
  const kalt = winter || wetter === 'schnee';
  const hell = tageszeit === 'morgen' || tageszeit === 'tag';
  const dunkel = tageszeit === 'abend' || tageszeit === 'nacht';
  const zufall = Math.random;

  if (hell && !nass && !kalt && zufall() < (tageszeit === 'morgen' ? 0.1 : 0.05)) vogel();
  if (dunkel && !nass && !kalt && zufall() < 0.16) grille();
  if (tageszeit === 'nacht' && zufall() < 0.01) eule();
  if (feuer > 0 && zufall() < Math.min(0.7, 0.25 * feuer)) knistern();
  if (hell && !nass && zufall() < 0.012) hammer();
  if (nass && zufall() < 0.25) tropfen();
}

/** Wie laut Wind und Regen liegen sollen. */
function schichten(): void {
  if (!ctx || !windPegel || !regenPegel) return;
  const { tageszeit, wetter, aktiv } = lage;
  let wind = { klar: 0.12, wolkig: 0.28, regen: 0.3, gewitter: 0.6, schnee: 0.35, nebel: 0.18 }[wetter];
  if (tageszeit === 'nacht') wind += 0.08;
  const regen = wetter === 'regen' ? 0.4 : wetter === 'gewitter' ? 0.65 : 0;
  const t = ctx.currentTime;
  // Langsam ueberblenden - Wetter zieht auf, es springt nicht.
  windPegel.gain.setTargetAtTime(aktiv ? wind : 0, t, 2.5);
  regenPegel.gain.setTargetAtTime(aktiv ? regen : 0, t, 2.5);
}

/** Aus Game.tsx: was draussen los ist. */
export function setAmbiente(neu: AmbienteLage): void {
  lage = neu;
  if (!neu.aktiv) {
    schichten();
    if (takt !== null) {
      window.clearInterval(takt);
      takt = null;
    }
    return;
  }
  // Vor der ersten Freigabe gibt es keinen laufenden Kontext - dann spaeter.
  const c = audioKontext();
  if (!c || c.state !== 'running' || !aufbauen()) return;
  schichten();
  if (takt === null) takt = window.setInterval(ticken, 250);
}

export function getUmgebungVolume(): number {
  return lautstaerke;
}

export function setUmgebungVolume(v: number): void {
  lautstaerke = Math.min(1, Math.max(0, v));
  if (bus && ctx) bus.gain.setTargetAtTime(lautstaerke * PEGEL, ctx.currentTime, 0.05);
  try {
    localStorage.setItem(KEY, String(lautstaerke));
  } catch {
    // Privater Modus.
  }
}

/** Nach der Tonfreigabe: die zuletzt gemeldete Lage hoerbar machen. */
export function ambienteFreigeben(): void {
  setAmbiente(lage);
}
