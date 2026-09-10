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
import type { Layout } from '../../core/coords';
import type { World } from '../../core/world';
import type { PublicState } from '../../core/redact';
import { playerColor } from '../theme';
import { playHover } from '../audio';
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

/** Aufgelaufene Raddrehung, ab der eine Zoomstufe geschaltet wird. */
const WHEEL_THRESHOLD = 120;
/** Mindestabstand zwischen zwei Stufen, damit eine Wischgeste nicht durchrast. */
const ZOOM_COOLDOWN_MS = 180;

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

export function Board({ world, state, targets, showAllNumbers, onPick, children }: Props) {
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
        p.y > view.y + view.h + IMG.h
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

    for (const t of visible) {
      if (hexKey(t.q, t.r) === hover) continue; // kommt zuletzt, angehoben
      zeichne(t, 0);
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
          (c.y + LAYOUT.h * 0.42 - view.y) * scale * DPR,
          LAYOUT.w * 0.34 * scale * DPR,
          LAYOUT.h * 0.09 * scale * DPR,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
        zeichne(t, LIFT);
      }
    }
  }, [visible, view, scale, size, hover, world, state.worldSeed, tilesReady]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    // Zeilen- und Seitenmodus auf Pixel umrechnen, sonst zaehlt ein
    // Mausrad-Ereignis viel zu wenig.
    const einheit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    radAcc.current += e.deltaY * einheit;

    const jetzt = Date.now();
    if (Math.abs(radAcc.current) < WHEEL_THRESHOLD) return;
    if (jetzt - letzterZoom.current < ZOOM_COOLDOWN_MS) {
      radAcc.current = 0;
      return;
    }
    const richtung = radAcc.current < 0 ? 1 : -1;
    radAcc.current = 0;
    letzterZoom.current = jetzt;
    const mausX = e.clientX;
    const mausY = e.clientY;

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

  const onPointerDown = (e: React.PointerEvent) => {
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
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
    const h = pixelToHex(wx, wy, LAYOUT);
    const key = hexKey(h.q, h.r);
    setHover((prev) => {
      if (prev === key) return prev;
      // Nur beim Wechsel, nicht bei jeder Zeigerbewegung.
      playHover();
      return key;
    });
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

  const vertexTargets = new Set(targets.vertices ?? []);
  const edgeTargets = new Set(targets.edges ?? []);
  const hexTargets = new Set(targets.hexes ?? []);
  const colorOf = (pid: string) =>
    playerColor(state.players.find((p) => p.id === pid)?.color ?? 0);

  return (
    <div
      ref={ref}
      className="board"
      onWheel={onWheel}
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
        {/* Zahlenmarker und Raeuber */}
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
          // Liegt das Feld oben, wandern Zahl und Raeuber mit.
          const lift = hover === hk ? LIFT : 0;
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
              {state.robber === hk && (
                <>
                  <ellipse cx={c.x} cy={c.y + 20} rx={11} ry={4} className="robber-shadow" />
                  <circle cx={c.x} cy={c.y - 6} r={7} className="robber" />
                  <path
                    d={`M ${c.x - 9} ${c.y + 17} L ${c.x - 6} ${c.y - 3} L ${c.x + 6} ${c.y - 3} L ${c.x + 9} ${c.y + 17} Z`}
                    className="robber"
                  />
                </>
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
              cy={c.y}
              r={LAYOUT.w * 0.38}
              onClick={pick('hex', hk)}
            />
          );
        })}

        {/* Haefen */}
        {visible.map((t) =>
          t.port === null ? null : <PortMark key={'p' + hexKey(t.q, t.r)} port={t.port} />,
        )}

        {/* Strassen */}
        {Object.entries(state.roads).map(([ek, owner]) => {
          const [a, b] = edgeEndpoints(parseEdgeKey(ek)).map((v) => vertexToPixel(v, LAYOUT));
          return (
            <g key={'r' + ek} pointerEvents="none">
              <line x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y} className="road-base" />
              <line x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y} stroke={colorOf(owner)} className="road" />
            </g>
          );
        })}

        {/* Anklickbare Kanten */}
        {[...edgeTargets].map((ek) => {
          const [a, b] = edgeEndpoints(parseEdgeKey(ek)).map((v) => vertexToPixel(v, LAYOUT));
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
          const p = vertexToPixel(parseVertexKey(vk), LAYOUT);
          const fill = colorOf(b.owner);
          const d =
            b.type === 'city'
              ? `M ${p.x - 13} ${p.y + 9} L ${p.x - 13} ${p.y - 2} L ${p.x - 4} ${p.y - 11} L ${p.x + 4} ${p.y - 2} L ${p.x + 13} ${p.y - 2} L ${p.x + 13} ${p.y + 9} Z`
              : `M ${p.x - 9} ${p.y + 8} L ${p.x - 9} ${p.y - 2} L ${p.x} ${p.y - 11} L ${p.x + 9} ${p.y - 2} L ${p.x + 9} ${p.y + 8} Z`;
          return <path key={'b' + vk} d={d} fill={fill} className="piece" pointerEvents="none" />;
        })}

        {/* Anklickbare Ecken */}
        {[...vertexTargets].map((vk) => {
          const p = vertexToPixel(parseVertexKey(vk), LAYOUT);
          return (
            <circle
              key={'vt' + vk}
              className="vertex-target"
              cx={p.x}
              cy={p.y}
              r={8}
              onClick={pick('vertex', vk)}
            />
          );
        })}
      </svg>

      <div className="board-hint">Ziehen zum Verschieben, Mausrad zum Zoomen</div>
      {children}
    </div>
  );
}

function PortMark({ port }: { port: NonNullable<import('../../core/types').Tile['port']> }) {
  const [a, b] = port.vertices.map((v) => vertexToPixel(parseVertexKey(v), LAYOUT));
  const mx = (a!.x + b!.x) / 2;
  const my = (a!.y + b!.y) / 2;
  return (
    <g pointerEvents="none">
      <rect x={mx - 17} y={my - 10} width={34} height={20} className="port" />
      <text x={mx} y={my + 5} textAnchor="middle" className="port-text">
        {port.type === 'any' ? '3:1' : '2:1'}
      </text>
    </g>
  );
}
