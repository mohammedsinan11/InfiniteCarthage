/**
 * Sippen: jede Karte gehoert einer von fuenf Familien, und wer mehrere einer
 * Familie sammelt, bekommt einen Bonus (Spieltest 5: "die Kartenwahl ist das
 * Beste am Spiel - macht sie zum Kern, mit Karten, die zusammenwirken").
 *
 * Das macht aus jeder Wahl eine Richtung: nimmt man die schwaechere Karte,
 * weil sie die dritte Handelskarte waere? Die Boni sind klein und klar - zwei
 * Stufen je Familie, bei 2 und bei 4 Karten -, damit man sie im Kopf behaelt.
 *
 * Gezaehlt wird jede genommene Karte, ob Dauerkarte, Sofortkarte oder Taktik:
 * ein Deckbau ohne Stapel. Der Zaehler steht im Spielstand (Player.sippe),
 * weil Sofort- und Taktikkarten nach dem Nehmen oder Ausspielen verschwinden.
 *
 * DIE BONI SIND KARTEN. Jede Stufe ist eine unsichtbare Dauerkarte mit
 * gewoehnlichen Wirkungen (cards/types.ts, Lasting). modifiersOf sieht sie
 * wie jede andere, sobald wirksameKarten sie zu den aktiven legt - so gibt es
 * keine zweite Stelle, an der Boni zusammengerechnet werden. Sie belegen
 * keinen Platz und lassen sich nicht ziehen.
 *
 * Nur in Partien mit Ereignissen zaehlt der Zaehler; alte Staende haben keinen.
 */

import type { Card, SippeId } from './types';

export type Sippe = SippeId;

export const SIPPEN: readonly Sippe[] = ['ernte', 'handel', 'bau', 'krieg', 'wildnis'];

export const SIPPE_NAME: Record<Sippe, string> = {
  ernte: 'Ernte',
  handel: 'Handel',
  bau: 'Bau',
  krieg: 'Krieg',
  wildnis: 'Wildnis',
};

/** Ab so vielen Karten einer Familie wirkt ihre erste, zweite, dritte Stufe. */
export const SIPPEN_STUFEN = [2, 4, 6] as const;

/**
 * Nur die zwei staerksten Familien wirken (Spieltest 6: zur Mitte der Partie
 * standen alle fuenf auf voller Stufe, und die Leiste war nur noch Rauschen).
 * Wer eine dritte gross zieht, laesst eine andere ruhen - eine Wahl, keine
 * Sammlung.
 */
export const WIRKENDE_SIPPEN = 2;

/** Zu welcher Familie jede Karte gehoert. Unbekannte zaehlen nirgends. */
export const SIPPE_VON: Record<string, Sippe> = {
  // Ernte: Felder, Weiden und das Glueck der Wuerfel.
  ernte: 'ernte',
  wollballen: 'ernte',
  doppelernte: 'ernte',
  schafzucht: 'ernte',
  muehlen: 'ernte',
  fruchtbares_tal: 'ernte',
  goldene_ernte: 'ernte',
  karge_jahre: 'ernte',
  schlangenaugen: 'ernte',
  gluecksstraehne: 'ernte',
  // Handel: Bank, Markt, Vorraete.
  handelsposten: 'handel',
  markttag: 'handel',
  handelsflotte: 'handel',
  wanderhaendler: 'handel',
  vorratskammer: 'handel',
  grosse_scheune: 'handel',
  glueckliche_hand: 'handel',
  // Bau: Holz, Lehm, Stein, Strassen und Staedte.
  lehmgrube: 'bau',
  holzstapel: 'bau',
  erzbrocken: 'bau',
  baumeister: 'bau',
  strassennetz: 'bau',
  holzlager: 'bau',
  steinbruch: 'bau',
  ziegelei: 'bau',
  saegewerk: 'bau',
  erzader: 'bau',
  der_fund: 'bau',
  baumeistergilde: 'bau',
  grosse_bauhuette: 'bau',
  // Krieg: Schutz, Lager, Taktiken.
  wehrhafte_doerfer: 'krieg',
  trophaeenhalle: 'krieg',
  kriegsbeute: 'krieg',
  feldscher: 'krieg',
  schildwall: 'krieg',
  sammeln: 'krieg',
  schlachtruf: 'krieg',
  belagerungsplan: 'krieg',
  feuerpfeile: 'krieg',
  letztes_aufgebot: 'krieg',
  // Wildnis: Ruinen, Wanderer, der Held.
  kartograph: 'wildnis',
  weltenwanderer: 'wildnis',
  freund_der_wanderer: 'wildnis',
  heilkraeuter: 'wildnis',
  glueck_des_hauses: 'wildnis',
  proviant: 'wildnis',
  spaeherpfad: 'wildnis',
  schatzkarte: 'wildnis',
  // Engine- und Schluesselkarten (ENGINE_KARTEN.md).
  saatgut: 'ernte',
  erntedank: 'ernte',
  kornspeicher: 'ernte',
  pflugschar: 'ernte',
  fruchtwechsel: 'ernte',
  gluecksklee: 'ernte',
  dreschflegel: 'ernte',
  doppeljoch: 'ernte',
  dorfidyll: 'ernte',
  fuellhorn: 'ernte',
  siebenstern: 'ernte',
  ahnenmutter: 'ernte',
  zollstation: 'handel',
  wechselstube: 'handel',
  kontor: 'handel',
  seidenstrasse: 'handel',
  gildenbrief: 'handel',
  pfandleiher: 'handel',
  wucherzins: 'handel',
  hafenmeister: 'handel',
  monopol: 'handel',
  zinseszins: 'handel',
  karawanserei: 'handel',
  wegezoll: 'bau',
  richtfest: 'bau',
  zunfthaus: 'bau',
  steinmetz: 'bau',
  bauboom: 'bau',
  fachwerk: 'bau',
  grundstein: 'bau',
  meilenstein: 'bau',
  metropole: 'bau',
  koenigsweg: 'bau',
  ziegelgold: 'bau',
  kriegskasse: 'krieg',
  veteranen: 'krieg',
  blutzoll: 'krieg',
  bollwerk: 'krieg',
  beutezug: 'krieg',
  kriegsschmiede: 'krieg',
  trommler: 'krieg',
  kopfgeld: 'krieg',
  raubritter: 'krieg',
  blutmond_krone: 'krieg',
  eiserne_krone: 'krieg',
  wegweiser: 'wildnis',
  sammelbeutel: 'wildnis',
  fernweh: 'wildnis',
  sternkarte: 'wildnis',
  kraeuterkunde: 'wildnis',
  lagerfeuer: 'wildnis',
  sagenschreiber: 'wildnis',
  goldene_aehre: 'ernte',
  zehntscheune: 'ernte',
  kaufmannsgilde: 'handel',
  gesandtschaft: 'handel',
  kathedrale: 'bau',
  heerbann: 'krieg',
  feldlager: 'krieg',
  sternenpfad: 'wildnis',
  wegkreuz: 'wildnis',
  jagdglueck: 'wildnis',
  weltenbaum: 'wildnis',
  bund_der_sippen: 'wildnis',
  nomadenherz: 'wildnis',
};

// Verbesserte Karten (kennung+) gehoeren zur Familie ihrer Grundkarte.
export const sippeVon = (card: string): Sippe | undefined => SIPPE_VON[card.endsWith('+') ? card.slice(0, -1) : card];

/**
 * Die Stufen als unsichtbare Karten. Kennungen beginnen mit "sippe:" - sie
 * wandern nie in Player.cards, nur in die Rechnung von wirksameKarten.
 */
export const SIPPEN_BONI: readonly (Card & { sippe: Sippe; ab: number })[] = [
  { id: 'sippe:ernte:2', sippe: 'ernte', ab: 2, name: 'Bauernsippe', rarity: 'selten', text: 'Felder liefern dir +1 Getreide.', lasting: { t: 'terrainBonus', terrain: 'field', amount: 1 } },
  { id: 'sippe:ernte:4', sippe: 'ernte', ab: 4, name: 'Grosse Ernte', rarity: 'episch', text: 'Weiden liefern dir +1 Wolle.', lasting: { t: 'terrainBonus', terrain: 'pasture', amount: 1 } },
  { id: 'sippe:handel:2', sippe: 'handel', ab: 2, name: 'Haendlersippe', rarity: 'selten', text: 'Der Markt kostet dich eine Karte weniger.', lasting: { t: 'marktRabatt', amount: 1 } },
  { id: 'sippe:handel:4', sippe: 'handel', ab: 4, name: 'Handelshaus', rarity: 'episch', text: 'Du darfst 3 Karten mehr halten - zusaetzlich zu Vorratskarten -, und deine Haefen bleiben im Sturm offen.', lasting: [{ t: 'handLimit', amount: 3, stapelt: true }, { t: 'stormPorts' }] },
  { id: 'sippe:bau:2', sippe: 'bau', ab: 2, name: 'Bauhuette', rarity: 'selten', text: 'Jedes neue Dorf und jede neue Stadt bringt einen zufaelligen Rohstoff.', lasting: { t: 'bauGabe', amount: 1 } },
  { id: 'sippe:bau:4', sippe: 'bau', ab: 4, name: 'Dombaumeister', rarity: 'episch', text: 'Jede neue Stadt bringt 2 Ruhm.', lasting: { t: 'stadtRuhm', amount: 2 } },
  { id: 'sippe:krieg:2', sippe: 'krieg', ab: 2, name: 'Wehrsippe', rarity: 'selten', text: 'Pluenderer nehmen dir eine Karte weniger.', lasting: { t: 'schutz', amount: 1 } },
  { id: 'sippe:krieg:4', sippe: 'krieg', ab: 4, name: 'Kriegsherr', rarity: 'episch', text: 'Jedes zerstoerte Lager bringt eine Kartenwahl mehr.', lasting: { t: 'lagerBeute', amount: 1 } },
  { id: 'sippe:wildnis:2', sippe: 'wildnis', ab: 2, name: 'Pfadfinder', rarity: 'selten', text: 'Jede erkundete Ruine bringt eine Kartenwahl mehr.', lasting: { t: 'ruinenBeute', amount: 1 } },
  { id: 'sippe:wildnis:4', sippe: 'wildnis', ab: 4, name: 'Weltkundige', rarity: 'episch', text: 'Je 2 erkundete Ruinen: 1 Siegpunkt.', lasting: { t: 'siegpunkte', je: 'ruine', pro: 2 } },
  // Die dritte Stufe: nur fuer eine Familie, auf die man wirklich gesetzt hat.
  { id: 'sippe:ernte:6', sippe: 'ernte', ab: 6, name: 'Kornkammer', rarity: 'legendaer', text: 'Felder liefern dir noch einmal +1 Getreide.', lasting: { t: 'terrainBonus', terrain: 'field', amount: 1 } },
  { id: 'sippe:handel:6', sippe: 'handel', ab: 6, name: 'Handelsmacht', rarity: 'legendaer', text: 'Bankhandel kostet dich eine Karte weniger.', lasting: { t: 'tradeDiscount', amount: 1 } },
  { id: 'sippe:bau:6', sippe: 'bau', ab: 6, name: 'Baumeisterzunft', rarity: 'legendaer', text: 'Je 3 eigene Staedte: 1 Siegpunkt.', lasting: { t: 'siegpunkte', je: 'stadt', pro: 3 } },
  { id: 'sippe:krieg:6', sippe: 'krieg', ab: 6, name: 'Kriegsruhm', rarity: 'legendaer', text: 'Je 2 zerstoerte Lager: 1 Siegpunkt.', lasting: { t: 'siegpunkte', je: 'lager', pro: 2 } },
  { id: 'sippe:wildnis:6', sippe: 'wildnis', ab: 6, name: 'Legendenerzaehler', rarity: 'legendaer', text: 'Je 2 erfuellte Auftraege: 1 Siegpunkt.', lasting: { t: 'siegpunkte', je: 'auftrag', pro: 2 } },
];

export type SippenZaehler = Partial<Record<Sippe, number>>;

/**
 * Was Schluesselkarten an den Sippen beugen (ENGINE_KARTEN.md): Karten einer
 * Familie zaehlen mehrfach, mehr oder weniger Familien wirken, Stufen ab einer
 * Zahl wirken nicht. Gelesen nur aus aktiven Karten und Krone, nie aus den
 * Stufen selbst (cards/wirkung.ts, sippenRegeln) - sonst ein Kreis.
 */
export type SippenRegeln = { mal: Partial<Record<Sippe | 'alle', number>>; platz: number; deckel: number | null };
export const KEINE_REGELN: SippenRegeln = { mal: {}, platz: 0, deckel: null };

/** Die Zaehler, wie sie unter den Regeln zaehlen. */
export function effektiveSippe(sippe: SippenZaehler | undefined, r: SippenRegeln = KEINE_REGELN): SippenZaehler | undefined {
  if (!sippe || (Object.keys(r.mal).length === 0)) return sippe;
  const out: SippenZaehler = {};
  for (const s of SIPPEN) {
    const n = sippe[s] ?? 0;
    if (n > 0) out[s] = n * (r.mal[s] ?? 1) * (r.mal.alle ?? 1);
  }
  return out;
}

/**
 * Die wirkenden Familien: die mit den meisten Karten (mindestens der ersten
 * Stufe). Bei Gleichstand bleibt, wer seine Zahl frueher erreichte (seit: die
 * wievielte Wahl das war) - eine neue Familie verdraengt eine alte erst, wenn
 * sie sie ueberholt.
 */
export function wirkendeSippen(sippe: SippenZaehler | undefined, seit?: SippenZaehler, regeln: SippenRegeln = KEINE_REGELN): Sippe[] {
  if (!sippe) return [];
  sippe = effektiveSippe(sippe, regeln)!;
  const z = sippe;
  return SIPPEN.filter((s) => (sippe[s] ?? 0) >= SIPPEN_STUFEN[0])
    .sort(
      (a, b) =>
        (z[b] ?? 0) - (z[a] ?? 0) ||
        (seit?.[a] ?? Infinity) - (seit?.[b] ?? Infinity) ||
        SIPPEN.indexOf(a) - SIPPEN.indexOf(b),
    )
    .slice(0, Math.max(0, WIRKENDE_SIPPEN + regeln.platz));
}

/** Welche Stufen wirken - als Kennungen der unsichtbaren Karten. */
export function sippenBoni(sippe: SippenZaehler | undefined, seit?: SippenZaehler, regeln: SippenRegeln = KEINE_REGELN): string[] {
  if (!sippe) return [];
  const wirken = new Set(wirkendeSippen(sippe, seit, regeln));
  const z = effektiveSippe(sippe, regeln)!;
  return SIPPEN_BONI.filter(
    (b) => wirken.has(b.sippe) && (z[b.sippe] ?? 0) >= b.ab && (regeln.deckel === null || b.ab < regeln.deckel),
  ).map((b) => b.id);
}

/** Die naechste Stufe einer Familie: wie viele noch fehlen und was sie bringt. null, wenn alle erreicht sind. */
export function naechsteStufe(sippe: SippenZaehler | undefined, s: Sippe): { fehlt: number; bonus: (typeof SIPPEN_BONI)[number] } | null {
  const n = sippe?.[s] ?? 0;
  const b = SIPPEN_BONI.find((x) => x.sippe === s && x.ab > n);
  return b ? { fehlt: b.ab - n, bonus: b } : null;
}

/**
 * Aktive Karten, Krone und erreichte Sippenstufen - ohne Schluesselregeln.
 * Die vollstaendige Fassung steht in cards/wirkung.ts (wirksameKarten).
 */
export function wirksameKartenRoh(
  p: { activeCards: readonly string[]; krone?: string | null; sippe?: SippenZaehler; sippeSeit?: SippenZaehler },
  regeln: SippenRegeln = KEINE_REGELN,
): string[] {
  const eigene = p.krone ? [...p.activeCards, p.krone] : [...p.activeCards];
  const boni = sippenBoni(p.sippe, p.sippeSeit, regeln);
  return boni.length === 0 ? eigene : [...eigene, ...boni];
}

export const sippenBonusById = (id: string): (typeof SIPPEN_BONI)[number] | undefined => SIPPEN_BONI.find((b) => b.id === id);
