/**
 * Was die Karten eines Spielers JETZT bewirken - die eine Stelle dafuer.
 *
 * modifiersOf (cards/effects.ts) kennt nur Kennungen. Die Engine-Karten
 * (ENGINE_KARTEN.md) brauchen mehr: Zaehler, Sippen, Bauten, Ruhm, die
 * Handgroesse. Das liefert hier ein Kontext, gelesen aus Daten, die alle
 * oeffentlich sind - so rechnen Server und Client dasselbe.
 *
 * Und die Schluesselkarten beugen die Sippen (sippenRegeln). Das wird nur aus
 * aktiven Karten und Krone gelesen, nie aus den Stufen selbst - sonst ein
 * Kreis.
 */

import { cardById } from './catalog';
import { KEINE_REGELN, SIPPEN, effektiveSippe, wirksameKartenRoh } from './sippen';
import type { SippenRegeln, SippenZaehler } from './sippen';
import { sippeVon } from './sippen';
import { dauerwirkungen } from './types';
import type { Groesse, KartenPunkteQuelle } from './types';
import { modifiersOf } from './effects';
import { PLUS, basisKennung } from './plus';
import type { KartenKontext, Modifiers } from './effects';
import type { Resource } from '../types';

/** Was ein Spieler fuer die Rechnung mitbringt - die redigierte Sicht hat es auch. */
export type KartenSpieler = {
  id: string;
  activeCards: readonly string[];
  krone?: string | null;
  sippe?: SippenZaehler;
  sippeSeit?: SippenZaehler;
  zaehler?: Record<string, number>;
  /** Verbesserte Karten - sie wirken als "kennung+" (cards/plus.ts). */
  plus?: readonly string[];
  ruhm?: number;
  /** Server: die Hand. */
  hand?: Partial<Record<Resource, number>>;
  /** Client: nur die Zahl. */
  handCount?: number;
};

/** Was kartenPunkte und der Kontext vom Spielstand brauchen. */
export type PunkteSicht = {
  players: ReadonlyArray<KartenSpieler>;
  buildings?: Record<string, { owner: string; type: 'settlement' | 'city' }>;
  roads?: Record<string, string>;
  chronik?: { stats: Record<string, { lager: number; ruinen: number; auftraege: number }> } | null;
};

/** Eigene Karten, die wirken koennen: aktive und die Krone. */
export const eigeneWirkKarten = (p: Pick<KartenSpieler, 'activeCards' | 'krone' | 'plus'>): string[] => {
  const ids = p.krone ? [...p.activeCards, p.krone] : [...p.activeCards];
  // Verbesserte Karten wirken in ihrer Plus-Fassung (cards/plus.ts).
  return p.plus && p.plus.length > 0 ? ids.map((id) => (p.plus!.includes(id) ? id + PLUS : id)) : ids;
};

/** Wie die Schluesselkarten (und andere) die Sippen beugen. */
export function sippenRegeln(ids: readonly string[]): SippenRegeln {
  let r: SippenRegeln | null = null;
  for (const id of ids) {
    const c = cardById(id);
    if (!c) continue;
    for (const l of dauerwirkungen(c)) {
      if (l.t !== 'sippeMal' && l.t !== 'sippenPlatz' && l.t !== 'sippenDeckel') continue;
      r ??= { mal: {}, platz: 0, deckel: null };
      if (l.t === 'sippeMal') r.mal[l.sippe] = (r.mal[l.sippe] ?? 1) * l.faktor;
      else if (l.t === 'sippenPlatz') r.platz += l.amount;
      else r.deckel = r.deckel === null ? l.ab : Math.min(r.deckel, l.ab);
    }
  }
  return r ?? KEINE_REGELN;
}

/** Aktive Karten, Krone und erreichte Sippenstufen - das, was modifiersOf rechnen soll. */
export function wirksameKarten(p: Pick<KartenSpieler, 'activeCards' | 'krone' | 'sippe' | 'sippeSeit' | 'plus'>): string[] {
  const eigene = eigeneWirkKarten(p);
  return wirksameKartenRoh({ ...p, activeCards: eigene, krone: null }, sippenRegeln(eigene));
}

const handZahl = (p: KartenSpieler): number =>
  p.hand ? Object.values(p.hand).reduce<number>((n, x) => n + (x ?? 0), 0) : (p.handCount ?? 0);

/** Der Kontext fuer `je`: woran jede Groesse misst. */
export function kontextVon(s: PunkteSicht, id: string): KartenKontext {
  const p = s.players.find((x) => x.id === id);
  return {
    groesse: (g: Groesse, karte: string): number => {
      if (!p) return 0;
      switch (g.aus) {
        case 'zaehler':
          return p.zaehler?.[g.key ?? basisKennung(karte)] ?? 0;
        case 'sippe': {
          const z = effektiveSippe(p.sippe, sippenRegeln(eigeneWirkKarten(p))) ?? {};
          return g.sippe === 'beste' ? Math.max(0, ...SIPPEN.map((x) => z[x] ?? 0)) : (z[g.sippe] ?? 0);
        }
        case 'aktiv':
          return eigeneWirkKarten(p).filter((c) => !g.sippe || sippeVon(c) === g.sippe).length;
        case 'bau':
          if (g.art === 'strasse') return Object.values(s.roads ?? {}).filter((o) => o === id).length;
          return Object.values(s.buildings ?? {}).filter((b) => b.owner === id && b.type === (g.art === 'stadt' ? 'city' : 'settlement')).length;
        case 'chronik':
          return s.chronik?.stats[id]?.[g.art] ?? 0;
        case 'ruhm':
          return p.ruhm ?? 0;
        case 'hand':
          return handZahl(p);
      }
    },
  };
}

/** Alles zusammen: was die Karten dieses Spielers jetzt bewirken. */
export function wirkungenVon(s: PunkteSicht, id: string): Modifiers {
  const p = s.players.find((x) => x.id === id);
  if (!p) return modifiersOf([]);
  return modifiersOf(wirksameKarten(p), kontextVon(s, id));
}

/**
 * Siegpunkte aus aktiven Karten - "je 2 Staedte ein Punkt", feste Punkte und
 * skalierte (je ... punkte). Eine Funktion fuer Server (state.ts) und Anzeige.
 */
export function kartenPunkte(state: PunkteSicht, id: string): number {
  const p = state.players.find((x) => x.id === id);
  if (!p) return 0;
  const m = wirkungenVon(state, id);
  const stats = state.chronik?.stats[id];
  const zahl = (je: KartenPunkteQuelle): number => {
    switch (je) {
      case 'stadt':
        return Object.values(state.buildings ?? {}).filter((b) => b.owner === id && b.type === 'city').length;
      case 'strasse':
        return Object.values(state.roads ?? {}).filter((o) => o === id).length;
      case 'lager':
        return stats?.lager ?? 0;
      case 'ruine':
        return stats?.ruinen ?? 0;
      case 'auftrag':
        return stats?.auftraege ?? 0;
    }
  };
  return m.punkte + m.siegpunkte.reduce((n, s) => n + Math.floor(zahl(s.je) / s.pro), 0);
}
