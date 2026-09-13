/**
 * Figuren auf der Karte - Einheiten, Lager, Ruinen, Doerfer, Staedte, Strassen.
 *
 * PLATZHALTER aus Pixelkarten: jede Figur ist ein kleines Raster aus Zeichen,
 * gezeichnet im selben Kunstpixel wie die Kacheln. So sitzen sie im Pixelraster
 * der Karte, statt als glatte Vektoren darueberzuschweben.
 *
 * FARBE. 'p' ist die Farbe des Besitzers: die Spielerfarbe bei Rittern, Doerfern
 * und Staedten, die Fraktionsfarbe bei Raeubern, Goblins und Lagerwimpeln. 'P'
 * ist sie im Schatten, 'q' im Licht.
 *
 * STIL DER KACHELN. Doerfer und Staedte haben einen weichen, dunkelbraunen
 * Umriss statt Schwarz, Licht von links oben, Schatten rechts - wie die
 * Gelaendekacheln. Mittelalterlich: Fachwerk auf Steinsockel, Dach in
 * Spielerfarbe; die Stadt als Mauerring mit Tor, Turm und Wimpel.
 *
 * SPRITES FOLGEN. Liegt in src/assets/units eine Datei mit dem Namen der Art
 * (raeuber.png, goblin.png, ritter.png, wanderer.png, lager.png, ruine.png,
 * dorf.png, stadt.png, fackel.png, wimpel.png), wird sie statt des Platzhalters
 * gezeichnet - ohne Codeaenderung. Ebenso kampf.png fuer die Schwerter ueber
 * einem Kampf. Format: README dort.
 */

import type { UnitKind } from '../core/units';

export type FigurArt =
  | UnitKind
  | 'lager'
  | 'ruine'
  | 'dorf'
  | 'stadt'
  | 'dorfKlein'
  | 'stadtKlein'
  | 'turm'
  | 'lichtung'
  | 'fackel'
  | 'wimpel';

const PALETTE: Record<string, string> = {
  k: '#1b130d', // Umriss
  d: '#3a2a1e', // weicher Umriss, wie bei den Kacheln
  h: '#3a2a22', // Kapuze
  s: '#d9a066', // Haut
  r: '#9c3226', // Rot
  b: '#5e3d25', // Leder, Tuer
  B: '#3f2818', // dunkles Leder
  g: '#6aa83e', // Goblingruen
  G: '#3f6f24', // dunkles Gruen
  w: '#f2efe6', // Augen
  m: '#b9b3a6', // Stein im Licht
  M: '#857e70', // Stein im Schatten
  y: '#f2c94c', // Gold, erleuchtetes Fenster
  o: '#f08a24', // Flamme
  t: '#8a6a45', // Holz
  T: '#4f3a28', // Fachwerk, dunkles Holz
  c: '#e2d2ab', // Putz im Licht, Zeltstoff
  C: '#b39c73', // Putz im Schatten
  a: '#8d8a7e', // Wandermantel
  A: '#6a675d', // dunkler Mantel
  e: '#9a7b52', // festgetretene Erde
  E: '#6f5638', // Erde im Schatten
  f: '#c8ad7f', // helle Erde, Kiesel
};

/** Die Platzhalter. '.' ist durchsichtig. */
const ART: Record<FigurArt, readonly string[]> = {
  raeuber: [
    '..kkk..',
    '.khhhk.',
    'khhhhhk',
    'khssshk',
    '.kpppk.',
    'kbpppbk',
    'kbbbbbk',
    'ksbBbsk',
    '.kbBbk.',
    '.kb.bk.',
    '.kk.kk.',
  ],
  goblin: [
    'k.......k',
    'gk.kkk.kg',
    '.gkgggkg.',
    '..kwgwk..',
    '..kgggk..',
    '..kGpGk..',
    '.kbbbbbk.',
    'kgkbbbkgk',
    '..kbkbk..',
    '..kk.kk..',
  ],
  ritter: [
    '..kkk...',
    '.kmmmk..',
    '.kmMMk..',
    '.kmmmk..',
    'kkkkkkk.',
    'kppmppmk',
    'kpppppmk',
    'kppyppmk',
    '.kpppk..',
    '.kMkMk..',
    '.kMkMk..',
    '.kk.kk..',
  ],
  wanderer: [
    '..kkk....',
    '.kaaak..k',
    'kaaaaak.t',
    'kasssak.t',
    '.kAaAk..t',
    'kaaaaakst',
    'kaAaAak.t',
    'kaaaaak.t',
    'kaAaAak.t',
    '.kaaak..t',
    '.kb.bk..t',
    '.kk.kk..k',
  ],
  ruine: [
    '..k.....k..',
    '.kmk...kmk.',
    '.kmk...kMk.',
    '.kmk.k.kmk.',
    '.kmkkmkkmk.',
    '.kMkkmkkMk.',
    'kkkkkkkkkkk',
    'kMMMmMMMmMk',
    '.kkkkkkkkk.',
  ],
  lager: [
    '......k........',
    '......kpp......',
    '......kppp.....',
    '......k........',
    '.....kkk.......',
    '....kcckk......',
    '...kcctckk.T..T',
    '..kcctTtcckT..T',
    '.kcctTTTtcckTTT',
    'kkkkkkkkkkkkkTT',
    'TtTtT.....TtTtT',
    'TtTtT.....TtTtT',
    '.kkk.......kkk.',
  ],
  // Dorf: Fachwerkhaus auf Steinsockel, Satteldach in Spielerfarbe mit
  // Ziegelreihen, Schornstein, erleuchtete Fenster, Tuer.
  dorf: [
    '......ddd......',
    '.....dqpPd.....',
    '....dqppPPd.dd.',
    '...dqpppPPPdMd.',
    '..dqpPpPpPPPdd.',
    '.dqppppppPPPPd.',
    'dqpPpPpPpPpPPPd',
    'ddddddddddddddd',
    '.dcTcccTcccTCd.',
    '.dcTcyyTyycTCd.',
    '.dTTTTTTTTTTTd.',
    '.dcTccdddcCTCd.',
    '.dcTccdbdcCTCd.',
    '.dmMmmdbdmMmMd.',
    '.ddddddddddddd.',
  ],
  // Stadt: Mauerring mit Zinnen und Tor, dahinter Turm mit Wimpel und ein
  // Fachwerkhaus - groesser als das Dorf, damit man es auch klein erkennt.
  stadt: [
    '....d................',
    '....dpp..............',
    '....dppp.............',
    '....d................',
    '..ddddddd............',
    '..dmdmdmd.....ddd....',
    '..dmmmmMd....dqpPd...',
    '..dmyymMd...dqppPPd..',
    '..dmyymMd..dqpPpPPPd.',
    '..dmmmmMd.dqppppPPPPd',
    '..dmmmmMddddddddddddd',
    '..dmmmmMd.dcTccTcCTd.',
    '..dmmmmMd.dcTyyTyCTd.',
    'ddddddddddddddddddddd',
    'dmMmdmMmdmMmdmMmdmMmd',
    'dmmmmmmmmmdddmmmmmmMd',
    'dmmMmmmmmdbbbdmmmMmMd',
    'dmmmmmMmmdbbbdmMmmmMd',
    'ddddddddddddddddddddd',
  ],
  // Der Held: Krone, Umhang in Spielerfarbe, Ruestung mit Goldschnalle.
  held: [
    '...yyy...',
    '..kyyyk..',
    '..ksssk..',
    '.pkssskp.',
    'pppkkkppp',
    'pPmmymmPp',
    'pPmmmmmPp',
    'pPkmmmkPp',
    '.PkmmmkP.',
    '..kbkbk..',
    '..kb.bk..',
    '..kk.kk..',
  ],
  // Kleines Dorf: dasselbe Fachwerkhaus, auf die Ecke zwischen drei Kacheln
  // verkleinert, damit es nicht ueber die Nachbarfelder ragt.
  dorfKlein: [
    '....ddd....',
    '...dqpPd...',
    '..dqppPPd..',
    '.dqpPpPPPd.',
    'dqppppPPPPd',
    'ddddddddddd',
    '.dcTyycTCd.',
    '.dcTcdbdCd.',
    '.dmMmdbdMd.',
    '.ddddddddd.',
  ],
  // Kleine Stadt: Turm mit Wimpel, ein Dach hinter der Mauer, Tor.
  stadtKlein: [
    '...d...........',
    '...dpp.........',
    '...dppp........',
    '...d...........',
    '.ddddd.........',
    '.dmdmd...ddd...',
    '.dmyMd..dqpPd..',
    '.dmmMd.dqppPPd.',
    '.dmmMdddddddddd',
    'dmdmdmdmdmdmdmd',
    'dmMmmMdddmMmmMd',
    'dmmmMmdbdmmMmMd',
    'dmMmmmdbdmMmmMd',
    'ddddddddddddddd',
  ],
  // Wachturm: Steinturm mit Feuerschale oben und Band in Spielerfarbe.
  turm: [
    '...o...',
    '..oyo..',
    '.dMoMd.',
    '.dmmMd.',
    'ddddddd',
    '.dmmMd.',
    '.dmyMd.',
    '.dmmMd.',
    '.dpPPd.',
    '.dmmMd.',
    '.dmMMd.',
    'dmmmMMd',
    'ddddddd',
  ],
  // Lichtung unter einem Gebaeude: festgetretene Erde, wie die Wege.
  lichtung: [
    '....EEEEEEE....',
    '.EEEeeeeeeeEEE.',
    'EeeeefeeeeeEeeE',
    '.EEEeeeeeeeEEE.',
    '....EEEEEEE....',
  ],
  // Fackel, die Einheiten nachts tragen.
  fackel: ['.o.', 'oyo', '.o.', '.t.', '.t.', '.T.'],
  // Wimpel in Spielerfarbe an einer Strasse - wem sie gehoert.
  wimpel: ['tpp.', 'tPpp', 'tpp.', 't...', 't...', 'T...'],
};

const SPRITE_URLS = import.meta.glob('../assets/units/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const SPRITES = new Map<string, HTMLImageElement>();

/** Die Adresse eines gelieferten Sprites, oder null, solange es fehlt. */
export function spriteUrl(name: string): string | null {
  for (const [pfad, url] of Object.entries(SPRITE_URLS)) {
    if (pfad.endsWith(`/${name}.png`)) return url;
  }
  return null;
}

/** Vorhandene Sprites laden. Fehlt der Ordner oder eine Datei, bleibt der Platzhalter. */
export function preloadUnitSprites(): Promise<void> {
  return Promise.all(
    Object.entries(SPRITE_URLS).map(
      ([pfad, url]) =>
        new Promise<void>((fertig) => {
          const name = pfad.slice(pfad.lastIndexOf('/') + 1).replace(/\.png$/i, '');
          const img = new Image();
          img.onload = () => {
            SPRITES.set(name, img);
            fertig();
          };
          img.onerror = () => fertig();
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}

const hex2 = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');

/** Eine Farbe #rrggbb zu Schwarz (ziel 0) oder Weiss (ziel 255) hin verschieben. */
function mische(farbe: string, ziel: number, anteil: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(farbe);
  if (!m) return farbe;
  return (
    '#' +
    [m[1]!, m[2]!, m[3]!]
      .map((h) => {
        const v = parseInt(h, 16);
        return hex2(Math.round(v + (ziel - v) * anteil));
      })
      .join('')
  );
}
export const dunkler = (farbe: string): string => mische(farbe, 0, 0.35);
export const heller = (farbe: string): string => mische(farbe, 255, 0.35);

/**
 * Vorgezeichnete Figuren je Art, Farbe und Groesse.
 *
 * Im Aufbau stehen siebzig Vorschau-Doerfer auf der Karte, und jede
 * Zeigerbewegung zeichnet neu - Pixel fuer Pixel waeren das zehntausende
 * fillRect je Bild. Einmal auf ein kleines Canvas gezeichnet, ist jede Figur
 * danach ein einziges drawImage.
 */
const BILDER = new Map<string, HTMLCanvasElement>();
const BILDER_MAX = 400;

function figurBild(art: FigurArt, grund: string, f: number): HTMLCanvasElement {
  const schluessel = `${art}|${grund}|${f}`;
  const da = BILDER.get(schluessel);
  if (da) return da;
  const karte = ART[art];
  const breite = Math.max(...karte.map((z) => z.length));
  const c = document.createElement('canvas');
  c.width = breite * f;
  c.height = karte.length * f;
  const g = c.getContext('2d')!;
  const schatten = dunkler(grund);
  const licht = heller(grund);
  for (let zy = 0; zy < karte.length; zy++) {
    const zeile = karte[zy]!;
    for (let zx = 0; zx < zeile.length; zx++) {
      const ch = zeile[zx]!;
      if (ch === '.') continue;
      g.fillStyle =
        ch === 'p' ? grund : ch === 'P' ? schatten : ch === 'q' ? licht : (PALETTE[ch] ?? '#ff00ff');
      g.fillRect(zx * f, zy * f, f, f);
    }
  }
  if (BILDER.size >= BILDER_MAX) BILDER.clear();
  BILDER.set(schluessel, c);
  return c;
}

/**
 * Eine Figur zeichnen.
 *
 * (fx, fy) sind die Fuesse in Geraetepixeln, f die Geraetepixel je Kunstpixel.
 * Anker unten mittig: die unterste Reihe steht auf dem Punkt, egal wie gross
 * die Figur oder das spaetere Sprite ist.
 */
export function zeichneFigur(
  ctx: CanvasRenderingContext2D,
  art: FigurArt,
  fx: number,
  fy: number,
  f: number,
  farbe?: string,
): void {
  const sprite = SPRITES.get(art);
  if (sprite) {
    const w = sprite.naturalWidth;
    const h = sprite.naturalHeight;
    ctx.drawImage(sprite, fx - Math.floor(w / 2) * f, fy - (h - 1) * f, w * f, h * f);
    return;
  }

  const karte = ART[art];
  const breite = Math.max(...karte.map((z) => z.length));
  const x0 = fx - Math.floor(breite / 2) * f;
  const y0 = fy - (karte.length - 1) * f;

  // Ein Pixelstreifen Schatten unter den Fuessen.
  if (art !== 'fackel' && art !== 'wimpel' && art !== 'lichtung') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(x0 + f, fy + f, Math.max(1, breite - 2) * f, f);
  }
  ctx.drawImage(figurBild(art, farbe ?? '#9c3226', f), x0, y0);
}

/**
 * Ein Dorf, eine Stadt oder ein Wachturm auf seiner Ecke, in Geraetepixeln.
 *
 * (x, y) ist die Ecke selbst. Frueher stand hier das grosse Haus (15 x 15, die
 * Stadt 21 x 19) mit den Fuessen knapp unter der Ecke - es ragte weit ueber die
 * drei Nachbarfelder. Jetzt steht ein kompaktes Haus (11 x 10, die Stadt
 * 15 x 14) auf einem Fleck festgetretener Erde: es bleibt ueber der Ecke, deckt
 * wenig, und die Lichtung erdet es auf der Kachel. Die Varianten zum Vergleich:
 * labor.html?art=gebaeude. Der Wachturm steht rechts hinter dem Haus.
 * PLATZHALTER (ASSETS.md).
 */
export function zeichneGebaeude(
  ctx: CanvasRenderingContext2D,
  art: 'dorf' | 'stadt' | 'turm',
  x: number,
  y: number,
  f: number,
  farbe: string,
  turm = false,
): void {
  const fy = y + 3 * f;
  if (art === 'turm') {
    zeichneFigur(ctx, 'turm', x + 8 * f, fy - 2 * f, f, farbe);
    return;
  }
  zeichneFigur(ctx, 'lichtung', x, fy + f, f);
  if (turm) zeichneFigur(ctx, 'turm', x + 8 * f, fy - 2 * f, f, farbe);
  zeichneFigur(ctx, art === 'stadt' ? 'stadtKlein' : 'dorfKlein', x, fy, f, farbe);
}

export type Strassenstueck = {
  a: { x: number; y: number };
  b: { x: number; y: number };
  farbe: string;
  /** Abgebrannt: nur noch Asche und Glut, kein Wimpel. */
  verbrannt?: boolean;
};

/**
 * Strassen als Feldweg entlang der Feldkante, in Geraetepixeln.
 *
 * Wie ein Pfad auf den Kacheln: dunkler, weicher Rand, festgetretene Erde,
 * einzelne Steine. Schritt fuer Schritt ein Kunstpixel weit, auf das
 * Kunstpixelraster gerundet, so bekommt die schraege Kante dieselben
 * Treppenstufen wie die Kacheln. Wem die Strasse gehoert, zeigt ein Wimpel in
 * Spielerfarbe in ihrer Mitte - der Weg selbst bleibt Weg.
 *
 * Erst alle Raender, dann alle Wege: wo Strassen sich treffen, fliessen sie
 * ineinander. PLATZHALTER (ASSETS.md).
 */
export function zeichneStrassen(
  ctx: CanvasRenderingContext2D,
  stuecke: readonly Strassenstueck[],
  f: number,
): void {
  const punkte = (s: Strassenstueck) => {
    const n = Math.max(1, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / f));
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      out.push({
        x: Math.round((s.a.x + ((s.b.x - s.a.x) * i) / n) / f) * f,
        y: Math.round((s.a.y + ((s.b.y - s.a.y) * i) / n) / f) * f,
      });
    }
    return out;
  };
  const alle = stuecke.map((s) => ({ s, p: punkte(s) }));

  for (const { s, p } of alle) {
    ctx.fillStyle = s.verbrannt ? '#1f1813' : '#3a2a1e';
    for (const q of p) ctx.fillRect(q.x - 2 * f, q.y - 2 * f, 5 * f, 5 * f);
  }
  for (const { s, p } of alle) {
    ctx.fillStyle = s.verbrannt ? '#3d342d' : '#9a7b52';
    for (const q of p) ctx.fillRect(q.x - f, q.y - f, 3 * f, 3 * f);
  }
  for (const { s, p } of alle) {
    p.forEach((q, i) => {
      if (i % 3 !== 1) return;
      const hell = i % 2 === 1;
      // Asche: verkohlte Bohlen und hier und da Glut.
      ctx.fillStyle = s.verbrannt ? (hell ? '#b8481f' : '#141010') : hell ? '#c8ad7f' : '#6f5638';
      ctx.fillRect(q.x + (hell ? 0 : -f), q.y + (hell ? -f : f), f, f);
    });
  }
  for (const { s, p } of alle) {
    if (s.verbrannt) continue;
    const m = p[Math.floor(p.length / 2)]!;
    zeichneFigur(ctx, 'wimpel', m.x + 3 * f, m.y + f, f, s.farbe);
  }
}

/** Wie hoch eine Figur ist, in Kunstpixeln. */
export function figurHoehe(art: FigurArt): number {
  const sprite = SPRITES.get(art);
  return sprite ? sprite.naturalHeight : ART[art].length;
}

/**
 * Leben ueber dem Kopf eines Verwundeten: ein Kunstpixel je Leben, rot fuer
 * uebrige, dunkel fuer verlorene. Unverletzte bekommen keine Anzeige - sonst
 * steht ueber jeder Figur ein Balken. PLATZHALTER (ASSETS.md).
 */
export function zeichneLeben(
  ctx: CanvasRenderingContext2D,
  art: FigurArt,
  fx: number,
  fy: number,
  f: number,
  leben: number,
  max: number,
): void {
  const y = fy - (figurHoehe(art) + 1) * f;
  const breite = max * 2 - 1;
  const x0 = fx - Math.floor(breite / 2) * f;
  ctx.fillStyle = '#1b130d';
  ctx.fillRect(x0 - f, y - f, (breite + 2) * f, 3 * f);
  for (let i = 0; i < max; i++) {
    ctx.fillStyle = i < leben ? '#e0473a' : '#4a3a30';
    ctx.fillRect(x0 + i * 2 * f, y, f, f);
  }
}

/**
 * Wo Figuren auf einem Feld stehen, in Kunstpixeln relativ zur Feldmitte. Auf
 * einem Lager stehen sie davor, damit das Lager sichtbar bleibt. Ab vier
 * Figuren stehen die ersten beiden links, die naechsten rechts - wer nach Seite
 * sortiert zeichnet, bekommt so zwei Reihen, die einander gegenueberstehen.
 */
export function aufstellung(anzahl: number, lager: boolean): ReadonlyArray<readonly [number, number]> {
  if (lager) {
    if (anzahl <= 2) return [[-6, 6], [6, 6]];
    if (anzahl === 3) return [[-7, 5], [7, 5], [0, 8]];
    return [[-9, 4], [-6, 9], [9, 4], [6, 9], [0, 11]];
  }
  if (anzahl <= 1) return [[0, 4]];
  if (anzahl === 2) return [[-4, 3], [4, 5]];
  if (anzahl === 3) return [[-5, 2], [5, 2], [0, 6]];
  return [[-7, 1], [-5, 6], [7, 1], [5, 6], [0, 9]];
}
