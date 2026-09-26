/**
 * Die Tagesexpedition: jeden Tag eine Welt fuer alle.
 *
 * Wer am selben Tag spielt, bekommt dieselbe Landschaft, dieselben Omen und -
 * weil die Wuerfel aus geheimem Seed und Zugnummer kommen (rules/reducer.ts,
 * wuerfelFuer) - dieselben Wuerfe. Was sich unterscheidet, sind die
 * Entscheidungen. Das macht Ergebnisse vergleichbar, und eine Bestenliste
 * erst sinnvoll.
 *
 * Die Partie dauert ein Jahr (TAGES_RUNDEN) und wird allein gespielt; es
 * zaehlt die Wertung (core/chronik.ts, wertung), nicht ein Siegpunktziel.
 *
 * ZWEI SEEDS, wie immer. Der Weltseed folgt oeffentlich aus dem Datum - die
 * Welt ist ohnehin fuer alle sichtbar. Der geheime Seed dagegen darf NICHT aus
 * dem Datum folgen, sonst liessen sich Wuerfe und Karten aus dem Quelltext
 * vorausrechnen. Ihn wuerfelt das Tagesobjekt der Bestenliste beim ersten
 * Aufruf und behaelt ihn (worker/bestenliste.ts).
 *
 * Hier liegt nur, was Client und Worker gleichermassen brauchen und was sich
 * ohne Worker pruefen laesst.
 */

import { mitWeltArt, zufallsArt } from './weltart';
import { fnv1a } from './hash';
import { wuerfleOmen } from './omen';

/** Ein Jahr: vier Jahreszeiten zu 15 Runden (core/season.ts). */
export const TAGES_RUNDEN = 60;

/** So viele Plaetze zeigt die Bestenliste. */
export const BESTENLISTE_PLAETZE = 20;

/** Das Datum in UTC, etwa "2026-09-26" - ueberall auf der Welt derselbe Tag. */
export function tagesDatum(jetzt: Date = new Date()): string {
  return jetzt.toISOString().slice(0, 10);
}

export const istTagesDatum = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Der oeffentliche Weltseed des Tages. */
export const tagesWeltSeed = (datum: string): number => {
  const roh = fnv1a('carthago:' + datum) | 0;
  // Ab dem 27.09.2026 hat auch die Tageswelt eine Weltart (core/weltart.ts).
  // Fruehere Tage bleiben, wie sie waren - ihre Bestenlisten gelten weiter.
  return datum >= '2026-09-27' ? mitWeltArt(roh, zufallsArt(fnv1a('weltart:' + datum))) : roh;
};

/**
 * Die Omen des Tages: ein Segen, zwei Flueche. Etwas haerter als eine
 * gewoehnliche Partie - wer jeden Tag kommt, sucht die Herausforderung.
 */
export const tagesOmen = (datum: string): string[] => wuerfleOmen(tagesWeltSeed(datum), 1, 2);

/** Ein Ergebnis in der Bestenliste. */
export type BestenEintrag = {
  name: string;
  /** Die Wertung (core/chronik.ts): Siegpunkte x 10 + Ruhm. */
  wertung: number;
  punkte: number;
  ruhm: number;
  /** Raum der Partie - zum Nachsehen. */
  code: string;
  /** Millisekunden seit 1970. */
  zeit: number;
};

export function istBestenEintrag(v: unknown): v is BestenEintrag {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.name === 'string' &&
    e.name.length > 0 &&
    e.name.length <= 20 &&
    Number.isInteger(e.wertung) &&
    Number.isInteger(e.punkte) &&
    Number.isInteger(e.ruhm) &&
    typeof e.code === 'string' &&
    typeof e.zeit === 'number'
  );
}

/**
 * Was die Liste zeigt: je Name das beste Ergebnis, die hoechste Wertung
 * zuerst, bei Gleichstand wer frueher fertig war.
 *
 * Je Name, weil es keine Konten gibt: wer denselben Tag noch einmal spielt,
 * verbessert seinen Eintrag, statt die Liste zu fuellen.
 */
export function bestenliste(eintraege: readonly BestenEintrag[], plaetze = BESTENLISTE_PLAETZE): BestenEintrag[] {
  const best = new Map<string, BestenEintrag>();
  for (const e of eintraege) {
    const k = e.name.trim().toLowerCase();
    const alt = best.get(k);
    if (!alt || e.wertung > alt.wertung || (e.wertung === alt.wertung && e.zeit < alt.zeit)) best.set(k, e);
  }
  return [...best.values()]
    .sort((a, b) => b.wertung - a.wertung || a.zeit - b.zeit)
    .slice(0, plaetze);
}

/** Was GET /daily liefert. */
export type TagesInfo = {
  datum: string;
  omens: string[];
  runden: number;
  eintraege: BestenEintrag[];
};

export function istTagesInfo(v: unknown): v is TagesInfo {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    istTagesDatum(t.datum) &&
    Array.isArray(t.omens) &&
    typeof t.runden === 'number' &&
    Array.isArray(t.eintraege)
  );
}
