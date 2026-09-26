/**
 * Der Kartenkatalog.
 *
 * BALANCE. Jede Karte hat einen Wert nach einem ausdruecklichen Modell
 * (wert.ts), und jede Seltenheit eine Wertspanne - ein Test haelt beides
 * zusammen. Die erste Fassung hatte keines davon, und es zeigte sich:
 *
 *   - Dauerwirkungen waren weit mehr wert als Sofortwirkungen derselben Stufe.
 *     "Holzfaellerlager" (+1 Holz fuer immer) lag als gewoehnlich neben
 *     "Reiche Ernte" (3 Getreide, einmal) - rund das Doppelte.
 *   - "Karge Jahre" kostete mehr, als sie brachte.
 *   - "Grosse Scheune" war fuer episch zu schwach.
 *
 * Seit die Bank unendlich ist, gibt es jede Sofortwirkung voll. Die Zahlen hier
 * gleichen das aus. Neu dazu: je zwei Karten fuer die duennen Stufen und Karten
 * mit mehreren Dauerwirkungen.
 *
 * Kennungen sind Zeichenketten und wandern in den Spielstand. Sie duerfen sich
 * nie aendern - sonst verlieren gespeicherte Partien ihre Karten. Seltenheit,
 * Text und Zahlen duerfen sich aendern.
 *
 * BILDER. Das Motiv jeder Karte waehlt client/ui/KartenBild.tsx aus ihrer
 * Wirkung - Gelaende, Rohstoffe, Handel, Vorrat. Gezeichnete Motive je Karte
 * stehen in ASSETS.md.
 */

import type { Card } from './types';

export const CARDS: readonly Card[] = [
  // --- gewoehnlich: Wert 3 bis 6 --------------------------------------------
  {
    id: 'ernte',
    name: 'Reiche Ernte',
    rarity: 'gewoehnlich',
    text: 'Nimm 4 Getreide.',
    instant: { t: 'gain', resources: { grain: 4 } },
  },
  {
    id: 'lehmgrube',
    name: 'Lehmgrube',
    rarity: 'gewoehnlich',
    text: 'Nimm 3 Lehm und 1 Holz.',
    instant: { t: 'gain', resources: { brick: 3, lumber: 1 } },
  },
  {
    id: 'handelsposten',
    name: 'Handelsposten',
    rarity: 'ungewoehnlich',
    text: 'Nimm 1 zufaelligen Rohstoff. Bankhandel kostet dich dauerhaft eine Karte weniger.',
    instant: { t: 'gainAny', count: 1 },
    lasting: { t: 'tradeDiscount', amount: 1 },
  },
  {
    id: 'holzstapel',
    name: 'Holzstapel',
    rarity: 'gewoehnlich',
    text: 'Nimm 2 Holz und 2 Lehm.',
    instant: { t: 'gain', resources: { lumber: 2, brick: 2 } },
  },
  {
    id: 'wollballen',
    name: 'Wollballen',
    rarity: 'gewoehnlich',
    text: 'Nimm 2 Wolle und 2 Getreide.',
    instant: { t: 'gain', resources: { wool: 2, grain: 2 } },
  },
  {
    id: 'erzbrocken',
    name: 'Erzbrocken',
    rarity: 'gewoehnlich',
    text: 'Nimm 3 Erz und 1 Getreide.',
    instant: { t: 'gain', resources: { ore: 3, grain: 1 } },
  },

  // Regelkarten: kleine Verschiebungen der Wuerfel (DESIGN.md, "Regel").
  {
    id: 'schlangenaugen',
    name: 'Schlangenaugen',
    rarity: 'gewoehnlich',
    text: 'Faellt eine 2, liefern deine 12er-Felder mit - und umgekehrt.',
    lasting: [
      { t: 'alsZahl', von: 2, zu: 12 },
      { t: 'alsZahl', von: 12, zu: 2 },
    ],
  },
  {
    id: 'doppelernte',
    name: 'Doppelernte',
    rarity: 'gewoehnlich',
    text: 'Nimm 1 Getreide. Bei einer 2 oder 12 liefern deine Felder doppelt.',
    instant: { t: 'gain', resources: { grain: 1 } },
    lasting: { t: 'doppelZahl', zahlen: [2, 12] },
  },

  // --- ungewoehnlich: Wert 6 bis 10 -----------------------------------------
  {
    id: 'holzlager',
    name: 'Holzfaellerlager',
    rarity: 'ungewoehnlich',
    text: 'Waelder liefern dir dauerhaft +1 Holz.',
    lasting: { t: 'terrainBonus', terrain: 'forest', amount: 1 },
  },
  {
    id: 'steinbruch',
    name: 'Steinbruch',
    rarity: 'ungewoehnlich',
    text: 'Berge liefern dir dauerhaft +1 Erz.',
    lasting: { t: 'terrainBonus', terrain: 'mountain', amount: 1 },
  },
  {
    id: 'schafzucht',
    name: 'Schafzucht',
    rarity: 'ungewoehnlich',
    text: 'Weiden liefern dir dauerhaft +1 Wolle.',
    lasting: { t: 'terrainBonus', terrain: 'pasture', amount: 1 },
  },
  {
    id: 'vorratskammer',
    name: 'Vorratskammer',
    rarity: 'ungewoehnlich',
    text: 'Nimm 3 zufaellige Rohstoffe. Du darfst dauerhaft 2 Karten mehr halten.',
    instant: { t: 'gainAny', count: 3 },
    lasting: { t: 'handLimit', amount: 2 },
  },
  {
    id: 'wanderhaendler',
    name: 'Wanderhaendler',
    rarity: 'ungewoehnlich',
    text: 'Nimm 5 zufaellige Rohstoffe.',
    instant: { t: 'gainAny', count: 5 },
  },
  {
    id: 'baumeister',
    name: 'Baumeister',
    rarity: 'ungewoehnlich',
    text: 'Nimm 2 Holz, 2 Lehm und je 1 Wolle, Getreide und Erz.',
    instant: { t: 'gain', resources: { lumber: 2, brick: 2, wool: 1, grain: 1, ore: 1 } },
  },

  {
    id: 'glueckliche_hand',
    name: 'Glueckliche Hand',
    rarity: 'ungewoehnlich',
    text: 'Bei jeder 7 - gleich wer wuerfelt - bekommst du 2 zufaellige Rohstoffe.',
    lasting: { t: 'siebenGabe', anzahl: 2 },
  },
  {
    id: 'wehrhafte_doerfer',
    name: 'Wehrhafte Doerfer',
    rarity: 'ungewoehnlich',
    text: 'Pluenderer nehmen dir je Raubzug eine Karte weniger.',
    lasting: { t: 'schutz', amount: 1 },
  },
  {
    id: 'strassennetz',
    name: 'Strassennetz',
    rarity: 'ungewoehnlich',
    text: 'Nimm 2 Holz und 2 Lehm. Je 6 eigene Strassen: 1 Siegpunkt.',
    instant: { t: 'gain', resources: { lumber: 2, brick: 2 } },
    lasting: { t: 'siegpunkte', je: 'strasse', pro: 6 },
  },

  // --- selten: Wert 10 bis 14 -----------------------------------------------
  {
    id: 'muehlen',
    name: 'Muehlen am Fluss',
    rarity: 'selten',
    text: 'Nimm 3 Getreide. Felder liefern dir dauerhaft +1 Getreide.',
    instant: { t: 'gain', resources: { grain: 3 } },
    lasting: { t: 'terrainBonus', terrain: 'field', amount: 1 },
  },
  {
    id: 'ziegelei',
    name: 'Ziegelei',
    rarity: 'selten',
    text: 'Nimm 3 Lehm. Huegel liefern dir dauerhaft +1 Lehm.',
    instant: { t: 'gain', resources: { brick: 3 } },
    lasting: { t: 'terrainBonus', terrain: 'hill', amount: 1 },
  },
  {
    id: 'saegewerk',
    name: 'Saegewerk',
    rarity: 'selten',
    text: 'Nimm 3 Holz. Waelder liefern dir dauerhaft +1 Holz.',
    instant: { t: 'gain', resources: { lumber: 3 } },
    lasting: { t: 'terrainBonus', terrain: 'forest', amount: 1 },
  },
  {
    id: 'karge_jahre',
    name: 'Karge Jahre',
    rarity: 'selten',
    text: 'Nimm 10 zufaellige Rohstoffe. Weiden liefern dir dauerhaft 1 weniger.',
    instant: { t: 'gainAny', count: 10 },
    lasting: { t: 'terrainBonus', terrain: 'pasture', amount: -1 },
  },
  {
    id: 'markttag',
    name: 'Markttag',
    rarity: 'selten',
    text: 'Nimm 4 zufaellige Rohstoffe. Bankhandel kostet dich dauerhaft eine Karte weniger.',
    instant: { t: 'gainAny', count: 4 },
    lasting: { t: 'tradeDiscount', amount: 1 },
  },

  // Punktekarten: jede belohnt eine Spielweise (cards/effects.ts, kartenPunkte).
  {
    id: 'baumeistergilde',
    name: 'Baumeistergilde',
    rarity: 'selten',
    text: 'Je 2 eigene Staedte: 1 Siegpunkt.',
    lasting: { t: 'siegpunkte', je: 'stadt', pro: 2 },
  },
  {
    id: 'trophaeenhalle',
    name: 'Trophaeenhalle',
    rarity: 'selten',
    text: 'Je 2 zerstoerte Lager: 1 Siegpunkt.',
    lasting: { t: 'siegpunkte', je: 'lager', pro: 2 },
  },
  {
    id: 'kartograph',
    name: 'Kartograph',
    rarity: 'selten',
    text: 'Je 2 erkundete Ruinen: 1 Siegpunkt.',
    lasting: { t: 'siegpunkte', je: 'ruine', pro: 2 },
  },
  {
    id: 'freund_der_wanderer',
    name: 'Freund der Wanderer',
    rarity: 'selten',
    text: 'Je 2 erfuellte Auftraege: 1 Siegpunkt.',
    lasting: { t: 'siegpunkte', je: 'auftrag', pro: 2 },
  },
  {
    id: 'gluecksstraehne',
    name: 'Gluecksstraehne',
    rarity: 'selten',
    text: 'Faellt eine 6, liefern deine 8er-Felder mit.',
    lasting: { t: 'alsZahl', von: 6, zu: 8 },
  },

  // --- episch: Wert 15 bis 20 -----------------------------------------------
  {
    id: 'erzader',
    name: 'Reiche Erzader',
    rarity: 'episch',
    text: 'Berge liefern dir dauerhaft +2 Erz.',
    lasting: { t: 'terrainBonus', terrain: 'mountain', amount: 2 },
  },
  {
    id: 'grosse_scheune',
    name: 'Grosse Scheune',
    rarity: 'episch',
    text: 'Nimm 8 zufaellige Rohstoffe. Du darfst dauerhaft 4 Karten mehr halten.',
    instant: { t: 'gainAny', count: 8 },
    lasting: { t: 'handLimit', amount: 4 },
  },
  {
    id: 'fruchtbares_tal',
    name: 'Fruchtbares Tal',
    rarity: 'episch',
    text: 'Felder liefern dir dauerhaft +1 Getreide, Weiden +1 Wolle.',
    lasting: [
      { t: 'terrainBonus', terrain: 'field', amount: 1 },
      { t: 'terrainBonus', terrain: 'pasture', amount: 1 },
    ],
  },
  {
    id: 'handelsflotte',
    name: 'Handelsflotte',
    rarity: 'episch',
    text: 'Nimm 4 zufaellige Rohstoffe. Bankhandel kostet dauerhaft eine Karte weniger, Haefen bleiben im Sturm offen.',
    instant: { t: 'gainAny', count: 4 },
    lasting: [{ t: 'tradeDiscount', amount: 1 }, { t: 'stormPorts' }],
  },

  {
    id: 'kriegsbeute',
    name: 'Kriegsbeute',
    rarity: 'episch',
    text: 'Je 2 zerstoerte Lager: 1 Siegpunkt. Pluenderer nehmen dir je Raubzug eine Karte weniger.',
    lasting: [
      { t: 'siegpunkte', je: 'lager', pro: 2 },
      { t: 'schutz', amount: 1 },
    ],
  },
  {
    id: 'weltenwanderer',
    name: 'Weltenwanderer',
    rarity: 'episch',
    text: 'Je 2 erkundete Ruinen: 1 Siegpunkt. Bei jeder 7 bekommst du 2 zufaellige Rohstoffe.',
    lasting: [
      { t: 'siegpunkte', je: 'ruine', pro: 2 },
      { t: 'siebenGabe', anzahl: 2 },
    ],
  },

  // --- legendaer: Wert 22 bis 30 --------------------------------------------
  {
    id: 'der_fund',
    name: 'Uralter Hain',
    rarity: 'legendaer',
    text: 'Nimm 6 zufaellige Rohstoffe. Waelder liefern dir dauerhaft +2 Holz.',
    instant: { t: 'gainAny', count: 6 },
    lasting: { t: 'terrainBonus', terrain: 'forest', amount: 2 },
  },
  {
    id: 'goldene_ernte',
    name: 'Goldene Ernte',
    rarity: 'legendaer',
    text: 'Nimm 3 Getreide. Felder liefern dir dauerhaft +2 Getreide, Weiden +1 Wolle.',
    instant: { t: 'gain', resources: { grain: 3 } },
    lasting: [
      { t: 'terrainBonus', terrain: 'field', amount: 2 },
      { t: 'terrainBonus', terrain: 'pasture', amount: 1 },
    ],
  },

  {
    id: 'grosse_bauhuette',
    name: 'Grosse Bauhuette',
    rarity: 'legendaer',
    text: 'Jede eigene Stadt zaehlt einen Siegpunkt mehr.',
    lasting: { t: 'siegpunkte', je: 'stadt', pro: 1 },
  },

  // --- Taktiken: ausspielen, dann verbraucht -------------------------------
  {
    id: 'heilkraeuter',
    name: 'Heilkraeuter',
    rarity: 'gewoehnlich',
    kind: 'taktik',
    text: 'Heile einen Helden um 2 Leben. Nur ausserhalb eines Kampfes.',
    tactic: { t: 'healUnit', amount: 2, heroOnly: true, value: 4 },
  },
  {
    id: 'feldscher',
    name: 'Feldscher',
    rarity: 'ungewoehnlich',
    kind: 'taktik',
    text: 'Alle eigenen Einheiten auf einem Feld heilen 1 Leben.',
    tactic: { t: 'healField', amount: 1, value: 7 },
  },
  {
    id: 'schildwall',
    name: 'Schildwall',
    rarity: 'ungewoehnlich',
    kind: 'taktik',
    text: 'Die Truppen auf einem Feld erhalten in den naechsten Kampfrunden +1 Deckung.',
    tactic: { t: 'cover', amount: 1, value: 8 },
  },
  {
    id: 'sammeln',
    name: 'Sammeln!',
    rarity: 'ungewoehnlich',
    kind: 'taktik',
    text: 'Die Truppen auf einem Feld ignorieren in den naechsten Kampfrunden die Moral.',
    tactic: { t: 'morale', value: 7 },
  },
  {
    id: 'schlachtruf',
    name: 'Schlachtruf',
    rarity: 'selten',
    kind: 'taktik',
    text: 'Die Truppen auf einem Feld erhalten in den naechsten Kampfrunden +1 Angriff.',
    tactic: { t: 'attack', amount: 1, value: 11 },
  },
  {
    id: 'belagerungsplan',
    name: 'Belagerungsplan',
    rarity: 'selten',
    kind: 'taktik',
    text: 'Die Truppen auf einem Feld ignorieren in den naechsten Kampfrunden die Palisade eines Lagers - nicht die einer Spielerpartei.',
    tactic: { t: 'siege', value: 10 },
  },
  {
    id: 'feuerpfeile',
    name: 'Feuerpfeile',
    rarity: 'selten',
    kind: 'taktik',
    text: 'Ein Bogenschuetze erhaelt beim naechsten Beschuss +1 Angriff.',
    tactic: { t: 'rangedAttack', amount: 1, value: 10 },
  },
  {
    id: 'glueck_des_hauses',
    name: 'Glueck des Hauses',
    rarity: 'episch',
    kind: 'taktik',
    text: 'Ein Held wiederholt seinen naechsten misslungenen Angriffswurf.',
    tactic: { t: 'heroReroll', value: 16 },
  },
  {
    id: 'letztes_aufgebot',
    name: 'Letztes Aufgebot',
    rarity: 'legendaer',
    kind: 'taktik',
    text: 'Die Truppen auf einem Feld erhalten +1 Angriff und ignorieren in den naechsten Kampfrunden die Moral.',
    tactic: [
      { t: 'attack', amount: 1, value: 14 },
      { t: 'morale', value: 8 },
    ],
  },
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function cardById(id: string): Card | undefined {
  return BY_ID.get(id);
}
