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
import { HEX_CX, HEX_CY, HEX_H, HEX_W, IMG_H, IMG_W, tileUrl } from '../tiles';

/** Wie stark die Kacheln vergroessert werden. */
const SCALE = 2.8;

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

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

export type Targets = {
  vertices?: string[];
  edges?: string[];
  hexes?: string[];
};

type Props = {
  world: World;
  state: PublicState;
  targets: Targets;
  onPick: (kind: 'vertex' | 'edge' | 'hex', key: string) => void;
};

type Camera = { cx: number; cy: number; scale: number };

/** Augenzahl als Punkte: sagt schneller als die Ziffer, wie oft ein Feld trifft. */
const pips = (n: number): string => '.'.repeat(6 - Math.abs(7 - n));

export function Board({ world, state, targets, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState<Camera>({ cx: 0, cy: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const moved = useRef(false);

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

  const view = useMemo(
    () => ({
      x: cam.cx - size.w / 2 / cam.scale,
      y: cam.cy - size.h / 2 / cam.scale,
      w: size.w / cam.scale,
      h: size.h / cam.scale,
    }),
    [cam, size],
  );

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

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setCam((c) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.scale * factor));
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return { ...c, scale };
      // Der Punkt unter dem Zeiger soll stehen bleiben.
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      return {
        scale,
        cx: c.cx + mx / c.scale - mx / scale,
        cy: c.cy + my / c.scale - my / scale,
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
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    setCam((c) => ({ ...c, cx: d.cx - dx / c.scale, cy: d.cy - dy / c.scale }));
  };

  const onPointerUp = () => {
    drag.current = null;
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
    >
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        width={size.w}
        height={size.h}
      >
        {/* Gelaendekacheln */}
        {visible.map((t) => {
          const url = tileUrl(state.worldSeed, t.terrain, t.q, t.r);
          if (url === null) return null;
          const c = hexToPixel(t.q, t.r, LAYOUT);
          return (
            <image
              key={'t' + hexKey(t.q, t.r)}
              href={url}
              x={c.x - IMG.dx}
              y={c.y - IMG.dy}
              width={IMG.w}
              height={IMG.h}
              className="tile"
            />
          );
        })}

        {/* Zahlenmarker und Raeuber */}
        {visible.map((t) => {
          const hk = hexKey(t.q, t.r);
          const c = hexToPixel(t.q, t.r, LAYOUT);
          const red = t.number === 6 || t.number === 8;
          return (
            <g key={'n' + hk} pointerEvents="none">
              {t.number !== null && (
                <>
                  {/*
                    Klein halten: der Marker muss lesbar sein, darf aber die
                    Kachel nicht zudecken - sonst haette man sich die Grafik
                    sparen koennen.
                  */}
                  <circle cx={c.x} cy={c.y} r={11} className="token" />
                  <text
                    x={c.x}
                    y={c.y + 2}
                    textAnchor="middle"
                    className={red ? 'token-num red' : 'token-num'}
                  >
                    {t.number}
                  </text>
                  <text x={c.x} y={c.y + 9} textAnchor="middle" className="token-pips">
                    {pips(t.number)}
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
