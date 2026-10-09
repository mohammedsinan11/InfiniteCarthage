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

export type Slot = 'waffe' | 'schild' | 'kopf' | 'koerper' | 'fuesse' | 'zubehoer' | 'wuerfel';
export const SLOTS: readonly Slot[] = ['waffe', 'schild', 'kopf', 'koerper', 'fuesse', 'zubehoer', 'wuerfel'];
export const SLOT_NAME: Record<Slot, string> = {
  waffe: 'Waffe',
  schild: 'Schild',
  kopf: 'Kopf',
  koerper: 'Koerper',
  fuesse: 'Fuesse',
  zubehoer: 'Zubehoer',
  wuerfel: 'Wuerfel',
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
  /** Wuerfel: wie gut er fuer den Vergleich im Inventar ist (gruen/rot). */
  wuerfelWert?: number;
};

/**
 * WUERFEL ALS AUSRUESTUNG - ein eigener Platz. Ohne Wuerfel wirft der Ritter
 * einen gewoehnlichen W6. Jeder Wuerfel wirft anders:
 *   glueckswuerfel  W6 - einmal je Zug neu wuerfeln, solange man nicht ging
 *   bleiwuerfel     W6, aber nie unter 3
 *   zwillingswuerfel zwei W6, der hoehere zaehlt
 *   wanderwuerfel   W8
 *   fluchwuerfel    W10 - eine 1 kostet ein Leben
 *   goldwuerfel     W6 - eine 6 bringt Gold
 */
export const WUERFEL_SEITEN: Record<string, number> = { wanderwuerfel: 8, fluchwuerfel: 10 };

/**
 * WUERFEL MIT SEITENEFFEKTEN - gewoehnliche W6, aber bestimmte Augen loesen
 * etwas aus (im Bild leuchten diese Augen golden):
 *   funkenwuerfel   6: die Waffe ist voll geladen - ihre Faehigkeit wirkt
 *   kraeuterwuerfel 1: ein Kraut - selbst Pech hat sein Gutes
 *   runenwuerfel    5, 6: Funken regnen auf alle Gegner bis 2 Felder
 *   schildwuerfel   1, 2: ein Schutzwall faengt den naechsten Treffer
 *   heilwuerfel     2, 4, 6: ein halbes Herz zurueck
 *   bannwuerfel     6: alle Gegner bis 3 Felder sind zwei Takte gebannt
 */
export const WUERFEL_EFFEKT: Record<string, readonly number[]> = {
  funkenwuerfel: [6],
  kraeuterwuerfel: [1],
  runenwuerfel: [5, 6],
  schildwuerfel: [1, 2],
  heilwuerfel: [2, 4, 6],
  bannwuerfel: [6],
};

export const GEGENSTAENDE: readonly Gegenstand[] = [
  { id: 'glueckswuerfel', name: 'Glueckswuerfel', slot: 'wuerfel', wuerfelWert: 3, text: 'Einmal je Zug darfst du neu wuerfeln (R) - solange du noch keinen Schritt gegangen bist.' },
  { id: 'bleiwuerfel', name: 'Bleiwuerfel', slot: 'wuerfel', wuerfelWert: 3, text: 'Schwer und treu: dein Schritt-Wurf ist nie unter 3 (nicht beim Zuschlagen).' },
  { id: 'zwillingswuerfel', name: 'Zwillingswuerfel', slot: 'wuerfel', wuerfelWert: 4, text: 'Zwei Wuerfel auf einmal - der hoehere zaehlt.' },
  { id: 'wanderwuerfel', name: 'Wanderwuerfel', slot: 'wuerfel', wuerfelWert: 3, text: 'Acht Seiten: 1 bis 8 Schritte.' },
  { id: 'fluchwuerfel', name: 'Fluchwuerfel', slot: 'wuerfel', wuerfelWert: 2, text: 'Zehn Seiten: 1 bis 10 Schritte - aber eine 1 kostet dich ein Leben.' },
  { id: 'goldwuerfel', name: 'Goldwuerfel', slot: 'wuerfel', wuerfelWert: 2, text: 'Ein gewoehnlicher W6 - aber jede 6 bringt 1 bis 3 Gold.' },
  { id: 'funkenwuerfel', name: 'Funkenwuerfel', slot: 'wuerfel', wuerfelWert: 3, text: 'Eine 6 laedt deine Waffe voll - ihre Faehigkeit wirkt sofort.' },
  { id: 'kraeuterwuerfel', name: 'Kraeuterwuerfel', slot: 'wuerfel', wuerfelWert: 2, text: 'Eine 1 bringt ein Kraut - selbst Pech hat sein Gutes.' },
  { id: 'runenwuerfel', name: 'Runenwuerfel', slot: 'wuerfel', wuerfelWert: 3, text: 'Eine 5 oder 6 laesst Funken regnen: 1 Schaden an allen Gegnern bis 2 Felder.' },
  { id: 'schildwuerfel', name: 'Schildwuerfel', slot: 'wuerfel', wuerfelWert: 2, text: 'Eine 1 oder 2 ruft einen Schutzwall: der naechste Treffer prallt ab.' },
  { id: 'heilwuerfel', name: 'Heilwuerfel', slot: 'wuerfel', wuerfelWert: 3, text: 'Jede gerade Zahl heilt ein halbes Herz.' },
  { id: 'bannwuerfel', name: 'Bannwuerfel', slot: 'wuerfel', wuerfelWert: 3, text: 'Eine 6 bannt alle Gegner bis 3 Felder fuer zwei Takte.' },
  { id: 'schwert', name: 'Schwert', slot: 'waffe', angriff: 1, ladung: 7, faehigkeit: 'spalthieb', text: '+1 auf jeden Angriffswurf. Ladung 7: Spalthieb - der naechste Treffer macht 2 Schaden mehr.' },
  { id: 'axt', name: 'Streitaxt', slot: 'waffe', angriff: 2, ladung: 6, faehigkeit: 'spalthieb', text: '+2 auf jeden Angriffswurf. Ladung 6: Spalthieb - der naechste Treffer macht 2 Schaden mehr.' },
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
    text: 'Legendaer. Faellst du, stehst du mit halbem Leben wieder auf - einmal.',
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
      'Legendaer. Laeufst du in einem Zug im Kreis zurueck (Dreieck, Raute, ...), wirkst du einen Zauber - Funken, Schutz, Heilung, Bann. Mehr in der Hilfe (?).',
  },
  {
    id: 'herzcontainer',
    name: 'Leerer Herzcontainer',
    legendaer: true,
    text: 'Legendaer. Ein Herz mehr - leer, es will erst gefuellt werden.',
  },
  // Legendaere, die zusammenwirken (Spieltest: "keine Synergien, kein Build").
  { id: 'blutdurst', name: 'Blutdurst', legendaer: true, text: 'Legendaer. Jeder Gegner, den du selbst faellst, heilt dich um ein halbes Herz.' },
  { id: 'dornen', name: 'Dornenpanzer', legendaer: true, text: 'Legendaer. Wer dich trifft, nimmt selbst 1 Schaden (Bosse nicht).' },
  { id: 'kometen', name: 'Sternschnuppe', legendaer: true, text: 'Legendaer. Jede gewuerfelte 6 laesst einen Kometen auf den naechsten Gegner (bis 5 Felder) fallen: 2 Schaden.' },
  { id: 'glueckspilz', name: 'Glueckspilz', legendaer: true, text: 'Legendaer. Zeigt dein Schritt-Wuerfel eine 1, zaehlt sie als 6 - auch fuer Wuerfeleffekte und Sternschnuppe (nicht beim Zuschlagen).' },
  { id: 'runenmeister', name: 'Runenmeister', legendaer: true, text: 'Legendaer. Deine Waffe laedt doppelt so schnell.' },
  { id: 'wirbelwind', name: 'Wirbelwind', legendaer: true, text: 'Legendaer. Jeder Treffer trifft auch alle anderen Gegner neben dir (1 Schaden).' },
  { id: 'ruhepuls', name: 'Ruhepuls', legendaer: true, text: 'Legendaer. Jedes Warten (S) laedt deine Waffe um 2.' },
  { id: 'jagdfieber', name: 'Jagdfieber', legendaer: true, text: 'Legendaer. Jeder Gegner, den du selbst faellst, schenkt dir einen Schritt.' },
  { id: 'konter', name: 'Konter', legendaer: true, text: 'Legendaer. Schlaegt ein Gegner neben dir ins Leere, triffst du ihn sofort (1 Schaden).' },
  { id: 'durchschlag', name: 'Durchschlag', legendaer: true, text: 'Legendaer. Ein Hieb mit vollem Fokus trifft auch den Gegner dahinter (2 Schaden).' },
  { id: 'hinterhalt', name: 'Hinterhalt', legendaer: true, text: 'Legendaer. Aus dem Wald heraus macht jeder deiner Treffer 1 Schaden mehr.' },
  { id: 'schatzsucher', name: 'Schatzsucher', legendaer: true, text: 'Legendaer. Truhen bieten vier statt drei Dinge, und Muenzfunde bringen doppelt.' },
  { id: 'angel', name: 'Angel', text: 'Am Wasser: in Richtung Wasser gehen (oder F) wirft die Angel aus - ein Schritt. Mit Glueck beisst ein Fisch.' },
  { id: 'fisch', name: 'Fisch', heilt: 1, text: 'Antippen: 1 Leben zurueck. Stapelt sich.' },
  { id: 'gold', name: 'Gold', text: 'Muenzen - sie stehen ueber dem Inventar. Noch kauft hier niemand etwas.' },
  { id: 'fluchtruhe', name: 'Verfluchte Truhe', text: 'Darin liegt Legendaeres - aber ihre Waechter erwachen, wenn du sie oeffnest.' },
  { id: 'fluch_oeffnen', name: 'Oeffnen', text: 'Waehle sofort ein Legendaeres - dann erwachen die Waechter.' },
  { id: 'fluch_lassen', name: 'Stehen lassen', text: 'Lieber nicht. Du kannst spaeter wiederkommen.' },
  { id: 'ev_beten', name: 'Beten', text: 'Volles Leben.' },
  { id: 'ev_pluendern', name: 'Pluendern', text: '+15 Gold - aber die Waechter des Schreins erwachen (zwei Gegner).' },
  { id: 'ev_weiter', name: 'Weitergehen', text: 'Nichts riskieren.' },
  { id: 'ev_helfen', name: 'Helfen', text: 'Ein Herz kostet es dich - zum Dank darfst du aus seinem Gepaeck waehlen.' },
  { id: 'ev_ausrauben', name: 'Ausrauben', text: '+8 Gold. Niemand sieht es ... hoffentlich.' },
  { id: 'ev_wetten', name: 'Wetten (5 Gold)', text: 'Die Haelfte der Zeit gewinnst du 12 Gold.' },
  { id: 'ev_hoch', name: 'Hoch wetten (1 Herz)', text: 'Gewinnst du, waehlst du ein Legendaeres. Verlierst du, verlierst du 1 Leben.' },
  { id: 'ev_trinken', name: 'Trinken', text: 'Heilung, volle Ladung - oder Gift. Wer weiss?' },
  { id: 'ev_fuellen', name: 'Flasche fuellen', text: 'Zwei Kraeuter fuer spaeter.' },
  { id: 'ev_gelee', name: 'Drei Gelee geben', text: 'Er braut dir etwas: eine Truhe zur Wahl und 10 Gold. (Komm wieder, wenn du nicht genug hast.)' },
  { id: 'ev_karte', name: 'Die Gegend (3 Gold)', text: 'Die Seherin zeigt dir alles bis 10 Felder weit.' },
  { id: 'ev_omen', name: 'Die Zukunft (8 Gold)', text: 'Deine Waffe wird voll geladen und du heilst 2 Leben.' },
  { id: 'goldfisch', name: 'Goldfisch', text: 'Ein seltener Fang - der Haendler zahlt 8 Gold.' },
  { id: 'extraherz', name: 'Heilung', text: 'Sofort volles Leben.' },
  { id: 'goldsack', name: 'Goldsack', text: '15 Gold auf einmal.' },
  { id: 'holz', name: 'Holz', text: 'Mit der Axt im Wald geschlagen - der Haendler zahlt 2 Gold je Scheit.' },
  { id: 'gelee', name: 'Schleimgelee', text: 'Was ein Schleim zuruecklaesst. Der Haendler zahlt 2 Gold je Stueck, der Alchemist tauscht drei gegen eine Truhe.' },
];

export const gegenstand = (id: string): Gegenstand | undefined => GEGENSTAENDE.find((g) => g.id === id);

/** Was in Truhen liegen kann - das Schwert traegt der Ritter schon. */
const TRUHENINHALT = [
  'axt',
  'breitschwert',
  'runenklinge',
  'flammenschwert',
  'schild',
  'helm',
  'ruestung',
  'stiefel',
  'laterne',
  'angel',
  'glueckswuerfel',
  'bleiwuerfel',
  'zwillingswuerfel',
  'wanderwuerfel',
  'fluchwuerfel',
  'goldwuerfel',
  'funkenwuerfel',
  'kraeuterwuerfel',
  'runenwuerfel',
  'schildwuerfel',
  'heilwuerfel',
  'bannwuerfel',
];

/**
 * Wie gut ein Ausruestungsteil ist - fuer den Vergleich im Inventar (gruen
 * besser, rot schlechter als das Angelegte).
 */
export function ausruestungsWert(id: string | null): number {
  const g = gegenstand(id ?? '');
  if (!g?.slot) return -1;
  return (
    (g.angriff ?? 0) * 3 +
    ((g.krit ?? 2) - 2) * 2 +
    (g.ladung ? 2 : 0) +
    (g.abwehr ?? 0) * 3 +
    (g.leben ?? 0) * 2 +
    (g.schritte ?? 0) * 3 +
    (g.sicht ?? 0) * 2 +
    (g.wuerfelWert ?? 0)
  );
}

/** Besser (1), schlechter (-1) oder gleich (0) als das, was im Platz liegt - null fuer Nicht-Ausruestung. */
export function vergleich(a: Abenteuer, id: string): 1 | -1 | 0 | null {
  const g = gegenstand(id);
  if (!g?.slot) return null;
  const jetzt = a.ausruestung[g.slot];
  if (!jetzt) return 1;
  // Der Funkenwuerfel nuetzt nur mit einer Waffe, die eine Faehigkeit hat.
  const wert = (x: string) => (x === 'funkenwuerfel' && !ladungVon(a).faehigkeit ? 0 : ausruestungsWert(x));
  const d = wert(id) - wert(jetzt);
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
  /** Elite (ab Akt 2): zaeher, golden umrandet, laesst Gold fallen. */
  elite?: boolean;
  /** Wann der Boss seine laufende Ansage gemacht hat (Takt). */
  angesagt?: number | null;
  /** Der Endboss rast (ab halbem Leben). */
  rast?: boolean;
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
// Spieltest: "Bosskaempfe in Akt 1 und 2 ziehen sich" - darum weniger Leben.
const BOSS_GRUND: Record<BossArt, number> = { koenig: 8, schatten: 11, koloss: 19, penta: 16 };

/** Ein neuer Schleim: die Art aus einer Zahl 0..99 - gut die Haelfte gewoehnlich. */
function neuerSchleim(id: number, q: number, r: number, zahl: number, fern: boolean): Schleim {
  if (zahl < 12) return { id, q, r, leben: 2, gross: false, art: 'spuck' };
  if (zahl < 24) return { id, q, r, leben: 2, gross: false, art: 'spring' };
  if (zahl < 33) return { id, q, r, leben: 3, gross: false, art: 'panzer' };
  if (zahl < 42) return { id, q, r, leben: 2, gross: false, art: 'gift' };
  if (zahl < 50) return { id, q, r, leben: 2, gross: false, art: 'teil' };
  if (zahl < 57) return { id, q, r, leben: 2, gross: false, art: 'geist' };
  const gross = fern && zahl % 3 === 0;
  return { id, q, r, leben: gross ? 4 : 2, gross };
}

/** Die ersten so vielen Ticks kommt kein Nachschub - ein ruhiger Anfang. */
const NACHSCHUB_RUHE = 8;
/** Alle wie viele Ticks Nachschub kommt: Akt 1 selten, Akt 3 oft. */
const nachschubTakt = (a: Pick<Abenteuer, 'akt' | 'heldenstufe' | 'omen'>): number =>
  Math.max(4, [11, 8, 6][(a.akt ?? 1) - 1]! - Math.max(0, (a.heldenstufe ?? 0) - 1) - (a.omen === 'wildnis' ? 3 : 0));
/** Welche Art kommt: in Akt 1 vor allem gewoehnliche, spaeter alle. */
function artZahl(a: Pick<Abenteuer, 'akt'>, rng: Rng): number {
  const akt = a.akt ?? 1;
  return akt === 1 ? 40 + rng.int(60) : akt === 2 ? 10 + rng.int(90) : rng.int(100);
}
/** Spaetere Akte und Heldenstufen machen Gegner zaeher; ab Akt 2 gibt es Elite. */
function staerken(a: Pick<Abenteuer, 'akt' | 'heldenstufe' | 'omen'>, s: Schleim, rng: Rng): Schleim {
  const akt = a.akt ?? 1;
  const hs = a.heldenstufe ?? 0;
  let plus = (akt >= 3 ? 1 : 0) + (hs >= 3 ? 1 : 0);
  const blut = (a as Pick<Abenteuer, 'omen'>).omen === 'blutmond';
  const eliteSelten = (akt === 1 ? 7 : akt === 2 ? 8 : 5) / (hs >= 1 ? 2 : 1) / (blut ? 1.6 : 1);
  if ((akt >= 2 || blut) && rng.int(Math.max(2, Math.round(eliteSelten))) === 0) {
    s.elite = true;
    plus += 2;
  }
  if (plus > 0) {
    s.leben += plus;
    s.max = s.leben;
  }
  return s;
}

/** Wie man ihn nennt - mit "Der" davor. */
export function schleimName(s: Pick<Schleim, 'boss' | 'art' | 'gross'> & { bossArt?: BossArt; elite?: boolean }): string {
  if (s.boss) return BOSS_NAME[s.bossArt ?? 'koenig'];
  const name = s.art ? SCHLEIM_NAME[s.art] : s.gross ? 'grosse Schleim' : 'Schleim';
  return s.elite ? `Elite-${name.replace('grosse ', '')}` : name;
}
/** Der Name nach "den" (Akkusativ): "den grossen Schleim", "den Banditen". */
export function schleimNameAkk(s: Pick<Schleim, 'boss' | 'art' | 'gross'> & { bossArt?: BossArt; elite?: boolean }): string {
  const n = schleimName(s);
  if (n === 'grosse Schleim') return 'grossen Schleim';
  if (n.endsWith('Bandit')) return `${n}en`;
  return n;
}

/** Hoechstes Leben eines Schleims - fuer die Lebensbalken. */
export function schleimMaxLeben(s: Pick<Schleim, 'boss' | 'art' | 'gross'> & { max?: number }): number {
  if (s.boss) return s.max ?? BOSS_LEBEN;
  if (s.max) return s.max;
  if (s.art === 'panzer' || s.art === 'bandit') return 3;
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
  /** Eine Wahl (1 aus 3) ist offen. */
  | { art: 'wahl'; takt: number }
  /** Ein neuer Akt beginnt. */
  | { art: 'akt'; takt: number; akt: number; name: string }
  /** Der Endboss ist bezwungen - Sieg! */
  | { art: 'sieg'; takt: number }
  /** Die Waffe ist voll geladen - ihre Faehigkeit wartet auf Taste 1. */
  | { art: 'geladen'; takt: number; name: Faehigkeit }
  /** Ein Wuerfel loest seinen Seiteneffekt aus - der Name steigt ueber dem Ritter auf. */
  | { art: 'wuerfelEffekt'; takt: number; text: string }
  /** Der Fluchwuerfel zeigt eine 1: ein Leben weniger. */
  | { art: 'fluch'; takt: number }
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
  /** Zwillingswuerfel: der zweite Wuerfel des letzten Wurfs. */
  zweiterWurf?: number | null;
  /** Glueckswuerfel: in diesem Zug schon neu gewuerfelt? */
  neuGewuerfelt?: boolean;
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
  /** Wie oft jeder Zauber gewirkt wurde - der haeufigste bestimmt den Begleiter. */
  zauberArten?: Partial<Record<Zauber, number>>;
  /** Gegner, die auf Stufe 2 durch Pentagramme fielen (fuer Stufe 3). */
  pentaKills?: number;
  /** Stufe 3: Ladung der Beschwoerung (bis BESCHWOERUNG_VOLL). */
  beschwoerung?: number;
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
  /** Legendaeres, das in diesem Abenteuer schon angeboten wurde. */
  angeboten?: string[];
  /** Fokus (0 bis FOKUS_MAX): Warten sammelt ihn, der naechste Hieb nutzt ihn, Gehen bricht ihn. */
  fokus?: number;
  /** Fehlschlaege in Folge - nach zweien trifft der naechste Hieb sicher. */
  fehlschlaege?: number;
  /** Beim Haendler gekaufte Einzelstuecke ("ortId:id"). */
  gekauft?: string[];
  /** Der Akt (1 bis AKTE): jeder endet mit seinem Boss, der dritte mit dem Endboss. */
  akt?: number;
  /** Erlegte Gegner in diesem Akt - bei AKT_ZIEL erwacht sein Boss. */
  aktKills?: number;
  /** In welchem Zug der Akt begann - nach AKT_ZUEGE Zuegen kommt der Boss so oder so. */
  aktStart?: number;
  /** Eine offene Wahl (1 aus 3): Truhe, Schatz, Bossbeute, Altar. Solange sie offen ist, ruht das Spiel. */
  wahl?: Wahl | null;
  /** Die Klasse des Helden (Lager). */
  klasse?: KlasseId;
  /** Heldenstufe (Schwierigkeit, im Lager gewaehlt): Gegner zaeher und zahlreicher, mehr Punkte. */
  heldenstufe?: number;
  /** Ein Tagesabenteuer (gleicher Seed fuer alle am selben Tag)? */
  tag?: string;
  /** Im Lager freigeschaltetes Legendaeres, das in diesem Abenteuer vorkommen kann. */
  legenden?: string[];
  /** Das Vorzeichen dieses Abenteuers (OMEN) - jedes Abenteuer spielt sich etwas anders. */
  omen?: OmenId;
  /** Eile: Zuege, die man dem Boss-Zeitplan voraus war - bringt Punkte. */
  eile?: number;
  /** Der Boss ist angekuendigt: in diesem Zug erwacht er (Vorwarnung). */
  bossBald?: number | null;
  /** Die Schatzkarte des Akts: hier liegt ein Versteck (Spieltest 15: "nichts lockt nach draussen"). */
  versteck?: Hex | null;
  /** In welchem Akt der Beutezug schon eine Truhe gab. */
  beuteAkt?: number;
  /** Deckung (G): der naechste Treffer macht einen Schaden weniger. */
  deckung?: boolean;
  /** Intern: dieses Warten ist Deckung, kein Fokus. */
  deckenModus?: boolean;
  /** Beim Haendler geschaerft (Angriff) und verstaerkt (Abwehr) - je hoechstens 2. */
  schmied?: { angriff: number; abwehr: number };
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

/**
 * AKTE. Spieltest: "Kein Ziel, kein Ende - die Bosse kommen endlos wieder."
 * Ein Abenteuer hat jetzt drei Akte. In jedem erwacht nach AKT_ZIEL erlegten
 * Gegnern sein Boss; wer ihn bezwingt, waehlt eine von drei legendaeren
 * Belohnungen, und der naechste Akt beginnt - die Welt wird gefaehrlicher.
 * Der Boss des dritten Akts ist der Endboss: bezwungen ist das Abenteuer
 * gewonnen.
 */
export const AKTE = 3;
// Spieltest 14: "Akt 1 und 2 sind nach sechs Kills vorbei - keine Zeit zum Erkunden."
export const AKT_ZIEL: readonly number[] = [7, 8, 8];
export const AKT_BOSS: readonly BossArt[] = ['koenig', 'schatten', 'koloss'];
export const AKT_NAME: readonly string[] = ['Der Aufbruch', 'Schatten im Land', 'Der Gelee-Koloss'];
/** Wie viele Gegner der Boss dieses Akts verlangt. */
export const aktZiel = (a: Pick<Abenteuer, 'akt'> & { omen?: OmenId }): number => {
  const z = AKT_ZIEL[(a.akt ?? 1) - 1] ?? 10;
  return a.omen === 'fruehboss' ? Math.ceil(z / 2) : z;
};
/** Jeder weitere Koenig hat vier Leben mehr. */
export const koenigLeben = (a: Pick<Abenteuer, 'koenige' | 'akt' | 'heldenstufe'> & { seed?: number }): number => bossGrund(a, naechsterBoss(a)) + 3 * (a.heldenstufe ?? 0);
/** Welcher Boss als naechster kommt: der Boss des Akts. */
/**
 * Spieltest 11: "Immer dieselben drei Bosse in derselben Reihenfolge." Akt 1 und 2
 * tauschen je nach Seed ihre Bosse; ihr Leben richtet sich nach dem Akt, nicht nach der Art.
 */
export const naechsterBoss = (a: Pick<Abenteuer, 'koenige' | 'akt'> & { seed?: number }): BossArt => {
  if (a.akt === undefined) return BOSS_FOLGE[(a.koenige ?? 0) % BOSS_FOLGE.length]!;
  const tausch = a.seed !== undefined && (a.seed >>> 0) % 2 === 1 && a.akt <= 2;
  return tausch ? (a.akt === 1 ? 'schatten' : 'koenig') : (AKT_BOSS[a.akt - 1] ?? 'koloss');
};
const AKT_BOSS_LEBEN = [8, 11, 19];
const bossGrund = (a: Pick<Abenteuer, 'akt'>, art: BossArt): number =>
  art === 'penta' ? BOSS_GRUND.penta : a.akt !== undefined ? (AKT_BOSS_LEBEN[a.akt - 1] ?? BOSS_GRUND[art]) : BOSS_GRUND[art];
const BOSS_SCHADEN = 2;
export const GRUND_LEBEN = 6;
const GRUND_SICHT = 3;
/** Wie weit Schleime den Ritter wittern. */
const WITTERUNG = 6;
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
  // Spieltest 11: "sieben Legendaere bis Zug 40" - Schatztruhen halb so oft.
  if (hash3i(a.seed, q, r, SALT_FUND + 7) % 800 === 0) return 'schatz';
  // Spieltest: "Beute liegt ueberall, nichts ist knapp." Weniger, dafuer
  // Truhen mit Wahl (1 aus 3).
  const h = hash3i(a.seed, q, r, SALT_FUND) % 200;
  // Ausruestung liegt offen da - man sieht, was es ist.
  if (h < 2) return TRUHENINHALT[hash3i(a.seed, q, r, SALT_FUND + 1) % TRUHENINHALT.length]!;
  if (h < 3) return 'truhe';
  // Spieltest 13: "sechs Legendaere je Lauf" - verfluchte Truhen halb so oft.
  if (h === 199 && hash3i(a.seed, q, r, SALT_FUND + 11) % 2 === 0) return 'fluchtruhe';
  if (h < 8 && (t === 'wald' || t === 'wiese' || t === 'feld' || t === 'dschungel' || t === 'taiga')) return 'kraut';
  if (h < 11) return 'gold';
  if (h < 13) return 'halbherz';
  if (h < 14) return 'herz';
  return null;
}

// --- Werte aus der Ausruestung --------------------------------------------

const summe = (a: Abenteuer, f: (g: Gegenstand) => number | undefined): number =>
  SLOTS.reduce((n, s) => n + (f(gegenstand(a.ausruestung[s] ?? '') ?? ({} as Gegenstand)) ?? 0), 0);
export const angriffVon = (a: Abenteuer) => summe(a, (g) => g.angriff) + (a.bonus?.angriff ?? 0) + (a.schmied?.angriff ?? 0) + gelaendeBonus(a, 'angriff');
export const abwehrVon = (a: Abenteuer) => summe(a, (g) => g.abwehr) + (a.bonus?.abwehr ?? 0) + (a.schmied?.abwehr ?? 0) + gelaendeBonus(a, 'abwehr');
/**
 * Gelaende im Kampf (Spieltest: "Bewegung ist nur Ausweichen"): im Wald
 * (auch Dschungel, Taiga) +1 Abwehr, auf Huegeln und Bergen +1 Angriff.
 */
export function gelaendeBonus(a: Pick<Abenteuer, 'seed' | 'pos'>, was: 'angriff' | 'abwehr'): number {
  const b = gelaende(a.seed, a.pos.q, a.pos.r);
  if (was === 'abwehr') return b === 'wald' || b === 'dschungel' || b === 'taiga' ? 1 : 0;
  return b === 'huegel' || b === 'berg' ? 1 : 0;
}
export const maxLebenVon = (a: Abenteuer) => GRUND_LEBEN + summe(a, (g) => g.leben) + (a.bonus?.leben ?? 0) + (a.extraHerzen ?? 0);
export const sichtVon = (a: Abenteuer) => GRUND_SICHT + summe(a, (g) => g.sicht) - (hatOmen(a, 'nebel') ? 1 : 0);
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
      // Spieltest 12: "zwischen Bergen eingesperrt" - ringsum genug flaches Land.
      const flach = hexesInRange(h, 3).filter((x) => {
        const b = gelaende(seed, x.q, x.r);
        return begehbar(b) && kosten(b) <= 1;
      }).length;
      if (nachbarn >= 3 && flach >= 22) return h;
    }
  }
  return notfall ?? o;
}

export function neuesAbenteuer(seed: number, optionen: StartOptionen = {}): Abenteuer {
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
    ausruestung: { waffe: 'schwert', schild: null, kopf: null, koerper: null, fuesse: null, zubehoer: null, wuerfel: null },
    schleime: [],
    naechsteId: 1,
    genommen: [hexKey(start.q, start.r)],
    erkundet: [],
    erschlagen: 0,
    log: ['Ein Ritter bricht auf. Wuerfle, um loszuziehen.'],
    ereignisse: [],
    spuren: {},
    geruht: false,
    akt: 1,
    aktKills: 0,
    aktStart: 1,
  };
  ansiedeln(a, start);
  a.orte = [];
  ortePlatzieren(a);
  a.schleime = a.schleime.filter((s) => !ortAuf(a, s.q, s.r));
  startAnwenden(a, optionen);
  if (optionen.omen) versteckLegen(a);
  sehen(a);
  return a;
}

/**
 * Schleime in der Umgebung - nie zu nah am Start, und nah am Start nur
 * gewoehnliche (Spieltest: "die ersten 15 Zuege ein Muenzwurf").
 */
function ansiedeln(a: Abenteuer, start: Hex): void {
  for (const h of hexesInRange(start, 14)) {
    const d = hexDistance(start, h);
    if (d < 5) continue;
    if (hash3i(a.seed, h.q, h.r, SALT_SCHLEIM) % (d < 9 ? 30 : 24) !== 0) continue;
    if (!begehbar(gelaende(a.seed, h.q, h.r))) continue;
    const zahl = hash3i(a.seed, h.q, h.r, SALT_SCHLEIM + 1) % 100;
    a.schleime.push(staerken(a, neuerSchleim(a.naechsteId++, h.q, h.r, d < 9 ? 57 + (zahl % 43) : zahl, d > 8), new Rng(hash3i(a.seed, h.q, h.r, 77))));
  }
}

/**
 * NEUE GEGEND. Spieltest 11: "Alle drei Akte auf derselben Karte." Nach jedem
 * Boss zieht der Held weit weiter - in ein neues Land mit eigenen Leuten,
 * Begegnungen und Gegnern. Das Gefolge kommt mit.
 */
export const GEGEND_WEIT = 45;
function neueGegend(a: Abenteuer): void {
  const [dq, dr] = HEX_DIRS[((a.seed >>> 0) + (a.akt ?? 1)) % 6]!;
  const ziel = startFeld(a.seed, { q: a.pos.q + dq * GEGEND_WEIT, r: a.pos.r + dr * GEGEND_WEIT });
  a.pos = ziel;
  a.pfad = [ziel];
  a.spuren = {};
  a.gift = [];
  a.kreise = [];
  a.schleime = [];
  const frei = HEX_DIRS.map(([x, y]) => ({ q: ziel.q + x, r: ziel.r + y })).filter((h) => begehbar(gelaende(a.seed, h.q, h.r)));
  (a.gefolge ?? []).forEach((g, i) => {
    const h = frei[i % Math.max(1, frei.length)] ?? ziel;
    g.q = h.q;
    g.r = h.r;
  });
  ansiedeln(a, ziel);
  ortePlatzieren(a);
  a.schleime = a.schleime.filter((s) => !ortAuf(a, s.q, s.r));
  sehen(a);
  // Uebrige Schritte des Bosszugs verfallen - der neue Akt beginnt mit einem frischen Wurf.
  a.schritte = 0;
  melde(a, 'Du ziehst weiter - in ein neues Land. Neue Leute, neue Gegner.');
  versteckLegen(a);
}

// --- Wahl: 1 aus 3 --------------------------------------------------------

/**
 * Spieltest: "Keine Entscheidungen beim Bauen - Funde sind Zufall." Darum:
 * Truhen, goldene Schaetze und die Beute der Bosse bieten DREI Dinge an, der
 * Spieler waehlt eines. Solange die Wahl offen ist, ruht das Spiel.
 */
export type WahlArt = 'truhe' | 'schatz' | 'boss' | 'fluch' | 'ereignis';
export type Wahl = { art: WahlArt; titel: string; optionen: string[]; ort?: number };

/**
 * SYNERGIEN - was gut zusammenpasst (Spieltest: "kaum Synergien sichtbar").
 * Auf den Wahlkarten steht "Passt zu ...", und gruen, wenn man den Partner schon hat.
 */
export const SYNERGIEN: readonly [string, string][] = [
  ['glueckspilz', 'kometen'],
  ['dornen', 'blutdurst'],
  ['runenmeister', 'ruhepuls'],
  ['wirbelwind', 'jagdfieber'],
  ['sololeveling', 'jagdfieber'],
  ['schatzsucher', 'goldwuerfel'],
  ['wirbelwind', 'blutdurst'],
  ['ruhepuls', 'runenklinge'],
  ['runenmeister', 'flammenschwert'],
  ['dornen', 'herzcontainer'],
  ['kometen', 'zwillingswuerfel'],
  ['konter', 'dornen'],
  ['konter', 'wirbelwind'],
  ['durchschlag', 'ruhepuls'],
  ['durchschlag', 'runenmeister'],
  ['hinterhalt', 'jagdfieber'],
  ['hinterhalt', 'blutdurst'],
];
export function synergien(a: Abenteuer, id: string): { id: string; hast: boolean }[] {
  const hat = (x: string) => hatLegende(a, x) || Object.values(a.ausruestung).includes(x) || (a.inventar[x] ?? 0) > 0;
  return SYNERGIEN.filter(([x, y]) => x === id || y === id).map(([x, y]) => {
    const partner = x === id ? y : x;
    return { id: partner, hast: hat(partner) };
  });
}

/** Legendaeres, das noch in Frage kommt (Einmaliges nur einmal, Extra-Leben hoechstens EXTRALEBEN_MAX). */
function legendaerPool(a: Abenteuer): string[] {
  return [...LEGENDEN_GRUND, ...(a.legenden ?? [])].filter(
    (x) => !(EINMALIG.includes(x) && hatLegende(a, x)) && !(x === 'extraleben' && ((a.extraLeben ?? 0) >= EXTRALEBEN_MAX || (a.heldenstufe ?? 0) >= 5)),
  );
}
/** Hoechstens so viele Extra-Leben auf einmal (Spieltest: fuenf machten unverwundbar). */
export const EXTRALEBEN_MAX = 1;

/** Drei verschiedene aus einer Liste - mit dem Zufall des Spiels. */
function dreiAus(a: Abenteuer, liste: string[], n = 3): string[] {
  const rng = new Rng(a.rng);
  const rest = [...new Set(liste)];
  const wahl: string[] = [];
  while (wahl.length < n && rest.length) wahl.push(rest.splice(rng.int(rest.length), 1)[0]!);
  a.rng = rng.getState();
  return wahl;
}

/** Eine Wahl anbieten. */
function bietWahl(a: Abenteuer, art: WahlArt): void {
  if (art === 'truhe') {
    // Ausruestung, Wuerfel und Vorrat - je eins aus jeder Ecke, wenn es geht.
    const optionen = dreiAus(a, TRUHENINHALT.filter((id) => id !== a.ausruestung[gegenstand(id)?.slot ?? 'waffe']), hatLegende(a, 'schatzsucher') ? 4 : 3);
    a.wahl = { art, titel: 'Eine Truhe! Nimm eins.', optionen };
  } else {
    // Was in diesem Abenteuer schon angeboten wurde, kommt erst wieder, wenn nichts anderes bleibt (Spieltest).
    const alle = legendaerPool(a);
    const frisch = alle.filter((x) => !(a.angeboten ?? []).includes(x));
    const pool = frisch.length >= 3 ? frisch : alle;
    // Ist der Pool klein, fuellen Herzcontainer auf - die gibt es immer.
    const optionen = dreiAus(a, pool.length >= 4 ? pool : [...pool, 'herzcontainer', 'extraherz', 'goldsack'], art === 'boss' && hatOmen(a, 'fruehboss') ? 4 : 3);
    a.angeboten = [...new Set([...(a.angeboten ?? []), ...optionen])];
    a.wahl = { art, titel: art === 'boss' ? 'Die Beute des Bosses - waehle ein Legendaeres.' : 'Ein goldener Schatz! Waehle ein Legendaeres.', optionen };
  }
  a.ereignisse.push({ art: 'wahl', takt: 0 });
}

/**
 * Eine Truhe liegen lassen (Spieltest 16: "drei Mal schwaecher als deins, kein Ausweg").
 * Fuer Truhen und Schaetze: die Wahl verfaellt, dafuer gibt es ein wenig Gold.
 */
export function wahlAblehnen(alt: Abenteuer): Abenteuer {
  const w = alt.wahl;
  if (!w || (w.art !== 'truhe' && w.art !== 'schatz')) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  a.wahl = null;
  const n = goldDazu(a, 3);
  melde(a, `Du laesst den Inhalt liegen und nimmst nur ein paar Muenzen: +${n} Gold.`);
  return a;
}

/** Eine der angebotenen Moeglichkeiten nehmen. */
export function waehlen(alt: Abenteuer, nr: number): Abenteuer {
  const w = alt.wahl;
  const id = w?.optionen[nr];
  if (!w || !id) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  a.wahl = null;
  if (w.art === 'ereignis') {
    if (!ereignisMoeglich(alt, id)) return alt;
    ereignisWaehlen(a, id, w.ort);
    return a;
  }
  if (id === 'fluch_oeffnen') {
    a.genommen = [...a.genommen, hexKey(a.pos.q, a.pos.r)];
    fluchtruheOeffnen(a);
    return a;
  }
  if (id === 'fluch_lassen') {
    melde(a, 'Du laesst die verfluchte Truhe stehen.');
    return a;
  }
  if (id === 'extraherz') {
    a.leben = maxLebenVon(a);
    melde(a, 'Du waehlst die Heilung: volles Leben.');
  } else if (id === 'goldsack') {
    a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) + 15 };
    melde(a, 'Du waehlst den Goldsack: +15 Gold.');
  } else if (gegenstand(id)?.legendaer) legendaerAnwenden(a, id, 0);
  else gibGegenstand(a, id, 'Aus der Truhe');
  return a;
}

/** Die verfluchte Truhe oeffnen: Waechter erwachen, dann ein Legendaeres waehlen. */
function fluchtruheOeffnen(a: Abenteuer): void {
  {
    const rng = new Rng(a.rng);
    const plaetze = hexesInRange(a.pos, 2).filter(
      (h) => hexDistance(h, a.pos) === 2 && begehbar(gelaende(a.seed, h.q, h.r)) && !schleimAuf(a, h.q, h.r) && !ortAuf(a, h.q, h.r),
    );
    for (let i = 0; i < 2 && plaetze.length; i++) {
      const h = plaetze.splice(rng.int(plaetze.length), 1)[0]!;
      const id = a.naechsteId++;
      const s = staerken(a, neuerSchleim(id, h.q, h.r, artZahl(a, rng), false), rng);
      if (i === 0 && !s.elite) {
        s.elite = true;
        s.leben += 2;
        s.max = s.leben;
      }
      a.schleime.push(s);
      a.ereignisse.push({ art: 'neu', takt: 0, wer: id });
    }
    a.rng = rng.getState();
    melde(a, 'Eine verfluchte Truhe! Ihre Waechter erwachen - doch darin liegt Legendaeres.');
    bietWahl(a, 'schatz');
  }
}

/** Einen Gegenstand bekommen: Ausruestung in einen leeren Platz, sonst ins Inventar. */
function gibGegenstand(a: Abenteuer, id: string, woher: string): void {
  const g = gegenstand(id);
  if (!g) return;
  if (g.slot && a.ausruestung[g.slot] === null) {
    a.ausruestung = { ...a.ausruestung, [g.slot]: id };
    if (g.leben) a.leben += g.leben;
    melde(a, `${woher}: ${g.name} - sofort angelegt.`);
    return;
  }
  a.inventar = { ...a.inventar, [id]: (a.inventar[id] ?? 0) + 1 };
  // Spieltest 13: "Das Flammenschwert lag unbemerkt im Inventar" - Besseres wird gleich angelegt.
  const klassenWaffe = g.slot === 'waffe' && a.ausruestung.waffe === KLASSEN[a.klasse ?? 'ritter'].ausruestung.waffe && a.klasse !== 'ritter';
  const ladungWeg = g.slot === 'waffe' && ((a.ladung ?? 0) > 0 || !!a.bereit);
  if (g.slot && vergleich(a, id) === 1 && (klassenWaffe || ladungWeg)) {
    melde(a, `${woher}: ${g.name} - besser, liegt im Inventar. Klick zum Anlegen (${ladungWeg ? 'die Ladung deiner Waffe geht dann verloren' : 'deine Klassenwaffe bleibt sonst'}).`);
    return;
  }
  if (g.slot && vergleich(a, id) === 1) {
    Object.assign(a, benutzen(a, id));
    melde(a, `${woher}: ${g.name} - besser als deins, sofort angelegt (das alte liegt im Inventar).`);
    return;
  }
  melde(a, `${woher}: ${g.name} - ins Inventar.`);
}

// --- Klassen und Start (das Lager) ----------------------------------------

/**
 * KLASSEN. Im Lager waehlt man, mit wem man aufbricht - jede Klasse spielt
 * sich anders. Neue Klassen schaltet man mit Ruhm frei (client/abenteuer/meta).
 */
export type KlasseId = 'ritter' | 'waldlaeufer' | 'zwerg' | 'paladin' | 'schwarz';
export const KLASSEN: Record<KlasseId, { name: string; figur: string; text: string; leben: number; ausruestung: Partial<Record<Slot, string>>; inventar?: Record<string, number> }> = {
  ritter: { name: 'Ritter', figur: 'kachel', text: 'Ausgewogen: Schwert, 6 Leben.', leben: 6, ausruestung: { waffe: 'schwert' } },
  waldlaeufer: { name: 'Waldlaeuferin', figur: 'waldlaeufer', text: 'Schnell und weitsichtig: Stiefel und Laterne, 6 Leben. Sumpf und Bach kosten sie nur einen Schritt.', leben: 6, ausruestung: { waffe: 'schwert', fuesse: 'stiefel', zubehoer: 'laterne' } },
  zwerg: { name: 'Zwerg', figur: 'zwerg', text: 'Zaeh: Axt (Spalthieb, Holz) und Helm (+1 Herz), 7 Leben. Berge kosten ihn nur einen Schritt.', leben: 6, ausruestung: { waffe: 'axt', kopf: 'helm' } },
  paladin: { name: 'Paladin', figur: 'paladin', text: 'Standhaft: Schild und zwei Kraeuter, 6 Leben.', leben: 6, ausruestung: { waffe: 'schwert', schild: 'schild' }, inventar: { kraut: 2 } },
  schwarz: { name: 'Schwarzer Ritter', figur: 'schwarz', text: 'Fuer Wagemutige: Runenklinge, aber nur 4 Leben.', leben: 4, ausruestung: { waffe: 'runenklinge' } },
};

/** Was beim Aufbruch mitkommt: Klasse, freigeschaltete Extras, Heldenstufe, Tagesabenteuer. */
export type StartOptionen = { klasse?: KlasseId; extras?: string[]; heldenstufe?: number; tag?: string; legenden?: string[]; omen?: boolean | OmenId };

/**
 * VORZEICHEN (OMEN). Spieltest: "Karte, Gegner, Bosse - jedes Abenteuer gleich."
 * Darum zieht jedes Abenteuer (aus dem Lager) ein Vorzeichen, das die Regeln
 * etwas verbiegt - mit Risiko kommen mehr Punkte. Der Seed bestimmt es, das
 * Tagesabenteuer hat also fuer alle dasselbe.
 */
export type OmenId = 'goldrausch' | 'blutmond' | 'eile' | 'nebel' | 'segen' | 'wildnis' | 'beutezug' | 'fruehboss';
export const OMEN: Record<OmenId, { name: string; text: string; punkte: number }> = {
  goldrausch: { name: 'Goldrausch', text: 'Gefundenes und erbeutetes Gold zaehlt doppelt.', punkte: 1 },
  blutmond: { name: 'Blutmond', text: 'Elite-Gegner schon ab Akt 1 und oefter. +25 % Punkte.', punkte: 1.25 },
  eile: { name: 'Eile', text: 'Die Bosse kommen schon nach 10 Zuegen. +20 % Punkte.', punkte: 1.2 },
  nebel: { name: 'Nebel', text: 'Ein Feld weniger Sicht. +15 % Punkte.', punkte: 1.15 },
  segen: { name: 'Segen', text: 'Du beginnst mit einer legendaeren Wahl.', punkte: 1 },
  wildnis: { name: 'Wildnis', text: 'Gegner kommen schneller nach. +15 % Punkte.', punkte: 1.15 },
  // Spieltest 14: "Vorzeichen aendern nur Zahlen" - zwei, die Regeln aendern.
  beutezug: { name: 'Beutezug', text: 'Der erste Elite-Gegner jedes Akts laesst eine Truhe zurueck.', punkte: 1 },
  fruehboss: { name: 'Fruehe Bosse', text: 'Bosse erwachen nach halb so vielen Gegnern - ihre Beute bietet vier Legendaere.', punkte: 1.1 },
};
export const OMEN_IDS = Object.keys(OMEN) as OmenId[];
export const omenFuer = (seed: number): OmenId => OMEN_IDS[(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 7) % OMEN_IDS.length]!;
const hatOmen = (a: Pick<Abenteuer, 'omen'>, o: OmenId): boolean => a.omen === o;
/** Gold dazu - der Goldrausch verdoppelt es. */
function goldDazu(a: Abenteuer, n: number): number {
  const gold = hatOmen(a, 'goldrausch') ? n * 2 : n;
  a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) + gold };
  return gold;
}
/** Extras aus dem Lager (mit Ruhm freigeschaltet). */
export const START_EXTRAS: Record<string, { name: string; text: string }> = {
  kraeuter: { name: 'Kraeuterbeutel', text: 'Du beginnst mit 2 Kraeutern.' },
  geldkatze: { name: 'Geldkatze', text: 'Du beginnst mit 10 Gold.' },
  bleiwuerfel: { name: 'Bleiwuerfel', text: 'Du beginnst mit dem Bleiwuerfel (nie unter 3).' },
  herz: { name: 'Starkes Herz', text: 'Ein Herz mehr von Anfang an.' },
  karte: { name: 'Alte Karte', text: 'Du siehst zu Beginn die Gegend bis 7 Felder.' },
};

function startAnwenden(a: Abenteuer, o: StartOptionen): void {
  const k = KLASSEN[o.klasse ?? 'ritter'];
  a.klasse = o.klasse ?? 'ritter';
  a.heldenstufe = o.heldenstufe ?? 0;
  if (o.tag) a.tag = o.tag;
  if (o.legenden?.length) a.legenden = o.legenden.filter((x) => LEGENDEN_FREI.includes(x));
  if (o.omen) a.omen = o.omen === true ? omenFuer(a.seed) : o.omen;
  a.ausruestung = { ...a.ausruestung, waffe: null, ...k.ausruestung };
  // Ein Kraut fuer jeden (auch im Tagesabenteuer) - der erste Notfall ist zu ueberleben.
  a.inventar = { ...k.inventar, kraut: (k.inventar?.['kraut'] ?? 0) + 1 };
  a.extraHerzen = k.leben - GRUND_LEBEN;
  const extras = o.extras ?? [];
  if (extras.includes('kraeuter')) a.inventar = { ...a.inventar, kraut: (a.inventar['kraut'] ?? 0) + 2 };
  if (extras.includes('geldkatze')) a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) + 10 };
  if (extras.includes('bleiwuerfel')) a.ausruestung = { ...a.ausruestung, wuerfel: 'bleiwuerfel' };
  if (extras.includes('herz')) a.extraHerzen += 1;
  a.leben = maxLebenVon(a);
  if (extras.includes('karte')) {
    const neu = new Set(a.erkundet);
    for (const h of hexesInRange(a.pos, 7)) neu.add(hexKey(h.q, h.r));
    a.erkundet = [...neu];
  }
  a.log = [`${k.name}: das Abenteuer beginnt. Akt 1: ${AKT_NAME[0]}. Wuerfle (Enter), um loszuziehen.`];
  if (a.omen) {
    a.log.push(`Vorzeichen: ${OMEN[a.omen].name} - ${OMEN[a.omen].text}`);
    if (a.omen === 'segen') bietWahl(a, 'schatz');
  }
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
  // Gleiche Zeilen hintereinander werden gezaehlt statt wiederholt (Spieltest 16: "sechsmal dieselbe Zeile").
  const letzte = a.log[a.log.length - 1] ?? '';
  const m = /^(.*) \(x(\d+)\)$/.exec(letzte);
  const basis = m ? m[1] : letzte;
  if (basis === text) {
    a.log = [...a.log.slice(0, -1), `${text} (x${(m ? Number(m[2]) : 1) + 1})`];
    return;
  }
  a.log = [...a.log, text].slice(-30);
};

const schleimAuf = (a: Abenteuer, q: number, r: number) => a.schleime.find((s) => s.q === q && s.r === r);

// --- Aktionen -------------------------------------------------------------

/** Ein Wurf mit dem angelegten Wuerfel - mit seinen Eigenheiten. */
function wuerfelWurf(a: Abenteuer): { wurf: number; zusatz: string } {
  const id = a.ausruestung.wuerfel ?? '';
  const rng = new Rng(a.rng);
  const seite = (n: number) => 1 + rng.int(n);
  let wurf = seite(WUERFEL_SEITEN[id] ?? 6);
  let zusatz = '';
  a.zweiterWurf = null;
  if (id === 'bleiwuerfel' && wurf < 3) {
    zusatz = ` (Blei: ${wurf} wird 3)`;
    wurf = 3;
  } else if (id === 'zwillingswuerfel') {
    let zweiter = seite(6);
    // Glueckspilz gilt fuer jeden der beiden.
    if (hatLegende(a, 'glueckspilz')) {
      if (wurf === 1) wurf = 6;
      if (zweiter === 1) zweiter = 6;
    }
    a.zweiterWurf = zweiter;
    zusatz = ` (Zwillinge: ${wurf} und ${zweiter})`;
    wurf = Math.max(wurf, zweiter);
  } else if (id === 'fluchwuerfel' && wurf === 1) {
    a.leben = Math.max(0.5, a.leben - 1);
    a.ereignisse.push({ art: 'fluch', takt: 0 });
    zusatz = ' - der Fluch beisst: -1 Leben';
  } else if (id === 'goldwuerfel' && wurf === 6) {
    const gold = goldDazu(a, seite(3));
    zusatz = ` - der Goldwuerfel klimpert: +${gold} Gold`;
  }
  a.rng = rng.getState();
  // Glueckspilz: eine 1 zaehlt als 6.
  if (wurf === 1 && hatLegende(a, 'glueckspilz')) {
    wurf = 6;
    zusatz += ' (Glueckspilz: die 1 zaehlt als 6)';
    a.ereignisse.push({ art: 'wuerfelEffekt', takt: 0, text: 'Glueckspilz!' });
  }
  zusatz += wuerfelEffekt(a, id, wurf);
  // Sternschnuppe: jede 6 ruft einen Kometen auf den naechsten Gegner.
  if (wurf === 6 && hatLegende(a, 'kometen')) {
    const ziel = a.schleime.filter((s) => hexDistance(s, a.pos) <= 5).sort((x, y) => hexDistance(x, a.pos) - hexDistance(y, a.pos))[0];
    if (ziel) {
      a.ereignisse.push({ art: 'faehigkeit', takt: 0, name: 'runenblitz', ziel: ziel.id, felder: [{ q: ziel.q, r: ziel.r }] });
      a.ereignisse.push({ art: 'wuerfelEffekt', takt: 0, text: 'Sternschnuppe!' });
      verwunde(a, ziel, 2, 0, 'Sternschnuppe');
      zusatz += ' - eine Sternschnuppe schlaegt ein';
    }
  }
  return { wurf, zusatz };
}

/** Der Seiteneffekt eines Wuerfels bei dieser Augenzahl - gibt den Text fuer die Meldung. */
function wuerfelEffekt(a: Abenteuer, id: string, wurf: number): string {
  if (!(WUERFEL_EFFEKT[id] ?? []).includes(wurf)) return '';
  const zeige = (text: string) => a.ereignisse.push({ art: 'wuerfelEffekt', takt: 0, text });
  if (id === 'funkenwuerfel') {
    const { faehigkeit, voll } = ladungVon(a);
    if (!faehigkeit) return ' - Funken spruehen, doch deine Waffe hat keine Faehigkeit';
    zeige('Volle Ladung!');
    a.ladung = voll;
    return ` - die Waffe ist voll geladen! ${FAEHIGKEIT_NAME[faehigkeit]}: Taste 1`;
  }
  if (id === 'kraeuterwuerfel') {
    a.inventar = { ...a.inventar, kraut: (a.inventar['kraut'] ?? 0) + 1 };
    zeige('+1 Kraut');
    return ' - ein Kraut faellt aus dem Wuerfel';
  }
  if (id === 'runenwuerfel') {
    const ziele = a.schleime.filter((s) => hexDistance(s, a.pos) <= 2);
    a.ereignisse.push({ art: 'zauber', takt: 0, name: 'funkenregen', felder: HEX_DIRS.map(([dq, dr]) => ({ q: a.pos.q + dq * 2, r: a.pos.r + dr * 2 })) });
    zeige('Runenfunken!');
    for (const s of ziele) verwunde(a, s, 1, 0, 'Runenfunken');
    return ziele.length ? ' - Runenfunken regnen auf die Gegner' : ' - Runenfunken regnen, doch niemand ist nah';
  }
  if (id === 'schildwuerfel') {
    a.bereit = 'schutzwall';
    zeige('Schutzwall!');
    return ' - ein Schutzwall faengt den naechsten Treffer';
  }
  if (id === 'heilwuerfel') {
    const plus = Math.min(0.5, maxLebenVon(a) - a.leben);
    if (plus <= 0) return '';
    a.leben += plus;
    a.ereignisse.push({ art: 'heil', takt: 0, leben: plus });
    return ' - der Wuerfel heilt dich';
  }
  if (id === 'bannwuerfel') {
    const ziele = a.schleime.filter((s) => hexDistance(s, a.pos) <= 3);
    for (const s of ziele) {
      // Drei Takte (Bosse zwei) - sonst endete der Bann schon nach einem Schritt (Spieltest 14).
      s.gebannt = Math.max(s.gebannt ?? 0, a.zeit + (s.boss ? 2 : 3));
      s.angriff = null;
      s.flaeche = null;
    }
    zeige('Bann!');
    return ziele.length ? ` - ${ziele.length} ${ziele.length === 1 ? 'Gegner ist' : 'Gegner sind'} gebannt` : ' - der Bann trifft niemanden';
  }
  return '';
}

export function wuerfeln(alt: Abenteuer): Abenteuer {
  if (alt.phase !== 'wuerfeln' || alt.wahl) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  const { wurf, zusatz } = wuerfelWurf(a);
  a.wurf = wurf;
  // Spieltest: "Eine 1 auf dem roten Feld ist sicherer Schaden." Darum immer mindestens 2 Schritte.
  a.schritte = Math.max(SCHRITTE_MIN, a.wurf + schrittBonus(a));
  a.pfad = [a.pos];
  a.phase = 'ziehen';
  a.spuren = {};
  a.neuGewuerfelt = false;
  melde(
    a,
    `Gewuerfelt: ${a.wurf}${zusatz}${schrittBonus(a) > 0 ? ` (+${schrittBonus(a)} Stiefel)` : ''}${a.wurf + schrittBonus(a) < SCHRITTE_MIN ? ` (mindestens ${SCHRITTE_MIN})` : ''} - ${a.schritte} ${a.schritte === 1 ? 'Schritt' : 'Schritte'}.`,
  );
  return a;
}
/** So viele Schritte gibt jeder Wurf mindestens. */
export const SCHRITTE_MIN = 3;

/** Glueckswuerfel: neu wuerfeln - einmal je Zug, solange noch kein Schritt getan ist. */
export const kannNeuWuerfeln = (a: Abenteuer): boolean =>
  a.phase === 'ziehen' && a.ausruestung.wuerfel === 'glueckswuerfel' && !a.neuGewuerfelt && a.wurf !== null && a.schritte === Math.max(SCHRITTE_MIN, a.wurf + schrittBonus(a)) && a.pfad.length === 1;

export function neuWuerfeln(alt: Abenteuer): Abenteuer {
  if (!kannNeuWuerfeln(alt)) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  const vorher = a.wurf;
  const { wurf } = wuerfelWurf(a);
  a.wurf = wurf;
  a.schritte = Math.max(SCHRITTE_MIN, wurf + schrittBonus(a));
  a.neuGewuerfelt = true;
  melde(a, `Glueckswuerfel: ${vorher} verworfen - neu gewuerfelt: ${wurf}. ${a.schritte} Schritte.`);
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
  a.zauberArten = { ...a.zauberArten, [name]: (a.zauberArten?.[name] ?? 0) + 1 };
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
        melde(a, ziele.length > 1 ? `Der Bannkreis bannt ${ziele.length} Schleime.` : `Der Bannkreis bannt den ${schleimNameAkk(ziele[0]!)}.`);
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

/** So steht ein Zauber vorne in der Meldung - daran erkennt verwunde Pentagramm-Kills. */
const ZAUBER_VORNE = ['Funkenregen', 'Pentagramm', 'Bannkreis'] as const;

/** Ein Gegner fiel durch ein Pentagramm: auf Stufe 2 zaehlt das fuer Stufe 3, auf Stufe 3 laedt es die Beschwoerung. */
function pentagrammKill(a: Abenteuer, takt: number): void {
  const stufe = a.pentaStufe ?? 1;
  if (stufe === 2) {
    a.pentaKills = (a.pentaKills ?? 0) + 1;
    if (a.pentaKills >= PENTA_STUFE3_NACH) {
      a.pentaStufe = 3;
      a.beschwoerung = 0;
      a.ereignisse.push({ art: 'legende', takt, id: 'pentagramm3' });
      melde(a, `Pentagrammmeister Stufe 3! Fallen ${BESCHWOERUNG_VOLL} Gegner durch deine Pentagramme, beschwoerst du einen Begleiter (B).`);
    }
  } else if (stufe >= 3 && (a.beschwoerung ?? 0) < BESCHWOERUNG_VOLL) {
    a.beschwoerung = (a.beschwoerung ?? 0) + 1;
    if (a.beschwoerung === BESCHWOERUNG_VOLL) melde(a, 'Die Beschwoerung ist bereit - druecke B.');
  }
}

/** Legendaeres, das es nur einmal gibt. */
const EINMALIG = ['sololeveling', 'hermes', 'pentagramm', 'blutdurst', 'dornen', 'kometen', 'glueckspilz', 'runenmeister', 'wirbelwind', 'ruhepuls', 'jagdfieber', 'schatzsucher', 'konter', 'durchschlag', 'hinterhalt'];
/** Legendaeres, das jedes Abenteuer kennt - der Rest wird im Lager freigeschaltet (StartOptionen.legenden). */
export const LEGENDEN_GRUND = ['sololeveling', 'hermes', 'pentagramm', 'extraleben', 'herzcontainer', 'blutdurst', 'dornen', 'kometen', 'konter', 'durchschlag', 'hinterhalt'];
export const LEGENDEN_FREI = ['ruhepuls', 'schatzsucher', 'glueckspilz', 'jagdfieber', 'wirbelwind', 'runenmeister'];

/** So weit huepfen die Hermes-Stiefel (Spieltest: drei war zu viel). */
export const HERMES_WEITE = 2;

/** Traegt der Ritter diesen legendaeren Fund? */
export const hatLegende = (a: Pick<Abenteuer, 'legendaer'>, id: string): boolean => (a.legendaer ?? []).includes(id);
/**
 * Spieltest 14: "Klassen unterscheiden sich nur in Werten." Der Zwerg klettert
 * muehelos ueber Berge, die Waldlaeuferin watet durch Sumpf und Bach.
 */
export const schrittKosten = (a: Pick<Abenteuer, 'seed' | 'klasse'>, q: number, r: number): number => {
  const b = gelaende(a.seed, q, r);
  if (a.klasse === 'zwerg' && b === 'berg') return 1;
  if (a.klasse === 'waldlaeufer' && (b === 'sumpf' || b === 'fluss')) return 1;
  return kosten(b);
};

/**
 * Eine Taste im Zug: gehen, angreifen oder warten. Jeder Schritt ist ein Tick
 * der Spieluhr - danach huepfen die Schleime.
 */
/**
 * RASTEN (T). Spieltest 9: "S, S, S ... viele tote Tastendruecke." Wartet die
 * uebrigen Schritte ab - aber nur, solange kein Gegner naeher als 4 Felder ist.
 */
export function rasten(alt: Abenteuer): Abenteuer {
  if (alt.phase !== 'ziehen' || alt.wahl) return alt;
  const nah = (x: Abenteuer) => x.schleime.some((s) => hexDistance(s, x.pos) <= 3);
  if (nah(alt)) return { ...alt, ereignisse: [], log: [...alt.log, 'Zum Rasten sind Gegner zu nah.'].slice(-30) };
  let a = alt;
  for (let i = 0; i < 12 && a.phase === 'ziehen' && !a.wahl && !nah(a); i++) a = taste(a, 's');
  return a;
}

/**
 * DECKUNG (G). Spieltest 8: "Uebrige Schritte sind nur S, S, S." Wie Warten ein
 * Schritt - aber statt Fokus faengt die Deckung beim naechsten Treffer einen Schaden ab.
 */
export function decken(alt: Abenteuer): Abenteuer {
  if (alt.phase !== 'ziehen' || alt.wahl) return alt;
  return taste({ ...alt, deckenModus: true }, 's');
}

export function taste(alt: Abenteuer, t: Taste): Abenteuer {
  if (alt.phase !== 'ziehen' || alt.wahl) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  const decken = a.deckenModus === true;
  delete a.deckenModus;
  // Deckung haelt auch beim Gehen - bis sie einen Treffer abfaengt oder du selbst zuschlaegst (Spieltest 10).
  if (decken) a.deckung = true;
  if (t === 's') {
    warten(a, 0);
    // Warten sammelt Fokus fuer den naechsten Hieb (Spieltest: "die Zuege sind nur Laufen") - oder Deckung (G).
    if (decken) melde(a, 'Du gehst in Deckung: der naechste Treffer macht einen Schaden weniger.');
    else if ((a.fokus ?? 0) < FOKUS_MAX) a.fokus = (a.fokus ?? 0) + 1;
    if (hatLegende(a, 'ruhepuls')) {
      laden(a, 0);
      laden(a, 0);
    }
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
  if (ort && !((ort.art === 'altar' || ort.art === 'ereignis') && ort.benutzt)) return ansprechen(a, ort.id);
  // Ein Wanderer anderer Fraktion steht im Weg - er gruesst.
  const wand = wandererAuf(a, ziel.q, ziel.r);
  if (wand) {
    // Freundlich: er macht Platz (tauscht mit dir).
    a.ereignisse.push({ art: 'gehen', takt: 0, wer: wand.id, von: { q: wand.q, r: wand.r }, nach: { q: a.pos.q, r: a.pos.r } });
    wand.q = a.pos.q;
    wand.r = a.pos.r;
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
      // Spieltest: "Schafe versperren die Flucht" - es trottet zur Seite (tauscht mit dir).
      a.ereignisse.push({ art: 'gehen', takt: 0, wer: tier.id, von: { q: tier.q, r: tier.r }, nach: { q: a.pos.q, r: a.pos.r } }, { art: 'spruch', takt: 0, wer: tier.id, text: 'Maeh!' });
      tier.q = a.pos.q;
      tier.r = a.pos.r;
    } else {
      melde(a, 'Der Schneehase huscht dir zwischen den Beinen weg.');
      return a;
    }
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
    a.fokus = 0;
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
  const k = Math.min(schrittKosten(a, ziel.q, ziel.r), a.schritte);
  a.ereignisse.push({ art: 'gehen', takt: 0, wer: 'ritter', von: a.pos, nach: ziel });
  a.fokus = 0;
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
  if (fang && wurf === 6 && (a.zeit % 3 === 0)) {
    a.inventar = { ...a.inventar, goldfisch: (a.inventar['goldfisch'] ?? 0) + 1 };
    melde(a, `Angel ausgeworfen (Wurf 6) - ein GOLDFISCH! Der Haendler zahlt gut dafuer.`);
    a.schritte -= 1;
    ticken(a, 1);
    return;
  }
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
  if ((a.heldenstufe ?? 0) >= 4) {
    if (!ruhig) melde(a, 'Du wartest.');
  } else if (ruhig && !a.geruht && a.leben < maxLebenVon(a)) {
    a.leben += 1;
    a.geruht = true;
    a.ereignisse.push({ art: 'heil', takt, leben: 1 });
    melde(a, 'Du verschnaufst: +1 Leben.');
  } else if (!ruhig && a.log[a.log.length - 1] !== 'Du wartest - zu unruhig zum Verschnaufen, Schleime sind nah.') melde(a, 'Du wartest - zu unruhig zum Verschnaufen, Schleime sind nah.');
}

function nachDemSchritt(a: Abenteuer): Abenteuer {
  if (a.phase !== 'ziehen' || a.schritte > 0) return a;
  a.schritte = 0;
  a.phase = 'wuerfeln';
  a.zug += 1;
  a.wurf = null;
  a.geruht = false;
  stilleRuftBoss(a);
  return a;
}

/**
 * Spieltest 15: "Neun Zuege nur S - keine Gegner mehr, der Boss-Timer laeuft."
 * Ist weit und breit (10 Felder) kein Gegner, kuendigt sich der Boss an.
 */
function stilleRuftBoss(a: Abenteuer): void {
  if (a.bossErwacht || a.bossBald != null || a.schleime.some((s) => s.boss && s.bossArt !== 'penta')) return;
  // Erst nach acht Zuegen im Akt - vorher bleibt Zeit fuer Schatzkarte und Begegnungen (Spieltest 16).
  if (a.zug - (a.aktStart ?? 1) < 8 || a.schleime.some((s) => hexDistance(s, a.pos) <= 10)) return;
  a.bossBald = a.zug + BOSS_VORWARNUNG;
  melde(a, `Es ist still geworden ... Der Boden bebt! In ${BOSS_VORWARNUNG} Zuegen erwacht der ${BOSS_NAME[naechsterBoss(a)]}.`);
}

function angreifen(a: Abenteuer, s: Schleim, takt: number): void {
  const wurf = w6(a);
  // Fokus: wer vorher gewartet hat, schlaegt sicherer - und mit vollem Fokus haerter.
  const fokus = a.fokus ?? 0;
  a.fokus = 0;
  a.deckung = false;
  const summeWurf = wurf + angriffVon(a) + fokus;
  const krit = gegenstand(a.ausruestung.waffe ?? '')?.krit ?? 2;
  // Der Panzer will einen kraeftigeren Hieb; spaetere Akte und Elite auch. Eine 1 verfehlt, eine 6 trifft.
  const noetig = noetigFuer(a, s);
  // Spieltest 9: "Drei Einsen in Folge" - nach zwei Fehlschlaegen trifft der naechste sicher; Gebannte verfehlt man nicht mit einer 1.
  const sicher = (a.fehlschlaege ?? 0) >= 2;
  const wehrlos = (s.gebannt ?? 0) > a.zeit;
  const trifft = sicher || ((wurf !== 1 || wehrlos) && (wurf === 6 || summeWurf >= noetig || (wehrlos && wurf === 1 && summeWurf >= noetig - 1)));
  a.fehlschlaege = trifft ? 0 : (a.fehlschlaege ?? 0) + 1;
  if (sicher && wurf !== 1) melde(a, 'Pech gleicht sich aus: dieser Hieb trifft sicher.');
  const ausDemWald = hatLegende(a, 'hinterhalt') && istWald(gelaende(a.seed, a.pos.q, a.pos.r));
  let schaden = trifft ? (wurf === 6 ? krit : 1) + (fokus >= FOKUS_MAX ? 1 : 0) + (s.boss && wehrlos ? 1 : 0) + (ausDemWald ? 1 : 0) : 0;
  // Durchschlag: mit vollem Fokus trifft der Hieb auch den Gegner dahinter.
  if (trifft && fokus >= FOKUS_MAX && hatLegende(a, 'durchschlag')) {
    const hinter = schleimAuf(a, s.q + (s.q - a.pos.q), s.r + (s.r - a.pos.r));
    if (hinter) verwunde(a, hinter, 2, takt, 'Durchschlag');
  }
  if (trifft && s.boss && wehrlos) melde(a, 'Der Boss taumelt - dein Hieb trifft ihn mit voller Wucht (+1).');
  if (trifft && wurf === 1) melde(a, sicher ? 'Pech gleicht sich aus: dieser Hieb trifft sicher.' : 'Der Gegner taumelt - auch eine 1 trifft.');
  if (fokus > 0) melde(a, fokus >= FOKUS_MAX ? `Voller Fokus: +${fokus} auf den Wurf und ein Wuchtschlag (+1 Schaden)!` : `Fokus: +${fokus} auf den Wurf.`);
  // Ein geladener Spalthieb legt beim naechsten Treffer zwei drauf.
  const spalt = schaden > 0 && a.bereit === 'spalthieb';
  if (spalt) {
    schaden += 2;
    a.bereit = null;
  }
  a.ereignisse.push({ art: 'hieb', takt, wer: 'ritter', ziel: s.id, wurf, schaden });
  if (schaden === 0) {
    // Pech gleicht sich aus: der Fokus bleibt und waechst um eins (Spieltest 10: "eine 1 frisst den ganzen Fokus").
    a.fokus = Math.min(FOKUS_MAX, fokus + 1);
    melde(
      a,
      `Wurf ${wurf}${wurf === 1 ? ' (eine 1 verfehlt immer)' : `, noetig ${Math.min(6, Math.max(2, noetig - angriffVon(a) - fokus))}+${fokus > 0 ? ' (mit Fokus)' : ''}`}: ${s.art === 'panzer' ? 'prallt am Steinpanzer ab' : 'daneben'} - dein Fokus bleibt und steigt auf ${Math.min(FOKUS_MAX, fokus + 1)}.`,
    );
    return;
  }
  const vorne = `Wurf ${wurf}${fokus > 0 ? ` mit ${fokus} Fokus` : ''}${spalt ? ', Spalthieb' : ''}`;
  verwunde(a, s, schaden, takt, vorne);
  const gefallen = !a.schleime.some((x) => x.id === s.id);
  if (gefallen && hatLegende(a, 'blutdurst') && a.leben < maxLebenVon(a)) {
    const plus = Math.min(0.5, maxLebenVon(a) - a.leben);
    a.leben += plus;
    a.ereignisse.push({ art: 'heil', takt, leben: plus });
  }
  if (gefallen && hatLegende(a, 'jagdfieber') && a.phase === 'ziehen') {
    a.schritte += 1;
    melde(a, 'Jagdfieber: +1 Schritt.');
  }
  // Wirbelwind: jeder Treffer streift alle anderen Gegner neben dir.
  if (hatLegende(a, 'wirbelwind')) {
    for (const x of a.schleime.filter((x) => x.id !== s.id && hexDistance(x, a.pos) === 1)) verwunde(a, x, 1, takt, 'Wirbelwind');
  }
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
    // Spieltest 5: "Der Boss erwacht, weil fremde Ritter toeten" - fremde Siege zaehlen nicht fuer den Akt.
    return;
  }
  erfahrung(a, s.boss ? 10 : s.gross || s.art ? 2 : 1, takt);
  if ((ZAUBER_VORNE as readonly string[]).includes(vorne)) pentagrammKill(a, takt);
  if (s.boss && s.bossArt === 'penta') {
    // Der Pentagrammschleim ist bezwungen: Stufe 2 des Pentagrammmeisters.
    a.pentaStufe = 2;
    melde(a, `${vorne}: der Pentagrammschleim zerfaellt! Pentagrammmeister Stufe 2: deine Zauber bleiben ${KREIS_DAUER} Takte als Kreise auf der Karte.`);
    a.ereignisse.push({ art: 'legende', takt, id: 'pentagramm2' });
    return;
  }
  if (s.boss) {
    a.koenige = (a.koenige ?? 0) + 1;
    a.bossErwacht = false;
    const akt = a.akt ?? 1;
    // Der Endboss: das Abenteuer ist gewonnen.
    if (akt >= AKTE) {
      a.phase = 'sieg';
      a.ereignisse.push({ art: 'sieg', takt });
      melde(a, `${vorne}: der ${schleimName(s)} zerfaellt - der Endboss ist bezwungen! Das Abenteuer ist gewonnen.`);
      return;
    }
    // Sonst: eine von drei legendaeren Belohnungen waehlen, und der naechste Akt beginnt.
    a.akt = akt + 1;
    a.aktKills = 0;
    a.aktStart = a.zug;
    a.bossBald = null;
    // Ein Atemzug zwischen den Akten: volles Leben (Spieltest 10/11: "Akt 2 mit 1 Herz").
    a.leben = maxLebenVon(a);
    a.ereignisse.push({ art: 'akt', takt, akt: a.akt, name: AKT_NAME[a.akt - 1] ?? '' });
    melde(
      a,
      `${vorne}: der ${schleimName(s)} zerplatzt! Akt ${a.akt}: ${AKT_NAME[a.akt - 1]} - ${a.akt === 2 ? 'Banditen ziehen durchs Land, Elite-Gegner tragen Gold.' : 'Geister spuken, die Gegner schlagen haerter.'}`,
    );
    neueGegend(a);
    bietWahl(a, 'boss');
    return;
  }
  a.erschlagen += 1;
  a.aktKills = (a.aktKills ?? 0) + 1;
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
  const ziel = aktZiel(a);
  const bisBoss = a.bossErwacht ? '' : ` (${Math.min(a.aktKills, ziel)}/${ziel})`;
  if (s.art === 'bandit' || s.elite) {
    // Banditen und Elite-Schleime lassen Gold fallen.
    const gold = goldDazu(a, s.elite ? 4 + (s.id % 3) : 2 + (s.id % 3));
    melde(a, `${vorne}: der ${schleimName(s)} faellt! +${gold} Gold${bisBoss}.`);
    // Hoechstens eine Beutezug-Truhe je Akt (Spieltest 15: "sieben Truhen in acht Zuegen").
    if (s.elite && hatOmen(a, 'beutezug') && a.beuteAkt !== (a.akt ?? 1) && !a.wahl) {
      a.beuteAkt = a.akt ?? 1;
      melde(a, 'Beutezug: er hinterlaesst eine Truhe!');
      bietWahl(a, 'truhe');
    }
  } else {
    const gelee = s.gross || s.art === 'panzer' || s.art === 'teil' ? 2 : 1;
    a.inventar = { ...a.inventar, gelee: (a.inventar['gelee'] ?? 0) + gelee };
    melde(a, `${vorne}: der ${schleimName(s)} zerplatzt! +${gelee} Gelee${bisBoss}.`);
  }
  bossPruefen(a, takt);
}

/** Ist der Boss des Akts faellig (und noch keiner da), erwacht er. */
function bossPruefen(a: Abenteuer, takt: number): void {
  if (a.phase === 'tot' || a.phase === 'sieg' || a.bossErwacht || a.schleime.some((x) => x.boss && x.bossArt !== 'penta')) return;
  // Spieltest 8: "Der Boss erwacht ohne Vorwarnung, wenn ich am Boden bin." Darum zwei Zuege Vorwarnung.
  if (a.bossBald != null) {
    if (a.zug >= a.bossBald) {
      a.bossBald = null;
      bossErwacht(a, takt);
    }
    return;
  }
  if ((a.aktKills ?? 0) >= aktZiel(a)) {
    // Schneller als der Zeitplan: jeder gesparte Zug bringt Punkte (Spieltest: "Warten ist die sichere, langweilige Loesung").
    const vorsprung = Math.min(EILE_MAX, zuegeBisBoss(a));
    if (vorsprung > 0) {
      a.eile = (a.eile ?? 0) + vorsprung;
      melde(a, `Eile: ${vorsprung} ${vorsprung === 1 ? 'Zug' : 'Zuege'} vor dem Boss-Zeitplan - +${vorsprung * EILE_PUNKTE} Punkte.`);
    }
    a.bossBald = a.zug + BOSS_VORWARNUNG;
    melde(a, `Der Boden bebt! In ${BOSS_VORWARNUNG} Zuegen erwacht der ${BOSS_NAME[naechsterBoss(a)]} - heile dich und mach dich bereit.`);
    a.ereignisse.push({ art: 'wuerfelEffekt', takt, text: 'Der Boden bebt!' });
  } else if (bossUngeduldig(a)) bossErwacht(a, takt);
}

/**
 * Spieltest: "In Akt 2 und 3 laeuft man lange herum, um Gegner zu finden."
 * Darum kommt der Boss spaetestens nach AKT_ZUEGE Zuegen im Akt - ungeduldig.
 */
export const AKT_ZUEGE = 15;
export const zuegeBisBoss = (a: Pick<Abenteuer, 'zug' | 'aktStart' | 'omen' | 'akt'>): number =>
  Math.max(0, (hatOmen(a, 'eile') ? 10 : (a.akt ?? 1) >= 3 ? AKT_ZUEGE - 3 : AKT_ZUEGE) - (a.zug - (a.aktStart ?? 1)));
/** Punkte je Zug Vorsprung auf den Boss-Zeitplan. */
export const EILE_PUNKTE = 8;
/** Hoechstens so viele Eile-Zuege je Akt. */
export const EILE_MAX = 6;
/** So viele Zuege warnt das Beben, bevor der Boss erwacht. */
export const BOSS_VORWARNUNG = 2;
const bossUngeduldig = (a: Abenteuer): boolean => zuegeBisBoss(a) === 0;

/** Heldenstufen veraendern die Regeln - jede Stufe bringt eine dazu. */
export const HELDENSTUFE_REGEL: readonly string[] = [
  'Normal.',
  'Elite-Gegner kommen doppelt so oft.',
  'Bosse haben ein Drittel mehr Leben.',
  'Alle Gegner haben ein Leben mehr.',
  'Verschnaufen (Warten) heilt nicht mehr.',
  'Kein Extra-Leben aus Schaetzen und Bossen.',
];

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
    if ((a.extraLeben ?? 0) >= EXTRALEBEN_MAX) {
      a.legendaer = a.legendaer!.slice(0, -1);
      legendaerAnwenden(a, 'herzcontainer', takt);
      return;
    }
    a.extraLeben = (a.extraLeben ?? 0) + 1;
    melde(a, 'Legendaer: ein Extra-Leben! Faellst du, stehst du wieder auf.');
  } else if (id === 'pentagramm') {
    melde(a, 'Legendaer: Pentagrammmeister! Schliesst dein Weg eine Form, wirkst du einen Zauber.');
  } else if (id === 'hermes') {
    melde(a, 'Legendaer: Hermes-Stiefel! Jeder Schritt huepft bis zu zwei Felder - auch uebers Wasser.');
  } else {
    const g = gegenstand(id);
    if (g) melde(a, `Legendaer: ${g.name}! ${g.text.replace(/^Legendaer\.\s*/, '')}`);
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
  if (!voll || !faehigkeit || a.bereit === faehigkeit || (a.ladung ?? 0) >= voll) return;
  a.ladung = Math.min(voll, (a.ladung ?? 0) + (hatLegende(a, 'runenmeister') ? 2 : 1));
  // Voll: die Faehigkeit wartet, bis der Spieler sie ausloest (Taste 1) -
  // Spieltest: "Feuerkreis! - doch niemand steht nah genug", dutzendfach.
  if (a.ladung >= voll) {
    a.ereignisse.push({ art: 'geladen', takt, name: faehigkeit });
    melde(a, `${FAEHIGKEIT_NAME[faehigkeit]} ist bereit - loese sie mit Taste 1 aus.`);
  }
}

/** Ist die Waffe voll geladen? */
export const faehigkeitBereit = (a: Abenteuer): boolean => {
  const { voll, faehigkeit } = ladungVon(a);
  return !!faehigkeit && voll > 0 && (a.ladung ?? 0) >= voll;
};

/** Die geladene Faehigkeit der Waffe ausloesen (Taste 1) - kostet keinen Schritt. */
export function faehigkeitNutzen(alt: Abenteuer): Abenteuer {
  if (alt.phase === 'tot' || alt.phase === 'sieg' || alt.wahl) return alt;
  if (!faehigkeitBereit(alt)) {
    // Spieltest 8: "1 tut nichts" - sagen, wie weit die Waffe ist.
    const l = ladungVon(alt);
    if (!l.faehigkeit) return { ...alt, ereignisse: [], log: [...alt.log, 'Deine Waffe hat keine Faehigkeit.'].slice(-30) };
    return { ...alt, ereignisse: [], log: [...alt.log, `${FAEHIGKEIT_NAME[l.faehigkeit]} laedt noch: ${l.ist}/${l.voll}. Jeder Schritt und jeder Treffer laedt die Waffe.`].slice(-30) };
  }
  const a = structuredClone(alt);
  a.ereignisse = [];
  // Spieltest: "Die Ladung verpufft ohne Ziel" - ohne Gegner in Reichweite bleibt sie.
  const f = ladungVon(a).faehigkeit!;
  const weite = f === 'feuerkreis' ? 1 : f === 'runenblitz' ? 3 : 0;
  if (weite > 0 && !a.schleime.some((s) => hexDistance(s, a.pos) <= weite)) {
    melde(a, f === 'feuerkreis' ? 'Feuerkreis wartet: kein Gegner direkt neben dir.' : 'Runenblitz wartet: kein Gegner bis 3 Felder weit.');
    return a;
  }
  a.ladung = 0;
  entfessle(a, f, 0);
  return a;
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
      // Ein Boss in Reichweite geht vor (Spieltest: "trifft immer die kleinen").
      .sort((x, y) => (y.boss ? 1 : 0) - (x.boss ? 1 : 0) || hexDistance(x, a.pos) - hexDistance(y, a.pos) || x.leben - y.leben)[0];
    a.ereignisse.push({ art: 'faehigkeit', takt, name: f, ...(ziel ? { ziel: ziel.id, felder: [{ q: ziel.q, r: ziel.r }] } : {}) });
    if (!ziel) {
      melde(a, 'Runenblitz! - doch kein Gegner in Reichweite.');
      return;
    }
    verwunde(a, ziel, 2, takt, 'Runenblitz');
    return;
  }
  // Die Axt entfesselt ihren Spalthieb im Wald (oder am Waldrand): ein Scheit Holz.
  if (f === 'spalthieb' && a.ausruestung.waffe === 'axt' && [a.pos, ...HEX_DIRS.map(([dq, dr]) => ({ q: a.pos.q + dq, r: a.pos.r + dr }))].some((h) => istWald(gelaende(a.seed, h.q, h.r)))) holzSchlagen(a, 1);
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
  const hs = a.heldenstufe ?? 0;
  const leben = art === 'penta' ? BOSS_GRUND.penta : Math.round((bossGrund(a, art) + 2 * hs) * (hs >= 2 ? 4 / 3 : 1));
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

/**
 * SCHATZKARTE. Jeder Akt zeigt ein Versteck 10 bis 14 Felder weit (auf der
 * Uebersichtskarte als X). Wer hingeht, findet eine Truhe zur Wahl und Gold.
 */
function versteckLegen(a: Abenteuer): void {
  const rng = new Rng(hash3i(a.seed, a.pos.q, a.pos.r, 4242));
  for (let versuch = 0; versuch < 40; versuch++) {
    const [dq, dr] = HEX_DIRS[rng.int(6)]!;
    const weit = 10 + rng.int(5);
    const h = { q: a.pos.q + dq * weit + rng.int(5) - 2, r: a.pos.r + dr * weit + rng.int(5) - 2 };
    const b = gelaende(a.seed, h.q, h.r);
    if (!begehbar(b) || kosten(b) > 1 || ortAuf(a, h.q, h.r)) continue;
    a.versteck = h;
    melde(a, 'Eine alte Schatzkarte! Ein Versteck ist markiert (X auf der Uebersichtskarte).');
    return;
  }
  a.versteck = null;
}
function versteckPruefen(a: Abenteuer): void {
  const v = a.versteck;
  if (!v || v.q !== a.pos.q || v.r !== a.pos.r) return;
  a.versteck = null;
  const n = goldDazu(a, 8 + 4 * (a.akt ?? 1));
  melde(a, `Das Versteck! +${n} Gold und eine Truhe.`);
  a.ereignisse.push({ art: 'fund', takt: 0, id: 'schatz' });
  if (!a.wahl) bietWahl(a, 'truhe');
}

function aufheben(a: Abenteuer): void {
  versteckPruefen(a);
  const fund = fundAuf(a, a.pos.q, a.pos.r);
  if (!fund) return;
  // Herzen werden beim Aufheben gleich verbraucht. Bei vollem Leben bleiben
  // sie liegen, fuer spaeter - nichts geht verloren.
  const herz = gegenstand(fund);
  if ((fund === 'herz' || fund === 'halbherz') && herz?.heilt) {
    if (a.leben >= maxLebenVon(a)) {
      melde(a, `Volles Leben - ${fund === 'herz' ? 'das Herz bleibt' : 'das halbe Herz bleibt'} liegen.`);
      return;
    }
    a.genommen = [...a.genommen, hexKey(a.pos.q, a.pos.r)];
    const plus = Math.min(herz.heilt, maxLebenVon(a) - a.leben);
    a.leben += plus;
    a.ereignisse.push({ art: 'heil', takt: 0, leben: plus });
    melde(a, `${herz.name}: +${lebenText(plus)} Leben.`);
    return;
  }
  // Die verfluchte Truhe fragt erst (Spieltest: "sie hat mich ohne Warnung getoetet").
  if (fund === 'fluchtruhe') {
    a.wahl = { art: 'fluch', titel: 'Eine verfluchte Truhe: zwei Waechter (einer Elite) erwachen, wenn du sie oeffnest. Darin liegt Legendaeres.', optionen: ['fluch_oeffnen', 'fluch_lassen'] };
    a.ereignisse.push({ art: 'wahl', takt: 0 });
    return;
  }
  a.genommen = [...a.genommen, hexKey(a.pos.q, a.pos.r)];
  a.ereignisse.push({ art: 'fund', takt: 0, id: fund });
  // Schatz und Truhe: eine Wahl, 1 aus 3.
  if (fund === 'schatz' || fund === 'truhe') {
    melde(a, fund === 'schatz' ? 'Eine goldene Schatztruhe!' : 'Eine Truhe!');
    bietWahl(a, fund);
    return;
  }
  // Die verfluchte Truhe: Legendaeres - aber ihre Waechter erwachen (eine Elite darunter).
  if (gegenstand(fund)?.slot || fund === 'angel') {
    // Nicht gleich anlegen (Spieltest): im Inventar leuchtet es gruen, wenn es besser ist.
    gibGegenstand(a, fund, 'Gefunden');
    return;
  }
  const g = gegenstand(fund);
  // Gold sind Muenzen - eins bis drei auf einmal.
  if (fund === 'gold') {
    const n = goldDazu(a, (1 + (hash3i(a.seed, a.pos.q, a.pos.r, SALT_FUND + 9) % 3)) * (hatLegende(a, 'schatzsucher') ? 2 : 1));
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
  melde(a, `Der Schutzwall faengt den ${schleimNameAkk(s)} ab!`);
  return true;
}

/** So viele Ticks bleibt eine Giftpfuetze. */
const GIFT_DAUER = 5;

/** Ein Hieb eines Schleims auf den Ritter: trifft, oder das Schild faengt ihn ab. */
function schleimTrifft(a: Abenteuer, s: Schleim, feld: Hex, takt: number, rng: Rng): void {
  const wurf = 1 + rng.int(6);
  if (schutzwall(a, s, feld, takt, wurf)) return;
  // Spaetere Akte und Elite treffen haerter (Spieltest: "ab Akt 2 keine Spannung mehr").
  // Spieltest 14: "Akt 3 ist eine Wand" - nur Elite schlaegt haerter, nicht jeder Schleim.
  const wucht = (s.gross ? 2 : 1) + (s.elite ? 1 : 0);
  const schaden = abgewehrt(a, wurf) ? 0 : deckungFaengt(a, wucht);
  a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: 'ritter', feld, wurf, schaden });
  if (schaden > 0) {
    a.leben -= schaden;
    melde(a, `Der ${schleimName(s)} trifft dich: -${schaden} Leben.`);
    dornen(a, s, takt);
  } else if (abgewehrt(a, wurf)) melde(a, `Dein Schild faengt den ${schleimNameAkk(s)} ab (Wurf ${wurf}).`);
}

/**
 * FOKUS. Jedes Warten (S) sammelt einen Punkt, hoechstens FOKUS_MAX. Der
 * naechste eigene Hieb bekommt ihn auf den Wurf; mit vollem Fokus macht er
 * einen Schaden mehr. Ein Schritt bricht die Konzentration. So wird Warten
 * eine Entscheidung: den Gegner kommen lassen und hart zuschlagen - oder gehen.
 */
export const FOKUS_MAX = 3;

/** Deckung faengt einen Schaden ab - und ist dann verbraucht. */
function deckungFaengt(a: Abenteuer, schaden: number, wieviel = 1): number {
  if (!a.deckung || schaden <= 0) return schaden;
  a.deckung = false;
  // Gegen Bosse faengt die Deckung zwei ab (Spieltest 13: "mit einem Schritt kommt man nicht aus der Explosion").
  melde(a, `Deine Deckung faengt ${wieviel === 1 ? 'einen Schaden' : `${wieviel} Schaden`} ab.`);
  return Math.max(0, schaden - wieviel);
}
/** Abwehr: ein Wurf bis zu anderthalbmal der Abwehr prallt ab (Abwehr 1: eine 1, 2: bis 3, 3: bis 4). */
// Spieltest 9: "Ab Abwehr +5 haelt der Schild alles" - hoechstens 1 bis ABWEHR_MAX, Bosse durchschlagen einen Punkt.
export const ABWEHR_MAX = 3;
const abgewehrt = (a: Abenteuer, wurf: number, boss = false): boolean => wurf <= Math.min(ABWEHR_MAX, Math.floor(Math.max(0, abwehrVon(a) - (boss ? 1 : 0)) * 1.5));
/** Mit welcher Augenzahl man einen Gegner trifft (fuer die Anzeige "4+"). */
/**
 * Was ein Hieb erreichen muss: 4 (Panzer 5), ab Akt 2 einer mehr, ab Akt 3 zwei, Elite einen mehr.
 * Spieltest 8: "Fast alles trifft ab 1+ - der Wurf ist egal." Darum: eine 1 verfehlt immer, eine 6 trifft immer.
 */
// Spieltest 13: "In Akt 3 treffe ich nur auf 5-6" - ab Akt 2 einer mehr, nicht zwei.
export const noetigFuer = (a: Pick<Abenteuer, 'akt'>, s: Pick<Schleim, 'art'> & { elite?: boolean }): number =>
  (s.art === 'panzer' ? 5 : 4) + ((a.akt ?? 1) >= 2 ? 1 : 0) + (s.elite ? 1 : 0);
export const trefferAb = (a: Abenteuer, s: Pick<Schleim, 'art'> & { elite?: boolean }): number => Math.min(6, Math.max(2, noetigFuer(a, s) - angriffVon(a)));
/** So viel Schaden macht ein Gegner, wenn er trifft (fuer Vorschau und Info). */
export const gegnerWucht = (a: Abenteuer, s: Pick<Schleim, 'boss' | 'gross' | 'elite' | 'bossArt'>): number =>
  s.boss ? BOSS_SCHADEN + ((a.akt ?? 1) >= AKTE && s.bossArt !== 'penta' ? 1 : 0) : (s.gross ? 2 : 1) + (s.elite ? 1 : 0);
/** Wie oft die Abwehr einen Treffer abfaengt, in Augen eines W6. */
export const abwehrAugen = (a: Abenteuer): number => Math.min(ABWEHR_MAX, Math.floor(abwehrVon(a) * 1.5));

/** Dornenpanzer: wer trifft, nimmt 1 Schaden. */
function dornen(a: Abenteuer, s: Schleim, takt: number): void {
  // Bosse spueren die Dornen nicht (Spieltest 10: "Dornen erledigen die Bosse").
  if (!hatLegende(a, 'dornen') || !a.schleime.includes(s) || s.boss) return;
  verwunde(a, s, 1, takt, 'Dornenpanzer');
}

/** Liegt der Ritter in gerader Linie, 2 bis 3 Felder weit? Dann die Richtung. */
function linieZum(s: Hex, ziel: Hex): number | null {
  for (let i = 0; i < 6; i++) {
    const [dq, dr] = HEX_DIRS[i]!;
    for (let k = 2; k <= 3; k++) if (s.q + dq * k === ziel.q && s.r + dr * k === ziel.r) return i;
  }
  return null;
}

/**
 * Spieltest: "Ein Rudel sagt jeden Schritt einen Angriff an - kein Fenster zum
 * Zurueckschlagen." Darum: wer ins Leere schlaegt, taumelt einen Takt lang
 * (ein freier Hieb), und hoechstens ANSAGEN_MAX Gegner zielen zugleich auf den Ritter.
 */
const ANSAGEN_MAX = 2;
function taumeln(a: Abenteuer, s: Schleim): void {
  // Konter: wer neben dir ins Leere schlaegt, bekommt sofort einen Hieb.
  if (hatLegende(a, 'konter') && hexDistance(s, a.pos) <= 1 && a.schleime.includes(s)) {
    verwunde(a, s, 1, 0, 'Konter');
    if (!a.schleime.includes(s)) return;
  }
  // Drei Takte: auch wer erst einen Schritt heran muss, bekommt seinen freien Hieb (Spieltest 7).
  s.gebannt = Math.max(s.gebannt ?? 0, a.zeit + 3);
}
function zuVieleAnsagen(a: Abenteuer): boolean {
  return a.schleime.filter((x) => !x.boss && (x.angriff || x.flaeche)).length >= ANSAGEN_MAX;
}

/** Einen Schritt (oder Sprung) gehen - mit Spur und Ereignis. Der Giftschleim hinterlaesst eine Pfuetze. */
function zieheSchleim(a: Abenteuer, s: Schleim, ziel: Hex, takt: number, sprung = false): void {
  if (s.art === 'gift') a.gift = [...(a.gift ?? []).filter((g) => g.bis > a.zeit), { q: s.q, r: s.r, bis: a.zeit + GIFT_DAUER }];
  a.ereignisse.push({ art: 'gehen', takt, wer: s.id, von: { q: s.q, r: s.r }, nach: ziel, ...(sprung ? { sprung: true } : {}) });
  a.spuren = { ...a.spuren, [s.id]: [...(a.spuren[s.id] ?? [{ q: s.q, r: s.r }]), ziel] };
  s.q = ziel.q;
  s.r = ziel.r;
}

/**
 * RUDEL. Spieltest 7: "In Akt 1 entscheidet ein Schwarm in Zug 3 das Abenteuer."
 * In Akt 1 jagen hoechstens RUDEL_AKT1 Gegner zugleich den Ritter - die naechsten;
 * die anderen warten, bis einer faellt.
 */
export const RUDEL_AKT1 = 3;
function jagtMit(a: Abenteuer, s: Schleim): boolean {
  if (s.boss) return true;
  // Spieltest 12: "In Akt 3 kommen zehn auf einmal" - auch spaeter jagen nicht alle zugleich.
  if ((a.akt ?? 1) > 1) {
    const grenze = (a.akt ?? 1) === 2 ? 4 : 5;
    return a.schleime
      .filter((x) => !x.boss && hexDistance(x, a.pos) <= WITTERUNG)
      .sort((x, y) => hexDistance(x, a.pos) - hexDistance(y, a.pos) || x.id - y.id)
      .slice(0, grenze)
      .some((x) => x.id === s.id);
  }
  const jaeger = a.schleime
    .filter((x) => !x.boss && hexDistance(x, a.pos) <= WITTERUNG)
    .sort((x, y) => hexDistance(x, a.pos) - hexDistance(y, a.pos) || x.id - y.id)
    .slice(0, a.zug <= 5 ? 2 : RUDEL_AKT1);
  return jaeger.some((x) => x.id === s.id);
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
      taumeln(a, s);
      melde(a, 'Ausgewichen! Der Spuckschleim trifft nur Erde - und taumelt.');
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
        taumeln(a, s);
        melde(a, 'Ausgewichen! Der Springschleim landet ins Leere - und taumelt.');
      }
      return;
    }
    if (!getroffen && helferGetroffen(a, s, feld, takt, rng)) return;
    if (!getroffen) {
      a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: null, feld, wurf: 0, schaden: 0 });
      taumeln(a, s);
      melde(a, `Ausgewichen! Der ${schleimName(s)} klatscht ins Leere - und taumelt: ein freier Hieb!`);
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
  // Der Runenwaechter zieht die Schlaege auf sich - auch wenn der Ritter daneben steht.
  const waechter = s.art !== 'spring' && s.art !== 'spuck' && (a.gefolge ?? []).some((g) => g.art === 'golem' && hexDistance(g, s) === 1);
  const helfer = (d > 1 || waechter) && s.art !== 'spring' && s.art !== 'spuck' ? helferNeben(a, s) : null;
  if (helfer) {
    s.angriff = helfer;
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: helfer });
    return;
  }
  // Hoechstens ANSAGEN_MAX Gegner sagen zugleich einen Angriff auf den Ritter an - die anderen lauern.
  if (d <= 3 && zuVieleAnsagen(a)) return;
  // Der Springschleim: bis drei Felder weit sagt er sein Landefeld an.
  if ((s.art === 'spring' && d <= 3) || d === 1) {
    s.angriff = { q: a.pos.q, r: a.pos.r };
    a.ereignisse.push({ art: 'ansage', takt, wer: s.id, feld: s.angriff });
    melde(a, s.art === 'spring' ? 'Der Springschleim duckt sich zum Sprung - weg vom roten Feld!' : `Der ${schleimName(s)} holt aus - weich aus oder schlag zu!`);
    return;
  }
  let ziel: Hex | null = null;
  let sprung = false;
  // Ein ruhiger Anfang: in den ersten Takten schlummern die Schleime noch, solange der Ritter nicht nah ist.
  if (d <= WITTERUNG && (a.zeit >= 6 || d <= 2) && jagtMit(a, s)) {
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
    // Wer im Rudel warten muss, schleicht nicht heimlich naeher.
    if (frei(n) && (d > WITTERUNG || hexDistance(n, a.pos) >= d)) ziel = n;
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
    // Spieltest: "Bosskaempfe sind zaeh" - wer dem Boss ausweicht, bekommt ein Fenster zum Zurueckschlagen.
    taumeln(a, s);
    melde(a, `Ausgewichen! Der ${schleimName(s)} schlaegt ins Leere - und taumelt: freie Hiebe!`);
    return;
  }
  if (schutzwall(a, s, feld, takt, wurf)) return;
  // Der Endboss schlaegt haerter.
  const schaden = abgewehrt(a, wurf, true) ? 0 : deckungFaengt(a, BOSS_SCHADEN + ((a.akt ?? 1) >= AKTE && s.bossArt !== 'penta' ? 1 : 0), 2);
  a.ereignisse.push({ art: 'hieb', takt, wer: s.id, ziel: 'ritter', feld, wurf, schaden });
  if (schaden > 0) {
    a.leben -= schaden;
    melde(a, `Der ${schleimName(s)} trifft dich: -${schaden} Leben.`);
    dornen(a, s, takt);
  } else if (abgewehrt(a, wurf, true)) melde(a, `Dein Schild faengt den ${schleimNameAkk(s)} ab (Wurf ${wurf}).`);
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
  bossZieht(a, s, takt, besetzt);
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

/**
 * Einen Hops naeher an den Ritter. Spieltest: "Die Endbosse sollen dich
 * verfolgen, egal wie weit du bist." Ist der Boss weit weg (mehr als
 * BOSS_FERN Felder) oder steckt er fest (Wasser, Berge im Weg), holt er auf:
 * er taucht ein paar Felder vor dem Ritter wieder auf.
 */
const BOSS_FERN = 8;
function bossZieht(a: Abenteuer, s: Schleim, takt: number, besetzt: (q: number, r: number) => boolean): void {
  let ziel: Hex | null = null;
  for (const [dq, dr] of HEX_DIRS) {
    const n = { q: s.q + dq, r: s.r + dr };
    if (!begehbar(gelaende(a.seed, n.q, n.r)) || besetzt(n.q, n.r)) continue;
    if (hexDistance(n, a.pos) < hexDistance(ziel ?? s, a.pos)) ziel = n;
  }
  const d = hexDistance(s, a.pos);
  if (d > BOSS_FERN || (!ziel && d > 3)) {
    // Aufholen: das freie Feld 4 bis 6 Schritte vor dem Ritter, das auf seiner Seite liegt.
    const nah = hexesInRange(a.pos, 6)
      .filter((h) => hexDistance(h, a.pos) >= 4 && begehbar(gelaende(a.seed, h.q, h.r)) && !besetzt(h.q, h.r))
      .sort((x, y) => hexDistance(x, s) - hexDistance(y, s))[0];
    if (nah) {
      a.ereignisse.push({ art: 'gehen', takt, wer: s.id, von: { q: s.q, r: s.r }, nach: nah, blink: true });
      s.q = nah.q;
      s.r = nah.r;
      melde(a, `Der ${schleimName(s)} ist dir auf den Fersen!`);
      return;
    }
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
  // Hoechstens ein kleiner Schleim, und nur, wenn kaum welche um ihn sind (Spieltest: "Akt 3 ist ein Gewimmel").
  const umIhn = a.schleime.filter((x) => !x.boss && hexDistance(x, s) <= 4).length + neue.length;
  if (s.zaehler % 4 === 0 && umIhn < 2) {
    const plaetze = HEX_DIRS.map(([dq, dr]) => ({ q: s.q + dq, r: s.r + dr }))
      .filter((h) => begehbar(gelaende(a.seed, h.q, h.r)) && !besetzt(h.q, h.r) && !neue.some((x) => x.q === h.q && x.r === h.r))
      .slice(0, 1);
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
    melde(a, 'Der Gelee-Koloss blaeht sich auf - weg, mindestens drei Felder (oder Deckung mit G)!');
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
export type OrtArt = 'haendler' | 'werber' | 'altar' | 'ereignis';
/** Begegnungen in der Wildnis - je eine kleine Entscheidung (Spieltest: "Erkunden bringt nichts ausser Beute"). */
export type EreignisArt = 'schrein' | 'verletzter' | 'spieler' | 'quelle' | 'seherin' | 'alchemist';
export const EREIGNIS: Record<EreignisArt, { name: string; titel: string; optionen: string[] }> = {
  schrein: { name: 'Schrein', titel: 'Ein vergessener Schrein. Opfergaben liegen darauf.', optionen: ['ev_beten', 'ev_pluendern', 'ev_weiter'] },
  verletzter: { name: 'Verletzter', titel: 'Ein verletzter Wanderer bittet um Hilfe.', optionen: ['ev_helfen', 'ev_ausrauben', 'ev_weiter'] },
  spieler: { name: 'Gluecksspieler', titel: 'Ein Gluecksspieler klappert mit seinen Wuerfeln: "Eine Runde?"', optionen: ['ev_wetten', 'ev_hoch', 'ev_weiter'] },
  quelle: { name: 'Quelle', titel: 'Eine schimmernde Quelle. Das Wasser riecht seltsam.', optionen: ['ev_trinken', 'ev_fuellen', 'ev_weiter'] },
  alchemist: { name: 'Alchemist', titel: 'Ein Alchemist: "Bring mir drei Gelee - ich zahle gut."', optionen: ['ev_gelee', 'ev_weiter'] },
  seherin: { name: 'Seherin', titel: 'Eine Seherin: "Ich sehe, was vor dir liegt - fuer ein paar Muenzen."', optionen: ['ev_karte', 'ev_omen', 'ev_weiter'] },
};
export const EREIGNIS_ARTEN = Object.keys(EREIGNIS) as EreignisArt[];
export type Ort = { id: number; q: number; r: number; art: OrtArt; name: string; benutzt?: boolean; ereignis?: EreignisArt };
export type SoeldnerArt = 'zwerg' | 'soeldnerin' | 'waldlaeufer' | 'paladin' | BegleiterArt;
/** Beschworene Begleiter des Pentagrammmeisters (Stufe 3). */
export type BegleiterArt = 'fee' | 'golem' | 'daemon' | 'lichtgeist' | 'wolf';
export type Soeldner = { id: number; art: SoeldnerArt; name: string; q: number; r: number; leben: number; max: number; lv: number; ep: number; geredet?: number; beschworen?: boolean };
export type Fraktion = 'orden' | 'jaeger';
export type Wanderer = { id: number; fraktion: Fraktion; name: string; q: number; r: number; leben: number; max: number; ziel?: Hex; geredet?: number; vorgestellt?: boolean };

export const ORT_NAME: Record<OrtArt, string> = { haendler: 'Haendler', werber: 'Werber', altar: 'Altar', ereignis: 'Begegnung' };
export const FRAKTION_NAME: Record<Fraktion, string> = { orden: 'Orden der Waage', jaeger: 'Gruenwald-Jaeger' };
/** Wie die Fraktionen aussehen (Figuren des Kachelstils). */
export const FRAKTION_FIGUR: Record<Fraktion, string> = { orden: 'paladin', jaeger: 'waldlaeufer' };

export const SOELDNER: Record<SoeldnerArt, { name: string; leben: number; angriff: number; weite: number; preis: number; text: string; waffe: string }> = {
  zwerg: { name: 'Axtkaempfer', leben: 5, angriff: 1, weite: 1, preis: 6, text: 'Zaeh und treu - steht vorn, wenn es kracht.', waffe: 'axt' },
  soeldnerin: { name: 'Klingenmeisterin', leben: 4, angriff: 2, weite: 1, preis: 9, text: 'Schnell und scharf - trifft oft.', waffe: 'breitschwert' },
  waldlaeufer: { name: 'Bogenschuetze', leben: 3, angriff: 1, weite: 2, preis: 8, text: 'Trifft Gegner bis zwei Felder weit.', waffe: 'schwert' },
  paladin: { name: 'Heilerin', leben: 4, angriff: 0, weite: 1, preis: 10, text: 'Heilt dich alle vier Takte um ein halbes Herz.', waffe: 'schwert' },
  // Beschworen (Pentagrammmeister Stufe 3) - nicht zu kaufen.
  fee: { name: 'Funkenfee', leben: 3, angriff: 1, weite: 3, preis: 0, text: 'Schwebt, auch uebers Wasser, und schiesst Funken bis drei Felder weit.', waffe: '' },
  golem: { name: 'Runenwaechter', leben: 10, angriff: 1, weite: 1, preis: 0, text: 'Ein Steinkoloss: Gegner neben ihm schlagen auf ihn statt auf dich.', waffe: '' },
  daemon: { name: 'Flammendaemon', leben: 5, angriff: 2, weite: 1, preis: 0, text: 'Brennt: jeder Treffer macht 2 Schaden.', waffe: '' },
  lichtgeist: { name: 'Lichtgeist', leben: 4, angriff: 0, weite: 1, preis: 0, text: 'Heilt dich alle zwei Takte um ein halbes Herz.', waffe: '' },
  wolf: { name: 'Bannwolf', leben: 5, angriff: 1, weite: 1, preis: 0, text: 'Sein Biss bannt den Gegner drei Takte lang.', waffe: '' },
};

/** Welcher Zauber welchen Begleiter ruft. */
export const BEGLEITER_FUER: Record<Zauber, BegleiterArt> = {
  funkenregen: 'fee',
  schutzrune: 'golem',
  pentagramm: 'daemon',
  heilkreis: 'lichtgeist',
  bannkreis: 'wolf',
};
/** Stufe 3: so viele Gegner muessen auf Stufe 2 durch Pentagramme fallen. */
export const PENTA_STUFE3_NACH = 12;
/** Stufe 3: so viele Pentagramm-Kills laden die Beschwoerung. */
export const BESCHWOERUNG_VOLL = 8;
/** Der Zauber, den der Ritter am meisten gewirkt hat. */
export function meisterZauber(a: Pick<Abenteuer, 'zauberArten'>): Zauber {
  const z = a.zauberArten ?? {};
  return (Object.keys(BEGLEITER_FUER) as Zauber[]).reduce((best, k) => ((z[k] ?? 0) > (z[best] ?? 0) ? k : best), 'pentagramm' as Zauber);
}

/**
 * PENTAGRAMMMEISTER STUFE 3: die Beschwoerung. Ist der Balken voll (durch
 * Gegner, die in Pentagrammen fallen), ruft der Ritter einen Begleiter -
 * welchen, entscheidet der Zauber, den er am meisten gewirkt hat. Ein
 * Begleiter zur Zeit; ein neuer ersetzt den alten.
 */
export function beschwoeren(alt: Abenteuer): Abenteuer {
  if ((alt.pentaStufe ?? 1) < 3 || (alt.beschwoerung ?? 0) < BESCHWOERUNG_VOLL || alt.phase === 'tot') return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  const art = BEGLEITER_FUER[meisterZauber(a)];
  const alter = (a.gefolge ?? []).find((g) => g.beschworen);
  const frei = (h: Hex) =>
    (art === 'fee' ? gelaende(a.seed, h.q, h.r) !== null : begehbar(gelaende(a.seed, h.q, h.r))) &&
    !(h.q === a.pos.q && h.r === a.pos.r) &&
    !schleimAuf(a, h.q, h.r) &&
    !ortAuf(a, h.q, h.r) &&
    !wandererAuf(a, h.q, h.r) &&
    !(a.gefolge ?? []).some((g) => g !== alter && g.q === h.q && g.r === h.r) &&
    !(a.tiere ?? []).some((t) => t.q === h.q && t.r === h.r);
  const platz = (alter && frei(alter) ? alter : null) ?? HEX_DIRS.map(([dq, dr]) => ({ q: a.pos.q + dq, r: a.pos.r + dr })).find(frei);
  if (!platz) {
    melde(a, 'Kein Platz fuer die Beschwoerung.');
    return a;
  }
  const def = SOELDNER[art];
  const g: Soeldner = { id: a.naechsteId++, art, name: def.name, q: platz.q, r: platz.r, leben: def.leben, max: def.leben, lv: 1, ep: 0, beschworen: true };
  a.gefolge = [...(a.gefolge ?? []).filter((x) => !x.beschworen), g];
  a.beschwoerung = 0;
  a.ereignisse.push({ art: 'zauber', takt: 0, name: meisterZauber(a), felder: [platz, ...HEX_DIRS.map(([dq, dr]) => ({ q: platz.q + dq, r: platz.r + dr }))] });
  a.ereignisse.push({ art: 'neu', takt: 0, wer: g.id });
  sag(a, g, 0, SPRUCH[art]);
  melde(a, `Beschwoerung! ${alter ? 'Der alte Begleiter vergeht - ' : ''}ein ${def.name} erscheint an deiner Seite.`);
  return a;
}
/** So viele Soeldner folgen hoechstens. */
export const GEFOLGE_MAX = 1;
/** Namen - Maenner und Frauen getrennt, damit "Konrad, Klingenmeisterin" nicht vorkommt (Spieltest). */
const MAENNER = ['Bjarne', 'Odo', 'Wido', 'Gero', 'Konrad', 'Tassilo', 'Ansgar', 'Volker', 'Arnulf', 'Eckhart', 'Folkmar', 'Hartwig', 'Jost', 'Lambert', 'Notker', 'Poppo', 'Thankmar', 'Wolfram', 'Adalbert', 'Ekkehard'];
const FRAUEN = ['Hilda', 'Ragna', 'Frida', 'Ilka', 'Mechthild', 'Wiebke', 'Sigrun', 'Edda', 'Berta', 'Dietlind', 'Gisela', 'Irmgard', 'Kunigunde', 'Margit', 'Ortrun', 'Reinhild', 'Swanhild', 'Ulla', 'Waltraud', 'Brunhild', 'Gundula'];
const VORNAMEN = [...MAENNER, ...FRAUEN];
/** Welche Soeldner Frauen sind (Klingenmeisterin, Heilerin). */
const WEIBLICH: readonly SoeldnerArt[] = ['soeldnerin', 'paladin'];

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
  fee: ['Hihi! Funken!', 'Ich leuchte dir den Weg.', 'Bssst - da drueben!'],
  golem: ['... STEIN ... SCHUETZT ...', 'Rumms.', '... ICH ... HALTE ...'],
  daemon: ['Brennen soll es!', 'Mehr! Gib mir mehr Schleim!', 'Hehehe ... Feuer.'],
  lichtgeist: ['Ich bin bei dir.', 'Das Licht heilt.', 'Fuerchte dich nicht.'],
  wolf: ['Grrrr ...', 'Awuuuh!', '*schnueffelt*'],
  orden: ['Fuer die Waage!', 'Gruss dir, Wanderer.', 'Die Wege sind nicht sicher.', 'Hast du Banditen gesehen?'],
  jaeger: ['Psst - du verscheuchst das Wild.', 'Heute gibt es Hasenbraten!', 'Der Wald hat Augen.', 'Gute Jagd, Fremder.'],
} as const;

/** Was der Haendler fuer etwas zahlt - Ausruestung nach ihrem Wert, Beute fuer wenig. */
export function verkaufsPreis(id: string): number {
  const g = gegenstand(id);
  if (!g || g.legendaer || id === 'gold') return 0;
  if (g.slot) return Math.max(1, Math.round(ausruestungsWert(id) * 0.8));
  if (id === 'extraherz' || id === 'goldsack') return 0;
  // Spieltest 10: "Gold ist zu knapp" - Gelee bringt 2.
  return id === 'angel' ? 3 : id === 'holz' || id === 'gelee' ? 2 : id === 'goldfisch' ? 8 : 1;
}
/** Was der Haendler verkauft. */
export const HAENDLER_WAREN: readonly { id: string; preis: number }[] = [
  { id: 'kraut', preis: 3 },
  { id: 'angel', preis: 6 },
];

/**
 * Was ein Haendler anbietet: Kraut und Angel immer, dazu drei Stuecke aus
 * seinem eigenen Sortiment (fest je Haendler) - Ausruestung und Wuerfel,
 * je einmal. Spieltest: "jeder Haendler hat dieselben Waren, Gold haeuft sich".
 */
export function haendlerWaren(a: Abenteuer, o: Ort): { id: string; preis: number; weg?: boolean }[] {
  // Das Sortiment wechselt mit dem Akt; ab Akt 2 liegt auch ein Legendaeres aus - teuer.
  const akt = a.akt ?? 1;
  const rng = new Rng(hash3i(a.seed, o.q + akt * 101, o.r, SALT_LEUTE + 6));
  const pool = [...TRUHENINHALT].filter((id) => id !== 'angel');
  const sortiment: string[] = [];
  while (sortiment.length < 3 && pool.length) sortiment.push(pool.splice(rng.int(pool.length), 1)[0]!);
  const legenden = akt >= 2 ? legendaerPool(a).filter((x) => x !== 'herzcontainer') : [];
  if (legenden.length) sortiment.push(legenden[rng.int(legenden.length)]!);
  return [
    // Kraeuter werden je Akt teurer (Spieltest: "Heilung ist zu billig").
    ...HAENDLER_WAREN.map((w) => (w.id === 'kraut' ? { ...w, preis: w.preis + 2 * (akt - 1) } : w)),
    // Gekauftes bleibt als "verkauft" stehen - die Zeilen verrutschen nicht (Spieltest).
    ...sortiment.map((id) => ({
      id,
      preis: gegenstand(id)?.legendaer ? 40 + 10 * (akt - 2) : Math.max(6, ausruestungsWert(id) * 3),
      ...((a.gekauft ?? []).includes(`${o.id}:${akt}:${id}`) ? { weg: true } : {}),
    })),
  ];
}

/**
 * DER SCHMIED beim Haendler: Gold wird zu Staerke (Spieltest: "Gold haeuft
 * sich, nichts lohnt sich"). Schaerfen gibt +1 Angriff, Verstaerken +1
 * Abwehr - je hoechstens zweimal, jedes Mal teurer.
 */
export const SCHMIED_MAX = 2;
export const schmiedPreis = (a: Pick<Abenteuer, 'schmied'>, was: 'angriff' | 'abwehr'): number =>
  was === 'angriff' ? 12 + 10 * (a.schmied?.angriff ?? 0) : 10 + 10 * (a.schmied?.abwehr ?? 0);
export function schmieden(alt: Abenteuer, was: 'angriff' | 'abwehr'): Abenteuer {
  const preis = schmiedPreis(alt, was);
  if (!offenerLaden(alt, 'haendler') || (alt.schmied?.[was] ?? 0) >= SCHMIED_MAX || (alt.inventar['gold'] ?? 0) < preis) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [{ art: 'wuerfelEffekt', takt: 0, text: was === 'angriff' ? '+1 Angriff' : '+1 Abwehr' }];
  a.schmied = { angriff: a.schmied?.angriff ?? 0, abwehr: a.schmied?.abwehr ?? 0, [was]: (a.schmied?.[was] ?? 0) + 1 };
  a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) - preis };
  if (!a.inventar['gold']) delete a.inventar['gold'];
  melde(a, was === 'angriff' ? `Der Schmied schaerft deine Waffe: +1 Angriff (${preis} Gold).` : `Der Schmied verstaerkt deine Ruestung: +1 Abwehr (${preis} Gold).`);
  return a;
}

/** Die drei Angebote eines Werbers - fest aus Seed und Ort. */
export function werberAngebot(a: Pick<Abenteuer, 'seed' | 'gefolge'>, o: Ort): { art: SoeldnerArt; name: string; preis: number }[] {
  // Nur echte Soeldner - Beschworene gibt es nicht zu kaufen (Spieltest: sie standen fuer 0 Gold im Angebot).
  const arten: SoeldnerArt[] = ['zwerg', 'soeldnerin', 'waldlaeufer', 'paladin'];
  // Jeder weitere Soeldner kostet mehr.
  const aufschlag = 5 * angeheuerte(a);
  // Drei verschiedene Namen: ein Startname, dann je sieben weiter.
  const n0 = hash3i(a.seed, o.q, o.r, SALT_LEUTE + 4);
  return [0, 1, 2].map((i) => {
    // Drei verschiedene Rollen (Spieltest: "zwei gleiche Heilerinnen im Angebot").
    const h0 = hash3i(a.seed, o.q, o.r, SALT_LEUTE + 3);
    const art = arten[(h0 + i) % arten.length]!;
    // Passend zum Geschlecht, und nie der Name des Werbers selbst.
    const liste = (WEIBLICH.includes(art) ? FRAUEN : MAENNER).filter((n) => n !== o.name);
    return { art, name: liste[(n0 + i * 7) % liste.length]!, preis: SOELDNER[art].preis + aufschlag };
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
  a.orte ??= [];
  for (const [art, weit] of [['haendler', 3], ['werber', 4], ['ereignis', 6]] as const) {
    const ring = hexesInRange(a.pos, weit).filter((h) => hexDistance(h, a.pos) === weit && ortFrei(a, h));
    const h = ring[hash3i(a.seed, weit, 0, SALT_LEUTE) % Math.max(1, ring.length)];
    if (h) a.orte!.push(neuerOrt(a, h, art));
  }
}

/** Beim Erkunden: ab und zu ein weiterer Haendler oder Werber. */
function ortEntdecken(a: Abenteuer, h: Hex): void {
  const z = hash3i(a.seed, h.q, h.r, SALT_LEUTE + 2) % 260;
  const ereignis = z === 30 || z === 100 || z === 180 || z === 240;
  if (z !== 7 && z !== 77 && z !== 150 && !ereignis) return;
  if (!ortFrei(a, h) || hexDistance(h, a.pos) < 2) return;
  const art: OrtArt = ereignis ? 'ereignis' : z === 7 ? 'haendler' : z === 77 ? 'werber' : 'altar';
  // Spieltest: "Haendler auf jedem Bildschirm" - Laeden sind rar.
  if ((art === 'haendler' || art === 'werber') && (a.orte ?? []).some((o) => o.art === art && hexDistance(o, h) < 20)) return;
  a.orte = [...(a.orte ?? []), neuerOrt(a, h, art)];
}

function neuerOrt(a: Abenteuer, h: Hex, art: OrtArt): Ort {
  // Jeder Name nur einmal (Spieltest 12: "Notker war Haendler, Ritter und Werber").
  const vergeben = new Set([...(a.orte ?? []).map((x) => x.name), ...(a.wanderer ?? []).map((x) => x.name), ...(a.gefolge ?? []).map((x) => x.name)]);
  const start = hash3i(a.seed, h.q, h.r, SALT_LEUTE + 1) % MAENNER.length;
  let name = MAENNER[start]!;
  for (let i = 0; i < MAENNER.length && vergeben.has(name); i++) name = MAENNER[(start + i) % MAENNER.length]!;
  const o: Ort = { id: a.naechsteId++, q: h.q, r: h.r, art, name };
  if (art === 'ereignis') o.ereignis = EREIGNIS_ARTEN[hash3i(a.seed, h.q, h.r, SALT_LEUTE + 3) % EREIGNIS_ARTEN.length]!;
  return o;
}

/** Waechter rufen: n Gegner um den Ritter, der erste eine Elite (Altar, Schrein). */
function waechterRufen(a: Abenteuer, n0: number): void {
  // Stehen schon Gegner nah, kommen weniger Waechter (Spieltest 7: "Waechter stapeln sich auf den Schwarm").
  const n = Math.max(1, n0 - a.schleime.filter((x) => hexDistance(x, a.pos) <= 3).length);
  const rng = new Rng(a.rng);
  const plaetze = hexesInRange(a.pos, 3).filter(
    (h) => hexDistance(h, a.pos) >= 2 && begehbar(gelaende(a.seed, h.q, h.r)) && !schleimAuf(a, h.q, h.r) && !ortAuf(a, h.q, h.r),
  );
  for (let i = 0; i < n && plaetze.length; i++) {
    const h = plaetze.splice(rng.int(plaetze.length), 1)[0]!;
    const id = a.naechsteId++;
    const s = staerken(a, neuerSchleim(id, h.q, h.r, artZahl(a, rng), false), rng);
    if (i === 0 && !s.elite) {
      s.elite = true;
      s.leben += 2;
      s.max = s.leben;
    }
    a.schleime.push(s);
    a.ereignisse.push({ art: 'neu', takt: 0, wer: id });
  }
  a.rng = rng.getState();
}

/** Kann man diese Moeglichkeit einer Begegnung bezahlen? */
export function ereignisMoeglich(a: Abenteuer, id: string): boolean {
  const gold = a.inventar['gold'] ?? 0;
  if (id === 'ev_wetten') return gold >= 5;
  if (id === 'ev_karte') return gold >= 3;
  if (id === 'ev_omen') return gold >= 8;
  if (id === 'ev_gelee') return (a.inventar['gelee'] ?? 0) >= 3;
  return true;
}

/** Eine Begegnung waehlen - danach ist sie vorbei. */
function ereignisWaehlen(a: Abenteuer, id: string, ortId: number | undefined): void {
  // Weitergehen laesst die Begegnung stehen - man kann wiederkommen (Spieltest 11: Seherin ohne Gold).
  if (ortId !== undefined && id !== 'ev_weiter') a.orte = (a.orte ?? []).map((x) => (x.id === ortId ? { ...x, benutzt: true } : x));
  const gold = a.inventar['gold'] ?? 0;
  const zahle = (n: number) => {
    a.inventar = { ...a.inventar, gold: gold - n };
    if (!a.inventar['gold']) delete a.inventar['gold'];
  };
  const rng = new Rng(a.rng);
  const glueck = rng.int(100);
  a.rng = rng.getState();
  if (id === 'ev_weiter') return void melde(a, 'Du ziehst weiter - die Begegnung bleibt, du kannst wiederkommen.');
  if (id === 'ev_beten') {
    a.leben = maxLebenVon(a);
    a.ereignisse.push({ art: 'heil', takt: 0, leben: 1 });
    return void melde(a, 'Du betest am Schrein - deine Wunden schliessen sich. Volles Leben.');
  }
  if (id === 'ev_pluendern') {
    const n = goldDazu(a, 15);
    waechterRufen(a, 2);
    return void melde(a, `Du nimmst die Gaben (+${n} Gold) - die Waechter des Schreins erwachen!`);
  }
  if (id === 'ev_helfen') {
    a.leben = Math.max(0.5, a.leben - 1);
    melde(a, 'Du verbindest seine Wunden (-1 Leben). "Nimm, was du brauchst!"');
    return void bietWahl(a, 'truhe');
  }
  if (id === 'ev_ausrauben') {
    const n = goldDazu(a, 8);
    return void melde(a, `Du nimmst ihm den Beutel ab: +${n} Gold. Er flucht dir hinterher.`);
  }
  if (id === 'ev_wetten') {
    if (gold < 5) return void melde(a, 'Der Spieler lacht: "Ohne Gold keine Wette."');
    zahle(5);
    if (glueck < 50) return void melde(a, `Gewonnen! +${goldDazu(a, 12)} Gold.`);
    return void melde(a, 'Verloren - die 5 Gold sind weg.');
  }
  if (id === 'ev_hoch') {
    if (glueck < 35) {
      melde(a, 'Die Wuerfel fallen fuer dich! Waehle ein Legendaeres.');
      return void bietWahl(a, 'schatz');
    }
    a.leben = Math.max(0.5, a.leben - 1);
    a.ereignisse.push({ art: 'fluch', takt: 0 });
    return void melde(a, 'Verloren - der Spieler nimmt dein Herzblut (-1 Leben).');
  }
  if (id === 'ev_trinken') {
    if (glueck < 45) {
      a.leben = maxLebenVon(a);
      a.ereignisse.push({ art: 'heil', takt: 0, leben: 1 });
      return void melde(a, 'Das Wasser heilt dich ganz.');
    }
    if (glueck < 75) {
      const { voll } = ladungVon(a);
      if (voll > 0) a.ladung = voll;
      a.leben = Math.min(maxLebenVon(a), a.leben + 1);
      return void melde(a, 'Kraft durchstroemt dich: volle Ladung und +1 Leben!');
    }
    a.leben = Math.max(0.5, a.leben - 1);
    a.ereignisse.push({ art: 'fluch', takt: 0 });
    return void melde(a, 'Gift! Dir wird uebel (-1 Leben).');
  }
  if (id === 'ev_fuellen') {
    a.inventar = { ...a.inventar, kraut: (a.inventar['kraut'] ?? 0) + 2 };
    return void melde(a, 'Du fuellst eine Flasche: +2 Kraeuter.');
  }
  if (id === 'ev_gelee') {
    const rest = (a.inventar['gelee'] ?? 0) - 3;
    a.inventar = { ...a.inventar, gelee: rest };
    if (rest <= 0) delete a.inventar['gelee'];
    const n = goldDazu(a, 10);
    melde(a, `Der Alchemist braut - und zahlt: +${n} Gold und eine Truhe!`);
    return void bietWahl(a, 'truhe');
  }
  if (id === 'ev_karte') {
    if (gold < 3) return void melde(a, 'Die Seherin schweigt - ohne Muenzen sieht sie nichts.');
    zahle(3);
    const neu = new Set(a.erkundet);
    for (const h of hexesInRange(a.pos, 10)) neu.add(hexKey(h.q, h.r));
    a.erkundet = [...neu];
    return void melde(a, 'Die Seherin zeigt dir die Gegend bis 10 Felder weit.');
  }
  if (id === 'ev_omen') {
    if (gold < 8) return void melde(a, 'Die Seherin schweigt - die Zukunft kostet 8 Gold.');
    zahle(8);
    a.leben = Math.min(maxLebenVon(a), a.leben + 2);
    const { voll } = ladungVon(a);
    if (voll > 0) a.ladung = voll;
    return void melde(a, 'Die Seherin fluestert dir den naechsten Kampf zu: volle Ladung und +2 Leben.');
  }
}

export const ortAuf = (a: Abenteuer, q: number, r: number): Ort | undefined => (a.orte ?? []).find((o) => o.q === q && o.r === r);
const soeldnerAuf = (a: Abenteuer, q: number, r: number) => (a.gefolge ?? []).find((g) => g.q === q && g.r === r);
const wandererAuf = (a: Abenteuer, q: number, r: number) => (a.wanderer ?? []).find((w) => w.q === q && w.r === r);

/** Mit einem Haendler oder Werber reden - er muss nah sein. Oeffnet den Laden. */
export function ansprechen(alt: Abenteuer, ortId: number): Abenteuer {
  const o = (alt.orte ?? []).find((x) => x.id === ortId);
  if (!o || hexDistance(o, alt.pos) > 1 || alt.phase === 'tot') return alt;
  // Spieltest 14: "Im Kampf oeffnet sich staendig der Laden" - nicht, solange Gegner nah sind.
  // Nur ein Gegner direkt daneben haelt vom Handel ab (Spieltest 16: "der Radius ist zu gross").
  if ((o.art === 'haendler' || o.art === 'werber') && alt.schleime.some((x) => hexDistance(x, alt.pos) <= 1)) {
    const text = `${o.name} winkt ab: "Erst den Kampf, dann das Geschaeft!"`;
    return alt.log[alt.log.length - 1] === text ? alt : { ...alt, ereignisse: [], log: [...alt.log, text].slice(-30) };
  }
  const a = structuredClone(alt);
  a.ereignisse = [{ art: 'treffen', takt: 0, ort: o.id }];
  if (o.art === 'ereignis') {
    if (o.benutzt || !o.ereignis) return alt;
    const e = EREIGNIS[o.ereignis];
    a.wahl = { art: 'ereignis', titel: e.titel, optionen: e.optionen, ort: o.id };
    a.ereignisse.push({ art: 'wahl', takt: 0 });
    return a;
  }
  a.laden = o.id;
  melde(
    a,
    o.art === 'haendler'
      ? `${o.name}, der Haendler: "Zeig her, was du hast!"`
      : o.art === 'werber'
        ? `${o.name}, der Werber: "Suchst du Klingen? Ich kenne die besten."`
        : o.benutzt
          ? 'Der Altar ist erloschen.'
          : 'Ein alter Altar. Er verlangt ein Opfer - und gibt dafuer.',
  );
  return a;
}

/**
 * ALTAERE - Risiko gegen Belohnung (Spieltest: "keine Entscheidungen, nichts
 * steht auf dem Spiel"). Einmal je Altar:
 *   blut   ein Herz fuer immer opfern - dafuer ein Legendaeres waehlen
 *   gold   12 Gold opfern - dafuer eine Truhe (1 aus 3)
 *   ruf    volles Leben - aber drei Gegner (eine Elite) erscheinen um dich
 */
export type AltarOpfer = 'blut' | 'gold' | 'ruf';
export const ALTAR_OPFER: Record<AltarOpfer, { name: string; text: string }> = {
  blut: { name: 'Blutopfer', text: 'Ein Herz fuer immer opfern - dafuer ein Legendaeres waehlen (1 aus 3).' },
  gold: { name: 'Goldopfer', text: '12 Gold opfern - dafuer eine Truhe (1 aus 3).' },
  ruf: { name: 'Herausforderung', text: 'Volles Leben - aber drei Gegner (einer davon Elite) erscheinen um dich.' },
};
/** Geht dieses Opfer gerade? */
export function altarMoeglich(a: Abenteuer, opfer: AltarOpfer): boolean {
  if (opfer === 'blut') return maxLebenVon(a) > 3;
  if (opfer === 'gold') return (a.inventar['gold'] ?? 0) >= 12;
  return true;
}
export function opfern(alt: Abenteuer, opfer: AltarOpfer): Abenteuer {
  const o = (alt.orte ?? []).find((x) => x.id === alt.laden);
  if (!o || o.art !== 'altar' || o.benutzt || hexDistance(o, alt.pos) > 1 || !altarMoeglich(alt, opfer)) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  a.orte = (a.orte ?? []).map((x) => (x.id === o.id ? { ...x, benutzt: true } : x));
  a.laden = null;
  if (opfer === 'blut') {
    a.extraHerzen = (a.extraHerzen ?? 0) - 1;
    a.leben = Math.min(a.leben, maxLebenVon(a));
    a.ereignisse.push({ art: 'fluch', takt: 0 });
    melde(a, 'Der Altar trinkt dein Blut - ein Herz weniger. Er gibt dir die Wahl.');
    bietWahl(a, 'schatz');
  } else if (opfer === 'gold') {
    a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) - 12 };
    if (!a.inventar['gold']) delete a.inventar['gold'];
    melde(a, 'Das Gold verschwindet im Altar - eine Truhe erscheint.');
    bietWahl(a, 'truhe');
  } else {
    a.leben = maxLebenVon(a);
    a.ereignisse.push({ art: 'heil', takt: 0, leben: 1 });
    const rng = new Rng(a.rng);
    const plaetze = hexesInRange(a.pos, 3).filter(
      (h) => hexDistance(h, a.pos) >= 2 && begehbar(gelaende(a.seed, h.q, h.r)) && !schleimAuf(a, h.q, h.r) && !ortAuf(a, h.q, h.r),
    );
    for (let i = 0; i < 3 && plaetze.length; i++) {
      const h = plaetze.splice(rng.int(plaetze.length), 1)[0]!;
      const id = a.naechsteId++;
      const s = staerken(a, neuerSchleim(id, h.q, h.r, artZahl(a, rng), false), rng);
      if (i === 0 && !s.elite) {
        s.elite = true;
        s.leben += 2;
        s.max = s.leben;
      }
      a.schleime.push(s);
      a.ereignisse.push({ art: 'neu', takt: 0, wer: id });
    }
    a.rng = rng.getState();
    melde(a, 'Der Altar heilt dich ganz - und ruft Gegner herbei! Kaempfe!');
  }
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
  const o = offenerLaden(alt, 'haendler');
  const ware = o ? haendlerWaren(alt, o).find((w) => w.id === id && !w.weg) : undefined;
  if (!o || !ware || (alt.inventar['gold'] ?? 0) < ware.preis) return alt;
  const a = structuredClone(alt);
  a.ereignisse = [];
  if (!HAENDLER_WAREN.some((w) => w.id === id)) a.gekauft = [...(a.gekauft ?? []), `${o.id}:${a.akt ?? 1}:${id}`];
  a.inventar = { ...a.inventar, gold: (a.inventar['gold'] ?? 0) - ware.preis };
  if (a.inventar['gold'] === 0) delete a.inventar['gold'];
  if (gegenstand(id)?.legendaer) legendaerAnwenden(a, id, 0);
  else if (gegenstand(id)?.slot) gibGegenstand(a, id, `Gekauft fuer ${ware.preis} Gold`);
  else a.inventar = { ...a.inventar, [id]: (a.inventar[id] ?? 0) + 1 };
  if (!gegenstand(id)?.slot) melde(a, `Gekauft: ${gegenstand(id)!.name} fuer ${ware.preis} Gold.`);
  return a;
}

/** Einen Soeldner beim Werber anheuern (nr: 0 bis 2 seines Angebots). */
export function anheuern(alt: Abenteuer, nr: number): Abenteuer {
  const o = offenerLaden(alt, 'werber');
  if (!o) return alt;
  const angebot = werberAngebot(alt, o)[nr];
  const schluessel = `${o.id}:${nr}`;
  if (!angebot || (alt.angeheuert ?? []).includes(schluessel) || angeheuerte(alt) >= GEFOLGE_MAX || (alt.inventar['gold'] ?? 0) < angebot.preis) return alt;
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

/** Wie viele Soeldner angeheuert sind (Beschworene zaehlen nicht). */
export const angeheuerte = (a: Pick<Abenteuer, 'gefolge'>): number => (a.gefolge ?? []).filter((g) => !g.beschworen).length;

/** Soeldner: Angriff mit Level. */
const soeldnerAngriff = (g: Soeldner) => SOELDNER[g.art].angriff + Math.floor((g.lv - 1) / 2);
/** Erfahrung bis zum naechsten Level eines Soeldners. */
export const soeldnerEp = (lv: number) => 3 + lv * 2;
export const SOELDNER_MAX_LV = 4;

function soeldnerLernt(a: Abenteuer, g: Soeldner, ep: number, takt: number): void {
  g.ep += ep;
  // Spieltest 7: "Das Gefolge traegt alles" - hoechstens Level SOELDNER_MAX_LV.
  if (g.lv >= SOELDNER_MAX_LV) {
    g.ep = 0;
    return;
  }
  if (g.ep < soeldnerEp(g.lv)) return;
  g.ep -= soeldnerEp(g.lv);
  g.lv += 1;
  g.max += 1;
  g.leben = g.max;
  sag(a, g, takt, SPRUCH.stufe);
  melde(a, `${g.name} steigt auf Level ${g.lv}!`);
}

/** Ein Schlag eines Soeldners oder Wanderers auf einen Gegner. */
function helferSchlaegt(a: Abenteuer, wer: { id: number; name: string }, s: Schleim, angriff: number, rng: Rng, takt: number, fremd: boolean, wucht = 1): boolean {
  const wurf = 1 + rng.int(6);
  // Gegen Bosse muessen Helfer hoeher wuerfeln (Spieltest 8: "das Gefolge macht den halben Bossschaden").
  const noetig = (s.art === 'panzer' ? 5 : 4) + (s.boss ? 2 : 0);
  let schaden = wurf + angriff >= noetig ? (s.boss ? 1 : wucht) : 0;
  // Den letzten Schlag auf einen Boss ueberlassen Helfer dem Ritter (Spieltest).
  if (s.boss && schaden >= s.leben) schaden = Math.max(0, s.leben - 1);
  a.ereignisse.push({ art: 'hieb', takt, wer: wer.id, ziel: s.id, wurf, schaden });
  if (!schaden) return false;
  const vorher = a.schleime.length;
  // Fremde Ritter mit Titel - man sieht, wer fuer wen kaempft (Spieltest 13).
  const fremdW = fremd ? (a.wanderer ?? []).find((w) => w.id === wer.id) : undefined;
  verwunde(a, s, schaden, takt, fremdW ? `${fremdW.fraktion === 'orden' ? 'Ordensritter' : 'Jaeger'} ${wer.name}` : wer.name, fremd);
  return a.schleime.length < vorher && !a.schleime.some((x) => x.id === s.id);
}

/** Ein Tick des Gefolges: heilen, zuschlagen, sonst dem Ritter folgen. */
function gefolgeHandelt(a: Abenteuer, takt: number, rng: Rng, besetzt: (q: number, r: number) => boolean): void {
  for (const g of a.gefolge ?? []) {
    const def = SOELDNER[g.art];
    // Heilerin alle vier Takte, Lichtgeist alle zwei: ein halbes Herz, wenn der Ritter nah und verwundet ist.
    const heiltJetzt = (g.art === 'paladin' && a.zeit % 4 === 0) || (g.art === 'lichtgeist' && a.zeit % 2 === 0);
    if (heiltJetzt && a.leben < maxLebenVon(a) && hexDistance(g, a.pos) <= 2) {
      const plus = Math.min(0.5, maxLebenVon(a) - a.leben);
      a.leben += plus;
      a.ereignisse.push({ art: 'heil', takt, leben: plus });
      if (rng.int(3) === 0) sag(a, g, takt, g.art === 'lichtgeist' ? SPRUCH.lichtgeist : SPRUCH.heilen);
      soeldnerLernt(a, g, 1, takt);
      continue;
    }
    // Den schwaechsten Gegner in Reichweite.
    const ziel = a.schleime
      .filter((s) => hexDistance(s, g) <= def.weite && (s.gebannt ?? 0) <= a.zeit)
      .sort((x, y) => x.leben - y.leben || hexDistance(x, g) - hexDistance(y, g))[0];
    if (ziel && (def.angriff > 0 || hexDistance(ziel, g) === 1)) {
      const tot = helferSchlaegt(a, g, ziel, soeldnerAngriff(g), rng, takt, false, g.art === 'daemon' ? 2 : 1);
      // Der Bannwolf bannt, wen er beisst.
      if (!tot && g.art === 'wolf' && a.ereignisse.some((e) => e.art === 'hieb' && e.wer === g.id && e.ziel === ziel.id && e.schaden > 0)) {
        ziel.gebannt = Math.max(ziel.gebannt ?? 0, a.zeit + 3);
        ziel.angriff = null;
        ziel.flaeche = null;
      }
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
        const b = gelaende(a.seed, n.q, n.r);
        if (!(g.art === 'fee' ? b !== null : begehbar(b)) || besetzt(n.q, n.r)) continue;
        if (hexDistance(n, a.pos) < hexDistance(nach ?? g, a.pos)) nach = n;
      }
    }
    if (nach) {
      a.ereignisse.push({ art: 'gehen', takt, wer: g.id, von: { q: g.q, r: g.r }, nach, ...(blink ? { blink: true } : {}), ...(g.art === 'wolf' && !blink ? { sprung: true } : {}) });
      g.q = nach.q;
      g.r = nach.r;
    }
    // Ab und zu ein Wort - jeder auf seine Art.
    if ((g.geredet ?? -99) < a.zeit - 20 && hash3i(a.seed, a.zeit, g.id, SALT_LEUTE + 5) % 14 === 0) {
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
  const golem = (a.gefolge ?? []).find((g) => g.art === 'golem' && hexDistance(g, s) === 1);
  if (golem) return { q: golem.q, r: golem.r };
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
  // Spieltest 15: "fuenf, sechs fremde Ritter im Bosskampf" - hoechstens drei, und keine neuen, solange ein Boss wach ist.
  if (a.zeit % FRAKTION_ALLE === 0 && !a.schleime.some((s) => s.boss) && a.wanderer.length + a.schleime.filter((s) => s.art === 'bandit').length < 3) {
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
          const vergeben = new Set([...(a.orte ?? []).map((x) => x.name), ...a.wanderer.map((x) => x.name), ...(a.gefolge ?? []).map((x) => x.name)]);
          let name = VORNAMEN[(id * 5 + a.zeit) % VORNAMEN.length]!;
          for (let i = 1; i < VORNAMEN.length && vergeben.has(name); i++) name = VORNAMEN[(id * 5 + a.zeit + i) % VORNAMEN.length]!;
          a.wanderer.push({ id, fraktion, name, q: h.q, r: h.r, leben, max: leben, ziel: { q: a.pos.q - dq * weit, r: a.pos.r - dr * weit } });
        }
        a.ereignisse.push({ art: 'neu', takt, wer: id });
      }
      break;
    }
  }
  for (const w of a.wanderer) {
    // Der Orden jagt Banditen und wehrt sich gegen Schleime, die ihn angreifen;
    // die Jaeger jagen nur Hasen (Spieltest: "die Jaeger stehlen mir die Kills").
    const greiftAn = (s: Schleim) => s.angriff?.q === w.q && s.angriff?.r === w.r;
    const feind = a.schleime
      .filter((s) => !s.boss && hexDistance(s, w) <= 1 && (w.fraktion === 'orden' ? s.art === 'bandit' || greiftAn(s) : greiftAn(s)))
      .sort((x, y) => (y.art === 'bandit' ? 1 : 0) - (x.art === 'bandit' ? 1 : 0) || x.leben - y.leben)[0];
    if (feind) {
      // Spieltest 13: "Wer ist Ragna?" - beim ersten Kampf in deiner Naehe stellt er sich vor.
      if (!w.vorgestellt && hexDistance(w, a.pos) <= 5) {
        w.vorgestellt = true;
        melde(a, `${w.name} vom ${FRAKTION_NAME[w.fraktion]} kaempft in der Naehe - ein fremder Ritter, nicht dein Gefolge.`);
      }
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
    // Der Endboss rast ab halbem Leben: er handelt in jedem Tick.
    // Spieltest: "Jeder Boss ist derselbe Tanz" - jeder Aktboss rast ab halbem Leben (zweite Phase).
    const rast = s.boss && s.bossArt !== 'penta' && s.leben <= (s.max ?? 0) / 2;
    if (rast && !s.rast) {
      s.rast = true;
      a.ereignisse.push({ art: 'boss', takt, wer: s.id, name: `${BOSS_NAME[s.bossArt ?? 'koenig']} rast` });
      melde(a, `Der ${schleimName(s)} rast - er handelt jetzt in jedem Takt!`);
    }
    if ((s.gross || s.art === 'panzer') && a.zeit % 2 === 1 && !rast) continue;
    if (s.boss) {
      // Spieltest 10: "Der rasende Koloss blaeht sich auf - und trifft, bevor ich weg bin."
      // Eine Ansage loest fruehestens zwei Takte spaeter aus, auch wenn der Boss rast.
      // Der grosse Ring des Koloss gibt drei Takte (Spieltest 14: "mit zwei Schritten nicht zu schaffen").
      const frist = s.flaeche && s.flaeche.length >= 10 ? 3 : 2;
      if ((s.angriff || s.flaeche) && s.angesagt != null && a.zeit - s.angesagt < frist) continue;
      koenigHandelt(a, s, takt, rng, besetzt, neue);
      s.angesagt = s.angriff || s.flaeche ? (s.angesagt ?? a.zeit) : null;
      continue;
    }
    schleimHandelt(a, s, takt, rng, besetzt);
  }
  a.schleime.push(...neue);
  // Nachschub: je spaeter der Akt (und je hoeher die Heldenstufe), desto oefter und zaeher.
  // Waehrend ein Boss des Akts lebt, kommt kein Nachschub - der Kampf bleibt lesbar.
  if (a.zeit > NACHSCHUB_RUHE && a.zug - (a.aktStart ?? 1) >= 3 && a.zeit % nachschubTakt(a) === 0 && !a.schleime.some((x) => x.boss && x.bossArt !== 'penta')) {
    for (let versuch = 0; versuch < 12; versuch++) {
      const dir = HEX_DIRS[rng.int(6)]!;
      const weit = 5 + rng.int(3);
      const q = a.pos.q + dir[0] * weit + (rng.int(3) - 1);
      const r = a.pos.r + dir[1] * weit + (rng.int(3) - 1);
      if (!begehbar(gelaende(a.seed, q, r)) || besetzt(q, r)) continue;
      const id = a.naechsteId++;
      // Jeder Akt hat sein Gesicht (Spieltest: "drei Akte nur Schleime"): in Akt 2 rauben Banditen, in Akt 3 spuken Geister.
      const akt = a.akt ?? 1;
      const neu =
        akt === 2 && rng.int(3) === 0
          ? { id, q, r, leben: 3, gross: false, art: 'bandit' as const }
          : akt === 3 && rng.int(3) === 0
            ? { id, q, r, leben: 2, gross: false, art: 'geist' as const }
            : neuerSchleim(id, q, r, artZahl(a, rng), true);
      a.schleime.push(staerken(a, neu, rng));
      a.ereignisse.push({ art: 'neu', takt, wer: id });
      break;
    }
  }
  // Ein faelliger Boss, der noch nicht kam (kein Platz?), erwacht jetzt.
  bossPruefen(a, takt);
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
      // Spieltest: "Das Extra-Leben nimmt jede Gefahr" - man steht mit halbem Leben auf.
      a.leben = Math.max(1, Math.ceil(maxLebenVon(a) / 2));
      a.ereignisse.push({ art: 'wiederbelebt', takt });
      melde(a, `${KLASSEN[a.klasse ?? 'ritter'].name}: du faellst - und stehst wieder auf, mit halbem Leben! Das Extra-Leben ist verbraucht.`);
      return;
    }
    a.leben = 0;
    a.phase = 'tot';
    melde(a, `${KLASSEN[a.klasse ?? 'ritter'].name}: du faellst. Das Abenteuer ist zu Ende.`);
  }
}

/** Alte Spielstaende (vor der Spieluhr) auf den heutigen Stand bringen. */
export function normalisiere(a: Abenteuer): Abenteuer {
  a.zeit ??= 0;
  a.ereignisse ??= [];
  a.geruht ??= false;
  a.spuren ??= {};
  // Spielstaende von vor den Akten.
  a.akt ??= 1;
  a.aktKills ??= 0;
  // Spielstaende von vor dem Wuerfel-Platz.
  if (a.ausruestung.wuerfel === undefined) a.ausruestung.wuerfel = null;
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
/** So nah muss ein Gegner sein, damit Essen einen Schritt kostet. */
export const HEIL_KAMPF = 3;
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
    // Spieltest: "Heilen ist gratis und unbegrenzt" - im Kampf (Gegner bis 3 Felder) kostet Essen einen Schritt, und die Gegner ziehen.
    const imKampf = a.schleime.some((s) => hexDistance(s, a.pos) <= HEIL_KAMPF);
    if (imKampf && a.phase !== 'ziehen') {
      a.ereignisse = [];
      melde(a, 'Gegner sind nah - essen kannst du erst nach dem Wuerfeln (es kostet einen Schritt).');
      return a;
    }
    const plus = Math.min(g.heilt, maxLebenVon(a) - a.leben);
    a.leben += plus;
    weg();
    a.ereignisse = [{ art: 'heil', takt: 0, leben: plus }];
    melde(a, `${g.name}: +${lebenText(plus)} Leben${imKampf ? ' - das kostet einen Schritt (die Gegner warten)' : ''}.`);
    if (imKampf) {
      // Spieltest 15: "Essen schenkt den Gegnern einen Hieb - unterm Strich null." Es kostet nur noch den Schritt.
      a.schritte = Math.max(0, a.schritte - 1);
      a.fokus = 0;
      return nachDemSchritt(a);
    }
    return a;
  }
  if (g.slot) {
    const vorher = a.ausruestung[g.slot];
    weg();
    if (vorher) a.inventar = { ...a.inventar, [vorher]: (a.inventar[vorher] ?? 0) + 1 };
    a.ausruestung = { ...a.ausruestung, [g.slot]: id };
    if (g.slot === 'waffe') {
      if ((a.ladung ?? 0) > 0 || a.bereit) melde(a, 'Waffe gewechselt - die Ladung der alten Waffe ist verloren.');
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
    a.pentaStufe = ((a.pentaStufe ?? 1) % 3) + 1;
    if (a.pentaStufe === 3) a.beschwoerung = BESCHWOERUNG_VOLL;
    melde(a, `Debug: Pentagrammmeister Stufe ${a.pentaStufe}${a.pentaStufe === 3 ? ' - Beschwoerung voll' : ''}.`);
  } else if (d.t === 'boss') {
    if (a.schleime.some((s) => s.boss)) return alt;
    if (d.art === 'penta') {
      bossErwacht(a, 0, 'penta');
      return a;
    }
    bossErwacht(a, 0, d.art);
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

// --- Ende eines Abenteuers: Punkte und Ruhm --------------------------------

/**
 * Was ein Abenteuer wert ist - fuer den Endbildschirm, die Bestenliste und
 * den Ruhm, mit dem man im Lager Neues freischaltet. Ein Sieg zaehlt viel,
 * ein schneller Sieg mehr; die Heldenstufe vervielfacht.
 */
export function abenteuerPunkte(a: Abenteuer): number {
  const roh =
    a.erschlagen * 10 +
    (a.koenige ?? 0) * 150 +
    ((a.akt ?? 1) - 1) * 100 +
    (a.stufe?.lv ?? 0) * 15 +
    (a.inventar['gold'] ?? 0) +
    (a.eile ?? 0) * EILE_PUNKTE +
    (a.phase === 'sieg' ? 1000 + Math.max(0, 400 - a.zug * 4) : 0);
  return Math.round(roh * (1 + 0.3 * (a.heldenstufe ?? 0)) * (a.omen ? OMEN[a.omen].punkte : 1));
}
/** Ruhm fuer das Lager: 10 fuer jedes Abenteuer und ein Zwoelftel der Punkte (Spieltest: "Ruhm kommt zu langsam"). */
// Spieltest 7: "Ein Sieg kauft das halbe Lager" - ein Zwanzigstel der Punkte.
// Spieltest 9: "Frueher Tod bringt fast nichts" - Niederlagen zaehlen ein Zehntel, Siege ein Zwanzigstel.
export const ruhmFuer = (a: Abenteuer): number => 10 + Math.floor(abenteuerPunkte(a) / (a.phase === 'sieg' ? 20 : 10)) + 5 * ((a.akt ?? 1) - 1);
