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
import { boden, istWasser } from './welt';
import type { Boden } from './welt';

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
    text: 'Legendaer. Jeder Schritt huepft bis zu zwei Felder weit, wenn das Feld frei ist - auch uebers Wasser. Was dazwischen liegt, nimmt er mit.',
  },
  {
    id: 'pentagramm',
    name: 'Pentagrammmeister',
    legendaer: true,
    text:
      'Legendaer. Schliesst dein Weg in einem Zug eine Form, wirkst du einen Zauber: Dreieck - Funkenregen, Raute - Schutzrune, Fuenfeck - Pentagramm, Sechseck - Heilkreis, groesser - Bannkreis. Wer zu oft zaubert, ruft den Pentagrammschleim - bezwungen schaltet er Stufe 2 frei: die Zauber bleiben 10 Takte als Kreise auf der Karte.',
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
  { id: 'holz', name: 'Holz', text: 'Mit der Axt im Wald geschlagen - der Haendler zahlt 2 Gold je Scheit.' },
  { id: 'gelee', name: 'Schleimgelee', text: 'Was ein Schleim zuruecklaesst - der Beweis deiner Taten.' },
];

export const gegenstand = (id: string): Gegenstand | undefined => GEGENSTAENDE.find((g) => g.id === id);

/** Was in Truhen liegen kann - das Schwert traegt der Ritter schon. */
const TRUHENINHALT = ['axt', 'breitschwert', 'runenklinge', 'flammenschwert', 'schild', 'helm', 'ruestung', 'stiefel', 'laterne', 'angel'];

/**
 * Wie gut ein Ausruestungsteil ist - fuer den Vergleich im Inventar (gruen
 * besser, rot schlechter als das Angelegte).
 */
export function ausruestungsWert(id: string | null): number {
  const g = gegenstand(id ?? '');
  if (!g?.slot) return -1;
  return (
    (g.angriff ?? 0) * 3 + ((g.krit ?? 2) - 2) * 2 + (g.ladung ? 2 : 0) + (g.abwehr ?? 0) * 3 + (g.leben ?? 0) * 2 + (g.schritte ?? 0) * 3 + (g.sicht ?? 0) * 2
  );
}

/** Besser (1), schlechter (-1) oder gleich (0) als das, was im Platz liegt - null fuer Nicht-Ausruestung. */
export function vergleich(a: Abenteuer, id: string): 1 | -1 | 0 | null {
  const g = gegenstand(id);
  if (!g?.slot) return null;
  const jetzt = a.ausruestung[g.slot];
  if (!jetzt) return 1;
  const d = ausruestungsWert(id) - ausruestungsWert(jetzt);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

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
  /** Hoechstes Leben (nur der Koenig - jeder weitere hat mehr). */
  max?: number;
  /** Welcher Boss (fehlt: der Schleimkoenig). */
  bossArt?: BossArt;
  /** Wie oft der Koenig schon gehandelt hat - fuer seinen Rhythmus. */
  zaehler?: number;
  /** Gebannt (Bannkreis, Stufe 2) bis zu diesem Tick: er tut nichts. */
  gebannt?: number;
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
export type SchleimArt = 'spuck' | 'spring' | 'panzer' | 'gift' | 'teil' | 'geist' | 'bandit';
export const SCHLEIM_NAME: Record<SchleimArt, string> = {
  spuck: 'Spuckschleim',
  spring: 'Springschleim',
  panzer: 'Panzerschleim',
  gift: 'Giftschleim',
  teil: 'Teilschleim',
  geist: 'Geisterschleim',
  bandit: 'Bandit',
};

/**
 * Die Bosse - nacheinander: erst der Schleimkoenig, dann der Schattenschleim,
 * dann der Gelee-Koloss, dann wieder von vorn, jedes Mal staerker.
 *   koenig   Schlag aufs Feld, jedes dritte Mal der Ring um ihn, spaltet ab
 *   schatten springt durch die Schatten neben den Ritter, spuckt Linien
 *   koloss   riesig und traege: ein Ring zwei Felder weit, ruft Schleime
 * Ausserhalb der Reihe: der Pentagrammschleim (penta) - er kommt, wer den
 * Pentagrammmeister zu oft benutzt (PENTA_BOSS_NACH Zauber). Bezwungen
 * schaltet er Stufe 2 frei: die Zauber bleiben als Kreise auf der Karte.
 */
export type BossArt = 'koenig' | 'schatten' | 'koloss' | 'penta';
export const BOSS_NAME: Record<BossArt, string> = { koenig: 'Schleimkoenig', schatten: 'Schattenschleim', koloss: 'Gelee-Koloss', penta: 'Pentagrammschleim' };
const BOSS_FOLGE: readonly BossArt[] = ['koenig', 'schatten', 'koloss'];
const BOSS_GRUND: Record<BossArt, number> = { koenig: 10, schatten: 12, koloss: 16, penta: 16 };

/** Ein neuer Schleim: die Art aus einer Zahl 0..99 - gut die Haelfte gewoehnlich. */
function neuerSchleim(id: number, q: number, r: number, zahl: number, fern: boolean): Schleim {
  if (zahl < 12) return { id, q, r, leben: 2, gross: false, art: 'spuck' };
  if (zahl < 24) return { id, q, r, leben: 2, gross: false, art: 'spring' };
  if (zahl < 33) return { id, q, r, leben: 3, gross: false, art: 'panzer' };
  if (zahl < 42) return { id, q, r, leben: 2, gross: false, art: 'gift' };
  if (zahl < 50) return { id, q, r, leben: 3, gross: false, art: 'teil' };
  if (zahl < 57) return { id, q, r, leben: 2, gross: false, art: 'geist' };
  const gross = fern && zahl % 3 === 0;
  return { id, q, r, leben: gross ? 4 : 2, gross };
}

/** Wie man ihn nennt - mit "Der" davor. */
export function schleimName(s: Pick<Schleim, 'boss' | 'art' | 'gross'> & { bossArt?: BossArt }): string {
  if (s.boss) return BOSS_NAME[s.bossArt ?? 'koenig'];
  if (s.art) return SCHLEIM_NAME[s.art];
  return s.gross ? 'grosse Schleim' : 'Schleim';
}

/** Hoechstes Leben eines Schleims - fuer die Lebensbalken. */
export function schleimMaxLeben(s: Pick<Schleim, 'boss' | 'art' | 'gross'> & { max?: number }): number {
  if (s.boss) return s.max ?? BOSS_LEBEN;
  if (s.art === 'panzer' || s.art === 'teil' || s.art === 'bandit') return 3;
  return s.gross ? 4 : 2;
}

/** Wer handelt: der Ritter oder ein Schleim (seine id). */
export type Wer = 'ritter' | number;

/**
 * Was in einer Aktion geschah, Takt fuer Takt - fuer die Bewegung im Bild.
 * Takt 0 ist der Ritter, jeder weitere Takt ein Tick der Spieluhr.
 */
export type Ereignis =
  | { art: 'gehen'; takt: number; wer: Wer; von: Hex; nach: Hex; sprung?: boolean; blink?: boolean }
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
  /** Pentagrammmeister: der Weg hat sich geschlossen - ein Zauber. */
  | { art: 'zauber'; takt: number; name: Zauber; felder: Hex[] }
  /** Jemand sagt etwas - eine Sprechblase ueber Soeldner und Wanderern. */
  | { art: 'spruch'; takt: number; wer: number; text: string }
  /** Ein Soeldner oder Wanderer faellt. */
  | { art: 'faellt'; takt: number; wer: number; q: number; r: number }
  /** Der Ritter spricht einen Haendler oder Werber an. */
  | { art: 'treffen'; takt: number; ort: number }
  /** Stufe 2: ein bleibender Kreis wirkt (Schaden, Heilung, Bann, Schutz). */
  | { art: 'kreis'; takt: number; name: Zauber; ziele: number[]; felder?: Hex[] }
  /** Gift: der Ritter steht in einer Pfuetze. */
  | { art: 'gift'; takt: number }
  /** Ein legendaerer Fund wirkt. */
  | { art: 'legende'; takt: number; id: string }
  /** Solo-Leveling: ein Levelaufstieg. */
  | { art: 'stufe'; takt: number; lv: number; bonus: string }
  /** Der Koenig springt und schlaegt auf - alle angesagten Felder beben. */
  | { art: 'stampf'; takt: number; wer: number; felder: Hex[] }
  /** Eine Waffe entfesselt ihre Faehigkeit (Ladebalken voll). */
  | { art: 'faehigkeit'; takt: number; name: Faehigkeit; felder?: Hex[]; ziel?: number }
  /** Ein Boss erwacht. */
  | { art: 'boss'; takt: number; wer: number; name?: string }
  | { art: 'tod'; takt: number; wer: number; q: number; r: number; gross: boolean; boss?: boolean; bossArt?: BossArt; schleimArt?: SchleimArt }
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
  /** So viele Schleimkoenige sind schon bezwungen - jeder naechste ist staerker. */
  koenige?: number;
  /** Neutrale Tiere: Schneehasen in Schnee und Taiga - sie fliehen vor dem Ritter. */
  tiere?: { id: number; q: number; r: number; art: 'hase' | 'schaf' }[];
  /** Giftpfuetzen der Giftschleime: wer darin steht, verliert je Tick ein halbes Leben. */
  gift?: { q: number; r: number; bis: number }[];
  /** Pentagrammmeister: so viele Zauber gewirkt - zu viele rufen den Pentagrammschleim. */
  zauberZahl?: number;
  /** Pentagrammmeister-Stufe: 2, wenn der Pentagrammschleim bezwungen ist. */
  pentaStufe?: number;
  /** Ist der Pentagrammschleim gerufen (oder schon bezwungen)? */
  pentaGerufen?: boolean;
  /** Stufe 2: Zauberkreise, die auf der Karte bleiben. */
  kreise?: Kreis[];
  /** Leute an festen Orten: Haendler und Werber. */
  orte?: Ort[];
  /** Angeheuerte Soeldner - sie laufen mit, kaempfen und lernen dazu. */
  gefolge?: Soeldner[];
  /** Schon angeheuerte Angebote der Werber ("ortId:nr"). */
  angeheuert?: string[];
  /** Andere Fraktionen, die durch die Welt ziehen (Orden, Jaeger). */
  wanderer?: Wanderer[];
  /** Mit wem der Ritter gerade spricht (Ort-Id) - dann ist ein Laden offen. */
  laden?: number | null;
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
/** Jeder weitere Koenig hat vier Leben mehr. */
export const koenigLeben = (a: Pick<Abenteuer, 'koenige'>): number =>
  BOSS_GRUND[naechsterBoss(a)] + 4 * Math.floor((a.koenige ?? 0) / BOSS_FOLGE.length) + (a.koenige ?? 0);
/** Welcher Boss als naechster kommt. */
export const naechsterBoss = (a: Pick<Abenteuer, 'koenige'>): BossArt => BOSS_FOLGE[(a.koenige ?? 0) % BOSS_FOLGE.length]!;
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

/** Der Boden eines Feldes (welt.ts - der eigene Generator des Abenteuers). */
export function gelaende(seed: number, q: number, r: number): Boden {
  return boden(seed, q, r);
}

const begehbar = (t: Boden | null): boolean => t !== null && !istWasser(t);
/** Berge, Sumpf und Baeche kosten zwei Schritte. */
const kosten = (t: Boden | null): number => (t === 'berg' || t === 'sumpf' || t === 'fluss' ? 2 : 1);
/** Wo die Angel etwas fangen kann: Wasser und Baeche. */
export const angelbar = (t: Boden | null): boolean => istWasser(t) || t === 'fluss';

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
  if (h < 7 && (t === 'wald' || t === 'wiese' || t === 'feld' || t === 'dschungel' || t === 'taiga')) return 'kraut';
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
    for (const h of hexesInRange(o, ring)) {
      if (hexDistance(h, o) !== ring) continue;
      const t = gelaende(seed, h.q, h.r);
      if (!begehbar(t) || kosten(t) > 1) continue;
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
  ortePlatzieren(a);
  a.schleime = a.schleime.filter((s) => !ortAuf(a, s.q, s.r));
  sehen(a);
  return a;
}

// --- Hilfen ---------------------------------------------------------------

function sehen(a: Abenteuer): void {
  const neu = new Set(a.erkundet);
  for (const h of hexesInRange(a.pos, sichtVon(a))) {
    const k = hexKey(h.q, h.r);
    if (neu.has(k)) continue;
    neu.add(k);
    // Auf frisch entdecktem Schnee und in der Taiga sitzt manchmal ein Schneehase.
    const b = gelaende(a.seed, h.q, h.r);
    if ((b === 'schnee' || b === 'taiga') && hash3i(a.seed, h.q, h.r, SALT_SCHLEIM + 9) % 40 === 0 && hexDistance(h, a.pos) > 1) {
      a.tiere = [...(a.tiere ?? []), { id: a.naechsteId++, q: h.q, r: h.r, art: 'hase' }];
    }
    // Auf den Wiesen grasen Schafe - viele, oft mehrere beieinander.
    if ((b === 'wiese' || b === 'feld') && hash3i(a.seed, h.q, h.r, SALT_SCHLEIM + 10) % (b === 'wiese' ? 9 : 16) === 0 && hexDistance(h, a.pos) > 1) {
      a.tiere = [...(a.tiere ?? []), { id: a.naechsteId++, q: h.q, r: h.r, art: 'schaf' }];
    }
    if (a.orte) ortEntdecken(a, h);
  }
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
  return begehbar(t) || (istWasser(t) && hatLegende(a, 'hermes'));
}

/**
 * PENTAGRAMMMEISTER. Die Pfeile des Zuges (pfad) sind eine Zeichnung. Kehrt
 * der Ritter auf ein Feld zurueck, das er in diesem Zug schon betrat, schliesst
 * sich eine Form - je nach Zahl der Schritte ein anderer Zauber. Danach
 * beginnt die Zeichnung neu.
 */
export type Zauber = 'funkenregen' | 'schutzrune' | 'pentagramm' | 'heilkreis' | 'bannkreis';
export const ZAUBER_NAME: Record<Zauber, string> = {
  funkenregen: 'Funkenregen',
  schutzrune: 'Schutzrune',
  pentagramm: 'Pentagramm',
  heilkreis: 'Heilkreis',
  bannkreis: 'Bannkreis',
};

function zauberPruefen(a: Abenteuer): void {
  if (!hatLegende(a, 'pentagramm')) return;
  const i = a.pfad.slice(0, -1).findIndex((h) => h.q === a.pos.q && h.r === a.pos.r);
  if (i < 0) return;
  const form = a.pfad.slice(i);
  const schritte = form.length - 1;
  if (schritte < 3) return;
  const name: Zauber = schritte === 3 ? 'funkenregen' : schritte === 4 ? 'schutzrune' : schritte === 5 ? 'pentagramm' : schritte === 6 ? 'heilkreis' : 'bannkreis';
  a.ereignisse.push({ art: 'zauber', takt: 0, name, felder: form });
  a.zauberZahl = (a.zauberZahl ?? 0) + 1;
  const nahe = (weit: number, um: readonly Hex[]) => a.schleime.filter((s) => um.some((h) => hexDistance(s, h) <= weit));
  if (name === 'funkenregen') {
    melde(a, 'Ein Dreieck - Funkenregen!');
    for (const s of nahe(2, [a.pos])) verwunde(a, s, 1, 0, 'Funkenregen');
  } else if (name === 'schutzrune') {
    a.bereit = 'schutzwall';
    melde(a, 'Eine Raute - die Schutzrune faengt den naechsten Treffer ab.');
  } else if (name === 'pentagramm') {
    melde(a, 'Ein Fuenfeck - das Pentagramm flammt auf!');
    for (const s of nahe(2, form)) verwunde(a, s, 3, 0, 'Pentagramm');
  } else if (name === 'heilkreis') {
    const plus = Math.min(2, maxLebenVon(a) - a.leben);
    a.leben += plus;
    if (plus > 0) a.ereignisse.push({ art: 'heil', takt: 0, leben: plus });
    melde(a, `Ein Sechseck - der Heilkreis: +${lebenText(plus)} Leben.`);
  } else {
    melde(a, 'Ein grosser Kreis - der Bannkreis!');
    for (const s of nahe(1, form)) verwunde(a, s, 2, 0, 'Bannkreis');
  }
  // Stufe 2: der Zauber bleibt als Kreis auf der Karte.
  if ((a.pentaStufe ?? 1) >= 2) {
    const felder = [...form.slice(1), ...umschlossen(form)];
    a.kreise = [...(a.kreise ?? []), { id: a.naechsteId++, name, felder, mitte: { q: a.pos.q, r: a.pos.r }, bis: a.zeit + KREIS_DAUER, ...(name === 'funkenregen' ? { mal: 3 } : {}) }];
  }
  // Wer zu oft zaubert, ruft den Pentagrammschleim.
  if (!a.pentaGerufen && (a.pentaStufe ?? 1) < 2) {
    if (a.zauberZahl === PENTA_BOSS_NACH - 3) melde(a, 'Die Pentagramme locken etwas an ... du spuerst einen Blick.');
    if (a.zauberZahl >= PENTA_BOSS_NACH && !a.schleime.some((x) => x.boss)) bossErwacht(a, 0, 'penta');
  }
  // Die Zeichnung beginnt neu.
  a.pfad = [{ q: a.pos.q, r: a.pos.r }];
}

/** So viele Zauber, dann kommt der Pentagrammschleim. */
export const PENTA_BOSS_NACH = 10;
/** Stufe 2: so viele Ticks bleibt ein Kreis. */
export const KREIS_DAUER = 10;

/** Stufe 2: ein Zauberkreis auf der Karte - seine Felder sind der Weg und was er umschliesst. */
export type Kreis = { id: number; name: Zauber; felder: Hex[]; mitte: Hex; bis: number; mal?: number; gebannt?: number[] };

/** Die Felder innerhalb eines geschlossenen Weges (ohne den Weg selbst). */
function umschlossen(form: readonly Hex[]): Hex[] {
  const punkt = (h: Hex) => ({ x: h.q + h.r / 2, y: h.r * 0.866 });
  const ecken = form.map(punkt);
  const drin = (p: { x: number; y: number }) => {
    let ja = false;
    for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
      const a = ecken[i]!;
      const b = ecken[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ja = !ja;
    }
    return ja;
  };
  return hexesInRange(form[0]!, form.length).filter((h) => !form.some((f) => f.q === h.q && f.r === h.r) && drin(punkt(h)));
}

/** Steht der Ritter in einer Schutzrune (Stufe 2)? Dann trifft ihn nichts. */
function inSchutzrune(a: Abenteuer): boolean {
  return (a.kreise ?? []).some((k) => k.name === 'schutzrune' && k.felder.some((h) => h.q === a.pos.q && h.r === a.pos.r));
}

/** Stufe 2: die Kreise wirken in jedem Tick - und vergehen nach KREIS_DAUER. */
function kreiseWirken(a: Abenteuer, takt: number): void {
  const kreise = (a.kreise ?? []).filter((k) => k.bis > a.zeit);
  const im = (k: Kreis, h: Hex, weit = 0) => k.felder.some((f) => hexDistance(f, h) <= weit);
  for (const k of kreise) {
    if (k.name === 'pentagramm') {
      // Dauernder Schaden an allem, was im Pentagramm steht.
      const ziele = a.schleime.filter((s) => im(k, s));
      if (ziele.length) a.ereignisse.push({ art: 'kreis', takt, name: k.name, ziele: ziele.map((s) => s.id) });
      for (const s of ziele) verwunde(a, s, 1, takt, 'Pentagramm');
    } else if (k.name === 'heilkreis') {
      if (im(k, a.pos) && a.leben < maxLebenVon(a)) {
        const plus = Math.min(0.5, maxLebenVon(a) - a.leben);
        a.leben += plus;
        a.ereignisse.push({ art: 'heil', takt, leben: plus });
      }
    } else if (k.name === 'bannkreis') {
      // Wer in den Bannkreis kommt, ist lange gebannt - ein Boss kuerzer, und nur einmal je Kreis.
      const ziele = a.schleime.filter((s) => im(k, s, 1) && (s.gebannt ?? 0) <= a.zeit && !(k.gebannt ?? []).includes(s.id));
      for (const s of ziele) {
        s.gebannt = a.zeit + (s.boss ? 3 : KREIS_DAUER);
        s.angriff = null;
        s.flaeche = null;
        if (s.boss) k.gebannt = [...(k.gebannt ?? []), s.id];
      }
      if (ziele.length) {
        a.ereignisse.push({ art: 'kreis', takt, name: k.name, ziele: ziele.map((s) => s.id) });
        melde(a, ziele.length > 1 ? `Der Bannkreis bannt ${ziele.length} Schleime.` : `Der Bannkreis bannt den ${schleimName(ziele[0]!)}.`);
      }
    } else if (k.name === 'funkenregen' && (k.bis - a.zeit) % 2 === 0 && (k.mal ?? 0) > 0) {
      // Noch dreimal regnen Funken, dann ist er fort.
      k.mal = (k.mal ?? 0) - 1;
      const ziele = a.schleime.filter((s) => hexDistance(s, k.mitte) <= 2);
      a.ereignisse.push({ art: 'kreis', takt, name: k.name, ziele: ziele.map((s) => s.id), felder: hexesInRange(k.mitte, 2) });
      for (const s of ziele) verwunde(a, s, 1, takt, 'Funkenregen');
      if (k.mal === 0) k.bis = a.zeit;
    }
  }
  a.kreise = kreise.filter((k) => k.bis > a.zeit);
}

/** Legendaeres, das es nur einmal gibt. */
const EINMALIG = ['sololeveling', 'hermes', 'pentagramm'];

/** So weit huepfen die Hermes-Stiefel (Spieltest: drei war zu viel). */
export const HERMES_WEITE = 2;

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
  a.laden = null;
  // Gegen einen Haendler oder Werber laufen: ansprechen - kostet keinen Schritt.
  const ort = ortAuf(a, ziel.q, ziel.r);
  if (ort) return ansprechen(a, ort.id);
  // Ein Wanderer anderer Fraktion steht im Weg - er gruesst.
  const wand = wandererAuf(a, ziel.q, ziel.r);
  if (wand) {
    a.ereignisse.push({ art: 'spruch', takt: 0, wer: wand.id, text: SPRUCH[wand.fraktion][a.zeit % SPRUCH[wand.fraktion].length]! });
    melde(a, `${wand.name} vom ${FRAKTION_NAME[wand.fraktion]} steht dir im Weg.`);
    return a;
  }
  // Ein Soeldner im Weg: Platz tauschen.
  const kamerad = soeldnerAuf(a, ziel.q, ziel.r);
  if (kamerad) {
    a.ereignisse.push({ art: 'gehen', takt: 0, wer: kamerad.id, von: { q: kamerad.q, r: kamerad.r }, nach: { q: a.pos.q, r: a.pos.r } });
    kamerad.q = a.pos.q;
    kamerad.r = a.pos.r;
  }
  // Ein Schneehase auf dem Feld huscht weg - man kann nicht auf ihn treten.
  const tier = (a.tiere ?? []).find((t) => t.q === ziel.q && t.r === ziel.r);
  if (tier) {
    if (tier.art === 'schaf') {
      a.ereignisse.push({ art: 'spruch', takt: 0, wer: tier.id, text: 'Maeh!' });
      melde(a, 'Das Schaf steht im Weg und bloekt dich an.');
    } else melde(a, 'Der Schneehase huscht dir zwischen den Beinen weg.');
    return a;
  }
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
  if (istWasser(g) && !hermes && (a.inventar['angel'] ?? 0) > 0) {
    auswerfen(a, ziel);
    return nachDemSchritt(a);
  }
  // Hermes-Stiefel: bis zu drei Felder weit huepfen, wo es frei ist - auch aufs Wasser.
  if (hermes) {
    let landung: Hex | null = null;
    for (let k = HERMES_WEITE; k >= 1 && !landung; k--) {
      const h = { q: a.pos.q + d[0] * k, r: a.pos.r + d[1] * k };
      if (betretbar(a, h.q, h.r) && !schleimAuf(a, h.q, h.r) && !ortAuf(a, h.q, h.r) && !wandererAuf(a, h.q, h.r) && !soeldnerAuf(a, h.q, h.r)) landung = h;
    }
    if (!landung) {
      melde(a, 'Kein freies Feld zum Huepfen.');
      return a;
    }
    a.ereignisse.push({ art: 'gehen', takt: 0, wer: 'ritter', von: a.pos, nach: landung, sprung: hexDistance(a.pos, landung) > 1 });
    // Was auf den uebersprungenen Feldern liegt, nimmt der Ritter im Flug mit.
    const weit = hexDistance(a.pos, landung);
    for (let k = 1; k < weit; k++) {
      const zwischen = { q: a.pos.q + d[0] * k, r: a.pos.r + d[1] * k };
      a.pos = zwischen;
      aufheben(a);
    }
    a.pos = landung;
    a.schritte -= 1;
    a.pfad = [...a.pfad, landung];
    sehen(a);
    aufheben(a);
    zauberPruefen(a);
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
  zauberPruefen(a);
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
  const feld = HEX_DIRS.map(([dq, dr]) => ({ q: alt.pos.q + dq, r: alt.pos.r + dr })).find((h) => angelbar(gelaende(alt.seed, h.q, h.r)));
  if (!feld) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  auswerfen(a, feld);
  return nachDemSchritt(a);
}

/** Steht der Ritter am Wasser (und hat eine Angel)? */
export const kannAngeln = (a: Abenteuer): boolean =>
  a.phase === 'ziehen' && (a.inventar['angel'] ?? 0) > 0 && HEX_DIRS.some(([dq, dr]) => angelbar(gelaende(a.seed, a.pos.q + dq, a.pos.r + dr)));

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
  // Mit der Axt im Wald: wer dort einen Gegner faellt, schlaegt auch Holz.
  if (a.ausruestung.waffe === 'axt' && !a.schleime.some((x) => x.id === s.id) && istWald(gelaende(a.seed, s.q, s.r))) holzSchlagen(a, 1);
  // Ein Treffer laedt die Waffe.
  if (a.phase === 'ziehen') laden(a, takt);
}

/** Schaden an einem Schleim - stirbt er, zerplatzt er (und der Koenig erwacht vielleicht). */
function verwunde(a: Abenteuer, s: Schleim, schaden: number, takt: number, vorne: string, fremd = false): void {
  s.leben -= schaden;
  if (s.leben > 0) {
    melde(a, `${vorne}: Treffer${schaden > 1 ? ` (${schaden} Schaden)` : ''} - der ${schleimName(s)} wankt.`);
    return;
  }
  a.schleime = a.schleime.filter((x) => x.id !== s.id);
  a.ereignisse.push({
    art: 'tod',
    takt,
    wer: s.id,
    q: s.q,
    r: s.r,
    gross: s.gross,
    ...(s.boss ? { boss: true, bossArt: s.bossArt ?? 'koenig' } : {}),
    ...(s.art ? { schleimArt: s.art } : {}),
  });
  // Erlegt eine andere Fraktion den Gegner, bekommt der Ritter nichts.
  if (fremd) {
    melde(a, `${vorne} erlegt den ${schleimName(s)}.`);
    return;
  }
  erfahrung(a, s.boss ? 10 : s.gross || s.art ? 2 : 1, takt);
  if (s.boss && s.bossArt === 'penta') {
    // Der Pentagrammschleim ist bezwungen: Stufe 2 des Pentagrammmeisters.
    a.pentaStufe = 2;
    melde(a, `${vorne}: der Pentagrammschleim zerfaellt! Pentagrammmeister Stufe 2: deine Zauber bleiben ${KREIS_DAUER} Takte als Kreise auf der Karte.`);
    a.ereignisse.push({ art: 'legende', takt, id: 'pentagramm2' });
    return;
  }
  if (s.boss) {
    // Der Koenig ist bezwungen - kein Ende: er laesst einen legendaeren Fund
    // fallen, und nach weiteren BOSS_NACH Schleimen erwacht ein staerkerer.
    a.koenige = (a.koenige ?? 0) + 1;
    a.bossErwacht = false;
    melde(a, `${vorne}: der ${schleimName(s)} zerplatzt! Er hinterlaesst etwas Legendaeres.`);
    const moeglich = ['sololeveling', 'hermes', 'pentagramm', 'extraleben', 'herzcontainer'].filter((x) => !(EINMALIG.includes(x) && hatLegende(a, x)));
    legendaerAnwenden(a, moeglich[(a.koenige * 7 + a.zeit) % moeglich.length]!, takt);
    return;
  }
  a.erschlagen += 1;
  // Der Teilschleim zerfaellt in zwei kleine Stuecke.
  if (s.art === 'teil') {
    const plaetze = HEX_DIRS.map(([dq, dr]) => ({ q: s.q + dq, r: s.r + dr }))
      .filter((h) => begehbar(gelaende(a.seed, h.q, h.r)) && !(h.q === a.pos.q && h.r === a.pos.r) && !a.schleime.some((x) => x.q === h.q && x.r === h.r))
      .slice(0, 2);
    for (const h of plaetze) {
      const id = a.naechsteId++;
      a.schleime.push({ id, q: h.q, r: h.r, leben: 1, gross: false });
      a.ereignisse.push({ art: 'neu', takt, wer: id });
    }
    if (plaetze.length) melde(a, 'Der Teilschleim zerfaellt in kleine Stuecke!');
  }
  // Banditen lassen Gold fallen, Schleime Gelee.
  if (s.art === 'bandit') {
    const gold = 2 + (s.id % 3);
    a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) + gold };
    melde(a, `${vorne}: der Bandit faellt! +${gold} Gold.`);
    return;
  }
  const gelee = s.gross || s.art === 'panzer' || s.art === 'teil' ? 2 : 1;
  a.inventar = { ...a.inventar, gelee: (a.inventar['gelee'] ?? 0) + gelee };
  const naechster = BOSS_NACH * (1 + (a.koenige ?? 0));
  const bisKoenig = a.bossErwacht ? '' : ` (${Math.min(a.erschlagen, naechster)}/${naechster})`;
  melde(a, `${vorne}: der ${schleimName(s)} zerplatzt! +${gelee} Gelee${bisKoenig}.`);
  if (!a.bossErwacht && !a.schleime.some((x) => x.boss) && a.erschlagen >= BOSS_NACH * (1 + (a.koenige ?? 0))) bossErwacht(a, takt);
}

const istWald = (b: Boden | null) => b === 'wald' || b === 'dschungel' || b === 'taiga';

/** Holz ins Inventar. */
function holzSchlagen(a: Abenteuer, n: number): void {
  a.inventar = { ...a.inventar, holz: (a.inventar['holz'] ?? 0) + n };
  a.ereignisse.push({ art: 'fund', takt: 0, id: 'holz' });
  melde(a, `+${n} Holz.`);
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
  } else if (id === 'pentagramm') {
    melde(a, 'Legendaer: Pentagrammmeister! Schliesst dein Weg eine Form, wirkst du einen Zauber.');
  } else if (id === 'hermes') {
    melde(a, 'Legendaer: Hermes-Stiefel! Jeder Schritt huepft bis zu zwei Felder - auch uebers Wasser.');
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
  // Die Axt entfesselt ihren Spalthieb im Wald (oder am Waldrand): ein Scheit Holz.
  if (f === 'spalthieb' && [a.pos, ...HEX_DIRS.map(([dq, dr]) => ({ q: a.pos.q + dq, r: a.pos.r + dr }))].some((h) => istWald(gelaende(a.seed, h.q, h.r)))) holzSchlagen(a, 1);
  // Spalthieb und Schutzwall warten auf den naechsten Treffer.
  a.bereit = f;
  a.ereignisse.push({ art: 'faehigkeit', takt, name: f });
  melde(a, f === 'spalthieb' ? 'Spalthieb bereit: der naechste Treffer macht 2 Schaden mehr.' : 'Schutzwall bereit: der naechste Treffer gegen dich wird abgefangen.');
}

/** Der Schleimkoenig erwacht, ein Stueck entfernt, und sucht den Ritter. */
function bossErwacht(a: Abenteuer, takt: number, art: BossArt = naechsterBoss(a)): void {
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
  const leben = art === 'penta' ? BOSS_GRUND.penta : koenigLeben(a);
  a.schleime.push({ id, q: ort.q, r: ort.r, leben, max: leben, gross: true, boss: true, bossArt: art, zaehler: 0 });
  if (art === 'penta') a.pentaGerufen = true;
  else a.bossErwacht = true;
  a.ereignisse.push({ art: 'neu', takt, wer: id }, { art: 'boss', takt, wer: id, name: BOSS_NAME[art] });
  melde(
    a,
    art === 'penta'
      ? 'Deine Pentagramme haben ihn gerufen: der Pentagrammschleim! Bezwinge ihn, und deine Zauber werden staerker.'
      : `Der Boden bebt - der ${BOSS_NAME[art]} ist erwacht! Bezwinge ihn.`,
  );
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
    const moeglich = ['sololeveling', 'hermes', 'pentagramm', 'extraleben', 'herzcontainer'].filter((x) => !(EINMALIG.includes(x) && hatLegende(a, x)));
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
    } else {
      // Nicht gleich anlegen (Spieltest): im Inventar leuchtet es gruen, wenn es besser ist.
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
  if (inSchutzrune(a)) {
    a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: 'ritter', feld, wurf, schaden: 0 });
    a.ereignisse.push({ art: 'kreis', takt, name: 'schutzrune', ziele: [] });
    melde(a, `Die Schutzrune haelt - der ${schleimName(s)} prallt ab.`);
    return true;
  }
  if (a.bereit !== 'schutzwall') return false;
  a.bereit = null;
  a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: 'ritter', feld, wurf, schaden: 0 });
  melde(a, `Der Schutzwall faengt den ${schleimName(s)} ab!`);
  return true;
}

/** So viele Ticks bleibt eine Giftpfuetze. */
const GIFT_DAUER = 5;

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

/** Einen Schritt (oder Sprung) gehen - mit Spur und Ereignis. Der Giftschleim hinterlaesst eine Pfuetze. */
function zieheSchleim(a: Abenteuer, s: Schleim, ziel: Hex, takt: number, sprung = false): void {
  if (s.art === 'gift') a.gift = [...(a.gift ?? []).filter((g) => g.bis > a.zeit), { q: s.q, r: s.r, bis: a.zeit + GIFT_DAUER }];
  a.ereignisse.push({ art: 'gehen', takt, wer: s.id, von: { q: s.q, r: s.r }, nach: ziel, ...(sprung ? { sprung: true } : {}) });
  a.spuren = { ...a.spuren, [s.id]: [...(a.spuren[s.id] ?? [{ q: s.q, r: s.r }]), ziel] };
  s.q = ziel.q;
  s.r = ziel.r;
}

/** Ein gewoehnlicher, grosser oder besonderer Schleim in seinem Tick. */
function schleimHandelt(a: Abenteuer, s: Schleim, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean): void {
  // Der Geisterschleim schwebt auch uebers Wasser.
  const frei = (h: Hex) => (s.art === 'geist' ? gelaende(a.seed, h.q, h.r) !== null : begehbar(gelaende(a.seed, h.q, h.r))) && !besetzt(h.q, h.r);
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
    if (!getroffen && helferGetroffen(a, s, feld, takt, rng)) return;
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
  // Steht ein Soeldner oder Wanderer neben ihm (und der Ritter nicht), geht er auf den los.
  const helfer = d > 1 && s.art !== 'spring' && s.art !== 'spuck' ? helferNeben(a, s) : null;
  if (helfer) {
    s.angriff = helfer;
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: helfer });
    return;
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
    melde(a, `Ausgewichen! Der ${schleimName(s)} schlaegt ins Leere.`);
    return;
  }
  if (schutzwall(a, s, feld, takt, wurf)) return;
  const schaden = wurf <= abwehrVon(a) * 2 ? 0 : BOSS_SCHADEN;
  a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: 'ritter', feld, wurf, schaden });
  if (schaden > 0) {
    a.leben -= schaden;
    melde(a, `Der ${schleimName(s)} trifft dich: -${schaden} Leben.`);
  } else melde(a, `Dein Schild faengt den ${schleimName(s)} ab.`);
}

/** Der Koenig handelt (nur jeden zweiten Tick, wie alle grossen Schleime). */
function koenigHandelt(a: Abenteuer, s: Schleim, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean, neue: Schleim[]): void {
  if (s.bossArt === 'schatten') return schattenHandelt(a, s, takt, rng, besetzt);
  if (s.bossArt === 'koloss') return kolossHandelt(a, s, takt, rng, besetzt, neue);
  if (s.bossArt === 'penta') return pentaHandelt(a, s, takt, rng, besetzt);
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

/** Angesagtes einloesen (Ring, Linie oder Feld) - fuer alle Bosse gleich. */
function bossLoestEin(a: Abenteuer, s: Schleim, takt: number, rng: Rng): boolean {
  if (s.flaeche) {
    const felder = s.flaeche;
    s.flaeche = null;
    a.ereignisse.push({ art: 'stampf', takt, wer: s.id, felder });
    koenigTrifft(a, s, felder, takt, rng);
    return true;
  }
  if (s.angriff) {
    const feld = s.angriff;
    s.angriff = null;
    koenigTrifft(a, s, [feld], takt, rng);
    return true;
  }
  return false;
}

/** Einen Hops naeher an den Ritter. */
function bossZieht(a: Abenteuer, s: Schleim, takt: number, besetzt: (q: number, r: number) => boolean): void {
  let ziel: Hex | null = null;
  for (const [dq, dr] of HEX_DIRS) {
    const n = { q: s.q + dq, r: s.r + dr };
    if (!begehbar(gelaende(a.seed, n.q, n.r)) || besetzt(n.q, n.r)) continue;
    if (hexDistance(n, a.pos) < hexDistance(ziel ?? s, a.pos)) ziel = n;
  }
  if (ziel) zieheSchleim(a, s, ziel, takt);
}

/** Der Schattenschleim: springt durch die Schatten neben den Ritter, spuckt Linien, schlaegt zu. */
function schattenHandelt(a: Abenteuer, s: Schleim, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean): void {
  if (bossLoestEin(a, s, takt, rng)) return;
  s.zaehler = (s.zaehler ?? 0) + 1;
  const d = hexDistance(s, a.pos);
  // Jedes dritte Mal: durch die Schatten neben den Ritter - auf die Seite, die er nicht erwartet.
  if (s.zaehler % 3 === 0 && d > 1) {
    const neben = HEX_DIRS.map(([dq, dr]) => ({ q: a.pos.q + dq, r: a.pos.r + dr }))
      .filter((h) => begehbar(gelaende(a.seed, h.q, h.r)) && !besetzt(h.q, h.r))
      .sort((x, y) => hexDistance(y, s) - hexDistance(x, s))[0];
    if (neben) {
      a.ereignisse.push({ art: 'gehen', takt, wer: s.id, von: { q: s.q, r: s.r }, nach: neben, blink: true });
      s.q = neben.q;
      s.r = neben.r;
      melde(a, 'Der Schattenschleim verschwindet - und taucht neben dir auf!');
      return;
    }
  }
  if (d === 1) {
    s.angriff = { q: a.pos.q, r: a.pos.r };
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: s.angriff });
    melde(a, 'Der Schattenschleim holt aus - weich aus!');
    return;
  }
  const dir = linieZum(s, a.pos);
  if (dir !== null) {
    const [dq, dr] = HEX_DIRS[dir]!;
    s.flaeche = [1, 2, 3].map((k) => ({ q: s.q + dq * k, r: s.r + dr * k }));
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: { q: a.pos.q, r: a.pos.r }, felder: s.flaeche });
    melde(a, 'Der Schattenschleim zielt eine dunkle Linie - tritt heraus!');
    return;
  }
  bossZieht(a, s, takt, besetzt);
}

/**
 * Der Pentagrammschleim: zeichnet Bannsterne. Jedes dritte Mal das Feld des
 * Ritters und fuenf der sechs Nachbarn - nur die eine Luecke rettet. Sonst
 * Linien aus Zauberfeuer, oder ein Schlag, wenn er nah ist.
 */
function pentaHandelt(a: Abenteuer, s: Schleim, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean): void {
  if (bossLoestEin(a, s, takt, rng)) return;
  s.zaehler = (s.zaehler ?? 0) + 1;
  const d = hexDistance(s, a.pos);
  if (s.zaehler % 3 === 0 && d <= 4) {
    const luecke = rng.int(6);
    s.flaeche = [{ q: a.pos.q, r: a.pos.r }, ...HEX_DIRS.filter((_, i) => i !== luecke).map(([dq, dr]) => ({ q: a.pos.q + dq, r: a.pos.r + dr }))];
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: { q: a.pos.q, r: a.pos.r }, felder: s.flaeche });
    melde(a, 'Der Pentagrammschleim zeichnet einen Bannstern - finde die Luecke!');
    return;
  }
  if (d === 1) {
    s.angriff = { q: a.pos.q, r: a.pos.r };
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: s.angriff });
    melde(a, 'Der Pentagrammschleim holt aus!');
    return;
  }
  const dir = linieZum(s, a.pos);
  if (dir !== null) {
    const [dq, dr] = HEX_DIRS[dir]!;
    s.flaeche = [1, 2, 3].map((k) => ({ q: s.q + dq * k, r: s.r + dr * k }));
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: { q: a.pos.q, r: a.pos.r }, felder: s.flaeche });
    melde(a, 'Der Pentagrammschleim schleudert Zauberfeuer - tritt aus der Linie!');
    return;
  }
  bossZieht(a, s, takt, besetzt);
}

/** Der Gelee-Koloss: riesig und traege - ein Ring zwei Felder weit, ruft kleine Schleime. */
function kolossHandelt(a: Abenteuer, s: Schleim, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean, neue: Schleim[]): void {
  if (bossLoestEin(a, s, takt, rng)) return;
  s.zaehler = (s.zaehler ?? 0) + 1;
  const d = hexDistance(s, a.pos);
  if (s.zaehler % 4 === 0) {
    const plaetze = HEX_DIRS.map(([dq, dr]) => ({ q: s.q + dq, r: s.r + dr }))
      .filter((h) => begehbar(gelaende(a.seed, h.q, h.r)) && !besetzt(h.q, h.r) && !neue.some((x) => x.q === h.q && x.r === h.r))
      .slice(0, 2);
    for (const h of plaetze) {
      const id = a.naechsteId++;
      neue.push({ id, q: h.q, r: h.r, leben: 2, gross: false });
      a.ereignisse.push({ art: 'neu', takt, wer: id });
    }
    if (plaetze.length) {
      melde(a, 'Der Gelee-Koloss bebt - kleine Schleime loesen sich von ihm.');
      return;
    }
  }
  if (d <= 2 && s.zaehler % 2 === 1) {
    // Der grosse Ring: alles bis zwei Felder um ihn - erst drei Felder Abstand rettet.
    s.flaeche = hexesInRange(s, 2).filter((h) => !(h.q === s.q && h.r === s.r));
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: { q: a.pos.q, r: a.pos.r }, felder: s.flaeche });
    melde(a, 'Der Gelee-Koloss blaeht sich auf - weg, mindestens drei Felder!');
    return;
  }
  if (d === 1) {
    s.angriff = { q: a.pos.q, r: a.pos.r };
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: s.angriff });
    melde(a, 'Der Gelee-Koloss holt aus!');
    return;
  }
  bossZieht(a, s, takt, besetzt);
}

// --- LEUTE: Haendler, Werber, Soeldner und Fraktionen ------------------------

/**
 * Spieltest: "Items bei einem Haendler verkaufen", "Soeldner anheuern, die
 * mitlaufen, helfen, mittrainieren, Sprueche sagen und sich lebendig
 * anfuehlen" und "andere Fraktionen laufen auf der Karte herum".
 *
 *   ORTE       Haendler (kauft Beute, verkauft Kraeuter) und Werber (bietet
 *              Soeldner an). Einer von jedem steht nah am Start, weitere
 *              findet man beim Erkunden. Man laeuft gegen sie, um zu reden.
 *   SOELDNER   folgen dem Ritter, schlagen Gegner neben sich (der
 *              Bogenschuetze zwei Felder weit), die Heilerin heilt. Mit jedem
 *              Treffer lernen sie (Erfahrung, Level, mehr Leben und Kraft).
 *              Schleime koennen sie angreifen; sie koennen fallen.
 *   FRAKTIONEN Der Orden der Waage zieht auf Patrouille und jagt Schleime und
 *              Banditen; die Gruenwald-Jaeger streifen umher und jagen
 *              Hasen; Banditen sind Feinde (eine Gegnerart) - sie lassen Gold
 *              fallen. Wer nah am Ritter ist, sagt manchmal etwas.
 */
export type OrtArt = 'haendler' | 'werber';
export type Ort = { id: number; q: number; r: number; art: OrtArt; name: string };
export type SoeldnerArt = 'zwerg' | 'soeldnerin' | 'waldlaeufer' | 'paladin';
export type Soeldner = { id: number; art: SoeldnerArt; name: string; q: number; r: number; leben: number; max: number; lv: number; ep: number; geredet?: number };
export type Fraktion = 'orden' | 'jaeger';
export type Wanderer = { id: number; fraktion: Fraktion; name: string; q: number; r: number; leben: number; max: number; ziel?: Hex; geredet?: number };

export const ORT_NAME: Record<OrtArt, string> = { haendler: 'Haendler', werber: 'Werber' };
export const FRAKTION_NAME: Record<Fraktion, string> = { orden: 'Orden der Waage', jaeger: 'Gruenwald-Jaeger' };
/** Wie die Fraktionen aussehen (Figuren des Kachelstils). */
export const FRAKTION_FIGUR: Record<Fraktion, string> = { orden: 'paladin', jaeger: 'waldlaeufer' };

export const SOELDNER: Record<SoeldnerArt, { name: string; leben: number; angriff: number; weite: number; preis: number; text: string; waffe: string }> = {
  zwerg: { name: 'Axtkaempfer', leben: 5, angriff: 1, weite: 1, preis: 6, text: 'Zaeh und treu - steht vorn, wenn es kracht.', waffe: 'axt' },
  soeldnerin: { name: 'Klingenmeisterin', leben: 4, angriff: 2, weite: 1, preis: 9, text: 'Schnell und scharf - trifft oft.', waffe: 'breitschwert' },
  waldlaeufer: { name: 'Bogenschuetze', leben: 3, angriff: 1, weite: 2, preis: 8, text: 'Trifft Gegner bis zwei Felder weit.', waffe: 'schwert' },
  paladin: { name: 'Heilerin', leben: 4, angriff: 0, weite: 1, preis: 10, text: 'Heilt dich alle vier Takte um ein halbes Herz.', waffe: 'schwert' },
};
/** So viele Soeldner folgen hoechstens. */
export const GEFOLGE_MAX = 3;
const VORNAMEN = ['Bjarne', 'Hilda', 'Odo', 'Ragna', 'Wido', 'Frida', 'Gero', 'Ilka', 'Konrad', 'Mechthild', 'Tassilo', 'Wiebke', 'Ansgar', 'Sigrun', 'Volker', 'Edda'];

const SPRUCH = {
  anheuern: ['Mein Schwert gehoert dir - solange das Gold klingt.', 'Endlich Arbeit! Wohin geht es?', 'Ich bin dabei. Lass mich vorgehen.'],
  sieg: ['Der war schnell erledigt!', 'Noch einer weniger.', 'Fuer die Muenzen!', 'Ha! Hast du das gesehen?'],
  stufe: ['Ich werde besser!', 'Spuerst du das? Ich bin staerker geworden.', 'Jeder Kampf lehrt mich etwas.'],
  wenig: ['Ich blute ... pass auf!', 'Lange halte ich das nicht durch.', 'Heilt mich jemand?'],
  boss: ['Was ist DAS denn?!', 'Bei allen Goettern - ein Boss!', 'Bleib hinter mir!'],
  heilen: ['Halt still, ich heile dich.', 'Das Licht schliesst deine Wunden.'],
  zwerg: ['Ein Bier waer jetzt was.', 'Berge sind mir lieber als Wiesen.', 'Meine Axt juckt.'],
  soeldnerin: ['Bleib dicht hinter mir.', 'Langweilig. Wo sind die Schleime?', 'Ich hab schon Schlimmeres gesehen.'],
  waldlaeufer: ['Hoerst du das? Nur der Wind.', 'Ich sehe Spuren im Gras.', 'Ein guter Tag zum Jagen.'],
  paladin: ['Moege das Licht uns fuehren.', 'Ich spuere etwas Dunkles in der Naehe.', 'Ruh dich aus, wenn du kannst.'],
  orden: ['Fuer die Waage!', 'Gruss dir, Ritter.', 'Die Wege sind nicht sicher.', 'Hast du Banditen gesehen?'],
  jaeger: ['Psst - du verscheuchst das Wild.', 'Heute gibt es Hasenbraten!', 'Der Wald hat Augen.', 'Gute Jagd, Ritter.'],
} as const;

/** Was der Haendler fuer etwas zahlt - Ausruestung nach ihrem Wert, Beute fuer wenig. */
export function verkaufsPreis(id: string): number {
  const g = gegenstand(id);
  if (!g || g.legendaer || id === 'gold') return 0;
  if (g.slot) return Math.max(1, Math.round(ausruestungsWert(id) * 0.8));
  return id === 'angel' ? 3 : id === 'holz' ? 2 : 1;
}
/** Was der Haendler verkauft. */
export const HAENDLER_WAREN: readonly { id: string; preis: number }[] = [
  { id: 'kraut', preis: 3 },
  { id: 'angel', preis: 6 },
];

/** Die drei Angebote eines Werbers - fest aus Seed und Ort. */
export function werberAngebot(a: Pick<Abenteuer, 'seed'>, o: Ort): { art: SoeldnerArt; name: string; preis: number }[] {
  const arten = Object.keys(SOELDNER) as SoeldnerArt[];
  return [0, 1, 2].map((i) => {
    const h = hash3i(a.seed, o.q * 7 + i, o.r, SALT_LEUTE + 3);
    const art = arten[(h + i) % arten.length]!;
    return { art, name: VORNAMEN[(h >>> 4) % VORNAMEN.length]!, preis: SOELDNER[art].preis };
  });
}

const SALT_LEUTE = 4711;
const sag = (a: Abenteuer, wer: { id: number; geredet?: number }, takt: number, liste: readonly string[]) => {
  const text = liste[(a.zeit + wer.id * 7) % liste.length]!;
  wer.geredet = a.zeit;
  a.ereignisse.push({ art: 'spruch', takt, wer: wer.id, text });
};

/** Ein Ort fuer Leute: begehbares Land, frei, ohne Fund. */
function ortFrei(a: Abenteuer, h: Hex): boolean {
  const b = gelaende(a.seed, h.q, h.r);
  return begehbar(b) && b !== 'berg' && b !== 'sumpf' && !(h.q === a.pos.q && h.r === a.pos.r) && !(a.orte ?? []).some((o) => hexDistance(o, h) < 3);
}

/** Am Start: ein Haendler und ein Werber in der Naehe. */
function ortePlatzieren(a: Abenteuer): void {
  a.orte = [];
  for (const [art, weit] of [['haendler', 3], ['werber', 4]] as const) {
    const ring = hexesInRange(a.pos, weit).filter((h) => hexDistance(h, a.pos) === weit && ortFrei(a, h));
    const h = ring[hash3i(a.seed, weit, 0, SALT_LEUTE) % Math.max(1, ring.length)];
    if (h) a.orte.push({ id: a.naechsteId++, q: h.q, r: h.r, art, name: VORNAMEN[hash3i(a.seed, h.q, h.r, SALT_LEUTE + 1) % VORNAMEN.length]! });
  }
}

/** Beim Erkunden: ab und zu ein weiterer Haendler oder Werber. */
function ortEntdecken(a: Abenteuer, h: Hex): void {
  const z = hash3i(a.seed, h.q, h.r, SALT_LEUTE + 2) % 260;
  if (z !== 7 && z !== 77) return;
  if (!ortFrei(a, h) || hexDistance(h, a.pos) < 2) return;
  const art: OrtArt = z === 7 ? 'haendler' : 'werber';
  a.orte = [...(a.orte ?? []), { id: a.naechsteId++, q: h.q, r: h.r, art, name: VORNAMEN[hash3i(a.seed, h.q, h.r, SALT_LEUTE + 1) % VORNAMEN.length]! }];
}

export const ortAuf = (a: Abenteuer, q: number, r: number): Ort | undefined => (a.orte ?? []).find((o) => o.q === q && o.r === r);
const soeldnerAuf = (a: Abenteuer, q: number, r: number) => (a.gefolge ?? []).find((g) => g.q === q && g.r === r);
const wandererAuf = (a: Abenteuer, q: number, r: number) => (a.wanderer ?? []).find((w) => w.q === q && w.r === r);

/** Mit einem Haendler oder Werber reden - er muss nah sein. Oeffnet den Laden. */
export function ansprechen(alt: Abenteuer, ortId: number): Abenteuer {
  const o = (alt.orte ?? []).find((x) => x.id === ortId);
  if (!o || hexDistance(o, alt.pos) > 1 || alt.phase === 'tot') return alt;
  const a = structuredClone(alt);
  a.ereignisse = [{ art: 'treffen', takt: 0, ort: o.id }];
  a.laden = o.id;
  melde(a, o.art === 'haendler' ? `${o.name}, der Haendler: "Zeig her, was du hast!"` : `${o.name}, der Werber: "Suchst du Klingen? Ich kenne die besten."`);
  return a;
}

export function ladenZu(alt: Abenteuer): Abenteuer {
  if (alt.laden == null) return alt;
  return { ...alt, laden: null, ereignisse: [] };
}

const offenerLaden = (a: Abenteuer, art: OrtArt): Ort | null => {
  const o = (a.orte ?? []).find((x) => x.id === a.laden);
  return o && o.art === art && hexDistance(o, a.pos) <= 1 ? o : null;
};

/** Ein Stueck an den Haendler verkaufen (alle: den ganzen Stapel). */
export function verkaufen(alt: Abenteuer, id: string, alle = false): Abenteuer {
  const preis = verkaufsPreis(id);
  const n = alt.inventar[id] ?? 0;
  if (!offenerLaden(alt, 'haendler') || preis <= 0 || n <= 0) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  const stueck = alle ? n : 1;
  const inv = { ...a.inventar };
  if (n - stueck > 0) inv[id] = n - stueck;
  else delete inv[id];
  inv['gold'] = (inv['gold'] ?? 0) + preis * stueck;
  a.inventar = inv;
  melde(a, `Verkauft: ${stueck > 1 ? `${stueck}× ` : ''}${gegenstand(id)!.name} fuer ${preis * stueck} Gold.`);
  return a;
}

/** Beim Haendler kaufen. */
export function kaufen(alt: Abenteuer, id: string): Abenteuer {
  const ware = HAENDLER_WAREN.find((w) => w.id === id);
  if (!offenerLaden(alt, 'haendler') || !ware || (alt.inventar['gold'] ?? 0) < ware.preis) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) - ware.preis, [id]: (a.inventar[id] ?? 0) + 1 };
  if (a.inventar['gold'] === 0) delete a.inventar['gold'];
  melde(a, `Gekauft: ${gegenstand(id)!.name} fuer ${ware.preis} Gold.`);
  return a;
}

/** Einen Soeldner beim Werber anheuern (nr: 0 bis 2 seines Angebots). */
export function anheuern(alt: Abenteuer, nr: number): Abenteuer {
  const o = offenerLaden(alt, 'werber');
  if (!o) return alt;
  const angebot = werberAngebot(alt, o)[nr];
  const schluessel = `${o.id}:${nr}`;
  if (!angebot || (alt.angeheuert ?? []).includes(schluessel) || (alt.gefolge ?? []).length >= GEFOLGE_MAX || (alt.inventar['gold'] ?? 0) < angebot.preis) return alt;
  // Ein freies Feld neben dem Ritter.
  const platz = HEX_DIRS.map(([dq, dr]) => ({ q: alt.pos.q + dq, r: alt.pos.r + dr })).find(
    (h) => begehbar(gelaende(alt.seed, h.q, h.r)) && !schleimAuf(alt, h.q, h.r) && !ortAuf(alt, h.q, h.r) && !soeldnerAuf(alt, h.q, h.r) && !wandererAuf(alt, h.q, h.r),
  );
  if (!platz) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  const def = SOELDNER[angebot.art];
  const g: Soeldner = { id: a.naechsteId++, art: angebot.art, name: angebot.name, q: platz.q, r: platz.r, leben: def.leben, max: def.leben, lv: 1, ep: 0 };
  a.gefolge = [...(a.gefolge ?? []), g];
  a.angeheuert = [...(a.angeheuert ?? []), schluessel];
  a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) - angebot.preis };
  if (a.inventar['gold'] === 0) delete a.inventar['gold'];
  a.ereignisse.push({ art: 'neu', takt: 0, wer: g.id });
  sag(a, g, 0, SPRUCH.anheuern);
  melde(a, `${g.name} (${def.name}) schliesst sich dir an.`);
  return a;
}

/** Soeldner: Angriff mit Level. */
const soeldnerAngriff = (g: Soeldner) => SOELDNER[g.art].angriff + Math.floor((g.lv - 1) / 2);
/** Erfahrung bis zum naechsten Level eines Soeldners. */
export const soeldnerEp = (lv: number) => 3 + lv * 2;

function soeldnerLernt(a: Abenteuer, g: Soeldner, ep: number, takt: number): void {
  g.ep += ep;
  if (g.ep < soeldnerEp(g.lv)) return;
  g.ep -= soeldnerEp(g.lv);
  g.lv += 1;
  g.max += 1;
  g.leben = g.max;
  sag(a, g, takt, SPRUCH.stufe);
  melde(a, `${g.name} steigt auf Level ${g.lv}!`);
}

/** Ein Schlag eines Soeldners oder Wanderers auf einen Gegner. */
function helferSchlaegt(a: Abenteuer, wer: { id: number; name: string }, s: Schleim, angriff: number, rng: Rng, takt: number, fremd: boolean): boolean {
  const wurf = 1 + rng.int(6);
  const noetig = s.art === 'panzer' ? 5 : 4;
  const schaden = wurf + angriff >= noetig ? 1 : 0;
  a.ereignisse.push({ art: 'hieb', takt, wer: wer.id, ziel: s.id, wurf, schaden });
  if (!schaden) return false;
  const vorher = a.schleime.length;
  verwunde(a, s, schaden, takt, wer.name, fremd);
  return a.schleime.length < vorher && !a.schleime.some((x) => x.id === s.id);
}

/** Ein Tick des Gefolges: heilen, zuschlagen, sonst dem Ritter folgen. */
function gefolgeHandelt(a: Abenteuer, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean): void {
  for (const g of a.gefolge ?? []) {
    const def = SOELDNER[g.art];
    if (g.art === 'paladin' && a.zeit % 4 === 0 && a.leben < maxLebenVon(a) && hexDistance(g, a.pos) <= 2) {
      const plus = Math.min(0.5, maxLebenVon(a) - a.leben);
      a.leben += plus;
      a.ereignisse.push({ art: 'heil', takt, leben: plus });
      if (rng.int(3) === 0) sag(a, g, takt, SPRUCH.heilen);
      soeldnerLernt(a, g, 1, takt);
      continue;
    }
    // Den schwaechsten Gegner in Reichweite.
    const ziel = a.schleime
      .filter((s) => hexDistance(s, g) <= def.weite && (s.gebannt ?? 0) <= a.zeit)
      .sort((x, y) => x.leben - y.leben || hexDistance(x, g) - hexDistance(y, g))[0];
    if (ziel && (def.angriff > 0 || hexDistance(ziel, g) === 1)) {
      const tot = helferSchlaegt(a, g, ziel, soeldnerAngriff(g), rng, takt, false);
      if (tot) {
        soeldnerLernt(a, g, 2, takt);
        if (rng.int(2) === 0 && (g.geredet ?? -9) < a.zeit - 3) sag(a, g, takt, SPRUCH.sieg);
      } else soeldnerLernt(a, g, 1, takt);
      continue;
    }
    // Folgen: weit weg - durch die Buesche nachkommen; sonst einen Schritt naeher.
    const d = hexDistance(g, a.pos);
    let nach: Hex | null = null;
    let blink = false;
    if (d > 6) {
      nach = HEX_DIRS.map(([dq, dr]) => ({ q: a.pos.q + dq, r: a.pos.r + dr })).find((h) => begehbar(gelaende(a.seed, h.q, h.r)) && !besetzt(h.q, h.r)) ?? null;
      blink = true;
    } else if (d > 1) {
      for (const [dq, dr] of HEX_DIRS) {
        const n = { q: g.q + dq, r: g.r + dr };
        if (!begehbar(gelaende(a.seed, n.q, n.r)) || besetzt(n.q, n.r)) continue;
        if (hexDistance(n, a.pos) < hexDistance(nach ?? g, a.pos)) nach = n;
      }
    }
    if (nach) {
      a.ereignisse.push({ art: 'gehen', takt, wer: g.id, von: { q: g.q, r: g.r }, nach, ...(blink ? { blink: true } : {}) });
      g.q = nach.q;
      g.r = nach.r;
    }
    // Ab und zu ein Wort - jeder auf seine Art.
    if ((g.geredet ?? -99) < a.zeit - 12 && hash3i(a.seed, a.zeit, g.id, SALT_LEUTE + 5) % 9 === 0) {
      if (g.leben <= g.max / 3) sag(a, g, takt, SPRUCH.wenig);
      else if (a.schleime.some((x) => x.boss && hexDistance(x, a.pos) <= 6)) sag(a, g, takt, SPRUCH.boss);
      else sag(a, g, takt, SPRUCH[g.art]);
    }
  }
}

/** Ein Schleim (oder Bandit) trifft einen Soeldner oder Wanderer. */
function helferGetroffen(a: Abenteuer, s: Schleim, feld: Hex, takt: number, rng: Rng): boolean {
  const g = soeldnerAuf(a, feld.q, feld.r);
  const w = g ? undefined : wandererAuf(a, feld.q, feld.r);
  const wer = g ?? w;
  if (!wer) return false;
  const wurf = 1 + rng.int(6);
  const schaden = wurf >= 3 ? (s.gross ? 2 : 1) : 0;
  a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: wer.id, feld, wurf, schaden });
  if (!schaden) return true;
  wer.leben -= schaden;
  if (wer.leben > 0) {
    if (g && g.leben <= g.max / 3 && (g.geredet ?? -9) < a.zeit - 3) sag(a, g, takt, SPRUCH.wenig);
    return true;
  }
  a.ereignisse.push({ art: 'faellt', takt, wer: wer.id, q: wer.q, r: wer.r });
  if (g) {
    a.gefolge = (a.gefolge ?? []).filter((x) => x.id !== g.id);
    melde(a, `${g.name} faellt im Kampf.`);
  } else a.wanderer = (a.wanderer ?? []).filter((x) => x.id !== wer.id);
  return true;
}

/** Steht neben dem Schleim ein Helfer (und nicht der Ritter)? Dann den. */
function helferNeben(a: Abenteuer, s: Schleim): Hex | null {
  const ziele = [...(a.gefolge ?? []), ...(a.wanderer ?? [])].filter((x) => hexDistance(x, s) === 1);
  // Banditen gehen auf alle los, Schleime auf das Gefolge und den Orden.
  return ziele.length ? { q: ziele[0]!.q, r: ziele[0]!.r } : null;
}

/**
 * Die Fraktionen: alle paar Ticks zieht eine Gruppe herein (Orden, Jaeger
 * oder Banditen), weit weg; wer zu weit vom Ritter ist, verschwindet.
 */
const FRAKTION_ALLE = 12;
function fraktionenZiehen(a: Abenteuer, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean): void {
  a.wanderer = (a.wanderer ?? []).filter((w) => hexDistance(w, a.pos) <= 20);
  // Banditen, die weit weg sind, gehen auch.
  a.schleime = a.schleime.filter((s) => s.art !== 'bandit' || hexDistance(s, a.pos) <= 20);
  if (a.zeit % FRAKTION_ALLE === 0 && a.wanderer.length + a.schleime.filter((s) => s.art === 'bandit').length < 5) {
    const welche = rng.int(3);
    for (let versuch = 0; versuch < 12; versuch++) {
      const [dq, dr] = HEX_DIRS[rng.int(6)]!;
      const weit = 7 + rng.int(3);
      const mitte = { q: a.pos.q + dq * weit + rng.int(3) - 1, r: a.pos.r + dr * weit + rng.int(3) - 1 };
      const plaetze = [mitte, ...HEX_DIRS.map(([x, y]) => ({ q: mitte.q + x, r: mitte.r + y }))].filter((h) => begehbar(gelaende(a.seed, h.q, h.r)) && !besetzt(h.q, h.r));
      if (plaetze.length < 2) continue;
      for (const h of plaetze.slice(0, 2)) {
        const id = a.naechsteId++;
        if (welche === 2) a.schleime.push({ id, q: h.q, r: h.r, leben: 3, gross: false, art: 'bandit' });
        else {
          const fraktion: Fraktion = welche === 0 ? 'orden' : 'jaeger';
          const leben = fraktion === 'orden' ? 4 : 3;
          a.wanderer.push({ id, fraktion, name: VORNAMEN[(id * 5 + a.zeit) % VORNAMEN.length]!, q: h.q, r: h.r, leben, max: leben, ziel: { q: a.pos.q - dq * weit, r: a.pos.r - dr * weit } });
        }
        a.ereignisse.push({ art: 'neu', takt, wer: id });
      }
      break;
    }
  }
  for (const w of a.wanderer) {
    // Der Orden jagt Banditen und Schleime (keine Bosse), die Jaeger nur, wer ihnen zu nah kommt.
    const weit = w.fraktion === 'jaeger' ? 2 : 1;
    const feind = a.schleime
      .filter((s) => !s.boss && hexDistance(s, w) <= weit)
      .sort((x, y) => (y.art === 'bandit' ? 1 : 0) - (x.art === 'bandit' ? 1 : 0) || x.leben - y.leben)[0];
    if (feind) {
      helferSchlaegt(a, w, feind, w.fraktion === 'orden' ? 1 : 0, rng, takt, true);
      continue;
    }
    // Jaeger erlegen Hasen, die neben ihnen sitzen.
    if (w.fraktion === 'jaeger') {
      const hase = (a.tiere ?? []).find((t) => t.art === 'hase' && hexDistance(t, w) === 1);
      if (hase) {
        a.tiere = (a.tiere ?? []).filter((t) => t.id !== hase.id);
        a.ereignisse.push({ art: 'hieb', takt, wer: w.id, ziel: null, feld: { q: hase.q, r: hase.r }, wurf: 6, schaden: 0 });
        if (hexDistance(w, a.pos) <= 6) sag(a, w, takt, ['Heute gibt es Hasenbraten!']);
        continue;
      }
    }
    // Sonst ziehen sie ihres Weges: zum Ziel, der Orden zu Schleimen in der Naehe.
    const jagd = w.fraktion === 'orden' ? a.schleime.filter((s) => !s.boss && hexDistance(s, w) <= 5).sort((x, y) => hexDistance(x, w) - hexDistance(y, w))[0] : undefined;
    let ziel: Hex | undefined = jagd ?? w.ziel;
    if (!ziel || hexDistance(ziel, w) <= 1) {
      const [dq, dr] = HEX_DIRS[rng.int(6)]!;
      w.ziel = { q: w.q + dq * 8, r: w.r + dr * 8 };
      ziel = w.ziel;
    }
    if (rng.int(4) !== 0) {
      let nach: Hex | null = null;
      for (const [dq, dr] of HEX_DIRS) {
        const n = { q: w.q + dq, r: w.r + dr };
        if (!begehbar(gelaende(a.seed, n.q, n.r)) || besetzt(n.q, n.r)) continue;
        if (hexDistance(n, ziel) < hexDistance(nach ?? w, ziel)) nach = n;
      }
      if (nach) {
        a.ereignisse.push({ art: 'gehen', takt, wer: w.id, von: { q: w.q, r: w.r }, nach });
        w.q = nach.q;
        w.r = nach.r;
      }
    }
    if (hexDistance(w, a.pos) <= 3 && (w.geredet ?? -99) < a.zeit - 15 && rng.int(4) === 0) sag(a, w, takt, SPRUCH[w.fraktion]);
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
  const besetzt = (q: number, r: number) =>
    (q === a.pos.q && r === a.pos.r) ||
    a.schleime.some((s) => s.q === q && s.r === r) ||
    (a.tiere ?? []).some((t) => t.q === q && t.r === r) ||
    !!ortAuf(a, q, r) ||
    !!soeldnerAuf(a, q, r) ||
    !!wandererAuf(a, q, r);
  // Stufe 2: erst wirken die Zauberkreise - wer im Bannkreis steht, kommt gar nicht erst zum Zug.
  kreiseWirken(a, takt);
  // Das Gefolge: heilen, zuschlagen, folgen.
  gefolgeHandelt(a, takt, rng, besetzt);
  const neue: Schleim[] = [];
  for (const s of a.schleime) {
    if ((s.gebannt ?? 0) > a.zeit) continue;
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
  // Die Fraktionen ziehen durchs Land.
  fraktionenZiehen(a, takt, rng, besetzt);
  // Die Schneehasen: nah am Ritter fliehen sie, sonst hoppeln sie mal hierhin, mal dorthin.
  for (const t of a.tiere ?? []) {
    const d = hexDistance(t, a.pos);
    if (d > 12) continue;
    if (t.art === 'schaf') {
      // Schafe sind gemuetlich: nur wer direkt neben ihnen steht, scheucht sie; sonst grasen sie und tappen mal ein Feld weiter.
      const weide = HEX_DIRS.map(([dq, dr]) => ({ q: t.q + dq, r: t.r + dr })).filter((h) => {
        const b = gelaende(a.seed, h.q, h.r);
        return (b === 'wiese' || b === 'feld') && !besetzt(h.q, h.r);
      });
      const ziel = d <= 1 ? weide.sort((x, y) => hexDistance(y, a.pos) - hexDistance(x, a.pos))[0] : rng.int(6) === 0 ? weide[rng.int(Math.max(1, weide.length))] : undefined;
      if (ziel && (d > 1 || hexDistance(ziel, a.pos) > d)) {
        a.ereignisse.push({ art: 'gehen', takt, wer: t.id, von: { q: t.q, r: t.r }, nach: ziel });
        t.q = ziel.q;
        t.r = ziel.r;
      }
      if (d <= 3 && rng.int(14) === 0) a.ereignisse.push({ art: 'spruch', takt, wer: t.id, text: rng.int(3) === 0 ? 'Maeeeh!' : 'Maeh.' });
      continue;
    }
    const nachbarn = HEX_DIRS.map(([dq, dr]) => ({ q: t.q + dq, r: t.r + dr })).filter((h) => begehbar(gelaende(a.seed, h.q, h.r)) && !besetzt(h.q, h.r));
    let ziel: Hex | null = null;
    if (d <= 2) ziel = nachbarn.sort((x, y) => hexDistance(y, a.pos) - hexDistance(x, a.pos))[0] ?? null;
    else if (rng.int(3) === 0 && nachbarn.length) ziel = nachbarn[rng.int(nachbarn.length)]!;
    if (ziel && hexDistance(ziel, a.pos) >= d) {
      a.ereignisse.push({ art: 'gehen', takt, wer: t.id, von: { q: t.q, r: t.r }, nach: ziel, sprung: true });
      t.q = ziel.q;
      t.r = ziel.r;
    }
  }
  a.rng = rng.getState();
  // Ein aufgeschobener Pentagrammschleim kommt, sobald kein anderer Boss mehr da ist.
  if (!a.pentaGerufen && (a.pentaStufe ?? 1) < 2 && (a.zauberZahl ?? 0) >= PENTA_BOSS_NACH && !a.schleime.some((x) => x.boss)) bossErwacht(a, takt, 'penta');
  // Gift: wer in einer Pfuetze steht, verliert ein halbes Leben; alte Pfuetzen vertrocknen.
  a.gift = (a.gift ?? []).filter((g) => g.bis > a.zeit);
  if (a.gift.some((g) => g.q === a.pos.q && g.r === a.pos.r) && !inSchutzrune(a)) {
    a.leben -= 0.5;
    a.ereignisse.push({ art: 'gift', takt });
    melde(a, 'Gift! -½ Leben.');
  }
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
  // Spielstaende von vor den Haendlern: einen Haendler und einen Werber dazustellen.
  if (!a.orte) {
    ortePlatzieren(a);
    a.schleime = a.schleime.filter((s) => !ortAuf(a, s.q, s.r));
  }
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
  | { t: 'schritte' }
  | { t: 'aufdecken' }
  | { t: 'boss'; art: BossArt }
  | { t: 'pentaStufe' }
  | { t: 'gold' };

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
  } else if (d.t === 'gold') {
    a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) + 20 };
    melde(a, 'Debug: +20 Gold.');
  } else if (d.t === 'pentaStufe') {
    if (!hatLegende(a, 'pentagramm')) legendaerAnwenden(a, 'pentagramm', 0);
    a.pentaStufe = (a.pentaStufe ?? 1) >= 2 ? 1 : 2;
    melde(a, `Debug: Pentagrammmeister Stufe ${a.pentaStufe}.`);
  } else if (d.t === 'boss') {
    if (a.schleime.some((s) => s.boss)) return alt;
    if (d.art === 'penta') {
      bossErwacht(a, 0, 'penta');
      return a;
    }
    const vorher = a.koenige;
    a.koenige = BOSS_FOLGE.indexOf(d.art);
    bossErwacht(a, 0);
    a.koenige = vorher;
  } else if (d.t === 'aufdecken') {
    const neu = new Set(a.erkundet);
    for (const h of hexesInRange(a.pos, 28)) neu.add(hexKey(h.q, h.r));
    a.erkundet = [...neu];
    melde(a, 'Debug: die Gegend ist aufgedeckt.');
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
    a.schleime.push({ id, q: ort.q, r: ort.r, leben: art === 'panzer' || art === 'teil' || art === 'bandit' ? 3 : gross ? 4 : 2, gross, ...(art ? { art } : {}) });
    a.ereignisse.push({ art: 'neu', takt: 0, wer: id });
    melde(a, `Debug: ein ${art ? SCHLEIM_NAME[art] : gross ? 'grosser Schleim' : 'Schleim'} erscheint.`);
  }
  return a;
}
