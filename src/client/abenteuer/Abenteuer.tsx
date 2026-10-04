/**
 * Der Abenteuer-Modus im Bild (src/abenteuer/regeln.ts).
 *
 * Die Karte fuellt den Schirm, der Ritter steht in der Mitte. Darum herum:
 *   rechts unten   der Spieltisch mit dem Wuerfel, darueber das Inventar
 *   links unten    die Steuerung - die neun Tasten, zugleich Knoepfe zum Tippen
 *   links          die Ausruestung
 *   rechts oben    die Uebersichtskarte
 * Die Kacheln und Figuren sind dieselben wie in der Strategie (client/tiles.ts,
 * client/units.ts), damit beide Modi wie ein Spiel aussehen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  SLOTS,
  SLOT_NAME,
  TASTEN,
  TASTE_NAME,
  ZIEL_SCHLEIME,
  angriffVon,
  abwehrVon,
  benutzen,
  fundAuf,
  gegenstand,
  maxLebenVon,
  neuesAbenteuer,
  richtungFuer,
  sichtVon,
  taste,
  weltVon,
  wuerfeln,
} from '../../abenteuer/regeln';
import type { Abenteuer as Zustand, Taste } from '../../abenteuer/regeln';
import { HEX_DIRS, hexDistance, hexKey, hexesInRange } from '../../core/coords';
import { tileAt } from '../../core/world';
import type { Terrain } from '../../core/types';
import { HEX_CX, HEX_CY, IMG_H, IMG_W, kachelEcke, preloadTiles, tileImage, tileImageFog, tileUrl } from '../tiles';
import { preloadUnitSprites, zeichneFigur } from '../units';
import { PIX, Px } from '../ui/KartenPixel';
import { SYMBOL, zeichnePixel } from './symbole';

const SPEICHER = 'infinitecarthage.abenteuer';

function lade(): Zustand | null {
  try {
    const t = localStorage.getItem(SPEICHER);
    return t ? (JSON.parse(t) as Zustand) : null;
  } catch {
    return null;
  }
}
function speichere(a: Zustand): void {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(a));
  } catch {
    // Privater Modus - dann ohne Fortsetzen.
  }
}

const neuerSeed = () => (Math.random() * 2 ** 31) | 0;

/** Pfeil je Taste fuer die Steuerung. */
const PFEIL: Record<Taste, string> = { q: '↖', w: '↑', e: '↗', a: '←', s: '•', d: '→', z: '↙', x: '↓', c: '↘' };

const MINI_FARBE: Record<Terrain, string> = {
  forest: '#3f6b32',
  pasture: '#7cb15a',
  field: '#d9b84a',
  hill: '#b4633c',
  mountain: '#857e70',
  desert: '#d8c8a8',
  water: '#3a6a9a',
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

function Wuerfelbild({ n, rollt }: { n: number | null; rollt: boolean }) {
  // Augen auf einem 3x3-Raster.
  const augen: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  };
  return (
    <svg className={rollt ? 'ab-wuerfel rollt' : 'ab-wuerfel'} viewBox="0 0 30 30" shapeRendering="crispEdges" aria-label={n ? `Wurf ${n}` : 'Wuerfel'}>
      <rect x="1" y="1" width="28" height="28" fill="#f2e7d0" stroke="#2a1f16" strokeWidth="2" />
      {(n ? augen[n]! : []).map(([x, y], i) => (
        <rect key={i} x={5 + x * 8} y={5 + y * 8} width="4" height="4" fill="#2a1f16" />
      ))}
    </svg>
  );
}

export function Abenteuer({ onZurueck }: { onZurueck: () => void }) {
  const [a, setA] = useState<Zustand>(() => lade() ?? neuesAbenteuer(neuerSeed()));
  const [geladen, setGeladen] = useState(false);
  const [gedrueckt, setGedrueckt] = useState<{ taste: Taste; n: number } | null>(null);
  const [zugTasten, setZugTasten] = useState<Taste[]>([]);
  const [rollt, setRollt] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);

  useEffect(() => speichere(a), [a]);
  useEffect(() => {
    void Promise.all([preloadTiles(), preloadUnitSprites()]).then(() => setGeladen(true));
  }, []);
  // Die Welt rund um den Ritter erzeugen, bevor gezeichnet wird.
  useMemo(() => weltVon(a.seed, a.pos, 14), [a.seed, a.pos]);

  // Der aktuelle Stand fuer Tasten und Knoepfe - ohne Nebenwirkungen in setA.
  const aktuell = useRef(a);
  aktuell.current = a;
  const drueck = useCallback((t: Taste) => {
    setGedrueckt((g) => ({ taste: t, n: (g?.n ?? 0) + 1 }));
    const alt = aktuell.current;
    if (alt.phase !== 'ziehen') return;
    setZugTasten((z) => [...z, t]);
    const neu = taste(alt, t);
    aktuell.current = neu;
    setA(neu);
  }, []);
  const wirf = useCallback(() => {
    const alt = aktuell.current;
    if (alt.phase !== 'wuerfeln') return;
    setRollt(true);
    window.setTimeout(() => setRollt(false), 450);
    setZugTasten([]);
    const neu = wuerfeln(alt);
    aktuell.current = neu;
    setA(neu);
  }, []);

  // Tastatur: q w e / a s d / z x c, Leertaste wuerfelt.
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
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

  // --- Zeichnen ----------------------------------------------------------
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let raf = 0;
    const zeichne = () => {
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
      const mitte = kachelEcke(a.pos.q, a.pos.r);
      const camX = mitte.x + HEX_CX;
      const camY = mitte.y + HEX_CY;
      const sx = (x: number) => Math.round((x - camX) * f + c.width / 2);
      const sy = (y: number) => Math.round((y - camY) * f + c.height / 2);
      const welt = weltVon(a.seed);
      const erkundet = new Set(a.erkundet);
      const sicht = sichtVon(a);
      const radius = Math.ceil(Math.max(c.width, c.height) / (17 * f)) + 2;
      const felder = hexesInRange(a.pos, radius).sort((p, q) => p.r - q.r || p.q - q.q);
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
        const e = kachelEcke(q, r);
        return { x: sx(e.x + HEX_CX), y: sy(e.y + HEX_CY) };
      };
      // Funde in Sichtweite.
      for (const hx of felder) {
        if (hexDistance(hx, a.pos) > sicht) continue;
        const fund = fundAuf(a, hx.q, hx.r);
        if (!fund || !SYMBOL[fund]) continue;
        const p = zentrum(hx.q, hx.r);
        const karte = SYMBOL[fund]!;
        zeichnePixel(ctx, karte, p.x - Math.floor((karte[0]!.length * f) / 2), p.y - karte.length * f, f, PIX);
      }
      // Der Weg dieses Zuges als Pfeile.
      ctx.strokeStyle = '#f2c94c';
      ctx.fillStyle = '#f2c94c';
      ctx.lineWidth = Math.max(2, f);
      for (let i = 1; i < a.pfad.length; i++) {
        const p0 = zentrum(a.pfad[i - 1]!.q, a.pfad[i - 1]!.r);
        const p1 = zentrum(a.pfad[i]!.q, a.pfad[i]!.r);
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
        const s = 4 * f;
        ctx.beginPath();
        ctx.moveTo(a1.x + ux * s * 0.6, a1.y + uy * s * 0.6);
        ctx.lineTo(a1.x - ux * s - uy * s * 0.6, a1.y - uy * s + ux * s * 0.6);
        ctx.lineTo(a1.x - ux * s + uy * s * 0.6, a1.y - uy * s - ux * s * 0.6);
        ctx.closePath();
        ctx.fill();
      }
      // Die Nachbarfelder tragen im Zug ihre Taste - so sieht man, welche wohin fuehrt.
      if (a.phase === 'ziehen') {
        ctx.font = `${5 * f}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const t of TASTEN) {
          // w und x fuehren im Zickzack auf ein Feld, das schon eine andere Taste traegt.
          if (t === 'w' || t === 'x' || t === 's') continue;
          const dir = richtungFuer(t, a.pos);
          if (dir === null) continue;
          const d = HEX_DIRS[dir]!;
          const p = zentrum(a.pos.q + d[0], a.pos.r + d[1]);
          ctx.fillStyle = 'rgba(18, 14, 9, 0.75)';
          ctx.fillRect(p.x - 4 * f, p.y - 4 * f, 8 * f, 8 * f);
          ctx.fillStyle = '#f2e7d0';
          ctx.fillText(t.toUpperCase(), p.x, p.y + f * 0.5);
        }
      }
      // Schleime in Sichtweite.
      for (const s of a.schleime) {
        if (hexDistance(s, a.pos) > sicht) continue;
        const p = zentrum(s.q, s.r);
        const fs = s.gross ? f + Math.max(1, Math.round(f / 2)) : f;
        zeichneFigur(ctx, 'schleim', p.x, p.y + 3 * f, fs);
        for (let i = 0; i < s.leben; i++) {
          ctx.fillStyle = '#6aa85a';
          ctx.fillRect(p.x - (s.leben * 3 * f) / 2 + i * 3 * f, p.y + 5 * f, 2 * f, f);
        }
      }
      // Der Ritter.
      const r = zentrum(a.pos.q, a.pos.r);
      zeichneFigur(ctx, 'ritter', r.x, r.y + 3 * f, f, '#3a6ab0');

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
        mctx.fillStyle = '#f2c94c';
        mctx.fillRect(m.width / 2 - 1, m.height / 2 - 1, z * 2 + 2, z * 2 + 2);
      }
    };
    zeichne();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(zeichne);
    });
    ro.observe(c);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [a, geladen]);

  const maxLeben = maxLebenVon(a);
  const vorrat = Object.entries(a.inventar).filter(([, n]) => n > 0);
  const neu = () => {
    setZugTasten([]);
    setA(neuesAbenteuer(neuerSeed()));
  };

  return (
    <div className="abenteuer">
      <canvas ref={canvas} className="ab-karte" />

      {/* Oben links: zurueck, Leben, Zug, Ziel. */}
      <div className="ab-kopf">
        <button className="klein" onClick={onZurueck} title="Zur Wahl des Modus">
          ‹ Modus
        </button>
        <span className="ab-schild" title="Leben">
          {Array.from({ length: maxLeben }, (_, i) => (
            <i key={i} className={i < a.leben ? 'ab-herz voll' : 'ab-herz'} />
          ))}
        </span>
        <span className="ab-schild">Zug {a.zug}</span>
        <span className="ab-schild" title={`Ziel: ${ZIEL_SCHLEIME} Schleime erschlagen`}>
          Schleime {a.erschlagen}/{ZIEL_SCHLEIME}
        </span>
      </div>

      {/* Rechts oben: die Uebersichtskarte. */}
      <div className="ab-fenster ab-mini">
        <span className="ab-titel">Karte</span>
        <canvas ref={mini} width={170} height={130} />
      </div>

      {/* Links: die Ausruestung. */}
      <div className="ab-fenster ab-ausruestung">
        <span className="ab-titel">Ausruestung</span>
        {SLOTS.map((s) => {
          const g = gegenstand(a.ausruestung[s] ?? '');
          return (
            <div key={s} className={g ? 'ab-platz voll' : 'ab-platz'} title={g ? `${g.name}: ${g.text}` : SLOT_NAME[s]}>
              <span className="ab-platz-bild">{g ? <Icon id={g.id} /> : null}</span>
              <span className="ab-platz-text">
                <small>{SLOT_NAME[s]}</small>
                {g?.name ?? '-'}
              </span>
            </div>
          );
        })}
        <div className="ab-werte">
          Angriff +{angriffVon(a)} · Abwehr +{abwehrVon(a)} · Sicht {sichtVon(a)}
        </div>
      </div>

      {/* Links unten: die Steuerung - zeigt die Tasten und ist zugleich zum Tippen. */}
      <div className="ab-fenster ab-steuerung">
        <span className="ab-titel">Steuerung</span>
        <div className="ab-tasten">
          {TASTEN.map((t) => (
            <button
              key={`${t}${gedrueckt?.taste === t ? gedrueckt.n : ''}`}
              className={gedrueckt?.taste === t ? 'ab-taste gedrueckt' : 'ab-taste'}
              disabled={a.phase !== 'ziehen'}
              title={TASTE_NAME[t]}
              onClick={() => drueck(t)}
            >
              <b>{t.toUpperCase()}</b>
              <span>{PFEIL[t]}</span>
            </button>
          ))}
        </div>
        <div className="ab-verlauf" title="Diesen Zug gedrueckt">
          {zugTasten.length > 0 ? zugTasten.map((t, i) => <kbd key={i}>{t.toUpperCase()}</kbd>) : <small>Leertaste: wuerfeln</small>}
        </div>
      </div>

      {/* Rechts unten: Inventar ueber dem Spieltisch. */}
      <div className="ab-rechts-unten">
        <div className="ab-fenster ab-inventar">
          <span className="ab-titel">Inventar</span>
          {vorrat.length === 0 ? (
            <small className="ab-leer">Noch leer - Funde liegen auf der Karte.</small>
          ) : (
            <div className="ab-gegenstaende">
              {vorrat.map(([id, n]) => {
                const g = gegenstand(id);
                return (
                  <button key={id} className="ab-gegenstand" title={`${g?.name ?? id}: ${g?.text ?? ''}`} onClick={() => setA((alt) => benutzen(alt, id))}>
                    <Icon id={id} groesse={26} />
                    {n > 1 && <span className="ab-anzahl">{n}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="ab-tisch">
          <Wuerfelbild n={a.wurf} rollt={rollt} />
          <div className="ab-tisch-text">
            {a.phase === 'wuerfeln' && <b>Wuerfle!</b>}
            {a.phase === 'ziehen' && (
              <b>
                {a.schritte} {a.schritte === 1 ? 'Schritt' : 'Schritte'}
              </b>
            )}
            <small>{a.phase === 'ziehen' ? 'S: rasten und Zug beenden' : 'Leertaste oder Knopf'}</small>
          </div>
          <button className="primary ab-wurf" disabled={a.phase !== 'wuerfeln'} onClick={wirf}>
            Wuerfeln
          </button>
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
            <p>
              {a.erschlagen} Schleime in {a.zug} Zuegen · {a.inventar['gold'] ?? 0} Gold · {a.erkundet.length} Felder erkundet
            </p>
            <button className="primary" onClick={neu}>
              Neues Abenteuer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
