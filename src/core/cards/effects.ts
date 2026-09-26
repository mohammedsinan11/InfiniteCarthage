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
import type { KartenPunkteQuelle } from './types';
import type { Terrain } from '../types';

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
};

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
});
const LEER: Modifiers = leer();

export function modifiersOf(cardIds: readonly string[]): Modifiers {
  if (cardIds.length === 0) return LEER;

  const m: Modifiers = leer();
  for (const id of cardIds) {
    const karte = cardById(id);
    if (!karte) continue;
    for (const l of dauerwirkungen(karte)) {
      switch (l.t) {
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
          // Nur die beste aktive Vorratskarte wirkt.
          m.handLimitBonus = Math.max(m.handLimitBonus, l.amount);
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
      }
    }
  }
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
  return Math.max(0, base + (m.terrainBonus[terrain] ?? 0));
}

/** Was kartenPunkte vom Spielstand braucht - auch die redigierte Sicht hat es. */
export type PunkteSicht = {
  players: ReadonlyArray<{ id: string; activeCards: readonly string[] }>;
  buildings: Record<string, { owner: string; type: 'settlement' | 'city' }>;
  roads: Record<string, string>;
  chronik?: { stats: Record<string, { lager: number; ruinen: number; auftraege: number }> } | null;
};

/**
 * Siegpunkte aus aktiven Karten mit Punktewirkung - etwa "je 2 Staedte ein
 * Punkt". Eine Funktion fuer Server (state.ts, publicPoints) und Anzeige.
 */
export function kartenPunkte(state: PunkteSicht, id: string): number {
  const p = state.players.find((x) => x.id === id);
  if (!p) return 0;
  const m = modifiersOf(p.activeCards);
  if (m.siegpunkte.length === 0) return 0;
  const stats = state.chronik?.stats[id];
  const zahl = (je: KartenPunkteQuelle): number => {
    switch (je) {
      case 'stadt':
        return Object.values(state.buildings).filter((b) => b.owner === id && b.type === 'city').length;
      case 'strasse':
        return Object.values(state.roads).filter((o) => o === id).length;
      case 'lager':
        return stats?.lager ?? 0;
      case 'ruine':
        return stats?.ruinen ?? 0;
      case 'auftrag':
        return stats?.auftraege ?? 0;
    }
  };
  return m.siegpunkte.reduce((n, s) => n + Math.floor(zahl(s.je) / s.pro), 0);
}
