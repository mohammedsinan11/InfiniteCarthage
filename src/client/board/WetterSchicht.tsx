/**
 * Die Wetterschicht: ein WebGL-Shader ueber dem Gelaende.
 *
 * Ein einziges Rechteck, auf dem ein Fragment-Shader Licht und Wetter malt:
 * Wolkenschatten, Morgen- und Abendlicht, die Nacht mit ihren Lichtern, Sonne,
 * Nebel, Regen, Schnee und Blitze. Er deckt das Gelaende nur ab - er liest es
 * nicht -, deshalb geht alles als halbdurchsichtige Schicht, deren Loecher die
 * Lichtquellen sind.
 *
 * PIXELGENAU UND BILLIG. Die Schicht rechnet nicht in Geraetepixeln, sondern in
 * Kunstpixeln: das Canvas ist so klein, dass ein Bildpunkt einem Kunstpixel der
 * Kacheln entspricht, und wird pixelig hochskaliert. Regen, Lichtringe und
 * Nebel bekommen so dieselben Treppenstufen wie die Karte - und der Shader
 * rechnet ein Sechzehntel der Punkte.
 *
 * Tageszeit und Wetter wechseln nicht hart: die Werte gleiten ueber gut eine
 * Sekunde zum neuen Ziel. Wer Bewegung reduziert haben will, bekommt keine
 * Blitze und langsameren Niederschlag. PLATZHALTER (ASSETS.md).
 */

import { useEffect, useRef } from 'react';
import type { Tageszeit, Wetter } from '../../core/zeit';
import { playDonner } from '../audio';

/** Mehr Lichter nimmt der Shader nicht - die naechsten zur Bildmitte zuerst. */
export const MAX_LICHTER = 48;

/** Eine Lichtquelle in Geraetepixeln. waerme: wie stark sie orange scheint. */
export type Licht = { x: number; y: number; r: number; waerme: number };

type Props = {
  /** Groesse des Bretts in CSS-Pixeln. */
  breite: number;
  hoehe: number;
  dpr: number;
  /** Geraetepixel je Kunstpixel. */
  pixel: number;
  /** Ausschnitt in Geraetepixeln - Wolken und Nebel haften am Boden. */
  kamera: { x: number; y: number };
  tageszeit: Tageszeit;
  wetter: Wetter;
  lichter: readonly Licht[];
};

type Werte = {
  nacht: number;
  tint: number;
  farbe: [number, number, number];
  wolken: number;
  regen: number;
  schnee: number;
  nebel: number;
  sonne: number;
};

function zielWerte(tageszeit: Tageszeit, wetter: Wetter): Werte {
  const w: Werte = { nacht: 0, tint: 0, farbe: [1, 1, 1], wolken: 0, regen: 0, schnee: 0, nebel: 0, sonne: 0 };
  switch (tageszeit) {
    case 'morgen':
      w.nacht = 0.12;
      w.tint = 0.1;
      w.farbe = [1, 0.72, 0.5];
      break;
    case 'abend':
      w.nacht = 0.38;
      w.tint = 0.16;
      w.farbe = [1, 0.45, 0.25];
      break;
    case 'nacht':
      w.nacht = 1;
      w.tint = 0.05;
      w.farbe = [0.35, 0.45, 0.8];
      break;
    default:
      break;
  }
  switch (wetter) {
    case 'klar':
      w.wolken = 0.15;
      if (tageszeit !== 'nacht') w.sonne = 1;
      break;
    case 'wolkig':
      w.wolken = 0.85;
      break;
    case 'regen':
      w.wolken = 1;
      w.regen = 0.8;
      w.nacht = Math.min(1, w.nacht + 0.18);
      break;
    case 'gewitter':
      w.wolken = 1;
      w.regen = 1;
      w.nacht = Math.min(1, w.nacht + 0.3);
      break;
    case 'schnee':
      w.wolken = 0.6;
      w.schnee = 1;
      break;
    case 'nebel':
      w.wolken = 0.3;
      w.nebel = 0.85;
      break;
  }
  return w;
}

const mischen = (a: Werte, b: Werte, k: number): Werte => {
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    nacht: m(a.nacht, b.nacht),
    tint: m(a.tint, b.tint),
    farbe: [m(a.farbe[0], b.farbe[0]), m(a.farbe[1], b.farbe[1]), m(a.farbe[2], b.farbe[2])],
    wolken: m(a.wolken, b.wolken),
    regen: m(a.regen, b.regen),
    schnee: m(a.schnee, b.schnee),
    nebel: m(a.nebel, b.nebel),
    sonne: m(a.sonne, b.sonne),
  };
};

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision mediump float;
uniform vec2 uGroesse;
uniform float uZeit;
uniform vec2 uKamera;
uniform float uNacht;
uniform float uTint;
uniform vec3 uTintFarbe;
uniform float uWolken;
uniform float uRegen;
uniform float uSchnee;
uniform float uNebel;
uniform float uSonne;
uniform float uBlitz;
uniform float uBlitzX;
uniform float uBlitzSaat;
uniform int uAnzahl;
uniform vec4 uLichter[${MAX_LICHTER}];

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rausch(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * rausch(p); p *= 2.03; a *= 0.5; }
  return s;
}
// Eine Schicht vorgemischt ueber die bisherigen legen.
vec4 ueber(vec4 acc, vec3 farbe, float a) {
  a = clamp(a, 0.0, 1.0);
  return vec4(farbe * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a));
}

void main() {
  // In Kunstpixeln, y nach unten wie auf dem Brett.
  vec2 pix = floor(vec2(gl_FragCoord.x, uGroesse.y - gl_FragCoord.y));
  vec2 welt = pix + uKamera;
  vec4 acc = vec4(0.0);

  // Wolkenschatten: am Boden verankert, ziehen langsam.
  float w = fbm(welt / 70.0 + vec2(uZeit * 0.02, uZeit * 0.006));
  acc = ueber(acc, vec3(0.04, 0.05, 0.09), smoothstep(0.5, 0.75, w) * uWolken * 0.3);

  // Lichtquellen: die hellste zaehlt, sie flackert, und sie leuchtet in Stufen.
  float licht = 0.0;
  float waerme = 0.0;
  for (int i = 0; i < ${MAX_LICHTER}; i++) {
    if (i >= uAnzahl) break;
    vec4 l = uLichter[i];
    float flackern = 0.93 + 0.05 * sin(uZeit * 9.0 + float(i) * 2.3) + 0.03 * sin(uZeit * 21.0 + float(i) * 5.1);
    float b = clamp(1.0 - length(pix - l.xy) / max(1.0, l.z * flackern), 0.0, 1.0);
    if (b > licht) { licht = b; waerme = l.w; }
  }
  float stufe = floor(licht * 4.0 + 0.5) / 4.0;

  // Nacht mit Lichtloechern, Tageslichttoenung, warmer Schein.
  acc = ueber(acc, vec3(0.02, 0.03, 0.09), uNacht * (0.7 - 0.62 * stufe));
  acc = ueber(acc, uTintFarbe, uTint * (1.0 - 0.6 * stufe));
  acc = ueber(acc, vec3(1.0, 0.62, 0.24), stufe * uNacht * 0.2 * waerme);

  // Sonne: breite, langsam wandernde Lichtbahnen.
  float bahn = sin((pix.x + pix.y * 0.6) / 36.0 + uZeit * 0.2) * 0.5 + 0.5;
  acc = ueber(acc, vec3(1.0, 0.93, 0.62), uSonne * smoothstep(0.72, 1.0, bahn) * 0.08);

  // Nebel: am Boden, treibt.
  float n = fbm(welt / 45.0 + vec2(uZeit * 0.05, uZeit * 0.01));
  acc = ueber(acc, vec3(0.78, 0.8, 0.85), uNebel * smoothstep(0.35, 0.8, n) * 0.55);

  // Regen: schraege Striche, jede dritte Spalte, verschieden schnell.
  if (uRegen > 0.01) {
    vec2 r = pix;
    r.x += floor(r.y * 0.35);
    float spalte = floor(r.x / 3.0);
    float z = hash(vec2(spalte, 3.1));
    float y = r.y - uZeit * (110.0 + 70.0 * z) - z * 500.0;
    float zelle = mod(y, 26.0 + 19.0 * z);
    float tropfen = step(zelle, 4.0) * step(mod(r.x, 3.0), 0.5) * step(0.3, z);
    acc = ueber(acc, vec3(0.72, 0.8, 0.92), tropfen * uRegen * 0.55);
  }

  // Schnee: einzelne Flocken, langsam und leicht pendelnd.
  if (uSchnee > 0.01) {
    vec2 s = pix;
    s.x += floor(sin(uZeit * 1.1 + floor(s.y / 23.0)) * 1.5);
    float spalte = floor(s.x / 5.0);
    float z = hash(vec2(spalte, 9.7));
    float y = s.y - uZeit * (14.0 + 10.0 * z) - z * 300.0;
    float zelle = mod(y, 31.0 + 23.0 * z);
    float flocke = step(zelle, 1.0) * step(mod(s.x, 5.0), 0.5) * step(0.25, z);
    acc = ueber(acc, vec3(0.97, 0.98, 1.0), flocke * uSchnee * 0.9);
  }

  // Blitz: das ganze Bild hellt auf, ein gezackter Strahl faehrt herab.
  if (uBlitz > 0.01) {
    acc = ueber(acc, vec3(0.88, 0.93, 1.0), uBlitz * 0.32);
    float bx = uBlitzX + floor((fbm(vec2(pix.y / 9.0, uBlitzSaat)) - 0.5) * 60.0);
    float strahl = step(abs(pix.x - bx), 0.6) * step(pix.y, uGroesse.y * 0.6);
    acc = ueber(acc, vec3(1.0, 1.0, 0.95), strahl * min(1.0, uBlitz * 1.6));
  }

  gl_FragColor = acc;
}
`;

function baue(gl: WebGLRenderingContext): WebGLProgram | null {
  const shader = (art: number, quelle: string) => {
    const s = gl.createShader(art)!;
    gl.shaderSource(s, quelle);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('Wetterschicht:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const v = shader(gl.VERTEX_SHADER, VERTEX);
  const f = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('Wetterschicht:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

export function WetterSchicht(props: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const aktuell = useRef(props);
  aktuell.current = props;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) return; // Ohne WebGL eben ohne Wetter - das Spiel laeuft trotzdem.
    const prog = baue(gl);
    if (!prog) return;
    gl.useProgram(prog);

    const puffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, puffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const loc = {
      groesse: u('uGroesse'),
      zeit: u('uZeit'),
      kamera: u('uKamera'),
      nacht: u('uNacht'),
      tint: u('uTint'),
      tintFarbe: u('uTintFarbe'),
      wolken: u('uWolken'),
      regen: u('uRegen'),
      schnee: u('uSchnee'),
      nebel: u('uNebel'),
      sonne: u('uSonne'),
      blitz: u('uBlitz'),
      blitzX: u('uBlitzX'),
      blitzSaat: u('uBlitzSaat'),
      anzahl: u('uAnzahl'),
      lichter: u('uLichter[0]'),
    };

    const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const beginn = performance.now();
    let letzte = beginn;
    let werte = zielWerte(aktuell.current.tageszeit, aktuell.current.wetter);
    const blitz = { naechster: beginn + 3000 + Math.random() * 4000, start: -1e9, x: 0, saat: 0 };
    const lichtDaten = new Float32Array(MAX_LICHTER * 4);
    let id = 0;

    const bild = (jetzt: number) => {
      const p = aktuell.current;
      werte = mischen(werte, zielWerte(p.tageszeit, p.wetter), 1 - Math.exp(-(jetzt - letzte) / 1200));
      letzte = jetzt;

      const w = Math.max(1, Math.ceil((p.breite * p.dpr) / p.pixel));
      const h = Math.max(1, Math.ceil((p.hoehe * p.dpr) / p.pixel));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);

      let blitzWert = 0;
      if (p.wetter === 'gewitter' && !ruhig) {
        if (jetzt >= blitz.naechster) {
          blitz.start = jetzt;
          blitz.x = Math.random() * w;
          blitz.saat = Math.random() * 100;
          blitz.naechster = jetzt + 5000 + Math.random() * 7000;
          // Erst das Licht, dann der Donner.
          window.setTimeout(playDonner, 250 + Math.random() * 900);
        }
        const t = jetzt - blitz.start;
        blitzWert = t < 70 ? 1 : t < 140 ? 0.15 : t < 230 ? 0.8 : t < 700 ? 0.6 * (1 - (t - 230) / 470) : 0;
      }

      const anzahl = Math.min(MAX_LICHTER, p.lichter.length);
      for (let i = 0; i < anzahl; i++) {
        const l = p.lichter[i]!;
        lichtDaten[i * 4] = l.x / p.pixel;
        lichtDaten[i * 4 + 1] = l.y / p.pixel;
        lichtDaten[i * 4 + 2] = l.r / p.pixel;
        lichtDaten[i * 4 + 3] = l.waerme;
      }

      gl.uniform2f(loc.groesse, w, h);
      gl.uniform1f(loc.zeit, ((jetzt - beginn) / 1000) * (ruhig ? 0.3 : 1));
      gl.uniform2f(loc.kamera, p.kamera.x / p.pixel, p.kamera.y / p.pixel);
      gl.uniform1f(loc.nacht, werte.nacht);
      gl.uniform1f(loc.tint, werte.tint);
      gl.uniform3f(loc.tintFarbe, ...werte.farbe);
      gl.uniform1f(loc.wolken, werte.wolken);
      gl.uniform1f(loc.regen, werte.regen);
      gl.uniform1f(loc.schnee, werte.schnee);
      gl.uniform1f(loc.nebel, werte.nebel);
      gl.uniform1f(loc.sonne, werte.sonne);
      gl.uniform1f(loc.blitz, blitzWert);
      gl.uniform1f(loc.blitzX, blitz.x);
      gl.uniform1f(loc.blitzSaat, blitz.saat);
      gl.uniform1i(loc.anzahl, anzahl);
      gl.uniform4fv(loc.lichter, lichtDaten);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      id = requestAnimationFrame(bild);
    };
    id = requestAnimationFrame(bild);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <canvas
      ref={ref}
      className="wetter-schicht"
      style={{ width: props.breite, height: props.hoehe }}
      aria-hidden="true"
    />
  );
}
