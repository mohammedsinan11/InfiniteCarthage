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
 *   /labor.html?art=gebaeude     Dorf und Stadt: wie sie auf den Kacheln liegen
 *   /labor.html?art=schaerfe     Kachelabstand: heute, gerastet, wie hexmap
 *
 * Gezeichnet wird wie auf dem Brett (board/Board.tsx): Kacheln zeilenweise von
 * hinten nach vorn, jede auf ihrer Hoehe, im selben Kunstpixelraster.
 */

import { createWorld, ensureGenerated } from '../core/world';
import type { World } from '../core/world';
import { fieldsAt, findPlayableSeed } from '../core/worldgen';
import { reliefLimitedAt } from '../core/relief';
import {
  edgeAdjacentHexes,
  edgeEndpoints,
  hexDistance,
  hexEdges,
  hexKey,
  hexToPixel,
  hexesInRange,
  neighbors,
  parseVertexKey,
  vertexAdjacentHexes,
  vertexKey,
  vertexToPixel,
} from '../core/coords';
import type { Vertex } from '../core/coords';
import type { Hex, Layout } from '../core/coords';
import { hash3i } from '../core/hash';
import { nestAt } from '../core/raiders';
import { ruinAt } from '../core/ruins';
import { HEX_CX, HEX_CY, IMG_H, IMG_W, SCHRITT_X, SCHRITT_Y, preloadTiles, tileImage, tileUrl } from '../client/tiles';
import { preloadUnitSprites, zeichneFigur, zeichneGebaeude, zeichneStrassen } from '../client/units';
import type { FigurArt } from '../client/units';

/** Wie auf dem Brett: Welteinheiten je Kunstpixel. */
const SCALE = 2;
const LAYOUT: Layout = { w: SCHRITT_X * SCALE, h: (SCHRITT_Y / 0.75) * SCALE };
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

// --- Gebaeude ------------------------------------------------------------------

type GebaeudeStil = {
  titel: string;
  text: string;
  klein: boolean;
  /** zuletzt: nach allen Kacheln. dahinter: vor der vorderen Kachel. davor: nach ihr. */
  reihe: 'zuletzt' | 'dahinter' | 'davor';
  lichtung: boolean;
  /** Wie viele Kunstpixel unter der Ecke die Fuesse stehen. */
  tiefer: number;
};

async function gebaeude(root: HTMLElement, seed: number) {
  const reihe = kopf(
    root,
    'Dorf und Stadt: wie sie auf den Kacheln liegen',
    'Zwei Ausschnitte - offenes Land und Wald - in vier Arten. Die Stadt traegt einen Wachturm, zwei Strassen fuehren zu den Doerfern. Kunstpixel der Kacheln, vierfach vergroessert (im Spiel beim Start: zweifach).',
  );
  const w = welt(seed, 12);
  const terrainBei = (q: number, r: number) => w.tiles.get(hexKey(q, r))?.terrain;
  const frei = (q: number, r: number) => {
    const t = terrainBei(q, r);
    return t !== undefined && t !== 'water' && !nestAt(seed, q, r) && !ruinAt(seed, q, r);
  };
  const waelder = (h: { q: number; r: number }) =>
    hexesInRange(h, 2).filter((x) => terrainBei(x.q, x.r) === 'forest').length;
  const kandidaten = [...w.tiles.values()].filter(
    (t) => hexDistance(t, ORIGIN) <= 9 && hexesInRange(t, 2).every((x) => frei(x.q, x.r)),
  );
  const offen = [...kandidaten].sort((a, b) => waelder(a) - waelder(b))[0] ?? { q: 0, r: 0 };
  const wald = [...kandidaten].sort((a, b) => waelder(b) - waelder(a))[0] ?? { q: 0, r: 0 };

  const stile: GebaeudeStil[] = [
    { titel: 'Heute', text: 'grosses Haus ueber der Ecke, nach allen Kacheln - ragt ueber die Nachbarfelder', klein: false, reihe: 'zuletzt', lichtung: false, tiefer: 4 },
    { titel: 'A: Kompakt', text: 'dasselbe Haus, kleiner, ueber der Ecke', klein: true, reihe: 'zuletzt', lichtung: false, tiefer: 3 },
    { titel: 'B: Kompakt auf Lichtung', text: 'kompakt, steht auf einem Fleck Erde - geerdet, nichts verdeckt es', klein: true, reihe: 'zuletzt', lichtung: true, tiefer: 3 },
    { titel: 'C: Im Feld', text: 'kompakt auf der vorderen Kachel, knapp unter der Ecke - Baeume weiter vorn stehen davor', klein: true, reihe: 'davor', lichtung: true, tiefer: 7 },
  ];

  for (const [name, mitte] of [['Offenes Land', offen], ['Wald', wald]] as const) {
    for (const stil of stile) reihe.append(gebaeudeBild(seed, w, mitte, stil, name));
  }
}

function gebaeudeBild(
  seed: number,
  w: World,
  mitte: { q: number; r: number },
  stil: GebaeudeStil,
  szene: string,
): HTMLElement {
  const kacheln = [...w.tiles.values()]
    .filter((t) => hexDistance(t, mitte) <= 2)
    .sort((a, b) => a.r - b.r || a.q - b.q);
  const ecke = (q: number, r: number, d: 'N' | 'S'): Vertex => parseVertexKey(vertexKey({ q, r, d }));
  const bauten: { v: Vertex; art: 'dorf' | 'stadt'; turm: boolean }[] = [
    { v: ecke(mitte.q, mitte.r, 'N'), art: 'dorf', turm: false },
    { v: ecke(mitte.q + 1, mitte.r, 'S'), art: 'stadt', turm: true },
    { v: ecke(mitte.q - 1, mitte.r + 1, 'S'), art: 'dorf', turm: false },
  ];
  const kanten = hexEdges(mitte.q, mitte.r).filter((e) => {
    const [a, b] = edgeEndpoints(e).map(vertexKey);
    return bauten.some((x) => vertexKey(x.v) === a || vertexKey(x.v) === b);
  });
  const farbe = '#3a7ac2';

  const dpr = window.devicePixelRatio || 1;
  const kunst = Math.round(4 * dpr);
  const k = kunst / SCALE;
  const lift = (q: number, r: number) => liftVon(seed, q, r, 1.5);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of kacheln) {
    const p = hexToPixel(t.q, t.r, LAYOUT);
    minX = Math.min(minX, p.x - IMG.dx);
    maxX = Math.max(maxX, p.x - IMG.dx + IMG.w);
    minY = Math.min(minY, p.y - IMG.dy - lift(t.q, t.r) - 20);
    maxY = Math.max(maxY, p.y - IMG.dy - lift(t.q, t.r) + IMG.h);
  }
  const geraet = (x: number, y: number) => ({ x: Math.round((x - minX) * k), y: Math.round((y - minY) * k) });
  const mittelLift = (hs: { q: number; r: number }[]) => hs.reduce((n, h) => n + lift(h.q, h.r), 0) / hs.length;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxX - minX) * k);
  canvas.height = Math.ceil((maxY - minY) * k);
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const vorn = (hs: { r: number }[]) => Math.max(...hs.map((h) => h.r));
  const reiheVon = (hs: { r: number }[]) =>
    stil.reihe === 'zuletzt' ? Infinity : stil.reihe === 'dahinter' ? vorn(hs) - 1 : vorn(hs);

  const strasse = (e: (typeof kanten)[number]) => {
    const [a, b] = edgeEndpoints(e).map((v) => {
      const p = vertexToPixel(v, LAYOUT);
      return geraet(p.x, p.y - mittelLift(vertexAdjacentHexes(v)));
    });
    zeichneStrassen(ctx, [{ a: a!, b: b!, farbe }], kunst);
  };
  const bau = (b: (typeof bauten)[number]) => {
    const hs = vertexAdjacentHexes(b.v);
    const p = vertexToPixel(b.v, LAYOUT);
    const vordere = hs.filter((h) => h.r === vorn(hs));
    const hoch = stil.reihe === 'davor' ? mittelLift(vordere) : mittelLift(hs);
    const d = geraet(p.x, p.y - hoch);
    const fy = d.y + stil.tiefer * kunst;
    if (stil.lichtung) zeichneFigur(ctx, 'lichtung', d.x, fy + kunst, kunst);
    const art: FigurArt = stil.klein ? (b.art === 'dorf' ? 'dorfKlein' : 'stadtKlein') : b.art;
    if (b.turm) zeichneFigur(ctx, 'turm', d.x + (stil.klein ? 8 : 11) * kunst, fy - 2 * kunst, kunst, farbe);
    zeichneFigur(ctx, art, d.x, fy, kunst, farbe);
  };

  const zeilen = [...new Set(kacheln.map((t) => t.r))].sort((a, b) => a - b);
  for (const zr of zeilen) {
    for (const t of kacheln.filter((x) => x.r === zr)) {
      const url = tileUrl(seed, t.terrain, t.q, t.r);
      const img = url ? tileImage(url) : undefined;
      if (!img) continue;
      const p = hexToPixel(t.q, t.r, LAYOUT);
      const o = geraet(p.x - IMG.dx, p.y - IMG.dy - lift(t.q, t.r));
      ctx.drawImage(img, o.x, o.y, Math.round(IMG.w * k), Math.round(IMG.h * k));
    }
    for (const e of kanten) if (reiheVon(edgeAdjacentHexes(e)) === zr) strasse(e);
    for (const b of bauten) if (reiheVon(vertexAdjacentHexes(b.v)) === zr) bau(b);
  }
  for (const e of kanten) if (reiheVon(edgeAdjacentHexes(e)) === Infinity) strasse(e);
  for (const b of [...bauten].sort((x, y) => vertexToPixel(x.v, LAYOUT).y - vertexToPixel(y.v, LAYOUT).y)) {
    if (reiheVon(vertexAdjacentHexes(b.v)) === Infinity) bau(b);
  }

  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.innerHTML = `<b>${szene} · ${stil.titel}</b><br>${stil.text}`;
  cap.style.maxWidth = `${canvas.width / dpr}px`;
  fig.append(cap, canvas);
  return fig;
}

// --- Schaerfe ------------------------------------------------------------------

type Abstand = {
  titel: string;
  text: string;
  /** Spaltenschritt und Zeilenschritt in Kunstpixeln. */
  sx: number;
  sy: number;
  /** Auf ganze Kunstpixel gerastet - oder wie heute auf Geraetepixel gerundet. */
  raster: boolean;
};

/**
 * Wie scharf die Karte ist, haengt am Kachelabstand.
 *
 * Die Kacheln aus hexmap sind fuer 23 Spalten- und 17 Zeilenpixel gezeichnet
 * (hexmap/map.py). Das Brett legt sie mit 24 und 18,75: jede Zeile landet
 * zwischen den Kunstpixeln, und wo zwei Kacheln aneinanderstossen, sitzen ihre
 * Pixel gegeneinander verschoben. Diese Seite zeigt denselben Ausschnitt in drei
 * Abstaenden, bei zwei Zoomstufen, und daneben die Naht vergroessert.
 */
async function schaerfe(root: HTMLElement, seed: number) {
  const reihe = kopf(
    root,
    'Schaerfe der Karte: der Abstand der Kacheln',
    'Derselbe Ausschnitt in drei Kachelabstaenden, mit zwei Doerfern, einer Stadt mit Wachturm, Strassen und dem Helden. Links das Bild in Spielgroesse, rechts ein Ausschnitt dreifach vergroessert - dort sieht man, wie Kacheln und Bauten aufeinandertreffen. Oben zwei Geraetepixel je Kunstpixel (Rechner beim Start), unten drei (Handy).',
  );
  const w = welt(seed, 8);
  const vielfalt = (h: { q: number; r: number }) =>
    new Set(hexesInRange(h, 2).map((x) => w.tiles.get(hexKey(x.q, x.r))?.terrain)).size;
  const mitte = [...w.tiles.values()]
    .filter((t) => hexDistance(t, ORIGIN) <= 4)
    .sort((a, b) => vielfalt(b) - vielfalt(a))[0] ?? { q: 0, r: 0 };
  const kacheln = [...w.tiles.values()]
    .filter((t) => hexDistance(t, mitte) <= 3)
    .sort((a, b) => a.r - b.r || a.q - b.q);
  const abstaende: Abstand[] = [
    { titel: 'Heute: 24 x 18,75', text: 'Zeilen zwischen den Kunstpixeln, auf Geraetepixel gerundet', sx: 24, sy: 18.75, raster: false },
    { titel: 'A: 24 x 19, gerastet', text: 'jede Kachel auf ganzen Kunstpixeln, Abstand fast wie heute', sx: 24, sy: 19, raster: true },
    { titel: 'B: 23 x 17 wie hexmap', text: 'der Abstand, fuer den die Kacheln gezeichnet sind - die Karte wird etwas dichter', sx: 23, sy: 17, raster: true },
  ];
  for (const f of [2, 3]) {
    for (const a of abstaende) reihe.append(abstandBild(seed, kacheln, mitte, a, f));
  }
}

function abstandBild(
  seed: number,
  kacheln: { q: number; r: number; terrain: import('../core/types').Terrain }[],
  mitte: { q: number; r: number },
  a: Abstand,
  f: number,
): HTMLElement {
  const liftKunst = (q: number, r: number) => liftVon(seed, q, r, 1.5) / SCALE;
  /** Linke obere Ecke des Kachelbilds in Kunstpixeln (Bruch, falls nicht gerastet). */
  const ecke = (q: number, r: number) => {
    if (!a.raster) {
      // Wie das Brett: Mittelpunkt aus dem Layout, Bild um HEX_CX/HEX_CY versetzt.
      return { x: a.sx * (q + r / 2) - HEX_CX, y: a.sy * r - HEX_CY - liftKunst(q, r) };
    }
    const x = a.sx === 23 ? 23 * q + Math.ceil(11.5 * r) : a.sx * q + (a.sx / 2) * r;
    return { x: x - HEX_CX, y: Math.round(a.sy * r - HEX_CY) - liftKunst(q, r) };
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of kacheln) {
    const e = ecke(t.q, t.r);
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + IMG_W);
    maxY = Math.max(maxY, e.y + IMG_H);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxX - minX) * f);
  canvas.height = Math.ceil((maxY - minY) * f);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (const t of kacheln) {
    const url = tileUrl(seed, t.terrain, t.q, t.r);
    const img = url ? tileImage(url) : undefined;
    if (!img) continue;
    const e = ecke(t.q, t.r);
    const x = a.raster ? Math.round(e.x - Math.floor(minX)) * f : Math.round((e.x - minX) * f);
    const y = a.raster ? Math.round(e.y - Math.floor(minY)) * f : Math.round((e.y - minY) * f);
    ctx.drawImage(img, x, y, IMG_W * f, IMG_H * f);
  }
  /*
   * Bauten wie im Spiel: Ecken liegen im Mittel ihrer drei Felder - fuer jeden
   * Abstand aus denselben Kachelpositionen gerechnet, mit denen gezeichnet wurde.
   * So sieht man, wie Doerfer, Stadt, Strassen und der Held in jedem Abstand
   * auf den Kacheln sitzen.
   */
  const geraetVon = (ax: number, ay: number) => ({
    x: a.raster ? Math.round(ax - Math.floor(minX)) * f : Math.round((ax - minX) * f),
    y: a.raster ? Math.round(ay - Math.floor(minY)) * f : Math.round((ay - minY) * f),
  });
  const mitteVon = (q: number, r: number) => {
    const e = ecke(q, r);
    return { x: e.x + HEX_CX, y: e.y + HEX_CY };
  };
  const eckePunkt = (v: Vertex) => {
    const hs = vertexAdjacentHexes(v).map((h) => mitteVon(h.q, h.r));
    const x = hs.reduce((n, p) => n + p.x, 0) / hs.length;
    const y = hs.reduce((n, p) => n + p.y, 0) / hs.length;
    return geraetVon(x, y);
  };
  const eckeAus = (q: number, r: number, d: 'N' | 'S') => parseVertexKey(vertexKey({ q, r, d }));
  const blau = '#3a7ac2';
  const bauten = [
    { v: eckeAus(mitte.q, mitte.r, 'N'), art: 'dorf' as const, turm: false },
    { v: eckeAus(mitte.q + 1, mitte.r, 'S'), art: 'stadt' as const, turm: true },
    { v: eckeAus(mitte.q - 1, mitte.r + 1, 'S'), art: 'dorf' as const, turm: false },
  ];
  const strassen = hexEdges(mitte.q, mitte.r)
    .filter((e) => {
      const [p, o] = edgeEndpoints(e).map(vertexKey);
      return bauten.some((b) => vertexKey(b.v) === p || vertexKey(b.v) === o);
    })
    .map((e) => {
      const [p, o] = edgeEndpoints(e).map(eckePunkt);
      return { a: p!, b: o!, farbe: blau };
    });
  zeichneStrassen(ctx, strassen, f);
  for (const b of [...bauten].sort((x, y) => eckePunkt(x.v).y - eckePunkt(y.v).y)) {
    const p = eckePunkt(b.v);
    zeichneGebaeude(ctx, b.art, p.x, p.y, f, blau, b.turm);
  }
  const heldFeld = mitteVon(mitte.q + 1, mitte.r + 1);
  const heldPunkt = geraetVon(heldFeld.x, heldFeld.y + 4);
  zeichneFigur(ctx, 'held', heldPunkt.x, heldPunkt.y, f, blau);

  // Ausschnitt um die Mitte, dreifach vergroessert.
  const m = ecke(mitte.q, mitte.r);
  const ax = Math.max(0, Math.round((m.x - minX - 8) * f));
  const ay = Math.max(0, Math.round((m.y - minY - 4) * f));
  const breite = 44 * f;
  const hoehe = 34 * f;
  const lupe = document.createElement('canvas');
  lupe.width = breite * 3;
  lupe.height = hoehe * 3;
  const l = lupe.getContext('2d')!;
  l.imageSmoothingEnabled = false;
  l.drawImage(canvas, ax, ay, breite, hoehe, 0, 0, breite * 3, hoehe * 3);
  const rahmen = canvas.getContext('2d')!;
  rahmen.strokeStyle = '#ffe08a';
  rahmen.lineWidth = 2;
  rahmen.strokeRect(ax, ay, breite, hoehe);

  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.innerHTML = `<b>${a.titel}</b> · ${f} Geraetepixel je Kunstpixel<br>${a.text}`;
  const zeile = document.createElement('div');
  zeile.style.display = 'flex';
  zeile.style.gap = '8px';
  zeile.style.alignItems = 'flex-start';
  zeile.append(canvas, lupe);
  fig.append(cap, zeile);
  return fig;
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
  else if (art === 'gebaeude') await gebaeude(root, seed);
  else if (art === 'schaerfe') await schaerfe(root, seed);
  else await aufdeckung(root, seed);
  document.body.dataset.fertig = '1';
  void hexDistance;
}

void los();
