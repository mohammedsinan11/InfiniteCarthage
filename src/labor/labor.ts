/**
 * Kartenlabor - nur im Entwicklungsserver (labor.html), nicht im Spiel.
 *
 * Zeichnet dieselbe Welt mit verschiedenen Einstellungen nebeneinander, damit
 * man sieht, was eine Einstellung bewirkt: wie viel beim Start aufgedeckt ist,
 * wie steil das Relief steigt, wie Fluesse aussehen koennten. Und es misst, wie
 * lange eine grosse Karte zum Erzeugen und Zeichnen braucht.
 *
 *   /labor.html?art=aufdeckung   Startausschnitt: Radius 4, 6, 9 und fuenffach
 *   /labor.html?art=relief       Relief: flach, sanft, heute, steil
 *   /labor.html?art=fluesse      Fluesse als Entwurf - nicht im Spiel
 *   /labor.html?art=leistung     Messung: Erzeugen und Zeichnen grosser Karten
 *
 * Gezeichnet wird wie auf dem Brett (board/Board.tsx): Kacheln zeilenweise von
 * hinten nach vorn, jede auf ihrer Hoehe, im selben Kunstpixelraster.
 */

import { createWorld, ensureGenerated } from '../core/world';
import type { World } from '../core/world';
import { fieldsAt, findPlayableSeed } from '../core/worldgen';
import { reliefLimitedAt } from '../core/relief';
import { hexDistance, hexKey, hexToPixel, neighbors } from '../core/coords';
import type { Hex, Layout } from '../core/coords';
import { hash3i } from '../core/hash';
import { nestAt } from '../core/raiders';
import { ruinAt } from '../core/ruins';
import { HEX_CX, HEX_CY, HEX_H, HEX_W, IMG_H, IMG_W, preloadTiles, tileImage, tileUrl } from '../client/tiles';
import { preloadUnitSprites, zeichneFigur } from '../client/units';

/** Wie auf dem Brett: Welteinheiten je Kunstpixel. */
const SCALE = 2;
const LAYOUT: Layout = { w: HEX_W * SCALE, h: HEX_H * SCALE };
const IMG = { w: IMG_W * SCALE, h: IMG_H * SCALE, dx: HEX_CX * SCALE, dy: HEX_CY * SCALE };
/** Wie auf dem Brett: der Deckel der Hoehe in Welteinheiten. */
const RELIEF_MAX = 180;
const ORIGIN: Hex = { q: 0, r: 0 };

type Einstellung = {
  titel: string;
  text: string;
  radius: number;
  /** Stufe zwischen Nachbarn in Kunstpixeln; 0 = flach. Heute 1,5. */
  stufe: number;
  /** Bildschirmpixel je Welteinheit. 1 entspricht der Startzoomstufe im Spiel. */
  pixel?: number;
  fluesse?: boolean;
  lager?: boolean;
};

const liftVon = (seed: number, q: number, r: number, stufe: number): number =>
  stufe <= 0
    ? 0
    : Math.floor((reliefLimitedAt(seed, q, r, (stufe * SCALE) / RELIEF_MAX) * RELIEF_MAX) / SCALE + 1e-6) *
      SCALE;

function welt(seed: number, radius: number): World {
  const w = createWorld(seed);
  ensureGenerated(w, ORIGIN, radius);
  return w;
}

// --- Fluesse (Entwurf) ------------------------------------------------------

type Lauf = { punkte: Hex[]; muendung: boolean; zufluss: number };

/**
 * Fluesse als Entwurf.
 *
 * Eine erste Fassung folgte der Reliefhoehe. Die ist auf Hochebenen flach, und
 * die Laeufe zogen dort in langen Geraden und Gittern ueber die Karte. Jetzt:
 *   - Hoehe aus der unruhigen Ortshoehe plus dem Kontinent, damit es Gefaelle gibt
 *   - Quellen nur in Bergen und Huegeln, mindestens vier Felder auseinander
 *   - streng bergab zum tiefsten Nachbarn; eine flache Senke darf einmal
 *     ueberwunden werden, sonst versickert der Lauf
 *   - trifft ein Lauf auf einen Fluss, muendet er dort ein - der Fluss wird
 *     breiter, statt dass zwei Linien nebeneinander herlaufen
 */
function fluesseFuer(seed: number, w: World): Lauf[] {
  const hoehe = (q: number, r: number): number | null => {
    const t = w.tiles.get(hexKey(q, r));
    if (!t) return null;
    if (t.terrain === 'water') return -1;
    const f = fieldsAt(seed, q, r);
    return 0.6 * f.elevation + 0.4 * f.kontinent;
  };

  const kandidaten = [...w.tiles.values()]
    .filter(
      (t) =>
        (t.terrain === 'mountain' || t.terrain === 'hill') &&
        (hash3i(seed, t.q, t.r, 97) >>> 0) % 2 === 0,
    )
    .sort((a, b) => hoehe(b.q, b.r)! - hoehe(a.q, a.r)!);
  const quellen: Hex[] = [];
  for (const k of kandidaten) {
    if (quellen.every((q) => hexDistance(q, k) >= 3)) quellen.push({ q: k.q, r: k.r });
  }

  const laeufe: Lauf[] = [];
  /** Feld -> Index des Laufs, der es als erster nimmt. */
  const fluss = new Map<string, number>();
  for (const quelle of quellen) {
    if (fluss.has(hexKey(quelle.q, quelle.r))) continue;
    const punkte: Hex[] = [quelle];
    let muendung = false;
    let einmuendung: number | null = null;
    let senken = 0;
    for (let schritt = 0; schritt < 60; schritt++) {
      const cur = punkte[punkte.length - 1]!;
      const hier = hoehe(cur.q, cur.r)!;
      let best: Hex | null = null;
      let bestH = Number.POSITIVE_INFINITY;
      for (const n of neighbors(cur.q, cur.r)) {
        const h = hoehe(n.q, n.r);
        if (h === null || punkte.some((p) => p.q === n.q && p.r === n.r)) continue;
        if (h < bestH) {
          bestH = h;
          best = n;
        }
      }
      if (!best) break;
      // Flache Senken bis zu dreimal ueberwinden - die Ortshoehe ist unruhig,
      // sonst versiegt fast jeder Lauf nach zwei Feldern.
      if (bestH >= hier) {
        if (senken >= 3 || bestH > hier + 0.03) break;
        senken += 1;
      }
      punkte.push(best);
      if (bestH === -1) {
        muendung = true;
        break;
      }
      const anderer = fluss.get(hexKey(best.q, best.r));
      if (anderer !== undefined) {
        einmuendung = anderer;
        break;
      }
    }
    const endetGut = muendung || einmuendung !== null;
    if (punkte.length < 3 || !endetGut) continue;
    const index = laeufe.length;
    laeufe.push({ punkte, muendung, zufluss: 0 });
    for (const p of punkte.slice(0, muendung ? -1 : undefined)) {
      const k = hexKey(p.q, p.r);
      if (!fluss.has(k)) fluss.set(k, index);
    }
    if (einmuendung !== null) laeufe[einmuendung]!.zufluss += 1 + laeufe[index]!.zufluss;
  }
  return laeufe;
}

// --- Zeichnen ---------------------------------------------------------------

async function karte(seed: number, e: Einstellung): Promise<HTMLElement> {
  const w = welt(seed, e.radius);
  const px = e.pixel ?? 1;
  const dpr = window.devicePixelRatio || 1;
  const kacheln = [...w.tiles.values()].sort((a, b) => a.r - b.r || a.q - b.q);
  const lifts = new Map(kacheln.map((t) => [hexKey(t.q, t.r), liftVon(seed, t.q, t.r, e.stufe)]));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of kacheln) {
    const p = hexToPixel(t.q, t.r, LAYOUT);
    const l = lifts.get(hexKey(t.q, t.r))!;
    minX = Math.min(minX, p.x - IMG.dx);
    maxX = Math.max(maxX, p.x - IMG.dx + IMG.w);
    minY = Math.min(minY, p.y - IMG.dy - l);
    maxY = Math.max(maxY, p.y - IMG.dy - l + IMG.h);
  }
  const f = px * dpr;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxX - minX) * f);
  canvas.height = Math.ceil((maxY - minY) * f);
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const kunst = Math.max(1, Math.round(SCALE * f));
  for (const t of kacheln) {
    const url = tileUrl(seed, t.terrain, t.q, t.r);
    const img = url ? tileImage(url) : undefined;
    if (!img) continue;
    const p = hexToPixel(t.q, t.r, LAYOUT);
    const l = lifts.get(hexKey(t.q, t.r))!;
    const x = Math.round((p.x - IMG.dx - minX) * f);
    const y = Math.round((p.y - IMG.dy - l - minY) * f);
    ctx.drawImage(img, x, y, Math.round(IMG.w * f), Math.round(IMG.h * f));
    if (e.lager && nestAt(seed, t.q, t.r)) {
      zeichneFigur(ctx, 'lager', x + Math.round(HEX_CX) * kunst, y + Math.round(HEX_CY) * kunst + kunst, kunst, '#d8742c');
    }
  }

  const mitte = (h: Hex) => {
    const p = hexToPixel(h.q, h.r, LAYOUT);
    const l = lifts.get(hexKey(h.q, h.r)) ?? 0;
    return { x: (p.x - minX) * f, y: (p.y - l - minY) * f };
  };

  if (e.fluesse) {
    const laeufe = fluesseFuer(seed, w);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Erst alle Umrisse, dann alle Wasserlinien - sonst schneidet ein Umriss
    // durch den Fluss, in den er muendet.
    for (const pass of [0, 1]) {
      for (const lauf of laeufe) {
        const pts = lauf.punkte.map(mitte);
        if (lauf.muendung && pts.length >= 2) {
          // Ins Meer nur bis an die Kueste, nicht bis in die Mitte des Wasserfelds.
          const a = pts[pts.length - 2]!;
          const b = pts[pts.length - 1]!;
          pts[pts.length - 1] = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
        const breite = (1.5 + Math.min(2.5, lauf.zufluss * 0.7)) * kunst;
        ctx.strokeStyle = pass === 0 ? '#1d3550' : '#4f95c9';
        ctx.lineWidth = pass === 0 ? breite + 2 * kunst : breite;
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        // Durch die Mittelpunkte zwischen den Feldern geglaettet - kein Zickzack.
        for (let i = 1; i < pts.length - 1; i++) {
          const m = { x: (pts[i]!.x + pts[i + 1]!.x) / 2, y: (pts[i]!.y + pts[i + 1]!.y) / 2 };
          ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, m.x, m.y);
        }
        const letzter = pts[pts.length - 1]!;
        ctx.lineTo(letzter.x, letzter.y);
        ctx.stroke();
      }
    }
  }

  // Der Ursprung - dort beginnt jede Partie.
  const o = mitte(ORIGIN);
  ctx.strokeStyle = '#ffe08a';
  ctx.lineWidth = Math.max(2, kunst);
  ctx.beginPath();
  ctx.arc(o.x, o.y, 7 * kunst, 0, Math.PI * 2);
  ctx.stroke();

  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.innerHTML = `<b>${e.titel}</b> - ${e.text} <span style="opacity:.7">(${w.tiles.size} Felder)</span>`;
  fig.append(cap, canvas);
  return fig;
}

function kopf(root: HTMLElement, titel: string, text: string): HTMLElement {
  const h = document.createElement('h1');
  h.textContent = titel;
  const p = document.createElement('p');
  p.className = 'unter';
  p.textContent = text;
  const reihe = document.createElement('div');
  reihe.className = 'reihe';
  root.append(h, p, reihe);
  return reihe;
}

// --- Seiten -----------------------------------------------------------------

async function aufdeckung(root: HTMLElement, seed: number) {
  const reihe = kopf(
    root,
    'Startausschnitt: wie viel beim Hereinkommen aufgedeckt ist',
    'Dieselbe Welt, derselbe Zoom wie beim Spielstart. Der gelbe Ring ist der Ursprung. Die Hoehen haengen nur von Seed und Koordinate ab: ein Feld steht in allen vier Bildern gleich hoch - der Ausschnitt schneidet nur anders ab.',
  );
  const varianten: Einstellung[] = [
    { titel: 'Radius 4', text: 'knapp, fast nur der Startplatz', radius: 4, stufe: 1.5, lager: true },
    { titel: 'Radius 6 (neu)', text: 'Kueste, Gebirge und die ersten Lager', radius: 6, stufe: 1.5, lager: true },
    { titel: 'Radius 9 (bisher)', text: 'viel Landschaft auf einmal', radius: 9, stufe: 1.5, lager: true },
    { titel: 'Fuenffache Startkarte (Radius 21)', text: 'halber Zoom - so gross wird eine Karte nach einer langen Partie', radius: 21, stufe: 1.5, pixel: 0.5, lager: true },
  ];
  for (const v of varianten) reihe.append(await karte(seed, v));
}

async function relief(root: HTMLElement, seed: number) {
  const reihe = kopf(
    root,
    'Relief: wie weit ein Feld ueber seinem Nachbarn stehen darf',
    'Dieselbe Welt, Radius 7. Die Stufe begrenzt den Hoehenunterschied zwischen zwei Nachbarn (in Kunstpixeln); die Gesamthoehe waechst mit dem Abstand zum Meer. Heute im Spiel: 1,5.',
  );
  const varianten: Einstellung[] = [
    { titel: 'Flach (0)', text: 'ohne Hoehenversatz, wie ganz am Anfang', radius: 7, stufe: 0 },
    { titel: 'Sanft (1)', text: 'Huegel lesbar, Gebirge niedrig', radius: 7, stufe: 1 },
    { titel: 'Heute (1,5)', text: 'Stufen von 1 und 2 Pixeln im Wechsel', radius: 7, stufe: 1.5 },
    { titel: 'Steil (2,5)', text: 'hohes Gebirge, Stufen werden sichtbar', radius: 7, stufe: 2.5 },
  ];
  for (const v of varianten) reihe.append(await karte(seed, v));
}

async function fluesse(root: HTMLElement) {
  const reihe = kopf(
    root,
    'Fluesse - Entwurf, nicht im Spiel',
    'Aus Quellen im Hochland laeuft jeder Fluss zum tiefsten Nachbarn, bis er Meer oder See erreicht; wo Laeufe zusammenkommen, wird er breiter. Nur als Linie ueber die Kacheln gezeichnet - echte Flusskacheln kaemen spaeter.',
  );
  for (const s of [2024, 7, 31337]) {
    const seed = findPlayableSeed(s);
    reihe.append(await karte(seed, { titel: `Welt ${s}`, text: 'Radius 8, Relief 1,5', radius: 8, stufe: 1.5, fluesse: true }));
  }
}

async function leistung(root: HTMLElement) {
  const zeilen: string[] = [];
  const dpr = window.devicePixelRatio || 1;
  zeilen.push(`devicePixelRatio ${dpr}, ${navigator.userAgent}`);
  for (const radius of [9, 21, 30]) {
    const seed = findPlayableSeed(4242 + radius);
    const t0 = performance.now();
    const w = welt(seed, radius);
    const t1 = performance.now();
    const kacheln = [...w.tiles.values()].sort((a, b) => a.r - b.r || a.q - b.q);
    const t2 = performance.now();
    for (const t of kacheln) liftVon(seed, t.q, t.r, 1.5);
    const t3 = performance.now();

    // Ein Bild wie auf dem Brett: Kachel, Hoehe, Lager- und Ruinenpruefung je Feld.
    const zeichne = (breite: number, hoehe: number, zoom: number) => {
      const c = document.createElement('canvas');
      c.width = Math.round(breite * dpr);
      c.height = Math.round(hoehe * dpr);
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const f = zoom * dpr;
      const start = performance.now();
      const bilder = 20;
      for (let i = 0; i < bilder; i++) {
        ctx.clearRect(0, 0, c.width, c.height);
        for (const t of kacheln) {
          const p = hexToPixel(t.q, t.r, LAYOUT);
          const x = Math.round((p.x - IMG.dx) * f + c.width / 2);
          const y = Math.round((p.y - IMG.dy - liftVon(seed, t.q, t.r, 1.5)) * f + c.height / 2);
          if (x < -IMG.w * f || x > c.width || y < -IMG.h * f || y > c.height) continue;
          const url = tileUrl(seed, t.terrain, t.q, t.r);
          const img = url ? tileImage(url) : undefined;
          if (img) ctx.drawImage(img, x, y, Math.round(IMG.w * f), Math.round(IMG.h * f));
          nestAt(seed, t.q, t.r);
          ruinAt(seed, t.q, t.r);
        }
      }
      return (performance.now() - start) / bilder;
    };
    const imFenster = zeichne(1280, 800, 1);
    const alles = zeichne(1280, 800, 0.25);
    const handy = zeichne(390, 844, 1);
    zeilen.push(
      `Radius ${radius}: ${w.tiles.size} Felder | erzeugen ${(t1 - t0).toFixed(0)} ms | Relief erstmals ${(t3 - t2).toFixed(0)} ms | ` +
        `Bild 1280x800 Startzoom ${imFenster.toFixed(1)} ms | ganz herausgezoomt ${alles.toFixed(1)} ms | Handyfenster 390x844 ${handy.toFixed(1)} ms`,
    );
  }
  const pre = document.createElement('pre');
  pre.id = 'ergebnis';
  pre.textContent = zeilen.join('\n');
  root.append(pre);
  document.title = 'fertig';
}

async function los() {
  const root = document.getElementById('labor')!;
  const params = new URLSearchParams(location.search);
  const art = params.get('art') ?? 'aufdeckung';
  const seed = findPlayableSeed(Number(params.get('seed') ?? 2024));
  await Promise.all([preloadTiles(), preloadUnitSprites()]);
  if (art === 'relief') await relief(root, seed);
  else if (art === 'fluesse') await fluesse(root);
  else if (art === 'leistung') await leistung(root);
  else await aufdeckung(root, seed);
  document.body.dataset.fertig = '1';
  void hexDistance;
}

void los();
