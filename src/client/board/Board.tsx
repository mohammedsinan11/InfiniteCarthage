/**
 * Das Spielbrett als SVG mit Pixel-Art-Kacheln.
 *
 * Drei Dinge, die hier anders sind als bei einem Brett fester Groesse:
 *
 * 1. Kein Rahmen. Die Kamera bestimmt den Ausschnitt, gezeichnet wird nur,
 *    was sichtbar ist - bei einer Karte ohne Obergrenze keine Optimierung,
 *    sondern Bedingung dafuer, dass lange Partien fluessig bleiben.
 * 2. Ecken und Kanten sind eigene, anklickbare Elemente. Genau dafuer ist SVG
 *    gegenueber Canvas im Vorteil: die Trefferflaechen entstehen von selbst.
 * 3. Die Kacheln ueberlappen sich senkrecht um ein Viertel ihrer Hoehe. Damit
 *    die durchsichtigen Ecken richtig liegen, muessen sie zeilenweise von oben
 *    nach unten gezeichnet werden - sonst stanzt eine spaetere Kachel Loecher
 *    in ihre obere Nachbarin.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  hexToPixel,
  pixelToHex,
  parseEdgeKey,
  parseVertexKey,
  edgeEndpoints,
  vertexToPixel,
  hexKey,
  hexDistance,
} from '../../core/coords';
import type { Edge, Hex, Layout, Vertex } from '../../core/coords';
import type { World } from '../../core/world';
import type { PublicState } from '../../core/redact';
import { SEASON_TINT, fraktionColor, playerColor } from '../theme';
import { seasonOf } from '../../core/season';
import { playHover } from '../audio';
import type { Resource } from '../../core/types';
import { ResourceCard } from '../ui/ResourceIcon';
import { hexCornerPixel } from '../../core/coords';
import { reliefLimitedAt } from '../../core/relief';
import { edgeAdjacentHexes, vertexAdjacentHexes } from '../../core/coords';
import { edgeKey, hexEdges, hexVertices, vertexKey } from '../../core/coords';
import { garrisonOf, garrisonUnits, isNestActive, nestFraktionOf } from '../../core/units';
import type { Unit } from '../../core/units';
import { heldKurz, heldVoll } from '../../core/lore';
import { istSpielerSeite, istKampf, kampfFelder, seiteVon, spielerAus } from '../../core/combat';
import type { Seite } from '../../core/combat';
import { fraktionById, istFraktion } from '../../core/factions';
import { ruinAt } from '../../core/ruins';
import { hexenhausAt } from '../../core/hexe';
import {
  aufstellung,
  preloadUnitSprites,
  zeichneFigur,
  zeichneGebaeude,
  zeichneHauptstadt,
  zeichneReichsbau,
  zeichneBastion,
  zeichneMauern,
  steinFuer,
  zeichneLeben,
  zeichneStufe,
  zeichneStrassen,
} from '../units';
// maxLeben kennt Art, Zweig des Ernannten und Rang (core/combat.ts).
import { maxLeben } from '../../core/combat';
import { Schwerter } from './Schwerter';
import { AuftragsZeichen, Flammen, KronenZeichen } from './Marken';
import { Kosten } from '../ui/Aktionsleiste';
import type { Cost } from '../../core/rules/costs';
import { loeschFelder } from '../../core/rules/feuer';
import type { Pfeil, Treffer } from '../net/store';
import { scharNummern } from '../heer';
import type { Brand } from '../../core/state';
import { BRAND_WAS } from '../log';
import { MAX_LICHTER, WetterSchicht } from './WetterSchicht';
import type { Licht } from './WetterSchicht';
import type { Tageszeit, Wetter } from '../../core/zeit';
import {
  HEX_CX,
  HEX_CY,
  ueberhangBild,
  hoehenMaske,
  HEX_H,
  HEX_W,
  IMG_H,
  IMG_W,
  SCHRITT_X,
  SCHRITT_Y,
  kachelEcke,
  kachelSorte,
  preloadTiles,
  tileImage,
  tileImageFog,
  tileUrl,
} from '../tiles';

/** Wie stark die Kacheln vergroessert werden. */
const SCALE = 2.0;

/**
 * Das Raster folgt dem Abstand, fuer den die Kacheln gezeichnet sind (tiles.ts,
 * SCHRITT_X und SCHRITT_Y) - nicht der Groesse des Sechsecks. Der
 * Zeilenschritt eines Sechsecklayouts ist drei Viertel seiner Hoehe.
 */
const LAYOUT: Layout = { w: SCHRITT_X * SCALE, h: (SCHRITT_Y / 0.75) * SCALE };
void HEX_W;
void HEX_H;

/**
 * Das Bild ist groesser als das Sechseck und sitzt versetzt darueber. Diese
 * Werte schieben es so, dass der Sechseck-Mittelpunkt auf dem Feldmittelpunkt
 * landet und die Aufbauten nach oben herausragen.
 */
const IMG = {
  w: IMG_W * SCALE,
  h: IMG_H * SCALE,
  dx: HEX_CX * SCALE,
  dy: HEX_CY * SCALE,
};

/**
 * Zoomstufen, abgeleitet aus der Bildschirmskalierung.
 *
 * Pixel-Art bleibt nur scharf, wenn ein Bildpunkt der Vorlage auf eine ganze
 * Zahl GERAETEPIXEL faellt. Entscheidend ist das Geraet, nicht das CSS: bei
 * 125 % Windows-Skalierung ist devicePixelRatio 1,25, und ein sauberer
 * CSS-Faktor 2 wird dort zu 2,5 Geraetepixeln - der Browser interpoliert,
 * das Bild wirkt verwaschen. Genau dieser Fall trat auf einem PC auf,
 * waehrend es bei devicePixelRatio 2 tadellos aussah.
 *
 * Deshalb werden die Stufen rueckwaerts gerechnet: erst festlegen, wie viele
 * Geraetepixel ein Kunstpixel bedecken soll (ganzzahlig), daraus ergibt sich
 * der Zoomfaktor.
 */
const leseDpr = (): number => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
/** Die Skalierung beim Laden - nur fuer die Meldung unten. Das Brett verfolgt sie (dpr). */
const DPR_START = leseDpr();

/** Geraetepixel je Kunstpixel. Ganze Zahlen, sonst wird interpoliert. */
const DEVICE_FACTORS = [1, 2, 3, 4, 6, 8, 12] as const;

const zoomStufen = (dpr: number): number[] => DEVICE_FACTORS.map((f) => f / (SCALE * dpr));

/**
 * Startstufe: rund zwei CSS-Pixel je Kunstpixel, also Kacheln von etwa 48
 * Pixeln Breite. Bei hoher Bildschirmskalierung entspricht das mehr
 * Geraetepixeln - die Kachel bleibt dabei gleich gross, nur schaerfer.
 */
const startStufe = (dpr: number): number => {
  const wunsch = 2 * dpr;
  let best = 0;
  for (let i = 1; i < DEVICE_FACTORS.length; i++) {
    if (Math.abs(DEVICE_FACTORS[i]! - wunsch) < Math.abs(DEVICE_FACTORS[best]! - wunsch)) {
      best = i;
    }
  }
  return best;
};

/**
 * Wie lange eine Einheit fuer ein Feld braucht, wenn sie gleitet. Frueher
 * sprangen Einheiten je Runde ein Feld weiter - wer nicht hinsah, verlor sie.
 */
const GLEITEN_MS = 420;

/** Wie weit sich ein Feld unter dem Zeiger hebt. */
const LIFT = 3 * SCALE;

/**
 * Wie hoch das Gelaende hoechstens gezeichnet wird, in Welteinheiten.
 *
 * Ein Deckel, keine Form: tatsaechlich begrenzt die Hoehe der Abstand zum Meer
 * (siehe reliefLimitedAt). Gemessen erreicht das Hochland 15 bis 20 Kunstpixel;
 * der Deckel liegt weit darueber, damit er nirgends abschneidet, wo eine grosse
 * Landmasse doch einmal hoeher kaeme.
 */
const RELIEF_MAX = 180;

/**
 * Wie weit ein Feld hoechstens ueber seinem Nachbarn stehen darf.
 *
 * 1,5 Kunstpixel. hexmap erlaubt 2; das wirkte hier etwas zu stufig. Weil die
 * Hoehe danach auf ganze Kunstpixel abgerundet wird (liftHex), wechseln sich
 * Stufen von 1 und 2 Pixeln ab - im Schnitt ein Viertel flacher als vorher, und
 * nie ueber 2, also weiter von der gemalten Kachelunterkante verdeckt.
 */
const RELIEF_SLOPE = 1.5 * SCALE;

/** Aufgelaufene Raddrehung, ab der eine Zoomstufe geschaltet wird. */
const WHEEL_THRESHOLD = 120;
/** Mindestabstand zwischen zwei Stufen, damit eine Wischgeste nicht durchrast. */
const ZOOM_COOLDOWN_MS = 180;

/**
 * Schwelle fuer die Zwei-Finger-Geste.
 *
 * Chrome und Firefox melden das Aufziehen auf dem Trackpad als wheel mit
 * ctrlKey - aber mit viel kleineren Werten als ein Mausrad, oft nur wenige
 * Einheiten je Ereignis. Mit der Radschwelle muesste man die Finger quer ueber
 * das ganze Trackpad ziehen, bevor eine Stufe schaltet.
 */
const PINCH_THRESHOLD = 28;

/*
 * Einmal in die Konsole, damit sich Schaerfeprobleme nachvollziehen lassen,
 * ohne raten zu muessen: bei welcher Bildschirmskalierung laeuft das Geraet,
 * und wie viele Geraetepixel bedeckt ein Kunstpixel gerade.
 */
if (typeof console !== 'undefined') {
  console.info(
    `InfiniteCarthage: devicePixelRatio ${DPR_START}, Zoomstufen als Geraetepixel je ` +
      `Kunstpixel: ${DEVICE_FACTORS.join(', ')} (Start: ${DEVICE_FACTORS[startStufe(DPR_START)]})`,
  );
}

/** Eine Karte, die von einem Feld zur Hand fliegt. */
export type Flight = {
  id: string;
  hex: string;
  resource: Resource;
  /** Versatz in Millisekunden, damit mehrere nacheinander starten. */
  delay: number;
};

export type Targets = {
  vertices?: string[];
  edges?: string[];
  hexes?: string[];
};

/** Eine kleine Tafel am Gebaeude oder an der Krone: was sich dort ausbauen laesst. */
export type AusbauTafel = {
  ort: { art: 'ecke' | 'feld'; key: string };
  titel: string;
  optionen: { name: string; kosten?: Cost; darf: boolean; hinweis?: string; wahl: () => void }[];
  /** Text, wenn es keine Optionen gibt. */
  leer?: string;
};

/** Eine Krone ueber einem fast oder ganz geschlossenen Feld (rules/hauptstadt.ts). */
export type Krone = { q: number; r: number; bereit: boolean; titel: string };

type Props = {
  world: World;
  state: PublicState;
  targets: Targets;
  /** Alle Zahlen dauerhaft zeigen - sonst erscheinen sie nur unter dem Zeiger. */
  showAllNumbers: boolean;
  /** Felder, die kurz aufleuchten - etwa weil der Wurf sie getroffen hat. */
  flashHexes?: string[];
  /** Pfeile der Bogenschuetzen, die gerade fliegen (net/store.ts). */
  pfeile?: readonly Pfeil[];
  /** Treffer der letzten Kampfrunde - Zahlen, die ueber dem Feld aufsteigen. */
  treffer?: readonly Treffer[];
  /** Karten, die zur Hand fliegen sollen. */
  flights?: Flight[];
  onPick: (kind: 'vertex' | 'edge' | 'hex', key: string) => void;
  /**
   * Felder, die der Betrachter gerade sieht. Alles andere liegt im Nebel.
   * null heisst: kein Nebel.
   */
  sicht?: Set<string> | null;
  /** Wer zuschaut - seine Einheiten stehen nie im Nebel. */
  du?: string | null;
  /** Klick auf ein Feld melden - fuer Befehle an Ritter. */
  onHex?: (key: string) => void;
  /** Ein Befehl wartet auf sein Ziel: das Feld unter dem Zeiger wird markiert. */
  zielWahl?: boolean;
  /** Ausgewaehlte Einheiten - ihre Felder bekommen einen Ring. */
  auswahl?: readonly number[];
  /** Die Befehlstafel an den gewaehlten Einheiten (Game), oder null. */
  befehlsTafel?: { q: number; r: number; inhalt: React.ReactNode } | null;
  /** Kamera auf dieses Feld fahren. n wechselt bei jedem neuen Wunsch. */
  fokus?: { q: number; r: number; n: number } | null;
  /** Tageszeit und Wetter - fuer Licht, Nacht und Fackeln (WetterSchicht). */
  tageszeit?: Tageszeit;
  wetter?: Wetter;
  /** Was auf freien Bauplaetzen als Vorschau steht - statt einer Marke. */
  geisterBau?: 'dorf' | 'stadt' | 'turm' | null;
  /** Klick auf ein eigenes Feuer: loeschen. Ohne diese Angabe sind Feuer nur zu sehen. */
  onFeuer?: (key: string) => void;
  /** Kronen ueber Feldern, die fuer eine Hauptstadt (fast) geschlossen sind. */
  kronen?: Krone[];
  /** Klick auf eine Krone. */
  onKrone?: (q: number, r: number) => void;
  /** Klick auf ein eigenes Gebaeude - zeigt, was sich dort ausbauen laesst. */
  onGebaeude?: (vertex: string) => void;
  /** Klick auf die eigene Hauptstadt - zeigt ihre Ausbaustufen. */
  onHauptstadtKlick?: (hexKey: string) => void;
  /** Klick ins Leere - schliesst die Ausbau-Tafel. */
  onLeer?: () => void;
  /** Die offene Ausbau-Tafel, oder null. */
  ausbau?: AusbauTafel | null;
  /**
   * Aufgesetzte Anzeigen - Handblatt, Wuerfelknopf, Overlays.
   *
   * Sie gehoeren INS Brett, nicht daneben: nur so beziehen sich ihre
   * absoluten Positionen auf die Spielflaeche und nicht auf den Bereich
   * samt Bedienleiste. Sonst legt sich das Handblatt ueber die Knoepfe.
   */
  children?: React.ReactNode;
};

/** zi ist der Index in ZOOM_STEPS - nicht der Faktor selbst, weil sich
 *  Fliesskommawerte schlecht wiederfinden lassen. */
type Camera = { cx: number; cy: number; zi: number };

const ART_NAME = {
  ritter: ['Ritter', 'Ritter'],
  raeuber: ['Raeuber', 'Raeuber'],
  goblin: ['Goblin', 'Goblins'],
  wanderer: ['Wanderer', 'Wanderer'],
  held: ['Held', 'Helden'],
  bogen: ['Bogenschuetze', 'Bogenschuetzen'],
  schleim: ['Schleim', 'Schleime'],
  haeuptling: ['Haeuptling', 'Haeuptlinge'],
  schamane: ['Schamane', 'Schamanen'],
  hexe: ['Hexe', 'Hexen'],
  morast: ['Der Morast', 'Moraste'],
} as const;

const VORHABEN = {
  befehl: '',
  erkunden: 'erkundet',
  jagd: 'auf Jagd',
  ruht: 'traege',
  raub: 'auf Raubzug',
  heimkehr: 'auf dem Heimweg',
  fehde: 'in einer Fehde',
  wandern: 'auf Wanderschaft',
} as const;

/** Eine Gruppe gleicher Einheiten auf einem Feld, in Worten. */
function einheitenText(state: PublicState, du: string | null, gruppe: readonly Unit[]): string {
  const u = gruppe[0]!;
  const n = gruppe.length;
  // Der Held steht mit Namen da, sobald die Partie ihn kennt (core/lore.ts).
  const lore = u.kind === 'held' && n === 1 ? state.players.find((p) => p.id === u.owner)?.held : null;
  // Wer sich einen Namen erkaempft hat, wird beim Namen genannt - mit Rang.
  const verdient = n === 1 && u.name ? `${u.name} (${ART_NAME[u.kind][0]} ${'✦'.repeat(u.stufe ?? 0)})` : null;
  const teile: string[] = [
    lore ? heldVoll(lore) : (verdient ?? `${n > 1 ? `${n} ` : ''}${ART_NAME[u.kind][n > 1 ? 1 : 0]}`),
  ];
  if (u.owner !== null) {
    teile.push(
      u.owner === du
        ? n === 1
          ? 'dein'
          : 'deine'
        : `von ${state.players.find((p) => p.id === u.owner)?.name ?? 'jemandem'}`,
    );
  } else if (u.fraktion !== null) {
    teile.push(fraktionById(state.worldSeed, u.fraktion).name);
  }
  if (VORHABEN[u.auftrag]) teile.push(VORHABEN[u.auftrag]);
  const beute = gruppe.reduce((s, x) => s + x.traegt, 0);
  if (beute > 0) teile.push(`traegt ${beute} ${beute === 1 ? 'Karte' : 'Karten'}`);
  const max = maxLeben(u);
  if (u.kind !== 'wanderer') {
    teile.push(n === 1 ? `Leben ${u.leben}/${max}` : `Leben ${gruppe.map((x) => x.leben).join(', ')} von ${max}`);
  }
  return teile.join(' · ');
}

const KEINE_KRONEN: Krone[] = [];

/**
 * Wie hohe Kacheln eine Hauptstadt verdecken - zum Vergleichen umschaltbar:
 * ?verdecken=kasten|ueberhang|wald|halb|fuss|aus, im Browser auch window.__verdecken.
 * Ohne Angabe gilt die Hoehenmaske; eine handgemalte *_mask.png hat dabei
 * Vorrang vor der automatischen Schaetzung (tiles.ts).
 */
type VerdeckenModus = 'kasten' | 'ueberhang' | 'wald' | 'halb' | 'fuss' | 'aus' | 'voll' | 'maske';
const VERDECKEN_MODI: readonly string[] = ['kasten', 'ueberhang', 'wald', 'halb', 'fuss', 'aus', 'voll', 'maske'];
function verdeckenModus(): VerdeckenModus {
  try {
    const gesetzt =
      (window as unknown as { __verdecken?: string }).__verdecken ??
      new URLSearchParams(window.location.search).get('verdecken') ??
      'maske';
    return (VERDECKEN_MODI.includes(gesetzt) ? gesetzt : 'maske') as VerdeckenModus;
  } catch {
    return 'maske';
  }
}
/** Groesste Breite der Ausbau-Tafel (styles.css) und ungefaehre Hoehe - fuers Klemmen am Rand. */
const TAFEL_BREITE = 230;
const TAFEL_HOEHE = 170;

/** Augenzahl als Punkte: sagt schneller als die Ziffer, wie oft ein Feld trifft. */
const pips = (n: number): string => '.'.repeat(6 - Math.abs(7 - n));

export function Board({
  world,
  state,
  targets,
  showAllNumbers,
  flashHexes,
  pfeile,
  treffer,
  flights,
  onPick,
  sicht = null,
  du = null,
  onHex,
  zielWahl = false,
  auswahl = [],
  befehlsTafel = null,
  fokus = null,
  tageszeit = 'tag',
  wetter = 'klar',
  geisterBau = null,
  onFeuer,
  kronen = KEINE_KRONEN,
  onKrone,
  onGebaeude,
  onHauptstadtKlick,
  onLeer,
  ausbau = null,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  /**
   * Die Bildschirmskalierung - verfolgt, nicht einmal gelesen.
   *
   * Sie aendert sich, wenn man die Seite mit Cmd/Strg und Plus zoomt oder das
   * Fenster auf einen anderen Bildschirm zieht. Mit dem Wert vom Laden passte
   * danach nichts mehr aufs Geraetepixel, und die ganze Karte wurde weich.
   */
  const [dpr, setDpr] = useState(leseDpr);
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const neu = () => setDpr(leseDpr());
    mq.addEventListener('change', neu);
    return () => mq.removeEventListener('change', neu);
  }, [dpr]);
  const zoomSteps = useMemo(() => zoomStufen(dpr), [dpr]);
  const [cam, setCam] = useState<Camera>(() => ({ cx: 0, cy: 0, zi: startStufe(leseDpr()) }));
  const scale = zoomSteps[cam.zi]!;
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const moved = useRef(false);
  /** Feld unter dem Zeiger - nur dessen Zahl wird eingeblendet. */
  const [hover, setHover] = useState<string | null>(null);
  /** Bauplatz-Ecke unter dem Zeiger - ihre drei Felder zeigen ihre Zahlen. */
  const [eckeHover, setEckeHover] = useState<string | null>(null);
  /** Strassen-Kante unter dem Zeiger - dort steht die Strasse als Vorschau. */
  const [kanteHover, setKanteHover] = useState<string | null>(null);
  /**
   * Finger auf dem Brett, fuer die Zwei-Finger-Geste auf Touchgeraeten.
   * kneifen haelt den Fingerabstand bei der letzten Zoomstufe.
   */
  const finger = useRef(new Map<number, { x: number; y: number }>());
  const kneifen = useRef<{ abstand: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Schicht fuer die Gipfel vor den Strassen - einmal angelegt, je Bild geleert. */
  const ueberhangRef = useRef<HTMLCanvasElement | null>(null);
  /** Schicht fuer die Probe "voll" - Bauten Reihe fuer Reihe, ausgestanzt von Wald und Bergen. */
  const vollRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * Aufgelaufene Raddrehung.
   *
   * Ein Mausrad meldet je Rastung ein Ereignis, ein Trackpad dagegen
   * dutzende pro Wischgeste - eine Zoomstufe pro Ereignis rast dort durch
   * alle Stufen, bevor man den Finger hebt. Deshalb wird die Drehung
   * aufsummiert und erst ab einer Schwelle eine Stufe geschaltet.
   */
  const radAcc = useRef(0);
  /** Womit zuletzt gedrueckt wurde - Maus, Finger oder Stift. */
  const letzterZeiger = useRef<string>('mouse');
  const letzterZoom = useRef(0);
  const [tilesReady, setTilesReady] = useState(false);

  useEffect(() => {
    let lebt = true;
    void Promise.all([preloadTiles(), preloadUnitSprites()]).then(() => {
      if (lebt) setTilesReady(true);
    });
    return () => {
      lebt = false;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Zeichenhoehe eines Feldes.
   *
   * reliefLimitedAt merkt sich seine Werte selbst; hier geht es nur um die
   * Umrechnung in Welteinheiten.
   */
  const liftHex = useCallback(
    (q: number, r: number) =>
      // Auf ganze Kunstpixel abrunden, wie hexmap mit ganzzahligem Versatz: so
      // liegen alle Kacheln auf demselben Pixelraster.
      Math.floor(
        (reliefLimitedAt(state.worldSeed, q, r, RELIEF_SLOPE / RELIEF_MAX) * RELIEF_MAX) / SCALE + 1e-6,
      ) * SCALE,
    [state.worldSeed],
  );

  /** Ecken und Kanten liegen zwischen Feldern - also der Mittelwert. */
  const liftVertex = useCallback(
    (v: Vertex) => {
      const hs = vertexAdjacentHexes(v);
      return hs.reduce((n, h) => n + liftHex(h.q, h.r), 0) / hs.length;
    },
    [liftHex],
  );
  const liftEdge = useCallback(
    (e: Edge) => {
      const hs = edgeAdjacentHexes(e);
      return hs.reduce((n, h) => n + liftHex(h.q, h.r), 0) / hs.length;
    },
    [liftHex],
  );

  /** Wo ein Feuer auf der Karte steht, in Welteinheiten: Mitte der Strasse oder die Ecke. */
  const brandPunkt = useCallback(
    (b: Brand): { x: number; y: number } => {
      if (b.art === 'strasse') {
        const kante = parseEdgeKey(b.key);
        const [a, c] = edgeEndpoints(kante).map((v) => vertexToPixel(v, LAYOUT));
        return { x: (a!.x + c!.x) / 2, y: (a!.y + c!.y) / 2 - liftEdge(kante) + 2 * SCALE };
      }
      const ecke = parseVertexKey(b.key);
      const p = vertexToPixel(ecke, LAYOUT);
      return { x: p.x, y: p.y - liftVertex(ecke) + SCALE };
    },
    [liftEdge, liftVertex],
  );

  /** Auf Wunsch zu einem Feld fahren - etwa wenn im Menue ein Ritter gezeigt wird. */
  useEffect(() => {
    if (!fokus) return;
    const p = hexToPixel(fokus.q, fokus.r, LAYOUT);
    setCam((c) => ({ ...c, cx: p.x, cy: p.y - liftHex(fokus.q, fokus.r) }));
    // Nur bei einem neuen Wunsch - nicht, wenn sich die Hoehenfunktion aendert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokus?.n]);

  const view = useMemo(() => {
    /*
     * Der Ausschnitt wird auf das Geraetepixel-Raster gerastet.
     *
     * Ein ganzzahliger Vergroesserungsfaktor allein genuegt nicht: faengt der
     * Ausschnitt auf einem halben Geraetepixel an, liegt jede Kachel um einen
     * halben Pixel daneben und der Browser interpoliert trotzdem. Ein
     * Geraetepixel entspricht 1/(scale*dpr) Welteinheiten.
     */
    const raster = 1 / (scale * dpr);
    const snap = (v: number) => Math.round(v / raster) * raster;
    return {
      x: snap(cam.cx - size.w / 2 / scale),
      y: snap(cam.cy - size.h / 2 / scale),
      w: size.w / scale,
      h: size.h / scale,
    };
  }, [cam, size, scale, dpr]);

  /**
   * Sichtbare Felder, zeilenweise sortiert. Der Rand von einer Kachelgroesse
   * verhindert, dass am Bildrand halbe Felder aufblitzen.
   */
  const visible = useMemo(() => {
    const out = [];
    for (const t of world.tiles.values()) {
      const p = hexToPixel(t.q, t.r, LAYOUT);
      if (
        p.x < view.x - LAYOUT.w ||
        p.x > view.x + view.w + LAYOUT.w ||
        p.y < view.y - IMG.h ||
        // Nach unten grosszuegiger: eine angehobene Kachel weit unten kann
        // noch ins Bild ragen, obwohl ihr Fuss darunter liegt.
        p.y > view.y + view.h + IMG.h + RELIEF_MAX
      ) {
        continue;
      }
      out.push(t);
    }
    // Von oben nach unten, damit die Ueberlappung richtig herum liegt.
    out.sort((a, b) => a.r - b.r || a.q - b.q);
    return out;
  }, [world, view]);

  /**
   * Wer auf welchem Feld steht - Lagerbesatzungen und das Heer.
   *
   * Das Heer steht im Spielstand (state.units); die Besatzung der Lager wird nur
   * fuer sichtbare Felder abgeleitet (core/units.ts).
   */
  const besatzung = useMemo(() => {
    const m = new Map<string, Unit[]>();
    const dazu = (u: Unit) => {
      const k = hexKey(u.q, u.r);
      const liste = m.get(k);
      if (liste) liste.push(u);
      else m.set(k, [u]);
    };
    garrisonUnits(state, visible).forEach(dazu);
    state.units.forEach(dazu);
    return m;
  }, [visible, state]);

  /*
   * Bewegung: zieht eine Einheit, gleitet sie vom alten zum neuen Feld, mit
   * zwei kleinen Hopsern je Feld, statt zu springen. Gemerkt wird, wo jede
   * Einheit beim letzten Zustand stand; die Animation laeuft nur, solange
   * etwas gleitet. Wer Bewegung reduziert haben will, bekommt keine.
   * PLATZHALTER fuer echte Schrittbilder (ASSETS.md).
   */
  const bewegung = useRef(new Map<number, { von: Hex; start: number; dauer: number; schritte: number }>());
  const letzteFelder = useRef<Map<number, Hex> | null>(null);
  const [animZeit, setAnimZeit] = useState(0);
  useEffect(() => {
    const vorher = letzteFelder.current;
    letzteFelder.current = new Map(state.units.map((u) => [u.id, { q: u.q, r: u.r }]));
    if (!vorher) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const jetzt = performance.now();
    for (const u of state.units) {
      const alt = vorher.get(u.id);
      if (!alt || (alt.q === u.q && alt.r === u.r)) continue;
      const schritte = hexDistance(alt, u);
      // Weiter als drei Felder ist kein Zug, sondern ein Sprung - etwa nach dem Neuladen.
      if (schritte > 3) continue;
      bewegung.current.set(u.id, { von: alt, start: jetzt, dauer: GLEITEN_MS * schritte, schritte });
    }
    if (bewegung.current.size === 0) return;
    let id = 0;
    const bild = () => {
      const t = performance.now();
      for (const [k, b] of bewegung.current) if (t - b.start >= b.dauer) bewegung.current.delete(k);
      setAnimZeit(t);
      if (bewegung.current.size > 0) id = requestAnimationFrame(bild);
    };
    id = requestAnimationFrame(bild);
    return () => cancelAnimationFrame(id);
  }, [state.units]);

  /**
   * Felder an eigenen Doerfern und Staedten - ihre Zahlen stehen immer da.
   * Auf dem Handy gibt es kein Darueberfahren; ohne das saehe man dort nie, was
   * die eigenen Felder bringen.
   */
  const eigeneFelder = useMemo(() => {
    const out = new Set<string>();
    if (du === null) return out;
    for (const [vk, b] of Object.entries(state.buildings)) {
      if (b.owner !== du) continue;
      for (const h of vertexAdjacentHexes(parseVertexKey(vk))) out.add(hexKey(h.q, h.r));
    }
    // Auf einer Hauptstadt laege die Marke mitten auf der Burg - dort nur unter dem Zeiger.
    for (const hk of Object.keys(state.hauptstaedte ?? {})) out.delete(hk);
    return out;
  }, [state.buildings, state.hauptstaedte, du]);

  /** Die Farbe einer Seite: Spielerfarbe, Fraktionsfarbe oder Grau fuer Neutrale. */
  const farbeSeite = useCallback(
    (seite: Seite | undefined): string => {
      if (seite === undefined) return '#8d8a7e';
      if (istSpielerSeite(seite)) {
        const id = spielerAus(seite);
        return playerColor(state.players.find((pl) => pl.id === id)?.color ?? 0);
      }
      if (istFraktion(seite)) return fraktionColor(fraktionById(state.worldSeed, seite).farbe);
      return '#8d8a7e';
    },
    [state.players, state.worldSeed],
  );

  /**
   * Lichtquellen fuer Abend und Nacht (WetterSchicht): Fackeln der Einheiten,
   * erleuchtete Fenster der Doerfer und Staedte, Feuer in den Lagern - in
   * Geraetepixeln. Nur was im Bild ist, die naechsten zur Bildmitte zuerst.
   */
  const lichter = useMemo((): Licht[] => {
    if (tageszeit !== 'nacht' && tageszeit !== 'abend') return [];
    const f = Math.round(SCALE * scale * dpr);
    const geraet = (x: number, y: number) => ({
      x: (x - view.x) * scale * dpr,
      y: (y - view.y) * scale * dpr,
    });
    const out: Licht[] = [];
    for (const t of visible) {
      const k = hexKey(t.q, t.r);
      const nebel = sicht !== null && !sicht.has(k);
      const c = hexToPixel(t.q, t.r, LAYOUT);
      const p = geraet(c.x, c.y - liftHex(t.q, t.r));
      if (isNestActive(state, t.q, t.r)) {
        out.push({ x: p.x, y: p.y, r: 26 * f, waerme: 1 });
        continue;
      }
      const leute = besatzung.get(k)?.filter((u) => !nebel || (du !== null && u.owner === du));
      if (leute && leute.length > 0) {
        // Der Held traegt das hellste Licht der Nacht.
        const held = leute.some((u) => u.kind === 'held');
        out.push({ x: p.x, y: p.y - 4 * f, r: (held ? 48 : 22) * f, waerme: held ? 1.15 : 1 });
      }
    }
    for (const [vk, b] of Object.entries(state.buildings)) {
      const ecke = parseVertexKey(vk);
      const v = vertexToPixel(ecke, LAYOUT);
      const p = geraet(v.x, v.y - liftVertex(ecke));
      out.push({ x: p.x, y: p.y, r: (b.type === 'city' ? 34 : 24) * f, waerme: 0.8 });
    }
    // Der Wachturm hat oben eine Feuerschale - er leuchtet weiter als jedes Haus.
    for (const vk of Object.keys(state.tuerme ?? {})) {
      const ecke = parseVertexKey(vk);
      const v = vertexToPixel(ecke, LAYOUT);
      const p = geraet(v.x, v.y - liftVertex(ecke));
      out.push({ x: p.x, y: p.y, r: 44 * f, waerme: 1 });
    }
    for (const b of state.braende) {
      const w = brandPunkt(b);
      const p = geraet(w.x, w.y);
      out.push({ x: p.x, y: p.y - 3 * f, r: 30 * f, waerme: 1.3 });
    }
    const bw = size.w * dpr;
    const bh = size.h * dpr;
    return out
      .filter((l) => l.x > -l.r && l.y > -l.r && l.x < bw + l.r && l.y < bh + l.r)
      .sort((a, b) => Math.hypot(a.x - bw / 2, a.y - bh / 2) - Math.hypot(b.x - bw / 2, b.y - bh / 2))
      .slice(0, MAX_LICHTER);
  }, [tageszeit, scale, view, visible, sicht, liftHex, liftVertex, state, besatzung, du, size, brandPunkt, dpr]);

  /** Wo gekaempft wird - dieselbe Frage, nach der die Regel kaempfen laesst. */
  const kampf = useMemo(() => kampfFelder(state), [state]);

  /**
   * Was auf dem Feld unter dem Zeiger steht, in Worten: Lager, Ruine, Einheiten
   * mit Fraktion und Vorhaben, ein Kampf. Im Nebel nur, was man ohnehin kennt.
   */
  const feldInfo = useMemo(() => {
    if (hover === null) return null;
    const [q, r] = hover.split(':').map(Number) as [number, number];
    const nebel = sicht !== null && !sicht.has(hover);
    const zeilen: { farbe?: string; text: string; kampf?: boolean }[] = [];
    if (isNestActive(state, q, r)) {
      const f = fraktionById(state.worldSeed, nestFraktionOf(state, q, r));
      const n = garrisonOf(state, q, r);
      zeilen.push({
        farbe: fraktionColor(f.farbe),
        text: `Lager von ${f.name} · ${n} ${f.art === 'goblin' ? (n === 1 ? 'Goblin' : 'Goblins') : 'Raeuber'}`,
      });
    }
    if (ruinAt(state.worldSeed, q, r) && !state.exploredRuins.includes(hover)) {
      zeilen.push({ text: 'Ruine, unerkundet' });
    }
    if (!nebel) {
      const gruppen = new Map<string, Unit[]>();
      for (const u of state.units) {
        if (u.q !== q || u.r !== r) continue;
        const key = `${seiteVon(u)}|${u.kind}|${u.auftrag}`;
        gruppen.set(key, [...(gruppen.get(key) ?? []), u]);
      }
      for (const gruppe of gruppen.values()) {
        zeilen.push({ farbe: farbeSeite(seiteVon(gruppe[0]!)), text: einheitenText(state, du, gruppe) });
      }
      if (istKampf(kampf.get(hover) ?? [], state)) zeilen.push({ text: 'Hier wird gekaempft', kampf: true });
    }
    for (const b of state.braende) {
      if (loeschFelder(b).some((h) => h.q === q && h.r === r)) {
        zeilen.push({ text: `Hier brennt ${BRAND_WAS[b.art]}`, kampf: true });
      }
    }
    for (const a of state.auftraege) {
      if (a.player !== du || a.status !== 'angenommen' || a.q !== q || a.r !== r) continue;
      if (a.art === 'lager') zeilen.push({ text: 'Dein Auftrag: dieses Lager zerstoeren' });
      if (a.art === 'ruine') zeilen.push({ text: 'Dein Auftrag: diese Ruine erkunden' });
      if (a.art === 'kundschaft') zeilen.push({ text: 'Dein Auftrag: dieses Feld auskundschaften' });
    }
    return zeilen.length > 0 ? zeilen : null;
  }, [hover, state, sicht, du, kampf, farbeSeite]);

  /**
   * Gelaende auf das Canvas zeichnen.
   *
   * Der Speicher hinter dem Canvas ist um devicePixelRatio groesser als die
   * angezeigte Flaeche, sonst waere schon die Aufloesung zu grob. Danach wird
   * jede Kachel auf ganze Geraetepixel gerundet gezeichnet - Bruchteile
   * fuehren selbst mit abgeschalteter Glaettung zu weichen Kanten.
   */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !tilesReady) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const bw = Math.round(size.w * dpr);
    const bh = Math.round(size.h * dpr);
    if (cv.width !== bw) cv.width = bw;
    if (cv.height !== bh) cv.height = bh;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    // Das eine, worum es hier geht.
    ctx.imageSmoothingEnabled = false;

    /**
     * Wo das Kachelbild eines Feldes beginnt, in Geraetepixeln - auf ganzen
     * Kunstpixeln (tiles.ts, kachelEcke). Kacheln, Figuren und gleitende
     * Einheiten rechnen alle von hier, damit sie im selben Raster sitzen.
     */
    const ursprung = (q: number, r: number, lift: number) => {
      const k = kachelEcke(q, r);
      return {
        x: Math.round((k.x * SCALE - view.x) * scale * dpr),
        y: Math.round((k.y * SCALE - lift - view.y) * scale * dpr),
      };
    };

    /** Liegt ein Feld im Nebel? Ohne Sichtangabe nie. */
    const imNebel = (q: number, r: number) => sicht !== null && !sicht.has(hexKey(q, r));

    const zeichne = (t: (typeof visible)[number], lift: number) => {
      const url = tileUrl(state.worldSeed, t.terrain, t.q, t.r);
      if (url === null) return;
      const img = imNebel(t.q, t.r) ? tileImageFog(url) : tileImage(url);
      if (!img) return;
      const { x, y } = ursprung(t.q, t.r, lift);
      const w = Math.round(IMG.w * scale * dpr);
      const h = Math.round(IMG.h * scale * dpr);
      ctx.drawImage(img, x, y, w, h);
    };

    /** Geraetepixel je Kunstpixel - bei jeder Zoomstufe ganzzahlig. */
    const f = Math.round(SCALE * scale * dpr);
    /** Abends und nachts tragen Einheiten Fackeln - das Licht dazu malt die WetterSchicht. */
    const fackeln = tageszeit === 'nacht' || tageszeit === 'abend';
    /** Wer gerade gleitet - wird nach allen Kacheln an seiner Zwischenposition gezeichnet. */
    const unterwegs: { u: Unit; fx: number; fy: number }[] = [];
    const jetzt = performance.now();

    /**
     * Was auf dem Feld steht: erst das Lager, dann die Figuren von hinten nach
     * vorn. Direkt nach der eigenen Kachel gezeichnet, damit die Kacheln davor
     * die Fuesse verdecken - wer hinter einem Wald steht, steht dahinter.
     * g: wohin - die Gipfel-Schicht nutzt das, um Figuren auszustanzen.
     */
    const zeichneBesatzung = (t: (typeof visible)[number], lift: number, g: CanvasRenderingContext2D = ctx) => {
      const lager = isNestActive(state, t.q, t.r);
      const ruine =
        ruinAt(state.worldSeed, t.q, t.r) && !state.exploredRuins.includes(hexKey(t.q, t.r));
      const nebel = imNebel(t.q, t.r);
      // Im Nebel sieht man nur, was man ohnehin kennt - Lager, ihre Besatzung,
      // Ruinen - und die eigenen Leute. Fremde Einheiten verschwinden darin.
      const leute = besatzung
        .get(hexKey(t.q, t.r))
        ?.filter((u) => !nebel || u.id < 0 || (du !== null && u.owner === du));
      if (!lager && !ruine && (!leute || leute.length === 0)) return;
      // Ursprung wie in zeichne, damit Figuren im selben Pixelraster sitzen.
      const { x: x0, y: y0 } = ursprung(t.q, t.r, lift);
      const mx = x0 + Math.round(HEX_CX) * f;
      const my = y0 + Math.round(HEX_CY) * f;
      if (nebel) g.globalAlpha = 0.6;
      if (lager) {
        zeichneFigur(g, 'lager', mx, my + f, f, farbeSeite(nestFraktionOf(state, t.q, t.r)));
      }
      if (ruine) zeichneFigur(g, 'ruine', mx, my + 2 * f, f);
      // Das Haus der Hexe steht fuer sich, abseits von Lagern und Ruinen.
      if (hexenhausAt(state.worldSeed, t.q, t.r)) zeichneFigur(g, 'hexenhaus', mx, my + 2 * f, f);
      if (!leute || leute.length === 0) {
        g.globalAlpha = 1;
        return;
      }
      // Nach Seite sortiert: wer zusammengehoert, steht beieinander - im Kampf
      // stehen die Seiten einander gegenueber (aufstellung).
      const reihe = [...leute].sort((a, b) => {
        const sa = seiteVon(a);
        const sb = seiteVon(b);
        return sa < sb ? -1 : sa > sb ? 1 : a.id - b.id;
      });
      const stellen = aufstellung(reihe.length, lager || ruine);
      reihe.slice(0, stellen.length).forEach((u, i) => {
        const [ox, oy] = stellen[i]!;
        const fx = mx + ox * f;
        const fy = my + oy * f;
        if (u.id >= 0 && bewegung.current.has(u.id)) {
          if (g === ctx) unterwegs.push({ u, fx, fy });
          return;
        }
        /*
         * Der Ernannte hat seine eigene Figur (rules/zweig.ts) - er traegt zwar
         * die Art 'held', sieht aber anders aus. Der gewoehnliche Held traegt
         * die Gestalt seines Hauses, eine von zehn (core/lore.ts).
         */
        const figur = u.zweig ?? u.kind;
        const gestalt =
          u.kind === 'held' && !u.zweig
            ? state.players.find((p) => p.id === u.owner)?.held?.gestalt
            : undefined;
        // Und wer sich hochgedient hat, traegt seinen Rang: Helm, Feder, Umhang.
        zeichneFigur(g, figur, fx, fy, f, farbeSeite(seiteVon(u)), gestalt, u.stufe ?? 0);
        if (fackeln && u.id >= 0) zeichneFigur(g, 'fackel', fx + 5 * f, fy - 2 * f, f);
        // Wer sich hochgedient hat, traegt seine Winkel ueber dem Kopf.
        if (u.id >= 0 && (u.stufe ?? 0) > 0) zeichneStufe(g, u.kind, fx, fy, f, u.stufe ?? 0);
        const max = maxLeben(u);
        // Im Gefecht traegt jede Figur ihren Balken, sonst nur die verwundeten:
        // so sieht man, wie es auf dem Feld steht (DESIGN.md, Kampf sehen).
        const imGefecht = kampf.has(hexKey(t.q, t.r));
        if (u.id >= 0 && (u.leben < max || imGefecht)) zeichneLeben(g, u.kind, fx, fy, f, u.leben, max);
      });
      g.globalAlpha = 1;
    };

    /*
     * Jede Kachel genau einmal, auf ihrer Hoehe - wie bei hexmap.
     *
     * Eine erste Fassung legte die flache Karte als abgedunkelten Sockel
     * darunter, weil angehobene Kacheln Loecher aufrissen. Das lag an der
     * Steigung: benachbarte Felder durften beliebig weit auseinanderliegen.
     * Seit sie auf zwei Kunstpixel begrenzt ist (reliefLimitedAt), verdeckt
     * die gemalte Unterkante jeder Kachel die Stufe selbst.
     */
    /*
     * Die Besatzung einer Reihe kommt erst nach den Kacheln der NAECHSTEN Reihe.
     * Frueher direkt nach der eigenen Kachel: dann malte die Reihe darunter
     * ueber alles, was ueber den unteren Feldrand ragt - im Kampf stehen
     * die Figuren weit unten, und die Kachel davor schnitt sie in der Mitte
     * durch. Zwei Reihen weiter reicht keine Kachel mehr so hoch.
     */
    let vorige: { t: (typeof visible)[number]; hoch: number }[] = [];
    let diese: typeof vorige = [];
    let zeile = Number.NaN;
    for (const t of visible) {
      if (t.r !== zeile) {
        for (const b of vorige) zeichneBesatzung(b.t, b.hoch);
        vorige = diese;
        diese = [];
        zeile = t.r;
      }
      if (hexKey(t.q, t.r) === hover) continue; // kommt zuletzt, angehoben
      const hoch = liftHex(t.q, t.r);
      zeichne(t, hoch);
      diese.push({ t, hoch });
    }
    for (const b of [...vorige, ...diese]) zeichneBesatzung(b.t, b.hoch);

    if (hover !== null) {
      const t = world.tiles.get(hover);
      if (t) {
        // Schatten zuerst: er gehoert auf den Boden, nicht auf die Kachel.
        const c = hexToPixel(t.q, t.r, LAYOUT);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(
          (c.x - view.x) * scale * dpr,
          (c.y + LAYOUT.h * 0.42 - liftHex(t.q, t.r) - view.y) * scale * dpr,
          LAYOUT.w * 0.34 * scale * dpr,
          LAYOUT.h * 0.09 * scale * dpr,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
        zeichne(t, liftHex(t.q, t.r) + LIFT);
        zeichneBesatzung(t, liftHex(t.q, t.r) + LIFT);
      }
    }

    // Gleitende Einheiten: vom alten Feld zum Platz auf dem neuen, mit Hopsern.
    for (const { u, fx, fy } of unterwegs) {
      const b = bewegung.current.get(u.id);
      if (!b) continue;
      const p = Math.min(1, Math.max(0, (jetzt - b.start) / b.dauer));
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const von = ursprung(b.von.q, b.von.r, liftHex(b.von.q, b.von.r));
      const sx = von.x + Math.round(HEX_CX) * f;
      const sy = von.y + Math.round(HEX_CY) * f + 4 * f;
      const hops = Math.round(Math.abs(Math.sin(p * Math.PI * 2 * b.schritte)) * 2) * f;
      const x = Math.round(sx + (fx - sx) * e);
      const y = Math.round(sy + (fy - sy) * e) - hops;
      zeichneFigur(ctx, u.zweig ?? u.kind, x, y, f, farbeSeite(seiteVon(u)));
      if (fackeln) zeichneFigur(ctx, 'fackel', x + 5 * f, y - 2 * f, f);
      const max = maxLeben(u);
      if (u.leben < max) zeichneLeben(ctx, u.kind, x, y, f, u.leben, max);
    }

    /*
     * Strassen, Doerfer und Staedte als Pixelgrafik (units.ts). Frueher glatte
     * SVG-Formen, die ueber der Pixelkarte wie aufgeklebt wirkten. Nach allen
     * Kacheln, auch der angehobenen, damit kein Feld ein Haus verdeckt; erst die
     * Strassen, dann die Gebaeude, die deren Enden decken. Ecken liegen auf dem
     * Mittel ihrer drei Felder - Strassenenden und Haeuser treffen sich so.
     */
    const geraet = (x: number, y: number) => ({
      x: Math.round((x - view.x) * scale * dpr),
      y: Math.round((y - view.y) * scale * dpr),
    });
    const spielerFarbe = (id: string) =>
      playerColor(state.players.find((pl) => pl.id === id)?.color ?? 0);
    /*
     * Vor welcher Kachelreihe etwas steht (Probe "voll", unten): eine Ecke N ist
     * die obere Ecke ihres Feldes und gehoert zu dessen Reihe, eine Ecke S zur
     * Reihe darunter. Eine Kante steht vor der tieferen ihrer beiden Ecken.
     */
    const eckTiefe = (v: Vertex) => (v.d === 'N' ? v.r : v.r + 1);
    const kantenTiefe = (ek: string) => Math.max(...edgeEndpoints(parseEdgeKey(ek)).map(eckTiefe));
    // Asche abgebrannter Strassen zuerst - was darauf neu gebaut ist, liegt obenauf.
    const asche = Object.entries(state.asche).filter(([ek]) => state.roads[ek] === undefined);
    /*
     * Festungsring (Hauptstadt ab Stufe II): die Strassen des Rings werden Mauer,
     * die Staedte an seinen Ecken Bastionen - im Stein ihres Gelaendes.
     */
    const sorteVon = (hk: string, q: number, r: number) =>
      kachelSorte(state.worldSeed, world.tiles.get(hk)?.terrain ?? 'pasture', q, r);
    const mauerKanten = new Map<string, string>();
    const bastionen = new Map<string, string>();
    // Im Ring einer Residenz (Stufe I) tragen die Strassen keine Wimpel - Burg und Staedte zeigen die Farbe.
    const ringOhneWimpel = new Set<string>();
    /*
     * Sonst auch nicht jeder Abschnitt: etwa jeder dritte, fest nach der Kante
     * gewaehlt, damit der Wimpel beim Weiterbauen nicht springt. Genug, um zu
     * sehen, wem ein Weg gehoert, ohne dass jede Kante flattert.
     */
    const wimpelKante = (ek: string) => {
      let h = 0;
      for (let i = 0; i < ek.length; i++) h = (Math.imul(h, 31) + ek.charCodeAt(i)) | 0;
      return (h >>> 0) % 3 === 0;
    };
    for (const [hk, h] of Object.entries(state.hauptstaedte ?? {})) {
      const [q, r] = hk.split(':').map(Number) as [number, number];
      if (h.stufe < 2) {
        for (const e of hexEdges(q, r)) if (state.roads[edgeKey(e)] === h.owner) ringOhneWimpel.add(edgeKey(e));
        continue;
      }
      const sorte = sorteVon(hk, q, r);
      for (const e of hexEdges(q, r)) {
        const ek = edgeKey(e);
        if (state.roads[ek] === h.owner) mauerKanten.set(ek, sorte);
      }
      for (const v of hexVertices(q, r)) {
        const vk = vertexKey(v);
        if (state.buildings[vk]?.owner === h.owner) bastionen.set(vk, sorte);
      }
    }
    const kantePixel = (ek: string) =>
      edgeEndpoints(parseEdgeKey(ek)).map((v) => {
        const p = vertexToPixel(v, LAYOUT);
        return geraet(p.x, p.y - liftVertex(v));
      });
    /*
     * Wer wen verdeckt. Es haengt daran, ob die unterste Ecke des Feldes
     * bebaut ist - dann steht dort ohnehin etwas vor der Hauptstadt:
     *
     *   Stufe I   Steht unten eine Stadt, deckt die Burg die beiden oberen
     *             Staedte. Sonst bleibt es umgekehrt, sonst schnitten deren
     *             Haeuser den Bergfried unten ab.
     *   Stufe II  Die unterste Bastion faellt weg - sie verdeckt nur den
     *             Palast. Ertrag und Punkte der Stadt bleiben, gezeichnet
     *             wird sie nicht.
     *   Mauer     Was von einer oberen Bastion abwaerts fuehrt, endet auf
     *             halber Turmhoehe an ihr: die Mauer laeuft auf den Turm zu,
     *             der Turm steht davor, dahinter geht die Mauer weiter.
     *             Frueher lief sie ueber ihn hinweg und verdeckte gerade das
     *             Bauteil, das die Silhouette traegt.
     */
    const nachDerBurg = new Map<string, number>();
    const ohneBastion = new Set<string>();
    const kurzeMauer = new Set<string>();
    for (const [hk, h] of Object.entries(state.hauptstaedte ?? {})) {
      const [q, r] = hk.split(':').map(Number) as [number, number];
      const c = hexToPixel(q, r, LAYOUT);
      const eigene = hexVertices(q, r)
        .map((v) => ({ vk: vertexKey(v), y: vertexToPixel(v, LAYOUT).y }))
        .filter((e) => state.buildings[e.vk]?.owner === h.owner);
      const untenBebaut = eigene.some((e) => e.y > c.y);
      if (h.stufe < 2) {
        if (untenBebaut) continue;
        const burgFuss = geraet(c.x, c.y - liftHex(q, r)).y + 6 * f;
        for (const e of eigene) {
          if (e.y >= c.y) continue;
          nachDerBurg.set(e.vk, Math.max(nachDerBurg.get(e.vk) ?? -Infinity, burgFuss + 1));
        }
        continue;
      }
      for (const e of eigene) if (e.y > c.y) ohneBastion.add(e.vk);
      for (const kante of hexEdges(q, r)) {
        const ek = edgeKey(kante);
        if (state.roads[ek] !== h.owner) continue;
        const enden = edgeEndpoints(kante).map((v) => ({ vk: vertexKey(v), y: vertexToPixel(v, LAYOUT).y }));
        const [oben, unten] = enden[0]!.y <= enden[1]!.y ? [enden[0]!, enden[1]!] : [enden[1]!, enden[0]!];
        if (oben.y < c.y && unten.y > oben.y && eigene.some((e) => e.vk === oben.vk)) kurzeMauer.add(ek);
      }
    }
    // Die Hauptstadt steht vor der Reihe ihrer vorderen Nachbarn - die Staedte an ihren hinteren Ecken mit ihr.
    const hauptstadtTiefe = (hk: string) => Number(hk.split(':')[1]) + 1;
    const burgTiefe = new Map<string, number>();
    for (const [hk, h] of Object.entries(state.hauptstaedte ?? {})) {
      if (h.stufe >= 2) continue;
      const [q, r] = hk.split(':').map(Number) as [number, number];
      const c = hexToPixel(q, r, LAYOUT);
      for (const v of hexVertices(q, r)) if (vertexToPixel(v, LAYOUT).y < c.y) burgTiefe.set(vertexKey(v), hauptstadtTiefe(hk));
    }
    const gebaeudeTiefe = (vk: string) => burgTiefe.get(vk) ?? eckTiefe(parseVertexKey(vk));

    /**
     * Strassen, Mauern, Gebaeude und Hauptstaedte auf g. nur: welche Reihen -
     * die Probe "voll" zeichnet Reihe fuer Reihe, sonst kommt alles auf einmal.
     */
    const zeichneBauten = (g: CanvasRenderingContext2D, nur: (tiefe: number) => boolean = () => true) => {
      zeichneStrassen(
        g,
        asche
          .filter(([ek]) => nur(kantenTiefe(ek)))
          .map(([ek, owner]) => {
            const [a, b] = kantePixel(ek);
            return { a: a!, b: b!, farbe: spielerFarbe(owner), verbrannt: true };
          }),
        f,
      );
      zeichneStrassen(
        g,
        Object.entries(state.roads)
          .filter(([ek]) => !mauerKanten.has(ek) && nur(kantenTiefe(ek)))
          .map(([ek, owner]) => {
            const [a, b] = kantePixel(ek);
            return { a: a!, b: b!, farbe: spielerFarbe(owner), ohneWimpel: ringOhneWimpel.has(ek) || !wimpelKante(ek) };
          }),
        f,
      );
      zeichneMauern(
        g,
        [...mauerKanten]
          .filter(([ek]) => nur(kantenTiefe(ek)))
          .map(([ek, sorte]) => {
            const [a, b] = kantePixel(ek);
            const stein = steinFuer(sorte);
            if (!kurzeMauer.has(ek)) return { a: a!, b: b!, stein };
            // Oben sitzt die Bastion: dort endet die Mauer auf halber Turmhoehe,
            // damit der Turm davor steht statt darunter zu verschwinden.
            const [oben, unten] = a!.y <= b!.y ? [a!, b!] : [b!, a!];
            const laenge = Math.hypot(unten.x - oben.x, unten.y - oben.y) || 1;
            const t = Math.min(0.9, (5 * f) / laenge);
            return {
              a: { x: oben.x + (unten.x - oben.x) * t, y: oben.y + (unten.y - oben.y) * t },
              b: unten,
              stein,
            };
          }),
        f,
      );
      const gebaeude = Object.entries(state.buildings)
        .filter(([vk]) => nur(gebaeudeTiefe(vk)) && !ohneBastion.has(vk))
        .map(([vk, b]) => {
          const ecke = parseVertexKey(vk);
          const v = vertexToPixel(ecke, LAYOUT);
          const p = geraet(v.x, v.y - liftVertex(ecke));
          const bastion = bastionen.get(vk);
          return {
            fuss: Math.max(p.y + 3 * f, nachDerBurg.get(vk) ?? -Infinity),
            male: () =>
              bastion !== undefined
                ? zeichneBastion(g, p.x, p.y, f, spielerFarbe(b.owner), bastion)
                : zeichneGebaeude(g, b.type === 'city' ? 'stadt' : 'dorf', p.x, p.y, f, spielerFarbe(b.owner)),
          };
        });
      // Wachtuerme stehen fuer sich auf ihrer Ecke (state.tuerme).
      const tuerme = Object.entries(state.tuerme ?? {})
        .filter(([vk]) => nur(eckTiefe(parseVertexKey(vk))))
        .map(([vk, t]) => {
          const ecke = parseVertexKey(vk);
          const v = vertexToPixel(ecke, LAYOUT);
          const p = geraet(v.x, v.y - liftVertex(ecke));
          return {
            fuss: p.y + 3 * f,
            male: () => zeichneGebaeude(g, 'turm', p.x, p.y, f, spielerFarbe(t.owner)),
          };
        });
      // Hauptstaedte stehen in der Feldmitte, im Stein ihres Gelaendes (units.ts).
      const hauptstaedte = Object.entries(state.hauptstaedte ?? {})
        .filter(([hk]) => nur(hauptstadtTiefe(hk)))
        .map(([hk, h]) => {
          const [q, r] = hk.split(':').map(Number) as [number, number];
          const c = hexToPixel(q, r, LAYOUT);
          const p = geraet(c.x, c.y - liftHex(q, r));
          const sorte = sorteVon(hk, q, r);
          return {
            fuss: p.y + (h.stufe >= 2 ? 9 : 6) * f,
            male: () => zeichneHauptstadt(g, p.x, p.y, f, spielerFarbe(h.owner), sorte, h.stufe),
          };
        });
      // Reichsbauten der Phase 2 stehen wie Hauptstaedte in der Feldmitte.
      const reichsbauten = Object.entries(state.reichsbauten ?? {})
        .filter(([hk]) => nur(hauptstadtTiefe(hk)))
        .map(([hk, b]) => {
          const [q, r] = hk.split(':').map(Number) as [number, number];
          const c = hexToPixel(q, r, LAYOUT);
          const p = geraet(c.x, c.y - liftHex(q, r));
          const sorte = sorteVon(hk, q, r);
          return {
            fuss: p.y + 6 * f,
            male: () => zeichneReichsbau(g, b.art, p.x, p.y, f, spielerFarbe(b.owner), sorte),
          };
        });
      // Von hinten nach vorn, nach dem Fuss: das vordere Bauwerk ueberdeckt das hintere.
      for (const b of [...gebaeude, ...tuerme, ...reichsbauten, ...hauptstaedte].sort((u, w) => u.fuss - w.fuss)) {
        b.male();
      }
    };

    // "maske": wie voll, aber nur die hohen Pixel der Kachel verdecken (tiles.ts, hoehenMaske).
    const maskenModus = verdeckenModus() === 'maske';
    const vollModus = verdeckenModus() === 'voll' || maskenModus;
    if (!vollModus) {
      zeichneBauten(ctx);
    } else {
      /*
       * PROBE "voll" (?verdecken=voll): Wald und Berge verdecken ganz, was vor
       * ihrer Reihe steht - Doerfer und Staedte an ihren drei oberen Ecken,
       * Strassen an ihren oberen Kanten, die Hauptstadt hinter ihnen. Flache
       * Kacheln verdecken nichts. Reihe fuer Reihe: die Bauten dieser Reihe in
       * eine Schicht, mit den hohen Kacheln dieser und der naechsten Reihe
       * ausstanzen, aufs Brett. Figuren bleiben, wie sie sind.
       */
      const tiefen = new Set<number>();
      for (const ek of Object.keys(state.roads)) tiefen.add(kantenTiefe(ek));
      for (const [ek] of asche) tiefen.add(kantenTiefe(ek));
      for (const vk of Object.keys(state.buildings)) tiefen.add(gebaeudeTiefe(vk));
      for (const hk of Object.keys(state.hauptstaedte ?? {})) tiefen.add(hauptstadtTiefe(hk));
      const schicht = (vollRef.current ??= document.createElement('canvas'));
      if (schicht.width !== bw || schicht.height !== bh) {
        schicht.width = bw;
        schicht.height = bh;
      }
      const g = schicht.getContext('2d');
      if (g) {
        g.imageSmoothingEnabled = false;
        const w = Math.round(IMG.w * scale * dpr);
        const h = Math.round(IMG.h * scale * dpr);
        const hoheJeReihe = new Map<number, (typeof visible)[number][]>();
        for (const t of visible) {
          if (t.terrain !== 'forest' && t.terrain !== 'mountain') continue;
          const liste = hoheJeReihe.get(t.r);
          if (liste) liste.push(t);
          else hoheJeReihe.set(t.r, [t]);
        }
        for (const tiefe of [...tiefen].sort((a, b) => a - b)) {
          g.clearRect(0, 0, bw, bh);
          zeichneBauten(g, (x) => x === tiefe);
          g.globalCompositeOperation = 'destination-out';
          for (const t of [...(hoheJeReihe.get(tiefe) ?? []), ...(hoheJeReihe.get(tiefe + 1) ?? [])]) {
            const url = tileUrl(state.worldSeed, t.terrain, t.q, t.r);
            const bild = url === null ? undefined : tileImage(url);
            if (!bild || url === null) continue;
            const stanze = maskenModus ? hoehenMaske(bild, url) : bild;
            if (!stanze) continue;
            const k = hexKey(t.q, t.r);
            const { x, y } = ursprung(t.q, t.r, liftHex(t.q, t.r) + (k === hover ? LIFT : 0));
            g.drawImage(stanze, x, y, w, h);
          }
          g.globalCompositeOperation = 'source-over';
          ctx.drawImage(schicht, 0, 0);
        }
      }
    }

    /*
     * Gipfel davor (DESIGN.md, Karte): was ein Berg ueber sein Sechseck hinaus
     * deckt, kommt noch einmal ueber alles dahinter - Strassen, Doerfer,
     * Staedte, Burg und Mauern. Die Grenze ist der Umriss der Gipfel, kein
     * Kasten: eine Stadt verschwindet links wie rechts gleich. Die Gipfel gehen
     * erst in eine eigene Schicht, aus der sich die Figuren daneben ausstanzen -
     * sie standen schon vorher obenauf und bleiben es.
     */
    // ?verdecken=aus schaltet auch das ab - zum Vergleich.
    const berge = verdeckenModus() === 'aus' || vollModus ? [] : visible.filter((t) => t.terrain === 'mountain');
    if (berge.length > 0) {
      const schicht = (ueberhangRef.current ??= document.createElement('canvas'));
      if (schicht.width !== bw || schicht.height !== bh) {
        schicht.width = bw;
        schicht.height = bh;
      }
      const g = schicht.getContext('2d');
      if (g) {
        g.clearRect(0, 0, bw, bh);
        g.imageSmoothingEnabled = false;
        const w = Math.round(IMG.w * scale * dpr);
        const h = Math.round(IMG.h * scale * dpr);
        const nachbarn = new Set<string>();
        for (const t of berge) {
          const url = tileUrl(state.worldSeed, t.terrain, t.q, t.r);
          const bild = url === null ? undefined : imNebel(t.q, t.r) ? tileImageFog(url) : tileImage(url);
          const gipfel = bild ? ueberhangBild(bild) : null;
          if (!gipfel) continue;
          const k = hexKey(t.q, t.r);
          const { x, y } = ursprung(t.q, t.r, liftHex(t.q, t.r) + (k === hover ? LIFT : 0));
          g.drawImage(gipfel, x, y, w, h);
          for (const [dq, dr] of [[0, 0], [0, -1], [1, -1], [-1, 0], [1, 0]] as const) {
            nachbarn.add(hexKey(t.q + dq, t.r + dr));
          }
        }
        g.globalCompositeOperation = 'destination-out';
        for (const t of visible) {
          const k = hexKey(t.q, t.r);
          if (nachbarn.has(k)) zeichneBesatzung(t, liftHex(t.q, t.r) + (k === hover ? LIFT : 0), g);
        }
        g.globalCompositeOperation = 'source-over';
        ctx.drawImage(schicht, 0, 0);
      }
    }

    /*
     * Verdecken durch hohe Kacheln (DESIGN.md, Karte): liegt vor einer
     * Hauptstadt Wald, kommt diese Kachel noch einmal darueber - Baumkronen
     * schieben sich vor Mauer und Burg, sie steht im Gelaende statt
     * aufgeklebt. Gebirge macht die Gipfel-Schicht oben. Beschnitten auf den Kasten des Bauwerks, damit
     * sonst nichts auf der Kachel verschwindet; ihre Einheiten kommen im Kasten
     * wieder obendrauf. Flache Kacheln bleiben darunter - eine Wiese davor
     * schnitte die Burg nur gerade ab, und das saehe aus wie ein Fehler.
     */
    const modus = verdeckenModus();
    for (const [hk, h] of modus === 'aus' || vollModus ? [] : Object.entries(state.hauptstaedte ?? {})) {
      const [q, r] = hk.split(':').map(Number) as [number, number];
      const c = hexToPixel(q, r, LAYOUT);
      const p = geraet(c.x, c.y - liftHex(q, r));
      const festung = h.stufe >= 2;
      // Burg 21 Kunstpixel breit, der Festungsring mit Bastionen und Wehrtuermen deutlich breiter.
      const halb = (festung ? 26 : 13) * f;
      const unten = p.y + (festung ? 14 : 12) * f;
      // fuss: nur die untersten Kunstpixel - Sockel und Tor, nie Bergfried und Daecher.
      const oben = modus === 'fuss' ? p.y + (festung ? 3 : 1) * f : p.y - (festung ? 24 : 18) * f;
      for (const [vq, vr] of [
        [q - 1, r + 1],
        [q, r + 1],
      ] as const) {
        const vorn = hexKey(vq, vr);
        const t = world.tiles.get(vorn);
        if (!t) continue;
        // Gebirge deckt schon die Gipfel-Schicht, ohne Kasten - hier bleibt der Wald.
        const hohe = t.terrain === 'forest';
        if (!hohe) continue;
        const hoch = liftHex(vq, vr) + (vorn === hover ? LIFT : 0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x - halb, oben, 2 * halb, unten - oben);
        ctx.clip();
        if (modus === 'ueberhang') {
          // Nur was ueber die Oberkante der vorderen Kachel hinausragt: Kronen und
          // Gipfel. Ihr Boden deckt nichts ab - Kasten minus Sechseck.
          ctx.beginPath();
          ctx.rect(0, 0, bw, bh);
          [0, 1, 2, 3, 4, 5].forEach((i) => {
            const e = hexCornerPixel(vq, vr, i, LAYOUT);
            const g = geraet(e.x, e.y - hoch);
            if (i === 0) ctx.moveTo(g.x, g.y);
            else ctx.lineTo(g.x, g.y);
          });
          ctx.closePath();
          ctx.clip('evenodd');
        }
        if (modus === 'halb') ctx.globalAlpha = 0.55;
        zeichne(t, hoch);
        ctx.globalAlpha = 1;
        if (modus !== 'ueberhang') zeichneBesatzung(t, hoch);
        ctx.restore();
      }
    }

    /*
     * Vorschau unter dem Zeiger: auf dem Bauplatz, ueber dem der Zeiger steht,
     * steht das Gebaeude, wie es stuende; ueber einer Kante die Strasse. Die
     * Plaetze selbst zeigen Ringe (SVG). Eine blasse Vorschau auf JEDEM Platz
     * war im Aufbau unuebersichtlich - siebzig halbe Haeuser.
     */
    const eigeneFarbe = du ? spielerFarbe(du) : '#c9a46a';
    if (geisterBau !== null && eckeHover !== null && (targets.vertices ?? []).includes(eckeHover)) {
      const ecke = parseVertexKey(eckeHover);
      const p = vertexToPixel(ecke, LAYOUT);
      const pl = geraet(p.x, p.y - liftVertex(ecke));
      ctx.globalAlpha = 0.9;
      zeichneGebaeude(ctx, geisterBau, pl.x, pl.y, f, eigeneFarbe);
      ctx.globalAlpha = 1;
    }
    if (kanteHover !== null && (targets.edges ?? []).includes(kanteHover)) {
      const [a, b] = edgeEndpoints(parseEdgeKey(kanteHover)).map((v) => {
        const p = vertexToPixel(v, LAYOUT);
        return geraet(p.x, p.y - liftVertex(v));
      });
      ctx.globalAlpha = 0.85;
      zeichneStrassen(ctx, [{ a: a!, b: b!, farbe: eigeneFarbe }], f);
      ctx.globalAlpha = 1;
    }

    /*
     * Jahreszeit als Schicht ueber dem Gelaende, nicht in den Kacheln.
     *
     * So bleibt jede Sorte erkennbar - eine Wiese sieht im Herbst warm aus,
     * ist aber weiter als Wiese zu lesen. Waeren die Farben eingerechnet,
     * braeuchte es vier Kachelsaetze, und man muesste bei jedem Wechsel neu
     * lernen, was was ist.
     *
     * Ganz zuletzt, damit auch das angehobene Feld mitgefaerbt wird - sonst
     * leuchtete ausgerechnet das Feld unter dem Zeiger aus der Reihe.
     */
    const tint = SEASON_TINT[seasonOf(state.turn)];
    if (tint.alpha > 0) {
      ctx.save();
      ctx.globalCompositeOperation = tint.mode;
      ctx.globalAlpha = tint.alpha;
      ctx.fillStyle = tint.color;
      ctx.fillRect(0, 0, bw, bh);
      ctx.restore();
    }
  }, [
    visible,
    view,
    scale,
    size,
    hover,
    world,
    state,
    tilesReady,
    liftHex,
    liftVertex,
    besatzung,
    sicht,
    du,
    farbeSeite,
    targets,
    eckeHover,
    kanteHover,
    geisterBau,
    tageszeit,
    dpr,
    animZeit,
    kampf,
  ]);

  /** Eine Stufe naeher (+1) oder weiter weg (-1); der Punkt unter x/y bleibt stehen. */
  const zoomUm = useCallback((richtung: number, mausX: number, mausY: number) => {
    setCam((c) => {
      const zi = Math.min(zoomSteps.length - 1, Math.max(0, c.zi + richtung));
      if (zi === c.zi) return c;

      const alt = zoomSteps[c.zi]!;
      const neu = zoomSteps[zi]!;
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return { ...c, zi };
      // Der Punkt unter dem Zeiger soll stehen bleiben.
      const mx = mausX - rect.left - rect.width / 2;
      const my = mausY - rect.top - rect.height / 2;
      return {
        zi,
        cx: c.cx + mx / alt - mx / neu,
        cy: c.cy + my / alt - my / neu,
      };
    });
  }, [zoomSteps]);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    // Zeilen- und Seitenmodus auf Pixel umrechnen, sonst zaehlt ein
    // Mausrad-Ereignis viel zu wenig.
    const einheit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    radAcc.current += e.deltaY * einheit;

    const jetzt = Date.now();
    if (Math.abs(radAcc.current) < (e.ctrlKey ? PINCH_THRESHOLD : WHEEL_THRESHOLD)) return;
    if (jetzt - letzterZoom.current < ZOOM_COOLDOWN_MS) {
      radAcc.current = 0;
      return;
    }
    const richtung = radAcc.current < 0 ? 1 : -1;
    radAcc.current = 0;
    letzterZoom.current = jetzt;
    zoomUm(richtung, e.clientX, e.clientY);
  }, [zoomUm]);

  /*
   * Rad und Trackpad-Geste NATIV abonnieren, nicht ueber Reacts onWheel.
   *
   * React meldet wheel als passiven Listener an, und dort wird preventDefault
   * ignoriert - die Konsole sagte es die ganze Zeit: "Unable to preventDefault
   * inside passive event listener". Fuers Mausrad fiel das nicht auf. Fuer die
   * Zwei-Finger-Geste auf dem Mac schon: Chrome und Firefox schicken sie als
   * wheel mit ctrlKey, und ohne preventDefault zoomt der Browser die Seite.
   *
   * Safari schickt eigene gesture-Ereignisse mit einem Massstab. Eine Stufe
   * je Faktor Wurzel 2 - also etwa, wenn sich der Fingerabstand um 40 % aendert.
   *
   * Zusaetzlich wird das Seitenzoomen per Geste auf der ganzen Seite
   * unterdrueckt, solange das Brett steht - sonst zoomt, wer ueber dem Menue
   * die Finger spreizt, doch wieder die Seite. Cmd und Plus bleiben frei: wer
   * die Seite groesser braucht, soll sie weiter groesser stellen koennen.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nurAktiv = { passive: false } as AddEventListenerOptions;

    let letzteStufe = 0;
    const gesteStart = (e: Event) => {
      e.preventDefault();
      letzteStufe = 0;
    };
    const gesteAendern = (e: Event) => {
      e.preventDefault();
      // Auf dem iPhone kommen dieselben zwei Finger auch als Zeiger an - dort
      // zoomt schon die Zeigergeste, sonst schaltete jede Geste doppelt.
      if (kneifen.current) return;
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      if (typeof g.scale !== 'number' || g.scale <= 0) return;
      const stufe = Math.round(Math.log2(g.scale) * 2);
      if (stufe === letzteStufe) return;
      const rect = el.getBoundingClientRect();
      const x = g.clientX ?? rect.left + rect.width / 2;
      const y = g.clientY ?? rect.top + rect.height / 2;
      zoomUm(stufe > letzteStufe ? 1 : -1, x, y);
      letzteStufe = stufe;
    };
    const seiteSchuetzen = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    const gesteSchlucken = (e: Event) => e.preventDefault();

    el.addEventListener('wheel', onWheel, nurAktiv);
    el.addEventListener('gesturestart', gesteStart, nurAktiv);
    el.addEventListener('gesturechange', gesteAendern, nurAktiv);
    document.addEventListener('wheel', seiteSchuetzen, nurAktiv);
    document.addEventListener('gesturestart', gesteSchlucken, nurAktiv);
    document.addEventListener('gesturechange', gesteSchlucken, nurAktiv);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', gesteStart);
      el.removeEventListener('gesturechange', gesteAendern);
      document.removeEventListener('wheel', seiteSchuetzen);
      document.removeEventListener('gesturestart', gesteSchlucken);
      document.removeEventListener('gesturechange', gesteSchlucken);
    };
  }, [onWheel, zoomUm]);

  /**
   * Zoomstufe direkt setzen - fuer den Balken am linken Rand.
   *
   * Anders als das Mausrad zoomt der Balken um die Bildmitte: es gibt keinen
   * Zeiger ueber der Karte, dessen Punkt stehen bleiben koennte. cx/cy sind
   * bereits die Bildmitte in Weltkoordinaten, also genuegt es, zi zu tauschen.
   */
  const setZoom = useCallback((zi: number) => {
    setCam((c) => {
      const z = Math.min(zoomSteps.length - 1, Math.max(0, zi));
      return z === c.zi ? c : { ...c, zi: z };
    });
  }, [zoomSteps]);

  /** Wird der Balken gerade gezogen? */
  const balkenZug = useRef(false);

  /** Zeigerhoehe auf dem Balken in eine Stufe umrechnen: oben nah, unten fern. */
  const zoomAusBalken = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setZoom(Math.round((1 - t) * (zoomSteps.length - 1)));
  };

  /**
   * Liegt der Druckpunkt auf einem Bedienelement statt auf der Karte?
   *
   * Die Aktionsleiste, die Handkarten und der Wuerfelknopf liegen als Kinder
   * IM Brett - sonst koennten sie nicht darueber schweben. Ihre Pressen
   * blubbern damit bis hierher.
   */
  const aufBedienelement = (ziel: EventTarget | null): boolean =>
    ziel instanceof Element && ziel.closest('button, input, select, textarea, a, label, .zoom, .ausbau-tafel') !== null;

  const onPointerDown = (e: React.PointerEvent) => {
    /*
     * Presst jemand einen Knopf, gehoert der Zeiger dem Knopf.
     *
     * Vorher hat das Brett hier bedingungslos setPointerCapture gerufen - und
     * zwar auf e.target, also auf den Knopf selbst. Damit lief jede weitere
     * Zeigermeldung ueber den Knopf, waehrend das Brett gleichzeitig einen
     * Kartenzug begann: die kleinste Handbewegung zwischen Druecken und
     * Loslassen verschob die Karte, statt den Knopf auszuloesen. Der Knopf sah
     * gedrueckt aus und tat nichts - man musste "fester" druecken, also
     * ruhiger halten.
     */
    if (aufBedienelement(e.target)) return;
    letzterZeiger.current = e.pointerType;

    /*
     * Zwei Finger: zoomen statt schieben. Das Brett setzt touch-action: none,
     * damit der Browser nicht selbst die Seite zoomt - dann muss es die Geste
     * aber auch selbst verstehen. Safari auf dem Mac schickt dafuer eigene
     * gesture-Ereignisse, Touchgeraete schicken Zeiger.
     */
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (finger.current.size >= 2) {
      const [a, b] = [...finger.current.values()];
      kneifen.current = { abstand: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
      drag.current = null;
      moved.current = true; // kein Feldklick beim Loslassen
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      return;
    }

    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy };
    /*
     * Den Zeiger erst einfangen, wenn wirklich gezogen wird (onPointerMove).
     *
     * Frueher geschah das hier, bei jedem Druck. Chrome schickt den Klick danach
     * aber an das einfangende Element - an das Brett statt an den Bauplatz, die
     * Kante oder die Flamme darunter. Deren onClick kam nie an: im Aufbau liess
     * sich mit der Maus kein Dorf setzen, obwohl der Ring unter dem Zeiger lag.
     */
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (finger.current.has(e.pointerId)) {
      finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const k = kneifen.current;
    if (k && finger.current.size >= 2) {
      const [a, b] = [...finger.current.values()];
      const abstand = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      // Eine Stufe je rund 35 % Abstandsaenderung - wie die Geste in Safari.
      const faktor = abstand / Math.max(1, k.abstand);
      if (faktor > 1.35 || faktor < 1 / 1.35) {
        zoomUm(faktor > 1 ? 1 : -1, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        k.abstand = abstand;
      }
      return;
    }
    const d = drag.current;
    if (!d && aufBedienelement(e.target)) {
      // Ueber der Bedienung gibt es kein Feld unter dem Zeiger - und schon gar
      // keinen Klang dafuer.
      setHover(null);
      return;
    }
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!moved.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        moved.current = true;
        // Jetzt wird gezogen: der Zug soll weiterlaufen, auch wenn der Zeiger
        // das Brett verlaesst.
        try {
          ref.current?.setPointerCapture(e.pointerId);
        } catch {
          // Zeiger schon fort - dann eben ohne.
        }
      }
      setCam((c) => ({ ...c, cx: d.cx - dx / scale, cy: d.cy - dy / scale }));
      return;
    }
    // Welches Feld liegt unter dem Zeiger? Bildschirm- in Weltkoordinaten,
    // dann zurueckrechnen - genauer als Trefferflaechen, weil die Kacheln
    // durchsichtige Ecken haben und sich ueberlappen.
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = view.x + (e.clientX - rect.left) / scale;
    const wy = view.y + (e.clientY - rect.top) / scale;
    const h = hexUnter(wx, wy);
    const key = hexKey(h.q, h.r);
    setHover((prev) => {
      if (prev === key) return prev;
      // Nur beim Wechsel, nicht bei jeder Zeigerbewegung.
      playHover();
      return key;
    });
  };

  /**
   * Welches Feld liegt an dieser Stelle wirklich?
   *
   * Solange alles flach lag, genuegte pixelToHex. Angehobene Kacheln stehen
   * aber ueber ihrem eigenen Platz: ein Berg deckt einen Streifen ab, der
   * rechnerisch schon zum Feld davor gehoert. Wer dorthin zeigt, meint den
   * Berg, den er sieht - nicht das Feld darunter.
   *
   * Ein Feld (q,r) deckt den Punkt p, wenn pixelToHex(p.x, p.y + hoehe(q,r))
   * wieder (q,r) ergibt: die Anhebung rueckgaengig gemacht landet man im
   * eigenen Sechseck. Es gewinnt das vorderste Feld, weil es zuletzt
   * gezeichnet wurde und alles dahinter verdeckt.
   */
  const hexUnter = (wx: number, wy: number): Hex => {
    let beste = pixelToHex(wx, wy, LAYOUT); // der Sockel deckt immer

    // Kandidaten einsammeln, indem die moegliche Anhebung abgetastet wird.
    const schritt = LAYOUT.h / 4;
    const gesehen = new Set<string>();
    for (let dy = schritt; dy <= RELIEF_MAX; dy += schritt) {
      const k = pixelToHex(wx, wy + dy, LAYOUT);
      const key = hexKey(k.q, k.r);
      if (gesehen.has(key)) continue;
      gesehen.add(key);

      const zurueck = pixelToHex(wx, wy + liftHex(k.q, k.r), LAYOUT);
      if (zurueck.q !== k.q || zurueck.r !== k.r) continue;
      if (k.r > beste.r || (k.r === beste.r && k.q > beste.q)) beste = k;
    }
    return beste;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    /*
     * Ein Klick ohne Ziehen meldet das Feld darunter - fuer Befehle an Ritter.
     * Ueber pointerup statt click: das Brett faengt den Zeiger ein, ein click
     * landete dann auf dem Brett statt auf dem Feld.
     */
    finger.current.delete(e.pointerId);
    if (kneifen.current) {
      // Erst wenn alle Finger oben sind, ist die Geste vorbei - der letzte
      // Finger soll die Karte nicht noch ein Stueck mitziehen.
      if (finger.current.size === 0) kneifen.current = null;
      drag.current = null;
      return;
    }
    const warGedrueckt = drag.current !== null;
    drag.current = null;
    if (!warGedrueckt || moved.current || aufBedienelement(e.target)) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = view.x + (e.clientX - rect.left) / scale;
    const wy = view.y + (e.clientY - rect.top) / scale;
    const fingerTipp = e.pointerType !== 'mouse';
    // Finger: Bauplaetze, Kanten und Feuer wertet das Brett selbst aus.
    if (fingerTipp && tippeZiel(wx, wy)) return;
    // Krone oder eigenes Gebaeude: die Ausbau-Tafel. Ein Klick daneben schliesst sie.
    if (ausbauTreffer(wx, wy)) return;
    onLeer?.();
    const h = hexUnter(wx, wy);
    const k = hexKey(h.q, h.r);
    // Auf Touch gibt es kein Darueberfahren: ein Tipp zeigt das Feld wie der
    // Zeiger - seine Zahl und die Feldinfo. Nochmal tippen blendet es aus.
    if (fingerTipp) setHover((alt) => (alt === k ? null : k));
    onHex?.(k);
  };

  /**
   * Ein Fingertipp auf Bauplatz, Kante oder eigenes Feuer - nach Naehe, nicht
   * nach Trefferflaeche, damit auch ein grober Finger trifft.
   *
   * Bauen geht in zwei Tipps: der erste zeigt das Gebaeude oder die Strasse als
   * Vorschau und die Zahlen der Nachbarfelder, der zweite baut. Mit der Maus
   * sieht man das vorher unter dem Zeiger - mit dem Finger sonst nie.
   * true, wenn der Tipp etwas getroffen hat.
   */
  const tippeZiel = (wx: number, wy: number): boolean => {
    const reichweite = 22 / scale;
    let best: { art: 'vertex' | 'edge' | 'feuer'; key: string; d: number } | null = null;
    const nimm = (art: 'vertex' | 'edge' | 'feuer', key: string, d: number, grenze: number) => {
      if (d <= grenze && (!best || d < best.d)) best = { art, key, d };
    };
    for (const vk of targets.vertices ?? []) {
      const ecke = parseVertexKey(vk);
      const p = vertexToPixel(ecke, LAYOUT);
      nimm('vertex', vk, Math.hypot(p.x - wx, p.y - liftVertex(ecke) - wy), reichweite);
    }
    for (const ek of targets.edges ?? []) {
      const kante = parseEdgeKey(ek);
      const hoch = liftEdge(kante);
      const [a, b] = edgeEndpoints(kante).map((v) => vertexToPixel(v, LAYOUT));
      const lx = b!.x - a!.x;
      const ly = b!.y - a!.y;
      const t = Math.max(0, Math.min(1, ((wx - a!.x) * lx + (wy + hoch - a!.y) * ly) / (lx * lx + ly * ly)));
      nimm('edge', ek, Math.hypot(a!.x + lx * t - wx, a!.y - hoch + ly * t - wy), reichweite * 0.7);
    }
    if (onFeuer && du !== null) {
      for (const b of state.braende) {
        if (b.owner !== du) continue;
        const p = brandPunkt(b);
        nimm('feuer', b.key, Math.hypot(p.x - wx, p.y - 8 - wy), reichweite);
      }
    }
    const treffer = best as { art: 'vertex' | 'edge' | 'feuer'; key: string; d: number } | null;
    if (!treffer) return false;
    if (treffer.art === 'feuer') {
      onFeuer!(treffer.key);
      return true;
    }
    const vorschau = treffer.art === 'vertex' ? eckeHover : kanteHover;
    if (vorschau !== treffer.key) {
      setEckeHover(treffer.art === 'vertex' ? treffer.key : null);
      setKanteHover(treffer.art === 'edge' ? treffer.key : null);
      return true;
    }
    setEckeHover(null);
    setKanteHover(null);
    onPick(treffer.art, treffer.key);
    return true;
  };

  /** Wo die Krone ueber einem Feld sitzt, in Welteinheiten: ihr Fuss. */
  const kronenFuss = (q: number, r: number) => {
    const c = hexToPixel(q, r, LAYOUT);
    return { x: c.x, y: c.y - liftHex(q, r) - LAYOUT.h * 0.18 };
  };

  /**
   * Ein Klick auf eine Krone oder ein eigenes Gebaeude - nach Naehe, fuer Maus
   * und Finger gleich. true, wenn etwas getroffen wurde.
   */
  const ausbauTreffer = (wx: number, wy: number): boolean => {
    const reichweite = 18 / scale;
    if (onKrone) {
      for (const kr of kronen) {
        const p = kronenFuss(kr.q, kr.r);
        if (Math.hypot(p.x - wx, p.y - 3 * SCALE - wy) <= reichweite + 4 * SCALE) {
          onKrone(kr.q, kr.r);
          return true;
        }
      }
    }
    if (du === null) return false;
    // Gebaeude an den Ecken und die eigene Hauptstadt in der Mitte: das naechste gewinnt.
    let beste: { d: number; waehle: () => void } | null = null;
    if (onGebaeude) {
      for (const [vk, b] of Object.entries(state.buildings)) {
        if (b.owner !== du) continue;
        const ecke = parseVertexKey(vk);
        const p = vertexToPixel(ecke, LAYOUT);
        // Das Haus steht ueber seiner Ecke - dort zeigt man hin.
        const d = Math.hypot(p.x - wx, p.y - liftVertex(ecke) - 4 * SCALE - wy);
        if (d <= reichweite && (!beste || d < beste.d)) beste = { d, waehle: () => onGebaeude(vk) };
      }
      // Eigene Wachtuerme stehen fuer sich auf ihrer Ecke - sie lassen sich
      // genauso anklicken und ausbauen (state.tuerme).
      for (const [vk, t] of Object.entries(state.tuerme ?? {})) {
        if (t.owner !== du) continue;
        const ecke = parseVertexKey(vk);
        const p = vertexToPixel(ecke, LAYOUT);
        const d = Math.hypot(p.x - wx, p.y - liftVertex(ecke) - 6 * SCALE - wy);
        if (d <= reichweite && (!beste || d < beste.d)) beste = { d, waehle: () => onGebaeude(vk) };
      }
    }
    if (onHauptstadtKlick) {
      for (const [hk, h] of Object.entries(state.hauptstaedte ?? {})) {
        if (h.owner !== du) continue;
        const [q, r] = hk.split(':').map(Number) as [number, number];
        const c = hexToPixel(q, r, LAYOUT);
        // Burg und Palast ragen weit ueber die Feldmitte hinaus - der Palast noch hoeher.
        const hoch = h.stufe >= 2 ? 8 : 5;
        const d = Math.hypot(c.x - wx, c.y - liftHex(q, r) - hoch * SCALE - wy);
        if (d <= reichweite + (hoch + 4) * SCALE && (!beste || d < beste.d)) beste = { d, waehle: () => onHauptstadtKlick(hk) };
      }
    }
    if (!beste) return false;
    beste.waehle();
    return true;
  };

  const onPointerLeave = (e: React.PointerEvent) => {
    // Beruehrungen verlassen das Brett beim Loslassen - das ist kein Abbruch.
    if (e.pointerType === 'touch') return;
    drag.current = null;
    setHover(null);
  };

  /**
   * Klicks nur werten, wenn nicht gerade geschoben wurde - und nur mit der Maus.
   * Fingertipps wertet onPointerUp aus (tippeZiel), sonst zaehlte ein Tipp doppelt.
   */
  const pick = (kind: 'vertex' | 'edge' | 'hex', key: string) => () => {
    if (moved.current || letzterZeiger.current !== 'mouse') return;
    onPick(kind, key);
  };
  /** Wartet auf einem Bauplatz eine Vorschau auf den zweiten Tipp? */
  const tippVorschau =
    letzterZeiger.current !== 'mouse' &&
    ((eckeHover !== null && (targets.vertices ?? []).includes(eckeHover)) ||
      (kanteHover !== null && (targets.edges ?? []).includes(kanteHover)));

  /**
   * Flugbahnen in Brettkoordinaten.
   *
   * Der Start ergibt sich aus der Feldposition, das Ziel wird an der
   * Handkarte GEMESSEN statt gerechnet: die Leiste faechert auf, ihre Karten
   * verschieben sich je nach Fensterbreite, und eine gerechnete Position
   * laege daneben.
   */
  const bahnen = useMemo(() => {
    if (!flights || flights.length === 0) return [];
    const el = ref.current;
    if (!el) return [];
    const brett = el.getBoundingClientRect();
    return flights.flatMap((f) => {
      const parts = f.hex.split(':').map(Number);
      const c = hexToPixel(parts[0]!, parts[1]!, LAYOUT);
      const karte = el.querySelector(`.hand [data-res="${f.resource}"]`);
      if (!karte) return [];
      const k = karte.getBoundingClientRect();
      return [
        {
          ...f,
          x0: (c.x - view.x) * scale,
          y0: (c.y - view.y) * scale,
          x1: k.left - brett.left + k.width / 2,
          y1: k.top - brett.top + k.height / 2,
        },
      ];
    });
  }, [flights, view, scale, size]);

  const vertexTargets = new Set(targets.vertices ?? []);
  /** Die drei Felder an der Bauplatz-Ecke unter dem Zeiger. */
  const eckeNachbarn =
    eckeHover !== null && vertexTargets.has(eckeHover)
      ? new Set(vertexAdjacentHexes(parseVertexKey(eckeHover)).map((h) => hexKey(h.q, h.r)))
      : null;
  const edgeTargets = new Set(targets.edges ?? []);
  const hexTargets = new Set(targets.hexes ?? []);
  const colorOf = (pid: string) =>
    playerColor(state.players.find((p) => p.id === pid)?.color ?? 0);

  return (
    <div
      ref={ref}
      className={zielWahl ? 'board ziel-wahl' : 'board'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      {/*
        Das Gelaende liegt auf einem Canvas, alles Interaktive darueber im
        SVG. Grund ist die Schaerfe: Safari beachtet image-rendering bei
        SVG-<image> nicht zuverlaessig, auf dem Canvas laesst sich die
        Glaettung dagegen hart abschalten. Beide teilen sich denselben
        Ausschnitt, deshalb liegen sie deckungsgleich uebereinander.
      */}
      <canvas
        ref={canvasRef}
        className="board-canvas"
        style={{ width: size.w, height: size.h }}
      />
      <WetterSchicht
        breite={size.w}
        hoehe={size.h}
        dpr={dpr}
        pixel={Math.round(SCALE * scale * dpr)}
        kamera={{ x: view.x * scale * dpr, y: view.y * scale * dpr }}
        tageszeit={tageszeit}
        wetter={wetter}
        lichter={lichter}
      />
      <svg
        className="board-svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        width={size.w}
        height={size.h}
      >
        {/* Zahlenmarker */}
        {visible.map((t) => {
          const hk = hexKey(t.q, t.r);
          const c = hexToPixel(t.q, t.r, LAYOUT);
          const red = t.number === 6 || t.number === 8;
          /*
           * Zahlen liegen nicht dauerhaft auf der Karte, sondern erscheinen
           * unter dem Zeiger. Dauerhaft eingeblendet verdecken sie genau die
           * Landschaft, wegen der die Kacheln ueberhaupt da sind.
           *
           * Zwei Ausnahmen, sonst waere es laestig: waehrend eine Bauwahl
           * offen ist, braucht man den Vergleich ueber mehrere Felder - da
           * werden alle gezeigt. Und der Nutzer kann sie festpinnen.
           */
          const showNumber =
            t.number !== null &&
            (showAllNumbers || hover === hk || eigeneFelder.has(hk) || (eckeNachbarn?.has(hk) ?? false));
          // Was auf dem Feld steht, steht auf seiner Hoehe - sonst schwebt es.
          const lift = liftHex(t.q, t.r) + (hover === hk ? LIFT : 0);
          /*
           * Stehen Figuren auf dem Feld, rueckt die Zahl klein nach oben ueber
           * ihre Koepfe - die Figuren stehen dafuer etwas tiefer (aufstellung).
           * Sonst verdeckt der Marker genau die Einheit, die man sucht.
           */
          const besetzt = besatzung.has(hk);
          const marke = besetzt ? `translate(${c.x} ${c.y - 16}) scale(0.55)` : `translate(${c.x} ${c.y})`;
          return (
            <g key={'n' + hk} pointerEvents="none" transform={`translate(0 ${-lift})`}>
              {showNumber && (
                <g transform={marke}>
                  <circle cx={0} cy={0} r={9} className="token" />
                  <text x={0} y={1} textAnchor="middle" className={red ? 'token-num red' : 'token-num'}>
                    {t.number}
                  </text>
                  <text x={0} y={8} textAnchor="middle" className="token-pips">
                    {pips(t.number!)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Felder, die der Wurf getroffen hat - kurzes Aufleuchten. */}
        {(flashHexes ?? []).map((hk) => {
          const parts = hk.split(':').map(Number);
          const hoch = liftHex(parts[0]!, parts[1]!);
          const punkte = [0, 1, 2, 3, 4, 5]
            .map((i) => {
              const p = hexCornerPixel(parts[0]!, parts[1]!, i, LAYOUT);
              return `${p.x.toFixed(1)},${(p.y - hoch).toFixed(1)}`;
            })
            .join(' ');
          return <polygon key={'f' + hk} className="hex-flash" points={punkte} />;
        })}

        {/*
          Pfeile der Bogenschuetzen: fliegen im Bogen von der Feldmitte des
          Schuetzen zur Feldmitte des Ziels, nacheinander. Trifft die Salve,
          blitzt am Ziel ein roter Ring auf. PLATZHALTER (ASSETS.md).
        */}
        {(pfeile ?? []).map((p) => {
          const a = hexToPixel(p.von.q, p.von.r, LAYOUT);
          const b = hexToPixel(p.nach.q, p.nach.r, LAYOUT);
          const ya = a.y - liftHex(p.von.q, p.von.r) - 8 + (p.nr % 2) * 4;
          const yb = b.y - liftHex(p.nach.q, p.nach.r) - 4;
          const winkel = (Math.atan2(yb - ya, b.x - a.x) * 180) / Math.PI;
          const stil = {
            '--dx': `${(b.x - a.x).toFixed(1)}px`,
            '--dy': `${(yb - ya).toFixed(1)}px`,
            '--verzug': `${p.nr * 0.14}s`,
          } as React.CSSProperties;
          return (
            <g key={'pfeil' + p.id} pointerEvents="none" style={stil}>
              <g className="pfeil-flug" style={stil}>
                <g className="pfeil-bogen" style={stil}>
                  <g transform={`translate(${a.x.toFixed(1)} ${ya.toFixed(1)}) rotate(${winkel.toFixed(1)})`}>
                    <line x1={-9} y1={0} x2={6} y2={0} stroke="#3a2a1e" strokeWidth={3} />
                    <line x1={-9} y1={0} x2={6} y2={0} stroke="#c9a46a" strokeWidth={1.4} />
                    <path d="M 9 0 L 4 -3 L 4 3 Z" fill="#d8d8e0" stroke="#1b130d" strokeWidth={0.8} />
                    <path d="M -9 0 L -12 -3 M -9 0 L -12 3" stroke="#f2efe6" strokeWidth={1.2} />
                  </g>
                </g>
              </g>
              {p.trifft && p.nr === 0 && (
                <g className="pfeil-treffer" style={{ ...stil, transformOrigin: `${b.x}px ${yb}px` }}>
                  <circle cx={b.x} cy={yb} r={7} />
                  <circle cx={b.x} cy={yb} r={12} />
                </g>
              )}
            </g>
          );
        })}

        {/* Anklickbare Felder - fuer das Versetzen des Raeubers */}
        {[...hexTargets].map((hk) => {
          const parts = hk.split(':').map(Number);
          const c = hexToPixel(parts[0]!, parts[1]!, LAYOUT);
          return (
            <circle
              key={'ht' + hk}
              className="hex-target"
              cx={c.x}
              cy={c.y - liftHex(parts[0]!, parts[1]!)}
              r={LAYOUT.w * 0.38}
              onClick={pick('hex', hk)}
            />
          );
        })}

        {/* Haefen */}
        {visible.map((t) =>
          t.port === null ? null : (
            // Haefen sitzen an Wasserfeldern, und Wasser liegt immer auf Null.
            // Die Ecken des Hafens beruehren aber Land, das sich hebt - also
            // wandert er mit dem Mittel seiner beiden Ecken.
            <PortMark key={'p' + hexKey(t.q, t.r)} port={t.port} liftVertex={liftVertex} />
          ),
        )}

        {/* Strassen, Doerfer und Staedte liegen auf dem Canvas (siehe Zeichnen). */}

        {/* Anklickbare Kanten */}
        {[...edgeTargets].map((ek) => {
          const kante = parseEdgeKey(ek);
          const hoch = liftEdge(kante);
          const [a, b] = edgeEndpoints(kante).map((v) => {
            const p = vertexToPixel(v, LAYOUT);
            return { x: p.x, y: p.y - hoch };
          });
          return (
            <line
              key={'et' + ek}
              className="edge-target"
              x1={a!.x}
              y1={a!.y}
              x2={b!.x}
              y2={b!.y}
              onClick={pick('edge', ek)}
              onPointerEnter={() => setKanteHover(ek)}
              onPointerLeave={() => setKanteHover((alt) => (alt === ek ? null : alt))}
            />
          );
        })}


        {/* Anklickbare Ecken */}
        {/*
          Ein Ring je Bauplatz, wie ganz am Anfang - unter dem Zeiger gefuellt,
          dazu das Gebaeude als Vorschau. Die unsichtbare Scheibe darunter haelt
          die Trefferflaeche gross, auch fuer Finger.
        */}
        {[...vertexTargets].map((vk) => {
          const ecke = parseVertexKey(vk);
          const p = vertexToPixel(ecke, LAYOUT);
          const y = p.y - liftVertex(ecke);
          return (
            <g
              key={'vt' + vk}
              className={eckeHover === vk ? 'vertex-target aktiv' : 'vertex-target'}
              onClick={pick('vertex', vk)}
              onPointerEnter={() => setEckeHover(vk)}
              onPointerLeave={() => setEckeHover((alt) => (alt === vk ? null : alt))}
            >
              <circle cx={p.x} cy={y} r={12} className="vertex-treffer" />
              <circle cx={p.x} cy={y} r={7} className="vertex-ring" />
            </g>
          );
        })}

        {/*
          Der Name des Helden ueber seiner Figur (core/lore.ts) - auch bei
          fremden Helden: wer gegen ein Haus kaempft, soll wissen, gegen welches.
          Im Nebel nicht.
        */}
        {state.units
          .filter((u) => u.kind === 'held' && u.owner !== null && (sicht === null || sicht.has(hexKey(u.q, u.r))))
          .map((u) => {
            const lore = state.players.find((p) => p.id === u.owner)?.held;
            if (!lore) return null;
            const c = hexToPixel(u.q, u.r, LAYOUT);
            return (
              <text
                key={'heldname' + u.id}
                className="held-name"
                x={c.x}
                y={c.y - liftHex(u.q, u.r) - LAYOUT.h * 0.42}
              >
                {heldKurz(lore)}
              </text>
            );
          })}

        {/* Befehle: Weg und Ziel eigener Ritter und des Helden. Frueher nur der Ritter - der Held zog, aber man sah es nicht. */}
        {state.units
          .filter((u) => (u.kind === 'ritter' || u.kind === 'bogen' || u.kind === 'held') && du !== null && u.owner === du && u.ziel !== null)
          .map((u) => {
            const a = hexToPixel(u.q, u.r, LAYOUT);
            const b = hexToPixel(u.ziel!.q, u.ziel!.r, LAYOUT);
            const ya = a.y - liftHex(u.q, u.r);
            const yb = b.y - liftHex(u.ziel!.q, u.ziel!.r);
            const farbe = colorOf(u.owner!);
            return (
              <g key={'ziel' + u.id} pointerEvents="none">
                <line x1={a.x} y1={ya} x2={b.x} y2={yb} className="ziel-linie" stroke={farbe} />
                <path
                  d={`M ${b.x} ${yb + 6} L ${b.x} ${yb - 16} L ${b.x + 12} ${yb - 11} L ${b.x} ${yb - 6}`}
                  className="ziel-fahne"
                  fill={farbe}
                />
              </g>
            );
          })}

        {/*
          Kaempfe: zwei Schwerter ueber dem Feld, in den Farben der Seiten,
          daneben eine Tafel - wer steht dort, wie stark, was hat die letzte
          Runde gekostet (DESIGN.md, Kampf sehen). Im Nebel nichts davon.
        */}
        {[...kampf].map(([k, seiten]) => {
          if (sicht !== null && !sicht.has(k)) return null;
          const [q, r] = k.split(':').map(Number) as [number, number];
          const c = hexToPixel(q, r, LAYOUT);
          const y = c.y - liftHex(q, r) - LAYOUT.h * 0.62;
          const leute = state.units.filter((u) => u.q === q && u.r === r);
          const zeilen = seiten
            .map((seite) => {
              const ihre = leute.filter((u) => seiteVon(u) === seite);
              return {
                seite,
                anzahl: ihre.length,
                leben: ihre.reduce((n, u) => n + u.leben, 0),
                verlust: (treffer ?? []).filter((t) => t.q === q && t.r === r && t.seite === seite && t.gefallen).length,
              };
            })
            .filter((z) => z.anzahl > 0 || z.verlust > 0);
          const hoehe = 5 + zeilen.length * 9;
          const tx = c.x + 9 * SCALE;
          const ty = y - hoehe / 2;
          return (
            <g key={'kampf' + k}>
              {/*
                Kaempft ein Held mit, zieht sein Hieb einmal durchs Feld -
                man soll sehen, dass er dabei ist (DESIGN.md, Kampf sehen).
              */}
              {leute.some((u) => u.kind === 'held') && (
                <g className="held-slash" style={{ transformOrigin: `${c.x}px ${y + 10}px` }}>
                  <path className="breit" d={`M ${c.x - 15} ${y + 2} Q ${c.x} ${y + 20} ${c.x + 15} ${y + 2}`} />
                  <path d={`M ${c.x - 15} ${y + 2} Q ${c.x} ${y + 20} ${c.x + 15} ${y + 2}`} />
                </g>
              )}
              <Schwerter
                x={c.x}
                y={y}
                k={SCALE}
                links={farbeSeite(seiten[0])}
                rechts={farbeSeite(seiten[seiten.length - 1])}
              />
              {zeilen.length > 0 && (
                <g className="kampf-tafel">
                  <rect x={tx} y={ty} width={52} height={hoehe} rx={1} />
                  {zeilen.map((z, i) => (
                    <g key={z.seite}>
                      <rect x={tx + 3} y={ty + 4 + i * 9} width={5} height={5} fill={farbeSeite(z.seite)} stroke="none" />
                      <text x={tx + 11} y={ty + 9 + i * 9}>
                        {z.anzahl} · {z.leben}
                      </text>
                      {z.verlust > 0 && (
                        <text className="verlust" x={tx + 48} y={ty + 9 + i * 9} textAnchor="end">
                          -{z.verlust}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              )}
            </g>
          );
        })}

        {/*
          Jeder Treffer der letzten Kampfrunde steigt als Zahl ueber dem Feld
          auf, in der Farbe der getroffenen Seite; ein Fall blitzt rot
          (rules/army.ts, fight.treffer). PLATZHALTER (ASSETS.md).
        */}
        {(treffer ?? []).map((tr) => {
          const k = hexKey(tr.q, tr.r);
          if (sicht !== null && !sicht.has(k)) return null;
          const c = hexToPixel(tr.q, tr.r, LAYOUT);
          const y = c.y - liftHex(tr.q, tr.r) - LAYOUT.h * 0.3;
          const x = c.x + ((tr.nr % 3) - 1) * 11;
          const stil = { animationDelay: `${(tr.nr * 0.12).toFixed(2)}s` } as React.CSSProperties;
          return (
            <g key={'treffer' + tr.id} pointerEvents="none">
              {tr.gefallen && (
                <circle
                  className="treffer-puls"
                  cx={c.x}
                  cy={y}
                  r={10}
                  style={{ ...stil, transformOrigin: `${c.x}px ${y}px` }}
                />
              )}
              <text
                className={tr.gefallen ? 'treffer-zahl gefallen' : 'treffer-zahl'}
                x={x}
                y={y}
                fill={farbeSeite(tr.seite)}
                style={stil}
              >
                -{tr.anzahl}
              </text>
            </g>
          );
        })}

        {/*
          Feuer: Flammen an Strasse oder Haus. Ein eigenes Feuer laesst sich
          anklicken und loeschen - so muss man nicht erst ins Menue.
        */}
        {state.braende.map((b) => {
          const p = brandPunkt(b);
          const eigen = du !== null && b.owner === du;
          return (
            <Flammen
              key={'feuer' + b.key}
              x={p.x}
              y={p.y}
              k={SCALE}
              titel={
                eigen && onFeuer
                  ? `Es brennt ${BRAND_WAS[b.art]} - klicken zum Loeschen (eine Karte)`
                  : `Es brennt ${BRAND_WAS[b.art]}`
              }
              onLoeschen={
                eigen && onFeuer
                  ? () => {
                      if (!moved.current && letzterZeiger.current === 'mouse') onFeuer(b.key);
                    }
                  : undefined
              }
            />
          );
        })}

        {/*
          Auftraege: ein Pergament ueber dem Ziel eines angenommenen Auftrags,
          eine Sprechblase ueber dem Wanderer, der dir etwas anbietet.
        */}
        {state.auftraege
          .filter((a) => a.player === du && a.status !== 'abgelehnt')
          .map((a) => {
            if (a.status === 'angenommen') {
              // Liefern und Jagd haben kein Ziel auf der Karte; das Geleit folgt dem Wanderer.
              if (a.art === 'liefern' || a.art === 'jagd') return null;
              const begleitet = a.art === 'geleit' ? state.units.find((u) => u.id === a.wanderer) : undefined;
              if (a.art === 'geleit' && !begleitet) return null;
              const zq = begleitet ? begleitet.q : a.q;
              const zr = begleitet ? begleitet.r : a.r;
              const c = hexToPixel(zq, zr, LAYOUT);
              const titel = {
                lager: 'Auftrag: dieses Lager zerstoeren',
                ruine: 'Auftrag: diese Ruine erkunden',
                geleit: 'Auftrag: einen Ritter oder den Helden zu diesem Wanderer bringen',
                kundschaft: 'Auftrag: dieses Feld auskundschaften',
              }[a.art];
              return (
                <AuftragsZeichen
                  key={'auftrag' + a.id}
                  x={c.x}
                  y={c.y - liftHex(zq, zr) - LAYOUT.h * 0.5}
                  k={SCALE}
                  art="ziel"
                  titel={titel}
                />
              );
            }
            const w = state.units.find((u) => u.id === a.wanderer);
            if (!w || (sicht !== null && !sicht.has(hexKey(w.q, w.r)))) return null;
            const c = hexToPixel(w.q, w.r, LAYOUT);
            return (
              <AuftragsZeichen
                key={'angebot' + a.id}
                x={c.x + 8 * SCALE}
                y={c.y - liftHex(w.q, w.r) - LAYOUT.h * 0.3}
                k={SCALE}
                art="angebot"
                titel="Dieser Wanderer bietet dir einen Auftrag an - siehe Helden & Auftraege"
              />
            );
          })}

        {/* Hauptstadt: Krone ueber fast geschlossenen Feldern - golden, mit leuchtendem Feld, wenn sie bereit sind. */}
        {kronen.map((kr) => {
          const hoch = liftHex(kr.q, kr.r);
          const fuss = kronenFuss(kr.q, kr.r);
          const punkte = [0, 1, 2, 3, 4, 5]
            .map((i) => {
              const p = hexCornerPixel(kr.q, kr.r, i, LAYOUT);
              return `${p.x.toFixed(1)},${(p.y - hoch).toFixed(1)}`;
            })
            .join(' ');
          return (
            <g key={'krone' + kr.q + ':' + kr.r}>
              {kr.bereit && <polygon className="hex-krone" points={punkte} />}
              <KronenZeichen x={fuss.x} y={fuss.y} k={SCALE} bereit={kr.bereit} titel={kr.titel} />
            </g>
          );
        })}

        {/* Die Felder der ausgewaehlten Einheiten bekommen einen Ring. */}
        {[
          ...new Map(
            auswahl
              .map((id) => state.units.find((x) => x.id === id))
              .filter((u): u is Unit => u !== undefined)
              .map((u) => [hexKey(u.q, u.r), u] as const),
          ).values(),
        ].map((u) => {
          const c = hexToPixel(u.q, u.r, LAYOUT);
          return (
            <circle
              key={'auswahl' + u.q + ':' + u.r}
              cx={c.x}
              cy={c.y - liftHex(u.q, u.r) + 8}
              r={LAYOUT.w * 0.36}
              className="auswahl-ring"
              pointerEvents="none"
            />
          );
        })}

        {/*
          Banner der eigenen Scharen: ein Wimpel mit ihrer Nummer neben der ersten
          Einheit (client/heer.ts, scharNummern). PLATZHALTER (ASSETS.md).
        */}
        {(() => {
          if (du === null) return null;
          const eigene = state.units.filter((u) => u.owner === du && u.verband !== null).sort((a, b) => a.id - b.id);
          const nummern = scharNummern(eigene);
          const gezeigt = new Set<number>();
          return eigene.map((u) => {
            const nr = nummern.get(u.verband!);
            if (nr === undefined || gezeigt.has(u.verband!)) return null;
            gezeigt.add(u.verband!);
            const c = hexToPixel(u.q, u.r, LAYOUT);
            const x = c.x + LAYOUT.w * 0.24;
            const y = c.y - liftHex(u.q, u.r) - 12;
            return (
              <g key={'banner' + u.verband} pointerEvents="none">
                <line x1={x} y1={y + 20} x2={x} y2={y - 10} stroke="#3a2a1e" strokeWidth={2} />
                <path d={`M ${x} ${y - 10} L ${x + 17} ${y - 4} L ${x} ${y + 2} Z`} fill={colorOf(du)} stroke="#1b130d" strokeWidth={1} />
                <text x={x + 6} y={y - 1.5} className="schar-nr">
                  {nr}
                </text>
              </g>
            );
          });
        })()}

        {/* Waehrend ein Befehl sein Ziel sucht: das Feld unter dem Zeiger. */}
        {zielWahl &&
          hover !== null &&
          (() => {
            const [hq, hr] = hover.split(':').map(Number);
            const hoch = liftHex(hq!, hr!);
            const punkte = [0, 1, 2, 3, 4, 5]
              .map((i) => {
                const p = hexCornerPixel(hq!, hr!, i, LAYOUT);
                return `${p.x.toFixed(1)},${(p.y - hoch).toFixed(1)}`;
              })
              .join(' ');
            return <polygon className="hex-ziel" points={punkte} pointerEvents="none" />;
          })()}
      </svg>

      {tippVorschau && <div className="befehl-hinweis">Nochmal tippen zum Bauen</div>}
      <div className="board-hint">Ziehen zum Verschieben · Mausrad oder Balken zum Zoomen · Klick auf deinen Ritter: Befehl</div>
      {/* Was auf dem Feld unter dem Zeiger steht. PLATZHALTER-Tafel (ASSETS.md). */}
      {feldInfo && (
        <div className="feld-info">
          {feldInfo.map((z, i) => (
            <div key={i} className={z.kampf ? 'feld-info-zeile kampf' : 'feld-info-zeile'}>
              {z.farbe && <span className="feld-info-farbe" style={{ background: z.farbe }} />}
              <span>{z.text}</span>
            </div>
          ))}
        </div>
      )}
      {/* Die Ausbau-Tafel: ueber dem Gebaeude oder der Krone, mit Kosten. PLATZHALTER (ASSETS.md). */}
      {ausbau &&
        (() => {
          // Wo das Ding steht: ueber ihm die Tafel, darunter die Ausweichstelle.
          let wx: number;
          let wyOben: number;
          let wyUnten: number;
          if (ausbau.ort.art === 'ecke') {
            const ecke = parseVertexKey(ausbau.ort.key);
            const p = vertexToPixel(ecke, LAYOUT);
            wx = p.x;
            wyOben = p.y - liftVertex(ecke) - 14 * SCALE;
            wyUnten = p.y - liftVertex(ecke) + 6 * SCALE;
          } else {
            const [q, r] = ausbau.ort.key.split(':').map(Number) as [number, number];
            const h = state.hauptstaedte?.[ausbau.ort.key];
            const p = kronenFuss(q, r);
            wx = p.x;
            // Ueber einer Hauptstadt hoeher ansetzen - Burg und Palast ragen weit hinauf.
            wyOben = p.y - (h ? (h.stufe >= 2 ? 18 : 13) : 7) * SCALE;
            wyUnten = p.y + (h ? 13 : 3) * SCALE;
          }
          /*
           * Am Rand nicht abschneiden: waagerecht in die Flaeche klemmen, und steht
           * das Gebaeude zu weit oben, klappt die Tafel darunter. Der Zipfel zeigt
           * trotzdem auf das Gebaeude (--zipfel).
           */
          const sx = (wx - view.x) * scale;
          const halb = TAFEL_BREITE / 2;
          const links = Math.min(Math.max(sx, halb + 8), size.w - halb - 8);
          const unten = (wyOben - view.y) * scale < TAFEL_HOEHE;
          return (
            <div
              className={unten ? 'ausbau-tafel nach-unten' : 'ausbau-tafel'}
              style={{
                left: links,
                top: ((unten ? wyUnten : wyOben) - view.y) * scale,
                ['--zipfel' as string]: `${Math.round(sx - links)}px`,
              }}
            >
              <div className="ausbau-titel">
                <span>{ausbau.titel}</span>
                <button className="dock-zu" title="Schliessen" onClick={() => onLeer?.()}>
                  x
                </button>
              </div>
              {ausbau.optionen.length === 0 && (
                <div className="ausbau-hinweis">{ausbau.leer ?? 'Hier gibt es nichts mehr auszubauen.'}</div>
              )}
              {ausbau.optionen.map((o) => (
                <button key={o.name} className="ausbau-option" disabled={!o.darf} title={o.hinweis} onClick={o.wahl}>
                  <span className="ausbau-zeile">
                    <span className="ausbau-name">{o.name}</span>
                    {o.kosten && <Kosten c={o.kosten} />}
                  </span>
                  {!o.darf && o.hinweis && <span className="ausbau-hinweis">{o.hinweis}</span>}
                </button>
              ))}
            </div>
          );
        })()}
      {/* Die Befehlstafel an den gewaehlten Einheiten - wie die Ausbau-Tafel ueber ihrem Feld. */}
      {befehlsTafel &&
        (() => {
          const c = hexToPixel(befehlsTafel.q, befehlsTafel.r, LAYOUT);
          const hoch = liftHex(befehlsTafel.q, befehlsTafel.r);
          const wyOben = c.y - hoch - 8 * SCALE;
          const wyUnten = c.y - hoch + 12 * SCALE;
          const sx = (c.x - view.x) * scale;
          const halb = TAFEL_BREITE / 2;
          const links = Math.min(Math.max(sx, halb + 8), size.w - halb - 8);
          const unten = (wyOben - view.y) * scale < TAFEL_HOEHE + 40;
          return (
            <div
              className={unten ? 'ausbau-tafel befehls-tafel nach-unten' : 'ausbau-tafel befehls-tafel'}
              style={{
                left: links,
                top: ((unten ? wyUnten : wyOben) - view.y) * scale,
                ['--zipfel' as string]: `${Math.round(sx - links)}px`,
              }}
            >
              {befehlsTafel.inhalt}
            </div>
          );
        })()}
      {children}

      {/*
        Zoom als Balken. Stufen statt stufenloser Regler, weil der Zoom nur
        ganzzahlige Vergroesserungen kennt - alles dazwischen waere wieder
        unscharf. Oben ist nah, unten fern.
      */}
      <div className="zoom">
        <button
          className="zoom-knopf"
          title="Naeher heran"
          disabled={cam.zi >= zoomSteps.length - 1}
          onClick={() => setZoom(cam.zi + 1)}
        >
          +
        </button>
        <div
          className="zoom-balken"
          role="slider"
          tabIndex={0}
          aria-label="Zoom"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={zoomSteps.length - 1}
          aria-valuenow={cam.zi}
          onPointerDown={(e) => {
            balkenZug.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            zoomAusBalken(e);
          }}
          onPointerMove={(e) => {
            if (balkenZug.current) zoomAusBalken(e);
          }}
          onPointerUp={() => {
            balkenZug.current = false;
          }}
          onPointerCancel={() => {
            balkenZug.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setZoom(cam.zi + 1);
            else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setZoom(cam.zi - 1);
            else return;
            e.preventDefault();
          }}
        >
          {zoomSteps.map((_, i) => {
            // Von oben nach unten: hoechste Stufe zuerst.
            const stufe = zoomSteps.length - 1 - i;
            const cls =
              stufe === cam.zi ? 'zoom-stufe aktiv' : stufe < cam.zi ? 'zoom-stufe voll' : 'zoom-stufe';
            return <span key={stufe} className={cls} />;
          })}
        </div>
        <button
          className="zoom-knopf"
          title="Weiter weg"
          disabled={cam.zi <= 0}
          onClick={() => setZoom(cam.zi - 1)}
        >
          −
        </button>
      </div>

      {/*
        Fliegende Karten liegen ueber allem: sie sollen den Weg vom Feld zur
        Hand sichtbar machen, und der fuehrt quer ueber das Brett.
      */}
      {bahnen.map((b) => (
        <div
          key={b.id}
          className="flug"
          style={
            {
              '--x0': `${b.x0}px`,
              '--y0': `${b.y0}px`,
              '--x1': `${b.x1}px`,
              '--y1': `${b.y1}px`,
              animationDelay: `${b.delay}ms`,
            } as React.CSSProperties
          }
        >
          <ResourceCard r={b.resource} size={1.5} />
        </div>
      ))}
    </div>
  );
}

function PortMark({
  port,
  liftVertex,
}: {
  port: NonNullable<import('../../core/types').Tile['port']>;
  liftVertex: (v: Vertex) => number;
}) {
  const ecken = port.vertices.map((v) => parseVertexKey(v));
  const [a, b] = ecken.map((v) => vertexToPixel(v, LAYOUT));
  const hoch = ecken.reduce((n, v) => n + liftVertex(v), 0) / ecken.length;
  const mx = (a!.x + b!.x) / 2;
  const my = (a!.y + b!.y) / 2 - hoch;
  return (
    <g pointerEvents="none">
      <rect x={mx - 17} y={my - 10} width={34} height={20} className="port" />
      <text x={mx} y={my + 5} textAnchor="middle" className="port-text">
        {port.type === 'any' ? '3:1' : '2:1'}
      </text>
    </g>
  );
}
