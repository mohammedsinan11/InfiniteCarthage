/**
 * Abenteuer: ein Ritter zieht ueber die Welt.
 *
 * Ein eigener Modus neben der Strategie, von Grund auf neu - nur die Welt
 * (core/world.ts) und ihre Kacheln sind geteilt. Rein und ohne Server: alles
 * hier ist eine Funktion von Zustand und Eingabe, damit das Spiel auch als
 * reine Seite laeuft (GitHub Pages) und sich testen laesst.
 *
 * DER ZUG. Zu Beginn wird gewuerfelt; die Augenzahl sind die Schritte. Jeder
 * Schritt geht auf ein Nachbarfeld (sechs Richtungen, dazu "gerade hinauf"
 * und "gerade hinab" im Zickzack). Wasser ist nicht zu betreten, Berge kosten
 * zwei Schritte. Ein Schritt auf einen Schleim ist ein Angriff. Sind die
 * Schritte verbraucht - oder rastet man -, ziehen die Schleime.
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
  { id: 'gold', name: 'Gold', text: 'Glaenzt. Noch kauft hier niemand etwas.' },
  { id: 'gelee', name: 'Schleimgelee', text: 'Was ein Schleim zuruecklaesst - der Beweis deiner Taten.' },
];

export const gegenstand = (id: string): Gegenstand | undefined => GEGENSTAENDE.find((g) => g.id === id);

/** Was in Truhen liegen kann - das Schwert traegt der Ritter schon. */
const TRUHENINHALT = ['axt', 'schild', 'helm', 'ruestung', 'stiefel', 'laterne'];

export type Schleim = { id: number; q: number; r: number; leben: number; gross: boolean };

export type Phase = 'wuerfeln' | 'ziehen' | 'tot' | 'sieg';

export type Abenteuer = {
  seed: number;
  /** Zustand des Zufalls - Wuerfel und Kampf. */
  rng: number;
  zug: number;
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
};

/** So viele Schleime muss man erschlagen. */
export const ZIEL_SCHLEIME = 10;
export const GRUND_LEBEN = 6;
const GRUND_SICHT = 3;
/** Wie weit Schleime den Ritter wittern. */
const WITTERUNG = 6;
const SALT_FUND = 77;
const SALT_SCHLEIM = 78;

/** Tasten: drei mal drei, wie sie auf der Tastatur liegen. */
export type Taste = 'q' | 'w' | 'e' | 'a' | 's' | 'd' | 'z' | 'x' | 'c';
export const TASTEN: readonly Taste[] = ['q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c'];
/** Richtung je Taste (Index in HEX_DIRS: 0 NO, 1 O, 2 SO, 3 SW, 4 W, 5 NW). */
const RICHTUNG: Partial<Record<Taste, number>> = { e: 0, d: 1, c: 2, z: 3, a: 4, q: 5 };
export const TASTE_NAME: Record<Taste, string> = {
  q: 'Nordwest',
  w: 'Norden',
  e: 'Nordost',
  a: 'West',
  s: 'Rasten',
  d: 'Ost',
  z: 'Suedwest',
  x: 'Sueden',
  c: 'Suedost',
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
  melde(a, `Gewuerfelt: ${a.wurf}${schrittBonus(a) > 0 ? ` (+${schrittBonus(a)} Stiefel)` : ''} - ${a.schritte} Schritte.`);
  return a;
}

/** Wohin eine Taste fuehrt; w und x gehen im Zickzack gerade hinauf und hinab. */
export function richtungFuer(taste: Taste, pos: Hex): number | null {
  if (taste === 'w') return pos.r % 2 === 0 ? 0 : 5;
  if (taste === 'x') return pos.r % 2 === 0 ? 2 : 3;
  return RICHTUNG[taste] ?? null;
}

/** Eine Taste im Zug: gehen, angreifen oder rasten. */
export function taste(alt: Abenteuer, t: Taste): Abenteuer {
  if (alt.phase !== 'ziehen') return alt;
  const a = structuredClone(alt);
  if (t === 's') {
    // Rasten beendet den Zug; ohne Schleim in der Naehe heilt es ein Leben.
    const ruhig = !a.schleime.some((s) => hexDistance(s, a.pos) <= 2);
    if (ruhig && a.leben < maxLebenVon(a)) {
      a.leben += 1;
      melde(a, 'Du rastest und kommst zu Kraeften: +1 Leben.');
    } else melde(a, ruhig ? 'Du rastest.' : 'Zu unruhig zum Rasten - Schleime sind nah.');
    return zugEnde(a);
  }
  const dir = richtungFuer(t, a.pos);
  if (dir === null) return alt;
  const d = HEX_DIRS[dir]!;
  const ziel = { q: a.pos.q + d[0], r: a.pos.r + d[1] };
  const feind = schleimAuf(a, ziel.q, ziel.r);
  if (feind) {
    angreifen(a, feind);
    a.schritte -= 1;
    return a.schritte <= 0 && a.phase === 'ziehen' ? zugEnde(a) : a;
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
  a.pos = ziel;
  a.schritte -= k;
  a.pfad = [...a.pfad, ziel];
  sehen(a);
  aufheben(a);
  return a.schritte <= 0 ? zugEnde(a) : a;
}

function angreifen(a: Abenteuer, s: Schleim): void {
  const wurf = w6(a);
  const summeWurf = wurf + angriffVon(a);
  if (summeWurf >= 4) {
    const schaden = wurf === 6 ? 2 : 1;
    s.leben -= schaden;
    if (s.leben <= 0) {
      a.schleime = a.schleime.filter((x) => x.id !== s.id);
      a.erschlagen += 1;
      const gelee = s.gross ? 2 : 1;
      a.inventar = { ...a.inventar, gelee: (a.inventar['gelee'] ?? 0) + gelee };
      melde(a, `Wurf ${wurf}+${angriffVon(a)}: der ${s.gross ? 'grosse ' : ''}Schleim zerplatzt! +${gelee} Gelee (${a.erschlagen}/${ZIEL_SCHLEIME}).`);
      if (a.erschlagen >= ZIEL_SCHLEIME) {
        a.phase = 'sieg';
        melde(a, 'Zehn Schleime erschlagen - das Land atmet auf. Sieg!');
      }
    } else melde(a, `Wurf ${wurf}+${angriffVon(a)}: Treffer${schaden > 1 ? ' (doppelt)' : ''} - der Schleim wankt.`);
  } else melde(a, `Wurf ${wurf}+${angriffVon(a)}: daneben.`);
}

function aufheben(a: Abenteuer): void {
  const fund = fundAuf(a, a.pos.q, a.pos.r);
  if (!fund) return;
  a.genommen = [...a.genommen, hexKey(a.pos.q, a.pos.r)];
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
  a.inventar = { ...a.inventar, [fund]: (a.inventar[fund] ?? 0) + 1 };
  melde(a, `Gefunden: ${gegenstand(fund)?.name ?? fund}.`);
}

/** Die Schritte sind um: die Schleime ziehen, dann wird wieder gewuerfelt. */
function zugEnde(a: Abenteuer): Abenteuer {
  a.schritte = 0;
  const besetzt = (q: number, r: number) => a.schleime.some((s) => s.q === q && s.r === r);
  for (const s of a.schleime) {
    const d = hexDistance(s, a.pos);
    if (d > WITTERUNG) continue;
    if (d > 1) {
      // Einen Schritt naeher heran, nie ins Wasser und nicht auf einen anderen.
      let best: Hex | null = null;
      for (const [dq, dr] of HEX_DIRS) {
        const n = { q: s.q + dq, r: s.r + dr };
        if (n.q === a.pos.q && n.r === a.pos.r) continue;
        if (!begehbar(gelaende(a.seed, n.q, n.r)) || besetzt(n.q, n.r)) continue;
        if (hexDistance(n, a.pos) < hexDistance(best ?? s, a.pos)) best = n;
      }
      if (best) {
        s.q = best.q;
        s.r = best.r;
      }
    }
    if (hexDistance(s, a.pos) === 1) {
      const wurf = w6(a);
      if (wurf >= 4 + abwehrVon(a)) {
        const schaden = s.gross ? 2 : 1;
        a.leben -= schaden;
        melde(a, `Ein ${s.gross ? 'grosser ' : ''}Schleim trifft dich: -${schaden} Leben.`);
      } else melde(a, `Ein Schleim springt dich an - abgewehrt (Wurf ${wurf}).`);
    }
  }
  if (a.leben <= 0) {
    a.leben = 0;
    a.phase = 'tot';
    melde(a, 'Der Ritter faellt. Das Abenteuer ist zu Ende.');
    return a;
  }
  // Alle drei Zuege kriecht ein neuer Schleim aus dem Unbekannten.
  if (a.zug % 3 === 0) {
    const rng = new Rng(a.rng);
    for (let versuch = 0; versuch < 12; versuch++) {
      const dir = HEX_DIRS[rng.int(6)]!;
      const weit = 6 + rng.int(3);
      const q = a.pos.q + dir[0] * weit + (rng.int(3) - 1);
      const r = a.pos.r + dir[1] * weit + (rng.int(3) - 1);
      if (!begehbar(gelaende(a.seed, q, r)) || besetzt(q, r)) continue;
      const gross = rng.int(4) === 0;
      a.schleime.push({ id: a.naechsteId++, q, r, leben: gross ? 4 : 2, gross });
      break;
    }
    a.rng = rng.getState();
  }
  if (a.phase === 'ziehen') a.phase = 'wuerfeln';
  a.zug += 1;
  a.wurf = null;
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
    a.leben = Math.min(maxLebenVon(a), a.leben + g.heilt);
    weg();
    melde(a, `${g.name}: +${g.heilt} Leben.`);
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
