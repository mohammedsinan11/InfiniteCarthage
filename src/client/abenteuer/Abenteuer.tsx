/**
 * Der Abenteuer-Modus im Bild (src/abenteuer/regeln.ts).
 *
 * Die Karte fuellt den Schirm, der Ritter steht in der Mitte. Darum herum:
 *   rechts unten   der Spieltisch mit dem Wuerfel, darueber das Inventar
 *   links unten    die Steuerung - die sieben Tasten, zugleich Knoepfe zum Tippen
 *   links          die Ausruestung
 *   rechts oben    die Uebersichtskarte
 * Die Kacheln und Figuren sind dieselben wie in der Strategie (client/tiles.ts,
 * client/units.ts), damit beide Modi wie ein Spiel aussehen.
 *
 * BEWEGUNG. Jede Aktion liefert ihre Ereignisse Takt fuer Takt (regeln.ts:
 * Ereignis). Das Bild spielt sie ab: der Ritter geht, die Schleime huepfen,
 * Hiebe stossen vor, Treffer blitzen, Zahlen steigen auf. Ohne Aktion atmen
 * Ritter und Schleime vor sich hin.
 *
 * TIPPEN. Auf dem Handy (und mit der Maus) waehlt man ein Feld: ein Nachbar
 * ist ein Schritt, ein fernes Feld ein Weg, den der Ritter Schritt fuer
 * Schritt geht - bis ein Schleim ihm zu nahe kommt. Den Ritter antippen heisst
 * warten, vor dem Wurf heisst Tippen wuerfeln.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  BOSS_LEBEN,
  SLOTS,
  SLOT_NAME,
  TASTEN,
  TASTE_NAME,
  angriffVon,
  abwehrVon,
  benutzen,
  betretbar,
  fundAuf,
  gegenstand,
  lebenText,
  maxLebenVon,
  neuesAbenteuer,
  normalisiere,
  richtungFuer,
  schrittBonusVon,
  schrittKosten,
  sichtVon,
  taste,
  tasteZu,
  weltVon,
  wuerfeln,
  zugBeenden,
} from '../../abenteuer/regeln';
import type { Abenteuer as Zustand, Ereignis, Slot, Taste, Wer } from '../../abenteuer/regeln';
import { HEX_DIRS, hexDistance, hexKey, hexesInRange } from '../../core/coords';
import type { Hex } from '../../core/coords';
import { tileAt } from '../../core/world';
import type { Terrain } from '../../core/types';
import { HEX_CX, HEX_CY, IMG_H, IMG_W, kachelEcke, preloadTiles, tileImage, tileImageFog, tileUrl } from '../tiles';
import { preloadUnitSprites, zeichneFigur } from '../units';
import { PIX, Px } from '../ui/KartenPixel';
import { musikAn, setzeMusik, starteMusik, stoppeMusik } from './musik';
import { RITTER_HAND, RITTER_KOERPER, RITTER_SCHRITT, SCHLEIMKOENIG, SYMBOL, WAFFE, WAFFE_GRIFF, zeichnePixel } from './symbole';
import { LAUT_STUFEN, klang, lautstaerke, setzeLautstaerke } from './musik';
import type { Klang } from './musik';

const SPEICHER = 'infinitecarthage.abenteuer';
const AUTOROLL = 'infinitecarthage.abenteuer.autoroll';

function leseAutoroll(): boolean {
  try {
    return localStorage.getItem(AUTOROLL) === 'an';
  } catch {
    return false;
  }
}
/** So lange dauert ein Tick der Spieluhr im Bild. */
const TAKT_MS = 170;
/** So lange steigen Zahlen noch nach ihrem Takt auf (in Takten). */
const NACHKLANG = 5;
/** So lange rollt der Wuerfel. */
const ROLL_MS = 850;
/** Faecher im Inventar - es steht immer da, auch leer. */
const FAECHER = 12;

function lade(): Zustand | null {
  try {
    const t = localStorage.getItem(SPEICHER);
    if (!t) return null;
    return normalisiere(JSON.parse(t) as Zustand);
  } catch {
    return null;
  }
}
function speichere(a: Zustand): void {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify({ ...a, ereignisse: [] }));
  } catch {
    // Privater Modus - dann ohne Fortsetzen.
  }
}

const neuerSeed = () => (Math.random() * 2 ** 31) | 0;

/** Pfeil je Taste fuer die Steuerung. */
const PFEIL: Record<Taste, string> = { q: '↖', e: '↗', a: '←', s: 'z', d: '→', z: '↙', x: '↘' };
/** Die Steuerung als Sechseck: Q E oben, A S D in der Mitte, Z X unten. */
const REIHEN: Taste[][] = [
  ['q', 'e'],
  ['a', 's', 'd'],
  ['z', 'x'],
];

/** Was in einen leeren Slot gehoert - blass gezeigt. */
const SLOT_BILD: Record<Slot, string> = {
  waffe: 'schwert',
  schild: 'schild',
  kopf: 'helm',
  koerper: 'ruestung',
  fuesse: 'stiefel',
  zubehoer: 'laterne',
};

const MINI_FARBE: Record<Terrain, string> = {
  forest: '#3f6b32',
  pasture: '#7cb15a',
  field: '#d9b84a',
  hill: '#b4633c',
  mountain: '#857e70',
  desert: '#d8c8a8',
  water: '#3a6a9a',
};

// --- Hilfen fuer Bild und Weg ----------------------------------------------

/** Mitte eines Feldes in Kunstpixeln. */
function mitte(q: number, r: number): { x: number; y: number } {
  const e = kachelEcke(q, r);
  return { x: e.x + HEX_CX, y: e.y + HEX_CY };
}

/** Das Feld unter einem Punkt in Kunstpixeln. */
function feldBei(x: number, y: number): Hex {
  const r0 = Math.round((y - HEX_CY + 19) / 17);
  let best: Hex = { q: 0, r: r0 };
  let bestD = Infinity;
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    const q0 = Math.round((x - Math.ceil(11.5 * r)) / 23);
    for (let q = q0 - 1; q <= q0 + 1; q++) {
      const m = mitte(q, r);
      const d = (m.x - x) ** 2 + (m.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { q, r };
      }
    }
  }
  return best;
}

/**
 * Der kuerzeste Weg zu einem erkundeten Feld (ohne Startfeld). Schleime
 * versperren den Weg - ausser dem Zielfeld selbst: dann endet der Weg mit dem
 * Hieb auf ihn. Berge kosten zwei.
 */
function wegZu(a: Zustand, ziel: Hex): Hex[] {
  const zielK = hexKey(ziel.q, ziel.r);
  const erkundet = new Set(a.erkundet);
  if (!erkundet.has(zielK)) return [];
  const besetzt = new Set(a.schleime.map((s) => hexKey(s.q, s.r)));
  const kosten = new Map<string, number>([[hexKey(a.pos.q, a.pos.r), 0]]);
  const vor = new Map<string, Hex>();
  const offen: { h: Hex; k: number }[] = [{ h: a.pos, k: 0 }];
  while (offen.length > 0) {
    offen.sort((x, y) => x.k - y.k);
    const { h, k } = offen.shift()!;
    const hk = hexKey(h.q, h.r);
    if (hk === zielK) break;
    if (k > (kosten.get(hk) ?? Infinity) || k > 24) continue;
    for (const [dq, dr] of HEX_DIRS) {
      const n = { q: h.q + dq, r: h.r + dr };
      const nk = hexKey(n.q, n.r);
      if (!erkundet.has(nk) || !betretbar(a, n.q, n.r)) continue;
      if (besetzt.has(nk) && nk !== zielK) continue;
      const nk2 = k + (besetzt.has(nk) ? 1 : schrittKosten(a, n.q, n.r));
      if (nk2 < (kosten.get(nk) ?? Infinity)) {
        kosten.set(nk, nk2);
        vor.set(nk, h);
        offen.push({ h: n, k: nk2 });
      }
    }
  }
  if (!vor.has(zielK)) return [];
  const weg: Hex[] = [];
  let h: Hex = ziel;
  while (h.q !== a.pos.q || h.r !== a.pos.r) {
    weg.unshift(h);
    h = vor.get(hexKey(h.q, h.r))!;
  }
  return weg;
}

const letzterTakt = (ev: readonly Ereignis[]) => ev.reduce((m, e) => Math.max(m, e.takt), -1);
const sanft = (u: number) => u * u * (3 - 2 * u);
const klemme = (u: number) => Math.max(0, Math.min(1, u));

// --- Kleine Bilder -----------------------------------------------------------

function Icon({ id, groesse = 22 }: { id: string; groesse?: number }) {
  const karte = SYMBOL[id];
  if (!karte) return null;
  const b = Math.max(...karte.map((z) => z.length));
  return (
    <svg width={groesse} height={groesse} viewBox={`0 0 ${b} ${karte.length}`} shapeRendering="crispEdges" aria-hidden>
      <Px karte={karte} />
    </svg>
  );
}

/** Lautsprecher mit Wellen oder mit Kreuz - wie in der Strategie. */
function TonSymbol({ aus }: { aus: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 6 H5 L9 2 V14 L5 10 H2 Z" fill="currentColor" />
      {aus ? (
        <path d="M11 5 L15 11 M15 5 L11 11" stroke="currentColor" strokeWidth={1.6} />
      ) : (
        <path d="M11 5 Q13 8 11 11 M13 3 Q16 8 13 13" stroke="currentColor" strokeWidth={1.4} fill="none" />
      )}
    </svg>
  );
}

const AUGEN: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/**
 * Der Wuerfel: er taumelt ueber den Tisch, die Augen flackern immer langsamer
 * durch, dann landet er mit einem Ruck, Staub und einem goldenen Schein.
 */
function Wuerfel({ n, wurfNr, matt }: { n: number | null; wurfNr: number; matt: boolean }) {
  const [gezeigt, setGezeigt] = useState<number | null>(n);
  const [stand, setStand] = useState<'ruht' | 'rollt' | 'landet'>('ruht');
  const ziel = useRef(n);
  ziel.current = n;
  useEffect(() => {
    if (wurfNr === 0) return;
    let i = 0;
    let t = 0;
    setStand('rollt');
    const schritt = () => {
      i += 1;
      if (i >= 9) {
        setGezeigt(ziel.current);
        setStand('landet');
        t = window.setTimeout(() => setStand('ruht'), 650);
        return;
      }
      setGezeigt((alt) => {
        let neu = 1 + Math.floor(Math.random() * 6);
        if (neu === alt) neu = (neu % 6) + 1;
        return neu;
      });
      t = window.setTimeout(schritt, 38 + i * i * 2.6);
    };
    schritt();
    return () => window.clearTimeout(t);
  }, [wurfNr]);
  const augen = gezeigt ? AUGEN[gezeigt]! : [];
  return (
    <div className={`ab-wuerfel-platz ${stand}${matt && stand === 'ruht' ? ' matt' : ''}`}>
      <span className="ab-wuerfel-schatten" />
      <svg className="ab-wuerfel" viewBox="0 0 32 32" shapeRendering="crispEdges" aria-label={gezeigt ? `Wurf ${gezeigt}` : 'Wuerfel'}>
        {/* Koerper mit abgeschraegten Ecken, Licht oben links, Schatten unten rechts. */}
        <path d="M5 2 H27 V3 H29 V5 H30 V27 H29 V29 H27 V30 H5 V29 H3 V27 H2 V5 H3 V3 H5 Z" fill="#2a1f16" />
        <path d="M5 4 H27 V5 H28 V27 H27 V28 H5 V27 H4 V5 H5 Z" fill="#f2e7d0" />
        <path d="M5 4 H27 V6 H6 V27 H4 V5 H5 Z" fill="#fffaf0" />
        <path d="M28 7 V27 H27 V28 H7 V26 H26 V7 Z" fill="#cdb68e" />
        {augen.map(([x, y], i) => (
          <rect key={i} x={7 + x * 7} y={7 + y * 7} width="5" height="5" fill={gezeigt === 1 ? '#b8322a' : '#2a1f16'} />
        ))}
      </svg>
      <span className="ab-staub l" />
      <span className="ab-staub r" />
    </div>
  );
}

/**
 * Die Klaenge einer Aktion, im Takt der Bilder: Schritte, Huepfer der
 * Schleime in Sicht (einer je Takt genuegt), Hiebe, Treffer, Platscher.
 */
function spieleKlaenge(a: Zustand): void {
  const sicht = sichtVon(a);
  const huepfer = new Set<number>();
  const spaeter = (takt: number, art: Klang) => window.setTimeout(() => klang(art), Math.max(0, takt * TAKT_MS));
  for (const e of a.ereignisse) {
    if (e.art === 'gehen') {
      if (e.wer === 'ritter') {
        spaeter(e.takt + 0.1, 'schritt');
        spaeter(e.takt + 0.6, 'schritt');
      } else if (!huepfer.has(e.takt) && hexDistance(e.nach, a.pos) <= sicht) {
        huepfer.add(e.takt);
        spaeter(e.takt + 0.1, 'huepf');
      }
    } else if (e.art === 'hieb') {
      if (e.wer === 'ritter') {
        spaeter(e.takt + 0.2, 'hieb');
        if (e.schaden > 0) spaeter(e.takt + 0.45, 'treffer');
      } else {
        spaeter(e.takt + 0.45, e.ziel === null ? 'leer' : e.schaden > 0 ? 'platsch' : 'geblockt');
      }
    } else if (e.art === 'ansage') spaeter(e.takt + 0.2, 'warnung');
    else if (e.art === 'stampf') spaeter(e.takt + 0.5, 'beben');
    else if (e.art === 'boss') spaeter(e.takt, 'beben');
    else if (e.art === 'tod') spaeter(e.takt + 0.5, 'zerplatzt');
  }
}

// --- Das Spiel -------------------------------------------------------------

type Anim = { start: number; ev: Ereignis[] };
type Ansicht = { camX: number; camY: number; f: number; dpr: number; w: number; h: number };

export function Abenteuer({ onZurueck }: { onZurueck: () => void }) {
  const [a, setA] = useState<Zustand>(() => lade() ?? neuesAbenteuer(neuerSeed()));
  const [geladen, setGeladen] = useState(false);
  const [gedrueckt, setGedrueckt] = useState<{ taste: Taste; n: number } | null>(null);
  const [zugTasten, setZugTasten] = useState<Taste[]>([]);
  const [wurfNr, setWurfNr] = useState(0);
  const [rollt, setRollt] = useState(false);
  const [musik, setMusik] = useState(musikAn);
  const [laut, setLaut] = useState(lautstaerke);
  // Autoroll: wer laufen will, waehrend der Wurf noch aussteht, wuerfelt gleich mit.
  const [autoroll, setAutoroll] = useState(leseAutoroll);
  const autorollRef = useRef(autoroll);
  autorollRef.current = autoroll;
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);

  useEffect(() => speichere(a), [a]);
  useEffect(() => {
    void Promise.all([preloadTiles(), preloadUnitSprites()]).then(() => setGeladen(true));
  }, []);
  // Musik erst nach der ersten Geste - Browser lassen vorher nichts klingen.
  useEffect(() => {
    const los = () => starteMusik();
    window.addEventListener('pointerdown', los, { once: true });
    window.addEventListener('keydown', los, { once: true });
    return () => {
      window.removeEventListener('pointerdown', los);
      window.removeEventListener('keydown', los);
      stoppeMusik();
    };
  }, []);
  // Die Welt rund um den Ritter erzeugen, bevor gezeichnet wird.
  useMemo(() => weltVon(a.seed, a.pos, 14), [a.seed, a.pos]);

  // Der aktuelle Stand fuer Tasten, Knoepfe und das Zeichnen - ohne Nebenwirkungen in setA.
  const aktuell = useRef(a);
  aktuell.current = a;
  const anim = useRef<Anim>({ start: 0, ev: [] });
  const ansicht = useRef<Ansicht | null>(null);
  const zeiger = useRef<Hex | null>(null);
  const lauf = useRef<{ ziel: Hex; timer: number } | null>(null);
  const rolltRef = useRef(false);
  const wirfRef = useRef<() => void>(() => undefined);
  const tippeRef = useRef<(h: Hex) => void>(() => undefined);
  const blick = useRef<1 | -1>(1);
  /** Seit wann das Banner "Der Schleimkoenig erwacht" steht. */
  const banner = useRef(0);

  const setze = useCallback((neu: Zustand) => {
    aktuell.current = neu;
    if (neu.ereignisse.length > 0) {
      anim.current = { start: performance.now(), ev: neu.ereignisse };
      if (neu.ereignisse.some((e) => e.art === 'boss')) banner.current = performance.now();
      spieleKlaenge(neu);
    }
    setA(neu);
  }, []);

  const halt = useCallback(() => {
    if (lauf.current) window.clearTimeout(lauf.current.timer);
    lauf.current = null;
  }, []);

  /** Eine Taste im Zug - von der Tastatur, vom Knopf oder vom Tippen auf die Karte. */
  const schritt = useCallback(
    (t: Taste) => {
      setGedrueckt((g) => ({ taste: t, n: (g?.n ?? 0) + 1 }));
      const alt = aktuell.current;
      if (alt.phase !== 'ziehen' || rolltRef.current) return null;
      setZugTasten((z) => [...z, t]);
      const neu = taste(alt, t);
      setze(neu);
      return neu;
    },
    [setze],
  );
  const drueck = useCallback(
    (t: Taste) => {
      halt();
      // Autoroll: steht noch der Wurf an, erst wuerfeln, dann (wenn der
      // Wuerfel liegt) den Schritt gehen.
      if (autorollRef.current && aktuell.current.phase === 'wuerfeln' && !rolltRef.current) {
        wirfRef.current();
        window.setTimeout(() => schritt(t), ROLL_MS + 120);
        return;
      }
      schritt(t);
    },
    [halt, schritt],
  );
  const wirf: () => void = useCallback(() => {
    const alt = aktuell.current;
    if (alt.phase !== 'wuerfeln' || rolltRef.current) return;
    halt();
    rolltRef.current = true;
    setRollt(true);
    window.setTimeout(() => {
      rolltRef.current = false;
      setRollt(false);
    }, ROLL_MS + 80);
    setWurfNr((n) => n + 1);
    setZugTasten([]);
    setze(wuerfeln(alt));
  }, [halt, setze]);
  wirfRef.current = wirf;
  const beenden = useCallback(() => {
    halt();
    const alt = aktuell.current;
    if (alt.phase !== 'ziehen' || rolltRef.current) return;
    setze(zugBeenden(alt));
  }, [halt, setze]);

  /** Den Weg zu einem Feld gehen, Schritt fuer Schritt, im Takt der Bilder. */
  const geheWeiter = useCallback(() => {
    const l = lauf.current;
    const a0 = aktuell.current;
    if (!l || a0.phase !== 'ziehen') return halt();
    const weg = wegZu(a0, l.ziel);
    const naechstes = weg[0];
    if (!naechstes) return halt();
    const t = tasteZu(a0.pos, naechstes);
    if (!t) return halt();
    const neu = schritt(t);
    if (!neu) return halt();
    const amZiel = neu.pos.q === l.ziel.q && neu.pos.r === l.ziel.r;
    const zielSchleim = a0.schleime.some((s) => s.q === l.ziel.q && s.r === l.ziel.r);
    // Ein Schleim nebenan haelt den Lauf an - dann entscheidet der Spieler.
    const gefahr = neu.schleime.some((s) => hexDistance(s, neu.pos) === 1);
    if (amZiel || zielSchleim || gefahr || neu.phase !== 'ziehen') return halt();
    l.timer = window.setTimeout(geheWeiter, (letzterTakt(neu.ereignisse) + 1) * TAKT_MS + 30);
  }, [halt, schritt]);

  /** Ein Feld wurde angetippt oder angeklickt. */
  const tippe = useCallback(
    (h: Hex) => {
      const a0 = aktuell.current;
      halt();
      if (a0.phase === 'wuerfeln') {
        wirf();
        // Mit Autoroll geht es nach dem Wurf gleich zum angetippten Feld.
        if (autorollRef.current) window.setTimeout(() => tippeRef.current(h), ROLL_MS + 120);
        return;
      }
      if (a0.phase !== 'ziehen' || rolltRef.current) return;
      const nah = tasteZu(a0.pos, h);
      if (nah) return void schritt(nah);
      if (wegZu(a0, h).length === 0) return;
      lauf.current = { ziel: h, timer: 0 };
      geheWeiter();
    },
    [geheWeiter, halt, schritt, wirf],
  );
  tippeRef.current = tippe;

  // Tastatur: W E / A S D / Z X wie die Nachbarn eines Sechsecks, Leertaste wuerfelt.
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Nach der Lage der Taste, nicht nach ihrer Aufschrift: so liegen Z und X
      // auch auf einer deutschen Tastatur (dort Y und X) links unten.
      const k = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      if ((TASTEN as readonly string[]).includes(k)) {
        e.preventDefault();
        drueck(k as Taste);
      } else if (k === ' ' || k === 'enter') {
        e.preventDefault();
        wirf();
      }
    };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, [drueck, wirf]);
  useEffect(() => halt, [halt]);

  // --- Zeichnen ----------------------------------------------------------
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let raf = 0;
    let zuletzt = 0;
    const zeichne = (jetzt: number) => {
      raf = requestAnimationFrame(zeichne);
      const a = aktuell.current;
      const { start, ev } = anim.current;
      const p = (jetzt - start) / TAKT_MS;
      const ende = letzterTakt(ev) + 1 + NACHKLANG;
      const bewegt = p < ende;
      // Steht alles wieder still (nur Zahlen steigen noch), zeigen sich Tasten und Wege.
      const still = p >= letzterTakt(ev) + 1;
      // In Ruhe genuegen zwoelf Bilder je Sekunde fuers Atmen.
      if (!bewegt && jetzt - zuletzt < 80) return;
      zuletzt = jetzt;
      const sek = jetzt / 1000;

      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#0d0a07';
      ctx.fillRect(0, 0, c.width, c.height);
      // Geraetepixel je Kunstpixel: ganzzahlig, auf dem Handy etwas kleiner.
      const f = Math.max(2, Math.round((w < 700 ? 2 : 3) * dpr));

      // Wo steht wer im Augenblick p? Aus den Ereignissen der letzten Aktion.
      const schleimEnde = new Map<number, Hex>();
      for (const s of a.schleime) schleimEnde.set(s.id, s);
      for (const e of ev) if (e.art === 'tod') schleimEnde.set(e.wer, { q: e.q, r: e.r });
      const endeVon = (wer: Wer): Hex => (wer === 'ritter' ? a.pos : (schleimEnde.get(wer) ?? a.pos));
      const ort = (wer: Wer): { x: number; y: number; hoch: number } => {
        const gehen = ev.filter((e): e is Extract<Ereignis, { art: 'gehen' }> => e.art === 'gehen' && e.wer === wer);
        let pos = endeVon(wer);
        if (gehen.length > 0 && p < gehen[gehen.length - 1]!.takt + 1) {
          for (const g of gehen) {
            if (p < g.takt) {
              pos = g.von;
              break;
            }
            if (p < g.takt + 1) {
              const u = sanft(klemme(p - g.takt));
              const m0 = mitte(g.von.q, g.von.r);
              const m1 = mitte(g.nach.q, g.nach.r);
              const hoch = wer === 'ritter' ? Math.abs(Math.sin(u * Math.PI * 2)) * 1.5 : Math.sin(u * Math.PI) * 7;
              return { x: m0.x + (m1.x - m0.x) * u, y: m0.y + (m1.y - m0.y) * u, hoch };
            }
            pos = g.nach;
          }
        }
        const m = mitte(pos.q, pos.r);
        return { x: m.x, y: m.y, hoch: 0 };
      };
      // Der Hieb: der Angreifer stoesst zum Ziel vor und federt zurueck.
      const stoss = (wer: Wer, x: number, y: number) => {
        for (const e of ev) {
          if (e.art !== 'hieb' || e.wer !== wer) continue;
          const u = p - e.takt;
          if (u < 0 || u > 1) continue;
          const z = e.feld ? mitte(e.feld.q, e.feld.r) : e.ziel !== null ? ort(e.ziel) : { x, y };
          // Schleime springen weit auf ihr Feld, der Ritter stoesst kurz vor.
          const k = Math.sin(klemme(u) * Math.PI) * (e.wer === 'ritter' ? 0.45 : 0.6);
          return { x: x + (z.x - x) * k, y: y + (z.y - y) * k };
        }
        return { x, y };
      };
      // Getroffen: zittern und aufblitzen.
      const wucht = (wer: Wer) => {
        for (const e of ev) {
          if (e.art !== 'hieb' || e.ziel !== wer) continue;
          const u = p - e.takt;
          if (u < 0.45 || u > 1) continue;
          return { dx: e.schaden > 0 ? Math.round(Math.sin(u * 60) * 1.2) : 0, blitz: e.schaden > 0 && u < 0.8 };
        }
        return { dx: 0, blitz: false };
      };

      const ritter = ort('ritter');
      const camX = ritter.x;
      const camY = ritter.y;
      ansicht.current = { camX, camY, f, dpr, w: c.width, h: c.height };
      const sx = (x: number) => Math.round((x - camX) * f + c.width / 2);
      const sy = (y: number) => Math.round((y - camY) * f + c.height / 2);
      const welt = weltVon(a.seed);
      const erkundet = new Set(a.erkundet);
      const sicht = sichtVon(a);
      const radius = Math.ceil(Math.max(c.width, c.height) / (17 * f)) + 2;
      const felder = hexesInRange(a.pos, radius).sort((p1, p2) => p1.r - p2.r || p1.q - p2.q);
      // Kacheln: gesehen und jetzt sichtbar hell, gesehen und fern im Nebel.
      for (const hx of felder) {
        const k = hexKey(hx.q, hx.r);
        if (!erkundet.has(k)) continue;
        const t = tileAt(welt, hx.q, hx.r);
        if (!t) continue;
        const url = tileUrl(a.seed, t.terrain, hx.q, hx.r);
        if (!url) continue;
        const nah = hexDistance(hx, a.pos) <= sicht;
        const bild = nah ? tileImage(url) : tileImageFog(url);
        if (!bild) continue;
        const e = kachelEcke(hx.q, hx.r);
        ctx.drawImage(bild, sx(e.x), sy(e.y), IMG_W * f, IMG_H * f);
      }
      const zentrum = (q: number, r: number) => {
        const m = mitte(q, r);
        return { x: sx(m.x), y: sy(m.y) };
      };
      // Funde in Sichtweite - sie schweben sacht.
      for (const hx of felder) {
        if (hexDistance(hx, a.pos) > sicht) continue;
        const fund = fundAuf(a, hx.q, hx.r);
        if (!fund || !SYMBOL[fund]) continue;
        const pz = zentrum(hx.q, hx.r);
        const karte = SYMBOL[fund]!;
        const schweb = Math.round(Math.sin(sek * 2 + hx.q * 1.3 + hx.r) * 1) * f;
        zeichnePixel(ctx, karte, pz.x - Math.floor((karte[0]!.length * f) / 2), pz.y - karte.length * f + schweb, f, PIX);
      }
      // Die Wege dieses Zuges als Pfeile: gold der Ritter, gruen die Schleime.
      const pfeile = (weg: readonly Hex[], farbe: string, dicke: number) => {
        ctx.strokeStyle = farbe;
        ctx.fillStyle = farbe;
        ctx.lineWidth = dicke;
        for (let i = 1; i < weg.length; i++) {
          const p0 = zentrum(weg[i - 1]!.q, weg[i - 1]!.r);
          const p1 = zentrum(weg[i]!.q, weg[i]!.r);
          const dx = p1.x - p0.x;
          const dy = p1.y - p0.y;
          const l = Math.hypot(dx, dy) || 1;
          const ux = dx / l;
          const uy = dy / l;
          const a0 = { x: p0.x + ux * l * 0.22, y: p0.y + uy * l * 0.22 };
          const a1 = { x: p1.x - ux * l * 0.22, y: p1.y - uy * l * 0.22 };
          ctx.beginPath();
          ctx.moveTo(a0.x, a0.y);
          ctx.lineTo(a1.x, a1.y);
          ctx.stroke();
          const s = 4 * dicke;
          ctx.beginPath();
          ctx.moveTo(a1.x + ux * s * 0.6, a1.y + uy * s * 0.6);
          ctx.lineTo(a1.x - ux * s - uy * s * 0.6, a1.y - uy * s + ux * s * 0.6);
          ctx.lineTo(a1.x - ux * s + uy * s * 0.6, a1.y - uy * s - ux * s * 0.6);
          ctx.closePath();
          ctx.fill();
        }
      };
      for (const [id, weg] of Object.entries(a.spuren)) {
        const s = a.schleime.find((x) => x.id === Number(id));
        if (!s || hexDistance(s, a.pos) > sicht) continue;
        // Nur was der Ritter sieht - kein Pfeil aus dem Dunkel.
        for (let i = 1; i < weg.length; i++) {
          if (hexDistance(weg[i - 1]!, a.pos) > sicht || hexDistance(weg[i]!, a.pos) > sicht) continue;
          pfeile([weg[i - 1]!, weg[i]!], 'rgba(150, 220, 90, 0.85)', Math.max(2, Math.round(f * 0.7)));
        }
      }
      pfeile(a.pfad, '#f2c94c', Math.max(2, f));
      // Der geplante Weg (Maus oder laufender Weg): Punkte, so weit die Schritte reichen.
      const plan = lauf.current?.ziel ?? zeiger.current;
      if (a.phase === 'ziehen' && plan && still) {
        let rest = a.schritte;
        for (const hx of wegZu(a, plan)) {
          const kost = a.schleime.some((s) => s.q === hx.q && s.r === hx.r) ? 1 : schrittKosten(a, hx.q, hx.r);
          // Der letzte Schritt reicht immer auf einen Berg (regeln.ts).
          rest -= rest > 0 ? Math.min(kost, rest) : kost;
          const pz = zentrum(hx.q, hx.r);
          ctx.fillStyle = rest >= 0 ? 'rgba(242, 201, 76, 0.9)' : 'rgba(150, 140, 120, 0.55)';
          ctx.fillRect(pz.x - f, pz.y - f, 2 * f, 2 * f);
        }
      }
      // Angesagte Angriffe: das Feld glueht rot, ein roter Pfeil zeigt hinein.
      // Waehrend der Schleim ausholt, waechst der Pfeil heran.
      const feldUmriss = (q: number, r: number) => {
        const m = mitte(q, r);
        const ecken = [
          [0, -11.4],
          [11.5, -5.7],
          [11.5, 5.7],
          [0, 11.4],
          [-11.5, 5.7],
          [-11.5, -5.7],
        ];
        ctx.beginPath();
        ecken.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(m.x + x!), sy(m.y + y!)) : ctx.lineTo(sx(m.x + x!), sy(m.y + y!))));
        ctx.closePath();
      };
      // Der Ring des Koenigs: alle Felder um ihn gluehen rot.
      for (const s of a.schleime) {
        if (!s.flaeche) continue;
        const ansage = ev.find((e) => e.art === 'ansage' && e.wer === s.id);
        const wachs = ansage ? klemme((p - ansage.takt) / 0.8) : 1;
        if (wachs <= 0) continue;
        const puls = 0.5 + 0.5 * Math.sin(sek * 8);
        for (const h of s.flaeche) {
          feldUmriss(h.q, h.r);
          ctx.fillStyle = `rgba(220, 40, 30, ${(0.2 + 0.2 * puls) * wachs})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(255, 80, 60, ${0.9 * wachs})`;
          ctx.lineWidth = Math.max(2, f);
          ctx.stroke();
        }
      }
      for (const s of a.schleime) {
        if (!s.angriff || hexDistance(s, a.pos) > sicht) continue;
        const ansage = ev.find((e) => e.art === 'ansage' && e.wer === s.id);
        const wachs = ansage ? klemme((p - ansage.takt) / 0.8) : 1;
        if (wachs <= 0) continue;
        const puls = 0.5 + 0.5 * Math.sin(sek * 8);
        feldUmriss(s.angriff.q, s.angriff.r);
        ctx.fillStyle = `rgba(220, 40, 30, ${(0.18 + 0.17 * puls) * wachs})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 80, 60, ${0.9 * wachs})`;
        ctx.lineWidth = Math.max(2, f);
        ctx.stroke();
        const von = ort(s.id);
        const nach = mitte(s.angriff.q, s.angriff.r);
        const ende = { x: von.x + (nach.x - von.x) * wachs, y: von.y + (nach.y - von.y) * wachs };
        const p0 = { x: sx(von.x), y: sy(von.y) };
        const p1 = { x: sx(ende.x), y: sy(ende.y) };
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const l = Math.hypot(dx, dy) || 1;
        const ux = dx / l;
        const uy = dy / l;
        ctx.strokeStyle = '#ff4a3a';
        ctx.fillStyle = '#ff4a3a';
        ctx.lineWidth = Math.max(2, f);
        ctx.beginPath();
        ctx.moveTo(p0.x + ux * l * 0.25, p0.y + uy * l * 0.25);
        ctx.lineTo(p1.x - ux * 3 * f, p1.y - uy * 3 * f);
        ctx.stroke();
        const k = 4 * f;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x - ux * k - uy * k * 0.6, p1.y - uy * k + ux * k * 0.6);
        ctx.lineTo(p1.x - ux * k + uy * k * 0.6, p1.y - uy * k - ux * k * 0.6);
        ctx.closePath();
        ctx.fill();
      }

      // Die Nachbarfelder tragen im Zug ihre Taste - so sieht man, welche wohin fuehrt.
      if (a.phase === 'ziehen' && still) {
        ctx.font = `${5 * f}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const t of TASTEN) {
          const dir = richtungFuer(t);
          if (dir === null) continue;
          const d = HEX_DIRS[dir]!;
          const pz = zentrum(a.pos.q + d[0], a.pos.r + d[1]);
          ctx.fillStyle = 'rgba(18, 14, 9, 0.75)';
          ctx.fillRect(pz.x - 4 * f, pz.y - 4 * f, 8 * f, 8 * f);
          ctx.fillStyle = '#f2e7d0';
          ctx.fillText(t.toUpperCase(), pz.x, pz.y + f * 0.5);
        }
      }

      const schrift = (text: string, x: number, y: number, farbe: string, alpha: number, groesse = 6) => {
        ctx.globalAlpha = klemme(alpha);
        ctx.font = `bold ${groesse * f}px monospace`;
        ctx.fillStyle = '#120d08';
        ctx.fillText(text, x + f, y + f);
        ctx.fillStyle = farbe;
        ctx.fillText(text, x, y);
        ctx.globalAlpha = 1;
      };
      // Figuren von hinten nach vorn: Schleime (auch die eben zerplatzten) und der Ritter.
      type Figur = { y: number; mal: () => void };
      const figuren: Figur[] = [];
      const malFigur = (art: 'schleim', x: number, y: number, fs: number, o: { sx?: number; sy?: number; alpha?: number; blitz?: boolean; farbe?: string }) => {
        ctx.save();
        ctx.globalAlpha = o.alpha ?? 1;
        ctx.translate(x, y);
        ctx.scale(o.sx ?? 1, o.sy ?? 1);
        zeichneFigur(ctx, art, 0, 0, fs, o.farbe);
        if (o.blitz) {
          ctx.filter = 'brightness(4) saturate(0)';
          ctx.globalAlpha = (o.alpha ?? 1) * 0.7;
          zeichneFigur(ctx, art, 0, 0, fs, o.farbe);
        }
        ctx.restore();
      };
      // Lebensbalken: zeigt den Stand vor Treffern, die im Bild noch nicht gelandet sind.
      const lebenImBild = (id: number, jetzt: number) =>
        jetzt + ev.reduce((n, e) => (e.art === 'hieb' && e.ziel === id && p < e.takt + 0.45 ? n + e.schaden : n), 0);
      const balken = (x: number, y: number, leben: number, max: number) => {
        const bw = 12 * f;
        const bh = 2 * f;
        ctx.fillStyle = '#1a120c';
        ctx.fillRect(x - bw / 2 - f, y - f, bw + 2 * f, bh + 2 * f);
        ctx.fillStyle = '#4a2a22';
        ctx.fillRect(x - bw / 2, y, bw, bh);
        const anteil = klemme(leben / max);
        ctx.fillStyle = anteil > 0.5 ? '#7fd05a' : anteil > 0.25 ? '#e0b040' : '#d0503a';
        ctx.fillRect(x - bw / 2, y, Math.round((bw * anteil) / f) * f, bh);
      };
      const lebende = new Set(a.schleime.map((s) => s.id));
      let beben = 0;
      const schleimeImBild = [
        ...a.schleime.map((s) => ({ id: s.id, gross: s.gross, boss: !!s.boss, leben: s.leben, tot: null as number | null })),
        ...ev.flatMap((e) => (e.art === 'tod' && !lebende.has(e.wer) ? [{ id: e.wer, gross: e.gross, boss: !!e.boss, leben: 0, tot: e.takt }] : [])),
      ];
      for (const s of schleimeImBild) {
        const o0 = ort(s.id);
        if (hexDistance(feldBei(o0.x, o0.y), a.pos) > sicht) continue;
        const o = stoss(s.id, o0.x, o0.y);
        const wu = wucht(s.id);
        const fs = s.gross ? f + Math.max(1, Math.round(f / 2)) : f;
        const max = s.boss ? BOSS_LEBEN : s.gross ? 4 : 2;
        // Atmen: ein Schleim quillt und sackt, jeder in seinem Takt.
        const atem = Math.sin(sek * 3.1 + s.id * 1.7);
        let skx = 1 - atem * 0.06;
        let sky = 1 + atem * 0.08;
        let alpha = 1;
        let hoch = o0.hoch;
        // Beim Huepfen: vorher ducken, in der Luft strecken.
        if (hoch > 0.5) {
          skx = 0.9;
          sky = 1.15;
        }
        // Holt er aus, duckt er sich zitternd zusammen.
        const lebend = a.schleime.find((x) => x.id === s.id);
        const holtAus = lebend?.angriff ?? lebend?.flaeche;
        // Der Stampfer: der Koenig springt hoch und schlaegt auf.
        const stampf = ev.find((e) => e.art === 'stampf' && e.wer === s.id);
        if (stampf) {
          const u = p - stampf.takt;
          if (u >= 0 && u < 0.5) hoch += Math.sin((u / 0.5) * Math.PI) * 16;
          if (u >= 0.5 && u < 0.9) beben = Math.max(beben, 1 - (u - 0.5) / 0.4);
        }
        let zittern = 0;
        if (holtAus && o0.hoch === 0) {
          skx = 1.18;
          sky = 0.8;
          zittern = Math.round(Math.sin(sek * 40) * 0.6);
        }
        // Neu aus dem Unbekannten: faellt herab und plumpst auf.
        const neu = ev.find((e) => e.art === 'neu' && e.wer === s.id);
        if (neu) {
          const u = p - neu.takt;
          if (u < 0) continue;
          if (u < 1) {
            hoch += (1 - sanft(u)) * 30;
            alpha = u;
          }
        }
        if (s.tot !== null) {
          const u = p - s.tot - 0.45;
          if (u > 1.1) continue;
          if (u > 0) {
            skx = 1 + u * 0.9;
            sky = Math.max(0.05, 1 - u);
            alpha = 1 - u / 1.1;
          }
        }
        const lebenJetzt = s.tot !== null ? lebenImBild(s.id, 0) : lebenImBild(s.id, s.leben);
        figuren.push({
          y: o.y,
          mal: () => {
            const X = sx(o.x) + (wu.dx + zittern) * f;
            const Y = sy(o.y) + 3 * f - Math.round(hoch) * f;
            // Schatten bleibt am Boden, auch wenn der Schleim springt.
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            const sw = s.boss ? 10 * f : 3 * fs;
            ctx.fillRect(sx(o.x) - sw, sy(o.y) + 3 * f, 2 * sw, f);
            if (s.boss) {
              // Der Koenig: eigenes Bild, deutlich groesser als ein Feld-Schleim.
              const kf = Math.round(f * 1.6);
              const kb = SCHLEIMKOENIG[0]!.length;
              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.translate(X, Y);
              ctx.scale(skx, sky);
              zeichnePixel(ctx, SCHLEIMKOENIG, -Math.floor(kb / 2) * kf, -SCHLEIMKOENIG.length * kf, kf, PIX);
              if (wu.blitz) {
                ctx.filter = 'brightness(4) saturate(0)';
                ctx.globalAlpha = alpha * 0.7;
                zeichnePixel(ctx, SCHLEIMKOENIG, -Math.floor(kb / 2) * kf, -SCHLEIMKOENIG.length * kf, kf, PIX);
              }
              ctx.restore();
              if (holtAus && alpha > 0.3) schrift('!', X + 12 * kf, Y - 10 * kf, '#ff4a3a', 1, 8);
              return;
            }
            malFigur('schleim', X, Y, fs, { sx: skx, sy: sky, alpha, blitz: wu.blitz });
            if (alpha > 0.3 && lebenJetzt > 0) balken(X, Y - 9 * fs, lebenJetzt, max);
            if (holtAus && alpha > 0.3) schrift('!', X + 9 * f, Y - 9 * fs, '#ff4a3a', 1, 7);
          },
        });
      }
      const ws = wucht('ritter');
      const ro = stoss('ritter', ritter.x, ritter.y);
      // Ruhig atmet der Ritter: alle paar Augenblicke hebt sich die Brust.
      const atmet = ritter.hoch === 0 && Math.sin(sek * 2.2) > 0.4 ? 1 : 0;
      // Blickrichtung: wohin er zuletzt ging; im Schritt das zweite Bild.
      const lauf0 = ev.find((e): e is Extract<Ereignis, { art: 'gehen' }> => e.art === 'gehen' && e.wer === 'ritter');
      if (lauf0) blick.current = mitte(lauf0.nach.q, lauf0.nach.r).x < mitte(lauf0.von.q, lauf0.von.r).x ? -1 : 1;
      const imSchritt = lauf0 !== undefined && p >= lauf0.takt && p < lauf0.takt + 1 && (p - lauf0.takt) % 0.5 < 0.25;
      // Der Hieb des Ritters: er dreht sich zum Ziel, holt aus, schwingt durch.
      const hieb0 = ev.find((e): e is Extract<Ereignis, { art: 'hieb' }> => e.art === 'hieb' && e.wer === 'ritter');
      if (hieb0 && hieb0.ziel !== null && p >= hieb0.takt - 0.05) blick.current = ort(hieb0.ziel).x < ritter.x ? -1 : 1;
      const schwung = hieb0 ? p - hieb0.takt : -1;
      // Winkel der Klinge in Grad: 0 = senkrecht, positiv = nach vorn.
      let winkel = 22 + Math.sin(sek * 2.2) * 3 + (imSchritt ? 8 : 0);
      let spurVon: number | null = null;
      if (schwung >= 0 && schwung < 0.95) {
        if (schwung < 0.25) winkel = 22 + (-85 - 22) * sanft(schwung / 0.25);
        else if (schwung < 0.45) {
          winkel = -85 + (130 + 85) * sanft((schwung - 0.25) / 0.2);
          spurVon = -85;
        } else {
          winkel = 130 + (22 - 130) * sanft((schwung - 0.45) / 0.5);
          if (schwung < 0.6) spurVon = Math.max(-85, winkel - 160);
        }
      }
      const waffe = WAFFE[a.ausruestung.waffe ?? ''];
      // Besondere Klingen leuchten: die Runenklinge blau, das Flammenschwert gluehend.
      const glut = a.ausruestung.waffe === 'runenklinge' ? '#5aa0d8' : a.ausruestung.waffe === 'flammenschwert' ? '#e8641e' : null;
      figuren.push({
        y: ro.y,
        mal: () => {
          const bild = imSchritt ? RITTER_SCHRITT : RITTER_KOERPER;
          const bw = bild[0]!.length;
          const X = sx(ro.x) + ws.dx * f;
          const fuss = sy(ro.y) + 3 * f - Math.round(ritter.hoch + atmet) * f;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
          ctx.fillRect(sx(ro.x) - 5 * f, sy(ro.y) + 3 * f, 10 * f, f);
          ctx.save();
          ctx.translate(X, fuss - bild.length * f);
          ctx.scale(blick.current, 1);
          const links = -Math.floor(bw / 2) * f;
          const hand = { x: links + RITTER_HAND.x * f, y: RITTER_HAND.y * f };
          const malWaffe = () => {
            if (!waffe) return;
            // Die Spur des Schwungs: ein heller Bogen, wo die Klinge eben war.
            if (spurVon !== null) {
              const r = (WAFFE_GRIFF.y - 0.5) * f;
              ctx.strokeStyle = 'rgba(255, 250, 235, 0.55)';
              ctx.lineWidth = 3 * f;
              ctx.beginPath();
              ctx.arc(hand.x, hand.y, r, ((spurVon - 90) * Math.PI) / 180, ((winkel - 90) * Math.PI) / 180);
              ctx.stroke();
            }
            ctx.save();
            ctx.translate(hand.x, hand.y);
            ctx.rotate((winkel * Math.PI) / 180);
            if (glut) {
              ctx.shadowColor = glut;
              ctx.shadowBlur = (3 + Math.sin(sek * 6)) * f;
            }
            zeichnePixel(ctx, waffe, -WAFFE_GRIFF.x * f, -WAFFE_GRIFF.y * f, f, PIX);
            ctx.restore();
          };
          // Beim Ausholen liegt die Klinge hinter dem Ritter, sonst davor.
          if (winkel < -30) malWaffe();
          zeichnePixel(ctx, bild, links, 0, f, PIX);
          if (ws.blitz) {
            ctx.save();
            ctx.filter = 'brightness(4) saturate(0)';
            ctx.globalAlpha = 0.7;
            zeichnePixel(ctx, bild, links, 0, f, PIX);
            ctx.restore();
          }
          if (winkel >= -30) malWaffe();
          ctx.restore();
        },
      });
      figuren.sort((x, y) => x.y - y.y).forEach((fi) => fi.mal());

      // Wirkungen obenauf: Hiebspuren, Zahlen, Splitter, Funde, Ruhe.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let rot = 0;
      for (const e of ev) {
        const u = p - e.takt;
        if (u < 0) continue;
        if (e.art === 'hieb') {
          const z = e.ziel === null && e.feld ? mitte(e.feld.q, e.feld.r) : ort(e.ziel ?? 'ritter');
          const X = sx(z.x);
          const Y = sy(z.y) - 4 * f;
          // Trifft die Klinge, blitzt ein Funkenstern auf dem Ziel.
          if (e.wer === 'ritter' && e.schaden > 0 && u > 0.38 && u < 0.62) {
            const k = (u - 0.38) / 0.24;
            const r = (2 + k * 6) * f;
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = '#fffaf0';
            ctx.fillRect(X - r, Y - f / 2, 2 * r, f);
            ctx.fillRect(X - f / 2, Y - r, f, 2 * r);
            ctx.fillRect(X - r * 0.6, Y - r * 0.6, f, f);
            ctx.fillRect(X + r * 0.6 - f, Y + r * 0.6 - f, f, f);
            ctx.fillRect(X + r * 0.6 - f, Y - r * 0.6, f, f);
            ctx.fillRect(X - r * 0.6, Y + r * 0.6 - f, f, f);
            ctx.globalAlpha = 1;
          }
          if (u > 0.45 && u < 0.45 + NACHKLANG) {
            const k = (u - 0.45) / NACHKLANG;
            const text = e.schaden > 0 ? `-${e.schaden}${e.schaden > 1 ? '!' : ''}` : e.ziel === null ? 'ausgewichen!' : e.wer === 'ritter' ? 'daneben' : 'geblockt';
            const farbe = e.ziel === null ? '#9ad8ff' : e.ziel === 'ritter' ? (e.schaden > 0 ? '#ff5a4a' : '#c8c0b0') : e.schaden > 1 ? '#f2c94c' : e.schaden > 0 ? '#fffaf0' : '#a8a090';
            schrift(text, X, Y - 6 * f - k * 10 * f, farbe, 1.4 - k * 1.4, e.schaden > 0 ? 7 : 5);
          }
          if (e.ziel === 'ritter' && e.schaden > 0 && u > 0.45 && u < 1.3) rot = Math.max(rot, 1 - (u - 0.45) / 0.85);
        } else if (e.art === 'tod') {
          // Zerplatzen: gruene Tropfen fliegen nach allen Seiten.
          const k = u - 0.45;
          if (k > 0 && k < 1.4) {
            const m = mitte(e.q, e.r);
            for (let i = 0; i < 10; i++) {
              const w0 = (i / 10) * Math.PI * 2 + e.wer;
              const v = 9 + ((i * 7 + e.wer) % 5) * 2;
              const x = sx(m.x + Math.cos(w0) * v * k);
              const y = sy(m.y - 2 + Math.sin(w0) * v * 0.6 * k - 10 * k + 14 * k * k);
              ctx.globalAlpha = klemme(1.2 - k);
              ctx.fillStyle = i % 3 === 0 ? '#d8ff9a' : '#6aa85a';
              ctx.fillRect(x, y, f * (e.gross ? 2 : 1) + f, f * (e.gross ? 2 : 1) + f);
            }
            ctx.globalAlpha = 1;
          }
        } else if (e.art === 'heil') {
          if (u < NACHKLANG + 0.5) schrift(`+${lebenText(e.leben)}`, sx(ritter.x) + 6 * f, sy(ritter.y) - 16 * f - u * 4 * f, '#7fd05a', 1.6 - u / 2);
        } else if (e.art === 'warten') {
          // Der Ritter verschnauft: kleine und grosse Z steigen auf.
          for (let i = 0; i < 3; i++) {
            const k = u * 0.8 - i * 0.35;
            if (k < 0 || k > 1.2) continue;
            schrift(i === 1 ? 'Z' : 'z', sx(ritter.x) + (4 + i * 3) * f + Math.sin(k * 6) * f, sy(ritter.y) - (14 + k * 10) * f, '#d8e8ff', 1.2 - k, 4 + i);
          }
        } else if (e.art === 'fund') {
          if (u < NACHKLANG + 0.6) {
            const karte = SYMBOL[e.id];
            const y = sy(ritter.y) - (20 + u * 5) * f;
            ctx.globalAlpha = klemme(1.6 - u / 2);
            if (karte) zeichnePixel(ctx, karte, sx(ritter.x) - Math.floor((karte[0]!.length * f) / 2), y, f, PIX);
            ctx.globalAlpha = 1;
          }
        }
      }
      // Ist Wuerfeln dran, huepft ein Wuerfel ueber dem Ritter.
      if (a.phase === 'wuerfeln' && still) {
        const hops = Math.abs(Math.sin(sek * 3.2)) * 4;
        const X = sx(ritter.x);
        const Y = sy(ritter.y) - Math.round(26 + hops) * f;
        const g = 9 * f;
        ctx.fillStyle = '#2a1f16';
        ctx.fillRect(X - g / 2 - f, Y - g / 2 - f, g + 2 * f, g + 2 * f);
        ctx.fillStyle = '#f2e7d0';
        ctx.fillRect(X - g / 2, Y - g / 2, g, g);
        ctx.fillStyle = '#2a1f16';
        for (const [ax, ay] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]] as const) ctx.fillRect(X + ax * 3 * f - f, Y + ay * 3 * f - f, 2 * f, 2 * f);
        schrift(w < 700 ? 'Tippen: wuerfeln' : 'Enter: wuerfeln', X, Y - g - 2 * f, '#f2c94c', 1, 5);
      }
      // Der Stampfer laesst das Bild beben.
      if (beben > 0) {
        const d = Math.round(Math.sin(sek * 70) * 2 * beben) * f;
        ctx.drawImage(c, d, 0);
      }
      // Das Banner, wenn der Koenig erwacht.
      const seitBanner = (jetzt - banner.current) / 1000;
      if (banner.current > 0 && seitBanner < 3) {
        const al = seitBanner < 0.3 ? seitBanner / 0.3 : seitBanner > 2.4 ? (3 - seitBanner) / 0.6 : 1;
        ctx.globalAlpha = al * 0.75;
        ctx.fillStyle = '#120d08';
        ctx.fillRect(0, c.height * 0.36, c.width, c.height * 0.14);
        ctx.globalAlpha = 1;
        schrift('Der Schleimkoenig erwacht!', c.width / 2, c.height * 0.43, '#f2c94c', al, w < 700 ? 7 : 9);
      }
      // Ein roter Rand, wenn der Ritter getroffen wird.
      if (rot > 0) {
        const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.7);
        g.addColorStop(0, 'rgba(200, 30, 20, 0)');
        g.addColorStop(1, `rgba(200, 30, 20, ${0.45 * rot})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);
      }

      // Uebersichtskarte.
      const m = mini.current;
      const mctx = m?.getContext('2d');
      if (m && mctx) {
        mctx.fillStyle = '#0d0a07';
        mctx.fillRect(0, 0, m.width, m.height);
        const z = 3;
        for (const k of a.erkundet) {
          const [q, rr] = k.split(':').map(Number) as [number, number];
          const t = tileAt(welt, q, rr);
          if (!t) continue;
          const x = (q - a.pos.q + (rr - a.pos.r) / 2) * z * 2 + m.width / 2;
          const y = (rr - a.pos.r) * z * 1.7 + m.height / 2;
          mctx.fillStyle = MINI_FARBE[t.terrain];
          mctx.fillRect(Math.round(x), Math.round(y), z * 2, z * 2);
        }
        for (const s of a.schleime) {
          if (hexDistance(s, a.pos) > sicht) continue;
          const x = (s.q - a.pos.q + (s.r - a.pos.r) / 2) * z * 2 + m.width / 2;
          const y = (s.r - a.pos.r) * z * 1.7 + m.height / 2;
          mctx.fillStyle = '#b6f07a';
          mctx.fillRect(Math.round(x), Math.round(y), z * 2, z * 2);
        }
        // Der Koenig steht immer auf der Karte - man soll ihn finden koennen.
        for (const s of a.schleime) {
          if (!s.boss) continue;
          const x = Math.max(2, Math.min(m.width - 8, (s.q - a.pos.q + (s.r - a.pos.r) / 2) * z * 2 + m.width / 2));
          const y = Math.max(2, Math.min(m.height - 8, (s.r - a.pos.r) * z * 1.7 + m.height / 2));
          mctx.fillStyle = '#c8402f';
          mctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, z * 2 + 2, z * 2 + 2);
        }
        mctx.fillStyle = '#f2c94c';
        mctx.fillRect(m.width / 2 - 1, m.height / 2 - 1, z * 2 + 2, z * 2 + 2);
      }
    };
    raf = requestAnimationFrame(zeichne);
    return () => cancelAnimationFrame(raf);
  }, [geladen]);

  // Bildschirmpunkt -> Feld, mit der Kamera des letzten Bildes.
  const feldUnter = (e: React.PointerEvent<HTMLCanvasElement>): Hex | null => {
    const v = ansicht.current;
    const c = canvas.current;
    if (!v || !c) return null;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * v.dpr - v.w / 2) / v.f + v.camX;
    const y = ((e.clientY - rect.top) * v.dpr - v.h / 2) / v.f + v.camY;
    return feldBei(x, y);
  };

  const maxLeben = maxLebenVon(a);
  const vorrat = Object.entries(a.inventar).filter(([, n]) => n > 0);
  const neu = () => {
    halt();
    setZugTasten([]);
    setze(neuesAbenteuer(neuerSeed()));
  };
  const tonUmschalten = () => {
    setzeMusik(!musik);
    setMusik(!musik);
  };
  // Waehrend der Wuerfel rollt, steht die Zahl noch nicht fest.
  const zeigtSchritte = a.phase === 'ziehen' && !rollt;

  return (
    <div className="abenteuer">
      <canvas
        ref={canvas}
        className="ab-karte"
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') zeiger.current = feldUnter(e);
        }}
        onPointerLeave={() => {
          zeiger.current = null;
        }}
        onPointerUp={(e) => {
          const h = feldUnter(e);
          if (h) tippe(h);
        }}
      />

      {/* Oben links: zurueck, Ton, Leben, Zug. */}
      <div className="ab-kopf">
        <button className="klein" onClick={onZurueck} title="Zur Wahl des Modus">
          ‹ Modus
        </button>
<div className="ab-ton-gruppe">
                  <button className={musik ? 'klein ab-ton' : 'klein ab-ton aus'} onClick={tonUmschalten} title={musik ? 'Musik ausschalten' : 'Musik einschalten'}>
            <TonSymbol aus={!musik} />
          </button>
          {/* Darunter die Lautstaerke: leiser, Stufe, lauter. */}
          <div className="ab-laut" title={`Lautstaerke ${laut} von ${LAUT_STUFEN}`}>
            <button className="ab-laut-knopf" aria-label="Leiser" disabled={laut <= 0} onClick={() => setLaut(setzeLautstaerke(laut - 1))}>
              −
            </button>
            <span className="ab-laut-stufe" aria-hidden>
              {Array.from({ length: LAUT_STUFEN }, (_, i) => (
                <i key={i} className={i < laut ? 'an' : ''} />
              ))}
            </span>
            <button className="ab-laut-knopf" aria-label="Lauter" disabled={laut >= LAUT_STUFEN} onClick={() => setLaut(setzeLautstaerke(laut + 1))}>
              +
            </button>
          </div>
        </div>
        <span className="ab-schild" title={`Leben ${lebenText(a.leben)} von ${maxLeben}`}>
          {Array.from({ length: maxLeben }, (_, i) => (
            <i key={i} className={a.leben >= i + 1 ? 'ab-herz voll' : a.leben >= i + 0.5 ? 'ab-herz halb' : 'ab-herz'} />
          ))}
        </span>
        <span className="ab-schild">Zug {a.zug}</span>
      </div>

      {/* Der Koenig ist erwacht: sein Leben oben in der Mitte, wie bei einem Boss. */}
      {(() => {
        const koenig = a.schleime.find((x) => x.boss);
        if (!koenig) return null;
        return (
          <div className="ab-boss" title="Der Schleimkoenig - bezwinge ihn, um zu gewinnen">
            <span>Schleimkoenig</span>
            <div className="ab-boss-balken">
              <i style={{ width: `${(100 * koenig.leben) / BOSS_LEBEN}%` }} />
            </div>
          </div>
        );
      })()}

      {/* Rechts oben: die Uebersichtskarte. */}
      <div className="ab-fenster ab-mini">
        <span className="ab-titel">Karte</span>
        <canvas ref={mini} width={170} height={130} />
      </div>

      {/* Links: die Werte (mit Bildern statt Text), darunter die Ausruestung als Slots. */}
      <div className="ab-links">
        <div className="ab-fenster ab-werte">
          <span className="ab-titel">Werte</span>
          <div className="ab-werte-gitter">
            {[
              { id: 'schwert', wert: `+${angriffVon(a)}`, titel: 'Angriff: so viel kommt auf jeden Angriffswurf' },
              { id: 'schild', wert: `+${abwehrVon(a)}`, titel: 'Abwehr: jeder Punkt faengt jeden dritten Schleim-Hieb ab' },
              { id: 'herz', wert: `${maxLeben}`, titel: 'Hoechstes Leben' },
              { id: 'auge', wert: `${sichtVon(a)}`, titel: 'Sicht: so viele Felder weit' },
              { id: 'stiefel', wert: `+${schrittBonusVon(a)}`, titel: 'Schritte zusaetzlich je Wurf' },
            ].map((w) => (
              <span key={w.id} className="ab-wert" title={w.titel}>
                <Icon id={w.id} groesse={18} />
                <b>{w.wert}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="ab-fenster ab-ausruestung">
          <span className="ab-titel">Ausruestung</span>
          <div className="ab-slots">
            {SLOTS.map((s) => {
              const g = gegenstand(a.ausruestung[s] ?? '');
              return (
                <div key={s} className={`ab-slot ab-slot-${s}${g ? ' voll' : ''}`} title={g ? `${SLOT_NAME[s]}: ${g.name} - ${g.text}` : `${SLOT_NAME[s]}: leer`}>
                  {/* Leer zeigt der Slot blass, was hineingehoert. */}
                  <Icon id={g?.id ?? SLOT_BILD[s]} groesse={26} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Links unten: die Steuerung - versetzt wie die Tastatur, zugleich zum Tippen. */}
      <div className="ab-fenster ab-steuerung">
        {/* Autoroll: Laufen, waehrend der Wurf aussteht, wuerfelt gleich mit. */}
        <button
          className={autoroll ? 'ab-autoroll an' : 'ab-autoroll'}
          aria-pressed={autoroll}
          title="Autoroll: wer laufen will, waehrend der Wurf noch aussteht, wuerfelt automatisch"
          onClick={() => {
            const neu = !autoroll;
            setAutoroll(neu);
            try {
              localStorage.setItem(AUTOROLL, neu ? 'an' : 'aus');
            } catch {
              // ohne Speicher nur fuer jetzt
            }
          }}
        >
          <i />
          Autoroll {autoroll ? 'an' : 'aus'}
        </button>
        <span className="ab-titel">Steuerung</span>
        <div className="ab-tasten">
          {REIHEN.map((reihe, i) => (
            <div key={i} className={reihe.length === 2 ? 'ab-reihe versetzt' : 'ab-reihe'}>
              {reihe.map((t) => (
                <button
                  key={`${t}${gedrueckt?.taste === t ? gedrueckt.n : ''}`}
                  className={['ab-taste', gedrueckt?.taste === t ? 'gedrueckt' : '', t === 's' ? 'mitte' : ''].filter(Boolean).join(' ')}
                  disabled={!zeigtSchritte && !(autoroll && a.phase === 'wuerfeln' && !rollt)}
                  title={t === 's' ? 'Warten: ein Schritt, die Schleime ziehen. Einmal je Zug +1 Leben, wenn keiner nah ist.' : TASTE_NAME[t]}
                  onClick={() => drueck(t)}
                >
                  <b>{t.toUpperCase()}</b>
                  <span>{PFEIL[t]}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="ab-verlauf" title="Diesen Zug gedrueckt">
          {zugTasten.length > 0 ? zugTasten.map((t, i) => <kbd key={i}>{t.toUpperCase()}</kbd>) : <small>Oder ein Feld antippen</small>}
        </div>
      </div>

      {/* Rechts unten: Inventar ueber dem Spieltisch. */}
      <div className="ab-rechts-unten">
        <div className="ab-fenster ab-inventar">
          <span className="ab-titel">Inventar</span>
          <div className="ab-gegenstaende">
            {Array.from({ length: Math.max(FAECHER, vorrat.length) }, (_, i) => {
              const eintrag = vorrat[i];
              if (!eintrag) return <span key={`leer${i}`} className="ab-fach" />;
              const [id, n] = eintrag;
              const g = gegenstand(id);
              return (
                <button key={id} className="ab-fach ab-gegenstand" title={`${g?.name ?? id}: ${g?.text ?? ''}`} onClick={() => setze(benutzen(aktuell.current, id))}>
                  <Icon id={id} groesse={24} />
                  {n > 1 && <span className="ab-anzahl">{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="ab-tisch">
          <Wuerfel n={a.wurf} wurfNr={wurfNr} matt={a.phase !== 'ziehen'} />
          <div className="ab-tisch-text">
            {a.phase === 'wuerfeln' && !rollt && <b>Wuerfle!</b>}
            {rollt && <b>Es rollt …</b>}
            {zeigtSchritte && (
              <>
                <b>
                  {a.schritte} {a.schritte === 1 ? 'Schritt' : 'Schritte'}
                </b>
                <span className="ab-schritte" aria-hidden>
                  {Array.from({ length: a.wurf ?? 0 }, (_, i) => (
                    <i key={i} className={i < a.schritte ? 'voll' : ''} />
                  ))}
                </span>
              </>
            )}
            {a.phase !== 'ziehen' && <small>Enter, Knopf oder Karte antippen</small>}
          </div>
          {a.phase === 'ziehen' ? (
            <button className="ab-wurf" disabled={rollt} onClick={beenden} title="Die restlichen Schritte abwarten - jeder ist ein Tick">
              Zug beenden
            </button>
          ) : (
            <button className="primary ab-wurf" disabled={a.phase !== 'wuerfeln' || rollt} onClick={wirf}>
              Wuerfeln
            </button>
          )}
        </div>
      </div>

      {/* Was zuletzt geschah. */}
      <div className="ab-log" role="log">
        {a.log.slice(-3).map((z, i) => (
          <div key={`${a.log.length}-${i}`} style={{ opacity: 0.55 + i * 0.22 } as CSSProperties}>
            {z}
          </div>
        ))}
      </div>

      {(a.phase === 'tot' || a.phase === 'sieg') && (
        <div className="ab-ende">
          <div className="ab-fenster">
            <h2>{a.phase === 'sieg' ? 'Sieg!' : 'Der Ritter ist gefallen'}</h2>
            {a.phase === 'sieg' && <p>Der Schleimkoenig ist bezwungen.</p>}
            <button className="primary" onClick={neu}>
              Neues Abenteuer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
