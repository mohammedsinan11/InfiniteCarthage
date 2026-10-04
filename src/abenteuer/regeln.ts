/**
 * Abenteuer: ein Ritter zieht ueber die Welt.
 *
 * Ein eigener Modus neben der Strategie, von Grund auf neu - nur die Welt
 * (core/world.ts) und ihre Kacheln sind geteilt. Rein und ohne Server: alles
 * hier ist eine Funktion von Zustand und Eingabe, damit das Spiel auch als
 * reine Seite laeuft (GitHub Pages) und sich testen laesst.
 *
 * DER ZUG. Zu Beginn wird gewuerfelt; die Augenzahl sind die Schritte. Jeder
 * Schritt geht auf ein Nachbarfeld (sechs Richtungen: Q E / A D / Z X um S
 * herum). Wasser ist nicht zu betreten, Berge kosten
 * zwei Schritte. Ein Schritt auf einen Schleim ist ein Angriff, S wartet.
 *
 * DIE SPIELUHR. Jeder Schritt ist ein Tick, und in jedem Tick huepfen die
 * Schleime mit: naeher heran, wenn sie den Ritter wittern, und neben ihm
 * springen sie ihn an. Wer zieht, laesst die Welt ziehen.
 *
 * SAMMELN. Auf manchen Feldern liegt etwas: Kraeuter, Gold, Truhen mit
 * Ausruestung. Wer das Feld betritt, nimmt es mit. Erschlagene Schleime
 * lassen Gelee zurueck.
 *
 * ZIEL. Erschlage zehn Schleime. Faellt der Ritter, ist das Abenteuer vorbei.
 */

import { HEX_DIRS, hexDistance, hexKey, hexesInRange } from '../core/coords';
import type { Hex } from '../core/coords';
import { hash3i } from '../core/hash';
import { Rng } from '../core/rng';
import { createWorld, ensureGenerated, tileAt } from '../core/world';
import type { World } from '../core/world';
import type { Terrain } from '../core/types';

export type Slot = 'waffe' | 'schild' | 'kopf' | 'koerper' | 'fuesse' | 'zubehoer';
export const SLOTS: readonly Slot[] = ['waffe', 'schild', 'kopf', 'koerper', 'fuesse', 'zubehoer'];
export const SLOT_NAME: Record<Slot, string> = {
  waffe: 'Waffe',
  schild: 'Schild',
  kopf: 'Kopf',
  koerper: 'Koerper',
  fuesse: 'Fuesse',
  zubehoer: 'Zubehoer',
};

export type Gegenstand = {
  id: string;
  name: string;
  text: string;
  /** Ausruestung sitzt in einem Platz; ohne Platz ist es Vorrat. */
  slot?: Slot;
  angriff?: number;
  abwehr?: number;
  leben?: number;
  schritte?: number;
  sicht?: number;
  /** Vorrat, der sich benutzen laesst: so viele Leben zurueck. */
  heilt?: number;
};

export const GEGENSTAENDE: readonly Gegenstand[] = [
  { id: 'schwert', name: 'Schwert', slot: 'waffe', angriff: 1, text: '+1 auf jeden Angriffswurf.' },
  { id: 'axt', name: 'Streitaxt', slot: 'waffe', angriff: 2, text: '+2 auf jeden Angriffswurf.' },
  { id: 'schild', name: 'Schild', slot: 'schild', abwehr: 1, text: 'Schleime brauchen eine Augenzahl mehr, um zu treffen.' },
  { id: 'helm', name: 'Helm', slot: 'kopf', leben: 1, text: '+1 Leben.' },
  { id: 'ruestung', name: 'Kettenhemd', slot: 'koerper', leben: 2, text: '+2 Leben.' },
  { id: 'stiefel', name: 'Reitstiefel', slot: 'fuesse', schritte: 1, text: '+1 Schritt je Wurf.' },
  { id: 'laterne', name: 'Laterne', slot: 'zubehoer', sicht: 1, text: 'Du siehst ein Feld weiter.' },
  { id: 'kraut', name: 'Heilkraut', heilt: 2, text: 'Antippen: 2 Leben zurueck.' },
  { id: 'herz', name: 'Herz', heilt: 1, text: 'Ein ganzes Leben, gleich beim Aufheben. Bei vollem Leben bleibt es liegen.' },
  { id: 'halbherz', name: 'Halbes Herz', heilt: 0.5, text: 'Ein halbes Leben, gleich beim Aufheben. Bei vollem Leben bleibt es liegen.' },
  { id: 'gold', name: 'Gold', text: 'Glaenzt. Noch kauft hier niemand etwas.' },
  { id: 'gelee', name: 'Schleimgelee', text: 'Was ein Schleim zuruecklaesst - der Beweis deiner Taten.' },
];

export const gegenstand = (id: string): Gegenstand | undefined => GEGENSTAENDE.find((g) => g.id === id);

/** Was in Truhen liegen kann - das Schwert traegt der Ritter schon. */
const TRUHENINHALT = ['axt', 'schild', 'helm', 'ruestung', 'stiefel', 'laterne'];

export type Schleim = {
  id: number;
  q: number;
  r: number;
  leben: number;
  gross: boolean;
  /** Angesagter Angriff: dieses Feld trifft er in seinem naechsten Takt. */
  angriff?: Hex | null;
};

export type Phase = 'wuerfeln' | 'ziehen' | 'tot' | 'sieg';

/** Wer handelt: der Ritter oder ein Schleim (seine id). */
export type Wer = 'ritter' | number;

/**
 * Was in einer Aktion geschah, Takt fuer Takt - fuer die Bewegung im Bild.
 * Takt 0 ist der Ritter, jeder weitere Takt ein Tick der Spieluhr.
 */
export type Ereignis =
  | { art: 'gehen'; takt: number; wer: Wer; von: Hex; nach: Hex }
  /** Ein Hieb; ziel null heisst: ins Leere, der Ritter ist ausgewichen. */
  | { art: 'hieb'; takt: number; wer: Wer; ziel: Wer | null; feld?: Hex; wurf: number; schaden: number }
  /** Ein Schleim holt aus: im naechsten Takt trifft er dieses Feld. */
  | { art: 'ansage'; takt: number; wer: number; feld: Hex }
  | { art: 'tod'; takt: number; wer: number; q: number; r: number; gross: boolean }
  | { art: 'neu'; takt: number; wer: number }
  | { art: 'heil'; takt: number; leben: number }
  | { art: 'warten'; takt: number }
  | { art: 'fund'; takt: number; id: string };

export type Abenteuer = {
  seed: number;
  /** Zustand des Zufalls - Wuerfel und Kampf. */
  rng: number;
  zug: number;
  /**
   * Die Spieluhr: jeder Schritt des Ritters ist ein Tick, und in jedem Tick
   * huepfen auch die Schleime. Berge kosten zwei Ticks.
   */
  zeit: number;
  phase: Phase;
  pos: Hex;
  wurf: number | null;
  schritte: number;
  /** Der Weg dieses Zuges, mit dem Startfeld - fuer die Pfeile. */
  pfad: Hex[];
  leben: number;
  inventar: Record<string, number>;
  ausruestung: Record<Slot, string | null>;
  schleime: Schleim[];
  naechsteId: number;
  /** Felder, deren Fund schon genommen ist. */
  genommen: string[];
  /** Felder, die man je gesehen hat - fuer Nebel und Uebersichtskarte. */
  erkundet: string[];
  erschlagen: number;
  /** Was zuletzt geschah, neueste zuletzt. */
  log: string[];
  /** Die Ereignisse der letzten Aktion - nur fuers Bild. */
  ereignisse: Ereignis[];
  /** Die Wege der Schleime in diesem Zug (mit Startfeld) - fuer ihre Pfeile. */
  spuren: Record<number, Hex[]>;
  /** In diesem Zug schon durch Warten geheilt. */
  geruht: boolean;
};

/** So viele Schleime muss man erschlagen. */
export const ZIEL_SCHLEIME = 10;
export const GRUND_LEBEN = 6;
const GRUND_SICHT = 3;
/** Wie weit Schleime den Ritter wittern. */
const WITTERUNG = 6;
/** Alle so viele Ticks kriecht ein neuer Schleim aus dem Unbekannten. */
const NACHSCHUB = 15;
const SALT_FUND = 77;
const SALT_SCHLEIM = 78;

/**
 * Tasten: die sechs Nachbarn eines Sechsecks um S herum. Q und E fuehren nach
 * links und rechts oben, A und D zur Seite, Z und X nach links und rechts
 * unten; S selbst wartet.
 */
export type Taste = 'q' | 'e' | 'a' | 's' | 'd' | 'z' | 'x';
export const TASTEN: readonly Taste[] = ['q', 'e', 'a', 's', 'd', 'z', 'x'];
/** Richtung je Taste (Index in HEX_DIRS: 0 NO, 1 O, 2 SO, 3 SW, 4 W, 5 NW). */
const RICHTUNG: Partial<Record<Taste, number>> = { e: 0, d: 1, x: 2, z: 3, a: 4, q: 5 };
export const TASTE_NAME: Record<Taste, string> = {
  q: 'Nordwest',
  e: 'Nordost',
  a: 'West',
  s: 'Warten',
  d: 'Ost',
  z: 'Suedwest',
  x: 'Suedost',
};

// --- Welt ----------------------------------------------------------------

const welten = new Map<number, World>();
/** Die Welt zum Seed - einmal je Seed erzeugt und wachsend, nie gespeichert. */
export function weltVon(seed: number, um?: Hex, radius = 10): World {
  let w = welten.get(seed);
  if (!w) {
    w = createWorld(seed);
    welten.set(seed, w);
  }
  if (um) ensureGenerated(w, um, radius);
  return w;
}

export function gelaende(seed: number, q: number, r: number): Terrain | null {
  return tileAt(weltVon(seed, { q, r }, 2), q, r)?.terrain ?? null;
}

const begehbar = (t: Terrain | null): boolean => t !== null && t !== 'water';
const kosten = (t: Terrain | null): number => (t === 'mountain' ? 2 : 1);

/** Was auf einem Feld liegt - aus dem Seed, solange es niemand genommen hat. */
export function fundAuf(a: Pick<Abenteuer, 'seed' | 'genommen'>, q: number, r: number): string | null {
  if (q === 0 && r === 0) return null;
  if (a.genommen.includes(hexKey(q, r))) return null;
  const t = gelaende(a.seed, q, r);
  if (!begehbar(t)) return null;
  const h = hash3i(a.seed, q, r, SALT_FUND) % 100;
  if (h < 3) return 'truhe';
  if (h < 7 && (t === 'forest' || t === 'pasture' || t === 'field')) return 'kraut';
  if (h < 10) return 'gold';
  if (h < 11) return 'halbherz';
  if (h < 12) return 'herz';
  return null;
}

// --- Werte aus der Ausruestung --------------------------------------------

const summe = (a: Abenteuer, f: (g: Gegenstand) => number | undefined): number =>
  SLOTS.reduce((n, s) => n + (f(gegenstand(a.ausruestung[s] ?? '') ?? ({} as Gegenstand)) ?? 0), 0);
export const angriffVon = (a: Abenteuer) => summe(a, (g) => g.angriff);
export const abwehrVon = (a: Abenteuer) => summe(a, (g) => g.abwehr);
export const maxLebenVon = (a: Abenteuer) => GRUND_LEBEN + summe(a, (g) => g.leben);
export const sichtVon = (a: Abenteuer) => GRUND_SICHT + summe(a, (g) => g.sicht);
const schrittBonus = (a: Abenteuer) => summe(a, (g) => g.schritte);
export const schrittBonusVon = schrittBonus;

// --- Beginn ---------------------------------------------------------------

export function neuesAbenteuer(seed: number): Abenteuer {
  // Der Ritter beginnt auf Land, so nah am Ursprung wie moeglich.
  const welt = weltVon(seed, { q: 0, r: 0 }, 12);
  let start: Hex = { q: 0, r: 0 };
  for (const h of hexesInRange({ q: 0, r: 0 }, 6).sort((x, y) => hexDistance(x, { q: 0, r: 0 }) - hexDistance(y, { q: 0, r: 0 }))) {
    const t = tileAt(welt, h.q, h.r)?.terrain ?? null;
    if (begehbar(t) && t !== 'mountain') {
      start = h;
      break;
    }
  }
  const a: Abenteuer = {
    seed,
    rng: seed ^ 0x5bd1e995,
    zug: 1,
    zeit: 0,
    phase: 'wuerfeln',
    pos: start,
    wurf: null,
    schritte: 0,
    pfad: [start],
    leben: GRUND_LEBEN,
    inventar: {},
    ausruestung: { waffe: 'schwert', schild: null, kopf: null, koerper: null, fuesse: null, zubehoer: null },
    schleime: [],
    naechsteId: 1,
    genommen: [hexKey(start.q, start.r)],
    erkundet: [],
    erschlagen: 0,
    log: ['Ein Ritter bricht auf. Wuerfle, um loszuziehen.'],
    ereignisse: [],
    spuren: {},
    geruht: false,
  };
  // Schleime in der Umgebung - nie zu nah am Start.
  for (const h of hexesInRange(start, 14)) {
    const d = hexDistance(start, h);
    if (d < 4) continue;
    if (hash3i(seed, h.q, h.r, SALT_SCHLEIM) % 29 !== 0) continue;
    if (!begehbar(gelaende(seed, h.q, h.r))) continue;
    const gross = d > 8 && hash3i(seed, h.q, h.r, SALT_SCHLEIM + 1) % 3 === 0;
    a.schleime.push({ id: a.naechsteId++, q: h.q, r: h.r, leben: gross ? 4 : 2, gross });
  }
  sehen(a);
  return a;
}

// --- Hilfen ---------------------------------------------------------------

function sehen(a: Abenteuer): void {
  const neu = new Set(a.erkundet);
  for (const h of hexesInRange(a.pos, sichtVon(a))) neu.add(hexKey(h.q, h.r));
  a.erkundet = [...neu];
}

function w6(a: Abenteuer): number {
  const rng = new Rng(a.rng);
  const n = 1 + rng.int(6);
  a.rng = rng.getState();
  return n;
}

const melde = (a: Abenteuer, text: string) => {
  a.log = [...a.log, text].slice(-30);
};

const schleimAuf = (a: Abenteuer, q: number, r: number) => a.schleime.find((s) => s.q === q && s.r === r);

// --- Aktionen -------------------------------------------------------------

export function wuerfeln(alt: Abenteuer): Abenteuer {
  if (alt.phase !== 'wuerfeln') return alt;
  const a = structuredClone(alt);
  a.wurf = w6(a);
  a.schritte = a.wurf + schrittBonus(a);
  a.pfad = [a.pos];
  a.phase = 'ziehen';
  a.ereignisse = [];
  a.spuren = {};
  melde(a, `Gewuerfelt: ${a.wurf}${schrittBonus(a) > 0 ? ` (+${schrittBonus(a)} Stiefel)` : ''} - ${a.schritte} Schritte.`);
  return a;
}

/** Wohin eine Taste fuehrt (Index in HEX_DIRS); S fuehrt nirgends hin. */
export function richtungFuer(taste: Taste): number | null {
  return RICHTUNG[taste] ?? null;
}

/** Die Taste, die auf ein Nachbarfeld fuehrt - fuer Tippen und Klicken. */
export function tasteZu(von: Hex, nach: Hex): Taste | null {
  if (von.q === nach.q && von.r === nach.r) return 's';
  const i = HEX_DIRS.findIndex(([dq, dr]) => von.q + dq === nach.q && von.r + dr === nach.r);
  if (i < 0) return null;
  return (Object.entries(RICHTUNG).find(([, d]) => d === i)?.[0] as Taste | undefined) ?? null;
}

/** Ob der Ritter ein Feld betreten kann (ohne Schleim darauf). */
export function betretbar(a: Abenteuer, q: number, r: number): boolean {
  return begehbar(gelaende(a.seed, q, r));
}
export const schrittKosten = (a: Abenteuer, q: number, r: number): number => kosten(gelaende(a.seed, q, r));

/**
 * Eine Taste im Zug: gehen, angreifen oder warten. Jeder Schritt ist ein Tick
 * der Spieluhr - danach huepfen die Schleime.
 */
export function taste(alt: Abenteuer, t: Taste): Abenteuer {
  if (alt.phase !== 'ziehen') return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  if (t === 's') {
    warten(a, 0);
    a.schritte -= 1;
    ticken(a, 1);
    return nachDemSchritt(a);
  }
  const dir = richtungFuer(t);
  if (dir === null) return alt;
  const d = HEX_DIRS[dir]!;
  const ziel = { q: a.pos.q + d[0], r: a.pos.r + d[1] };
  const feind = schleimAuf(a, ziel.q, ziel.r);
  if (feind) {
    angreifen(a, feind, 0);
    a.schritte -= 1;
    if (a.phase === 'ziehen') ticken(a, 1);
    return nachDemSchritt(a);
  }
  const g = gelaende(a.seed, ziel.q, ziel.r);
  if (!begehbar(g)) {
    melde(a, 'Dort ist Wasser - kein Weg hinueber.');
    return a;
  }
  const k = kosten(g);
  if (k > a.schritte) {
    melde(a, 'Fuer den Berg fehlen dir Schritte.');
    return a;
  }
  a.ereignisse.push({ art: 'gehen', takt: 0, wer: 'ritter', von: a.pos, nach: ziel });
  a.pos = ziel;
  a.schritte -= k;
  a.pfad = [...a.pfad, ziel];
  sehen(a);
  aufheben(a);
  // Ein Berg kostet zwei Ticks - die Schleime huepfen zweimal.
  for (let i = 1; i <= k && a.phase === 'ziehen'; i++) ticken(a, i);
  return nachDemSchritt(a);
}

/** Die restlichen Schritte abwarten: jeder ist ein Tick. */
export function zugBeenden(alt: Abenteuer): Abenteuer {
  if (alt.phase !== 'ziehen') return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  warten(a, 0);
  for (let i = 1; a.schritte > 0 && a.phase === 'ziehen'; i++) {
    a.schritte -= 1;
    ticken(a, i);
  }
  return nachDemSchritt(a);
}

/** Warten: einmal je Zug heilt es ein Leben, wenn kein Schleim nah ist. */
function warten(a: Abenteuer, takt: number): void {
  a.ereignisse.push({ art: 'warten', takt });
  const ruhig = !a.schleime.some((s) => hexDistance(s, a.pos) <= 2);
  if (ruhig && !a.geruht && a.leben < maxLebenVon(a)) {
    a.leben += 1;
    a.geruht = true;
    a.ereignisse.push({ art: 'heil', takt, leben: 1 });
    melde(a, 'Du verschnaufst: +1 Leben.');
  } else if (!ruhig) melde(a, 'Du wartest - zu unruhig zum Verschnaufen, Schleime sind nah.');
}

function nachDemSchritt(a: Abenteuer): Abenteuer {
  if (a.phase !== 'ziehen' || a.schritte > 0) return a;
  a.schritte = 0;
  a.phase = 'wuerfeln';
  a.zug += 1;
  a.wurf = null;
  a.geruht = false;
  return a;
}

function angreifen(a: Abenteuer, s: Schleim, takt: number): void {
  const wurf = w6(a);
  const summeWurf = wurf + angriffVon(a);
  const schaden = summeWurf >= 4 ? (wurf === 6 ? 2 : 1) : 0;
  a.ereignisse.push({ art: 'hieb', takt, wer: 'ritter', ziel: s.id, wurf, schaden });
  if (schaden === 0) {
    melde(a, `Wurf ${wurf}+${angriffVon(a)}: daneben.`);
    return;
  }
  s.leben -= schaden;
  if (s.leben > 0) {
    melde(a, `Wurf ${wurf}+${angriffVon(a)}: Treffer${schaden > 1 ? ' (doppelt)' : ''} - der Schleim wankt.`);
    return;
  }
  a.schleime = a.schleime.filter((x) => x.id !== s.id);
  a.ereignisse.push({ art: 'tod', takt, wer: s.id, q: s.q, r: s.r, gross: s.gross });
  a.erschlagen += 1;
  const gelee = s.gross ? 2 : 1;
  a.inventar = { ...a.inventar, gelee: (a.inventar['gelee'] ?? 0) + gelee };
  melde(a, `Wurf ${wurf}+${angriffVon(a)}: der ${s.gross ? 'grosse ' : ''}Schleim zerplatzt! +${gelee} Gelee (${a.erschlagen}/${ZIEL_SCHLEIME}).`);
  if (a.erschlagen >= ZIEL_SCHLEIME) {
    a.phase = 'sieg';
    melde(a, 'Zehn Schleime erschlagen - das Land atmet auf. Sieg!');
  }
}

function aufheben(a: Abenteuer): void {
  const fund = fundAuf(a, a.pos.q, a.pos.r);
  if (!fund) return;
  // Herzen werden beim Aufheben gleich verbraucht. Bei vollem Leben bleiben
  // sie liegen, fuer spaeter - nichts geht verloren.
  const herz = gegenstand(fund);
  if ((fund === 'herz' || fund === 'halbherz') && herz?.heilt) {
    if (a.leben >= maxLebenVon(a)) {
      melde(a, `Volles Leben - das ${herz.name} bleibt liegen.`);
      return;
    }
    a.genommen = [...a.genommen, hexKey(a.pos.q, a.pos.r)];
    const plus = Math.min(herz.heilt, maxLebenVon(a) - a.leben);
    a.leben += plus;
    a.ereignisse.push({ art: 'heil', takt: 0, leben: plus });
    melde(a, `${herz.name}: +${lebenText(plus)} Leben.`);
    return;
  }
  a.genommen = [...a.genommen, hexKey(a.pos.q, a.pos.r)];
  a.ereignisse.push({ art: 'fund', takt: 0, id: fund });
  if (fund === 'truhe') {
    const inhalt = TRUHENINHALT[hash3i(a.seed, a.pos.q, a.pos.r, SALT_FUND + 1) % TRUHENINHALT.length]!;
    const g = gegenstand(inhalt)!;
    if (g.slot && a.ausruestung[g.slot] === null) {
      a.ausruestung = { ...a.ausruestung, [g.slot]: inhalt };
      if (g.leben) a.leben += g.leben;
      melde(a, `Eine Truhe! Darin: ${g.name} - sofort angelegt.`);
    } else {
      a.inventar = { ...a.inventar, [inhalt]: (a.inventar[inhalt] ?? 0) + 1 };
      melde(a, `Eine Truhe! Darin: ${g.name} - ins Inventar.`);
    }
    return;
  }
  const g = gegenstand(fund);
  a.inventar = { ...a.inventar, [fund]: (a.inventar[fund] ?? 0) + 1 };
  melde(a, `Gefunden: ${g?.name ?? fund}.`);
}

/** Leben mit halben Herzen: 1, 0.5 -> "1", "½", 1.5 -> "1½". */
export function lebenText(n: number): string {
  const ganz = Math.floor(n);
  const halb = n - ganz >= 0.5;
  return ganz === 0 && halb ? '½' : `${ganz}${halb ? '½' : ''}`;
}

/**
 * Ein Tick der Spieluhr. Jeder Schleim tut eines: neben dem Ritter springt er
 * ihn an, in Witterung huepft er naeher, sonst huepft er mal hierhin, mal
 * dorthin. Grosse Schleime sind traege und handeln nur jeden zweiten Tick.
 */
function ticken(a: Abenteuer, takt: number): void {
  a.zeit += 1;
  const rng = new Rng(a.rng);
  const besetzt = (q: number, r: number) => (q === a.pos.q && r === a.pos.r) || a.schleime.some((s) => s.q === q && s.r === r);
  for (const s of a.schleime) {
    if (s.gross && a.zeit % 2 === 1) continue;
    const d = hexDistance(s, a.pos);
    // Ein angesagter Angriff trifft sein Feld - steht der Ritter nicht mehr
    // darauf, geht er ins Leere. Ein Schild faengt jeden dritten Hieb ab.
    if (s.angriff) {
      const feld = s.angriff;
      s.angriff = null;
      const wurf = 1 + rng.int(6);
      if (feld.q !== a.pos.q || feld.r !== a.pos.r) {
        a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: null, feld, wurf, schaden: 0 });
        melde(a, 'Ausgewichen! Der Schleim klatscht ins Leere.');
        continue;
      }
      const schaden = wurf <= abwehrVon(a) * 2 ? 0 : s.gross ? 2 : 1;
      a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: 'ritter', feld, wurf, schaden });
      if (schaden > 0) {
        a.leben -= schaden;
        melde(a, `Ein ${s.gross ? 'grosser ' : ''}Schleim trifft dich: -${schaden} Leben.`);
      } else melde(a, 'Dein Schild faengt den Schleim ab.');
      continue;
    }
    // Neben dem Ritter holt er aus und sagt das Feld an - wer weggeht, entkommt.
    if (d === 1) {
      s.angriff = { q: a.pos.q, r: a.pos.r };
      a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: s.angriff });
      melde(a, `Ein ${s.gross ? 'grosser ' : ''}Schleim holt aus - weich aus oder schlag zu!`);
      continue;
    }
    let ziel: Hex | null = null;
    if (d <= WITTERUNG) {
      // Einen Hops naeher heran, nie ins Wasser und nicht auf einen anderen.
      for (const [dq, dr] of HEX_DIRS) {
        const n = { q: s.q + dq, r: s.r + dr };
        if (!begehbar(gelaende(a.seed, n.q, n.r)) || besetzt(n.q, n.r)) continue;
        if (hexDistance(n, a.pos) < hexDistance(ziel ?? s, a.pos)) ziel = n;
      }
    } else if (rng.int(3) === 0) {
      const [dq, dr] = HEX_DIRS[rng.int(6)]!;
      const n = { q: s.q + dq, r: s.r + dr };
      if (begehbar(gelaende(a.seed, n.q, n.r)) && !besetzt(n.q, n.r)) ziel = n;
    }
    if (ziel) {
      a.ereignisse.push({ art: 'gehen', takt, wer: s.id, von: { q: s.q, r: s.r }, nach: ziel });
      a.spuren = { ...a.spuren, [s.id]: [...(a.spuren[s.id] ?? [{ q: s.q, r: s.r }]), ziel] };
      s.q = ziel.q;
      s.r = ziel.r;
    }
  }
  if (a.zeit % NACHSCHUB === 0) {
    for (let versuch = 0; versuch < 12; versuch++) {
      const dir = HEX_DIRS[rng.int(6)]!;
      const weit = 6 + rng.int(3);
      const q = a.pos.q + dir[0] * weit + (rng.int(3) - 1);
      const r = a.pos.r + dir[1] * weit + (rng.int(3) - 1);
      if (!begehbar(gelaende(a.seed, q, r)) || besetzt(q, r)) continue;
      const gross = rng.int(4) === 0;
      const id = a.naechsteId++;
      a.schleime.push({ id, q, r, leben: gross ? 4 : 2, gross });
      a.ereignisse.push({ art: 'neu', takt, wer: id });
      break;
    }
  }
  a.rng = rng.getState();
  if (a.leben <= 0) {
    a.leben = 0;
    a.phase = 'tot';
    melde(a, 'Der Ritter faellt. Das Abenteuer ist zu Ende.');
  }
}

/** Alte Spielstaende (vor der Spieluhr) auf den heutigen Stand bringen. */
export function normalisiere(a: Abenteuer): Abenteuer {
  a.zeit ??= 0;
  a.ereignisse ??= [];
  a.geruht ??= false;
  a.spuren ??= {};
  return a;
}

/** Einen Gegenstand aus dem Inventar benutzen: Kraut heilt, Ausruestung wird angelegt. */
export function benutzen(alt: Abenteuer, id: string): Abenteuer {
  if (alt.phase === 'tot' || alt.phase === 'sieg' || !(alt.inventar[id] ?? 0)) return alt;
  const g = gegenstand(id);
  if (!g) return alt;
  const a = structuredClone(alt);
  const weg = () => {
    const n = (a.inventar[id] ?? 0) - 1;
    const inv = { ...a.inventar };
    if (n > 0) inv[id] = n;
    else delete inv[id];
    a.inventar = inv;
  };
  if (g.heilt) {
    if (a.leben >= maxLebenVon(a)) return alt;
    const plus = Math.min(g.heilt, maxLebenVon(a) - a.leben);
    a.leben += plus;
    weg();
    a.ereignisse = [{ art: 'heil', takt: 0, leben: plus }];
    melde(a, `${g.name}: +${lebenText(plus)} Leben.`);
    return a;
  }
  if (g.slot) {
    const vorher = a.ausruestung[g.slot];
    weg();
    if (vorher) a.inventar = { ...a.inventar, [vorher]: (a.inventar[vorher] ?? 0) + 1 };
    a.ausruestung = { ...a.ausruestung, [g.slot]: id };
    a.leben = Math.min(maxLebenVon(a), a.leben + (g.leben ?? 0));
    melde(a, `${g.name} angelegt${vorher ? `, ${gegenstand(vorher)?.name} ins Inventar` : ''}.`);
    return a;
  }
  return alt;
}
