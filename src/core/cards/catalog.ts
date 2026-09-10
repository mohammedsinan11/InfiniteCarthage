/**
 * Der Kartenkatalog.
 *
 * Ein erster Satz zum Ausprobieren, keine ausbalancierte Sammlung. Er soll
 * zeigen, ob das Geruest traegt: Sofortwirkung, Dauerwirkung, beides, und
 * eine Karte, bei der man ueberlegen muss, ob man sie ueberhaupt will.
 *
 * Kennungen sind Zeichenketten und wandern in den Spielstand. Sie duerfen
 * sich nie aendern - sonst verlieren gespeicherte Partien ihre Karten.
 */

import type { Card } from './types';

export const CARDS: readonly Card[] = [
  // --- gewoehnlich ---------------------------------------------------------
  {
    id: 'ernte',
    name: 'Reiche Ernte',
    rarity: 'gewoehnlich',
    text: 'Nimm 3 Getreide.',
    instant: { t: 'gain', resources: { grain: 3 } },
  },
  {
    id: 'holzlager',
    name: 'Holzfaellerlager',
    rarity: 'gewoehnlich',
    text: 'Waelder liefern dir dauerhaft +1 Holz.',
    lasting: { t: 'terrainBonus', terrain: 'forest', amount: 1 },
  },
  {
    id: 'handelsposten',
    name: 'Handelsposten',
    rarity: 'gewoehnlich',
    text: 'Bankhandel kostet dich dauerhaft eine Karte weniger.',
    lasting: { t: 'tradeDiscount', amount: 1 },
  },
  {
    id: 'lehmgrube',
    name: 'Lehmgrube',
    rarity: 'gewoehnlich',
    text: 'Nimm 2 Lehm.',
    instant: { t: 'gain', resources: { brick: 2 } },
  },

  // --- ungewoehnlich -------------------------------------------------------
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
    text: 'Du darfst dauerhaft 3 Karten mehr halten, bevor du abwirfst.',
    lasting: { t: 'handLimit', amount: 3 },
  },
  {
    id: 'wanderhaendler',
    name: 'Wanderhaendler',
    rarity: 'ungewoehnlich',
    text: 'Nimm 4 beliebige Rohstoffe.',
    instant: { t: 'gainAny', count: 4 },
  },

  // --- selten --------------------------------------------------------------
  {
    id: 'muehlen',
    name: 'Muehlen am Fluss',
    rarity: 'selten',
    text: 'Nimm 2 Getreide. Felder liefern dir dauerhaft +1 Getreide.',
    instant: { t: 'gain', resources: { grain: 2 } },
    lasting: { t: 'terrainBonus', terrain: 'field', amount: 1 },
  },
  {
    id: 'ziegelei',
    name: 'Ziegelei',
    rarity: 'selten',
    text: 'Nimm 2 Lehm. Huegel liefern dir dauerhaft +1 Lehm.',
    instant: { t: 'gain', resources: { brick: 2 } },
    lasting: { t: 'terrainBonus', terrain: 'hill', amount: 1 },
  },
  {
    id: 'karge_jahre',
    name: 'Karge Jahre',
    rarity: 'selten',
    text: 'Nimm 6 beliebige Rohstoffe. Weiden liefern dir dauerhaft 1 weniger.',
    instant: { t: 'gainAny', count: 6 },
    lasting: { t: 'terrainBonus', terrain: 'pasture', amount: -1 },
  },
  {
    id: 'markttag',
    name: 'Markttag',
    rarity: 'selten',
    text: 'Bankhandel kostet dich dauerhaft zwei Karten weniger.',
    lasting: { t: 'tradeDiscount', amount: 2 },
  },

  // --- episch --------------------------------------------------------------
  {
    id: 'grosse_scheune',
    name: 'Grosse Scheune',
    rarity: 'episch',
    text: 'Nimm 5 beliebige Rohstoffe. Du darfst dauerhaft 5 Karten mehr halten.',
    instant: { t: 'gainAny', count: 5 },
    lasting: { t: 'handLimit', amount: 5 },
  },
  {
    id: 'erzader',
    name: 'Reiche Erzader',
    rarity: 'episch',
    text: 'Berge liefern dir dauerhaft +2 Erz.',
    lasting: { t: 'terrainBonus', terrain: 'mountain', amount: 2 },
  },

  // --- legendaer -----------------------------------------------------------
  {
    id: 'der_fund',
    name: 'Der Fund',
    rarity: 'legendaer',
    text: 'Nimm 8 beliebige Rohstoffe. Waelder liefern dir dauerhaft +2 Holz.',
    instant: { t: 'gainAny', count: 8 },
    lasting: { t: 'terrainBonus', terrain: 'forest', amount: 2 },
  },
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function cardById(id: string): Card | undefined {
  return BY_ID.get(id);
}
