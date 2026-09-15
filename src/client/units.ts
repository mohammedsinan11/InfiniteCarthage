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
  // Bogenschuetze: Lederkapuze, Wams in Spielerfarbe, rechts der Bogen. PLATZHALTER (ASSETS.md).
  bogen: [
    '..kkk....',
    '.kbbbk.k.',
    '.kbssk..t',
    '..kssk..t',
    '.kppppk.t',
    'kpppppskt',
    'kpppppk.t',
    '.kpppk..t',
    '.kbbbk.k.',
    '.kBkBk...',
    '.kBkBk...',
    '.kk.kk...',
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
 * 15 x 14) ueber der Ecke und deckt wenig (Variante A). Eine Fassung mit
 * Lichtung darunter (B) war die erste Wahl - ohne wirkt es ruhiger. Die
 * Varianten zum Vergleich: labor.html?art=gebaeude. Der Wachturm steht rechts
 * hinter dem Haus.
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
  if (turm) zeichneFigur(ctx, 'turm', x + 8 * f, fy - 2 * f, f, farbe);
  zeichneFigur(ctx, art === 'stadt' ? 'stadtKlein' : 'dorfKlein', x, fy, f, farbe);
}

/*
 * Die Hauptstadt, Stufe I: eine Burg in der Mitte des Feldes, das drei Staedte
 * umschliessen. Bergfried, zwei Tuerme, Mauer mit Tor, Fahne in Spielerfarbe.
 * Linke Haelfte samt Mittelspalte, gespiegelt - rechts im Schatten.
 */
const BURG_HAELFTE = [
  '..........d', '..........d', '........ddd', '........dmd', '........dmm', '........dmy',
  '...ddd..dmm', '...dpd..dmm', '..dmmmd.dmy', '..dmymd.dmm', '..dmmmd.dmm', '..dmmmddddd',
  '..dmdmdmdmd', '..dmmmmmmmm', '..dmmmmmddd', '..dmmmmmdbb', '..dmmmmmdbb', '..ddddddddd',
];
const SCHATTEN_SEITE: Record<string, string> = { m: 'M', p: 'P', q: 'p', x: 'X' };
const spiegeln = (haelfte: readonly string[]) =>
  haelfte.map((z) => z + [...z.slice(0, -1)].reverse().map((c) => SCHATTEN_SEITE[c] ?? c).join(''));
const BURG = spiegeln(BURG_HAELFTE);
const BURG_FAHNE = ['dpp.', 'dPpp', 'dpp.'];

/*
 * Stufe II, Festungsring: in der Mitte ein Palast, der das Feld fuellt - hoher
 * Bergfried mit Turmdach (x, Farbe nach Gelaende), zwei Seitentuerme mit
 * Daechern in Spielerfarbe, Fluegel mit Tor. An den Ecken Bastionen statt der
 * Staedte, auf den Kanten Mauer (zeichneMauern).
 */
const PALAST = spiegeln([
  '..........d', '..........d', '.........dx', '.........dx', '........dxx', '........dxx', '.......dxxx',
  '........ddd', '........dmd', '........dmm', '........dmy', '....d...dmm', '...dqd..dmm', '..dqppd.dmy',
  '..ddddd.dmm', '..dmymd.dmm', '..dmmmddddd', 'ddddddmdmdm', 'dmmmmdmmmmm', 'dmymmdmyymm', 'dmmmmdmmmmm',
  'dmmmmdmmddd', 'dmMmmdmmdbb', 'dmmmmdmmdbb', 'ddddddddddd',
]);
const BASTION = spiegeln(['d.d.d', 'ddddd', 'dmmmm', 'dmmym', 'dmmmm', 'dpppp', 'dmmmm', 'dmMmm', 'dmmmm', 'ddddd']);

/**
 * Stein je Kachelsorte (tiles.ts, kachelSorte): die Hauptstadt nimmt die Farbe
 * ihres Gelaendes an - Sandstein in der Wueste, Ziegel auf Lehm, Granit im
 * Gebirge, bemooster Stein in Wald und Sumpf. Fehlt eine Sorte, bleibt es der
 * graue Stein der Staedte. PLATZHALTER (ASSETS.md).
 */
export const STEIN_JE_SORTE: Record<string, { hell: string; dunkel: string }> = {
  forest: { hell: '#a8aa8c', dunkel: '#6f7456' },
  taiga: { hell: '#c4c8cc', dunkel: '#848c96' },
  jungle: { hell: '#9aa06a', dunkel: '#5f6a3a' },
  clay: { hell: '#c9825a', dunkel: '#9a5a3a' },
  mountains: { hell: '#9a9aa4', dunkel: '#62626e' },
  sand: { hell: '#e0b872', dunkel: '#b3874a' },
  dunes: { hell: '#e0b872', dunkel: '#b3874a' },
  snow: { hell: '#e8eef2', dunkel: '#a8b8c4' },
  swamp: { hell: '#8a9468', dunkel: '#566040' },
  swamp_reeds: { hell: '#8a9468', dunkel: '#566040' },
  swamp_pads: { hell: '#8a9468', dunkel: '#566040' },
};

/**
 * Turmdaecher je Kachelsorte: Schiefer als Standard, Holzschindeln im Wald,
 * Schnee in Taiga, Stroh im Dschungel, Ziegel auf Lehm, Tuerkis in der Wueste,
 * Eis im Schnee, Moos im Sumpf. PLATZHALTER (ASSETS.md).
 */
export const DACH_JE_SORTE: Record<string, { hell: string; dunkel: string }> = {
  forest: { hell: '#8a5a32', dunkel: '#5e3d25' },
  taiga: { hell: '#eef3f7', dunkel: '#b9c9d6' },
  jungle: { hell: '#d9b44a', dunkel: '#a8832e' },
  clay: { hell: '#b8402e', dunkel: '#842a1e' },
  mountains: { hell: '#5a5a68', dunkel: '#3c3c48' },
  sand: { hell: '#3fa39a', dunkel: '#2c6b63' },
  dunes: { hell: '#3fa39a', dunkel: '#2c6b63' },
  snow: { hell: '#bfe4f7', dunkel: '#7fb0d8' },
  swamp: { hell: '#6f7f44', dunkel: '#4a5a2a' },
  swamp_reeds: { hell: '#6f7f44', dunkel: '#4a5a2a' },
  swamp_pads: { hell: '#6f7f44', dunkel: '#4a5a2a' },
};

/** Stein und Dach, die ein Bauwerk der Hauptstadt auf dieser Kachelsorte bekommt. */
export function steinFuer(sorte: string): { hell: string; dunkel: string } {
  return STEIN_JE_SORTE[sorte] ?? { hell: PALETTE.m!, dunkel: PALETTE.M! };
}
const dachFuer = (sorte: string) => DACH_JE_SORTE[sorte] ?? { hell: '#6a7a98', dunkel: '#46546e' };

/**
 * Ein Bild aus Pixelkarten, umgefaerbt: p/P/q Spielerfarbe, m/M Stein, x/X Dach.
 * Gemerkt wie die Figuren - eine Hauptstadt ist danach ein einziges drawImage.
 */
function bauwerkBild(
  name: string,
  teile: readonly { karte: readonly string[]; dx: number; dy: number }[],
  breite: number,
  hoehe: number,
  f: number,
  farbe: string,
  sorte: string,
): HTMLCanvasElement {
  const stein = steinFuer(sorte);
  const dach = dachFuer(sorte);
  const schluessel = `${name}|${farbe}|${stein.hell}|${dach.hell}|${f}`;
  const da = BILDER.get(schluessel);
  if (da) return da;
  const bild = document.createElement('canvas');
  bild.width = breite * f;
  bild.height = hoehe * f;
  const g = bild.getContext('2d')!;
  for (const { karte, dx, dy } of teile) {
    karte.forEach((zeile, zy) => {
      for (let zx = 0; zx < zeile.length; zx++) {
        const ch = zeile[zx]!;
        if (ch === '.') continue;
        g.fillStyle =
          ch === 'p' ? farbe
          : ch === 'P' ? dunkler(farbe)
          : ch === 'q' ? heller(farbe)
          : ch === 'm' ? stein.hell
          : ch === 'M' ? stein.dunkel
          : ch === 'x' ? dach.hell
          : ch === 'X' ? dach.dunkel
          : (PALETTE[ch] ?? '#ff00ff');
        g.fillRect((dx + zx) * f, (dy + zy) * f, f, f);
      }
    });
  }
  if (BILDER.size >= BILDER_MAX) BILDER.clear();
  BILDER.set(schluessel, bild);
  return bild;
}

/**
 * Die Hauptstadt auf ihrem Feld. (x, y) ist die Feldmitte in Geraetepixeln,
 * f die Geraetepixel je Kunstpixel, sorte die Kachelsorte darunter. Stufe I
 * ist die Burg, ab Stufe II der Palast, der das Feld fuellt.
 */
export function zeichneHauptstadt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  f: number,
  farbe: string,
  sorte: string,
  stufe = 1,
): void {
  const karte = stufe >= 2 ? PALAST : BURG;
  const breite = karte[0]!.length;
  const hoehe = karte.length + 3;
  const bild = bauwerkBild(
    stufe >= 2 ? 'palast' : 'burg',
    [
      { karte, dx: 0, dy: 3 },
      { karte: BURG_FAHNE, dx: 10, dy: 0 },
    ],
    breite,
    hoehe,
    f,
    farbe,
    sorte,
  );
  const fy = y + (stufe >= 2 ? 9 : 6) * f;
  const x0 = x - Math.floor(breite / 2) * f;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fillRect(x0 + 2 * f, fy + f, (breite - 4) * f, f);
  ctx.drawImage(bild, x0, fy - (hoehe - 1) * f);
}

/**
 * Eine Bastion des Festungsrings - an der Ecke, an der vorher die Stadt stand.
 * (x, y) ist die Ecke in Geraetepixeln, wie bei zeichneGebaeude; ein Wachturm
 * bleibt als Wehrturm daneben stehen.
 */
export function zeichneBastion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  f: number,
  farbe: string,
  sorte: string,
  turm = false,
): void {
  const fy = y + 3 * f;
  if (turm) zeichneFigur(ctx, 'turm', x + 8 * f, fy - 2 * f, f, farbe);
  const breite = BASTION[0]!.length;
  const hoehe = BASTION.length + 3;
  const bild = bauwerkBild('bastion', [{ karte: BASTION, dx: 0, dy: 3 }, { karte: BURG_FAHNE, dx: 4, dy: 0 }], breite, hoehe, f, farbe, sorte);
  const x0 = x - Math.floor(breite / 2) * f;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fillRect(x0 + f, fy + f, (breite - 2) * f, f);
  ctx.drawImage(bild, x0, fy - (hoehe - 1) * f);
}

export type Mauerstueck = {
  a: { x: number; y: number };
  b: { x: number; y: number };
  stein: { hell: string; dunkel: string };
};

/**
 * Die Mauer eines Festungsrings entlang der Feldkante, in Geraetepixeln - wie
 * eine Strasse Schritt fuer Schritt ein Kunstpixel weit, aber hoch: dunkler
 * Rand, heller Stein, unten Schatten, oben Zinnen. PLATZHALTER (ASSETS.md).
 */
export function zeichneMauern(ctx: CanvasRenderingContext2D, stuecke: readonly Mauerstueck[], f: number): void {
  const alle = stuecke.map((s) => {
    const n = Math.max(1, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / f));
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      p.push({
        x: Math.round((s.a.x + ((s.b.x - s.a.x) * i) / n) / f) * f,
        y: Math.round((s.a.y + ((s.b.y - s.a.y) * i) / n) / f) * f,
      });
    }
    return { s, p };
  });
  ctx.fillStyle = '#3a2a1e';
  for (const { p } of alle) for (const q of p) ctx.fillRect(q.x - 2 * f, q.y - 5 * f, 5 * f, 7 * f);
  for (const { s, p } of alle) {
    for (const q of p) {
      ctx.fillStyle = s.stein.hell;
      ctx.fillRect(q.x - f, q.y - 4 * f, 3 * f, 3 * f);
      ctx.fillStyle = s.stein.dunkel;
      ctx.fillRect(q.x - f, q.y - f, 3 * f, 2 * f);
    }
  }
  ctx.fillStyle = '#3a2a1e';
  for (const { p } of alle) p.forEach((q, i) => i % 2 === 0 && ctx.fillRect(q.x, q.y - 4 * f, f, f));
}

export type Strassenstueck = {
  a: { x: number; y: number };
  b: { x: number; y: number };
  farbe: string;
  /** Abgebrannt: nur noch Asche und Glut, kein Wimpel. */
  verbrannt?: boolean;
  /** Ohne Wimpel - etwa im Ring einer Residenz, wo Burg und Staedte schon Farbe zeigen. */
  ohneWimpel?: boolean;
};

/**
 * Strassen als Feldweg entlang der Feldkante, in Geraetepixeln.
 *
 * Wie ein Pfad auf den Kacheln, schmal: zwei Kunstpixel festgetretene Erde,
 * jeder vierte Stein heller, ringsum ein Kunstpixel dunkler Rand (die
 * Hauptstadt-Entwuerfe hatten einen, das war etwas zu duenn). Schritt fuer Schritt ein Kunstpixel weit, auf das
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
    for (const q of p) ctx.fillRect(q.x - f, q.y - f, 4 * f, 4 * f);
  }
  for (const { s, p } of alle) {
    ctx.fillStyle = s.verbrannt ? '#3d342d' : '#9a7b52';
    for (const q of p) ctx.fillRect(q.x, q.y, 2 * f, 2 * f);
  }
  for (const { s, p } of alle) {
    p.forEach((q, i) => {
      // Asche: hier und da Glut. Sonst jeder vierte Stein heller.
      if (s.verbrannt ? i % 6 !== 3 : i % 4 !== 0) return;
      ctx.fillStyle = s.verbrannt ? '#b8481f' : '#c8ad7f';
      ctx.fillRect(q.x + (i % 8 === 0 ? f : 0), q.y, f, f);
    });
  }
  for (const { s, p } of alle) {
    if (s.verbrannt || s.ohneWimpel) continue;
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
  // Etwas unter der Mitte: darueber sitzt die Zahl, klein (Board, Zahlenmarker).
  if (anzahl <= 1) return [[0, 7]];
  if (anzahl === 2) return [[-4, 6], [4, 8]];
  if (anzahl === 3) return [[-5, 5], [5, 5], [0, 9]];
  return [[-7, 3], [-5, 8], [7, 3], [5, 8], [0, 11]];
}
