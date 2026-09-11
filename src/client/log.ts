/**
 * Ereignisse in Klartext. Liegt im Client, weil es reine Darstellung ist -
 * der Server schickt Ereignisse, keine Saetze.
 */

import type { GameEvent } from '../core/rules/reducer';
import type { PublicState } from '../core/redact';
import type { Bundle, Resource } from '../core/types';
import { cardById } from '../core/cards/catalog';

const RES_NAME: Record<Resource, string> = {
  lumber: 'Holz',
  wool: 'Wolle',
  grain: 'Getreide',
  brick: 'Lehm',
  ore: 'Erz',
};

const DEV_NAME = {
  knight: 'Ritter',
  victoryPoint: 'Siegpunkt',
  roadBuilding: 'Strassenbau',
  yearOfPlenty: 'Erfindung',
  monopoly: 'Monopol',
} as const;

const BUILD_NAME = { road: 'Strasse', settlement: 'Siedlung', city: 'Stadt' } as const;

const FEIND = { raeuber: 'Raeuber', goblin: 'Goblin' } as const;

export const resourceName = (r: Resource): string => RES_NAME[r];
export const devName = (d: keyof typeof DEV_NAME): string => DEV_NAME[d];

function who(state: PublicState | null, id: string): string {
  return state?.players.find((p) => p.id === id)?.name ?? 'Jemand';
}

/** Ein Rohstoffbuendel als Text, z.B. "2x Holz, 1x Erz". */
export function bundleText(b: Bundle): string {
  const parts = (Object.entries(b) as [Resource, number][])
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n}x ${RES_NAME[r]}`);
  return parts.length > 0 ? parts.join(', ') : 'nichts';
}

export function describeEvent(e: GameEvent, state: PublicState | null): string {
  switch (e.t) {
    case 'roll':
      return `${who(state, e.player)} wuerfelt ${e.dice[0]} + ${e.dice[1]} = ${e.dice[0] + e.dice[1]}.`;
    case 'production': {
      const parts = Object.entries(e.payout).map(([pid, hand]) => {
        const got = (Object.entries(hand) as [Resource, number][])
          .filter(([, n]) => n > 0)
          .map(([r, n]) => `${n}x ${RES_NAME[r]}`)
          .join(', ');
        return `${who(state, pid)}: ${got}`;
      });
      const short =
        e.shortfall.length > 0
          ? ` (Bank leer: ${e.shortfall.map((r) => RES_NAME[r]).join(', ')})`
          : '';
      return parts.length > 0 ? `Ertrag - ${parts.join(' | ')}${short}` : `Niemand bekommt etwas.${short}`;
    }
    case 'build':
      return `${who(state, e.player)} baut ${BUILD_NAME[e.kind]}.`;
    case 'knightReady':
      return `${who(state, e.player)} stellt einen Ritter auf.`;
    case 'march':
      return e.parties.length === 1
        ? `Ein Raubzug bricht auf (${FEIND[e.parties[0]!.kind]}).`
        : `${e.parties.length} Raubzuege brechen auf.`;
    case 'fight':
      return e.knightWon
        ? `Ein Ritter von ${e.owner ? who(state, e.owner) : 'niemandem'} schlaegt einen ${FEIND[e.foe]} (Wurf ${e.roll}).`
        : `Ein ${FEIND[e.foe]} bezwingt einen Ritter von ${e.owner ? who(state, e.owner) : 'niemandem'} (Wurf ${e.roll}).`;
    case 'plunder':
      return `Ein ${FEIND[e.kind]} pluendert ${who(state, e.player)}: ${e.count} ${e.count === 1 ? 'Karte' : 'Karten'}.`;
    case 'siege':
      return `Belagerung: ${e.hits} Treffer, ${e.knightsLost} Ritter gefallen, noch ${e.left} Verteidiger.`;
    case 'nestDestroyed':
      return `Ein ${e.kind === 'goblin' ? 'Goblinlager' : 'Raeuberlager'} faellt. Beute fuer ${e.players.map((p) => who(state, p)).join(', ') || 'niemanden'}.`;
    case 'ruin':
      switch (e.result) {
        case 'schatz':
          return `${who(state, e.player)} findet in einer Ruine ${bundleText(e.gained)}.`;
        case 'beute':
          return `${who(state, e.player)} findet in einer Ruine Beute.`;
        case 'karte':
          return `${who(state, e.player)} findet in einer Ruine eine alte Karte.`;
        case 'hinterhalt':
          return e.knightLost
            ? `Hinterhalt in einer Ruine - ein Ritter von ${who(state, e.player)} faellt.`
            : `Hinterhalt in einer Ruine - ${who(state, e.player)} wehrt ihn ab.`;
      }
      return '';
    case 'buyDev':
      return `${who(state, e.player)} kauft eine Entwicklungskarte.`;
    case 'playDev':
      return `${who(state, e.player)} spielt ${DEV_NAME[e.card]}.`;
    case 'yearOfPlenty':
      return `${who(state, e.player)} nimmt ${RES_NAME[e.a]} und ${RES_NAME[e.b]}.`;
    case 'monopoly':
      return `${who(state, e.player)} zieht ${e.taken}x ${RES_NAME[e.resource]} ein.`;
    case 'trade':
      return `${who(state, e.player)} tauscht ${e.ratio}x ${RES_NAME[e.give]} gegen ${RES_NAME[e.receive]}.`;
    case 'tradeOffer':
      return `${who(state, e.player)} bietet ${bundleText(e.give)} fuer ${bundleText(e.want)}.`;
    case 'tradeResponse':
      return e.accept
        ? `${who(state, e.player)} sagt zu.`
        : `${who(state, e.player)} lehnt ab.`;
    case 'tradeSettled':
      return `${who(state, e.from)} gibt ${bundleText(e.give)} an ${who(state, e.to)} und erhaelt ${bundleText(e.want)}.`;
    case 'tradeCancelled':
      return `${who(state, e.player)} zieht das Angebot zurueck.`;
    case 'largestArmy':
      return `${who(state, e.player)} hat die Groesste Rittermacht.`;
    case 'chunks':
      return e.coords.length === 1
        ? 'Die Karte waechst um ein Gebiet.'
        : `Die Karte waechst um ${e.coords.length} Gebiete.`;
    case 'turn':
      return `${who(state, e.player)} ist am Zug.`;
    case 'draftOffered':
      return `${who(state, e.player)} darf eine von drei Karten waehlen.`;
    case 'cardTaken':
      return `${who(state, e.player)} nimmt ${cardById(e.card)?.name ?? 'eine Karte'}.`;
    case 'win':
      return `${who(state, e.player)} gewinnt!`;
  }
}
