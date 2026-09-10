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
} from '../../core/coords';
import type { Edge, Hex, Layout, Vertex } from '../../core/coords';
import type { World } from '../../core/world';
import type { PublicState } from '../../core/redact';
import { SEASON_TINT, playerColor } from '../theme';
import { seasonOf } from '../../core/season';
import { playHover } from '../audio';
import type { Resource } from '../../core/types';
import { ResourceCard } from '../ui/ResourceIcon';
import { hexCornerPixel } from '../../core/coords';
import { nestAt } from '../../core/raiders';
import { reliefLimitedAt } from '../../core/relief';
import { edgeAdjacentHexes, vertexAdjacentHexes } from '../../core/coords';
import { Nest } from './Nest';
import {
  HEX_CX,
  HEX_CY,
  HEX_H,
  HEX_W,
  IMG_H,
  IMG_W,
  preloadTiles,
  tileImage,
  tileUrl,
} from '../tiles';

/** Wie stark die Kacheln vergroessert werden. */
const SCALE = 2.0;

/** Das Raster richtet sich nach dem SECHSECK, nicht nach dem Bild. */
const LAYOUT: Layout = { w: HEX_W * SCALE, h: HEX_H * SCALE };

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
const DPR = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

/** Geraetepixel je Kunstpixel. Ganze Zahlen, sonst wird interpoliert. */
const DEVICE_FACTORS = [1, 2, 3, 4, 6, 8] as const;

const ZOOM_STEPS = DEVICE_FACTORS.map((f) => f / (SCALE * DPR));

/**
 * Startstufe: rund zwei CSS-Pixel je Kunstpixel, also Kacheln von etwa 48
 * Pixeln Breite. Bei hoher Bildschirmskalierung entspricht das mehr
 * Geraetepixeln - die Kachel bleibt dabei gleich gross, nur schaerfer.
 */
const DEFAULT_ZOOM_INDEX = (() => {
  const wunsch = 2 * DPR;
  let best = 0;
  for (let i = 1; i < DEVICE_FACTORS.length; i++) {
    if (Math.abs(DEVICE_FACTORS[i]! - wunsch) < Math.abs(DEVICE_FACTORS[best]! - wunsch)) {
      best = i;
    }
  }
  return best;
})();

/** Wie weit sich ein Feld unter dem Zeiger hebt. */
const LIFT = 3 * SCALE;

/**
 * Wie hoch das Gelaende hoechstens gezeichnet wird, in Welteinheiten.
 *
 * Seit die Steigung begrenzt ist (RELIEF_SLOPE), erreicht kaum ein Feld diesen
 * Wert - dafuer muesste es weit genug im Landesinneren liegen, um bei zwei
 * Kunstpixeln je Feld so hoch zu kommen. Die Grenze deckelt nur noch, sie formt
 * nicht mehr; deshalb ist sie grosszuegiger als vorher.
 */
const RELIEF_MAX = 64;

/**
 * Wie weit ein Feld hoechstens ueber oder unter seinem Nachbarn stehen darf.
 *
 * Zwei Kunstpixel, genau wie hexmap (height_max_neighbor_delta = 2). So viel
 * verdeckt die gemalte Unterkante der Kachel - mehr, und es klaffen Fugen.
 */
const RELIEF_SLOPE = 2 * SCALE;

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
    `InfiniteCarthage: devicePixelRatio ${DPR}, Zoomstufen als Geraetepixel je ` +
      `Kunstpixel: ${DEVICE_FACTORS.join(', ')} (Start: ${DEVICE_FACTORS[DEFAULT_ZOOM_INDEX]})`,
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

type Props = {
  world: World;
  state: PublicState;
  targets: Targets;
  /** Alle Zahlen dauerhaft zeigen - sonst erscheinen sie nur unter dem Zeiger. */
  showAllNumbers: boolean;
  /** Felder, die kurz aufleuchten - etwa weil der Wurf sie getroffen hat. */
  flashHexes?: string[];
  /** Karten, die zur Hand fliegen sollen. */
  flights?: Flight[];
  onPick: (kind: 'vertex' | 'edge' | 'hex', key: string) => void;
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

/** Augenzahl als Punkte: sagt schneller als die Ziffer, wie oft ein Feld trifft. */
const pips = (n: number): string => '.'.repeat(6 - Math.abs(7 - n));

export function Board({
  world,
  state,
  targets,
  showAllNumbers,
  flashHexes,
  flights,
  onPick,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState<Camera>({ cx: 0, cy: 0, zi: DEFAULT_ZOOM_INDEX });
  const scale = ZOOM_STEPS[cam.zi]!;
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const moved = useRef(false);
  /** Feld unter dem Zeiger - nur dessen Zahl wird eingeblendet. */
  const [hover, setHover] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /**
   * Aufgelaufene Raddrehung.
   *
   * Ein Mausrad meldet je Rastung ein Ereignis, ein Trackpad dagegen
   * dutzende pro Wischgeste - eine Zoomstufe pro Ereignis rast dort durch
   * alle Stufen, bevor man den Finger hebt. Deshalb wird die Drehung
   * aufsummiert und erst ab einer Schwelle eine Stufe geschaltet.
   */
  const radAcc = useRef(0);
  const letzterZoom = useRef(0);
  const [tilesReady, setTilesReady] = useState(false);

  useEffect(() => {
    let lebt = true;
    void preloadTiles().then(() => {
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
      reliefLimitedAt(state.worldSeed, q, r, RELIEF_SLOPE / RELIEF_MAX) * RELIEF_MAX,
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

  const view = useMemo(() => {
    /*
     * Der Ausschnitt wird auf das Geraetepixel-Raster gerastet.
     *
     * Ein ganzzahliger Vergroesserungsfaktor allein genuegt nicht: faengt der
     * Ausschnitt auf einem halben Geraetepixel an, liegt jede Kachel um einen
     * halben Pixel daneben und der Browser interpoliert trotzdem. Ein
     * Geraetepixel entspricht 1/(scale*DPR) Welteinheiten.
     */
    const raster = 1 / (scale * DPR);
    const snap = (v: number) => Math.round(v / raster) * raster;
    return {
      x: snap(cam.cx - size.w / 2 / scale),
      y: snap(cam.cy - size.h / 2 / scale),
      w: size.w / scale,
      h: size.h / scale,
    };
  }, [cam, size, scale]);

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

    const bw = Math.round(size.w * DPR);
    const bh = Math.round(size.h * DPR);
    if (cv.width !== bw) cv.width = bw;
    if (cv.height !== bh) cv.height = bh;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    // Das eine, worum es hier geht.
    ctx.imageSmoothingEnabled = false;

    const zeichne = (t: (typeof visible)[number], lift: number) => {
      const url = tileUrl(state.worldSeed, t.terrain, t.q, t.r);
      if (url === null) return;
      const img = tileImage(url);
      if (!img) return;
      const c = hexToPixel(t.q, t.r, LAYOUT);
      const x = Math.round((c.x - IMG.dx - view.x) * scale * DPR);
      const y = Math.round((c.y - IMG.dy - lift - view.y) * scale * DPR);
      const w = Math.round(IMG.w * scale * DPR);
      const h = Math.round(IMG.h * scale * DPR);
      ctx.drawImage(img, x, y, w, h);
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
    for (const t of visible) {
      if (hexKey(t.q, t.r) === hover) continue; // kommt zuletzt, angehoben
      zeichne(t, liftHex(t.q, t.r));
    }

    if (hover !== null) {
      const t = world.tiles.get(hover);
      if (t) {
        // Schatten zuerst: er gehoert auf den Boden, nicht auf die Kachel.
        const c = hexToPixel(t.q, t.r, LAYOUT);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(
          (c.x - view.x) * scale * DPR,
          (c.y + LAYOUT.h * 0.42 - liftHex(t.q, t.r) - view.y) * scale * DPR,
          LAYOUT.w * 0.34 * scale * DPR,
          LAYOUT.h * 0.09 * scale * DPR,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
        zeichne(t, liftHex(t.q, t.r) + LIFT);
      }
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
  }, [visible, view, scale, size, hover, world, state.worldSeed, state.turn, tilesReady, liftHex]);

  /** Eine Stufe naeher (+1) oder weiter weg (-1); der Punkt unter x/y bleibt stehen. */
  const zoomUm = useCallback((richtung: number, mausX: number, mausY: number) => {
    setCam((c) => {
      const zi = Math.min(ZOOM_STEPS.length - 1, Math.max(0, c.zi + richtung));
      if (zi === c.zi) return c;

      const alt = ZOOM_STEPS[c.zi]!;
      const neu = ZOOM_STEPS[zi]!;
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
  }, []);

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
      const z = Math.min(ZOOM_STEPS.length - 1, Math.max(0, zi));
      return z === c.zi ? c : { ...c, zi: z };
    });
  }, []);

  /** Wird der Balken gerade gezogen? */
  const balkenZug = useRef(false);

  /** Zeigerhoehe auf dem Balken in eine Stufe umrechnen: oben nah, unten fern. */
  const zoomAusBalken = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setZoom(Math.round((1 - t) * (ZOOM_STEPS.length - 1)));
  };

  /**
   * Liegt der Druckpunkt auf einem Bedienelement statt auf der Karte?
   *
   * Die Aktionsleiste, die Handkarten und der Wuerfelknopf liegen als Kinder
   * IM Brett - sonst koennten sie nicht darueber schweben. Ihre Pressen
   * blubbern damit bis hierher.
   */
  const aufBedienelement = (ziel: EventTarget | null): boolean =>
    ziel instanceof Element && ziel.closest('button, input, select, textarea, a, label, .zoom') !== null;

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

    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy };
    // Auf dem Brett fangen, nicht auf der getroffenen Kachel: der Zug soll
    // weiterlaufen, auch wenn der Zeiger die Kachel verlaesst.
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
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
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
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

  const onPointerUp = () => {
    drag.current = null;
  };

  const onPointerLeave = () => {
    drag.current = null;
    setHover(null);
  };

  /** Klicks nur werten, wenn nicht gerade geschoben wurde. */
  const pick = (kind: 'vertex' | 'edge' | 'hex', key: string) => () => {
    if (moved.current) return;
    onPick(kind, key);
  };

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
      const karte = el.querySelector(`.hand-card[data-res="${f.resource}"]`);
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
  const edgeTargets = new Set(targets.edges ?? []);
  const hexTargets = new Set(targets.hexes ?? []);
  const colorOf = (pid: string) =>
    playerColor(state.players.find((p) => p.id === pid)?.color ?? 0);

  return (
    <div
      ref={ref}
      className="board"
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
      <svg
        className="board-svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        width={size.w}
        height={size.h}
      >
        {/*
          Raeubernester. Immer sichtbar, nie unter dem Zeiger versteckt: sie
          sind der Grund, warum man sich ueberlegt, wo man baut, und diese
          Ueberlegung faengt beim Hinsehen an.
        */}
        {visible.map((t) =>
          nestAt(state.worldSeed, t.q, t.r) ? (
            (() => {
              const c = hexToPixel(t.q, t.r, LAYOUT);
              const lift = liftHex(t.q, t.r) + (hover === hexKey(t.q, t.r) ? LIFT : 0);
              return (
                <Nest key={'nest' + hexKey(t.q, t.r)} x={c.x} y={c.y - lift} size={HEX_H * SCALE * 0.62} />
              );
            })()
          ) : null,
        )}

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
          const showNumber = t.number !== null && (showAllNumbers || hover === hk);
          // Was auf dem Feld steht, steht auf seiner Hoehe - sonst schwebt es.
          const lift = liftHex(t.q, t.r) + (hover === hk ? LIFT : 0);
          return (
            <g key={'n' + hk} pointerEvents="none" transform={`translate(0 ${-lift})`}>
              {showNumber && (
                <>
                  <circle cx={c.x} cy={c.y} r={9} className="token" />
                  <text
                    x={c.x}
                    y={c.y + 1}
                    textAnchor="middle"
                    className={red ? 'token-num red' : 'token-num'}
                  >
                    {t.number}
                  </text>
                  <text x={c.x} y={c.y + 8} textAnchor="middle" className="token-pips">
                    {pips(t.number!)}
                  </text>
                </>
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

        {/* Strassen */}
        {Object.entries(state.roads).map(([ek, owner]) => {
          const kante = parseEdgeKey(ek);
          const hoch = liftEdge(kante);
          const [a, b] = edgeEndpoints(kante).map((v) => {
            const p = vertexToPixel(v, LAYOUT);
            return { x: p.x, y: p.y - hoch };
          });
          return (
            <g key={'r' + ek} pointerEvents="none">
              <line x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y} className="road-base" />
              <line x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y} stroke={colorOf(owner)} className="road" />
            </g>
          );
        })}

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
            />
          );
        })}

        {/* Gebaeude: Haus mit Giebel, Stadt mit Anbau */}
        {Object.entries(state.buildings).map(([vk, b]) => {
          const ecke = parseVertexKey(vk);
          const roh = vertexToPixel(ecke, LAYOUT);
          const p = { x: roh.x, y: roh.y - liftVertex(ecke) };
          const fill = colorOf(b.owner);
          const d =
            b.type === 'city'
              ? `M ${p.x - 13} ${p.y + 9} L ${p.x - 13} ${p.y - 2} L ${p.x - 4} ${p.y - 11} L ${p.x + 4} ${p.y - 2} L ${p.x + 13} ${p.y - 2} L ${p.x + 13} ${p.y + 9} Z`
              : `M ${p.x - 9} ${p.y + 8} L ${p.x - 9} ${p.y - 2} L ${p.x} ${p.y - 11} L ${p.x + 9} ${p.y - 2} L ${p.x + 9} ${p.y + 8} Z`;
          return <path key={'b' + vk} d={d} fill={fill} className="piece" pointerEvents="none" />;
        })}

        {/* Anklickbare Ecken */}
        {[...vertexTargets].map((vk) => {
          const ecke = parseVertexKey(vk);
          const p = vertexToPixel(ecke, LAYOUT);
          return (
            <circle
              key={'vt' + vk}
              className="vertex-target"
              cx={p.x}
              cy={p.y - liftVertex(ecke)}
              r={8}
              onClick={pick('vertex', vk)}
            />
          );
        })}
      </svg>

      <div className="board-hint">Ziehen zum Verschieben · Mausrad oder Balken links zum Zoomen</div>
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
          disabled={cam.zi >= ZOOM_STEPS.length - 1}
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
          aria-valuemax={ZOOM_STEPS.length - 1}
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
          {ZOOM_STEPS.map((_, i) => {
            // Von oben nach unten: hoechste Stufe zuerst.
            const stufe = ZOOM_STEPS.length - 1 - i;
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
