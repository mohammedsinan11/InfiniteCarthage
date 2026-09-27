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

import type { Card } from './types';

export type Sippe = 'ernte' | 'handel' | 'bau' | 'krieg' | 'wildnis';

export const SIPPEN: readonly Sippe[] = ['ernte', 'handel', 'bau', 'krieg', 'wildnis'];

export const SIPPE_NAME: Record<Sippe, string> = {
  ernte: 'Ernte',
  handel: 'Handel',
  bau: 'Bau',
  krieg: 'Krieg',
  wildnis: 'Wildnis',
};

/** Ab so vielen Karten einer Familie wirkt ihre erste, dann ihre zweite Stufe. */
export const SIPPEN_STUFEN = [2, 4] as const;

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
};

export const sippeVon = (card: string): Sippe | undefined => SIPPE_VON[card];

/**
 * Die Stufen als unsichtbare Karten. Kennungen beginnen mit "sippe:" - sie
 * wandern nie in Player.cards, nur in die Rechnung von wirksameKarten.
 */
export const SIPPEN_BONI: readonly (Card & { sippe: Sippe; ab: number })[] = [
  { id: 'sippe:ernte:2', sippe: 'ernte', ab: 2, name: 'Bauernsippe', rarity: 'selten', text: 'Felder liefern dir +1 Getreide.', lasting: { t: 'terrainBonus', terrain: 'field', amount: 1 } },
  { id: 'sippe:ernte:4', sippe: 'ernte', ab: 4, name: 'Grosse Ernte', rarity: 'episch', text: 'Weiden liefern dir +1 Wolle.', lasting: { t: 'terrainBonus', terrain: 'pasture', amount: 1 } },
  { id: 'sippe:handel:2', sippe: 'handel', ab: 2, name: 'Haendlersippe', rarity: 'selten', text: 'Der Markt kostet dich eine Karte weniger.', lasting: { t: 'marktRabatt', amount: 1 } },
  { id: 'sippe:handel:4', sippe: 'handel', ab: 4, name: 'Handelshaus', rarity: 'episch', text: 'Du darfst 3 Karten mehr halten, und deine Haefen bleiben im Sturm offen.', lasting: [{ t: 'handLimit', amount: 3 }, { t: 'stormPorts' }] },
  { id: 'sippe:bau:2', sippe: 'bau', ab: 2, name: 'Bauhuette', rarity: 'selten', text: 'Jedes neue Dorf und jede neue Stadt bringt einen zufaelligen Rohstoff.', lasting: { t: 'bauGabe', amount: 1 } },
  { id: 'sippe:bau:4', sippe: 'bau', ab: 4, name: 'Dombaumeister', rarity: 'episch', text: 'Jede neue Stadt bringt 2 Ruhm.', lasting: { t: 'stadtRuhm', amount: 2 } },
  { id: 'sippe:krieg:2', sippe: 'krieg', ab: 2, name: 'Wehrsippe', rarity: 'selten', text: 'Pluenderer nehmen dir eine Karte weniger.', lasting: { t: 'schutz', amount: 1 } },
  { id: 'sippe:krieg:4', sippe: 'krieg', ab: 4, name: 'Kriegsherr', rarity: 'episch', text: 'Jedes zerstoerte Lager bringt eine Kartenwahl mehr.', lasting: { t: 'lagerBeute', amount: 1 } },
  { id: 'sippe:wildnis:2', sippe: 'wildnis', ab: 2, name: 'Pfadfinder', rarity: 'selten', text: 'Jede erkundete Ruine bringt eine Kartenwahl mehr.', lasting: { t: 'ruinenBeute', amount: 1 } },
  { id: 'sippe:wildnis:4', sippe: 'wildnis', ab: 4, name: 'Weltkundige', rarity: 'episch', text: 'Je 2 erkundete Ruinen: 1 Siegpunkt.', lasting: { t: 'siegpunkte', je: 'ruine', pro: 2 } },
];

export type SippenZaehler = Partial<Record<Sippe, number>>;

/** Welche Stufen jemand erreicht hat - als Kennungen der unsichtbaren Karten. */
export function sippenBoni(sippe: SippenZaehler | undefined): string[] {
  if (!sippe) return [];
  return SIPPEN_BONI.filter((b) => (sippe[b.sippe] ?? 0) >= b.ab).map((b) => b.id);
}

/** Die naechste Stufe einer Familie: wie viele noch fehlen und was sie bringt. null, wenn alle erreicht sind. */
export function naechsteStufe(sippe: SippenZaehler | undefined, s: Sippe): { fehlt: number; bonus: (typeof SIPPEN_BONI)[number] } | null {
  const n = sippe?.[s] ?? 0;
  const b = SIPPEN_BONI.find((x) => x.sippe === s && x.ab > n);
  return b ? { fehlt: b.ab - n, bonus: b } : null;
}

/** Aktive Karten plus erreichte Sippenstufen - das, was modifiersOf rechnen soll. */
export function wirksameKarten(p: { activeCards: readonly string[]; sippe?: SippenZaehler }): string[] {
  const boni = sippenBoni(p.sippe);
  return boni.length === 0 ? [...p.activeCards] : [...p.activeCards, ...boni];
}

export const sippenBonusById = (id: string): (typeof SIPPEN_BONI)[number] | undefined => SIPPEN_BONI.find((b) => b.id === id);
