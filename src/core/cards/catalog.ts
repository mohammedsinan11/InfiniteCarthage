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
import { SIPPEN_BONI } from './sippen';
import { basisKennung, istPlus, verbessert } from './plus';
import { RELIKTE } from '../heldenpfad';

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

  {
    id: 'proviant',
    name: 'Proviant',
    rarity: 'gewoehnlich',
    text: 'Proviant fuer die Reise: nimm 2 Getreide, 1 Wolle und 1 Holz.',
    instant: { t: 'gain', resources: { grain: 2, wool: 1, lumber: 1 } },
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
  // Wildnis (cards/sippen.ts): fuer Helden, Ruinen und Wanderer.
  {
    id: 'spaeherpfad',
    name: 'Spaeherpfad',
    rarity: 'ungewoehnlich',
    text: 'Nimm 2 zufaellige Rohstoffe. Je 4 erkundete Ruinen: 1 Siegpunkt.',
    instant: { t: 'gainAny', count: 2 },
    lasting: { t: 'siegpunkte', je: 'ruine', pro: 4 },
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
    text: 'Nimm 2 Holz und 2 Lehm. Je 8 eigene Strassen: 1 Siegpunkt.',
    instant: { t: 'gain', resources: { lumber: 2, brick: 2 } },
    lasting: { t: 'siegpunkte', je: 'strasse', pro: 8 },
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
    nurBeute: true,
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
    id: 'schatzkarte',
    name: 'Schatzkarte',
    rarity: 'selten',
    text: 'Nimm 3 zufaellige Rohstoffe. Je 3 erkundete Ruinen: 1 Siegpunkt.',
    instant: { t: 'gainAny', count: 3 },
    lasting: { t: 'siegpunkte', je: 'ruine', pro: 3 },
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
    nurBeute: true,
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
  },  // --- ENGINE (ENGINE_KARTEN.md): Ausloeser, Zaehler, Regelbrueche --------
  // Ernte
  {
    id: 'saatgut', name: 'Saatgut', rarity: 'ungewoehnlich', wert: 8,
    text: 'Faellt eine 6 oder 8: +1 Zaehler. Felder liefern +1 je 5.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'wurf', zahlen: [6, 8] }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 5, max: 3, dann: { t: 'terrainBonus', terrain: 'field', amount: 1 } },
    ],
  },
  {
    id: 'erntedank', name: 'Erntedank', rarity: 'gewoehnlich', wert: 5,
    text: 'Jeder Jahreszeitwechsel: 2 Getreide und 1 Wolle.',
    lasting: { t: 'wenn', anlass: { bei: 'jahreszeit' }, dann: { t: 'gain', resources: { grain: 2, wool: 1 } } },
  },
  {
    id: 'kornspeicher', name: 'Kornspeicher', rarity: 'ungewoehnlich', wert: 8,
    text: 'Jede neue Stadt: +1 Zaehler. Jeder eigene Wurf: 1 Getreide je 2.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'stadt' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'wurf', wer: 'ich' }, dann: { t: 'gainJe', je: { aus: 'zaehler' }, pro: 2, max: 3, resource: 'grain' } },
    ],
  },
  {
    id: 'pflugschar', name: 'Pflugschar', rarity: 'selten', wert: 12,
    text: 'Felder liefern +1 je aktive Ernte-Karte.',
    lasting: { t: 'je', groesse: { aus: 'aktiv', sippe: 'ernte' }, pro: 1, max: 3, dann: { t: 'terrainBonus', terrain: 'field', amount: 1 } },
  },
  {
    id: 'fruchtwechsel', name: 'Fruchtwechsel', rarity: 'selten', wert: 12,
    text: 'Weiden liefern +1 je 3 genommene Ernte-Karten.',
    lasting: { t: 'je', groesse: { aus: 'sippe', sippe: 'ernte' }, pro: 3, max: 3, dann: { t: 'terrainBonus', terrain: 'pasture', amount: 1 } },
  },
  {
    id: 'gluecksklee', name: 'Gluecksklee', rarity: 'gewoehnlich', wert: 5,
    text: 'Faellt 2, 3, 11 oder 12: 2 zufaellige Rohstoffe.',
    lasting: { t: 'wenn', anlass: { bei: 'wurf', zahlen: [2, 3, 11, 12] }, dann: { t: 'gainAny', count: 2 } },
  },
  {
    id: 'dreschflegel', name: 'Dreschflegel', rarity: 'episch', wert: 18,
    text: 'Jedes Getreide aus Wuerfen: +1 Zaehler. Je 15: 1 Siegpunkt.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'ertrag', resource: 'grain' }, dann: { t: 'zaehler', amount: 'menge' } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 15, max: 4, dann: { t: 'punkte', amount: 1 } },
    ],
  },
  {
    id: 'doppeljoch', name: 'Doppeljoch', rarity: 'selten', wert: 11,
    text: 'Bei 2 und 12 liefern alle deine Felder dreifach.',
    lasting: { t: 'ertragMal', faktor: 3, zahlen: [2, 12] },
  },
  // Handel
  {
    id: 'zollstation', name: 'Zollstation', rarity: 'gewoehnlich', wert: 5,
    text: 'Jede Karawane: 1 zufaelliger Rohstoff mehr.',
    lasting: { t: 'wenn', anlass: { bei: 'karawane' }, dann: { t: 'gainAny', count: 1 } },
  },
  {
    id: 'wechselstube', name: 'Wechselstube', rarity: 'ungewoehnlich', wert: 8,
    text: 'Jeder Handel: +1 Zaehler. Je 4: Bankhandel 1 billiger.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'handel' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 4, max: 2, dann: { t: 'tradeDiscount', amount: 1 } },
    ],
  },
  {
    id: 'kontor', name: 'Kontor', rarity: 'ungewoehnlich', wert: 7,
    text: 'Jeder Handel: 1 Ruhm, hoechstens einmal je Zug.',
    lasting: { t: 'wenn', anlass: { bei: 'handel' }, dann: { t: 'ruhm', amount: 1 }, jeZug: 1 },
  },
  {
    id: 'seidenstrasse', name: 'Seidenstrasse', rarity: 'selten', wert: 13,
    text: 'Jede Karawane: +1 Zaehler. Je 3: 1 Siegpunkt.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'karawane' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 3, max: 5, dann: { t: 'punkte', amount: 1 } },
    ],
  },
  {
    id: 'gildenbrief', name: 'Gildenbrief', rarity: 'selten', wert: 11,
    text: 'Der Markt kostet 1 weniger je aktive Handel-Karte.',
    lasting: { t: 'je', groesse: { aus: 'aktiv', sippe: 'handel' }, pro: 1, max: 3, dann: { t: 'marktRabatt', amount: 1 } },
  },
  {
    id: 'pfandleiher', name: 'Pfandleiher', rarity: 'gewoehnlich', wert: 5,
    text: 'Nach jedem Marktbesuch: 2 zufaellige Rohstoffe.',
    lasting: { t: 'wenn', anlass: { bei: 'markt' }, dann: { t: 'gainAny', count: 2 } },
  },
  {
    id: 'wucherzins', name: 'Wucherzins', rarity: 'episch', wert: 17,
    text: 'Jeder Jahreszeitwechsel: 1 Rohstoff je 4 Handkarten.',
    lasting: { t: 'wenn', anlass: { bei: 'jahreszeit' }, dann: { t: 'gainJe', je: { aus: 'hand' }, pro: 4, max: 4 } },
  },
  {
    id: 'hafenmeister', name: 'Hafenmeister', rarity: 'selten', wert: 11,
    text: 'Nach einem Handel zu 2:1: 1 zufaelliger Rohstoff, zweimal je Zug.',
    lasting: { t: 'wenn', anlass: { bei: 'handel', kurs: 2 }, dann: { t: 'gainAny', count: 1 }, jeZug: 2 },
  },
  // Bau
  {
    id: 'wegezoll', name: 'Wegezoll', rarity: 'ungewoehnlich', wert: 8,
    text: 'Jede neue Strasse: +1 Zaehler. Jeder eigene Wurf: 1 Holz je 4.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'strasse' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'wurf', wer: 'ich' }, dann: { t: 'gainJe', je: { aus: 'zaehler' }, pro: 4, max: 3, resource: 'lumber' } },
    ],
  },
  {
    id: 'richtfest', name: 'Richtfest', rarity: 'gewoehnlich', wert: 5,
    text: 'Jedes neue Dorf: 1 Ruhm und 1 Lehm.',
    lasting: { t: 'wenn', anlass: { bei: 'dorf' }, dann: [{ t: 'ruhm', amount: 1 }, { t: 'gain', resources: { brick: 1 } }] },
  },
  {
    id: 'zunfthaus', name: 'Zunfthaus', rarity: 'ungewoehnlich', wert: 7,
    text: 'Staedte kosten dich 1 Getreide weniger.',
    lasting: { t: 'rabatt', bei: 'stadt', resource: 'grain', amount: 1 },
  },
  {
    id: 'steinmetz', name: 'Steinmetz', rarity: 'ungewoehnlich', wert: 7,
    text: 'Beim Stadtbau zaehlt Erz als Getreide.',
    lasting: { t: 'ersatz', von: 'ore', fuer: 'grain', bei: 'stadt' },
  },
  {
    id: 'bauboom', name: 'Bauboom', rarity: 'selten', wert: 12,
    text: 'Jedes Dorf und jede Stadt: +1 Zaehler. Jede Strasse: 1 Rohstoff je 3, zweimal je Zug.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'dorf' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'stadt' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'strasse' }, dann: { t: 'gainJe', je: { aus: 'zaehler' }, pro: 3, max: 3 }, jeZug: 2 },
    ],
  },
  {
    id: 'fachwerk', name: 'Fachwerk', rarity: 'selten', wert: 11,
    text: 'Je 4 eigene Strassen: Huegel liefern +1 Lehm.',
    lasting: { t: 'je', groesse: { aus: 'bau', art: 'strasse' }, pro: 4, max: 2, dann: { t: 'terrainBonus', terrain: 'hill', amount: 1 } },
  },
  {
    id: 'grundstein', name: 'Grundstein', rarity: 'episch', wert: 17,
    text: 'Jede neue Stadt bringt eine Kartenwahl.',
    lasting: { t: 'wenn', anlass: { bei: 'stadt' }, dann: { t: 'wahl', anzahl: 1 } },
  },
  {
    id: 'meilenstein', name: 'Meilenstein', rarity: 'gewoehnlich', wert: 5,
    text: 'Jede neue Strasse: 1 zufaelliger Rohstoff, einmal je Zug.',
    lasting: { t: 'wenn', anlass: { bei: 'strasse' }, dann: { t: 'gainAny', count: 1 }, jeZug: 1 },
  },
  // Krieg
  {
    id: 'kriegskasse', name: 'Kriegskasse', rarity: 'gewoehnlich', wert: 5,
    text: 'Jedes zerstoerte Lager: 3 zufaellige Rohstoffe.',
    lasting: { t: 'wenn', anlass: { bei: 'lager' }, dann: { t: 'gainAny', count: 3 } },
  },
  {
    id: 'veteranen', name: 'Veteranen', rarity: 'ungewoehnlich', wert: 7,
    text: 'Jeder gewonnene Kampf: deine Einheiten dort heilen 1.',
    lasting: { t: 'wenn', anlass: { bei: 'kampfSieg' }, dann: { t: 'heilen', amount: 1 } },
  },
  {
    id: 'blutzoll', name: 'Blutzoll', rarity: 'selten', wert: 12,
    text: 'Jeder gewonnene Kampf: +1 Zaehler. Je 5: 1 Siegpunkt.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'kampfSieg' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 5, max: 4, dann: { t: 'punkte', amount: 1 } },
    ],
  },
  {
    id: 'bollwerk', name: 'Bollwerk', rarity: 'ungewoehnlich', wert: 8,
    text: 'Jeder abgewehrte Raubzug: +1 Zaehler. Je 2: Pluenderer nehmen 1 weniger.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'raubzugAbgewehrt' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 2, max: 3, dann: { t: 'schutz', amount: 1 } },
    ],
  },
  {
    id: 'beutezug', name: 'Beutezug', rarity: 'selten', wert: 11,
    text: 'Jeder gewonnene Kampf: 1 Erz. Jedes zerstoerte Lager: 2 Ruhm.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'kampfSieg' }, dann: { t: 'gain', resources: { ore: 1 } } },
      { t: 'wenn', anlass: { bei: 'lager' }, dann: { t: 'ruhm', amount: 2 } },
    ],
  },
  {
    id: 'kriegsschmiede', name: 'Kriegsschmiede', rarity: 'selten', wert: 12,
    text: 'Berge liefern +1 Erz je aktive Krieg-Karte.',
    lasting: { t: 'je', groesse: { aus: 'aktiv', sippe: 'krieg' }, pro: 1, max: 3, dann: { t: 'terrainBonus', terrain: 'mountain', amount: 1 } },
  },
  {
    id: 'trommler', name: 'Trommler', rarity: 'gewoehnlich', wert: 5,
    text: 'Jeder Jahreszeitwechsel: 1 Ruhm.',
    lasting: { t: 'wenn', anlass: { bei: 'jahreszeit' }, dann: { t: 'ruhm', amount: 1 } },
  },
  {
    id: 'kopfgeld', name: 'Kopfgeld', rarity: 'episch', wert: 16,
    text: 'Jeder gewonnene Kampf: +1 Zaehler. Jeder eigene Wurf: 1 Rohstoff je 4.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'kampfSieg' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'wurf', wer: 'ich' }, dann: { t: 'gainJe', je: { aus: 'zaehler' }, pro: 4, max: 3 } },
    ],
  },
  // Wildnis
  {
    id: 'wegweiser', name: 'Wegweiser', rarity: 'gewoehnlich', wert: 5,
    text: 'Jede Ruine: 2 zufaellige Rohstoffe, der Held heilt 1.',
    lasting: { t: 'wenn', anlass: { bei: 'ruine' }, dann: [{ t: 'gainAny', count: 2 }, { t: 'heilen', amount: 1 }] },
  },
  {
    id: 'sammelbeutel', name: 'Sammelbeutel', rarity: 'ungewoehnlich', wert: 8,
    text: 'Jede Ruine: +1 Zaehler. Jeder Jahreszeitwechsel: 1 Rohstoff je Zaehler.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'ruine' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'jahreszeit' }, dann: { t: 'gainJe', je: { aus: 'zaehler' }, pro: 1, max: 5 } },
    ],
  },
  {
    id: 'fernweh', name: 'Fernweh', rarity: 'selten', wert: 12,
    text: 'Jeder erfuellte Auftrag bringt eine Kartenwahl.',
    lasting: { t: 'wenn', anlass: { bei: 'auftrag' }, dann: { t: 'wahl', anzahl: 1 } },
  },
  {
    id: 'sternkarte', name: 'Sternkarte', rarity: 'selten', wert: 12,
    text: 'Je 3 genommene Wildnis-Karten: 1 Siegpunkt.',
    lasting: { t: 'je', groesse: { aus: 'sippe', sippe: 'wildnis' }, pro: 3, max: 3, dann: { t: 'punkte', amount: 1 } },
  },
  {
    id: 'kraeuterkunde', name: 'Kraeuterkunde', rarity: 'gewoehnlich', wert: 4,
    text: 'Jeder Auftrag und jede Ruine: der Held heilt 2.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'auftrag' }, dann: { t: 'heilen', amount: 2 } },
      { t: 'wenn', anlass: { bei: 'ruine' }, dann: { t: 'heilen', amount: 2 } },
    ],
  },
  {
    id: 'lagerfeuer', name: 'Lagerfeuer', rarity: 'ungewoehnlich', wert: 7,
    text: 'Jeder Jahreszeitwechsel: alle deine Einheiten heilen 1, dazu 1 Wolle.',
    lasting: { t: 'wenn', anlass: { bei: 'jahreszeit' }, dann: [{ t: 'heilen', amount: 1 }, { t: 'gain', resources: { wool: 1 } }] },
  },
  {
    id: 'sagenschreiber', name: 'Sagenschreiber', rarity: 'episch', wert: 17,
    text: 'Jeder Auftrag, jede Ruine, jedes Lager: +1 Zaehler. Je 4: 1 Siegpunkt.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'auftrag' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'ruine' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'lager' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 4, max: 5, dann: { t: 'punkte', amount: 1 } },
    ],
  },
  // A5: mehr Legendaeres und Episches (Spieltest 11: dieselbe legendaere Karte in jeder Partie).
  {
    id: 'goldene_aehre', name: 'Goldene Aehre', rarity: 'legendaer', wert: 24,
    text: 'Faellt deine 6 oder 8: 2 Getreide. Felder liefern dir +1 Getreide.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'wurf', zahlen: [6, 8], wer: 'ich' }, dann: { t: 'gain', resources: { grain: 2 } } },
      { t: 'terrainBonus', terrain: 'field', amount: 1 },
    ],
  },
  {
    id: 'kaufmannsgilde', name: 'Kaufmannsgilde', rarity: 'legendaer', wert: 24,
    text: 'Bankhandel kostet eine Karte weniger. Jeder Handel zu 2:1 oder besser: 1 Ruhm, zweimal je Zug.',
    lasting: [
      { t: 'tradeDiscount', amount: 1 },
      { t: 'wenn', anlass: { bei: 'handel', kurs: 2 }, dann: { t: 'ruhm', amount: 1 }, jeZug: 2 },
    ],
  },
  {
    id: 'kathedrale', name: 'Kathedrale', rarity: 'legendaer', wert: 24,
    text: 'Je 4 eigene Strassen: 1 Siegpunkt (hoechstens 4). Jede neue Stadt: 2 Ruhm.',
    lasting: [
      { t: 'je', groesse: { aus: 'bau', art: 'strasse' }, pro: 4, max: 4, dann: { t: 'punkte', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'stadt' }, dann: { t: 'ruhm', amount: 2 } },
    ],
  },
  {
    id: 'heerbann', name: 'Heerbann', rarity: 'legendaer', wert: 23,
    text: 'Jeder gewonnene Kampf: 1 Ruhm. Jeder abgewehrte Raubzug: 3 zufaellige Rohstoffe.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'kampfSieg' }, dann: { t: 'ruhm', amount: 1 }, jeZug: 3 },
      { t: 'wenn', anlass: { bei: 'raubzugAbgewehrt' }, dann: { t: 'gainAny', count: 3 } },
    ],
  },
  {
    id: 'sternenpfad', name: 'Sternenpfad', rarity: 'legendaer', wert: 23,
    text: 'Jede erkundete Ruine und jeder erfuellte Auftrag: eine Kartenwahl und 1 Ruhm.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'ruine' }, dann: [{ t: 'wahl', anzahl: 1 }, { t: 'ruhm', amount: 1 }] },
      { t: 'wenn', anlass: { bei: 'auftrag' }, dann: [{ t: 'wahl', anzahl: 1 }, { t: 'ruhm', amount: 1 }] },
    ],
  },
  {
    id: 'zehntscheune', name: 'Zehntscheune', rarity: 'episch', wert: 17,
    text: 'Jeder Jahreszeitwechsel: 1 Getreide je eigene Stadt (hoechstens 5).',
    lasting: { t: 'wenn', anlass: { bei: 'jahreszeit' }, dann: { t: 'gainJe', je: { aus: 'bau', art: 'stadt' }, pro: 1, max: 5, resource: 'grain' } },
  },
  {
    id: 'gesandtschaft', name: 'Gesandtschaft', rarity: 'episch', wert: 16,
    text: 'Jeder Marktbesuch: +1 Zaehler. Je 3: 1 Siegpunkt (hoechstens 3).',
    lasting: [
      { t: 'wenn', anlass: { bei: 'markt' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 3, max: 3, dann: { t: 'punkte', amount: 1 } },
    ],
  },
  {
    id: 'feldlager', name: 'Feldlager', rarity: 'episch', wert: 15,
    text: 'Jeder bezwungene Boss: 3 Ruhm und eine Kartenwahl.',
    lasting: { t: 'wenn', anlass: { bei: 'bossBesiegt' }, dann: [{ t: 'ruhm', amount: 3 }, { t: 'wahl', anzahl: 1 }] },
  },
  {
    id: 'wegkreuz', name: 'Wegkreuz', rarity: 'episch', wert: 16,
    text: 'Jede angekommene Karawane: 1 zufaelliger Rohstoff und +1 Zaehler. Je 5: 1 Siegpunkt (hoechstens 3).',
    lasting: [
      { t: 'wenn', anlass: { bei: 'karawane' }, dann: [{ t: 'gainAny', count: 1 }, { t: 'zaehler', amount: 1 }] },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 5, max: 3, dann: { t: 'punkte', amount: 1 } },
    ],
  },
  {
    id: 'jagdglueck', name: 'Jagdglueck', rarity: 'selten', wert: 11,
    text: 'Bei jeder 7: +1 Zaehler. Je 3: Weiden liefern +1 Wolle.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'wurf', zahlen: [7] }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 3, max: 2, dann: { t: 'terrainBonus', terrain: 'pasture', amount: 1 } },
    ],
  },
  // --- SCHLUESSELKARTEN: eine im Kronplatz, jede mit einem Preis ----------
  {
    id: 'dorfidyll', name: 'Dorfidyll', rarity: 'legendaer', schluessel: true, wert: 28,
    text: 'Doerfer liefern 2, Staedte nichts.',
    lasting: { t: 'grundErtrag', dorf: 2, stadt: 0 },
  },
  {
    id: 'fuellhorn', name: 'Fuellhorn', rarity: 'legendaer', schluessel: true, wert: 28,
    text: 'Alle deine Ertraege doppelt. Die Bank handelt nicht mit dir.',
    lasting: [{ t: 'ertragMal', faktor: 2 }, { t: 'sperre', was: 'bank' }],
  },
  {
    id: 'siebenstern', name: 'Siebenstern', rarity: 'legendaer', schluessel: true, wert: 26,
    text: 'Faellt deine 7, liefert deine beste Zahl. Kein Fund bei deiner 7.',
    lasting: [{ t: 'siebenLiefert' }, { t: 'sperre', was: 'fund' }],
  },
  {
    id: 'ahnenmutter', name: 'Ahnenmutter', rarity: 'legendaer', schluessel: true, wert: 26,
    text: 'Jede Karte zaehlt fuer ihre Sippe doppelt, doch nur eine Sippe wirkt.',
    lasting: [{ t: 'sippeMal', sippe: 'alle', faktor: 2 }, { t: 'sippenPlatz', amount: -1 }],
  },
  {
    id: 'monopol', name: 'Handelsmonopol', rarity: 'legendaer', schluessel: true, wert: 26,
    text: 'Bankhandel 2:1 fuer alles. Felder und Weiden liefern nichts.',
    lasting: [{ t: 'kurs', ratio: 2 }, { t: 'ertragMal', faktor: 0, terrain: 'field' }, { t: 'ertragMal', faktor: 0, terrain: 'pasture' }],
  },
  {
    id: 'zinseszins', name: 'Zinseszins', rarity: 'legendaer', schluessel: true, wert: 26,
    text: 'Jeder eigene Wurf: 1 Rohstoff je 5 Handkarten. Du haeltst 3 Karten weniger.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'wurf', wer: 'ich' }, dann: { t: 'gainJe', je: { aus: 'hand' }, pro: 5, max: 4 } },
      { t: 'handLimit', amount: -3, stapelt: true },
    ],
  },
  {
    id: 'karawanserei', name: 'Karawanserei', rarity: 'legendaer', schluessel: true, wert: 27,
    text: 'Alle deine Wenn-Karten loesen doppelt aus. Keine Kartenwahl beim Stadtbau.',
    lasting: [{ t: 'nachhall' }, { t: 'sperre', was: 'gruendungswahl' }],
  },
  {
    id: 'metropole', name: 'Metropole', rarity: 'legendaer', schluessel: true, wert: 28,
    text: 'Staedte liefern 3, Doerfer nichts.',
    lasting: { t: 'grundErtrag', dorf: 0, stadt: 3 },
  },
  {
    id: 'koenigsweg', name: 'Koenigsweg', rarity: 'legendaer', schluessel: true, wert: 27,
    text: 'Je 3 eigene Strassen: 1 Siegpunkt. Du baust keine Staedte.',
    lasting: [
      { t: 'je', groesse: { aus: 'bau', art: 'strasse' }, pro: 3, max: 8, dann: { t: 'punkte', amount: 1 } },
      { t: 'sperre', was: 'stadt' },
    ],
  },
  {
    id: 'ziegelgold', name: 'Ziegelgold', rarity: 'legendaer', schluessel: true, wert: 26,
    text: 'Lehm zaehlt beim Bauen als jeder Rohstoff. Kein Markt.',
    lasting: [{ t: 'ersatz', von: 'brick', fuer: 'alle', bei: 'alle' }, { t: 'sperre', was: 'markt' }],
  },
  {
    id: 'raubritter', name: 'Raubritter', rarity: 'legendaer', schluessel: true, wert: 26,
    text: 'Pluenderer geben dir, was sie dir nehmen wuerden. Du baust keine Palisaden.',
    lasting: [{ t: 'beuteStattVerlust' }, { t: 'sperre', was: 'mauer' }],
  },
  {
    id: 'blutmond_krone', name: 'Blutrausch', rarity: 'legendaer', schluessel: true, wert: 25,
    text: 'Deine Wenn-Karten fuer gewonnene Kaempfe loesen doppelt aus. Kein Markt.',
    lasting: [{ t: 'nachhall', bei: 'kampfSieg' }, { t: 'sperre', was: 'markt' }],
  },
  {
    id: 'eiserne_krone', name: 'Eiserne Krone', rarity: 'legendaer', schluessel: true, wert: 27,
    text: 'Je 4 Ruhm: 1 Siegpunkt.',
    lasting: { t: 'je', groesse: { aus: 'ruhm' }, pro: 4, max: 6, dann: { t: 'punkte', amount: 1 } },
  },
  {
    id: 'weltenbaum', name: 'Weltenbaum', rarity: 'legendaer', schluessel: true, wert: 25,
    text: 'Jeder Jahreszeitwechsel loest alle deine Wenn-Karten aus.',
    lasting: { t: 'ausloeserJahr' },
  },
  {
    id: 'bund_der_sippen', name: 'Bund der Sippen', rarity: 'legendaer', schluessel: true, wert: 26,
    text: 'Drei Sippen wirken, doch keine erreicht die dritte Stufe.',
    lasting: [{ t: 'sippenPlatz', amount: 1 }, { t: 'sippenDeckel', ab: 6 }],
  },
  {
    id: 'nomadenherz', name: 'Nomadenherz', rarity: 'legendaer', schluessel: true, wert: 26,
    text: 'Jede Ruine und jeder Auftrag bringt eine Kartenwahl. Du baust keine Staedte.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'ruine' }, dann: { t: 'wahl', anzahl: 1 } },
      { t: 'wenn', anlass: { bei: 'auftrag' }, dann: { t: 'wahl', anzahl: 1 } },
      { t: 'sperre', was: 'stadt' },
    ],
  },
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
const SIPPEN_BY_ID = new Map<string, Card>(SIPPEN_BONI.map((c) => [c.id, c]));

const PLUS_BY_ID = new Map<string, Card>();
const RELIKT_BY_ID = new Map<string, Card>(RELIKTE.map((c) => [c.id, c]));

export function cardById(id: string): Card | undefined {
  // Verbesserte Karten (cards/plus.ts) heissen "kennung+" und entstehen bei Bedarf.
  if (istPlus(id)) {
    let c = PLUS_BY_ID.get(id);
    if (!c) {
      const basis = BY_ID.get(basisKennung(id));
      if (!basis) return undefined;
      c = verbessert(basis);
      PLUS_BY_ID.set(id, c);
    }
    return c;
  }
  // Die Sippenstufen (cards/sippen.ts) sind unsichtbare Karten - nicht im
  // Katalog, also nie im Angebot, aber fuer modifiersOf lesbar.
  // Relikte des Helden (core/heldenpfad.ts) - nie im Angebot, aber lesbar.
  return BY_ID.get(id) ?? SIPPEN_BY_ID.get(id) ?? RELIKT_BY_ID.get(id);
}
