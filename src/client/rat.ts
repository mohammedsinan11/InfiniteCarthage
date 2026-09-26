/**
 * Der Rat: "Was jetzt?" in einem Satz.
 *
 * Die Spieltests fanden immer wieder dieselbe Stelle: man steht vor der
 * Karte und weiss nicht, was als Naechstes sinnvoll ist. Die Bots wissen es -
 * core/bot.ts waehlt jeden Zug nach einfachen, festen Vorlieben. Der Rat
 * fragt dieselbe Logik fuer den eigenen Platz und uebersetzt die Antwort in
 * Worte, mit einer Stelle auf der Karte, wenn es eine gibt (OVERHAUL.md,
 * Abschnitt 2).
 *
 * Nur ein Vorschlag, keine Aktion: gespielt wird nichts. Der Client kennt die
 * fremden Haende nicht - fuer die eigenen Zuege braucht die Botlogik sie auch
 * nicht. Geht dabei etwas schief, gibt es eben keinen Rat.
 */

import { botAktion } from '../core/bot';
import { parseEdgeKey, parseVertexKey, vertexAdjacentHexes } from '../core/coords';
import type { PublicState } from '../core/redact';
import type { GameState } from '../core/state';
import type { World } from '../core/world';
import { tradeRatio } from '../core/rules/trade';
import { resourceName } from './log';
import { limitFor } from '../core/rules/handlimit';

export type Rat = { text: string; ort?: { q: number; r: number } };

const eckeOrt = (vk: string) => vertexAdjacentHexes(parseVertexKey(vk))[0];

export function ratschlag(state: PublicState, world: World, you: string): Rat | null {
  // Zuerst, was ein Bot nicht wichtig nimmt, Neue aber teuer zu stehen kommt.
  const me = state.players.find((p) => p.id === you);
  if (me?.hand && state.phase.t === 'main') {
    const karten = Object.values(me.hand).reduce((n, x) => n + x, 0);
    const grenze = limitFor(state, you);
    if (karten > grenze) {
      return {
        text: `Du haeltst ${karten} Karten, erlaubt sind ${grenze}: baue oder tausche, sonst nehmen Pluenderer die Haelfte.`,
      };
    }
    if (me.loot > 0) return { text: 'Loese deine Beute ein: eine Kartenwahl (Knopf Beute unten).' };
  }
  let a;
  try {
    a = botAktion(state as unknown as GameState, world, you);
  } catch {
    return null;
  }
  if (!a) return null;
  switch (a.t) {
    case 'roll':
      return { text: 'Wuerfle - vorher gibt es nichts zu bauen.' };
    case 'buildSettlement':
    case 'placeSettlement':
      return { text: 'Baue ein Dorf - hier liegt ein guter Platz.', ort: eckeOrt(a.vertex) };
    case 'buildCity':
      return { text: 'Werte dieses Dorf zur Stadt auf: doppelter Ertrag, zwei Siegpunkte.', ort: eckeOrt(a.vertex) };
    case 'buildRoad':
    case 'placeRoad': {
      const k = parseEdgeKey(a.edge);
      return { text: 'Baue eine Strasse - Richtung eines neuen Bauplatzes.', ort: { q: k.q, r: k.r } };
    }
    case 'buildWonder':
      return { text: 'Errichte hier das Weltwunder!', ort: { q: a.q, r: a.r } };
    case 'bankTrade':
      return {
        text: `Tausche bei der Bank ${tradeRatio(state as unknown as GameState, world, you, a.give)}x ${resourceName(a.give)} gegen 1 ${resourceName(a.receive)} - dann reicht es fuer den naechsten Bau.`,
      };
    case 'buyDev':
      return { text: 'Kaufe eine Entwicklungskarte - Ritter, Fortschritt oder Siegpunkte.' };
    case 'recruitKnight':
      return { text: 'Wirb einen Ritter an: er haelt Raubzuege auf und zerstoert Lager.' };
    case 'orderUnits':
      return { text: 'Schick dein Heer hierher.', ort: { q: a.q, r: a.r } };
    case 'explore':
      return { text: 'Schick deinen Helden auf Erkundung - er findet Ruinen und neues Land.' };
    case 'claimLoot':
      return { text: 'Loese deine Beute ein: eine Kartenwahl (Knopf Beute unten).' };
    case 'chooseAmbition':
      return { text: 'Waehle ein Vorhaben fuer diese Jahreszeit - beim Kanzler im Menue.' };
    case 'answerEvent':
    case 'chooseCard':
    case 'chooseHouse':
      return { text: 'Eine Wahl wartet auf dich - entscheide sie zuerst.' };
    case 'endTurn':
      return { text: 'Nichts Dringendes: beende den Zug und spare fuer den naechsten Bau.' };
    default:
      return null;
  }
}
