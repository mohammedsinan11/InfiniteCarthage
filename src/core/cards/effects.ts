/**
 * Was die Karten eines Spielers dauerhaft bewirken.
 *
 * An EINER Stelle zusammengerechnet, damit Ertrag, Handel und Handkarten-
 * grenze dieselbe Antwort bekommen. Wuerde jede Regel selbst durch die Karten
 * laufen, gaebe es drei Gelegenheiten, sich zu widersprechen.
 *
 * Die Dauerwirkungen leben NICHT als eigener Zustand, sondern werden bei
 * Bedarf aus der Kartenliste abgeleitet. Damit kann der Bonus nicht von den
 * Karten abweichen - es gibt nur eine Wahrheit, und das ist die Liste.
 */

import { cardById } from './catalog';
import { dauerwirkungen } from './types';
import type { Anlass, Bauwerk, Groesse, KartenPunkteQuelle, Lasting, Sperre } from './types';
import type { Resource, Terrain } from '../types';

export type Modifiers = {
  /** Zusaetzlicher Ertrag je Gelaende, kann negativ sein. */
  terrainBonus: Partial<Record<Terrain, number>>;
  /** Wie viele Karten der Bankhandel guenstiger wird. */
  tradeDiscount: number;
  /** Um wie viel die Handkartengrenze steigt. */
  handLimitBonus: number;
  /** Eigene Haefen schliessen im Sturm nicht. */
  stormPorts: boolean;
  /** Regelkarten: [von, zu] - faellt von, liefern auch Felder mit zu. */
  alsZahl: [number, number][];
  /** Regelkarten: bei diesen Zahlen doppelter Ertrag. */
  doppelZahlen: number[];
  /** Zufaellige Rohstoffe bei jeder 7. */
  siebenGabe: number;
  /** So viele Karten weniger je Pluenderung. */
  schutz: number;
  /** Siegpunkte fuer eine Spielweise. */
  siegpunkte: { je: KartenPunkteQuelle; pro: number }[];
  /** Sippenstufen (cards/sippen.ts): Markt billiger, Gaben und Wahlen beim Bauen, Lager und Ruinen. */
  marktRabatt: number;
  bauGabe: number;
  stadtRuhm: number;
  lagerBeute: number;
  ruinenBeute: number;
  /*
   * ENGINE (ENGINE_KARTEN.md). Was ueber `je` skaliert, umgeht die Deckel
   * der gewoehnlichen Karten - sonst waere Skalierung tot.
   */
  /** Gelaendebonus aus Skalierung, zusaetzlich zum gedeckelten. */
  terrainSkaliert: Partial<Record<Terrain, number>>;
  /** Bankrabatt aus Skalierung, zusaetzlich zum gedeckelten. */
  tradeSkaliert: number;
  /** Feste Siegpunkte (punkte, auch skaliert). */
  punkte: number;
  ersatz: { von: Resource; fuer: Resource | 'alle'; bei: Bauwerk | 'alle' }[];
  rabatt: { bei: Bauwerk; resource: Resource; amount: number }[];
  ertragMal: { faktor: number; terrain?: Terrain; zahlen?: readonly number[]; gebaeude?: 'dorf' | 'stadt' }[];
  grundErtrag: { dorf: number; stadt: number } | null;
  siebenLiefert: boolean;
  /** Fuer welche Anlaesse die Wenn-Karten doppelt ausloesen ('*': alle). */
  nachhall: (Anlass['bei'] | '*')[];
  ausloeserJahr: boolean;
  beuteStattVerlust: boolean;
  /** Fester Bankkurs: [Kurs, nur fuer diese Sorte]. */
  kurs: { ratio: number; nur?: Resource }[];
  sperren: Sperre[];
};

/**
 * Woran `je` misst (ENGINE_KARTEN.md, Groesse). Ohne Kontext zaehlt jede
 * Groesse als 0 - alte Aufrufer bleiben richtig, nur ohne Skalierung.
 */
export type KartenKontext = { groesse: (g: Groesse, karte: string) => number };

const leer = (): Modifiers => ({
  terrainBonus: {},
  tradeDiscount: 0,
  handLimitBonus: 0,
  stormPorts: false,
  alsZahl: [],
  doppelZahlen: [],
  siebenGabe: 0,
  schutz: 0,
  siegpunkte: [],
  marktRabatt: 0,
  bauGabe: 0,
  stadtRuhm: 0,
  lagerBeute: 0,
  ruinenBeute: 0,
  terrainSkaliert: {},
  tradeSkaliert: 0,
  punkte: 0,
  ersatz: [],
  rabatt: [],
  ertragMal: [],
  grundErtrag: null,
  siebenLiefert: false,
  nachhall: [],
  ausloeserJahr: false,
  beuteStattVerlust: false,
  kurs: [],
  sperren: [],
});
const LEER: Modifiers = leer();

/** Eine skalierte Wirkung n-mal anrechnen - an den Deckeln vorbei. */
function skaliert(m: Modifiers, l: Lasting, n: number): number {
  if (n <= 0) return 0;
  switch (l.t) {
    case 'terrainBonus':
      m.terrainSkaliert[l.terrain] = (m.terrainSkaliert[l.terrain] ?? 0) + l.amount * n;
      return 0;
    case 'tradeDiscount':
      m.tradeSkaliert += l.amount * n;
      return 0;
    case 'handLimit':
      return l.amount * n;
    case 'schutz':
      m.schutz += l.amount * n;
      return 0;
    case 'siebenGabe':
      m.siebenGabe += l.anzahl * n;
      return 0;
    case 'marktRabatt':
      m.marktRabatt += l.amount * n;
      return 0;
    case 'punkte':
      m.punkte += l.amount * n;
      return 0;
    default:
      return 0;
  }
}

export function modifiersOf(cardIds: readonly string[], kontext?: KartenKontext): Modifiers {
  if (cardIds.length === 0) return LEER;

  const m: Modifiers = leer();
  let stapelnd = 0;
  for (const id of cardIds) {
    const karte = cardById(id);
    if (!karte) continue;
    for (const l of dauerwirkungen(karte)) {
      switch (l.t) {
        case 'je': {
          const g = kontext ? kontext.groesse(l.groesse, id) : 0;
          const n = Math.max(0, Math.min(l.max, Math.floor(g / Math.max(1, l.pro))));
          stapelnd += skaliert(m, l.dann, n);
          break;
        }
        case 'punkte':
          m.punkte += l.amount;
          break;
        case 'ersatz':
          m.ersatz.push({ von: l.von, fuer: l.fuer, bei: l.bei });
          break;
        case 'rabatt':
          m.rabatt.push({ bei: l.bei, resource: l.resource, amount: l.amount });
          break;
        case 'ertragMal':
          m.ertragMal.push({ faktor: l.faktor, terrain: l.terrain, zahlen: l.zahlen, gebaeude: l.gebaeude });
          break;
        case 'grundErtrag':
          m.grundErtrag = { dorf: l.dorf, stadt: l.stadt };
          break;
        case 'siebenLiefert':
          m.siebenLiefert = true;
          break;
        case 'nachhall':
          m.nachhall.push(l.bei ?? '*');
          break;
        case 'ausloeserJahr':
          m.ausloeserJahr = true;
          break;
        case 'beuteStattVerlust':
          m.beuteStattVerlust = true;
          break;
        case 'kurs':
          m.kurs.push({ ratio: l.ratio, nur: l.nur });
          break;
        case 'sperre':
          if (!m.sperren.includes(l.was)) m.sperren.push(l.was);
          break;
        case 'terrainBonus':
          m.terrainBonus[l.terrain] = Math.max(
            -1,
            Math.min(2, (m.terrainBonus[l.terrain] ?? 0) + l.amount),
          );
          break;
        case 'tradeDiscount':
          // Karten ergaenzen Haefen und Handelskontor, ersetzen sie aber nicht.
          m.tradeDiscount = Math.min(1, m.tradeDiscount + l.amount);
          break;
        case 'handLimit':
          // Nur die beste aktive Vorratskarte wirkt - eine Sippenstufe kommt
          // obendrauf (Spieltest 6: das Handelshaus tat neben der Grossen
          // Scheune stumm nichts).
          if (l.stapelt) stapelnd += l.amount;
          else m.handLimitBonus = Math.max(m.handLimitBonus, l.amount);
          break;
        case 'stormPorts':
          m.stormPorts = true;
          break;
        case 'alsZahl':
          m.alsZahl.push([l.von, l.zu]);
          break;
        case 'doppelZahl':
          for (const z of l.zahlen) if (!m.doppelZahlen.includes(z)) m.doppelZahlen.push(z);
          break;
        case 'siebenGabe':
          m.siebenGabe += l.anzahl;
          break;
        case 'schutz':
          m.schutz += l.amount;
          break;
        case 'siegpunkte':
          m.siegpunkte.push({ je: l.je, pro: l.pro });
          break;
        case 'marktRabatt':
          m.marktRabatt += l.amount;
          break;
        case 'bauGabe':
          m.bauGabe += l.amount;
          break;
        case 'stadtRuhm':
          m.stadtRuhm += l.amount;
          break;
        case 'lagerBeute':
          m.lagerBeute += l.amount;
          break;
        case 'ruinenBeute':
          m.ruinenBeute += l.amount;
          break;
      }
    }
  }
  m.handLimitBonus += stapelnd;
  return m;
}

/**
 * Ertragsbonus fuer ein Gelaende.
 *
 * Nie unter null insgesamt: eine Karte darf einen Ertrag schmaelern, aber
 * nicht ins Negative drehen. "Karge Jahre" soll die Weide schwaechen, nicht
 * dazu fuehren, dass man beim Wuerfeln Karten abgibt.
 */
export function terrainBonusFor(m: Modifiers, terrain: Terrain, base: number): number {
  return Math.max(0, base + (m.terrainBonus[terrain] ?? 0) + (m.terrainSkaliert[terrain] ?? 0));
}

/** Der Ertragsfaktor fuer ein Feld, nach allen Plus-Werten - hoechstens x8 (ENGINE_KARTEN.md). */
export const ERTRAG_MAL_MAX = 8;
export function ertragsFaktor(m: Modifiers, terrain: Terrain, roll: number, gebaeude: 'dorf' | 'stadt'): number {
  let f = 1;
  for (const e of m.ertragMal) {
    if (e.terrain && e.terrain !== terrain) continue;
    if (e.zahlen && !e.zahlen.includes(roll)) continue;
    if (e.gebaeude && e.gebaeude !== gebaeude) continue;
    f *= e.faktor;
  }
  return Math.min(ERTRAG_MAL_MAX, f);
}

/** Ist das fuer diese Karten gesperrt? */
export const gesperrt = (m: Modifiers, was: Sperre): boolean => m.sperren.includes(was);
