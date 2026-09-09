/**
 * Das Spielbrett als SVG.
 *
 * Zwei Dinge unterscheiden es von einem Brett fester Groesse:
 *
 * 1. Es gibt keinen Rahmen, in den man hineinzeichnet. Die Kamera bestimmt
 *    den Ausschnitt, und gezeichnet wird nur, was wirklich sichtbar ist -
 *    bei einer Karte ohne Obergrenze ist das keine Optimierung, sondern
 *    Bedingung dafuer, dass lange Partien fluessig bleiben.
 * 2. Ecken und Kanten sind eigene, anklickbare Elemente. Genau dafuer ist
 *    SVG gegenueber Canvas hier im Vorteil: die Trefferflaechen entstehen
 *    von selbst, ohne dass jemand Mausposition zu Hex rechnen muss.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  hexToPixel,
  hexCornerPixel,
  parseEdgeKey,
  parseHexKey,
  parseVertexKey,
  edgeEndpoints,
  vertexToPixel,
  hexKey,
} from '../../core/coords';
import type { World } from '../../core/world';
import type { PublicState } from '../../core/redact';
import { TERRAIN_COLOR, playerColor } from '../theme';

const HEX = 42;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;

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

/** Eckpunkte eines Hexes als SVG-Polygonliste. */
function hexPoints(q: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const p = hexCornerPixel(q, r, i, HEX);
    pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  return pts.join(' ');
}

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
   * Nur sichtbare Felder zeichnen. Der Rand von zwei Hexbreiten verhindert,
   * dass am Bildrand halbe Felder aufblitzen.
   */
  const visible = useMemo(() => {
    const pad = HEX * 2;
    const out = [];
    for (const t of world.tiles.values()) {
      const p = hexToPixel(t.q, t.r, HEX);
      if (
        p.x < view.x - pad ||
        p.x > view.x + view.w + pad ||
        p.y < view.y - pad ||
        p.y > view.y + view.h + pad
      ) {
        continue;
      }
      out.push(t);
    }
    return out;
  }, [world, view]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setCam((c) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale * factor));
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
        {/* Gelaende */}
        {visible.map((t) => {
          const hk = hexKey(t.q, t.r);
          const c = hexToPixel(t.q, t.r, HEX);
          const isTarget = hexTargets.has(hk);
          return (
            <g key={'h' + hk}>
              <polygon
                points={hexPoints(t.q, t.r)}
                fill={TERRAIN_COLOR[t.terrain]}
                stroke="#1c2530"
                strokeWidth={1.5}
                className={isTarget ? 'hex-target' : undefined}
                onClick={isTarget ? pick('hex', hk) : undefined}
              />
              {t.number !== null && (
                <g pointerEvents="none">
                  <circle cx={c.x} cy={c.y} r={13} fill="#f2ead8" />
                  <text
                    x={c.x}
                    y={c.y + 5}
                    textAnchor="middle"
                    fontSize={15}
                    fontWeight={700}
                    fill={t.number === 6 || t.number === 8 ? '#c0392b' : '#26313d'}
                  >
                    {t.number}
                  </text>
                </g>
              )}
              {state.robber === hk && (
                <g pointerEvents="none">
                  <circle cx={c.x} cy={c.y - 22} r={9} fill="#14181d" opacity={0.88} />
                  <rect x={c.x - 7} y={c.y - 18} width={14} height={18} rx={5} fill="#14181d" opacity={0.88} />
                </g>
              )}
            </g>
          );
        })}

        {/* Haefen */}
        {visible.map((t) =>
          t.port === null ? null : (
            <PortMark key={'p' + hexKey(t.q, t.r)} port={t.port} />
          ),
        )}

        {/* Strassen */}
        {Object.entries(state.roads).map(([ek, owner]) => {
          const [a, b] = edgeEndpoints(parseEdgeKey(ek)).map((v) => vertexToPixel(v, HEX));
          return (
            <line
              key={'r' + ek}
              x1={a!.x}
              y1={a!.y}
              x2={b!.x}
              y2={b!.y}
              stroke={colorOf(owner)}
              strokeWidth={9}
              strokeLinecap="round"
              pointerEvents="none"
            />
          );
        })}

        {/* Anklickbare Kanten */}
        {[...edgeTargets].map((ek) => {
          const [a, b] = edgeEndpoints(parseEdgeKey(ek)).map((v) => vertexToPixel(v, HEX));
          return (
            <line
              key={'et' + ek}
              className="edge-target"
              x1={a!.x}
              y1={a!.y}
              x2={b!.x}
              y2={b!.y}
              strokeWidth={12}
              strokeLinecap="round"
              onClick={pick('edge', ek)}
            />
          );
        })}

        {/* Gebaeude */}
        {Object.entries(state.buildings).map(([vk, b]) => {
          const p = vertexToPixel(parseVertexKey(vk), HEX);
          return b.type === 'city' ? (
            <rect
              key={'b' + vk}
              x={p.x - 11}
              y={p.y - 11}
              width={22}
              height={22}
              rx={4}
              fill={colorOf(b.owner)}
              stroke="#14181d"
              strokeWidth={2.5}
              pointerEvents="none"
            />
          ) : (
            <circle
              key={'b' + vk}
              cx={p.x}
              cy={p.y}
              r={10}
              fill={colorOf(b.owner)}
              stroke="#14181d"
              strokeWidth={2.5}
              pointerEvents="none"
            />
          );
        })}

        {/* Anklickbare Ecken */}
        {[...vertexTargets].map((vk) => {
          const p = vertexToPixel(parseVertexKey(vk), HEX);
          return (
            <circle
              key={'vt' + vk}
              className="vertex-target"
              cx={p.x}
              cy={p.y}
              r={11}
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
  const [a, b] = port.vertices.map((v) => vertexToPixel(parseVertexKey(v), HEX));
  const mx = (a!.x + b!.x) / 2;
  const my = (a!.y + b!.y) / 2;
  const label = port.type === 'any' ? '3:1' : '2:1';
  return (
    <g pointerEvents="none">
      <circle cx={mx} cy={my} r={13} fill="#f7f1e3" stroke="#14181d" strokeWidth={2} />
      <text x={mx} y={my + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#14181d">
        {label}
      </text>
    </g>
  );
}

export { parseHexKey };
