/**
 * Die Uebersichtskarte: das ganze bekannte Land auf einem Blick (OVERHAUL.md,
 * Abschnitt 2).
 *
 * Die Karte hat keinen Rand; wer weit baut oder den Helden weit schickt,
 * verliert schnell den Ueberblick, wo was liegt. Die Uebersicht zeichnet jedes
 * erzeugte Feld als Punkt in seiner Gelaendefarbe, darueber eigene und fremde
 * Gebaeude, Lager, unerkundete Ruinen, Wunderstaetten und die eigenen
 * Einheiten, dazu den Rahmen des sichtbaren Ausschnitts. Ein Klick faehrt
 * die grosse Karte dorthin.
 *
 * Gezeichnet auf ein Canvas - ein paar tausend Punkte als SVG waeren zu viel.
 * Nur, was der Spieler ohnehin sehen darf: Felder im Nebel sind gedaempft,
 * Lager und Einheiten dort fehlen.
 */

import { useEffect, useRef, useState } from 'react';
import { hexKey, hexToPixel, parseVertexKey, vertexToPixel } from '../../core/coords';
import type { Layout } from '../../core/coords';
import type { PublicState } from '../../core/redact';
import type { World } from '../../core/world';
import type { Terrain } from '../../core/types';
import { isNestActive } from '../../core/units';
import { ruinAt } from '../../core/ruins';
import { wunderAt } from '../../core/wunder';

const FARBE: Record<Terrain, string> = {
  water: '#3f6f9a',
  forest: '#2f5a2c',
  pasture: '#7fae4a',
  field: '#c9a93c',
  hill: '#9a5a36',
  mountain: '#8a8a8a',
  desert: '#d8c48a',
};

const GROESSE = 176;

export function Uebersicht({
  world,
  state,
  you,
  sicht,
  layout,
  ausschnitt,
  farbeVon,
  onGehe,
}: {
  world: World;
  state: PublicState;
  you: string | null;
  sicht: Set<string> | null;
  layout: Layout;
  /** Der sichtbare Ausschnitt der grossen Karte, in Weltpixeln. */
  ausschnitt: { x: number; y: number; w: number; h: number };
  farbeVon: (spieler: string) => string;
  /** Die grosse Karte zu diesem Weltpunkt fahren. */
  onGehe: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Masstab und Mitte merken, damit ein Klick zurueckgerechnet werden kann.
  const abbild = useRef({ minX: 0, minY: 0, s: 1 });
  /*
   * Das Land selbst liegt in einer eigenen Schicht: es aendert sich nur mit
   * Zuegen, der Ausschnitt dagegen bei jeder Bewegung der Karte.
   */
  const grund = useRef<HTMLCanvasElement | null>(null);
  const [stand, setStand] = useState(0);

  useEffect(() => {
    const c = (grund.current ??= document.createElement('canvas'));
    c.width = GROESSE;
    c.height = GROESSE;
    const g = c.getContext('2d');
    if (!g) return;
    const tiles = [...world.tiles.values()];
    if (tiles.length === 0) return;
    const punkte = tiles.map((t) => ({ t, p: hexToPixel(t.q, t.r, layout) }));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { p } of punkte) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const rand = layout.w;
    minX -= rand;
    minY -= rand;
    maxX += rand;
    maxY += rand;
    const s = Math.min(GROESSE / (maxX - minX), GROESSE / (maxY - minY));
    // Mittig im Quadrat.
    const ox = (GROESSE - (maxX - minX) * s) / 2;
    const oy = (GROESSE - (maxY - minY) * s) / 2;
    abbild.current = { minX: minX - ox / s, minY: minY - oy / s, s };
    const px = (x: number) => (x - minX) * s + ox;
    const py = (y: number) => (y - minY) * s + oy;
    const r = Math.max(1.5, layout.w * s * 0.55);

    g.clearRect(0, 0, GROESSE, GROESSE);
    g.fillStyle = '#17120c';
    g.fillRect(0, 0, GROESSE, GROESSE);
    for (const { t, p } of punkte) {
      const k = hexKey(t.q, t.r);
      g.globalAlpha = sicht === null || sicht.has(k) ? 1 : 0.45;
      g.fillStyle = FARBE[t.terrain] ?? '#555';
      g.fillRect(px(p.x) - r, py(p.y) - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    // Orte: Lager (in Sicht), unerkundete Ruinen, freie Wunderstaetten.
    const erkundet = new Set(state.exploredRuins);
    for (const { t, p } of punkte) {
      const k = hexKey(t.q, t.r);
      const sichtbar = sicht === null || sicht.has(k);
      if (sichtbar && isNestActive(state, t.q, t.r)) {
        g.fillStyle = '#e0473a';
        g.fillRect(px(p.x) - 2.5, py(p.y) - 2.5, 5, 5);
      } else if (!erkundet.has(k) && ruinAt(state.worldSeed, t.q, t.r)) {
        g.fillStyle = '#c58cff';
        g.fillRect(px(p.x) - 2, py(p.y) - 2, 4, 4);
      } else if (wunderAt(state.worldSeed, t.q, t.r) && !state.wunder?.[k]) {
        g.strokeStyle = '#ffd76a';
        g.lineWidth = 1.5;
        g.strokeRect(px(p.x) - 3, py(p.y) - 3, 6, 6);
      }
    }
    // Gebaeude in Spielerfarbe, die eigenen etwas groesser.
    for (const [vk, b] of Object.entries(state.buildings)) {
      const p = vertexToPixel(parseVertexKey(vk), layout);
      const gross = b.owner === you ? 4 : 3;
      g.fillStyle = farbeVon(b.owner);
      g.fillRect(px(p.x) - gross / 2, py(p.y) - gross / 2, gross, gross);
      if (b.type === 'city') {
        g.strokeStyle = '#fff';
        g.lineWidth = 1;
        g.strokeRect(px(p.x) - gross / 2 - 1, py(p.y) - gross / 2 - 1, gross + 2, gross + 2);
      }
    }
    // Eigene Einheiten als helle Punkte.
    for (const u of state.units) {
      if (u.owner !== you) continue;
      const p = hexToPixel(u.q, u.r, layout);
      g.fillStyle = u.kind === 'held' ? '#ffd76a' : '#ffffff';
      g.beginPath();
      g.arc(px(p.x), py(p.y), u.kind === 'held' ? 2.5 : 1.8, 0, Math.PI * 2);
      g.fill();
    }
    setStand((n) => n + 1);
  }, [world, world.tiles.size, state, you, sicht, layout, farbeVon]);

  // Je Bewegung: die fertige Schicht kopieren, den Ausschnitt darueber.
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g || !grund.current) return;
    g.clearRect(0, 0, GROESSE, GROESSE);
    g.drawImage(grund.current, 0, 0);
    const { minX, minY, s } = abbild.current;
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.lineWidth = 1;
    g.strokeRect((ausschnitt.x - minX) * s, (ausschnitt.y - minY) * s, ausschnitt.w * s, ausschnitt.h * s);
  }, [ausschnitt, stand]);

  return (
    <canvas
      ref={ref}
      className="uebersicht"
      width={GROESSE}
      height={GROESSE}
      title="Uebersicht - klicken, um dorthin zu fahren"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const { minX, minY, s } = abbild.current;
        const x = ((e.clientX - rect.left) / rect.width) * GROESSE;
        const y = ((e.clientY - rect.top) / rect.height) * GROESSE;
        onGehe(minX + x / s, minY + y / s);
      }}
    />
  );
}
