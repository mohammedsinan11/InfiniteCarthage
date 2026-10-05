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
 * herum). Wasser ist nicht zu betreten, Berge kosten zwei Schritte (der
 * letzte reicht aber immer zum Hinaufklettern). Ein Schritt auf einen Schleim ist ein Angriff, S wartet.
 *
 * DIE SPIELUHR. Jeder Schritt ist ein Tick, und in jedem Tick huepfen die
 * Schleime mit: naeher heran, wenn sie den Ritter wittern, und neben ihm
 * springen sie ihn an. Wer zieht, laesst die Welt ziehen.
 *
 * SAMMELN. Auf manchen Feldern liegt etwas: Kraeuter, Gold, Truhen mit
 * Ausruestung. Wer das Feld betritt, nimmt es mit. Erschlagene Schleime
 * lassen Gelee zurueck.
 *
 * ZIEL. Nach BOSS_NACH Schleimen erwacht der Schleimkoenig; wer ihn
 * bezwingt, gewinnt. Faellt der Ritter, ist das Abenteuer vorbei.
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

/**
 * FAEHIGKEITEN der Waffen (Ladebalken):
 *   feuerkreis  alle Gegner rundum nehmen 2 Schaden (Flammenschwert)
 *   runenblitz  ein Blitz trifft den naechsten Gegner bis 3 Felder weit, 2 Schaden (Runenklinge)
 *   spalthieb   der naechste Treffer macht 2 Schaden mehr (Streitaxt)
 *   schutzwall  der naechste Treffer gegen den Ritter wird abgefangen (Breitschwert)
 */
export type Faehigkeit = 'feuerkreis' | 'runenblitz' | 'spalthieb' | 'schutzwall';
export const FAEHIGKEIT_NAME: Record<Faehigkeit, string> = {
  feuerkreis: 'Feuerkreis',
  runenblitz: 'Runenblitz',
  spalthieb: 'Spalthieb',
  schutzwall: 'Schutzwall',
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
  /** Legendaer: veraendert das Spiel grundsaetzlich, wirkt gleich beim Aufheben. */
  legendaer?: boolean;
  /** Waffen: so viel Schaden bei einer gewuerfelten 6 (sonst 2). */
  krit?: number;
  /**
   * Waffen mit Faehigkeit: so viele Ladungen bis zur Faehigkeit. Jeder
   * Schritt und jeder Treffer laedt eins; ist der Balken voll, wirkt sie.
   */
  ladung?: number;
  faehigkeit?: Faehigkeit;
};

export const GEGENSTAENDE: readonly Gegenstand[] = [
  { id: 'schwert', name: 'Schwert', slot: 'waffe', angriff: 1, text: '+1 auf jeden Angriffswurf.' },
  { id: 'axt', name: 'Streitaxt', slot: 'waffe', angriff: 2, ladung: 5, faehigkeit: 'spalthieb', text: '+2 auf jeden Angriffswurf. Ladung 5: Spalthieb - der naechste Treffer macht 2 Schaden mehr.' },
  { id: 'breitschwert', name: 'Breitschwert', slot: 'waffe', angriff: 2, ladung: 6, faehigkeit: 'schutzwall', text: '+2 auf jeden Angriffswurf. Ladung 6: Schutzwall - der naechste Treffer gegen dich wird abgefangen.' },
  { id: 'runenklinge', name: 'Runenklinge', slot: 'waffe', angriff: 2, krit: 3, ladung: 5, faehigkeit: 'runenblitz', text: '+2 auf jeden Angriffswurf; eine 6 trifft dreifach. Ladung 5: Runenblitz - 2 Schaden am naechsten Gegner (bis 3 Felder).' },
  { id: 'flammenschwert', name: 'Flammenschwert', slot: 'waffe', angriff: 3, ladung: 7, faehigkeit: 'feuerkreis', text: '+3 auf jeden Angriffswurf. Ladung 7: Feuerkreis - alle Gegner rundum nehmen 2 Schaden.' },
  { id: 'schild', name: 'Schild', slot: 'schild', abwehr: 1, text: 'Schleime brauchen eine Augenzahl mehr, um zu treffen.' },
  { id: 'helm', name: 'Helm', slot: 'kopf', leben: 1, text: '+1 Leben.' },
  { id: 'ruestung', name: 'Kettenhemd', slot: 'koerper', leben: 2, text: '+2 Leben.' },
  { id: 'stiefel', name: 'Reitstiefel', slot: 'fuesse', schritte: 1, text: '+1 Schritt je Wurf.' },
  { id: 'laterne', name: 'Laterne', slot: 'zubehoer', sicht: 1, text: 'Du siehst ein Feld weiter.' },
  { id: 'kraut', name: 'Heilkraut', heilt: 2, text: 'Antippen: 2 Leben zurueck.' },
  { id: 'herz', name: 'Herz', heilt: 1, text: 'Ein ganzes Leben, gleich beim Aufheben. Bei vollem Leben bleibt es liegen.' },
  { id: 'halbherz', name: 'Halbes Herz', heilt: 0.5, text: 'Ein halbes Leben, gleich beim Aufheben. Bei vollem Leben bleibt es liegen.' },
  {
    id: 'sololeveling',
    name: 'Solo-Leveling',
    legendaer: true,
    text: 'Legendaer. Du bekommst Level: jeder erschlagene Gegner gibt Erfahrung, jeder Aufstieg macht dich staerker (Leben, Angriff, Abwehr im Wechsel).',
  },
  {
    id: 'extraleben',
    name: 'Extra-Leben',
    legendaer: true,
    text: 'Legendaer. Faellt der Ritter, steht er mit vollem Leben wieder auf - einmal.',
  },
  {
    id: 'hermes',
    name: 'Hermes-Stiefel',
    legendaer: true,
    text: 'Legendaer. Jeder Schritt huepft bis zu drei Felder weit, wenn das Feld frei ist - auch uebers Wasser.',
  },
  {
    id: 'herzcontainer',
    name: 'Leerer Herzcontainer',
    legendaer: true,
    text: 'Legendaer. Ein Herz mehr - leer, es will erst gefuellt werden.',
  },
  { id: 'angel', name: 'Angel', text: 'Am Wasser: in Richtung Wasser gehen (oder F) wirft die Angel aus - ein Schritt. Mit Glueck beisst ein Fisch.' },
  { id: 'fisch', name: 'Fisch', heilt: 1, text: 'Antippen: 1 Leben zurueck. Stapelt sich.' },
  { id: 'gold', name: 'Gold', text: 'Muenzen - sie stehen ueber dem Inventar. Noch kauft hier niemand etwas.' },
  { id: 'gelee', name: 'Schleimgelee', text: 'Was ein Schleim zuruecklaesst - der Beweis deiner Taten.' },
];

export const gegenstand = (id: string): Gegenstand | undefined => GEGENSTAENDE.find((g) => g.id === id);

/** Was in Truhen liegen kann - das Schwert traegt der Ritter schon. */
const TRUHENINHALT = ['axt', 'breitschwert', 'runenklinge', 'flammenschwert', 'schild', 'helm', 'ruestung', 'stiefel', 'laterne', 'angel'];

/** Wie gut eine Waffe ist - fuer "die bessere gleich in die Hand". */
const waffenWert = (id: string | null): number => {
  const g = gegenstand(id ?? '');
  return g ? (g.angriff ?? 0) * 2 + ((g.krit ?? 2) - 2) : -1;
};

export type Schleim = {
  id: number;
  q: number;
  r: number;
  leben: number;
  gross: boolean;
  /** Angesagter Angriff: dieses Feld trifft er in seinem naechsten Takt. */
  angriff?: Hex | null;
  /** Der Schleimkoenig (BOSS): ein Boss statt eines gewoehnlichen Schleims. */
  boss?: boolean;
  /** Besondere Schleime (SCHLEIMARTEN); ohne Art ein gewoehnlicher. */
  art?: SchleimArt;
  /** Angesagter Flaechenschlag des Koenigs: alle diese Felder trifft er. */
  flaeche?: Hex[] | null;
  /** Wie oft der Koenig schon gehandelt hat - fuer seinen Rhythmus. */
  zaehler?: number;
};

export type Phase = 'wuerfeln' | 'ziehen' | 'tot' | 'sieg';

/**
 * SCHLEIMARTEN - jede verlangt eine andere Antwort:
 *   spuck   Spuckschleim: spuckt aus zwei, drei Feldern Abstand in gerader
 *           Linie; die Linie gluet vorher rot - seitlich heraustreten.
 *   spring  Springschleim: springt zwei Felder weit und sagt sein Landefeld
 *           an; wer darauf stehen bleibt, wird getroffen, sonst landet er dort.
 *   panzer  Panzerschleim: Steinpanzer - getroffen erst ab 5 statt 4, drei
 *           Leben, traege (jeder zweite Tick); gibt zwei Gelee.
 */
export type SchleimArt = 'spuck' | 'spring' | 'panzer';
export const SCHLEIM_NAME: Record<SchleimArt, string> = { spuck: 'Spuckschleim', spring: 'Springschleim', panzer: 'Panzerschleim' };

/** Ein neuer Schleim: die Art aus einer Zahl 0..99 - gut die Haelfte gewoehnlich. */
function neuerSchleim(id: number, q: number, r: number, zahl: number, fern: boolean): Schleim {
  if (zahl < 16) return { id, q, r, leben: 2, gross: false, art: 'spuck' };
  if (zahl < 32) return { id, q, r, leben: 2, gross: false, art: 'spring' };
  if (zahl < 45) return { id, q, r, leben: 3, gross: false, art: 'panzer' };
  const gross = fern && zahl % 3 === 0;
  return { id, q, r, leben: gross ? 4 : 2, gross };
}

/** Wie man ihn nennt - mit "Der" davor. */
export function schleimName(s: Pick<Schleim, 'boss' | 'art' | 'gross'>): string {
  if (s.boss) return 'Schleimkoenig';
  if (s.art) return SCHLEIM_NAME[s.art];
  return s.gross ? 'grosse Schleim' : 'Schleim';
}

/** Hoechstes Leben eines Schleims - fuer die Lebensbalken. */
export function schleimMaxLeben(s: Pick<Schleim, 'boss' | 'art' | 'gross'>): number {
  if (s.boss) return BOSS_LEBEN;
  if (s.art === 'panzer') return 3;
  return s.gross ? 4 : 2;
}

/** Wer handelt: der Ritter oder ein Schleim (seine id). */
export type Wer = 'ritter' | number;

/**
 * Was in einer Aktion geschah, Takt fuer Takt - fuer die Bewegung im Bild.
 * Takt 0 ist der Ritter, jeder weitere Takt ein Tick der Spieluhr.
 */
export type Ereignis =
  | { art: 'gehen'; takt: number; wer: Wer; von: Hex; nach: Hex; sprung?: boolean }
  /** Ein Spuckschleim spuckt seine Linie entlang. */
  | { art: 'spuck'; takt: number; wer: number; felder: Hex[] }
  /** Ein Hieb; ziel null heisst: ins Leere, der Ritter ist ausgewichen. */
  | { art: 'hieb'; takt: number; wer: Wer; ziel: Wer | null; feld?: Hex; wurf: number; schaden: number }
  /** Ein Schleim holt aus: im naechsten Takt trifft er dieses Feld (der Koenig auch mehrere). */
  | { art: 'ansage'; takt: number; wer: number; feld: Hex; felder?: Hex[] }
  /** Die Angel wird ausgeworfen - mit oder ohne Fang. */
  | { art: 'angeln'; takt: number; feld: Hex; fang: boolean }
  /** Das Extra-Leben: der Ritter steht wieder auf. */
  | { art: 'wiederbelebt'; takt: number }
  /** Ein legendaerer Fund wirkt. */
  | { art: 'legende'; takt: number; id: string }
  /** Solo-Leveling: ein Levelaufstieg. */
  | { art: 'stufe'; takt: number; lv: number; bonus: string }
  /** Der Koenig springt und schlaegt auf - alle angesagten Felder beben. */
  | { art: 'stampf'; takt: number; wer: number; felder: Hex[] }
  /** Eine Waffe entfesselt ihre Faehigkeit (Ladebalken voll). */
  | { art: 'faehigkeit'; takt: number; name: Faehigkeit; felder?: Hex[]; ziel?: number }
  /** Der Schleimkoenig erwacht. */
  | { art: 'boss'; takt: number; wer: number }
  | { art: 'tod'; takt: number; wer: number; q: number; r: number; gross: boolean; boss?: boolean; schleimArt?: SchleimArt }
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
  /** Ist der Schleimkoenig schon erwacht? */
  bossErwacht?: boolean;
  /** Was zuletzt geschah, neueste zuletzt. */
  log: string[];
  /** Die Ereignisse der letzten Aktion - nur fuers Bild. */
  ereignisse: Ereignis[];
  /** Die Wege der Schleime in diesem Zug (mit Startfeld) - fuer ihre Pfeile. */
  spuren: Record<number, Hex[]>;
  /** Legendaere Funde, in der Reihenfolge des Findens. */
  legendaer?: string[];
  /** Solo-Leveling: Level und Erfahrung - fehlt, solange man es nicht hat. */
  stufe?: { lv: number; ep: number } | null;
  /** Dauerhafte Staerkung aus Leveln. */
  bonus?: { leben: number; angriff: number; abwehr: number };
  /** Extra-Leben, die noch nicht verbraucht sind. */
  extraLeben?: number;
  /** Leere Herzcontainer: so viele Herzen mehr. */
  extraHerzen?: number;
  /** Der Ladebalken der Waffe (0 bis ihre Ladung). */
  ladung?: number;
  /** Eine geladene Faehigkeit, die auf den naechsten Treffer wartet. */
  bereit?: Faehigkeit | null;
  /** In diesem Zug schon durch Warten geheilt. */
  geruht: boolean;
};

/**
 * DER SCHLEIMKOENIG. Nach BOSS_NACH erschlagenen Schleimen erwacht er und
 * kommt auf den Ritter zu. Wer ihn bezwingt, gewinnt das Abenteuer. Er ist
 * gross und traege - er handelt nur jeden zweiten Tick -, darum hat der Ritter
 * zwischen Ansage und Schlag einen Zug fuer einen Hieb und einen zum
 * Ausweichen. Sein Rhythmus: auf den Ritter zuwalzen, einen Schlag aufs Feld
 * des Ritters ansagen (2 Schaden), jedes dritte Mal den ganzen Ring um sich
 * (dann hilft nur ein Schritt weg), und jedes vierte Mal spaltet er einen
 * kleinen Schleim ab.
 */
export const BOSS_NACH = 8;
export const BOSS_LEBEN = 10;
const BOSS_SCHADEN = 2;
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
  // Ganz selten eine goldene Schatztruhe mit einem legendaeren Fund.
  if (hash3i(a.seed, q, r, SALT_FUND + 7) % 300 === 0) return 'schatz';
  const h = hash3i(a.seed, q, r, SALT_FUND) % 100;
  // Ausruestung liegt offen da - man sieht, was es ist.
  if (h < 3) return TRUHENINHALT[hash3i(a.seed, q, r, SALT_FUND + 1) % TRUHENINHALT.length]!;
  if (h < 7 && (t === 'forest' || t === 'pasture' || t === 'field')) return 'kraut';
  if (h < 9) return 'gold';
  // Der Beutel: was drin ist, zeigt sich erst beim Oeffnen.
  if (h < 10) return 'beutel';
  if (h < 11) return 'halbherz';
  if (h < 12) return 'herz';
  return null;
}

// --- Werte aus der Ausruestung --------------------------------------------

const summe = (a: Abenteuer, f: (g: Gegenstand) => number | undefined): number =>
  SLOTS.reduce((n, s) => n + (f(gegenstand(a.ausruestung[s] ?? '') ?? ({} as Gegenstand)) ?? 0), 0);
export const angriffVon = (a: Abenteuer) => summe(a, (g) => g.angriff) + (a.bonus?.angriff ?? 0);
export const abwehrVon = (a: Abenteuer) => summe(a, (g) => g.abwehr) + (a.bonus?.abwehr ?? 0);
export const maxLebenVon = (a: Abenteuer) => GRUND_LEBEN + summe(a, (g) => g.leben) + (a.bonus?.leben ?? 0) + (a.extraHerzen ?? 0);
export const sichtVon = (a: Abenteuer) => GRUND_SICHT + summe(a, (g) => g.sicht);
const schrittBonus = (a: Abenteuer) => summe(a, (g) => g.schritte);
export const schrittBonusVon = schrittBonus;

// --- Beginn ---------------------------------------------------------------

/**
 * Wo der Ritter beginnt: auf flachem Land, so nah am Ursprung wie moeglich,
 * und nicht auf einem Inselchen - mindestens drei begehbare Nachbarn. Die
 * Suche waechst Ring um Ring (Spieltest: bei einem von zwanzig Seeds lag im
 * Umkreis von sechs Feldern kein Land, und der Ritter stand im Wasser).
 */
function startFeld(seed: number, o: Hex = { q: 0, r: 0 }): Hex {
  let notfall: Hex | null = null;
  for (let ring = 0; ring <= 60; ring++) {
    weltVon(seed, o, ring + 2);
    for (const h of hexesInRange(o, ring)) {
      if (hexDistance(h, o) !== ring) continue;
      const t = gelaende(seed, h.q, h.r);
      if (!begehbar(t) || t === 'mountain') continue;
      notfall ??= h;
      const nachbarn = HEX_DIRS.filter(([dq, dr]) => begehbar(gelaende(seed, h.q + dq, h.r + dr))).length;
      if (nachbarn >= 3) return h;
    }
  }
  return notfall ?? o;
}

export function neuesAbenteuer(seed: number): Abenteuer {
  const start = startFeld(seed);
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
    a.schleime.push(neuerSchleim(a.naechsteId++, h.q, h.r, hash3i(seed, h.q, h.r, SALT_SCHLEIM + 1) % 100, d > 8));
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
  const t = gelaende(a.seed, q, r);
  return begehbar(t) || (t === 'water' && hatLegende(a, 'hermes'));
}

/** Traegt der Ritter diesen legendaeren Fund? */
export const hatLegende = (a: Pick<Abenteuer, 'legendaer'>, id: string): boolean => (a.legendaer ?? []).includes(id);
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
  const hermes = hatLegende(a, 'hermes');
  // Mit der Angel: in Richtung Wasser wirft man sie aus (ohne Hermes-Stiefel).
  if (g === 'water' && !hermes && (a.inventar['angel'] ?? 0) > 0) {
    auswerfen(a, ziel);
    return nachDemSchritt(a);
  }
  // Hermes-Stiefel: bis zu drei Felder weit huepfen, wo es frei ist - auch aufs Wasser.
  if (hermes) {
    let landung: Hex | null = null;
    for (let k = 3; k >= 1 && !landung; k--) {
      const h = { q: a.pos.q + d[0] * k, r: a.pos.r + d[1] * k };
      if (betretbar(a, h.q, h.r) && !schleimAuf(a, h.q, h.r)) landung = h;
    }
    if (!landung) {
      melde(a, 'Kein freies Feld zum Huepfen.');
      return a;
    }
    a.ereignisse.push({ art: 'gehen', takt: 0, wer: 'ritter', von: a.pos, nach: landung, sprung: hexDistance(a.pos, landung) > 1 });
    a.pos = landung;
    a.schritte -= 1;
    a.pfad = [...a.pfad, landung];
    sehen(a);
    aufheben(a);
    laden(a, 0);
    ticken(a, 1);
    return nachDemSchritt(a);
  }
  if (!begehbar(g)) {
    melde(a, 'Dort ist Wasser - kein Weg hinueber.');
    return a;
  }
  // Ein Berg kostet zwei Schritte - fehlt einer, reicht der letzte trotzdem
  // zum Hinaufklettern. Sonst sass man zwischen Bergen fest, sobald nur
  // eine 1 fiel.
  const k = Math.min(kosten(g), a.schritte);
  a.ereignisse.push({ art: 'gehen', takt: 0, wer: 'ritter', von: a.pos, nach: ziel });
  a.pos = ziel;
  a.schritte -= k;
  a.pfad = [...a.pfad, ziel];
  sehen(a);
  aufheben(a);
  laden(a, 0);
  // Ein Berg kostet zwei Ticks - die Schleime huepfen zweimal.
  for (let i = 1; i <= k && a.phase === 'ziehen'; i++) ticken(a, i);
  return nachDemSchritt(a);
}

/** Die Angel auswerfen: ein Schritt, ein Tick - bei 4 bis 6 beisst ein Fisch. */
function auswerfen(a: Abenteuer, feld: Hex): void {
  const wurf = w6(a);
  const fang = wurf >= 4;
  a.ereignisse.push({ art: 'angeln', takt: 0, feld, fang });
  if (fang) {
    a.inventar = { ...a.inventar, fisch: (a.inventar['fisch'] ?? 0) + 1 };
    melde(a, `Angel ausgeworfen (Wurf ${wurf}) - ein Fisch beisst an!`);
  } else melde(a, `Angel ausgeworfen (Wurf ${wurf}) - nichts beisst.`);
  a.schritte -= 1;
  ticken(a, 1);
}

/** Die Angel ins naechste Wasser werfen (Taste F oder Knopf). */
export function angeln(alt: Abenteuer): Abenteuer {
  if (alt.phase !== 'ziehen' || !(alt.inventar['angel'] ?? 0)) return alt;
  const feld = HEX_DIRS.map(([dq, dr]) => ({ q: alt.pos.q + dq, r: alt.pos.r + dr })).find((h) => gelaende(alt.seed, h.q, h.r) === 'water');
  if (!feld) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  auswerfen(a, feld);
  return nachDemSchritt(a);
}

/** Steht der Ritter am Wasser (und hat eine Angel)? */
export const kannAngeln = (a: Abenteuer): boolean =>
  a.phase === 'ziehen' && (a.inventar['angel'] ?? 0) > 0 && HEX_DIRS.some(([dq, dr]) => gelaende(a.seed, a.pos.q + dq, a.pos.r + dr) === 'water');

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
  const krit = gegenstand(a.ausruestung.waffe ?? '')?.krit ?? 2;
  // Der Panzer will einen kraeftigeren Hieb.
  const noetig = s.art === 'panzer' ? 5 : 4;
  let schaden = summeWurf >= noetig ? (wurf === 6 ? krit : 1) : 0;
  // Ein geladener Spalthieb legt beim naechsten Treffer zwei drauf.
  const spalt = schaden > 0 && a.bereit === 'spalthieb';
  if (spalt) {
    schaden += 2;
    a.bereit = null;
  }
  a.ereignisse.push({ art: 'hieb', takt, wer: 'ritter', ziel: s.id, wurf, schaden });
  if (schaden === 0) {
    melde(a, `Wurf ${wurf}+${angriffVon(a)}: ${s.art === 'panzer' ? 'prallt am Steinpanzer ab (ab 5)' : 'daneben'}.`);
    return;
  }
  const vorne = `Wurf ${wurf}+${angriffVon(a)}${spalt ? ', Spalthieb' : ''}`;
  verwunde(a, s, schaden, takt, vorne);
  // Ein Treffer laedt die Waffe.
  if (a.phase === 'ziehen') laden(a, takt);
}

/** Schaden an einem Schleim - stirbt er, zerplatzt er (und der Koenig erwacht vielleicht). */
function verwunde(a: Abenteuer, s: Schleim, schaden: number, takt: number, vorne: string): void {
  s.leben -= schaden;
  if (s.leben > 0) {
    melde(a, `${vorne}: Treffer${schaden > 1 ? ` (${schaden} Schaden)` : ''} - der ${schleimName(s)} wankt.`);
    return;
  }
  a.schleime = a.schleime.filter((x) => x.id !== s.id);
  a.ereignisse.push({ art: 'tod', takt, wer: s.id, q: s.q, r: s.r, gross: s.gross, ...(s.boss ? { boss: true } : {}), ...(s.art ? { schleimArt: s.art } : {}) });
  erfahrung(a, s.boss ? 10 : s.gross || s.art ? 2 : 1, takt);
  if (s.boss) {
    a.phase = 'sieg';
    melde(a, `${vorne}: der Schleimkoenig zerplatzt! Das Land atmet auf - Sieg!`);
    return;
  }
  a.erschlagen += 1;
  const gelee = s.gross || s.art === 'panzer' ? 2 : 1;
  a.inventar = { ...a.inventar, gelee: (a.inventar['gelee'] ?? 0) + gelee };
  const bisKoenig = a.bossErwacht ? '' : ` (${Math.min(a.erschlagen, BOSS_NACH)}/${BOSS_NACH})`;
  melde(a, `${vorne}: der ${schleimName(s)} zerplatzt! +${gelee} Gelee${bisKoenig}.`);
  if (!a.bossErwacht && a.erschlagen >= BOSS_NACH) bossErwacht(a, takt);
}

/** Legendaer: gleich beim Aufheben wirkt der Fund. */
export function legendaerAnwenden(a: Abenteuer, id: string, takt: number): void {
  a.legendaer = [...(a.legendaer ?? []), id];
  a.ereignisse.push({ art: 'legende', takt, id });
  if (id === 'sololeveling') {
    if (!a.stufe) a.stufe = { lv: 1, ep: 0 };
    melde(a, 'Legendaer: Solo-Leveling! Du hast jetzt Level - jeder Gegner gibt Erfahrung.');
  } else if (id === 'herzcontainer') {
    a.extraHerzen = (a.extraHerzen ?? 0) + 1;
    melde(a, 'Legendaer: ein leerer Herzcontainer - ein Herz mehr.');
  } else if (id === 'extraleben') {
    a.extraLeben = (a.extraLeben ?? 0) + 1;
    melde(a, 'Legendaer: ein Extra-Leben! Faellst du, stehst du wieder auf.');
  } else if (id === 'hermes') {
    melde(a, 'Legendaer: Hermes-Stiefel! Jeder Schritt huepft bis zu drei Felder - auch uebers Wasser.');
  }
}

/** Erfahrung bis zum naechsten Level. */
export const epFuer = (lv: number): number => 2 + lv;
/** Was jeder Aufstieg bringt - im Wechsel. */
const STUFEN_BONUS: readonly ('leben' | 'angriff' | 'abwehr')[] = ['leben', 'angriff', 'leben', 'abwehr'];

/** Solo-Leveling: Erfahrung sammeln und aufsteigen. */
function erfahrung(a: Abenteuer, ep: number, takt: number): void {
  if (!a.stufe) return;
  a.stufe = { ...a.stufe, ep: a.stufe.ep + ep };
  while (a.stufe.ep >= epFuer(a.stufe.lv)) {
    const lv: number = a.stufe.lv + 1;
    a.stufe = { lv, ep: a.stufe.ep - epFuer(a.stufe.lv) };
    const art = STUFEN_BONUS[(lv - 2) % STUFEN_BONUS.length]!;
    const b = a.bonus ?? { leben: 0, angriff: 0, abwehr: 0 };
    a.bonus = { ...b, [art]: b[art] + 1 };
    if (art === 'leben') a.leben += 1;
    const text = art === 'leben' ? '+1 Leben' : art === 'angriff' ? '+1 Angriff' : '+1 Abwehr';
    a.ereignisse.push({ art: 'stufe', takt, lv, bonus: text });
    melde(a, `Level ${lv}! ${text}.`);
  }
}

/** Die Ladung der Waffe - fuer Anzeige und Debug. */
export function ladungVon(a: Abenteuer): { ist: number; voll: number; faehigkeit: Faehigkeit | null } {
  const g = gegenstand(a.ausruestung.waffe ?? '');
  return { ist: a.ladung ?? 0, voll: g?.ladung ?? 0, faehigkeit: g?.faehigkeit ?? null };
}

/** Ein Schritt oder Treffer laedt die Waffe; ist sie voll, wirkt ihre Faehigkeit. */
function laden(a: Abenteuer, takt: number): void {
  const { voll, faehigkeit } = ladungVon(a);
  if (!voll || !faehigkeit || a.bereit === faehigkeit) return;
  a.ladung = (a.ladung ?? 0) + 1;
  if (a.ladung >= voll) {
    a.ladung = 0;
    entfessle(a, faehigkeit, takt);
  }
}

/** Die Faehigkeit der Waffe wirkt. */
export function entfessle(a: Abenteuer, f: Faehigkeit, takt: number): void {
  if (f === 'feuerkreis') {
    const felder = HEX_DIRS.map(([dq, dr]) => ({ q: a.pos.q + dq, r: a.pos.r + dr }));
    a.ereignisse.push({ art: 'faehigkeit', takt, name: f, felder });
    const opfer = a.schleime.filter((s) => hexDistance(s, a.pos) === 1);
    melde(a, opfer.length ? `Feuerkreis! Flammen schlagen um dich herum.` : 'Feuerkreis! - doch niemand steht nah genug.');
    for (const s of opfer) verwunde(a, s, 2, takt, 'Feuerkreis');
    return;
  }
  if (f === 'runenblitz') {
    const ziel = a.schleime
      .filter((s) => hexDistance(s, a.pos) <= 3)
      .sort((x, y) => hexDistance(x, a.pos) - hexDistance(y, a.pos) || x.leben - y.leben)[0];
    a.ereignisse.push({ art: 'faehigkeit', takt, name: f, ...(ziel ? { ziel: ziel.id, felder: [{ q: ziel.q, r: ziel.r }] } : {}) });
    if (!ziel) {
      melde(a, 'Runenblitz! - doch kein Gegner in Reichweite.');
      return;
    }
    verwunde(a, ziel, 2, takt, 'Runenblitz');
    return;
  }
  // Spalthieb und Schutzwall warten auf den naechsten Treffer.
  a.bereit = f;
  a.ereignisse.push({ art: 'faehigkeit', takt, name: f });
  melde(a, f === 'spalthieb' ? 'Spalthieb bereit: der naechste Treffer macht 2 Schaden mehr.' : 'Schutzwall bereit: der naechste Treffer gegen dich wird abgefangen.');
}

/** Der Schleimkoenig erwacht, ein Stueck entfernt, und sucht den Ritter. */
function bossErwacht(a: Abenteuer, takt: number): void {
  const frei = (q: number, r: number) =>
    begehbar(gelaende(a.seed, q, r)) && !(q === a.pos.q && r === a.pos.r) && !a.schleime.some((x) => x.q === q && x.r === r);
  const rng = new Rng(a.rng);
  let ort: Hex | null = null;
  for (let versuch = 0; versuch < 40 && !ort; versuch++) {
    const [dq, dr] = HEX_DIRS[rng.int(6)]!;
    const weit = 5 + rng.int(2);
    const h = { q: a.pos.q + dq * weit + rng.int(3) - 1, r: a.pos.r + dr * weit + rng.int(3) - 1 };
    if (frei(h.q, h.r)) ort = h;
  }
  // Zur Not das naechste freie Feld ab drei Schritten Abstand.
  ort ??= hexesInRange(a.pos, 8)
    .filter((h) => hexDistance(h, a.pos) >= 3 && frei(h.q, h.r))
    .sort((x, y) => hexDistance(x, a.pos) - hexDistance(y, a.pos))[0] ?? null;
  a.rng = rng.getState();
  if (!ort) return;
  const id = a.naechsteId++;
  a.schleime.push({ id, q: ort.q, r: ort.r, leben: BOSS_LEBEN, gross: true, boss: true, zaehler: 0 });
  a.bossErwacht = true;
  a.ereignisse.push({ art: 'neu', takt, wer: id }, { art: 'boss', takt, wer: id });
  melde(a, 'Der Boden bebt - der Schleimkoenig ist erwacht! Bezwinge ihn.');
}

function aufheben(a: Abenteuer): void {
  let fund = fundAuf(a, a.pos.q, a.pos.r);
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
  if (fund === 'schatz') {
    // Solo-Leveling gibt es einmal; danach (oder bei ungerader Zahl) ein Herzcontainer.
    // Solo-Leveling und Hermes gibt es je einmal; Herzcontainer und Extra-Leben oefter.
    const moeglich = ['sololeveling', 'hermes', 'extraleben', 'herzcontainer'].filter((x) => !((x === 'sololeveling' || x === 'hermes') && hatLegende(a, x)));
    const id = moeglich[hash3i(a.seed, a.pos.q, a.pos.r, SALT_FUND + 8) % moeglich.length]!;
    melde(a, 'Eine goldene Schatztruhe!');
    legendaerAnwenden(a, id, 0);
    return;
  }
  // Der Beutel: ein zufaelliger Fund - Vorrat, Muenzen oder Ausruestung.
  let woher = 'Gefunden';
  if (fund === 'beutel') {
    const BEUTEL = ['kraut', 'kraut', 'fisch', 'fisch', 'gold', 'gold', 'herz', ...TRUHENINHALT];
    fund = BEUTEL[hash3i(a.seed, a.pos.q, a.pos.r, SALT_FUND + 11) % BEUTEL.length]!;
    woher = 'Ein Beutel! Darin';
    if (fund === 'herz') {
      a.inventar = { ...a.inventar, herz: (a.inventar['herz'] ?? 0) + 1 };
      melde(a, `${woher}: ein Herz - ins Inventar.`);
      return;
    }
  }
  if (gegenstand(fund)?.slot || fund === 'angel') {
    const inhalt = fund;
    const g = gegenstand(inhalt)!;
    if (g.slot && a.ausruestung[g.slot] === null) {
      a.ausruestung = { ...a.ausruestung, [g.slot]: inhalt };
      if (g.leben) a.leben += g.leben;
      melde(a, `${woher}: ${g.name} - sofort angelegt.`);
    } else if (g.slot === 'waffe' && waffenWert(inhalt) > waffenWert(a.ausruestung.waffe)) {
      // Eine bessere Waffe nimmt der Ritter gleich in die Hand.
      const alt = a.ausruestung.waffe!;
      a.ausruestung = { ...a.ausruestung, waffe: inhalt };
      a.ladung = 0;
      a.bereit = null;
      a.inventar = { ...a.inventar, [alt]: (a.inventar[alt] ?? 0) + 1 };
      melde(a, `${woher}: ${g.name} - gleich in der Hand, ${gegenstand(alt)?.name ?? alt} ins Inventar.`);
    } else {
      a.inventar = { ...a.inventar, [inhalt]: (a.inventar[inhalt] ?? 0) + 1 };
      melde(a, `${woher}: ${g.name} - ins Inventar.`);
    }
    return;
  }
  const g = gegenstand(fund);
  // Gold sind Muenzen - eins bis drei auf einmal.
  if (fund === 'gold') {
    const n = 1 + (hash3i(a.seed, a.pos.q, a.pos.r, SALT_FUND + 9) % 3);
    a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) + n };
    melde(a, `${n} ${n === 1 ? 'Goldmuenze' : 'Goldmuenzen'} gefunden.`);
    return;
  }
  a.inventar = { ...a.inventar, [fund]: (a.inventar[fund] ?? 0) + 1 };
  melde(a, `Gefunden: ${g?.name ?? fund}.`);
}

/** Leben mit halben Herzen: 1, 0.5 -> "1", "½", 1.5 -> "1½". */
export function lebenText(n: number): string {
  const ganz = Math.floor(n);
  const halb = n - ganz >= 0.5;
  return ganz === 0 && halb ? '½' : `${ganz}${halb ? '½' : ''}`;
}

/** Ein geladener Schutzwall faengt einen Treffer ab - einmal. */
function schutzwall(a: Abenteuer, s: Schleim, feld: Hex, takt: number, wurf: number): boolean {
  if (a.bereit !== 'schutzwall') return false;
  a.bereit = null;
  a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: 'ritter', feld, wurf, schaden: 0 });
  melde(a, `Der Schutzwall faengt den ${schleimName(s)} ab!`);
  return true;
}

/** Ein Hieb eines Schleims auf den Ritter: trifft, oder das Schild faengt ihn ab. */
function schleimTrifft(a: Abenteuer, s: Schleim, feld: Hex, takt: number, rng: Rng): void {
  const wurf = 1 + rng.int(6);
  if (schutzwall(a, s, feld, takt, wurf)) return;
  const schaden = wurf <= abwehrVon(a) * 2 ? 0 : s.gross ? 2 : 1;
  a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: 'ritter', feld, wurf, schaden });
  if (schaden > 0) {
    a.leben -= schaden;
    melde(a, `Der ${schleimName(s)} trifft dich: -${schaden} Leben.`);
  } else melde(a, `Dein Schild faengt den ${schleimName(s)} ab.`);
}

/** Liegt der Ritter in gerader Linie, 2 bis 3 Felder weit? Dann die Richtung. */
function linieZum(s: Hex, ziel: Hex): number | null {
  for (let i = 0; i < 6; i++) {
    const [dq, dr] = HEX_DIRS[i]!;
    for (let k = 2; k <= 3; k++) if (s.q + dq * k === ziel.q && s.r + dr * k === ziel.r) return i;
  }
  return null;
}

/** Einen Schritt (oder Sprung) gehen - mit Spur und Ereignis. */
function zieheSchleim(a: Abenteuer, s: Schleim, ziel: Hex, takt: number, sprung = false): void {
  a.ereignisse.push({ art: 'gehen', takt, wer: s.id, von: { q: s.q, r: s.r }, nach: ziel, ...(sprung ? { sprung: true } : {}) });
  a.spuren = { ...a.spuren, [s.id]: [...(a.spuren[s.id] ?? [{ q: s.q, r: s.r }]), ziel] };
  s.q = ziel.q;
  s.r = ziel.r;
}

/** Ein gewoehnlicher, grosser oder besonderer Schleim in seinem Tick. */
function schleimHandelt(a: Abenteuer, s: Schleim, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean): void {
  const frei = (h: Hex) => begehbar(gelaende(a.seed, h.q, h.r)) && !besetzt(h.q, h.r);
  const d = hexDistance(s, a.pos);
  // Der Spuckschleim spuckt seine angesagte Linie entlang.
  if (s.flaeche) {
    const felder = s.flaeche;
    s.flaeche = null;
    a.ereignisse.push({ art: 'spuck', takt, wer: s.id, felder });
    const drauf = felder.find((h) => h.q === a.pos.q && h.r === a.pos.r);
    if (drauf) schleimTrifft(a, s, drauf, takt, rng);
    else {
      a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: null, feld: felder[felder.length - 1]!, wurf: 0, schaden: 0 });
      melde(a, 'Ausgewichen! Der Spuckschleim trifft nur Erde.');
    }
    return;
  }
  // Ein angesagter Angriff trifft sein Feld - steht der Ritter nicht mehr
  // darauf, geht er ins Leere. Der Springschleim landet dann dort.
  if (s.angriff) {
    const feld = s.angriff;
    s.angriff = null;
    const getroffen = feld.q === a.pos.q && feld.r === a.pos.r;
    if (s.art === 'spring') {
      if (getroffen) {
        schleimTrifft(a, s, feld, takt, rng);
        // Er landet neben dem Ritter, so nah an seinem Absprung wie moeglich.
        const neben = HEX_DIRS.map(([dq, dr]) => ({ q: feld.q + dq, r: feld.r + dr }))
          .filter(frei)
          .sort((x, y) => hexDistance(x, s) - hexDistance(y, s))[0];
        if (neben && hexDistance(neben, s) > 0) zieheSchleim(a, s, neben, takt, true);
      } else if (frei(feld)) {
        a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: null, feld, wurf: 0, schaden: 0 });
        zieheSchleim(a, s, feld, takt, true);
        melde(a, 'Ausgewichen! Der Springschleim landet ins Leere.');
      }
      return;
    }
    if (!getroffen) {
      a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: null, feld, wurf: 0, schaden: 0 });
      melde(a, `Ausgewichen! Der ${schleimName(s)} klatscht ins Leere.`);
      return;
    }
    schleimTrifft(a, s, feld, takt, rng);
    return;
  }
  // Der Spuckschleim: in Linie und mit Abstand spuckt er.
  if (s.art === 'spuck' && d >= 2 && d <= 3) {
    const dir = linieZum(s, a.pos);
    if (dir !== null) {
      const [dq, dr] = HEX_DIRS[dir]!;
      s.flaeche = [1, 2, 3].map((k) => ({ q: s.q + dq * k, r: s.r + dr * k }));
      a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: { q: a.pos.q, r: a.pos.r }, felder: s.flaeche });
      melde(a, 'Der Spuckschleim zielt - tritt seitlich aus der Linie!');
      return;
    }
  }
  // Der Springschleim: bis drei Felder weit sagt er sein Landefeld an.
  if ((s.art === 'spring' && d <= 3) || d === 1) {
    s.angriff = { q: a.pos.q, r: a.pos.r };
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: s.angriff });
    melde(a, s.art === 'spring' ? 'Der Springschleim duckt sich zum Sprung - weg vom roten Feld!' : `Der ${schleimName(s)} holt aus - weich aus oder schlag zu!`);
    return;
  }
  let ziel: Hex | null = null;
  let sprung = false;
  if (d <= WITTERUNG) {
    if (s.art === 'spring') {
      // Zwei Felder weit auf einmal.
      const weit = hexesInRange(s, 2).filter((h) => hexDistance(h, s) === 2 && frei(h) && hexDistance(h, a.pos) >= 1);
      ziel = weit.sort((x, y) => hexDistance(x, a.pos) - hexDistance(y, a.pos))[0] ?? null;
      sprung = ziel !== null;
    } else if (s.art === 'spuck') {
      // Ein Feld suchen, von dem aus der Ritter in Linie liegt - sonst naeher heran.
      const nachbarn = HEX_DIRS.map(([dq, dr]) => ({ q: s.q + dq, r: s.r + dr })).filter(frei);
      ziel =
        nachbarn.find((h) => linieZum(h, a.pos) !== null) ??
        (d > 3 ? (nachbarn.sort((x, y) => hexDistance(x, a.pos) - hexDistance(y, a.pos))[0] ?? null) : null);
    }
    if (!ziel && !sprung && s.art !== 'spuck') {
      // Einen Hops naeher heran, nie ins Wasser und nicht auf einen anderen.
      for (const [dq, dr] of HEX_DIRS) {
        const n = { q: s.q + dq, r: s.r + dr };
        if (!frei(n)) continue;
        if (hexDistance(n, a.pos) < hexDistance(ziel ?? s, a.pos)) ziel = n;
      }
    }
  } else if (rng.int(3) === 0) {
    const [dq, dr] = HEX_DIRS[rng.int(6)]!;
    const n = { q: s.q + dq, r: s.r + dr };
    if (frei(n)) ziel = n;
  }
  if (ziel) zieheSchleim(a, s, ziel, takt, sprung);
}

/** Ein Schlag des Koenigs auf ein Feld (oder einen Ring) - trifft den Ritter, wenn er darauf steht. */
function koenigTrifft(a: Abenteuer, s: Schleim, felder: readonly Hex[], takt: number, rng: Rng): void {
  const drauf = felder.some((h) => h.q === a.pos.q && h.r === a.pos.r);
  const wurf = 1 + rng.int(6);
  const feld = drauf ? { q: a.pos.q, r: a.pos.r } : felder[0]!;
  if (!drauf) {
    a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: null, feld, wurf, schaden: 0 });
    melde(a, 'Ausgewichen! Der Schleimkoenig schlaegt ins Leere.');
    return;
  }
  if (schutzwall(a, s, feld, takt, wurf)) return;
  const schaden = wurf <= abwehrVon(a) * 2 ? 0 : BOSS_SCHADEN;
  a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: 'ritter', feld, wurf, schaden });
  if (schaden > 0) {
    a.leben -= schaden;
    melde(a, `Der Schleimkoenig trifft dich: -${schaden} Leben.`);
  } else melde(a, 'Dein Schild faengt den Koenig ab.');
}

/** Der Koenig handelt (nur jeden zweiten Tick, wie alle grossen Schleime). */
function koenigHandelt(a: Abenteuer, s: Schleim, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean, neue: Schleim[]): void {
  // Erst die Ansage einloesen.
  if (s.flaeche) {
    const felder = s.flaeche;
    s.flaeche = null;
    a.ereignisse.push({ art: 'stampf', takt, wer: s.id, felder });
    koenigTrifft(a, s, felder, takt, rng);
    return;
  }
  if (s.angriff) {
    const feld = s.angriff;
    s.angriff = null;
    koenigTrifft(a, s, [feld], takt, rng);
    return;
  }
  s.zaehler = (s.zaehler ?? 0) + 1;
  // Jedes vierte Mal spaltet er einen kleinen Schleim ab - hoechstens drei um ihn.
  const kleine = a.schleime.filter((x) => !x.boss && hexDistance(x, s) <= 4).length + neue.length;
  if (s.zaehler % 4 === 0 && kleine < 3) {
    const platz = HEX_DIRS.map(([dq, dr]) => ({ q: s.q + dq, r: s.r + dr })).find(
      (h) => begehbar(gelaende(a.seed, h.q, h.r)) && !besetzt(h.q, h.r) && !neue.some((x) => x.q === h.q && x.r === h.r),
    );
    if (platz) {
      const id = a.naechsteId++;
      neue.push({ id, q: platz.q, r: platz.r, leben: 2, gross: false });
      a.ereignisse.push({ art: 'neu', takt, wer: id });
      melde(a, 'Der Schleimkoenig spaltet einen kleinen Schleim ab.');
      return;
    }
  }
  const d = hexDistance(s, a.pos);
  if (d === 1) {
    if (s.zaehler % 3 === 0) {
      // Der Ring: alle sechs Felder um ihn - nur ein Schritt weg rettet.
      s.flaeche = HEX_DIRS.map(([dq, dr]) => ({ q: s.q + dq, r: s.r + dr }));
      a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: { q: a.pos.q, r: a.pos.r }, felder: s.flaeche });
      melde(a, 'Der Schleimkoenig holt zum Stampfer aus - raus aus dem Ring!');
    } else {
      s.angriff = { q: a.pos.q, r: a.pos.r };
      a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: s.angriff });
      melde(a, 'Der Schleimkoenig holt aus - weich aus oder schlag zu!');
    }
    return;
  }
  // Sonst walzt er heran - er wittert den Ritter ueberall.
  let ziel: Hex | null = null;
  for (const [dq, dr] of HEX_DIRS) {
    const n = { q: s.q + dq, r: s.r + dr };
    if (!begehbar(gelaende(a.seed, n.q, n.r)) || besetzt(n.q, n.r)) continue;
    if (hexDistance(n, a.pos) < hexDistance(ziel ?? s, a.pos)) ziel = n;
  }
  if (ziel) {
    a.ereignisse.push({ art: 'gehen', takt, wer: s.id, von: { q: s.q, r: s.r }, nach: ziel });
    a.spuren = { ...a.spuren, [s.id]: [...(a.spuren[s.id] ?? [{ q: s.q, r: s.r }]), ziel] };
    s.q = ziel.q;
    s.r = ziel.r;
  }
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
  const neue: Schleim[] = [];
  for (const s of a.schleime) {
    if ((s.gross || s.art === 'panzer') && a.zeit % 2 === 1) continue;
    if (s.boss) {
      koenigHandelt(a, s, takt, rng, besetzt, neue);
      continue;
    }
    schleimHandelt(a, s, takt, rng, besetzt);
  }
  a.schleime.push(...neue);
  if (a.zeit % NACHSCHUB === 0) {
    for (let versuch = 0; versuch < 12; versuch++) {
      const dir = HEX_DIRS[rng.int(6)]!;
      const weit = 6 + rng.int(3);
      const q = a.pos.q + dir[0] * weit + (rng.int(3) - 1);
      const r = a.pos.r + dir[1] * weit + (rng.int(3) - 1);
      if (!begehbar(gelaende(a.seed, q, r)) || besetzt(q, r)) continue;
      const id = a.naechsteId++;
      a.schleime.push(neuerSchleim(id, q, r, rng.int(100), true));
      a.ereignisse.push({ art: 'neu', takt, wer: id });
      break;
    }
  }
  a.rng = rng.getState();
  if (a.leben <= 0) {
    // Das Extra-Leben: einmal steht der Ritter wieder auf.
    if ((a.extraLeben ?? 0) > 0) {
      a.extraLeben = (a.extraLeben ?? 0) - 1;
      const i = (a.legendaer ?? []).indexOf('extraleben');
      if (i >= 0) a.legendaer = (a.legendaer ?? []).filter((_, j) => j !== i);
      a.leben = maxLebenVon(a);
      a.ereignisse.push({ art: 'wiederbelebt', takt });
      melde(a, 'Der Ritter faellt - und steht wieder auf! Das Extra-Leben ist verbraucht.');
      return;
    }
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
  // Ein Spielstand von vor der Landsuche kann den Ritter im Wasser haben
  // (Spieltest: "Ich starte immer noch im Wasser" - der alte Stand wurde
  // geladen). Dann auf das naechste Land setzen.
  if (!begehbar(gelaende(a.seed, a.pos.q, a.pos.r))) {
    a.pos = startFeld(a.seed, a.pos);
    a.pfad = [a.pos];
    a.genommen = [...a.genommen, hexKey(a.pos.q, a.pos.r)];
    a.schleime = a.schleime.filter((s) => hexDistance(s, a.pos) >= 2);
    sehen(a);
  }
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
    if (g.slot === 'waffe') {
      a.ladung = 0;
      a.bereit = null;
    }
    a.leben = Math.min(maxLebenVon(a), a.leben + (g.leben ?? 0));
    melde(a, `${g.name} angelegt${vorher ? `, ${gegenstand(vorher)?.name} ins Inventar` : ''}.`);
    return a;
  }
  return alt;
}

// --- Debug ------------------------------------------------------------------

/** Was das Debugfenster kann - zum Ausprobieren im laufenden Spiel. */
export type DebugAktion =
  | { t: 'waffe'; id: string }
  | { t: 'ladung' }
  | { t: 'schleim'; art: SchleimArt | 'normal' | 'gross' | 'koenig' }
  | { t: 'heilen' }
  | { t: 'legendaer'; id: string }
  | { t: 'item'; id: string }
  | { t: 'ep' }
  | { t: 'schritte' };

export function debugAktion(alt: Abenteuer, d: DebugAktion): Abenteuer {
  const a = structuredClone(alt);
  a.ereignisse = [];
  if (d.t === 'waffe') {
    if (!gegenstand(d.id)?.slot) return alt;
    a.ausruestung = { ...a.ausruestung, waffe: d.id };
    a.ladung = 0;
    a.bereit = null;
    melde(a, `Debug: ${gegenstand(d.id)!.name} in der Hand.`);
  } else if (d.t === 'ladung') {
    const { faehigkeit } = ladungVon(a);
    if (!faehigkeit) {
      melde(a, 'Debug: diese Waffe hat keinen Ladebalken.');
      return a;
    }
    a.ladung = 0;
    entfessle(a, faehigkeit, 0);
  } else if (d.t === 'item') {
    // Anprobieren: Ausruestung anlegen, Legendaeres anwenden, sonst ins Inventar.
    const g = gegenstand(d.id);
    if (!g) return alt;
    if (g.legendaer) legendaerAnwenden(a, d.id, 0);
    else if (g.slot) {
      a.ausruestung = { ...a.ausruestung, [g.slot]: d.id };
      if (g.slot === 'waffe') {
        a.ladung = 0;
        a.bereit = null;
      }
      a.leben = Math.min(maxLebenVon(a), a.leben + (g.leben ?? 0));
      melde(a, `Debug: ${g.name} angelegt.`);
    } else {
      a.inventar = { ...a.inventar, [d.id]: (a.inventar[d.id] ?? 0) + 1 };
      melde(a, `Debug: ${g.name} ins Inventar.`);
    }
  } else if (d.t === 'legendaer') {
    legendaerAnwenden(a, d.id, 0);
  } else if (d.t === 'ep') {
    if (!a.stufe) {
      melde(a, 'Debug: erst Solo-Leveling einsammeln.');
      return a;
    }
    erfahrung(a, epFuer(a.stufe.lv) - a.stufe.ep, 0);
  } else if (d.t === 'heilen') {
    a.leben = maxLebenVon(a);
    melde(a, 'Debug: volles Leben.');
  } else if (d.t === 'schritte') {
    a.phase = 'ziehen';
    a.wurf = 6;
    a.schritte = 6;
    melde(a, 'Debug: 6 Schritte.');
  } else if (d.t === 'schleim') {
    if (d.art === 'koenig') {
      if (a.schleime.some((s) => s.boss)) return alt;
      bossErwacht(a, 0);
      return a;
    }
    // Zwei Felder weit, damit man sein Verhalten sieht - zur Not daneben.
    const frei = (h: Hex) => begehbar(gelaende(a.seed, h.q, h.r)) && !(h.q === a.pos.q && h.r === a.pos.r) && !a.schleime.some((s) => s.q === h.q && s.r === h.r);
    const ort = hexesInRange(a.pos, 3)
      .filter((h) => frei(h) && hexDistance(h, a.pos) >= 1)
      .sort((x, y) => Math.abs(hexDistance(x, a.pos) - 2) - Math.abs(hexDistance(y, a.pos) - 2))[0];
    if (!ort) return alt;
    const id = a.naechsteId++;
    const art = d.art === 'normal' || d.art === 'gross' ? undefined : d.art;
    const gross = d.art === 'gross';
    a.schleime.push({ id, q: ort.q, r: ort.r, leben: art === 'panzer' ? 3 : gross ? 4 : 2, gross, ...(art ? { art } : {}) });
    a.ereignisse.push({ art: 'neu', takt: 0, wer: id });
    melde(a, `Debug: ein ${art ? SCHLEIM_NAME[art] : gross ? 'grosser Schleim' : 'Schleim'} erscheint.`);
  }
  return a;
}
