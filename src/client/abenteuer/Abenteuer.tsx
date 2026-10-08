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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  FAEHIGKEIT_NAME,
  FRAKTION_FIGUR,
  gelaendeBonus,
  abwehrAugen,
  OMEN,
  omenFuer,
  EREIGNIS,
  FRAKTION_NAME,
  EILE_PUNKTE,
  gegnerWucht,
  trefferAb,
  zuegeBisBoss,
  schmieden,
  schmiedPreis,
  SCHMIED_MAX,
  ALTAR_OPFER,
  altarMoeglich,
  opfern,
  AKTE,
  AKT_NAME,
  KLASSEN,
  START_EXTRAS,
  abenteuerPunkte,
  aktZiel,
  faehigkeitBereit,
  faehigkeitNutzen,
  haendlerWaren,
  ruhmFuer,
  waehlen,
  WUERFEL_SEITEN,
  WUERFEL_EFFEKT,
  kannNeuWuerfeln,
  neuWuerfeln,
  BEGLEITER_FUER,
  BESCHWOERUNG_VOLL,
  PENTA_STUFE3_NACH,
  angeheuerte,
  beschwoeren,
  meisterZauber,
  BOSS_NAME,
  naechsterBoss,
  GEFOLGE_MAX,
  ORT_NAME,
  SOELDNER,
  anheuern,
  ansprechen,
  kaufen,
  ladenZu,
  ortAuf,
  soeldnerEp,
  verkaufen,
  verkaufsPreis,
  werberAngebot,
  ZAUBER_NAME,
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
  angeln,
  vergleich,
  debugAktion,
  kannAngeln,
  epFuer,
  ladungVon,
  richtungFuer,
  schleimMaxLeben,
  schleimName,
  schrittBonusVon,
  schrittKosten,
  sichtVon,
  taste,
  tasteZu,
  wuerfeln,
} from '../../abenteuer/regeln';
import type { AltarOpfer, Abenteuer as Zustand, DebugAktion, Ereignis, SchleimArt, Slot, Taste, Wer, Zauber } from '../../abenteuer/regeln';
import { HEX_DIRS, hexDistance, hexKey, hexesInRange } from '../../core/coords';
import type { Hex } from '../../core/coords';
import { BODEN_FARBE, einstellung, feldInfo, istWasser, klima } from '../../abenteuer/welt';
import type { Boden } from '../../abenteuer/welt';
import { HEX_CX, HEX_CY, IMG_H, IMG_W, kachelEcke, kachelUrlNachName, preloadTiles, tileImage, tileImageFog } from '../tiles';
import { preloadUnitSprites } from '../units';
import { PIX, Px } from '../ui/KartenPixel';
import { musikAn, setzeMusik, starteMusik, stoppeMusik } from './musik';
import { DEKO, FIGUREN, KACHEL_PIX, malKachelFigur } from './symbole';
import { hash3i } from '../../core/hash';
import type { BeinBild, Haltung } from './symbole';
import { DebugFenster, FIGUR_KEY, ladeWeltEinstellung, leseFigur } from './DebugFenster';
import { Lager } from './Lager';
import type { Aufbruch } from './Lager';
import { aktiveExtras, belohne, freieLegenden, ladeMeta, naechsteFreischaltung, speichereMeta } from './meta';
import type { Meta } from './meta';
import { Hinweis } from './Hinweis';

// Die Stellschrauben der Welt aus dem Debugfenster gelten ab dem Laden.
ladeWeltEinstellung();
import { ALTAR, BANNER, BEGLEITER_BILD, GELEEKOLOSS, HASE, PENTASCHLEIM, SCHAF, SCHATTENSCHLEIM, STAND } from './symbole';
import { RITTER_HAND, RITTER_KOERPER, RITTER_SCHRITT, SCHLEIMKOENIG, SCHLEIM_BILD, SYMBOL, WAFFE, WAFFE_GRIFF, zeichnePixel } from './symbole';
import { LAUT_STUFEN, beiTrack, klang, laufenderTrack, lautstaerke, setzeBiom, setzeLautstaerke } from './musik';
import { BIOM_NAME } from './musik';
import type { Biom } from './musik';
import { ItemTipp, tippHandler } from './ItemTipp';
import type { Tipp } from './ItemTipp';
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
const ROLL_MS = 260;
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

/** Was heilt, in dieser Reihenfolge (Taste H). */
const HEILMITTEL = ['kraut', 'fisch', 'herz', 'halbherz'] as const;
const heilmittel = (a: Zustand): string | null => HEILMITTEL.find((id) => (a.inventar[id] ?? 0) > 0) ?? null;

/** Pfeil je Taste fuer die Steuerung. */
const PFEIL: Record<Taste, string> = {
  q: '↖',
  e: '↗',
  a: '←',
  s: 'z',
  d: '→',
  z: '↙',
  x: '↘',
};
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
  wuerfel: 'wuerfel',
};

/** Farben der Zauberkreise (Pentagrammmeister Stufe 2). */
const KREIS_FARBE: Record<Zauber, string> = {
  funkenregen: '#f6a040',
  schutzrune: '#8ad0ff',
  pentagramm: '#e05aa0',
  heilkreis: '#7ee08a',
  bannkreis: '#b58ae0',
};

/** Welche Musik zu welchem Boden gehoert - Wasser zaehlt nicht mit. */
const MUSIK_BIOM: Partial<Record<Boden, Biom>> = {
  wiese: 'wiese',
  feld: 'wiese',
  erde: 'wiese',
  lehm: 'wiese',
  fluss: 'wiese',
  wald: 'wald',
  dschungel: 'wald',
  taiga: 'schnee',
  sumpf: 'sumpf',
  sand: 'wueste',
  duenen: 'wueste',
  huegel: 'berg',
  berg: 'berg',
  schnee: 'schnee',
};

// --- Hilfen fuer Bild und Weg ----------------------------------------------

/**
 * HOEHENPROFIL: Land hebt sich mit seiner Hoehe (welt.ts, klima) - bis zu
 * zwoelf Kunstpixel, Berge noch etwas mehr; Wasser bleibt flach. Gezeichnet
 * mit Klippen: unter einer gehobenen Kachel ihr Rand, Stufe um Stufe.
 */
let hoehenSeed = 0;
const hoehenSpeicher = new Map<string, number>();
function anhebung(q: number, r: number): number {
  const k = q + ':' + r;
  const da = hoehenSpeicher.get(k);
  if (da !== undefined) return da;
  const info = feldInfo(hoehenSeed, q, r);
  let l = 0;
  if (!istWasser(info.boden)) {
    const h = klima(hoehenSeed, q, r).hoehe;
    const t = Math.max(0, Math.min(1, (h - einstellung.meer) / (0.95 - einstellung.meer)));
    l = Math.round(t * 5) * 2 + (info.boden === 'berg' ? 2 : 0);
  }
  if (hoehenSpeicher.size > 100000) hoehenSpeicher.clear();
  hoehenSpeicher.set(k, l);
  return l;
}
function setzeHoehenSeed(seed: number): void {
  if (seed !== hoehenSeed) {
    hoehenSeed = seed;
    hoehenSpeicher.clear();
  }
}

/** Mitte eines Feldes in Kunstpixeln - mit seiner Hoehe. */
function mitte(q: number, r: number): { x: number; y: number } {
  const e = kachelEcke(q, r);
  return { x: e.x + HEX_CX, y: e.y + HEX_CY - anhebung(q, r) };
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
/**
 * Welche Felder der Ritter in diesem Zug noch erreicht (Spieltest: "Zeig, wie weit ich komme").
 * Ein Schritt geht, solange noch einer uebrig ist - auch auf einen Berg.
 */
const erreichbarCache = new WeakMap<Zustand, Set<string>>();
function erreichbar(a: Zustand): Set<string> {
  const alt = erreichbarCache.get(a);
  if (alt) return alt;
  const erkundet = new Set(a.erkundet);
  const besetzt = new Set(a.schleime.map((s) => hexKey(s.q, s.r)));
  const hindernis = new Set((a.orte ?? []).filter((o) => !((o.art === 'altar' || o.art === 'ereignis') && o.benutzt)).map((x) => hexKey(x.q, x.r)));
  const kosten = new Map<string, number>([[hexKey(a.pos.q, a.pos.r), 0]]);
  const offen: { h: Hex; k: number }[] = [{ h: a.pos, k: 0 }];
  while (offen.length > 0) {
    offen.sort((x, y) => x.k - y.k);
    const { h, k } = offen.shift()!;
    if (k > (kosten.get(hexKey(h.q, h.r)) ?? Infinity) || k >= a.schritte) continue;
    for (const [dq, dr] of HEX_DIRS) {
      const n = { q: h.q + dq, r: h.r + dr };
      const nk = hexKey(n.q, n.r);
      if (!erkundet.has(nk) || !betretbar(a, n.q, n.r) || besetzt.has(nk) || hindernis.has(nk)) continue;
      const k2 = Math.min(a.schritte, k + schrittKosten(a, n.q, n.r));
      if (k2 < (kosten.get(nk) ?? Infinity)) {
        kosten.set(nk, k2);
        offen.push({ h: n, k: k2 });
      }
    }
  }
  kosten.delete(hexKey(a.pos.q, a.pos.r));
  const ergebnis = new Set(kosten.keys());
  erreichbarCache.set(a, ergebnis);
  return ergebnis;
}

function wegZu(a: Zustand, ziel: Hex): Hex[] {
  const zielK = hexKey(ziel.q, ziel.r);
  const erkundet = new Set(a.erkundet);
  if (!erkundet.has(zielK)) return [];
  const besetzt = new Set(a.schleime.map((s) => hexKey(s.q, s.r)));
  // Leute, Tiere und Wanderer stehen im Weg - der Weg fuehrt um sie herum (Spieltest).
  // Schafe und Wanderer machen Platz, erloschene Altaere sind begehbar.
  const hindernis = new Set([...(a.orte ?? []).filter((o) => !((o.art === 'altar' || o.art === 'ereignis') && o.benutzt)), ...(a.tiere ?? []).filter((t) => t.art !== 'schaf')].map((x) => hexKey(x.q, x.r)));
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
      if (!erkundet.has(nk) || !betretbar(a, n.q, n.r) || (hindernis.has(nk) && nk !== zielK)) continue;
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

/** Bilder fuer Wahl-Moeglichkeiten, die kein Gegenstand sind. */
const WAHL_BILD: Record<string, string> = {
  extraherz: 'herz',
  goldsack: 'muenze',
  fluch_oeffnen: 'fluchtruhe',
  fluch_lassen: 'stiefel',
  ev_beten: 'herz',
  ev_pluendern: 'muenze',
  ev_weiter: 'stiefel',
  ev_helfen: 'kraut',
  ev_ausrauben: 'beutel',
  ev_wetten: 'wuerfel',
  ev_hoch: 'glueckswuerfel',
  ev_trinken: 'heilwuerfel',
  ev_fuellen: 'kraut',
  ev_karte: 'auge',
  ev_omen: 'blitz',
};

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
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

/**
 * Der Wuerfel: er taumelt ueber den Tisch, die Augen flackern immer langsamer
 * durch, dann landet er mit einem Ruck, Staub und einem goldenen Schein.
 */
/** Farben der Wuerfel: Flaeche, Licht, Schatten, Augen. */
const WUERFEL_FARBE: Record<string, [string, string, string, string]> = {
  '': ['#f2e7d0', '#fffaf0', '#cdb68e', '#2a1f16'],
  glueckswuerfel: ['#6aa85a', '#8fd07a', '#3f6b32', '#f2e7d0'],
  bleiwuerfel: ['#9a958a', '#b9b3a6', '#6f695e', '#2a1f16'],
  zwillingswuerfel: ['#5aa0d8', '#8ac4f0', '#3a6a9a', '#f2e7d0'],
  wanderwuerfel: ['#d2a56a', '#e8c590', '#9a6b3a', '#2a1f16'],
  fluchwuerfel: ['#8a2a20', '#b0483a', '#5a1a14', '#f2c94c'],
  goldwuerfel: ['#f2c94c', '#fff0a0', '#a97c28', '#2a1f16'],
  funkenwuerfel: ['#f2e7d0', '#fffaf0', '#cdb68e', '#e8641e'],
  kraeuterwuerfel: ['#c8d890', '#e0ecb0', '#8aa060', '#3f6b32'],
  runenwuerfel: ['#3a6a9a', '#5a8ac0', '#24466a', '#9ad8ff'],
  schildwuerfel: ['#c9ccd6', '#e8eaf0', '#8a8e9a', '#3a6a9a'],
  heilwuerfel: ['#f2e7d0', '#fffaf0', '#cdb68e', '#c8402f'],
  bannwuerfel: ['#7a4fa8', '#9a70c8', '#4f2f78', '#e8d4ff'],
};

/** Die Flaeche eines Wuerfels: Augen bis sechs, darueber die Zahl. */
function WuerfelFlaeche({ n, art, klein = false }: { n: number | null; art: string; klein?: boolean }) {
  const [flaeche, licht, schatten, auge] = WUERFEL_FARBE[art] ?? WUERFEL_FARBE['']!;
  const augen = n && n <= 6 ? AUGEN[n]! : [];
  const effekt = n !== null && (WUERFEL_EFFEKT[art] ?? []).includes(n);
  return (
    <svg className={klein ? 'ab-wuerfel klein' : 'ab-wuerfel'} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-label={n ? `Wurf ${n}` : 'Wuerfel'}>
      {/* Koerper mit abgeschraegten Ecken, Licht oben links, Schatten unten rechts. */}
      <path d="M5 2 H27 V3 H29 V5 H30 V27 H29 V29 H27 V30 H5 V29 H3 V27 H2 V5 H3 V3 H5 Z" fill="#2a1f16" />
      <path d="M5 4 H27 V5 H28 V27 H27 V28 H5 V27 H4 V5 H5 Z" fill={flaeche} />
      <path d="M5 4 H27 V6 H6 V27 H4 V5 H5 Z" fill={licht} />
      <path d="M28 7 V27 H27 V28 H7 V26 H26 V7 Z" fill={schatten} />
      {augen.map(([x, y], i) => (
        <rect key={i} x={7 + x * 7} y={7 + y * 7} width="5" height="5" fill={effekt ? '#f6c04a' : n === 1 ? '#b8322a' : auge} />
      ))}
      {/* Eine Augenzahl mit Seiteneffekt: die Augen leuchten golden, der Rand gluet. */}
      {effekt && <path d="M5 2 H27 V3 H29 V5 H30 V27 H29 V29 H27 V30 H5 V29 H3 V27 H2 V5 H3 V3 H5 Z" fill="none" stroke="#f6c04a" strokeWidth="1" />}
      {n !== null && n > 6 && (
        <text x="16" y="17" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace" fontWeight="bold" fontSize="15" fill={auge}>
          {n}
        </text>
      )}
    </svg>
  );
}

function Wuerfel({ n, wurfNr, matt, art, zweiter }: { n: number | null; wurfNr: number; matt: boolean; art: string; zweiter: number | null }) {
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
      if (i >= 4) {
        klang('wuerfelLand');
        setGezeigt(ziel.current);
        setStand('landet');
        t = window.setTimeout(() => setStand('ruht'), 300);
        return;
      }
      const seiten = WUERFEL_SEITEN[art] ?? 6;
      setGezeigt((alt) => {
        let neu = 1 + Math.floor(Math.random() * seiten);
        if (neu === alt) neu = (neu % seiten) + 1;
        return neu;
      });
      // Jeder Wechsel der Augen klackert - erst schnell, dann langsamer.
      klang('wuerfelKlack');
      t = window.setTimeout(schritt, 30 + i * i * 6);
    };
    schritt();
    return () => window.clearTimeout(t);
  }, [wurfNr]);
  return (
    <div className={`ab-wuerfel-platz ${stand}${matt && stand === 'ruht' ? ' matt' : ''}`}>
      <span className="ab-wuerfel-schatten" />
      <WuerfelFlaeche n={gezeigt} art={art} />
      {/* Der Zwillingswuerfel: der zweite Wurf klein daneben. */}
      {art === 'zwillingswuerfel' && stand === 'ruht' && zweiter !== null && <WuerfelFlaeche n={zweiter} art={art} klein />}
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
        // Der Ritter nimmt Schaden: ein eigener Laut.
        if (e.ziel === 'ritter' && e.schaden > 0) spaeter(e.takt + 0.5, 'autsch');
      }
    } else if (e.art === 'ansage') spaeter(e.takt + 0.2, 'warnung');
    else if (e.art === 'stampf') spaeter(e.takt + 0.5, 'beben');
    else if (e.art === 'spuck') spaeter(e.takt + 0.1, 'spuck');
    else if (e.art === 'legende' || e.art === 'wiederbelebt' || e.art === 'zauber') spaeter(e.takt, 'legende');
    else if (e.art === 'angeln') {
      spaeter(e.takt, 'hieb');
      spaeter(e.takt + 0.4, 'leer');
      if (e.fang) spaeter(e.takt + 1, 'bereit');
    } else if (e.art === 'stufe') spaeter(e.takt + 0.3, 'stufe');
    else if (e.art === 'faehigkeit') spaeter(e.takt + 0.1, e.name === 'feuerkreis' ? 'feuer' : e.name === 'runenblitz' ? 'blitz' : 'bereit');
    else if (e.art === 'boss') spaeter(e.takt, 'beben');
    else if (e.art === 'treffen') spaeter(e.takt, 'probe');
    else if (e.art === 'akt' || e.art === 'sieg') {
      spaeter(e.takt + 0.2, 'legende');
      spaeter(e.takt + 0.9, 'stufe');
    } else if (e.art === 'wahl') spaeter(e.takt + 0.1, 'bereit');
    else if (e.art === 'geladen') spaeter(e.takt + 0.2, 'bereit');
    else if (e.art === 'fluch') spaeter(e.takt + 0.4, 'autsch');
    else if (e.art === 'wuerfelEffekt') spaeter(e.takt + 0.35, 'bereit');
    else if (e.art === 'faellt') spaeter(e.takt + 0.5, 'autsch');
    else if (e.art === 'kreis') spaeter(e.takt + 0.2, e.name === 'heilkreis' ? 'bereit' : e.name === 'schutzrune' ? 'geblockt' : e.name === 'bannkreis' ? 'blitz' : 'feuer');
    else if (e.art === 'tod') spaeter(e.takt + 0.5, 'zerplatzt');
  }
}

// --- Das Spiel -------------------------------------------------------------

type Anim = { start: number; ev: Ereignis[] };
type Ansicht = {
  camX: number;
  camY: number;
  f: number;
  dpr: number;
  w: number;
  h: number;
};

export function Abenteuer({ onZurueck }: { onZurueck: () => void }) {
  const [a, setA] = useState<Zustand>(() => lade() ?? neuesAbenteuer(neuerSeed()));
  const [geladen, setGeladen] = useState(false);
  const [gedrueckt, setGedrueckt] = useState<{
    taste: Taste;
    n: number;
  } | null>(null);
  const [zugTasten, setZugTasten] = useState<Taste[]>([]);
  const [wurfNr, setWurfNr] = useState(0);
  const [rollt, setRollt] = useState(false);
  const [musik, setMusik] = useState(musikAn);
  const [laut, setLaut] = useState(lautstaerke);
  const [tipp, setTipp] = useState<Tipp>(null);
  const [legendenOffen, setLegendenOffen] = useState(false);
  // Fortschritt ueber die Abenteuer (Ruhm, Freischaltungen) und das Lager.
  const [meta, setMetaState] = useState<Meta>(ladeMeta);
  const setMeta = useCallback((m: Meta) => {
    setMetaState(m);
    speichereMeta(m);
  }, []);
  // Das Lager zeigt sich, wenn kein Abenteuer laeuft - beim allerersten Mal nicht (gleich losspielen).
  const [logOffen, setLogOffen] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const [lager, setLager] = useState(() => lade() === null && ladeMeta().laeufe > 0);
  const [hilfeOffen, setHilfeOffen] = useState(false);
  const offen = useRef({ lager, legenden: legendenOffen, hilfe: hilfeOffen });
  offen.current = { lager, legenden: legendenOffen, hilfe: hilfeOffen };
  const [track, setTrack] = useState(laufenderTrack);
  useEffect(() => beiTrack(setTrack), []);
  // Welche Figur der Spieler fuehrt (Debugfenster) - 'klassik' ist der bisherige Ritter.
  const [figur, setFigur] = useState(leseFigur);
  const figurRef = useRef(figur);
  // Die Klasse bestimmt die Figur (der Ritter behaelt die gewaehlte).
  figurRef.current = a.klasse && a.klasse !== 'ritter' ? KLASSEN[a.klasse].figur : figur;
  // Autoroll: wer laufen will, waehrend der Wurf noch aussteht, wuerfelt gleich mit.
  const [autoroll, setAutoroll] = useState(leseAutoroll);
  const autorollRef = useRef(autoroll);
  autorollRef.current = autoroll;
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);

  useEffect(() => speichere(a), [a]);
  // Das offene Log zeigt immer das Neueste unten.
  useEffect(() => {
    if (logOffen && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [a.log.length, logOffen]);
  // Am Ende eines Abenteuers: Ruhm, Bestwerte, Siege, Heldenstufe - genau einmal.
  useEffect(() => {
    if (a.phase !== 'tot' && a.phase !== 'sieg') return;
    const m = ladeMeta();
    const schluessel = `${a.seed}:${a.zug}:${a.phase}`;
    if (m.belohnt.includes(schluessel)) return;
    const neu = belohne(m, a, ruhmFuer(a));
    setMeta({ ...neu, belohnt: [...m.belohnt, schluessel] });
  }, [a, setMeta]);
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
  // Die Landschaft fuer die Musik: was rund um den Ritter ueberwiegt - und der Koenig, wenn er nah ist.
  const nahBoss = a.schleime.find((x) => x.boss && hexDistance(x, a.pos) <= 8);
  const koenigNah = nahBoss ? (nahBoss.bossArt ?? 'koenig') : null;
  // Mit Traegheit: erst wenn eine neue Landschaft im Umkreis von 4 Feldern
  // klar ueberwiegt (60 %), wechselt das Thema - am Rand kein Hin und Her.
  const musikBiom = useRef<Biom>('wiese');
  useEffect(() => {
    // Jeder Boss hat sein eigenes Thema.
    if (koenigNah) return setzeBiom('boss', koenigNah);
    const zaehl: Partial<Record<Biom, number>> = {};
    let alle = 0;
    for (const h of hexesInRange(a.pos, 4)) {
      const b = MUSIK_BIOM[feldInfo(a.seed, h.q, h.r).boden];
      if (!b) continue;
      zaehl[b] = (zaehl[b] ?? 0) + 1;
      alle += 1;
    }
    const [staerkste, anzahl] = (Object.entries(zaehl) as [Biom, number][]).sort((x, y) => y[1] - x[1])[0] ?? [musikBiom.current, 0];
    if (staerkste !== musikBiom.current && alle > 0 && anzahl / alle >= 0.6) musikBiom.current = staerkste;
    setzeBiom(musikBiom.current);
  }, [a.seed, a.pos, koenigNah]);

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
  /** Was auf den erkundeten Feldern liegt - einmal je Aenderung berechnet, nicht je Bild. */
  const funde = useRef<{ fuer: unknown; karte: Map<string, string> }>({ fuer: null, karte: new Map() });
  const fundeErkundet = useRef(0);
  /** Wann ein Feld zum ersten Mal ins Bild kam - neue Kacheln fallen hinein. */
  const enthuellt = useRef<Map<string, number> | null>(null);
  const fallBis = useRef(0);
  /** Die Kamera (Welt-Punkt in der Bildmitte) - sie folgt dem Ritter weich. */
  const kamera = useRef<{ x: number; y: number } | null>(null);
  const kameraFaehrt = useRef(false);
  /** Seit wann das Banner "Der Schleimkoenig erwacht" steht. */
  const banner = useRef(0);
  const bannerText = useRef('Der Schleimkoenig erwacht!');
  /** Sprechblasen: wer etwas sagt, bis wann (Bildschirmzeit). */
  const blasen = useRef<{ wer: number; text: string; ab: number; bis: number }[]>([]);
  /** Die Uebersichtskarte gross (angetippt) oder klein. */
  const [miniGross, setMiniGross] = useState(false);
  const miniGrossRef = useRef(false);
  miniGrossRef.current = miniGross;

  const setze = useCallback((neu: Zustand) => {
    aktuell.current = neu;
    setTipp(null);
    if (neu.ereignisse.length > 0) {
      anim.current = { start: performance.now(), ev: neu.ereignisse };
      const boss = neu.ereignisse.find((e): e is Extract<Ereignis, { art: 'boss' }> => e.art === 'boss');
      if (boss) {
        banner.current = performance.now();
        bannerText.current = boss.name?.endsWith('rast') ? `Der ${boss.name}!` : `Der ${boss.name ?? 'Schleimkoenig'} erwacht!`;
      }
      if (neu.ereignisse.some((e) => e.art === 'wiederbelebt')) {
        banner.current = performance.now();
        bannerText.current = 'Zweites Leben!';
      }
      const aktE = neu.ereignisse.find((e): e is Extract<Ereignis, { art: 'akt' }> => e.art === 'akt');
      if (aktE) {
        banner.current = performance.now();
        bannerText.current = `Akt ${aktE.akt}: ${aktE.name}`;
      }
      if (neu.ereignisse.some((e) => e.art === 'sieg')) {
        banner.current = performance.now();
        bannerText.current = 'Sieg! Der Endboss ist bezwungen!';
        fallBis.current = performance.now() + 7000;
      }
      const leg = neu.ereignisse.find((e): e is Extract<Ereignis, { art: 'legende' }> => e.art === 'legende');
      if (leg) {
        banner.current = performance.now();
        bannerText.current =
          leg.id === 'pentagramm2' ? 'Pentagrammmeister Stufe 2!' : leg.id === 'pentagramm3' ? 'Pentagrammmeister Stufe 3!' : `Legendaer: ${gegenstand(leg.id)?.name ?? leg.id}`;
      }
      // Sprueche als Blasen - ein wenig nach ihrem Takt, dann gut drei Sekunden lang.
      const jetzt = performance.now();
      for (const e of neu.ereignisse) {
        if (e.art !== 'spruch') continue;
        const ab = jetzt + e.takt * TAKT_MS;
        blasen.current = [...blasen.current.filter((b) => b.wer !== e.wer && b.bis > jetzt), { wer: e.wer, text: e.text, ab, bis: ab + 3400 }];
      }
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
        window.setTimeout(() => schritt(t), ROLL_MS + 30);
        return;
      }
      schritt(t);
    },
    [halt, schritt],
  );
  /**
   * Angeln (F): wie S ein Schritt, der vergeht - am Wasser wirft der Ritter
   * die Angel aus, sonst wartet er. Mit Autoroll wird erst gewuerfelt.
   */
  const angle = useCallback(() => {
    halt();
    if (autorollRef.current && aktuell.current.phase === 'wuerfeln' && !rolltRef.current) {
      wirfRef.current();
      window.setTimeout(() => angle(), ROLL_MS + 30);
      return;
    }
    const alt = aktuell.current;
    if (alt.phase !== 'ziehen' || rolltRef.current) return;
    const neu = angeln(alt);
    if (neu === alt) return void schritt('s');
    setZugTasten((z) => [...z, 's']);
    setze(neu);
  }, [halt, schritt, setze]);
  /** Glueckswuerfel: neu wuerfeln - mit Rollen und Klackern wie beim ersten Wurf. */
  const neuWurf = useCallback(() => {
    const alt = aktuell.current;
    if (!kannNeuWuerfeln(alt) || rolltRef.current) return;
    halt();
    rolltRef.current = true;
    setRollt(true);
    window.setTimeout(() => {
      rolltRef.current = false;
      setRollt(false);
    }, ROLL_MS + 10);
    setWurfNr((n) => n + 1);
    setze(neuWuerfeln(alt));
  }, [halt, setze]);
  const wirf: () => void = useCallback(() => {
    const alt = aktuell.current;
    if (alt.phase !== 'wuerfeln' || rolltRef.current) return;
    halt();
    rolltRef.current = true;
    setRollt(true);
    window.setTimeout(() => {
      rolltRef.current = false;
      setRollt(false);
    }, ROLL_MS + 10);
    setWurfNr((n) => n + 1);
    setZugTasten([]);
    setze(wuerfeln(alt));
  }, [halt, setze]);
  wirfRef.current = wirf;
  // Autoroll wuerfelt von selbst, sobald ein neuer Zug ansteht (Spieltest: "Autoroll tut nichts").
  useEffect(() => {
    if (!autoroll || a.phase !== 'wuerfeln' || a.wahl || a.laden != null || lager) return;
    const t = window.setTimeout(() => {
      if (autorollRef.current && aktuell.current.phase === 'wuerfeln' && !aktuell.current.wahl && aktuell.current.laden == null) wirfRef.current();
    }, 450);
    return () => window.clearTimeout(t);
  }, [autoroll, a.phase, a.wahl, a.laden, a.zug, lager]);

  /** Den Weg zu einem Feld gehen, Schritt fuer Schritt, im Takt der Bilder. */
  const geheWeiter = useCallback(() => {
    const l = lauf.current;
    const a0 = aktuell.current;
    // Ein offener Laden oder eine Wahl haelt den Weg an.
    if (!l || a0.phase !== 'ziehen' || a0.laden != null || a0.wahl) return halt();
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
      // Einen Haendler oder Werber nebenan antippen: ansprechen - in jeder Phase.
      const o = ortAuf(a0, h.q, h.r);
      if (o && hexDistance(o, a0.pos) <= 1) return void setze(ansprechen(a0, o.id));
      if (a0.phase === 'wuerfeln') {
        wirf();
        // Mit Autoroll geht es nach dem Wurf gleich zum angetippten Feld.
        if (autorollRef.current) window.setTimeout(() => tippeRef.current(h), ROLL_MS + 30);
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
      const jetzt = aktuell.current;
      // Offene Fenster fangen die Tasten ab (Spieltest: "S lief unter dem Laden weiter").
      if (offen.current.lager) return;
      if (offen.current.legenden) {
        if (k === 'escape') setLegendenOffen(false);
        return;
      }
      if (offen.current.hilfe) {
        if (k === 'escape' || e.key === '?') setHilfeOffen(false);
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setHilfeOffen(true);
        return;
      }
      if (jetzt.wahl) {
        const nr = ['1', '2', '3'].indexOf(e.key);
        if (nr >= 0) {
          e.preventDefault();
          setze(waehlen(jetzt, nr));
        }
        return;
      }
      if (jetzt.laden != null) {
        if (k === 'escape') setze(ladenZu(jetzt));
        return;
      }
      if (e.key === '1') {
        e.preventDefault();
        setze(faehigkeitNutzen(jetzt));
        return;
      }
      if (k === 'h') {
        e.preventDefault();
        const id = heilmittel(jetzt);
        if (id) setze(benutzen(jetzt, id));
        // Spieltest: "H ohne Kraeuter tut nichts" - sagen, warum.
        else setze({ ...jetzt, ereignisse: [], log: [...jetzt.log, 'Nichts zum Heilen im Gepaeck - Kraeuter findest du in der Wildnis oder beim Haendler.'] });
        return;
      }
      if ((TASTEN as readonly string[]).includes(k)) {
        e.preventDefault();
        drueck(k as Taste);
      } else if (k === 'l') {
        e.preventDefault();
        setLogOffen((x) => !x);
      } else if (k === 'r') {
        e.preventDefault();
        neuWurf();
      } else if (k === 'b') {
        e.preventDefault();
        if (!rolltRef.current) setze(beschwoeren(aktuell.current));
      } else if (k === 'f') {
        e.preventDefault();
        halt();
        angle();
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
      setzeHoehenSeed(a.seed);
      const ende = letzterTakt(ev) + 1 + NACHKLANG;
      const bewegt = p < ende;
      // Steht alles wieder still (nur Zahlen steigen noch), zeigen sich Tasten und Wege.
      const still = p >= letzterTakt(ev) + 1;
      // In Ruhe genuegen zwoelf Bilder je Sekunde fuers Atmen - ausser Kacheln fallen gerade.
      if (!bewegt && !kameraFaehrt.current && jetzt > fallBis.current && jetzt - zuletzt < 80) return;
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
      for (const t of a.tiere ?? []) schleimEnde.set(t.id, t);
      for (const g of a.gefolge ?? []) schleimEnde.set(g.id, g);
      for (const w of a.wanderer ?? []) schleimEnde.set(w.id, w);
      for (const e of ev) if (e.art === 'faellt') schleimEnde.set(e.wer, { q: e.q, r: e.r });
      const endeVon = (wer: Wer): Hex => (wer === 'ritter' ? a.pos : (schleimEnde.get(wer) ?? a.pos));
      const ort = (wer: Wer): { x: number; y: number; hoch: number } => {
        // Springschleime fliegen hoch, alle anderen huepfen.
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
              // Der Schattenschleim springt nicht - er verschwindet und taucht woanders auf.
              if (g.blink) {
                const m = mitte((u < 0.5 ? g.von : g.nach).q, (u < 0.5 ? g.von : g.nach).r);
                return { x: m.x, y: m.y, hoch: 0 };
              }
              const hoch = wer === 'ritter' && !g.sprung ? Math.abs(Math.sin(u * Math.PI * 2)) * 1.5 : Math.sin(u * Math.PI) * (g.sprung ? 18 : 7);
              return {
                x: m0.x + (m1.x - m0.x) * u,
                y: m0.y + (m1.y - m0.y) * u,
                hoch,
              };
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
          return {
            dx: e.schaden > 0 ? Math.round(Math.sin(u * 60) * 1.2) : 0,
            blitz: e.schaden > 0 && u < 0.8,
          };
        }
        return { dx: 0, blitz: false };
      };

      const ritter = ort('ritter');
      // Ruhigere Kamera (Spieltest: "die ganze Karte springt bei jedem Schritt"):
      // sie folgt erst, wenn der Ritter ein Stueck aus der Mitte laeuft, und dann weich.
      const kam = kamera.current;
      if (!kam || Math.hypot(ritter.x - kam.x, ritter.y - kam.y) > 160) kamera.current = { x: ritter.x, y: ritter.y };
      else {
        const RAND_X = 26;
        const RAND_Y = 18;
        const zielX = Math.min(Math.max(kam.x, ritter.x - RAND_X), ritter.x + RAND_X);
        const zielY = Math.min(Math.max(kam.y, ritter.y - RAND_Y), ritter.y + RAND_Y);
        kam.x += (zielX - kam.x) * 0.2;
        kam.y += (zielY - kam.y) * 0.2;
        kameraFaehrt.current = Math.abs(zielX - kam.x) + Math.abs(zielY - kam.y) > 0.3;
      }
      const camX = kamera.current!.x;
      const camY = kamera.current!.y;
      ansicht.current = { camX, camY, f, dpr, w: c.width, h: c.height };
      const sx = (x: number) => Math.round((x - camX) * f + c.width / 2);
      const sy = (y: number) => Math.round((y - camY) * f + c.height / 2);
      const erkundet = new Set(a.erkundet);
      const sicht = sichtVon(a);
      const radius = Math.ceil(Math.max(c.width, c.height) / (17 * f)) + 2;
      const felder = hexesInRange(a.pos, radius).sort((p1, p2) => p1.r - p2.r || p1.q - p2.q);
      // Beim ersten Bild gilt alles als laengst da - danach fallen neue Kacheln hinein.
      if (!enthuellt.current) enthuellt.current = new Map(a.erkundet.map((k) => [k, 0]));
      const FALL_MS = 380;
      // Kacheln: gesehen und jetzt sichtbar hell, gesehen und fern im Nebel.
      // Kacheln fallen schon drei Felder hinter der Sicht herein (im Nebel) - nicht erst an ihrem Rand.
      const NEBEL_RAND = 3;
      for (const hx of felder) {
        const k = hexKey(hx.q, hx.r);
        if (!erkundet.has(k) && hexDistance(hx, a.pos) > sicht + NEBEL_RAND) continue;
        let seit = enthuellt.current.get(k);
        if (seit === undefined) {
          // Ein wenig versetzt je Feld, damit der Rand nicht als Block faellt.
          seit = jetzt + (hash3i(a.seed, hx.q, hx.r, 77) % 120);
          enthuellt.current.set(k, seit);
          fallBis.current = Math.max(fallBis.current, seit + FALL_MS);
        }
        const fall = seit === 0 ? 1 : klemme((jetzt - seit) / FALL_MS);
        if (fall <= 0) continue;
        const fallY = (1 - sanft(fall)) * -28;
        const url = kachelUrlNachName(feldInfo(a.seed, hx.q, hx.r).kachel, a.seed, hx.q, hx.r);
        if (!url) continue;
        const nah = hexDistance(hx, a.pos) <= sicht;
        const bild = nah ? tileImage(url) : tileImageFog(url);
        if (!bild) continue;
        const e = kachelEcke(hx.q, hx.r);
        const lift = anhebung(hx.q, hx.r);
        ctx.globalAlpha = fall < 1 ? fall : 1;
        // Klippen: unter der gehobenen Kachel ihr Rand, alle drei Pixel eine Stufe.
        for (let dy = lift; dy > 0; dy -= 3) ctx.drawImage(bild, sx(e.x), sy(e.y - lift + dy + fallY), IMG_W * f, IMG_H * f);
        ctx.drawImage(bild, sx(e.x), sy(e.y - lift + fallY), IMG_W * f, IMG_H * f);
        ctx.globalAlpha = 1;
      }
      // Giftpfuetzen: violett schimmernd, mit Blasen.
      for (const g of a.gift ?? []) {
        if (g.bis <= a.zeit || hexDistance(g, a.pos) > sicht + 1) continue;
        const m = mitte(g.q, g.r);
        ctx.fillStyle = 'rgba(140, 80, 190, 0.45)';
        ctx.beginPath();
        ctx.ellipse(sx(m.x), sy(m.y + 1), 8 * f, 4 * f, 0, 0, Math.PI * 2);
        ctx.fill();
        const blase = (sek * 1.5 + g.q * 0.3) % 1;
        ctx.fillStyle = 'rgba(210, 170, 255, 0.8)';
        ctx.fillRect(sx(m.x - 3 + (g.r % 3) * 2), sy(m.y - blase * 4), f, f);
      }
      // Stufe 2: Zauberkreise bleiben auf der Karte - je Zauber eine Farbe, kurz vor dem Ende flackern sie.
      for (const k of a.kreise ?? []) {
        if (k.bis <= a.zeit) continue;
        const farbe = KREIS_FARBE[k.name];
        const rest = k.bis - a.zeit;
        const flacker = rest <= 2 ? 0.5 + 0.5 * Math.sin(sek * 14) : 1;
        for (const h of k.felder) {
          if (hexDistance(h, a.pos) > sicht + 2) continue;
          const m = mitte(h.q, h.r);
          const puls = 0.75 + 0.25 * Math.sin(sek * 3 + h.q + h.r);
          ctx.globalAlpha = 0.32 * puls * flacker;
          ctx.fillStyle = farbe;
          ctx.beginPath();
          ctx.ellipse(sx(m.x), sy(m.y + 1), 10 * f, 5 * f, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.85 * flacker;
          ctx.strokeStyle = farbe;
          ctx.lineWidth = f;
          ctx.stroke();
          // Ein Runenfunke steigt auf.
          const fl = (sek * 0.8 + (h.q * 7 + h.r * 3) * 0.13) % 1;
          ctx.globalAlpha = (1 - fl) * flacker;
          ctx.fillRect(sx(m.x + ((h.q * 5 + h.r) % 7) - 3), sy(m.y - fl * 10), f, f);
        }
        ctx.globalAlpha = 1;
      }
      // Gebannte Schleime: ein violetter Bannring unter ihnen.
      for (const s of a.schleime) {
        if ((s.gebannt ?? 0) <= a.zeit || hexDistance(s, a.pos) > sicht + 1) continue;
        const m = mitte(s.q, s.r);
        ctx.strokeStyle = `rgba(190, 130, 255, ${0.6 + 0.3 * Math.sin(sek * 5)})`;
        ctx.lineWidth = f;
        ctx.beginPath();
        ctx.ellipse(sx(m.x), sy(m.y + 2), 9 * f, 4 * f, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const zentrum = (q: number, r: number) => {
        const m = mitte(q, r);
        return { x: sx(m.x), y: sy(m.y) };
      };
      // Deko: Kakteen in der Wueste, Blumen auf Wiesen, Pilze im Wald - je Feld aus dem Seed.
      for (const hx of felder) {
        if (!erkundet.has(hexKey(hx.q, hx.r))) continue;
        const t = feldInfo(a.seed, hx.q, hx.r).boden;
        const art = t === 'sand' || t === 'duenen' ? 'kaktus' : t === 'wiese' ? 'blume' : t === 'wald' || t === 'taiga' ? 'pilz' : null;
        if (!art) continue;
        const h = hash3i(a.seed, hx.q, hx.r, 91) % 100;
        const anzahl = art === 'kaktus' ? (h < 35 ? 1 : h < 50 ? 2 : 0) : h < 18 ? (art === 'blume' ? 2 : 1) : 0;
        if (anzahl === 0) continue;
        const nah = hexDistance(hx, a.pos) <= sicht;
        ctx.globalAlpha = nah ? 1 : 0.45;
        const m = mitte(hx.q, hx.r);
        for (let i = 0; i < anzahl; i++) {
          const ox = ((hash3i(a.seed, hx.q, hx.r, 92 + i) % 13) - 6) * 1;
          const oy = ((hash3i(a.seed, hx.q, hx.r, 95 + i) % 7) - 3) * 1;
          const k = DEKO[art];
          zeichnePixel(ctx, k, sx(m.x + ox - k[0]!.length / 2), sy(m.y + oy - k.length + 2), f, KACHEL_PIX);
        }
        ctx.globalAlpha = 1;
      }
      if (funde.current.fuer !== a.genommen) {
        // Neu berechnen, wenn sich das Genommene (oder das Erkundete) aendert.
        const karte = new Map<string, string>();
        for (const k of a.erkundet) {
          const [q, rr] = k.split(':').map(Number) as [number, number];
          const fd = fundAuf(a, q, rr);
          if (fd) karte.set(k, fd);
        }
        funde.current = { fuer: a.genommen, karte };
        fundeErkundet.current = a.erkundet.length;
      } else if (fundeErkundet.current !== a.erkundet.length) {
        for (const k of a.erkundet.slice(fundeErkundet.current)) {
          const [q, rr] = k.split(':').map(Number) as [number, number];
          const fd = fundAuf(a, q, rr);
          if (fd) funde.current.karte.set(k, fd);
        }
        fundeErkundet.current = a.erkundet.length;
      }
      const fundKarte = funde.current.karte;
      // Funde auf allen erkundeten Feldern - in Sicht hell und schwebend, im Nebel blasser.
      for (const hx of felder) {
        const fund = fundKarte.get(hexKey(hx.q, hx.r));
        if (!fund || !SYMBOL[fund]) continue;
        const nah = hexDistance(hx, a.pos) <= sicht;
        const pz = zentrum(hx.q, hx.r);
        const karte = SYMBOL[fund]!;
        const schweb = nah ? Math.round(Math.sin(sek * 2 + hx.q * 1.3 + hx.r) * 1) * f : 0;
        ctx.globalAlpha = nah ? 1 : 0.55;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(pz.x - 3 * f, pz.y + f, 6 * f, f);
        zeichnePixel(ctx, karte, pz.x - Math.floor((karte[0]!.length * f) / 2), pz.y - karte.length * f + schweb, f, PIX);
        ctx.globalAlpha = 1;
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
      // Erreichbare Felder leicht aufgehellt - man sieht, wie weit der Wurf traegt.
      if (a.phase === 'ziehen' && still && a.schritte > 0) {
        ctx.fillStyle = 'rgba(255, 236, 170, 0.13)';
        ctx.strokeStyle = 'rgba(255, 236, 170, 0.28)';
        ctx.lineWidth = Math.max(1, Math.round(f * 0.5));
        for (const k of erreichbar(a)) {
          const [q, r] = k.split(':').map(Number) as [number, number];
          if (hexDistance({ q, r }, a.pos) > sicht) continue;
          feldUmriss(q, r);
          ctx.fill();
          ctx.stroke();
        }
      }
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
        const ende = {
          x: von.x + (nach.x - von.x) * wachs,
          y: von.y + (nach.y - von.y) * wachs,
        };
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
      // Spieltest: "Welches Feld ist der Koloss?" - das Feld eines Bosses hat einen roten Rahmen,
      // angreifbare Nachbarn einen hellen (das Ziel eines Hiebs).
      if (still) {
        for (const s of a.schleime) {
          const d = hexDistance(s, a.pos);
          if (d > sicht) continue;
          if (s.boss) {
            feldUmriss(s.q, s.r);
            ctx.strokeStyle = `rgba(255, 70, 50, ${0.65 + 0.25 * Math.sin(sek * 4)})`;
            ctx.lineWidth = Math.max(2, f);
            ctx.stroke();
          } else if (d === 1 && a.phase === 'ziehen') {
            feldUmriss(s.q, s.r);
            ctx.strokeStyle = 'rgba(242, 231, 208, 0.75)';
            ctx.lineWidth = Math.max(1, Math.round(f * 0.7));
            ctx.stroke();
          }
        }
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
      const malSchleim = (art: SchleimArt | undefined, x: number, y: number, fs: number, o: { sx?: number; sy?: number; alpha?: number; blitz?: boolean }) => {
        const bild = SCHLEIM_BILD[art ?? 'schleim'];
        const links = -Math.floor(bild[0]!.length / 2) * fs;
        ctx.save();
        ctx.globalAlpha = o.alpha ?? 1;
        ctx.translate(x, y);
        ctx.scale(o.sx ?? 1, o.sy ?? 1);
        zeichnePixel(ctx, bild, links, -bild.length * fs, fs, KACHEL_PIX);
        if (o.blitz) {
          ctx.filter = 'brightness(4) saturate(0)';
          ctx.globalAlpha = (o.alpha ?? 1) * 0.7;
          zeichnePixel(ctx, bild, links, -bild.length * fs, fs, KACHEL_PIX);
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
        ...a.schleime.map((s) => ({
          id: s.id,
          gross: s.gross,
          boss: !!s.boss,
          bossArt: s.bossArt,
          max: s.max,
          art: s.art,
          leben: s.leben,
          elite: !!s.elite,
          tot: null as number | null,
        })),
        ...ev.flatMap((e) =>
          e.art === 'tod' && !lebende.has(e.wer)
            ? [
                {
                  id: e.wer,
                  gross: e.gross,
                  boss: !!e.boss,
                  bossArt: e.bossArt,
                  max: undefined,
                  art: e.schleimArt,
                  leben: 0,
                  elite: false,
                  tot: e.takt,
                },
              ]
            : [],
        ),
      ];
      for (const s of schleimeImBild) {
        const o0 = ort(s.id);
        if (hexDistance(feldBei(o0.x, o0.y), a.pos) > sicht) continue;
        const o = stoss(s.id, o0.x, o0.y);
        const wu = wucht(s.id);
        const fs = s.gross ? f + Math.max(1, Math.round(f / 2)) : f;
        const max = schleimMaxLeben(s);
        const hoehe = SCHLEIM_BILD[s.art ?? 'schleim'].length;
        // Atmen: ein Schleim quillt und sackt, jeder in seinem Takt.
        const atem = Math.sin(sek * 3.1 + s.id * 1.7);
        let skx = 1 - atem * 0.06;
        let sky = 1 + atem * 0.08;
        let alpha = 1;
        let hoch = o0.hoch;
        // Jede Art hat ihr eigenes Gebaren.
        if (s.art === 'spuck') {
          // Blaest die Backen auf und laesst die Luft wieder raus.
          const backe = Math.max(0, Math.sin(sek * 2.4 + s.id));
          skx = 1 + backe * 0.12;
          sky = 1 - backe * 0.04;
        } else if (s.art === 'spring') {
          // Huepft unruhig auf der Feder.
          const hops = Math.abs(Math.sin(sek * 4.5 + s.id));
          hoch += hops * 2.5;
          skx = hops > 0.3 ? 0.94 : 1.1;
          sky = hops > 0.3 ? 1.08 : 0.85;
        } else if (s.art === 'geist') {
          // Schwebt und flackert - von weitem kaum zu sehen.
          hoch += 1.5 + Math.sin(sek * 2 + s.id) * 1.5;
          alpha = hexDistance(feldBei(o0.x, o0.y), a.pos) <= 2 ? 0.85 : 0.3 + 0.1 * Math.sin(sek * 5 + s.id);
        } else if (s.art === 'teil') {
          // Die zwei Lappen wackeln gegeneinander.
          skx = 1 + Math.sin(sek * 6 + s.id) * 0.07;
          sky = 1 - Math.sin(sek * 6 + s.id) * 0.05;
        } else if (s.art === 'gift') {
          skx = 1 - atem * 0.04;
          sky = 1 + atem * 0.1;
        } else if (s.art === 'panzer') {
          // Liegt schwer da - nur ein leises Heben des Panzers.
          skx = 1;
          sky = 1 + Math.sin(sek * 1.3 + s.id) * 0.02;
        }
        // Beim Huepfen: vorher ducken, in der Luft strecken.
        if (o0.hoch > 0.5) {
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
          // Vor dem Angriff: der Spucker blaest sich auf, der Springer drueckt die Feder, der Panzer rasselt.
          skx = s.art === 'spuck' ? 1.3 : s.art === 'panzer' ? 1.05 : 1.18;
          sky = s.art === 'spuck' ? 0.92 : s.art === 'spring' ? 0.7 : 0.8;
          if (s.art === 'spring') hoch = 0;
          zittern = Math.round(Math.sin(sek * 40) * (s.art === 'panzer' ? 1 : 0.6));
        }
        // Schattensprung: aus- und wieder einblenden.
        const blink = ev.find((e): e is Extract<Ereignis, { art: 'gehen' }> => e.art === 'gehen' && e.wer === s.id && !!e.blink);
        if (blink) {
          const u = p - blink.takt;
          if (u >= 0 && u < 1) alpha = Math.abs(Math.cos(u * Math.PI));
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
            // Elite: ein goldener, flackernder Ring.
            if (s.elite && alpha > 0.3) {
              ctx.strokeStyle = `rgba(246, 192, 74, ${0.6 + 0.3 * Math.sin(sek * 6 + s.id)})`;
              ctx.lineWidth = f;
              ctx.beginPath();
              ctx.ellipse(sx(o.x), sy(o.y) + 3 * f, 7 * f, 3 * f, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
            if (s.boss) {
              // Die Bosse: eigene Bilder, deutlich groesser als ein Feld-Schleim; der Koloss am groessten.
              const bild = s.bossArt === 'schatten' ? SCHATTENSCHLEIM : s.bossArt === 'koloss' ? GELEEKOLOSS : s.bossArt === 'penta' ? PENTASCHLEIM : SCHLEIMKOENIG;
              const kf = Math.max(1, Math.round(f * (s.bossArt === 'koloss' ? 1.5 : 1.35)));
              const kb = bild[0]!.length;
              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.translate(X, Y);
              ctx.scale(skx, sky);
              zeichnePixel(ctx, bild, -Math.floor(kb / 2) * kf, -bild.length * kf, kf, PIX);
              if (wu.blitz) {
                ctx.filter = 'brightness(4) saturate(0)';
                ctx.globalAlpha = alpha * 0.7;
                zeichnePixel(ctx, bild, -Math.floor(kb / 2) * kf, -bild.length * kf, kf, PIX);
              }
              ctx.restore();
              if (holtAus && alpha > 0.3) schrift('!', X + 12 * kf, Y - 10 * kf, '#ff4a3a', 1, 8);
              const bossJetzt = a.schleime.find((x) => x.id === s.id);
              if (still && bossJetzt && a.phase === 'ziehen' && hexDistance(bossJetzt, a.pos) === 1) schrift(`${trefferAb(a, s)}+`, X - 14 * kf, Y - 10 * kf, '#f2e7d0', 0.9, 6);
              return;
            }
            if (s.art === 'bandit') {
              // Der Bandit: ein Mensch in Schwarz mit Axt.
              if (s.tot === null) malPerson(s.id, { x: o.x, y: o.y, hoch: o0.hoch }, 'schwarz', 'axt', wu.blitz);
              if (alpha > 0.3 && lebenJetzt > 0) balken(X, sy(o.y) - 15 * f, lebenJetzt, max);
              if (holtAus) schrift('!', X + 8 * f, sy(o.y) - 14 * f, '#ff4a3a', 1, 7);
              const banditJetzt = a.schleime.find((x) => x.id === s.id);
              if (still && banditJetzt && a.phase === 'ziehen' && hexDistance(banditJetzt, a.pos) === 1) schrift(`${trefferAb(a, s)}+`, X - 9 * f, sy(o.y) - 14 * f, '#f2e7d0', 0.9, 5);
              return;
            }
            malSchleim(s.art, X, Y + f, fs, {
              sx: skx,
              sy: sky,
              alpha,
              blitz: wu.blitz,
            });
            if (alpha > 0.3 && lebenJetzt > 0) balken(X, Y - (hoehe + 2) * fs, lebenJetzt, max);
            if (holtAus && alpha > 0.3) schrift('!', X + 9 * f, Y - (hoehe + 2) * fs, '#ff4a3a', 1, 7);
            // Was man zum Treffen braucht - ueber jedem Gegner nebenan (Spieltest: "die Zielzahl sieht man nie").
            const echt = a.schleime.find((x) => x.id === s.id);
            if (still && echt && a.phase === 'ziehen' && hexDistance(echt, a.pos) === 1) schrift(`${trefferAb(a, s)}+`, X - 9 * f, Y - (hoehe + 1) * fs, '#f2e7d0', 0.9, 5);
          },
        });
      }
      // Menschen im Kachelstil: Soeldner, Wanderer, Banditen, Haendler und Werber.
      const malPerson = (wer: number, o: { x: number; y: number; hoch: number }, designId: string, waffeId: string | null, blitz: boolean) => {
        const design = FIGUREN.find((d) => d.id === designId) ?? FIGUREN[0]!;
        const geht = ev.find((e): e is Extract<Ereignis, { art: 'gehen' }> => e.art === 'gehen' && e.wer === wer && p >= e.takt && p < e.takt + 1);
        const hieb = ev.find((e): e is Extract<Ereignis, { art: 'hieb' }> => e.art === 'hieb' && e.wer === wer && p >= e.takt - 0.05 && p < e.takt + 0.8);
        // Blick: wohin er geht, wen er schlaegt - sonst zum Ritter.
        const zu = geht ? mitte(geht.nach.q, geht.nach.r) : hieb ? (hieb.feld ? mitte(hieb.feld.q, hieb.feld.r) : hieb.ziel !== null ? ort(hieb.ziel) : ritter) : ritter;
        const blickR: 1 | -1 = zu.x < o.x - 0.5 ? -1 : 1;
        const schwung = hieb ? p - hieb.takt : -1;
        const haltung: Haltung = schwung >= 0 ? (schwung < 0.18 ? 'aus' : schwung < 0.45 ? 'hieb' : 'nach') : 'ruhe';
        const beine: BeinBild = geht ? ((p - geht.takt) % 0.5 < 0.25 ? 'lauf1' : 'lauf2') : 'steh';
        // Atmen und ein leises Wippen - jeder in seinem Takt.
        const atmet = !geht && Math.sin(sek * 2 + wer * 1.3) > 0.5 ? 1 : 0;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(sx(o.x) - 4 * f, sy(o.y) + 3 * f, 8 * f, f);
        malKachelFigur(ctx, sx(o.x), sy(o.y) + 4 * f - Math.round(o.hoch + atmet) * f, f, design, beine, haltung, waffeId, blickR, blitz, null);
      };
      for (const g of a.gefolge ?? []) {
        if (hexDistance(g, a.pos) > sicht + 2) continue;
        const o0 = ort(g.id);
        const o = stoss(g.id, o0.x, o0.y);
        const wu = wucht(g.id);
        figuren.push({
          y: o.y,
          mal: () => {
            const bild = g.beschworen ? BEGLEITER_BILD[g.art as keyof typeof BEGLEITER_BILD] : undefined;
            if (bild) {
              // Ein Begleiter: schwebt (Fee, Geist) oder atmet; violetter Schimmer am Boden.
              const schwebt = g.art === 'fee' || g.art === 'lichtgeist';
              const hub = schwebt ? 3 + Math.sin(sek * 3 + g.id) * 2 : Math.sin(sek * 2 + g.id) > 0.5 ? 1 : 0;
              const geht = ev.find((e): e is Extract<Ereignis, { art: 'gehen' }> => e.art === 'gehen' && e.wer === g.id);
              const links = geht ? mitte(geht.nach.q, geht.nach.r).x < mitte(geht.von.q, geht.von.r).x : ritter.x < o.x;
              ctx.fillStyle = 'rgba(181, 138, 224, 0.35)';
              ctx.fillRect(sx(o.x) - 4 * f, sy(o.y) + 3 * f, 8 * f, f);
              ctx.save();
              ctx.globalAlpha = g.art === 'lichtgeist' ? 0.8 : 1;
              ctx.translate(sx(o.x), sy(o.y) + 4 * f - Math.round(o0.hoch + hub) * f - bild.length * f);
              ctx.scale(links ? 1 : -1, 1);
              zeichnePixel(ctx, bild, -Math.floor(bild[0]!.length / 2) * f, 0, f, PIX);
              if (wu.blitz) {
                ctx.filter = 'brightness(4) saturate(0)';
                ctx.globalAlpha = 0.7;
                zeichnePixel(ctx, bild, -Math.floor(bild[0]!.length / 2) * f, 0, f, PIX);
              }
              ctx.restore();
              // Die Fee laesst Funken rieseln.
              if (g.art === 'fee') {
                const fl = (sek * 1.2 + g.id * 0.3) % 1;
                ctx.globalAlpha = 1 - fl;
                ctx.fillStyle = '#f6e07a';
                ctx.fillRect(sx(o.x) + ((g.id * 3 + Math.floor(sek * 2)) % 7) * f - 3 * f, sy(o.y) - (8 - fl * 8) * f, f, f);
                ctx.globalAlpha = 1;
              }
              balken(sx(o.x), sy(o.y) - (bild.length + 4) * f - Math.round(o0.hoch + hub) * f, g.leben, g.max);
              return;
            }
            malPerson(g.id, { ...o, hoch: o0.hoch }, g.art, SOELDNER[g.art].waffe, wu.blitz);
            balken(sx(o.x), sy(o.y) - 15 * f - Math.round(o0.hoch) * f, g.leben, g.max);
            schrift(`${g.lv}`, sx(o.x) + 8 * f, sy(o.y) - 13 * f - Math.round(o0.hoch) * f, '#f2c94c', 1, 5);
          },
        });
      }
      for (const w of a.wanderer ?? []) {
        if (hexDistance(w, a.pos) > sicht) continue;
        const o0 = ort(w.id);
        const o = stoss(w.id, o0.x, o0.y);
        const wu = wucht(w.id);
        figuren.push({
          y: o.y,
          mal: () => {
            malPerson(w.id, { ...o, hoch: o0.hoch }, FRAKTION_FIGUR[w.fraktion], w.fraktion === 'orden' ? 'breitschwert' : 'schwert', wu.blitz);
            // Ein Faehnchen in der Farbe der Fraktion.
            ctx.fillStyle = w.fraktion === 'orden' ? '#dfe9f0' : '#3d6a45';
            ctx.fillRect(sx(o.x) - 6 * f, sy(o.y) - 17 * f, 3 * f, 2 * f);
            if (w.leben < w.max) balken(sx(o.x), sy(o.y) - 15 * f, w.leben, w.max);
          },
        });
      }
      for (const o of a.orte ?? []) {
        if (hexDistance(o, a.pos) > sicht + 1 || !erkundet.has(hexKey(o.q, o.r))) continue;
        const m = mitte(o.q, o.r);
        figuren.push({
          y: m.y,
          mal: () => {
            if (o.art === 'altar') {
              // Der Altar flackert, solange er nicht benutzt ist.
              const bild = o.benutzt ? ALTAR.slice(3) : ALTAR;
              ctx.globalAlpha = o.benutzt ? 0.4 : 1;
              zeichnePixel(ctx, bild, sx(m.x) - 5 * f, sy(m.y) + 3 * f - bild.length * f, f, KACHEL_PIX);
              ctx.globalAlpha = 1;
            } else if (o.art === 'haendler') {
              zeichnePixel(ctx, STAND, sx(m.x) - 8 * f, sy(m.y) - 12 * f, f, KACHEL_PIX);
              malPerson(o.id, { x: m.x, y: m.y - 4, hoch: 0 }, 'zwerg', null, false);
              zeichnePixel(ctx, STAND.slice(7), sx(m.x) - 8 * f, sy(m.y) - 5 * f, f, KACHEL_PIX);
            } else if (o.art === 'ereignis') {
              // Begegnungen: je ihr eigenes Bild, solange sie nicht vorbei sind ein huepfendes "?".
              ctx.globalAlpha = o.benutzt ? 0.45 : 1;
              if (o.ereignis === 'schrein') zeichnePixel(ctx, ALTAR.slice(3), sx(m.x) - 5 * f, sy(m.y) + 3 * f - (ALTAR.length - 3) * f, f, KACHEL_PIX);
              else if (o.ereignis === 'quelle') {
                ctx.fillStyle = '#2d5f8a';
                ctx.beginPath();
                ctx.ellipse(sx(m.x), sy(m.y), 7 * f, 3 * f, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(150, 220, 255, ${0.5 + 0.3 * Math.sin(sek * 3)})`;
                ctx.fillRect(sx(m.x) - 3 * f, sy(m.y) - f, 4 * f, f);
              } else {
                const bild = o.ereignis === 'verletzter' ? 'kachel' : o.ereignis === 'spieler' ? 'zwerg' : 'waldlaeufer';
                malPerson(o.id, { x: m.x, y: m.y, hoch: 0 }, bild, null, false);
              }
              ctx.globalAlpha = 1;
              if (!o.benutzt) schrift('?', sx(m.x) + 7 * f, sy(m.y) - (15 + Math.round(Math.sin(sek * 4))) * f, '#f6c04a', 1, 8);
            } else {
              zeichnePixel(ctx, BANNER, sx(m.x) + 4 * f, sy(m.y) - 14 * f, f, KACHEL_PIX);
              malPerson(o.id, { x: m.x - 2, y: m.y, hoch: 0 }, 'soeldnerin', 'breitschwert', false);
            }
            const nah = hexDistance(o, a.pos) <= 1;
            // Spieltest: "benutzte Altaere sehen aus wie neue".
            const erloschen = (o.art === 'altar' || o.art === 'ereignis') && o.benutzt;
            const name = o.art === 'ereignis' && o.ereignis ? EREIGNIS[o.ereignis].name : ORT_NAME[o.art];
            schrift(erloschen ? `${name} (vorbei)` : name, sx(m.x), sy(m.y) - 20 * f, erloschen ? '#8a8070' : nah ? '#f2c94c' : '#e8dcc0', erloschen ? 0.55 : nah ? 1 : 0.75, 5);
          },
        });
      }
      // Schneehasen: sitzen, mummeln, und huepfen davon (Bild 2 im Sprung).
      for (const t of a.tiere ?? []) {
        if (hexDistance(t, a.pos) > sicht) continue;
        const o = ort(t.id);
        const gehen = ev.find((e): e is Extract<Ereignis, { art: 'gehen' }> => e.art === 'gehen' && e.wer === t.id);
        const springt = o.hoch > 0.5;
        const nachLinks = gehen ? mitte(gehen.nach.q, gehen.nach.r).x < mitte(gehen.von.q, gehen.von.r).x : t.id % 2 === 0;
        if (t.art === 'schaf') {
          // Das Schaf grast (Kopf unten) und schaut ab und zu auf.
          const grast = Math.sin(sek * 0.9 + t.id * 2.1) > -0.2;
          const schaf = SCHAF[grast && o.hoch < 0.5 ? 1 : 0];
          figuren.push({
            y: o.y,
            mal: () => {
              const X = sx(o.x);
              const Y = sy(o.y) + 3 * f - Math.round(o.hoch * 0.4) * f;
              ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
              ctx.fillRect(X - 4 * f, sy(o.y) + 3 * f, 8 * f, f);
              ctx.save();
              ctx.translate(X, Y - schaf.length * f);
              ctx.scale(nachLinks ? 1 : -1, 1);
              zeichnePixel(ctx, schaf, -4 * f, 0, f, PIX);
              ctx.restore();
            },
          });
          continue;
        }
        const bild = HASE[springt ? 1 : 0];
        const mummel = !springt && Math.sin(sek * 7 + t.id) > 0.85 ? 1 : 0;
        figuren.push({
          y: o.y,
          mal: () => {
            const X = sx(o.x);
            const Y = sy(o.y) + 3 * f - Math.round(o.hoch * 0.6) * f;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.fillRect(X - 3 * f, sy(o.y) + 3 * f, 6 * f, f);
            ctx.save();
            ctx.translate(X, Y - bild.length * f - mummel * f);
            ctx.scale(nachLinks ? 1 : -1, 1);
            zeichnePixel(ctx, bild, -3 * f, 0, f, KACHEL_PIX);
            ctx.restore();
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
      const design = FIGUREN.find((d) => d.id === figurRef.current);
      const laeuft = lauf0 !== undefined && p >= lauf0.takt && p < lauf0.takt + 1;
      const haltung: Haltung = schwung >= 0 && schwung < 0.8 ? (schwung < 0.18 ? 'aus' : schwung < 0.45 ? 'hieb' : 'nach') : 'ruhe';
      figuren.push({
        y: ro.y,
        mal: () => {
          // Das bist du: ein goldener Ring am Boden (Spieltest: "welcher Ritter bin ich?").
          ctx.strokeStyle = `rgba(242, 201, 76, ${0.55 + 0.25 * Math.sin(sek * 3)})`;
          ctx.lineWidth = f;
          ctx.beginPath();
          ctx.ellipse(sx(ro.x), sy(ro.y) + 3.5 * f, 8 * f, 3.5 * f, 0, 0, Math.PI * 2);
          ctx.stroke();
          if (design) {
            // Die Figur im Kachelstil, mit echten Einzelbildern.
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.fillRect(sx(ro.x) - 4 * f, sy(ro.y) + 3 * f, 8 * f, f);
            const beine: BeinBild = laeuft ? (imSchritt ? 'lauf1' : 'lauf2') : 'steh';
            malKachelFigur(
              ctx,
              sx(ro.x) + ws.dx * f,
              sy(ro.y) + 4 * f - Math.round(ritter.hoch + atmet) * f,
              f,
              design,
              beine,
              haltung,
              a.ausruestung.waffe,
              blick.current,
              ws.blitz,
              glut,
            );
            return;
          }
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
      // Ein kleiner goldener Pfeil ueber dem Ritter - auch hinter Baeumen und Bossen findet man sich.
      {
        const kopf = ort('ritter');
        const hub = Math.round(Math.sin(sek * 3) * 1);
        ctx.fillStyle = '#f2c94c';
        const kx = sx(kopf.x);
        const ky = sy(kopf.y) - (24 + hub) * f;
        ctx.fillRect(kx - 2 * f, ky, 5 * f, f);
        ctx.fillRect(kx - f, ky + f, 3 * f, f);
        ctx.fillRect(kx, ky + 2 * f, f, f);
        // Fokus: kleine Flammen neben dem Pfeil - je gesammeltem Punkt eine.
        for (let i = 0; i < (a.fokus ?? 0); i++) {
          ctx.fillStyle = (a.fokus ?? 0) >= 3 ? '#ff7a3a' : '#f6c04a';
          ctx.fillRect(kx + (5 + i * 3) * f, ky + f - ((i + Math.floor(sek * 4)) % 2) * f, 2 * f, 2 * f);
        }
        // Schadensvorschau: zielen angesagte Angriffe auf das eigene Feld, steht der drohende Schaden ueber dem Kopf.
        // Spieltest: "Schaden kommt ohne Vorwarnung".
        const droht = a.schleime.reduce(
          (n, s) =>
            n +
            ((s.angriff && s.angriff.q === a.pos.q && s.angriff.r === a.pos.r) || (s.flaeche ?? []).some((h) => h.q === a.pos.q && h.r === a.pos.r)
              ? gegnerWucht(a, s)
              : 0),
          0,
        );
        if (droht > 0 && still && a.phase !== 'tot') {
          const puls = 0.75 + 0.25 * Math.sin(sek * 8);
          schrift(`-${droht}${droht >= a.leben ? '!' : ''}`, kx - 11 * f, ky - f, droht >= a.leben ? '#ff2a1a' : '#ff6a4a', puls, droht >= a.leben ? 11 : 9);
        }
      }


      // Der Ladebalken der Waffe unter dem Ritter - und eine Aura, wenn eine Faehigkeit wartet.
      const lad = ladungVon(a);
      if (lad.voll > 0) {
        const bx = sx(ritter.x) - Math.round((lad.voll * 2 * f) / 2);
        const by = sy(ritter.y) + 6 * f;
        ctx.fillStyle = 'rgba(18, 13, 8, 0.8)';
        ctx.fillRect(bx - f, by - f, lad.voll * 2 * f + f, 3 * f);
        for (let i = 0; i < lad.voll; i++) {
          ctx.fillStyle = i < lad.ist ? (lad.faehigkeit === 'feuerkreis' ? '#e8641e' : lad.faehigkeit === 'runenblitz' ? '#5aa0d8' : '#f2c94c') : '#3a2a22';
          ctx.fillRect(bx + i * 2 * f, by, f, f);
        }
      }
      if (a.bereit) {
        const puls = 0.5 + 0.5 * Math.sin(sek * 6);
        ctx.strokeStyle = a.bereit === 'schutzwall' ? `rgba(120, 190, 255, ${0.4 + 0.4 * puls})` : `rgba(242, 201, 76, ${0.4 + 0.4 * puls})`;
        ctx.lineWidth = f;
        ctx.beginPath();
        ctx.ellipse(sx(ritter.x), sy(ritter.y) + 3 * f, (7 + puls) * f, (3 + puls / 2) * f, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

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
            const text =
              e.schaden > 0 ? `-${e.schaden}${e.schaden > 1 ? '!' : ''}` : e.ziel === null ? 'ausgewichen!' : e.wer === 'ritter' ? 'daneben' : 'geblockt';
            const farbe =
              e.ziel === null
                ? '#9ad8ff'
                : e.ziel === 'ritter'
                  ? e.schaden > 0
                    ? '#ff5a4a'
                    : '#c8c0b0'
                  : e.schaden > 1
                    ? '#f2c94c'
                    : e.schaden > 0
                      ? '#fffaf0'
                      : '#a8a090';
            schrift(text, X, Y - 6 * f - k * 10 * f, farbe, 1.4 - k * 1.4, e.schaden > 1 ? 10 : e.schaden > 0 ? 8 : 5);
          }
          if (e.ziel === 'ritter' && e.schaden > 0 && u > 0.45 && u < 1.3) rot = Math.max(rot, 1 - (u - 0.45) / 0.85);
          // Wucht: trifft es den Ritter oder sitzt ein harter Hieb, bebt das Bild kurz.
          if (e.schaden > 0 && (e.ziel === 'ritter' || e.schaden > 1) && u > 0.45 && u < 0.75) beben = Math.max(beben, (0.75 - u) / 0.3);
        } else if (e.art === 'angeln') {
          // Die Schnur fliegt zum Wasser, der Schwimmer tanzt - und vielleicht kommt ein Fisch.
          const z = mitte(e.feld.q, e.feld.r);
          const x0 = ritter.x + 5 * blick.current;
          const y0 = ritter.y - 10;
          const k = Math.min(1, u / 0.4);
          if (u < 1.4) {
            const bx = x0 + (z.x - x0) * k;
            const by = y0 + (z.y - y0) * k - Math.sin(k * Math.PI) * 10 + (u > 0.4 ? Math.round(Math.sin(u * 14)) : 0);
            ctx.strokeStyle = 'rgba(240, 240, 230, 0.8)';
            ctx.lineWidth = Math.max(1, f / 2);
            ctx.beginPath();
            ctx.moveTo(sx(x0), sy(y0));
            ctx.quadraticCurveTo(sx((x0 + bx) / 2), sy(Math.min(y0, by) - 6), sx(bx), sy(by));
            ctx.stroke();
            ctx.fillStyle = '#e8604a';
            ctx.fillRect(sx(bx) - f, sy(by) - f, 2 * f, 2 * f);
          }
          if (e.fang && u > 1 && u < 1.7) {
            const kk = (u - 1) / 0.7;
            const fx = z.x + (ritter.x - z.x) * kk;
            const fy = z.y + (ritter.y - 14 - z.y) * kk - Math.sin(kk * Math.PI) * 14;
            const karte = SYMBOL['fisch']!;
            zeichnePixel(ctx, karte, sx(fx) - Math.floor((karte[0]!.length * f) / 2), sy(fy), f, PIX);
          }
          if (u > 1 && u < 3.2)
            schrift(
              e.fang ? '+1 Fisch' : 'nichts',
              sx(ritter.x),
              sy(ritter.y) - (22 + (u - 1) * 4) * f,
              e.fang ? '#9ad8ff' : '#a8a090',
              1.8 - (u - 1) * 0.8,
              6,
            );
        } else if (e.art === 'wuerfelEffekt') {
          if (u < 2.6) schrift(e.text, sx(ritter.x), sy(ritter.y) - (30 + u * 5) * f, '#f6c04a', 1.8 - u * 0.6, 6);
        } else if (e.art === 'fluch') {
          if (u < 2.4) schrift('-1', sx(ritter.x) + 6 * f, sy(ritter.y) - (18 + u * 4) * f, '#d0503a', 1.6 - u * 0.6, 7);
          if (u < 0.8) rot = Math.max(rot, 0.5 * (1 - u / 0.8));
        } else if (e.art === 'gift') {
          if (u < 2.4) schrift('-½', sx(ritter.x) + 6 * f, sy(ritter.y) - (18 + u * 4) * f, '#c890ff', 1.6 - u * 0.6, 6);
          if (u < 0.8) rot = Math.max(rot, 0.4 * (1 - u / 0.8));
        } else if (e.art === 'zauber') {
          // Die geschlossene Form leuchtet violett auf, Funken steigen, der Name erscheint.
          if (u < 2.2) {
            const k = u / 2.2;
            ctx.strokeStyle = `rgba(190, 130, 255, ${1 - k})`;
            ctx.lineWidth = 2 * f;
            ctx.shadowColor = '#b58ae0';
            ctx.shadowBlur = 6 * f;
            ctx.beginPath();
            e.felder.forEach((h, i) => {
              const m = mitte(h.q, h.r);
              if (i === 0) ctx.moveTo(sx(m.x), sy(m.y));
              else ctx.lineTo(sx(m.x), sy(m.y));
            });
            ctx.closePath();
            ctx.stroke();
            ctx.shadowBlur = 0;
            for (const h of e.felder) {
              const m = mitte(h.q, h.r);
              for (let i = 0; i < 3; i++) {
                const fl = (u * 1.5 + i * 0.33) % 1;
                ctx.globalAlpha = (1 - k) * (1 - fl);
                ctx.fillStyle = i % 2 ? '#e8d4ff' : '#b58ae0';
                ctx.fillRect(sx(m.x + (i - 1) * 4) - f / 2, sy(m.y - fl * 14), f, f);
              }
            }
            ctx.globalAlpha = 1;
          }
          if (u < 3) schrift(ZAUBER_NAME[e.name], sx(ritter.x), sy(ritter.y) - (26 + u * 4) * f, '#d8b8ff', 1.8 - u * 0.6, 7);
        } else if (e.art === 'wiederbelebt') {
          if (u < 2) {
            const k = u / 2;
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = '#fff6c8';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.globalAlpha = 1;
          }
        } else if (e.art === 'stufe') {
          // Eine Saeule aus goldenem Licht, dann die Zahl.
          if (u < 1.6) {
            const k = u / 1.6;
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = '#f2c94c';
            const bw = (6 - k * 4) * f;
            ctx.fillRect(sx(ritter.x) - bw / 2, 0, bw, sy(ritter.y) + 3 * f);
            ctx.globalAlpha = 1;
          }
          if (u < 3) schrift(`Level ${e.lv}! ${e.bonus}`, sx(ritter.x), sy(ritter.y) - (24 + u * 4) * f, '#f2c94c', 1.8 - u * 0.6, 6);
        } else if (e.art === 'kreis') {
          // Ein bleibender Kreis wirkt: Funken auf die Getroffenen, der Schutz leuchtet um den Ritter.
          if (u < 1.2) {
            const k = u / 1.2;
            ctx.fillStyle = KREIS_FARBE[e.name];
            if (e.name === 'schutzrune') {
              ctx.strokeStyle = KREIS_FARBE.schutzrune;
              ctx.globalAlpha = 1 - k;
              ctx.lineWidth = 2 * f;
              ctx.beginPath();
              ctx.arc(sx(ritter.x), sy(ritter.y) - 6 * f, (10 + k * 8) * f, 0, Math.PI * 2);
              ctx.stroke();
            }
            const orte = [...e.ziele.map((id) => a.schleime.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x), ...(e.felder ?? [])];
            for (const h of orte) {
              const m = mitte(h.q, h.r);
              for (let i = 0; i < 4; i++) {
                const fl = (k + i * 0.25) % 1;
                ctx.globalAlpha = (1 - k) * (1 - fl);
                ctx.fillRect(sx(m.x + (i - 1.5) * 4), sy(m.y - 10 + fl * 12), f, 2 * f);
              }
            }
            ctx.globalAlpha = 1;
          }
        } else if (e.art === 'legende') {
          if (u < 2) {
            const k = u / 2;
            ctx.strokeStyle = `rgba(150, 200, 255, ${1 - k})`;
            ctx.lineWidth = 2 * f;
            ctx.beginPath();
            ctx.arc(sx(ritter.x), sy(ritter.y) - 6 * f, (6 + k * 30) * f, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else if (e.art === 'faehigkeit') {
          if (e.name === 'feuerkreis' && u < 1.4) {
            // Ein Flammenring breitet sich aus, die Nachbarfelder lodern.
            const k = Math.min(1, u / 0.6);
            ctx.strokeStyle = `rgba(232, 100, 30, ${1 - u / 1.4})`;
            ctx.lineWidth = 2 * f;
            ctx.beginPath();
            ctx.ellipse(sx(ritter.x), sy(ritter.y), 26 * f * k, 18 * f * k, 0, 0, Math.PI * 2);
            ctx.stroke();
            for (const h of e.felder ?? []) {
              const m = mitte(h.q, h.r);
              for (let i = 0; i < 5; i++) {
                const fl = (u * 3 + i * 0.37) % 1;
                ctx.globalAlpha = Math.max(0, 1 - u / 1.4) * (1 - fl);
                ctx.fillStyle = i % 2 ? '#f6c04a' : '#e8641e';
                ctx.fillRect(sx(m.x + (i - 2) * 3) - f, sy(m.y - fl * 10), 2 * f, 2 * f);
              }
            }
            ctx.globalAlpha = 1;
          }
          if (e.name === 'runenblitz' && u < 0.7 && e.felder?.[0]) {
            // Ein Blitz im Zickzack vom Ritter zum Ziel.
            const z = mitte(e.felder[0].q, e.felder[0].r);
            const x0 = ritter.x;
            const y0 = ritter.y - 8;
            ctx.strokeStyle = Math.floor(u * 20) % 2 ? '#d8f0ff' : '#5aa0d8';
            ctx.lineWidth = f;
            ctx.beginPath();
            ctx.moveTo(sx(x0), sy(y0));
            for (let i = 1; i <= 6; i++) {
              const t = i / 6;
              const wack = i === 6 ? 0 : (((i * 7 + Math.floor(u * 12)) % 5) - 2) * 2;
              ctx.lineTo(sx(x0 + (z.x - x0) * t + wack), sy(y0 + (z.y - 4 - y0) * t - wack));
            }
            ctx.stroke();
          }
          if ((e.name === 'spalthieb' || e.name === 'schutzwall') && u < 0.9) {
            // Kurzes Aufleuchten: die Faehigkeit ist geladen.
            const k = u / 0.9;
            ctx.strokeStyle = e.name === 'schutzwall' ? `rgba(120, 190, 255, ${1 - k})` : `rgba(242, 201, 76, ${1 - k})`;
            ctx.lineWidth = 2 * f;
            ctx.beginPath();
            ctx.arc(sx(ritter.x), sy(ritter.y) - 6 * f, (4 + k * 14) * f, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (u < 2) schrift(FAEHIGKEIT_NAME[e.name], sx(ritter.x), sy(ritter.y) - (22 + u * 4) * f, '#f2c94c', 1.6 - u * 0.8, 6);
        } else if (e.art === 'spuck') {
          // Ein blauer Batzen fliegt die Linie entlang - bis zum Ritter oder ans Ende.
          if (u > 0.1 && u < 0.6) {
            const k = (u - 0.1) / 0.5;
            const von = ort(e.wer);
            const treffer = e.felder.find((h) => h.q === a.pos.q && h.r === a.pos.r);
            const ende = treffer ?? e.felder[e.felder.length - 1]!;
            const bis = mitte(ende.q, ende.r);
            const x = von.x + (bis.x - von.x) * k;
            const y = von.y + (bis.y - von.y) * k - Math.sin(k * Math.PI) * 6 - 4;
            for (let i = 3; i >= 0; i--) {
              const kk = Math.max(0, k - i * 0.06);
              const tx = von.x + (bis.x - von.x) * kk;
              const ty = von.y + (bis.y - von.y) * kk - Math.sin(kk * Math.PI) * 6 - 4;
              ctx.globalAlpha = i === 0 ? 1 : 0.35 - i * 0.08;
              ctx.fillStyle = i === 0 ? '#5aa0d8' : '#9ad8ff';
              ctx.fillRect(sx(tx) - f * 1.5, sy(ty) - f * 1.5, 3 * f, 3 * f);
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#d8f0ff';
            ctx.fillRect(sx(x) - f / 2, sy(y) - f, f, f);
          }
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
              ctx.fillStyle = e.schleimArt === 'bandit' ? (i % 3 === 0 ? '#f6c04a' : '#5f4036') : i % 3 === 0 ? '#d8ff9a' : '#6aa85a';
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
      // Ist Wuerfeln dran, huepft ein Wuerfel ueber dem Ritter - nicht, wenn Gegner nah sind (Spieltest: "verdeckt Gegner").
      if (a.phase === 'wuerfeln' && still && !a.schleime.some((x) => hexDistance(x, a.pos) <= 2)) {
        const hops = Math.abs(Math.sin(sek * 3.2)) * 4;
        const X = sx(ritter.x);
        const Y = sy(ritter.y) - Math.round(26 + hops) * f;
        const g = 9 * f;
        ctx.fillStyle = '#2a1f16';
        ctx.fillRect(X - g / 2 - f, Y - g / 2 - f, g + 2 * f, g + 2 * f);
        ctx.fillStyle = '#f2e7d0';
        ctx.fillRect(X - g / 2, Y - g / 2, g, g);
        ctx.fillStyle = '#2a1f16';
        for (const [ax, ay] of [
          [-1, -1],
          [1, -1],
          [0, 0],
          [-1, 1],
          [1, 1],
        ] as const)
          ctx.fillRect(X + ax * 3 * f - f, Y + ay * 3 * f - f, 2 * f, 2 * f);
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
        schrift(bannerText.current, c.width / 2, c.height * 0.43, '#f2c94c', al, w < 700 ? 7 : 9);
      }
      // Sieg: goldenes Konfetti regnet ein paar Sekunden.
      if (a.phase === 'sieg' && banner.current > 0 && seitBanner < 7) {
        for (let i = 0; i < 90; i++) {
          const x0 = (((i * 7919) % 1000) / 1000) * c.width;
          const fallend = ((seitBanner * (0.25 + (i % 7) * 0.05) + (i % 13) / 13) % 1) * c.height;
          const wackel = Math.sin(seitBanner * 4 + i) * 6 * f;
          ctx.globalAlpha = Math.min(1, (7 - seitBanner) / 2);
          ctx.fillStyle = ['#f2c94c', '#e8641e', '#7fd05a', '#5aa0d8', '#e8d4ff'][i % 5]!;
          ctx.fillRect(x0 + wackel, fallend, 2 * f, (i % 2 ? 1 : 2) * f);
        }
        ctx.globalAlpha = 1;
      }
      // Ein roter Rand, wenn der Ritter getroffen wird.
      if (rot > 0) {
        const g = ctx.createRadialGradient(
          c.width / 2,
          c.height / 2,
          Math.min(c.width, c.height) * 0.3,
          c.width / 2,
          c.height / 2,
          Math.max(c.width, c.height) * 0.7,
        );
        g.addColorStop(0, 'rgba(200, 30, 20, 0)');
        g.addColorStop(1, `rgba(200, 30, 20, ${0.45 * rot})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);
      }

      // Sprechblasen ueber Soeldnern, Wanderern, Haendlern - mit Schwaenzchen nach unten; zuletzt, damit nichts sie verdeckt.
      {
        const jetztMs = performance.now();
        blasen.current = blasen.current.filter((b) => b.bis > jetztMs);
        // Spieltest: "Sprechblasen verdecken den Kampf" - steht ein Gegner nah, schweigen alle.
        const kampf = a.schleime.some((x) => hexDistance(x, a.pos) <= 2);
        for (const b of kampf ? [] : blasen.current) {
          if (b.ab > jetztMs) continue;
          const wo = schleimEnde.get(b.wer) ?? (a.orte ?? []).find((o) => o.id === b.wer);
          if (!wo || hexDistance(wo, a.pos) > sicht + 1) continue;
          const o = schleimEnde.has(b.wer) ? ort(b.wer) : mitte(wo.q, wo.r);
          const alpha = klemme((b.bis - jetztMs) / 400) * klemme((jetztMs - b.ab) / 150);
          ctx.font = `bold ${5 * f}px monospace`;
          // Zeilen von hoechstens 22 Zeichen.
          const zeilen: string[] = [];
          for (const wort of b.text.split(' ')) {
            const z = zeilen[zeilen.length - 1];
            if (z !== undefined && (z + ' ' + wort).length <= 22) zeilen[zeilen.length - 1] = z + ' ' + wort;
            else zeilen.push(wort);
          }
          const breite = Math.ceil((Math.max(...zeilen.map((z) => ctx.measureText(z).width)) + 8 * f) / f) * f;
          const zeileH = 6 * f;
          const hoeheB = zeilen.length * zeileH + 4 * f;
          const bx = Math.round((sx(o.x) - breite / 2) / f) * f;
          const by = Math.round((sy(o.y) - 22 * f - hoeheB) / f) * f;
          const mx = bx + breite / 2;
          ctx.save();
          // Text mittig in jeder Zeile, senkrecht in der Mitte der Zeile.
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#120d08';
          ctx.fillRect(bx - f, by - f, breite + 2 * f, hoeheB + 2 * f);
          // Das Schwaenzchen: mittig unter der Blase, mit Rand.
          ctx.fillRect(mx - 2 * f, by + hoeheB, 4 * f, 2 * f);
          ctx.fillRect(mx - f, by + hoeheB + 2 * f, 2 * f, f);
          ctx.fillStyle = '#f2e7d0';
          ctx.fillRect(bx, by, breite, hoeheB);
          ctx.fillRect(mx - f, by + hoeheB, 2 * f, f);
          ctx.fillStyle = '#2b211a';
          zeilen.forEach((z, i) => ctx.fillText(z, mx, by + 2 * f + (i + 0.5) * zeileH + f / 2));
          ctx.restore();
        }
      }

      // Gegner-Info unter der Maus: Name, Leben, wie hart er trifft, ab wann man ihn trifft.
      const unter = zeiger.current;
      const feind = unter && still ? a.schleime.find((s) => s.q === unter.q && s.r === unter.r && hexDistance(s, a.pos) <= sicht) : undefined;
      // Spieltest: "Fremde Ritter kaempfen mit - wer ist das?" - auch Wanderer und Gefolge zeigen sich.
      const wand = unter && still && !feind ? (a.wanderer ?? []).find((w) => w.q === unter.q && w.r === unter.r && hexDistance(w, a.pos) <= sicht) : undefined;
      const helfer = unter && still && !feind && !wand ? (a.gefolge ?? []).find((g) => g.q === unter.q && g.r === unter.r) : undefined;
      const info = feind ?? wand ?? helfer;
      if (info) {
        const o = mitte(info.q, info.r);
        const zeilen = feind
          ? [
              `${schleimName(feind)}${feind.elite ? ' (Elite)' : ''}`,
              `Leben ${feind.leben}${feind.max ? `/${feind.max}` : ''}`,
              `Trifft dich: -${gegnerWucht(a, feind)}${abwehrAugen(a) > 0 ? ` (Schild haelt Wurf 1-${abwehrAugen(a)})` : ' (kein Schild)'}`,
              `Du triffst ab ${trefferAb(a, feind)}+ (Augen des Wuerfels)`,
            ]
          : wand
            ? [
                `${wand.name} - ${FRAKTION_NAME[wand.fraktion]}`,
                `Leben ${wand.leben}/${wand.max}`,
                wand.fraktion === 'orden' ? 'Wanderritter: kaempft gegen Banditen' : 'Jaeger: jagt Hasen',
                'und gegen jeden, der angreift. Nicht dein Gefolge.',
              ]
            : [`${helfer!.name} - ${SOELDNER[helfer!.art].name}`, `Leben ${helfer!.leben}/${helfer!.max} · Level ${helfer!.lv}`, 'Dein Gefolge: folgt dir und kaempft mit.'];
        ctx.save();
        ctx.font = `bold ${5 * f}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const breite = Math.max(...zeilen.map((z) => ctx.measureText(z).width)) + 8 * f;
        const zeileH = 6 * f;
        const hoeheB = zeilen.length * zeileH + 4 * f;
        const bx = Math.min(c.width - breite - 2 * f, Math.max(2 * f, Math.round(sx(o.x) + 10 * f)));
        const by = Math.min(c.height - hoeheB - 2 * f, Math.max(2 * f, Math.round(sy(o.y) - hoeheB / 2)));
        ctx.fillStyle = 'rgba(18, 13, 8, 0.92)';
        ctx.fillRect(bx, by, breite, hoeheB);
        ctx.strokeStyle = feind?.boss ? '#ff4a3a' : feind ? '#c8a35a' : '#7ab0d8';
        ctx.lineWidth = f;
        ctx.strokeRect(bx, by, breite, hoeheB);
        zeilen.forEach((z, i) => {
          ctx.fillStyle = i === 0 ? '#f6c04a' : i === 2 && feind ? '#ff8a6a' : '#f2e7d0';
          ctx.fillText(z, bx + 4 * f, by + 2 * f + (i + 0.5) * zeileH);
        });
        ctx.restore();
      }

      // Uebersichtskarte.
      const m = mini.current;
      const mctx = m?.getContext('2d');
      if (m && mctx) {
        mctx.fillStyle = '#0d0a07';
        mctx.fillRect(0, 0, m.width, m.height);
        // Gross: naeher heran (Spieltest: "nur der Rahmen wird groesser").
        const z = miniGrossRef.current ? 5 : 3;
        for (const k of a.erkundet) {
          const [q, rr] = k.split(':').map(Number) as [number, number];
          const x = (q - a.pos.q + (rr - a.pos.r) / 2) * z * 2 + m.width / 2;
          const y = (rr - a.pos.r) * z * 1.7 + m.height / 2;
          mctx.fillStyle = BODEN_FARBE[feldInfo(a.seed, q, rr).boden];
          mctx.fillRect(Math.round(x), Math.round(y), z * 2, z * 2);
        }
        for (const s of a.schleime) {
          if (hexDistance(s, a.pos) > sicht) continue;
          const x = (s.q - a.pos.q + (s.r - a.pos.r) / 2) * z * 2 + m.width / 2;
          const y = (s.r - a.pos.r) * z * 1.7 + m.height / 2;
          mctx.fillStyle = '#b6f07a';
          mctx.fillRect(Math.round(x), Math.round(y), z * 2, z * 2);
        }
        // Funde auf erkundeten Feldern: kleine Punkte - golden die Schatztruhe.
        for (const [k, fund] of fundKarte) {
          const [q, rr] = k.split(':').map(Number) as [number, number];
          const x = (q - a.pos.q + (rr - a.pos.r) / 2) * z * 2 + m.width / 2;
          const y = (rr - a.pos.r) * z * 1.7 + m.height / 2;
          mctx.fillStyle = fund === 'schatz' ? '#f2c94c' : fund === 'herz' || fund === 'halbherz' ? '#e8604a' : '#f2e7d0';
          mctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, z * 2 - 2, z * 2 - 2);
        }
        // Leute: Haendler golden, Werber blau; das Gefolge weiss, Wanderer in ihrer Farbe, Banditen dunkelrot.
        const punkt = (q: number, rr: number, farbe: string, rand = false) => {
          const x = (q - a.pos.q + (rr - a.pos.r) / 2) * z * 2 + m.width / 2;
          const y = (rr - a.pos.r) * z * 1.7 + m.height / 2;
          if (rand) {
            mctx.fillStyle = '#120d08';
            mctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, z * 2 + 2, z * 2 + 2);
          }
          mctx.fillStyle = farbe;
          mctx.fillRect(Math.round(x), Math.round(y), z * 2, z * 2);
        };
        for (const o of a.orte ?? []) if (erkundet.has(hexKey(o.q, o.r))) punkt(o.q, o.r, o.art === 'haendler' ? '#f6c04a' : o.art === 'werber' ? '#6ab0ff' : '#b58ae0', true);
        for (const w of a.wanderer ?? []) if (hexDistance(w, a.pos) <= sicht) punkt(w.q, w.r, w.fraktion === 'orden' ? '#dfe9f0' : '#2f7a3a');
        for (const s of a.schleime) if (s.art === 'bandit' && hexDistance(s, a.pos) <= sicht) punkt(s.q, s.r, '#8a2a2a');
        for (const g of a.gefolge ?? []) punkt(g.q, g.r, '#ffffff');
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
  // Gold steht als Muenzen ueber dem Inventar, nicht in einem Fach.
  const vorrat = Object.entries(a.inventar).filter(([id, n]) => n > 0 && id !== 'gold');
  const gold = a.inventar['gold'] ?? 0;
  /** Aufbrechen: ein neues Abenteuer mit Klasse, Mitgift und Heldenstufe (oder das Tagesabenteuer). */
  const aufbruch = (x: Aufbruch) => {
    halt();
    setZugTasten([]);
    setTipp(null);
    setLager(false);
    // Nicht zweimal dasselbe Vorzeichen hintereinander (Spieltest: "dreimal Segen").
    let seed = x.tag ? x.tag.seed : neuerSeed();
    for (let i = 0; !x.tag && i < 20 && omenFuer(seed) === a.omen; i++) seed = neuerSeed();
    setze(
      neuesAbenteuer(seed, {
        klasse: x.klasse,
        heldenstufe: x.tag ? 0 : x.stufe,
        extras: x.tag ? [] : aktiveExtras(meta),
        legenden: x.tag ? [] : freieLegenden(meta),
        ...(x.tag ? { tag: x.tag.tag } : {}),
        omen: true,
      }),
    );
  };
  // Gleich nochmal: dieselbe Klasse und Heldenstufe.
  const nochmal = () => aufbruch({ klasse: a.klasse ?? meta.klasse, stufe: a.heldenstufe ?? 0 });
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
        <button className="klein" onClick={() => setLager(true)} title="Ins Lager: Klasse waehlen, freischalten, neu aufbrechen">
          Lager ★{meta.ruhm}
        </button>
        <button className="klein" onClick={() => setHilfeOffen(true)} title="Wie spielt man? (Taste ?)">
          ?
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
          {/* Das laufende Stueck: Nummer und Name - wechselt mit der Landschaft. */}
          <div className="ab-track" title={track ? `Stueck ${track.id}: ${track.name} (${BIOM_NAME[track.biom]})` : 'Musik aus'}>
            {track ? `Musik: ${track.name}` : musik ? '...' : 'Musik aus'}
          </div>
        </div>
        <span className="ab-schild" title={`Leben ${lebenText(a.leben)} von ${maxLeben}`}>
          {Array.from({ length: maxLeben }, (_, i) => (
            <i key={i} className={a.leben >= i + 1 ? 'ab-herz voll' : a.leben >= i + 0.5 ? 'ab-herz halb' : 'ab-herz'} />
          ))}
        </span>
        {/* Extra-Leben: ein goldenes Herz mit der Anzahl. */}
        {(a.extraLeben ?? 0) > 0 && (
          <span className="ab-schild ab-extraleben" title={`${a.extraLeben} Extra-Leben: faellst du, stehst du wieder auf`}>
            <Icon id="extraleben" groesse={12} />×{a.extraLeben}
          </span>
        )}
        {/* Legendaeres: ein Knopf, der die Sammlung zeigt - kein festes Fenster. */}
        {(a.legendaer?.length ?? 0) > 0 && (
          <button className="klein ab-legenden-knopf" onClick={() => setLegendenOffen(true)} title="Deine legendaeren Funde ansehen">
            <Icon id="extraleben" groesse={14} /> Legendaer {a.legendaer!.length}
          </button>
        )}
      </div>

      {/* Der Koenig ist erwacht: sein Leben oben in der Mitte, wie bei einem Boss. */}
      {(() => {
        const koenig = a.schleime.find((x) => x.boss);
        if (!koenig) return null;
        return (
          <div className="ab-boss" title="Der Schleimkoenig - bezwinge ihn, um zu gewinnen">
            <span>{schleimName(koenig)}</span>
            <div className="ab-boss-balken">
              <i style={{ width: `${(100 * koenig.leben) / schleimMaxLeben(koenig)}%` }} />
            </div>
          </div>
        );
      })()}

      {/* Rechts oben: die Uebersichtskarte. */}
      <div className={miniGross ? 'ab-fenster ab-mini gross' : 'ab-fenster ab-mini'} onClick={() => setMiniGross((x) => !x)} title={miniGross ? 'Antippen: Karte klein' : 'Antippen: Karte gross'}>
        <span className="ab-titel">Karte</span>
        <canvas ref={mini} width={miniGross ? 440 : 170} height={miniGross ? 330 : 130} />
        <div className="ab-zug">Zug {a.zug}</div>
        {/* Der Akt und wann sein Boss erwacht: nach so vielen erlegten Gegnern. */}
        {(() => {
          const boss = a.schleime.find((x) => x.boss);
          const akt = a.akt ?? 1;
          const ziel = aktZiel(a);
          const kills = Math.min(a.aktKills ?? 0, ziel);
          return (
            <div className="ab-akt" title={`Akt ${akt} von ${AKTE}. Nach ${ziel} erlegten Gegnern erwacht der Boss des Akts${akt === AKTE ? ' - der Endboss' : ''}.`}>
              <b>
                Akt {akt}/{AKTE}
              </b>
              {boss ? (
                <span className="ab-boss-weg">{BOSS_NAME[boss.bossArt ?? 'koenig']} jagt dich!</span>
              ) : (
                <>
                  <span>
                    {BOSS_NAME[naechsterBoss(a)]}
                    {akt === AKTE ? ' (Endboss)' : ''}: {kills}/{ziel}
                  </span>
                  <small className="ab-akt-uhr">oder in {zuegeBisBoss(a)} Zuegen</small>
                  <i className="ab-akt-balken">
                    <i style={{ width: `${(100 * kills) / ziel}%` } as CSSProperties} />
                  </i>
                </>
              )}
              {a.omen && (
                <small className="ab-omen" title={OMEN[a.omen].text}>
                  Vorzeichen: <b>{OMEN[a.omen].name}</b> - {OMEN[a.omen].text}
                </small>
              )}
            </div>
          );
        })()}
      </div>

      {/* Links: die Werte (mit Bildern statt Text), darunter die Ausruestung als Slots. */}
      <div className="ab-links">
        <div className="ab-fenster ab-werte">
          <span className="ab-titel">Werte</span>
          {/* Solo-Leveling: Level und Erfahrung. */}
          {a.stufe && (
            <div className="ab-level" title={`Level ${a.stufe.lv}: ${a.stufe.ep} von ${epFuer(a.stufe.lv)} Erfahrung bis zum naechsten`}>
              <b>Lv {a.stufe.lv}</b>
              <span className="ab-ep">
                <i
                  style={{
                    width: `${(100 * a.stufe.ep) / epFuer(a.stufe.lv)}%`,
                  }}
                />
              </span>
            </div>
          )}
          <div className="ab-werte-gitter">
            {[
              {
                id: 'schwert',
                wert: `+${angriffVon(a)}${gelaendeBonus(a, 'angriff') ? '*' : ''}`,
                titel: `Angriff +${angriffVon(a)}${gelaendeBonus(a, 'angriff') ? ' (* davon +1 vom Huegel - nur solange du hier stehst)' : ''}: Wurf + Angriff muss 4 erreichen. Du triffst Schleime mit einer ${Math.max(1, 4 - angriffVon(a))} oder mehr (${Math.round((100 * (7 - Math.max(1, 4 - angriffVon(a)))) / 6)} %), Panzer ab ${Math.max(1, 5 - angriffVon(a))}. Warten (S) gibt Fokus.`,
              },
              {
                id: 'schild',
                wert: `+${abwehrVon(a)}${gelaendeBonus(a, 'abwehr') ? '*' : ''}`,
                titel:
                  (abwehrAugen(a) > 0 ? `Abwehr: Hiebe mit Wurf 1 bis ${abwehrAugen(a)} prallen ab (${Math.round((100 * abwehrAugen(a)) / 6)} %).` : 'Abwehr: keine - jeder Hieb trifft. Schild, Ruestung und Wald helfen.') +
                  (gelaendeBonus(a, 'abwehr') ? ' * Der Wald gibt dir gerade +1 (nur solange du hier stehst).' : ''),
              },
              { id: 'herz', wert: `${maxLeben}`, titel: 'Hoechstes Leben' },
              {
                id: 'auge',
                wert: `${sichtVon(a)}`,
                titel: 'Sicht: so viele Felder weit',
              },
              {
                id: 'stiefel',
                wert: `+${schrittBonusVon(a)}`,
                titel: 'Schritte zusaetzlich je Wurf',
              },
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
                <div
                  key={s}
                  className={`ab-slot ab-slot-${s}${g ? ' voll' : ''}`}
                  title={g ? undefined : `${SLOT_NAME[s]}: leer`}
                  {...(g ? tippHandler(g.id, setTipp) : {})}
                >
                  {/* Leer zeigt der Slot blass, was hineingehoert. */}
                  <Icon id={g?.id ?? SLOT_BILD[s]} groesse={26} />
                </div>
              );
            })}
          </div>
        </div>
        {/* Das Gefolge: wer mitlaeuft, wie es ihm geht, wie weit er im Level ist. */}
        {(a.gefolge ?? []).length > 0 && (
          <div className="ab-fenster ab-gefolge">
            <span className="ab-titel">Gefolge</span>
            {(a.gefolge ?? []).map((g) => (
              <div key={g.id} className="ab-kamerad" title={`${g.name}, ${SOELDNER[g.art].name} - ${SOELDNER[g.art].text}`}>
                <b>{g.beschworen ? `✦ ${g.name}` : g.name}</b>
                <small>
                  Lv {g.lv} · {lebenText(g.leben)}/{g.max}
                </small>
                <span className="ab-kamerad-balken">
                  <i style={{ width: `${(100 * g.leben) / g.max}%` } as CSSProperties} />
                </span>
                <span className="ab-kamerad-ep">
                  <i style={{ width: `${(100 * g.ep) / soeldnerEp(g.lv)}%` } as CSSProperties} />
                </span>
              </div>
            ))}
          </div>
        )}
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
          {zugTasten.length > 0 ? zugTasten.slice(-12).map((t, i) => <kbd key={i}>{t.toUpperCase()}</kbd>) : <small>Oder ein Feld antippen</small>}
        </div>
      </div>

      {/*
        Die Faehigkeitenleiste unten in der Mitte: runde Knoepfe, um die sich
        ein Ladebalken wickelt - ist der Ring voll, leuchtet der Knopf.
        Bisher: die Beschwoerung (Pentagrammmeister Stufe 3).
      */}
      {(ladungVon(a).faehigkeit || (a.pentaStufe ?? 1) >= 3 || a.ausruestung.wuerfel === 'glueckswuerfel' || heilmittel(a)) && (
        <div className="ab-faehigkeiten">
          {/* Heilen (H): das naechste Heilmittel - leuchtet rot, wenn das Leben knapp wird. */}
          {heilmittel(a) &&
            (() => {
              const id = heilmittel(a)!;
              const knapp = a.leben <= Math.max(2, maxLebenVon(a) / 3);
              return (
                <button
                  className={knapp ? 'ab-faehigkeit voll' : 'ab-faehigkeit'}
                  style={{ '--anteil': 1, '--ring': knapp ? '#d0503a' : '#7fd05a' } as CSSProperties}
                  onClick={() => setze(benutzen(aktuell.current, id))}
                  title={`Heilen (H): ${gegenstand(id)?.name} - ${gegenstand(id)?.text}`}
                >
                  <span className="ab-faehigkeit-innen">
                    <Icon id={id} groesse={26} />
                    {(a.inventar[id] ?? 0) > 1 && <span className="ab-anzahl">{a.inventar[id]}</span>}
                  </span>
                  <kbd>H</kbd>
                </button>
              );
            })()}
          {/* Glueckswuerfel: einmal je Zug neu wuerfeln - der Ring ist voll, solange es geht. */}
          {a.ausruestung.wuerfel === 'glueckswuerfel' && (
            <button
              className={kannNeuWuerfeln(a) && !rollt ? 'ab-faehigkeit voll' : 'ab-faehigkeit'}
              style={{ '--anteil': kannNeuWuerfeln(a) ? 1 : 0, '--ring': '#6aa85a' } as CSSProperties}
              aria-disabled={!kannNeuWuerfeln(a)}
              onClick={() => kannNeuWuerfeln(a) && neuWurf()}
              title="Glueckswuerfel (R): einmal je Zug neu wuerfeln, solange du noch keinen Schritt gegangen bist. Das neue Ergebnis gilt."
            >
              <span className="ab-faehigkeit-innen">
                <Icon id="glueckswuerfel" groesse={26} />
              </span>
              <kbd>R</kbd>
            </button>
          )}
          {/* Die Faehigkeit der Waffe: Schritte und Treffer laden sie, Taste 1 loest sie aus. */}
          {(() => {
            const { ist, voll, faehigkeit } = ladungVon(a);
            if (!faehigkeit) return null;
            const bereit = faehigkeitBereit(a);
            return (
              <button
                className={bereit ? 'ab-faehigkeit voll' : 'ab-faehigkeit'}
                style={{ '--anteil': Math.min(1, ist / voll), '--ring': '#e8641e' } as CSSProperties}
                aria-disabled={!bereit}
                onClick={() => bereit && setze(faehigkeitNutzen(aktuell.current))}
                title={`${FAEHIGKEIT_NAME[faehigkeit]} (Taste 1): ${ist}/${voll} - Schritte und Treffer laden die Waffe.`}
              >
                <span className="ab-faehigkeit-innen">
                  <Icon id={a.ausruestung.waffe ?? 'schwert'} groesse={28} />
                </span>
                <kbd>1</kbd>
              </button>
            );
          })()}
          {(a.pentaStufe ?? 1) >= 3 &&
            (() => {
              const ladung = Math.min(a.beschwoerung ?? 0, BESCHWOERUNG_VOLL);
              const voll = ladung >= BESCHWOERUNG_VOLL;
              const art = BEGLEITER_FUER[meisterZauber(a)];
              return (
                <button
                  className={voll ? 'ab-faehigkeit voll' : 'ab-faehigkeit'}
                  style={{ '--anteil': ladung / BESCHWOERUNG_VOLL, '--ring': '#b58ae0' } as CSSProperties}
                  aria-disabled={!voll}
                  onClick={() => voll && !rollt && setze(beschwoeren(aktuell.current))}
                  title={`Beschwoeren (B): ruft einen ${SOELDNER[art].name} - je nach deinem haeufigsten Zauber. ${ladung}/${BESCHWOERUNG_VOLL} - laedt sich, wenn Gegner in Pentagrammen fallen.`}
                >
                  <span className="ab-faehigkeit-innen">
                    <Icon id={`begleiter_${art}`} groesse={28} />
                  </span>
                  <kbd>B</kbd>
                </button>
              );
            })()}
        </div>
      )}

      {/* Rechts unten: Inventar ueber dem Spieltisch. */}
      <div className="ab-rechts-unten">
        <div className="ab-muenzen" title={`${gold} Goldmuenzen`}>
          <Icon id="muenze" groesse={16} />
          <b>{gold}</b>
        </div>
        <div className="ab-fenster ab-inventar">
          <span className="ab-titel">Inventar</span>
          <div className="ab-gegenstaende">
            {Array.from({ length: Math.max(FAECHER, vorrat.length) }, (_, i) => {
              const eintrag = vorrat[i];
              if (!eintrag) return <span key={`leer${i}`} className="ab-fach" />;
              const [id, n] = eintrag;
              const g = gegenstand(id);
              return (
                <button
                  key={id}
                  className={['ab-fach ab-gegenstand', g?.legendaer ? 'legendaer' : '', vergleich(a, id) === 1 ? 'besser' : vergleich(a, id) === -1 ? 'schlechter' : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={g?.name ?? id}
                  {...tippHandler(id, setTipp)}
                  onClick={() => setze(benutzen(aktuell.current, id))}
                >
                  <Icon id={id} groesse={24} />
                  {n > 1 && <span className="ab-anzahl">{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="ab-tisch">
          <Wuerfel n={a.wurf} wurfNr={wurfNr} matt={a.phase !== 'ziehen'} art={a.ausruestung.wuerfel ?? ''} zweiter={a.zweiterWurf ?? null} />
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
          {a.phase === 'ziehen' && kannAngeln(a) && (
            <button
              className="ab-wurf ab-angeln"
              disabled={rollt}
              onClick={() => angle()}
              title="Die Angel ins Wasser werfen (F) - ein Schritt"
            >
              Angeln (F)
            </button>
          )}
          {a.phase !== 'ziehen' && (
            <button className="primary ab-wurf" disabled={a.phase !== 'wuerfeln' || rollt} onClick={wirf}>
              Wuerfeln
            </button>
          )}
        </div>
      </div>

      <DebugFenster
        figur={figur}
        onFigur={(id) => {
          setFigur(id);
          try {
            localStorage.setItem(FIGUR_KEY, id);
          } catch {
            // nur fuer jetzt
          }
        }}
        waffe={a.ausruestung.waffe}
        setTipp={setTipp}
        onWelt={() => {
          // Die Welt ist eine andere: Funde neu, der Ritter aufs Land.
          funde.current = { fuer: null, karte: new Map() };
          setze(normalisiere(structuredClone(aktuell.current)));
        }}
        onNeueWelt={() => aufbruch({ klasse: a.klasse ?? 'ritter', stufe: a.heldenstufe ?? 0 })}
        onAktion={(d: DebugAktion) => setze(debugAktion(aktuell.current, d))}
      />

      {/* Spieltest: "Wichtige Regeln werden nie erklaert" - alles Wichtige auf einer Seite (? oder Knopf). */}
      {hilfeOffen && (
        <div className="ab-ende ab-legenden-huelle" onClick={() => setHilfeOffen(false)}>
          <div className="ab-fenster ab-hilfe" onClick={(e) => e.stopPropagation()}>
            <div className="ab-debug-kopf">
              <span className="ab-titel">Wie spielt man?</span>
              <button className="klein" onClick={() => setHilfeOffen(false)} title="Schliessen (Esc)">
                ×
              </button>
            </div>
            <dl>
              <dt>Ziel</dt>
              <dd>Drei Akte. Erlege Gegner, bis der Boss des Akts erwacht (Zaehler unter der Karte) - oder er kommt nach einigen Zuegen von selbst. Wer schneller ist, bekommt Eile-Punkte. Der dritte Boss ist der Endboss.</dd>
              <dt>Zug</dt>
              <dd>Wuerfeln (Enter), dann so viele Schritte gehen (mindestens 2): Q E A D Z X oder ein Feld anklicken. Helle Felder erreichst du noch. S wartet einen Schritt. Jeder Schritt laesst die Gegner ziehen.</dd>
              <dt>Kampf</dt>
              <dd>Lauf in einen Gegner, um zuzuschlagen. Die Zahl ueber ihm (z. B. 3+) ist die Augenzahl, die dein Wuerfel mindestens zeigen muss. Maus ueber einen Gegner: alles ueber ihn.</dd>
              <dt>Rote Felder</dt>
              <dd>Ein angesagter Angriff - er trifft im naechsten Takt. Geh weg! Steht ueber dir eine rote Zahl, trifft dich so viel. Wer ins Leere schlaegt, taumelt: freie Hiebe.</dd>
              <dt>Fokus</dt>
              <dd>Warten (S) sammelt Fokus (bis 3): er kommt auf deinen naechsten Hieb, voll gibt er +1 Schaden. Gehen bricht ihn, ein Fehlschlag gibt 1.</dd>
              <dt>Heilen</dt>
              <dd>H isst ein Kraut. Wartest du ohne Gegner in der Naehe, heilst du einmal je Zug +1.</dd>
              <dt>Waffe</dt>
              <dd>Treffer laden die Waffe. Voll: Taste 1 loest ihre Faehigkeit aus (nur mit Gegner in Reichweite).</dd>
              <dt>Gelaende</dt>
              <dd>Wald: +1 Abwehr. Huegel und Berge: +1 Angriff (* in den Werten). Berge und Sumpf kosten mehr Schritte.</dd>
              <dt>Unterwegs</dt>
              <dd>Truhen (1 aus 3), verfluchte Truhen, Altaere, Haendler mit Schmied, Werber fuer Gefolge, goldene "?" sind Begegnungen. Fremde Ritter kaempfen fuer sich - nicht fuer dich.</dd>
              <dt>Lager</dt>
              <dd>Jedes Abenteuer bringt Ruhm: damit schaltest du Klassen, Start-Extras und Legendaeres frei. Ein Sieg oeffnet die naechste Heldenstufe. Jedes Abenteuer hat ein Vorzeichen.</dd>
              <dt>Tasten</dt>
              <dd>Enter wuerfeln · QEADZX gehen · S warten · 1 Faehigkeit · H heilen · R neu wuerfeln · B beschwoeren · F angeln · L Log · ? diese Hilfe</dd>
            </dl>
          </div>
        </div>
      )}

      {legendenOffen && (
        <div className="ab-ende ab-legenden-huelle" onClick={() => setLegendenOffen(false)}>
          <div className="ab-fenster ab-legenden" onClick={(e) => e.stopPropagation()}>
            <div className="ab-debug-kopf">
              <span className="ab-titel">Legendaere Funde</span>
              <button className="klein" onClick={() => setLegendenOffen(false)} title="Schliessen">
                ×
              </button>
            </div>
            {/* Gleiche Funde stapeln sich - etwa mehrere Herzcontainer. */}
            {Object.entries((a.legendaer ?? []).reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {})).map(([id, n]) => (
              <div key={id} className="ab-legende" {...tippHandler(id, setTipp)}>
                <span className="ab-legendaer-ding">
                  <Icon id={id} groesse={22} />
                  {n > 1 && <span className="ab-anzahl">{n}</span>}
                </span>
                <span>
                  <b>
                    {gegenstand(id)?.name}
                    {n > 1 ? ` ×${n}` : ''}
                    {id === 'pentagramm' ? ` · Stufe ${a.pentaStufe ?? 1}` : ''}
                  </b>
                  {id === 'pentagramm' && (a.pentaStufe ?? 1) === 2 && (
                    <small>
                      Stufe 3: {a.pentaKills ?? 0}/{PENTA_STUFE3_NACH} Gegner durch Pentagramme
                    </small>
                  )}
                  {id === 'pentagramm' && (a.pentaStufe ?? 1) >= 3 && (
                    <small>
                      Beschwoerung {a.beschwoerung ?? 0}/{BESCHWOERUNG_VOLL} - ruft: {SOELDNER[BEGLEITER_FUER[meisterZauber(a)]].name}
                    </small>
                  )}
                  <small>{gegenstand(id)?.text.replace(/^Legendaer\.\s*/, '')}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Der Laden: beim Haendler verkaufen und kaufen, beim Werber Soeldner anheuern. */}
      {(() => {
        const o = (a.orte ?? []).find((x) => x.id === a.laden);
        if (!o || hexDistance(o, a.pos) > 1) return null;
        const zu = () => setze(ladenZu(aktuell.current));
        const ware = vorrat.filter(([id]) => verkaufsPreis(id) > 0);
        return (
          <div className="ab-ende ab-legenden-huelle" onClick={zu}>
            <div className="ab-fenster ab-laden" onClick={(e) => e.stopPropagation()}>
              <div className="ab-debug-kopf">
                <span className="ab-titel">
                  {o.name}, {ORT_NAME[o.art]}
                </span>
                <span className="ab-laden-gold">
                  <Icon id="muenze" groesse={14} /> {gold}
                </span>
                <button className="klein" onClick={zu} title="Schliessen">
                  ×
                </button>
              </div>
              {o.art === 'altar' ? (
                <>
                  {o.benutzt ? (
                    <p className="ab-leer">Der Altar ist erloschen.</p>
                  ) : (
                    (Object.keys(ALTAR_OPFER) as AltarOpfer[]).map((op) => (
                      <div key={op} className="ab-laden-zeile">
                        <span>
                          <b>{ALTAR_OPFER[op].name}</b>
                          <small>{ALTAR_OPFER[op].text}</small>
                        </span>
                        <button className="klein" disabled={!altarMoeglich(a, op)} onClick={() => setze(opfern(aktuell.current, op))}>
                          Opfern
                        </button>
                      </div>
                    ))
                  )}
                </>
              ) : o.art === 'haendler' ? (
                <>
                  <small>Kaufen</small>
                  {haendlerWaren(a, o).map((w) => {
                    const v = vergleich(a, w.id);
                    return (
                      <div key={w.id} className={['ab-laden-zeile', w.weg ? 'weg' : v === 1 ? 'besser' : v === -1 ? 'schlechter' : ''].join(' ')} {...tippHandler(w.id, setTipp)}>
                        <Icon id={w.id} groesse={20} />
                        <span>{gegenstand(w.id)?.name}</span>
                        <button className="klein ab-kaufen" disabled={w.weg || gold < w.preis} onClick={() => setze(kaufen(aktuell.current, w.id))}>
                          {w.weg ? 'Verkauft' : `Kaufen ${w.preis} Gold`}
                        </button>
                      </div>
                    );
                  })}
                  <small>Schmied</small>
                  {(['angriff', 'abwehr'] as const).map((was) => {
                    const stufe = a.schmied?.[was] ?? 0;
                    const preis = schmiedPreis(a, was);
                    return (
                      <div key={was} className="ab-laden-zeile">
                        <Icon id={was === 'angriff' ? 'schwert' : 'schild'} groesse={20} />
                        <span>
                          {was === 'angriff' ? 'Waffe schaerfen' : 'Ruestung verstaerken'} ({stufe}/{SCHMIED_MAX})
                          <small>{was === 'angriff' ? '+1 Angriff fuer dieses Abenteuer.' : '+1 Abwehr fuer dieses Abenteuer.'}</small>
                        </span>
                        <button className="klein ab-kaufen" disabled={stufe >= SCHMIED_MAX || gold < preis} onClick={() => setze(schmieden(aktuell.current, was))}>
                          {stufe >= SCHMIED_MAX ? 'Fertig' : `${preis} Gold`}
                        </button>
                      </div>
                    );
                  })}
                  <small>Verkaufen</small>
                  {ware.length === 0 && <p className="ab-leer">Nichts, was der Haendler kauft. Ausruestung, Gelee, Kraeuter und Fische nimmt er gern.</p>}
                  {ware.map(([id, n]) => (
                    <div key={id} className="ab-laden-zeile" {...tippHandler(id, setTipp)}>
                      <Icon id={id} groesse={20} />
                      <span>
                        {gegenstand(id)?.name}
                        {n > 1 ? ` ×${n}` : ''}
                      </span>
                      <button className="klein ab-verkaufen" onClick={() => setze(verkaufen(aktuell.current, id))}>
                        Verkaufen +{verkaufsPreis(id)}
                      </button>
                      {n > 1 && (
                        <button className="klein" onClick={() => setze(verkaufen(aktuell.current, id, true))}>
                          Alle +{verkaufsPreis(id) * n}
                        </button>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <small>
                    Soeldner anheuern ({angeheuerte(a)}/{GEFOLGE_MAX} im Gefolge)
                  </small>
                  {werberAngebot(a, o).map((an, nr) => {
                    const weg = (a.angeheuert ?? []).includes(`${o.id}:${nr}`);
                    const def = SOELDNER[an.art];
                    return (
                      <div key={nr} className={weg ? 'ab-laden-zeile weg' : 'ab-laden-zeile'}>
                        <span>
                          <b>{an.name}</b>, {def.name}
                          <small>
                            {def.text} Leben {def.leben}, Angriff +{def.angriff}
                            {def.weite > 1 ? `, ${def.weite} Felder weit` : ''}.
                          </small>
                        </span>
                        <button
                          className="klein"
                          disabled={weg || gold < an.preis || angeheuerte(a) >= GEFOLGE_MAX}
                          onClick={() => setze(anheuern(aktuell.current, nr))}
                        >
                          {weg ? 'Dabei' : `${an.preis} Gold`}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Die Wahl: 1 aus 3 (Truhe, Schatz, Bossbeute). Tasten 1 2 3. */}
      {a.wahl && (
        <div className="ab-ende ab-legenden-huelle">
          <div className="ab-fenster ab-wahl">
            <h2>{a.wahl.titel}</h2>
            <div className="ab-wahl-karten">
              {a.wahl.optionen.map((id, nr) => {
                const g = gegenstand(id);
                const v = vergleich(a, id);
                return (
                  <button
                    key={id}
                    className={['ab-wahl-karte', g?.legendaer ? 'legendaer' : '', v === 1 ? 'besser' : v === -1 ? 'schlechter' : ''].filter(Boolean).join(' ')}
                    onClick={() => setze(waehlen(aktuell.current, nr))}
                  >
                    <kbd>{nr + 1}</kbd>
                    <Icon id={WAHL_BILD[id] ?? id} groesse={40} />
                    <b>{g?.name ?? id}</b>
                    <span>{g?.text.replace(/^Legendaer\.\s*/, '')}</span>
                    {v === 1 && <em>besser als deins</em>}
                    {v === -1 && <em>schwaecher als deins</em>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Hinweis a={a} />

      {lager && (
        <Lager
          meta={meta}
          onMeta={setMeta}
          onAufbruch={aufbruch}
          onZurueck={a.phase === 'tot' || a.phase === 'sieg' ? undefined : () => setLager(false)}
        />
      )}

      <ItemTipp tipp={tipp} />

      {/* Was zuletzt geschah. */}
      {/* Spieltest: "das Log ist zu kurz, man verpasst was". Aufklappbar mit L oder dem Knopf. */}
      <div ref={logRef} className={logOffen ? 'ab-log offen' : 'ab-log'} role="log">
        {(logOffen ? a.log.slice(-30) : a.log.slice(-4)).map((z, i, alle) => (
          <div key={`${a.log.length}-${i}`} style={{ opacity: logOffen ? 1 : 0.45 + (i + 4 - alle.length) * 0.18 } as CSSProperties}>
            {z}
          </div>
        ))}
        <button className="ab-log-knopf" onClick={() => setLogOffen((x) => !x)} title="Log auf- oder zuklappen (L)">
          {logOffen ? 'weniger' : 'mehr (L)'}
        </button>
      </div>

      {/* Das Ende eines Abenteuers: was es wert war, der Ruhm, was als Naechstes lockt. */}
      {(a.phase === 'tot' || a.phase === 'sieg') && !lager && (
        <div className="ab-ende">
          <div className="ab-fenster ab-bilanz">
            <h2>{a.phase === 'sieg' ? 'Sieg! Der Endboss ist bezwungen.' : `${KLASSEN[a.klasse ?? 'ritter'].name} ist gefallen`}</h2>
            <p className="ab-bilanz-akt">
              {a.phase === 'sieg' ? `Alle ${AKTE} Akte in ${a.zug} Zuegen` : `Akt ${a.akt ?? 1} von ${AKTE}: ${AKT_NAME[(a.akt ?? 1) - 1]}`}
              {a.tag ? ` · Tagesabenteuer ${a.tag}` : ''}
              {(a.heldenstufe ?? 0) > 0 ? ` · Heldenstufe ${a.heldenstufe}` : ''}
              {a.omen ? ` · Vorzeichen ${OMEN[a.omen].name}` : ''}
              {(a.eile ?? 0) > 0 ? ` · Eile +${(a.eile ?? 0) * EILE_PUNKTE}` : ''}
            </p>
            <div className="ab-bilanz-werte">
              <span>
                <b>{a.erschlagen}</b> erlegt
              </span>
              <span>
                <b>{a.koenige ?? 0}</b> Bosse
              </span>
              <span>
                <b>{a.zug}</b> Zuege
              </span>
              <span>
                <b>{gold}</b> Gold
              </span>
              {a.stufe && (
                <span>
                  <b>Lv {a.stufe.lv}</b>
                </span>
              )}
              <span>
                <b>{(a.legendaer ?? []).length}</b> Legendaere
              </span>
            </div>
            <p className="ab-punkte">
              {abenteuerPunkte(a)} Punkte
              {abenteuerPunkte(a) >= meta.bester && meta.laeufe > 1 ? ' - neuer Bestwert!' : ` (Bestwert ${meta.bester})`}
            </p>
            <p className="ab-ruhm-plus">★ +{ruhmFuer(a)} Ruhm · jetzt {meta.ruhm}</p>
            {(() => {
              const n = naechsteFreischaltung(meta);
              if (!n) return null;
              const name = n.art === 'klasse' ? KLASSEN[n.id as keyof typeof KLASSEN].name : n.art === 'legende' ? `${gegenstand(n.id)?.name} (Legendaer)` : START_EXTRAS[n.id]?.name;
              return (
                <p className="ab-lockt">
                  {meta.ruhm >= n.kosten ? `Im Lager freischaltbar: ${name}!` : `Noch ${n.kosten - meta.ruhm} Ruhm bis: ${name}`}
                </p>
              );
            })()}
            {meta.zuletzt.map((z) => (
              <p key={z} className="ab-erfolg-neu">
                ★ {z}
              </p>
            ))}
            <div className="ab-lager-knoepfe">
              <button className="primary" onClick={nochmal} autoFocus>
                Gleich nochmal
              </button>
              <button onClick={() => setLager(true)}>Ins Lager</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
