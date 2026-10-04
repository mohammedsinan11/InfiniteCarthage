/**
 * Freischaltungen (E14, nach Isaac und Balatro): der Kartentopf waechst mit
 * den Partien.
 *
 * Die erste Partie kennt die alten Karten und eine Handvoll Engine-Karten.
 * Jede gespielte Partie schaltet weitere Engine-Karten frei, jeder bezwungene
 * Boss eine Schluesselkarte. So liegt in der naechsten Partie etwas, das man
 * noch nie gesehen hat - und es gibt einen Grund, den Boss zu schlagen.
 *
 * Gezaehlt wird im Browser (client/profil.ts), der Raum gibt die Zahlen beim
 * Start weiter (worker/room.ts). Mehrere Menschen, Tagesexpedition, Szenario
 * oder "Alles von Anfang an": alles offen.
 */

import type { SystemId } from './systeme';

/** Die Engine-Karten in der Reihenfolge, in der sie freikommen - einfache zuerst. */
export const ENGINE_REIHE: readonly string[] = [
  // Von Beginn an: einfache Ausloeser, je Sippe zwei.
  'erntedank',
  'gluecksklee',
  'zollstation',
  'pfandleiher',
  'richtfest',
  'meilenstein',
  'kriegskasse',
  'trommler',
  'wegweiser',
  'kraeuterkunde',
  // Mit den Partien: Zaehler, Skalierung, Regelbrueche.
  'saatgut',
  'wechselstube',
  'wegezoll',
  'bollwerk',
  'sammelbeutel',
  'kontor',
  'kornspeicher',
  'zunfthaus',
  'steinmetz',
  'veteranen',
  'lagerfeuer',
  'pflugschar',
  'seidenstrasse',
  'bauboom',
  'blutzoll',
  'fernweh',
  'fruchtwechsel',
  'gildenbrief',
  'fachwerk',
  'beutezug',
  'sternkarte',
  'doppeljoch',
  'hafenmeister',
  'kriegsschmiede',
  'jagdglueck',
  'dreschflegel',
  'wucherzins',
  'grundstein',
  'kopfgeld',
  'sagenschreiber',
  // A5: die neuen Legendaeren und Epischen kommen zuletzt frei.
  'zehntscheune',
  'gesandtschaft',
  'feldlager',
  'wegkreuz',
  'goldene_aehre',
  'kaufmannsgilde',
  'kathedrale',
  'heerbann',
  'sternenpfad',
];

/** Die Schluesselkarten in der Reihenfolge, in der Bosse sie freigeben. */
export const SCHLUESSEL_REIHE: readonly string[] = [
  'fuellhorn',
  'metropole',
  'dorfidyll',
  'eiserne_krone',
  'raubritter',
  'koenigsweg',
  'siebenstern',
  'karawanserei',
  'ziegelgold',
  'monopol',
  'weltenbaum',
  'zinseszins',
  'blutmond_krone',
  'nomadenherz',
  'ahnenmutter',
  'bund_der_sippen',
];

/** So viele Engine-Karten sind von Beginn an offen, so viele kommen je Partie dazu. */
export const ENGINE_START = 10;
export const ENGINE_JE_PARTIE = 8;
/** So viele Schluesselkarten sind von Beginn an offen; je Boss eine mehr. */
export const SCHLUESSEL_START = 2;

/** Welche Karten nach so vielen Partien und Bossen noch gesperrt sind. */
export function gesperrteKarten(partien: number, bosse: number): string[] {
  const engine = ENGINE_REIHE.slice(ENGINE_START + ENGINE_JE_PARTIE * Math.max(0, partien));
  const schluessel = SCHLUESSEL_REIHE.slice(SCHLUESSEL_START + Math.max(0, bosse));
  return [...engine, ...schluessel];
}

/** Was zwischen zwei Staenden neu frei wurde - fuer die Chronik. */
export function neuFrei(vorher: { partien: number; bosse: number }, nachher: { partien: number; bosse: number }): string[] {
  const zu = new Set(gesperrteKarten(nachher.partien, nachher.bosse));
  return gesperrteKarten(vorher.partien, vorher.bosse).filter((id) => !zu.has(id));
}

/**
 * Karten, die ein System brauchen (core/systeme.ts): solange es in einer
 * Partie fehlt, kommen sie nicht ins Angebot (Spieltest 8: Heldenkarten in
 * der ersten Partie, als es noch keinen Helden gab).
 */
export const SYSTEM_KARTEN: Record<SystemId, readonly string[]> = {
  // Ohne Kartenwahl kommt ohnehin keine Karte; die Akte brauchen keine eigenen.
  karten: [],
  akte: [],
  // Kampf, Lager, Pluenderer - und alle Taktiken.
  raub: [
    'wehrhafte_doerfer', 'trophaeenhalle', 'kriegsbeute', 'feldscher', 'schildwall', 'sammeln', 'schlachtruf',
    'belagerungsplan', 'feuerpfeile', 'letztes_aufgebot', 'kriegskasse', 'veteranen', 'blutzoll', 'bollwerk',
    'beutezug', 'kopfgeld', 'raubritter', 'blutmond_krone', 'heerbann',
  ],
  // Held, Ruinen, Wanderer und Auftraege.
  held: [
    'kartograph', 'weltenwanderer', 'freund_der_wanderer', 'heilkraeuter', 'glueck_des_hauses', 'proviant',
    'spaeherpfad', 'schatzkarte', 'wegweiser', 'sammelbeutel', 'fernweh', 'kraeuterkunde', 'sagenschreiber',
    'lagerfeuer', 'nomadenherz', 'sternenpfad',
  ],
  // Karawanen.
  ereignisse: ['zollstation', 'seidenstrasse', 'wegkreuz'],
  reich: [],
};

/** Welche Karten einer Partie mit diesen Systemen fehlen. */
export function systemGesperrt(systeme: readonly SystemId[]): string[] {
  return (Object.keys(SYSTEM_KARTEN) as SystemId[]).filter((id) => !systeme.includes(id)).flatMap((id) => [...SYSTEM_KARTEN[id]]);
}
