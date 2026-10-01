/**
 * Das Bild einer Spielkarte - das Fenster in der Kartenmitte.
 *
 * Jedes Bild wird aus der Wirkung der Karte UND ihrer Sippe zusammengesetzt,
 * nie von Hand je Karte gewaehlt. So bekommt jede Karte, auch eine kuenftige,
 * ein passendes Bild:
 *
 *   Himmel und Boden   je Sippe: Ernte Felder im Abendlicht, Handel das Meer,
 *                      Bau Mauerwerk, Krieg Palisaden, Wildnis Tannen. Die
 *                      Huegel am Horizont und die Sterne folgen der Kennung -
 *                      zwei Karten derselben Sippe sehen nie gleich aus.
 *   Motive             aus den Wirkungen: Gelaendekachel mit +1, Rohstoffe mit
 *                      Anzahl, Sack, Waage, Truhe, Wuerfel fuer Regelkarten,
 *                      Waffen fuer Taktiken.
 *   Ausloeser          "Wenn X, dann Y" (ENGINE_KARTEN.md, Lasting 'wenn') als
 *                      Tafel: Anlass, Pfeil, Lohn.
 *   Schluesselkarten   (schluessel: true) ein grosses Wappen mit Krone und
 *                      Strahlen, Form und Farbe aus Kennung und Sippe.
 *
 * Die kuenftigen Wirkungen (wenn, je, zaehler, ertragMal, sperre ...) gibt es
 * im Kern noch nicht. Sie werden hier als Zeichenketten gelesen, damit das
 * Bild schon steht, wenn die Regeln kommen.
 *
 * 48 x 32 Kunstpixel (ASSETS.md, "Kartenmotive"). PLATZHALTER (ASSETS.md):
 * ein gezeichnetes Motiv je Karte kann das zusammengesetzte ersetzen.
 */

import type { ReactElement } from 'react';
import { sippeVon } from '../../core/cards/sippen';
import type { Sippe } from '../../core/cards/sippen';
import { cardKind, dauerwirkungen, taktikwirkungen } from '../../core/cards/types';
import type { Card } from '../../core/cards/types';
import { RESOURCES } from '../../core/types';
import type { Resource, Terrain } from '../../core/types';
import { kachelFuer } from '../tiles';
import {
  ANKER, AUFTRAG, BANNER, BOGEN, FLAMME, HAUS, KARAWANE, KARTE, KREISLAUF, KREUZ, KRONE, LAGER, MARKT, ORDEN,
  PFEIL, PIX, Px, PxText, ROHSTOFF, RUINE, SACK, SCHAEDEL, SCHILD, SCHWERTER, SONNE, STADT, STERN, STRASSE,
  STRICHE, TRUHE, TURM, VERBOT, WAAGE, WUERFEL, breiteVon, hoeheVon, textBreite,
} from './KartenPixel';
import type { Pixelkarte } from './KartenPixel';

export const BILD_B = 48;
export const BILD_H = 32;

/** Eine Wirkung, wie sie im Spielstand steht - auch eine, die der Kern noch nicht kennt. */
type Lose = { t: string } & Record<string, unknown>;

const lose = (x: unknown): Lose[] => {
  if (!x) return [];
  return (Array.isArray(x) ? x : [x]).filter((y): y is Lose => typeof y === 'object' && y !== null && typeof (y as Lose).t === 'string');
};
const zahlVon = (x: unknown, d = 0): number => (typeof x === 'number' ? x : d);
const textVon = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

/* --- Was fuer eine Karte ist das? ----------------------------------------- */

/** Die Zeile im Band unter dem Bild - sie sagt, wie die Karte wirkt. */
export type KartenArtName = 'dauer' | 'sofort' | 'ausloeser' | 'wachsend' | 'regel' | 'taktik' | 'ausruestung' | 'krone';

export const ART_NAME: Record<KartenArtName, string> = {
  dauer: 'Dauer',
  sofort: 'Sofort',
  ausloeser: 'Ausloeser',
  wachsend: 'Wachsend',
  regel: 'Regel',
  taktik: 'Taktik',
  ausruestung: 'Ausruestung',
  krone: 'Krone',
};

/** Regelbrueche: Karten, die eine Regel verbiegen statt etwas zu geben. */
const REGEL = new Set([
  'alsZahl', 'doppelZahl', 'ersatz', 'rabatt', 'ertragMal', 'grundErtrag', 'siebenLiefert', 'sippeMal',
  'sippenPlatz', 'sippenDeckel', 'nachhall', 'ausloeserJahr', 'beuteStattVerlust', 'kurs', 'sperre',
]);

export type KartenArt = {
  sippe: Sippe | undefined;
  art: KartenArtName;
  /** Traegt mindestens einen Ausloeser ("Wenn X, dann Y"). */
  ausloeser: boolean;
  /** Merkt sich etwas im Lauf der Partie - zeigt ein Zaehlerfeld. */
  zaehler: boolean;
  /** Schluesselkarte fuer den Kronplatz. */
  schluessel: boolean;
};

const istZaehlerLohn = (l: Lose): boolean => l.t === 'zaehler';

export function kartenArt(karte: Card): KartenArt {
  const w = lose(dauerwirkungen(karte));
  const schluessel = (karte as Card & { schluessel?: boolean }).schluessel === true;
  const ausloeser = w.some((l) => l.t === 'wenn');
  const zaehler = w.some(
    (l) =>
      (l.t === 'je' && (l.groesse as Lose | undefined)?.['aus'] === 'zaehler') ||
      (l.t === 'wenn' && lose(l.dann).some(istZaehlerLohn)),
  );
  const kind = cardKind(karte);
  const art: KartenArtName = schluessel
    ? 'krone'
    : kind === 'taktik'
      ? 'taktik'
      : kind === 'ausruestung'
        ? 'ausruestung'
        : ausloeser
          ? 'ausloeser'
          : zaehler || w.some((l) => l.t === 'je')
            ? 'wachsend'
            : w.some((l) => REGEL.has(l.t))
              ? 'regel'
              : w.length > 0
                ? 'dauer'
                : 'sofort';
  // Eine Karte darf ihre Sippe selbst tragen (kuenftige Karten); sonst gilt die Tafel in cards/sippen.ts.
  const eigene = (karte as Card & { sippe?: Sippe }).sippe;
  return { sippe: eigene ?? sippeVon(karte.id), art, ausloeser, zaehler, schluessel };
}

/* --- Zufall aus der Kennung ----------------------------------------------- */

function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** Kleiner, fester Zufall: dieselbe Karte, dasselbe Bild. */
function zufall(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/* --- Himmel und Boden je Sippe -------------------------------------------- */

type Landschaft = { himmel: readonly string[]; huegel: string; boden: (r: () => number) => ReactElement };

const streifen = (y: number, h: number, f: string, k: string) => <rect key={k} x={0} y={y} width={BILD_B} height={h} fill={f} />;

const LAND: Record<Sippe | 'keine', Landschaft> = {
  // Felder im Abendlicht: Furchen in zwei Gelbtoenen.
  ernte: {
    himmel: ['#3b2a1c', '#4a321f', '#5d3e22', '#764f28', '#8f6230'],
    huegel: '#4a3a1c',
    boden: () => (
      <g>
        {streifen(25, 7, '#7a6222', 'g')}
        {[25, 27, 29, 31].map((y) => streifen(y, 1, '#a8862c', `f${y}`))}
        {[3, 11, 19, 29, 37, 44].map((x) => (
          <Px key={x} karte={['.t.', 'tTt', '.T.']} x={x} y={22 + (x % 3)} />
        ))}
      </g>
    ),
  },
  // Das Meer mit Wellenkaemmen.
  handel: {
    himmel: ['#14212f', '#192a3c', '#1f354b', '#28445c', '#33546c'],
    huegel: '#1c2c3a',
    boden: (r) => (
      <g>
        {streifen(25, 7, '#1f4a6a', 'm')}
        {[26, 28, 30].map((y, i) =>
          Array.from({ length: 7 }, (_, k) => (
            <rect key={`${y}:${k}`} x={((k * 7 + i * 3 + Math.floor(r() * 2)) % 50) - 1} y={y} width={3} height={1} fill={i === 0 ? '#7fb0d8' : '#4f86b0'} />
          )),
        )}
      </g>
    ),
  },
  // Mauerwerk im Verband.
  bau: {
    himmel: ['#202329', '#282c33', '#31363e', '#3c414a', '#474d57'],
    huegel: '#2a2e35',
    boden: () => (
      <g>
        {streifen(25, 7, '#857e70', 'w')}
        {[25, 28, 31].map((y) => streifen(y, 1, '#5e584d', `l${y}`))}
        {[0, 1].map((reihe) =>
          Array.from({ length: 9 }, (_, k) => (
            <rect key={`${reihe}:${k}`} x={k * 6 + (reihe ? 3 : 0)} y={26 + reihe * 3} width={1} height={2} fill="#5e584d" />
          )),
        )}
        {streifen(26, 1, '#a39c8d', 'h')}
      </g>
    ),
  },
  // Palisade aus angespitzten Pfaehlen.
  krieg: {
    himmel: ['#241212', '#311815', '#3f1e19', '#4e261e', '#5e2f22'],
    huegel: '#2e1712',
    boden: (r) => (
      <g>
        {Array.from({ length: 12 }, (_, k) => {
          const h = 6 + Math.floor(r() * 3);
          const x = k * 4;
          return (
            <g key={k}>
              <rect x={x} y={32 - h} width={3} height={h} fill="#5a3a1e" />
              <rect x={x + 1} y={31 - h} width={1} height={1} fill="#5a3a1e" />
              <rect x={x + 2} y={32 - h} width={1} height={h} fill="#3f2913" />
            </g>
          );
        })}
        {streifen(28, 1, '#2a1a0c', 'q')}
      </g>
    ),
  },
  // Tannen vor dunklem Gruen.
  wildnis: {
    himmel: ['#10201c', '#152a24', '#1b342c', '#224036', '#2a4c40'],
    huegel: '#1a2e26',
    boden: (r) => (
      <g>
        {streifen(28, 4, '#1f3a26', 'b')}
        {Array.from({ length: 8 }, (_, k) => {
          const x = k * 6 + Math.floor(r() * 3) - 1;
          const h = 5 + Math.floor(r() * 4);
          return (
            <g key={k}>
              {Array.from({ length: h }, (_, j) => {
                const breite = 1 + Math.floor((j * 4) / h) * 2;
                return <rect key={j} x={x + 3 - (breite - 1) / 2} y={30 - h + j} width={breite} height={1} fill={j % 2 ? '#2f5a34' : '#3a6a3c'} />;
              })}
              <rect x={x + 3} y={30} width={1} height={2} fill="#4a3420" />
            </g>
          );
        })}
      </g>
    ),
  },
  keine: {
    himmel: ['#2a2219', '#33291e', '#3d3123', '#473929', '#52422f'],
    huegel: '#30271c',
    boden: () => <g>{streifen(27, 5, '#4a3b28', 'e')}</g>,
  },
};

function Landschaft({ sippe, seed, gold }: { sippe: Sippe | undefined; seed: number; gold: boolean }) {
  const land = LAND[sippe ?? 'keine'];
  const r = zufall(seed);
  // Himmel in Baendern - ein Verlauf in Stufen, wie ihn Pixelgrafik malt.
  const baender = land.himmel.map((f, i) => streifen(i * 5, i === land.himmel.length - 1 ? BILD_H - i * 5 : 5, f, `h${i}`));
  // Sterne: wenige, blasse Punkte; bei legendaeren Karten golden und mehr.
  const sterne = Array.from({ length: gold ? 9 : 5 }, (_, i) => {
    const x = Math.floor(r() * BILD_B);
    const y = Math.floor(r() * 14);
    return <rect key={`s${i}`} x={x} y={y} width={1} height={1} fill={gold ? '#ffe08a' : '#f2e7d0'} opacity={gold ? 0.8 : 0.35 + r() * 0.3} />;
  });
  // Huegel am Horizont aus einer geglaetteten Zufallslinie.
  const punkte = Array.from({ length: 7 }, () => 16 + Math.floor(r() * 7));
  const huegel = Array.from({ length: BILD_B }, (_, x) => {
    const t = (x / (BILD_B - 1)) * (punkte.length - 1);
    const i = Math.floor(t);
    const f = t - i;
    const a = punkte[i]!;
    const b = punkte[Math.min(punkte.length - 1, i + 1)]!;
    const y = Math.round(a + (b - a) * (3 - 2 * f) * f * f);
    return <rect key={`g${x}`} x={x} y={y} width={1} height={BILD_H - y} fill={land.huegel} />;
  });
  return (
    <g>
      {baender}
      {sterne}
      {huegel}
      {land.boden(r)}
    </g>
  );
}

/* --- Motive aus Wirkungen ------------------------------------------------- */

/** Ein Teil des Bildes: eine Pixelkarte oder eine Gelaendekachel, dazu eine Zahl. */
type Motiv =
  | { t: 'pix'; bild: Pixelkarte; text?: string; rot?: boolean; zahl?: string; verbot?: boolean }
  | { t: 'kachel'; url: string; text?: string; rot?: boolean }
  | { t: 'wuerfel'; zahl: string; zweite?: string; text?: string };

const pix = (bild: Pixelkarte, text?: string, rot = false): Motiv => ({ t: 'pix', bild, text, rot });
const plus = (n: number): string => (n > 0 ? `+${n}` : String(n));

function kachel(terrain: unknown, i: number, text?: string, rot = false): Motiv {
  const url = typeof terrain === 'string' ? kachelFuer(terrain as Terrain, i) : null;
  if (url) return { t: 'kachel', url, text, rot };
  const res: Record<string, Resource> = { forest: 'lumber', hill: 'brick', pasture: 'wool', field: 'grain', mountain: 'ore' };
  const r = res[String(terrain)];
  return pix(r ? ROHSTOFF[r] : SACK, text, rot);
}

const rohstoff = (r: unknown): Pixelkarte => (typeof r === 'string' && r in ROHSTOFF ? ROHSTOFF[r as Resource] : SACK);

/** Das Sinnbild eines Anlasses (ENGINE_KARTEN.md, Anlass). */
function anlassMotiv(a: Lose | undefined): Motiv {
  const bei = textVon(a?.['bei']) ?? '';
  switch (bei) {
    case 'strasse':
      return pix(STRASSE);
    case 'dorf':
      return pix(HAUS);
    case 'stadt':
      return pix(STADT);
    case 'karawane':
      return pix(KARAWANE);
    case 'wurf': {
      const z = Array.isArray(a?.['zahlen']) ? (a!['zahlen'] as number[]) : [];
      return { t: 'wuerfel', zahl: z.length > 0 ? String(z[0]) : '?', zweite: z.length > 1 ? String(z[1]) : undefined };
    }
    case 'kampfSieg':
      return pix(SCHWERTER);
    case 'raubzugAbgewehrt':
      return pix(SCHILD);
    case 'lager':
      return pix(LAGER);
    case 'ruine':
      return pix(RUINE);
    case 'auftrag':
      return pix(AUFTRAG);
    case 'handel':
      return pix(WAAGE);
    case 'markt':
      return pix(MARKT);
    case 'karte':
      return pix(KARTE);
    case 'jahreszeit':
      return pix(SONNE);
    case 'bossBesiegt':
      return pix(SCHAEDEL);
    case 'pluenderung':
      return pix(FLAMME);
    case 'ertrag':
      return pix(rohstoff(a?.['resource']));
    default:
      return pix(STERN);
  }
}

/** Das Sinnbild einer Groesse (ENGINE_KARTEN.md, Groesse) - wofuer gezaehlt wird. */
function groesseMotiv(g: Lose | undefined, pro: number): Motiv {
  const aus = textVon(g?.['aus']);
  const text = `/${pro}`;
  switch (aus) {
    case 'zaehler':
      return pix(STRICHE, text);
    case 'sippe':
    case 'aktiv':
      return pix(KARTE, text);
    case 'bau': {
      const art = textVon(g?.['art']);
      return pix(art === 'strasse' ? STRASSE : art === 'stadt' ? STADT : HAUS, text);
    }
    case 'chronik': {
      const art = textVon(g?.['art']);
      return pix(art === 'lager' ? LAGER : art === 'ruinen' ? RUINE : art === 'auftraege' ? AUFTRAG : art === 'handel' ? WAAGE : KARTE, text);
    }
    case 'ruhm':
      return pix(ORDEN, text);
    case 'hand':
      return pix(TRUHE, text);
    default:
      return pix(STERN, text);
  }
}

/** Was eine Sperre verbietet. */
function sperrMotiv(was: unknown): Motiv {
  const bild: Record<string, Pixelkarte> = {
    bank: WAAGE,
    markt: MARKT,
    stadt: STADT,
    truppe: SCHWERTER,
    mauer: TURM,
    fund: WUERFEL,
    gruendungswahl: KARTE,
  };
  return { t: 'pix', bild: bild[String(was)] ?? KARTE, verbot: true };
}

/** Ein Lohn (ENGINE_KARTEN.md, Lohn) als Motiv. */
function lohnMotiv(l: Lose): Motiv {
  switch (l.t) {
    case 'gain': {
      const res = (l['resources'] ?? {}) as Partial<Record<Resource, number>>;
      const r = RESOURCES.find((x) => (res[x] ?? 0) > 0);
      return pix(r ? ROHSTOFF[r] : SACK, r ? `+${res[r]}` : undefined);
    }
    case 'gainAny':
      return pix(SACK, `+${zahlVon(l['count'], 1)}`);
    case 'ruhm':
      return pix(ORDEN, `+${zahlVon(l['amount'], 1)}`);
    case 'zaehler':
      return pix(STRICHE, l['amount'] === 'menge' ? '+?' : `+${zahlVon(l['amount'], 1)}`);
    case 'wahl':
      return pix(KARTE, `+${zahlVon(l['anzahl'], 1)}`);
    case 'heilen':
      return pix(KREUZ, `+${zahlVon(l['amount'], 1)}`);
    case 'gainJe':
      return pix(l['resource'] ? rohstoff(l['resource']) : SACK, `/${zahlVon(l['pro'], 1)}`);
    default:
      return pix(SACK);
  }
}

/** Alle Motive einer Karte, ohne Ausloeser (die zeichnet die Tafel). */
function motiveVon(karte: Card): Motiv[] {
  const out: Motiv[] = [];
  const w = lose(dauerwirkungen(karte));

  for (const t of lose(taktikwirkungen(karte))) {
    const a = zahlVon(t['amount']);
    switch (t.t) {
      case 'healUnit':
      case 'healField':
        out.push(pix(KREUZ, `+${a}`));
        break;
      case 'attack':
        out.push(pix(SCHWERTER, `+${a}`));
        break;
      case 'cover':
        out.push(pix(SCHILD, `+${a}`));
        break;
      case 'morale':
        out.push(pix(BANNER));
        break;
      case 'siege':
        out.push(pix(TURM));
        break;
      case 'heroReroll':
        out.push({ t: 'wuerfel', zahl: '?' }, pix(KREISLAUF));
        break;
      case 'rangedAttack':
        out.push(pix(BOGEN, `+${a}`));
        break;
    }
  }

  w.forEach((l, i) => {
    switch (l.t) {
      case 'terrainBonus': {
        const n = zahlVon(l['amount']);
        out.push(kachel(l['terrain'], i, plus(n), n < 0));
        break;
      }
      case 'tradeDiscount':
        out.push(pix(WAAGE, `-${zahlVon(l['amount'], 1)}`));
        break;
      case 'handLimit': {
        const n = zahlVon(l['amount'], 1);
        out.push(pix(TRUHE, plus(n), n < 0));
        break;
      }
      case 'stormPorts':
        out.push(pix(ANKER));
        break;
      case 'siegpunkte': {
        const je = textVon(l['je']);
        const quelle: Record<string, Pixelkarte> = { stadt: STADT, lager: LAGER, ruine: RUINE, auftrag: AUFTRAG, strasse: STRASSE };
        out.push(pix(STERN, '+1'), pix(quelle[je ?? ''] ?? KARTE, `/${zahlVon(l['pro'], 1)}`));
        break;
      }
      case 'punkte':
        out.push(pix(STERN, `+${zahlVon(l['amount'], 1)}`));
        break;
      case 'alsZahl': {
        // 2 -> 12 und 12 -> 2 als eine Marke lesen lassen.
        const von = zahlVon(l['von']);
        const zu = zahlVon(l['zu']);
        const gespiegelt = w.some((x, j) => j < i && x.t === 'alsZahl' && x['von'] === zu && x['zu'] === von);
        if (gespiegelt) break;
        out.push({ t: 'wuerfel', zahl: String(von) }, pix(PFEIL), { t: 'wuerfel', zahl: String(zu) });
        break;
      }
      case 'doppelZahl': {
        const zahlen = Array.isArray(l['zahlen']) ? (l['zahlen'] as number[]) : [];
        out.push({ t: 'wuerfel', zahl: String(zahlen[0] ?? '?'), zweite: zahlen[1] !== undefined ? String(zahlen[1]) : undefined, text: 'x2' });
        break;
      }
      case 'siebenGabe':
        out.push({ t: 'wuerfel', zahl: '7' }, pix(SACK, `+${zahlVon(l['anzahl'], 1)}`));
        break;
      case 'schutz':
        out.push(pix(SCHILD, `-${zahlVon(l['amount'], 1)}`));
        break;
      case 'marktRabatt':
        out.push(pix(MARKT, `-${zahlVon(l['amount'], 1)}`));
        break;
      case 'bauGabe':
        out.push(pix(HAUS), pix(SACK, `+${zahlVon(l['amount'], 1)}`));
        break;
      case 'stadtRuhm':
        out.push(pix(STADT), pix(ORDEN, `+${zahlVon(l['amount'], 1)}`));
        break;
      case 'lagerBeute':
        out.push(pix(LAGER), pix(KARTE, `+${zahlVon(l['amount'], 1)}`));
        break;
      case 'ruinenBeute':
        out.push(pix(RUINE), pix(KARTE, `+${zahlVon(l['amount'], 1)}`));
        break;
      // --- kuenftige Wirkungen (ENGINE_KARTEN.md) ---
      case 'je': {
        const dann = lose(l['dann'])[0];
        const innen = dann ? motiveVon({ ...karte, instant: undefined, tactic: undefined, lasting: dann as never })[0] : undefined;
        if (innen) out.push(innen.t === 'pix' || innen.t === 'kachel' ? { ...innen, text: '+1' } : innen);
        out.push(groesseMotiv(l['groesse'] as Lose | undefined, zahlVon(l['pro'], 1)));
        break;
      }
      case 'ersatz':
        out.push(pix(rohstoff(l['von'])), pix(['...', '###', '...', '###', '...'].map((z) => z.replace(/#/g, 'y'))), l['fuer'] === 'alle' ? pix(STERN) : pix(rohstoff(l['fuer'])));
        break;
      case 'rabatt':
        out.push(pix(l['bei'] === 'stadt' ? STADT : l['bei'] === 'strasse' ? STRASSE : l['bei'] === 'truppe' ? SCHWERTER : HAUS), pix(rohstoff(l['resource']), `-${zahlVon(l['amount'], 1)}`));
        break;
      case 'ertragMal': {
        const f = `x${zahlVon(l['faktor'], 2)}`;
        const zahlen = Array.isArray(l['zahlen']) ? (l['zahlen'] as number[]) : [];
        if (l['terrain']) out.push(kachel(l['terrain'], i, f, zahlVon(l['faktor'], 2) === 0));
        else if (zahlen.length > 0) out.push({ t: 'wuerfel', zahl: String(zahlen[0]), zweite: zahlen[1] !== undefined ? String(zahlen[1]) : undefined }, pix(SACK, f));
        else out.push(pix(SACK, f));
        break;
      }
      case 'grundErtrag':
        out.push(pix(HAUS, String(zahlVon(l['dorf'], 1)), zahlVon(l['dorf'], 1) === 0), pix(STADT, String(zahlVon(l['stadt'], 2)), zahlVon(l['stadt'], 2) === 0));
        break;
      case 'siebenLiefert':
        out.push({ t: 'wuerfel', zahl: '7' }, pix(PFEIL), pix(STERN));
        break;
      case 'sippeMal':
        out.push(pix(KARTE, `x${zahlVon(l['faktor'], 2)}`));
        break;
      case 'sippenPlatz': {
        const n = zahlVon(l['amount'], 1);
        out.push(pix(KARTE, plus(n), n < 0));
        break;
      }
      case 'sippenDeckel':
        out.push({ t: 'pix', bild: KARTE, verbot: true, text: String(zahlVon(l['ab'], 6)) });
        break;
      case 'nachhall':
        out.push(pix(KREISLAUF, 'x2'));
        break;
      case 'ausloeserJahr':
        out.push(pix(SONNE), pix(KREISLAUF));
        break;
      case 'beuteStattVerlust':
        out.push(pix(FLAMME), pix(PFEIL), pix(SACK));
        break;
      case 'kurs':
        out.push(pix(WAAGE, `${zahlVon(l['ratio'], 2)}:1`));
        break;
      case 'sperre':
        out.push(sperrMotiv(l['was']));
        break;
    }
  });

  const sofort = karte.instant;
  if (sofort?.t === 'gain') {
    for (const r of RESOURCES) {
      const n = sofort.resources[r] ?? 0;
      if (n > 0) out.push(pix(ROHSTOFF[r], String(n)));
    }
  } else if (sofort?.t === 'gainAny') {
    out.push(pix(SACK, String(sofort.count)));
  }
  return out;
}

/* --- Zeichnen ------------------------------------------------------------- */

const SCHATTEN = 'rgba(10, 6, 3, 0.45)';
const GRUND = '#1b130c';

function breite(m: Motiv): number {
  if (m.t === 'kachel') return 26;
  if (m.t === 'wuerfel') return breiteVon(WUERFEL) + (m.zweite ? 3 : 0);
  return breiteVon(m.bild);
}
function hoehe(m: Motiv): number {
  if (m.t === 'kachel') return 32;
  if (m.t === 'wuerfel') return hoeheVon(WUERFEL) + (m.zweite ? 2 : 0);
  return hoeheVon(m.bild);
}

/** Eine Zahl am Motiv: unten rechts auf dunklem Schildchen, rot fuer Verluste. */
function Marke({ text, x, y, rot }: { text: string; x: number; y: number; rot?: boolean }) {
  const b = textBreite(text);
  const xx = Math.max(1, Math.min(BILD_B - b - 1, x));
  const yy = Math.max(1, Math.min(BILD_H - 6, y));
  return <PxText text={text} x={xx} y={yy} farbe={rot ? '#ff8a70' : PIX.y!} grund={rot ? '#4a1410' : GRUND} />;
}

/** Ein Wuerfel mit Zahl statt Augen - mit zweiter Zahl als Wuerfel dahinter. */
function WuerfelBild({ zahl, zweite, x, y }: { zahl: string; zweite?: string; x: number; y: number }) {
  const w = breiteVon(WUERFEL);
  const vorn = (z: string, wx: number, wy: number, k: string) => (
    <g key={k}>
      <Px karte={WUERFEL} x={wx} y={wy} />
      <PxText text={z} x={wx + Math.floor((w - textBreite(z)) / 2)} y={wy + 2} farbe={PIX.k!} />
    </g>
  );
  return (
    <g>
      {zweite && vorn(zweite, x + 3, y, 'h')}
      {vorn(zahl, x, y + (zweite ? 2 : 0), 'v')}
    </g>
  );
}

/**
 * Ein Motiv an (x, y) oben links, in Groesse s (1 oder 2 Kunstpixel je
 * Bildpunkt der Pixelkarte). Bild und Zahl kommen getrennt zurueck: die Zahlen
 * werden zuletzt gezeichnet, sonst verdeckt das naechste Motiv sie.
 */
function zeichne(m: Motiv, x: number, y: number, boden: number, s: number, key: string): { bild: ReactElement; marke: ReactElement | null } {
  const b = breite(m) * (m.t === 'kachel' ? 1 : s);
  const h = hoehe(m) * (m.t === 'kachel' ? 1 : s);
  const teile: ReactElement[] = [];
  if (m.t !== 'kachel' && boden >= 0) {
    teile.push(<rect key="sch" x={x + s} y={boden} width={Math.max(2, b - 2 * s)} height={1} fill={SCHATTEN} />);
  }
  if (m.t === 'kachel') {
    teile.push(
      <image key="k" href={m.url} x={x} y={y} width={26} height={32} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />,
    );
    if (m.rot) teile.push(<rect key="r" x={x + 1} y={y + 7} width={24} height={25} fill="#5a1410" opacity={0.35} />);
  } else {
    const innen =
      m.t === 'wuerfel' ? (
        <WuerfelBild zahl={m.zahl} zweite={m.zweite} x={0} y={0} />
      ) : (
        <>
          <Px karte={m.bild} />
          {m.verbot && (
            <Px
              karte={VERBOT}
              x={Math.floor((breiteVon(m.bild) - breiteVon(VERBOT)) / 2)}
              y={Math.floor((hoeheVon(m.bild) - hoeheVon(VERBOT)) / 2)}
            />
          )}
        </>
      );
    teile.push(
      <g key="p" transform={`translate(${x} ${y})${s !== 1 ? ` scale(${s})` : ''}`}>
        {innen}
      </g>,
    );
  }
  let marke: ReactElement | null = null;
  if (m.text) {
    const tb = textBreite(m.text);
    const tx = m.t === 'kachel' ? x + b - tb - 1 : x + b - tb + 1;
    const ty = m.t === 'kachel' ? y + 24 : y + h - 4;
    marke = <Marke key={`m${key}`} text={m.text} x={tx} y={ty} rot={'rot' in m ? m.rot : false} />;
  }
  return { bild: <g key={`b${key}`}>{teile}</g>, marke };
}

/**
 * Motive nebeneinander, auf einer Bodenlinie, mittig. Wenige kleine Motive
 * werden doppelt so gross gezeichnet - eine einzelne Waffe soll das Fenster
 * fuellen, nicht darin verloren stehen. Zu viele werden gedraengt, dann
 * gekuerzt; Kacheln duerfen sich ueberlappen.
 */
function Reihe({ motive, boden = 27 }: { motive: Motiv[]; boden?: number }) {
  let liste = motive;
  const summe = (l: Motiv[], g: number, s = 1) =>
    l.reduce((n, m) => n + breite(m) * (m.t === 'kachel' ? 1 : s), 0) + g * Math.max(0, l.length - 1);
  const ohneKachel = !liste.some((m) => m.t === 'kachel');
  const s =
    ohneKachel && liste.length <= 2 && summe(liste, 4, 2) <= BILD_B - 4 && Math.max(...liste.map(hoehe)) * 2 <= boden - 2 ? 2 : 1;
  let luecke = s === 2 ? 4 : 3;
  if (summe(liste, luecke, s) > BILD_B - 2) luecke = 1;
  const kacheln = liste.filter((m) => m.t === 'kachel').length;
  let ueberlapp = 0;
  if (summe(liste, luecke) > BILD_B - 2 && kacheln > 1) {
    ueberlapp = Math.min(12, Math.ceil((summe(liste, luecke) - (BILD_B - 2)) / (kacheln - 1)));
  }
  const breiteGesamt = (l: Motiv[]) => summe(l, luecke, s) - ueberlapp * Math.max(0, l.filter((m) => m.t === 'kachel').length - 1);
  while (liste.length > 1 && breiteGesamt(liste) > BILD_B) liste = liste.slice(0, -1);
  let x = Math.floor((BILD_B - breiteGesamt(liste)) / 2);
  const bilder: ReactElement[] = [];
  const marken: ReactElement[] = [];
  liste.forEach((m, i) => {
    const h = hoehe(m) * (m.t === 'kachel' ? 1 : s);
    const y = m.t === 'kachel' ? BILD_H - 32 : boden - h;
    const z = zeichne(m, x, y, boden, s, String(i));
    bilder.push(z.bild);
    if (z.marke) marken.push(z.marke);
    x += breite(m) * (m.t === 'kachel' ? 1 : s) + luecke - (m.t === 'kachel' ? ueberlapp : 0);
  });
  return (
    <g>
      {bilder}
      {marken}
    </g>
  );
}

/** Die Tafel eines Ausloesers: Anlass, Pfeil, Lohn - "Wenn X, dann Y". */
function AusloeserTafel({ anlass, lohn, y, hoch }: { anlass: Motiv; lohn: Motiv[]; y: number; hoch: number }) {
  // Auf der Tafel steht die Zahl NEBEN dem Lohn, nicht darauf: "Sack +3"
  // liest sich wie ein Satz, und die schmalen Zeichen (Striche) bleiben frei.
  const teile = [anlass, pix(PFEIL), ...lohn.slice(0, 2)];
  const luecke = 2;
  const zahlBreite = (m: Motiv) => (m.text ? textBreite(m.text) + 2 : 0);
  let gesamt = teile.reduce((n, m) => n + breite(m) + zahlBreite(m), 0) + luecke * (teile.length - 1);
  // Zu breit? Dann nur der erste Lohn.
  if (gesamt > BILD_B - 2 && teile.length > 3) {
    teile.length = 3;
    gesamt = teile.reduce((n, m) => n + breite(m) + zahlBreite(m), 0) + luecke * (teile.length - 1);
  }
  let x = Math.floor((BILD_B - gesamt) / 2);
  const mitte = y + Math.floor(hoch / 2);
  const bilder: ReactElement[] = [];
  const marken: ReactElement[] = [];
  teile.forEach((m, i) => {
    const z = zeichne({ ...m, text: undefined }, x, mitte - Math.ceil(hoehe(m) / 2), -1, 1, String(i));
    bilder.push(z.bild);
    x += breite(m);
    if (m.text) {
      marken.push(<PxText key={`t${i}`} text={m.text} x={x + 2} y={mitte - 3} farbe={'rot' in m && m.rot ? '#ff8a70' : PIX.y!} />);
      x += zahlBreite(m);
    }
    x += luecke;
  });
  return (
    <g>
      {/* Die Tafel: dunkles Brett mit goldener Kante oben und unten. */}
      <rect x={0} y={y} width={BILD_B} height={hoch} fill="#120c07" opacity={0.74} />
      <rect x={0} y={y} width={BILD_B} height={1} fill={PIX.G} />
      <rect x={0} y={y + hoch - 1} width={BILD_B} height={1} fill={PIX.G} />
      {bilder}
      {marken}
    </g>
  );
}

/** Das grosse Wappen einer Schluesselkarte: Form, Strahlen, Krone - aus Kennung und Sippe. */
function Schluesselwappen({ karte, sippe, seed }: { karte: Card; sippe: Sippe | undefined; seed: number }) {
  const farbe = sippe ? SIPPE_PIX[sippe] : { F: '#a8937a', f: '#5c452e' };
  const form = seed % 4;
  const cx = 24;
  const cy = 17;
  const R = 11;
  const zeilen: ReactElement[] = [];
  // Strahlen hinter dem Wappen: acht Speichen aus Kunstpixeln.
  for (let k = 0; k < 16; k++) {
    const winkel = (k / 16) * Math.PI * 2 + (seed % 7) * 0.05;
    for (let s = R + 1; s < R + 14; s += 1) {
      const x = Math.round(cx + Math.cos(winkel) * s);
      const y = Math.round(cy + Math.sin(winkel) * s * 0.8);
      if (x < 0 || x >= BILD_B || y < 0 || y >= BILD_H) continue;
      zeilen.push(<rect key={`r${k}:${s}`} x={x} y={y} width={1} height={1} fill="#ffe08a" opacity={k % 2 ? 0.25 : 0.5 - (s - R) * 0.03} />);
    }
  }
  // Die Form: Scheibe, Schild, Raute oder Stern - Zeile fuer Zeile.
  for (let dy = -R; dy <= R; dy++) {
    let halb: number;
    const t = (dy + R) / (2 * R);
    if (form === 0) halb = Math.round(Math.sqrt(Math.max(0, R * R - dy * dy)));
    else if (form === 1) halb = t < 0.55 ? R : Math.round(R * (1 - (t - 0.55) / 0.45));
    else if (form === 2) halb = R - Math.abs(dy);
    else halb = Math.round(Math.sqrt(Math.max(0, R * R - dy * dy)) * (0.75 + 0.25 * Math.abs(Math.cos(dy * 0.9))));
    if (halb <= 0) continue;
    const y = cy + dy;
    zeilen.push(<rect key={`a${dy}`} x={cx - halb - 1} y={y} width={halb * 2 + 3} height={1} fill={PIX.G} />);
    if (halb > 1) {
      zeilen.push(<rect key={`b${dy}`} x={cx - halb} y={y} width={halb * 2 + 1} height={1} fill={Math.abs(dy) > R - 2 ? PIX.g! : farbe.f} />);
      zeilen.push(<rect key={`c${dy}`} x={cx - halb + 2} y={y} width={Math.max(0, halb * 2 - 3)} height={1} fill={dy < 0 ? farbe.F : farbe.f} opacity={dy < 0 ? 0.55 : 0.85} />);
    }
  }
  // Das Herz des Wappens: das erste Motiv der Karte, oder ein Stern.
  const innen = motiveVon(karte).find((m) => m.t === 'pix') as Extract<Motiv, { t: 'pix' }> | undefined;
  const herz = innen?.bild ?? STERN;
  const hx = cx - Math.floor(breiteVon(herz) / 2);
  const hy = cy - Math.floor(hoeheVon(herz) / 2) + 1;
  return (
    <g>
      {zeilen}
      <Px karte={herz} x={hx} y={hy} />
      {innen?.verbot && <Px karte={VERBOT} x={cx - 5} y={cy - 4} />}
      <Px karte={KRONE} x={cx - 5} y={cy - R - 4} />
    </g>
  );
}

/** Sippenfarben in den Pixelbildern - etwas gedaempfter als in der Leiste. */
export const SIPPE_PIX: Record<Sippe, { F: string; f: string }> = {
  ernte: { F: '#e0bc52', f: '#8a6a1c' },
  handel: { F: '#6aaee0', f: '#2c5a80' },
  bau: { F: '#c88a58', f: '#6e4426' },
  krieg: { F: '#d45a44', f: '#7a2418' },
  wildnis: { F: '#6ab46a', f: '#2c5a30' },
};

export function KartenBild({ karte, klein = false }: { karte: Card; klein?: boolean }) {
  const art = kartenArt(karte);
  const seed = hashText(karte.id);
  const gold = karte.rarity === 'legendaer';
  let inhalt: ReactElement;

  if (art.schluessel) {
    inhalt = <Schluesselwappen karte={karte} sippe={art.sippe} seed={seed} />;
  } else if (art.ausloeser) {
    const wenn = lose(dauerwirkungen(karte)).filter((l) => l.t === 'wenn').slice(0, 2);
    const hoch = 14;
    const y0 = wenn.length === 1 ? 7 : 2;
    inhalt = (
      <g>
        {wenn.map((l, i) => (
          <AusloeserTafel
            key={i}
            anlass={anlassMotiv(l['anlass'] as Lose | undefined)}
            lohn={lose(l['dann']).map(lohnMotiv)}
            y={y0 + i * (hoch + 1)}
            hoch={hoch}
          />
        ))}
      </g>
    );
  } else {
    inhalt = <Reihe motive={motiveVon(karte)} />;
  }

  return (
    <span className={`karten-bild${klein ? ' klein' : ''}`} aria-hidden="true">
      <svg viewBox={`0 0 ${BILD_B} ${BILD_H}`} shapeRendering="crispEdges" preserveAspectRatio="xMidYMid meet">
        <Landschaft sippe={art.sippe} seed={seed} gold={gold || art.schluessel} />
        {inhalt}
      </svg>
    </span>
  );
}
