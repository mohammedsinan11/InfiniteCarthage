/**
 * Tipps: eine Zeile Erklaerung, wenn etwas zum ersten Mal passiert.
 *
 * Das Spiel hat viele Systeme - Karten, Nacht, Feuer, Pluenderer, Auftraege,
 * Held - und alle laufen ab Runde 1 (IDEEN.md, Spielbarkeit 2). Statt eines
 * Lehrgangs vorab erklaert es sie dort, wo man ihnen begegnet: beim ersten
 * Fund, beim ersten Feuer, bei der ersten Horde. Jeder Tipp erscheint je
 * Browser genau einmal; wer alles kennt, sieht keinen mehr.
 *
 * Nur Oberflaeche: die Regeln wissen nichts davon.
 */

import type { GameEvent } from '../core/rules/reducer';
import type { PlayerId } from '../core/state';

const SPEICHER = 'infinitecarthage.tipps';

export type Tipp = { id: string; titel: string; text: string };

export const TIPPS: Record<string, Omit<Tipp, 'id'>> = {
  aufbau: {
    titel: 'Der Aufbau',
    text: 'Setze zwei Doerfer und je eine Strasse. Die Sterne ★ zeigen gute Plaetze.',
  },
  wuerfeln: {
    titel: 'Wuerfeln und Ertrag',
    text: 'Der Wuerfel verteilt Ertrag an Doerfer (1) und Staedte (2) - und beendet deinen Zug. Dorf = 1 Punkt, Stadt = 2.',
  },
  fund: {
    titel: 'Eine 7 ist ein Fund',
    text: 'Nimm eine von drei Karten. Dauerkarten wirken bis zum Ende der Partie.',
  },
  pluenderung: {
    titel: 'Pluenderer',
    text: 'Pluenderer nehmen Karten. Ritter und Tuerme halten sie auf - oder verbaue deine Karten rechtzeitig.',
  },
  feuer: {
    titel: 'Feuer!',
    text: 'Es brennt! Klicke das Feuer an und loesche es mit einer Karte, oder stelle einen Ritter daneben - du hast einen Zug.',
  },
  nacht: {
    titel: 'Die Nacht',
    text: 'Nachts sieht man weniger, und Goblins ziehen in Horden los.',
  },
  beute: {
    titel: 'Beute',
    text: 'Du hast Beute: der Knopf "Beute" unten gibt dir eine Kartenwahl.',
  },
  auftrag: {
    titel: 'Ein Wanderer bittet um Hilfe',
    text: 'Ein Wanderer bietet einen Auftrag an - bei der Seherin im Menue.',
  },
  hilfe: {
    titel: 'Wanderhaendler',
    text: 'Diese Sorte hast du an keinem Dorf. Wanderhaendler bringen sie ab und zu; besser ist ein Dorf an einem passenden Feld.',
  },
  held: {
    titel: 'Dein Held',
    text: 'Oben links steht dein Held: anklicken, dann "Erkunden".',
  },
};

function gesehen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SPEICHER) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function tippGesehen(id: string): void {
  try {
    const s = gesehen();
    s.add(id);
    localStorage.setItem(SPEICHER, JSON.stringify([...s]));
  } catch {
    // Privater Modus - dann kommt der Tipp beim naechsten Mal wieder.
  }
}

/** Alle Tipps wieder zeigen (Optionen). */
export function tippsZuruecksetzen(): void {
  try {
    localStorage.removeItem(SPEICHER);
  } catch {
    // nichts zu tun
  }
}

/** Welche Tipps diese Ereignisse ausloesen - nur noch nicht gesehene, jeder hoechstens einmal. */
export function tippsAus(
  events: readonly GameEvent[],
  you: PlayerId | null,
  schonInWarteschlange: readonly string[] = [],
): Tipp[] {
  if (!you) return [];
  const alt = gesehen();
  const neu: string[] = [];
  const dazu = (id: string) => {
    if (!alt.has(id) && !neu.includes(id) && !schonInWarteschlange.includes(id)) neu.push(id);
  };
  for (const e of events) {
    switch (e.t) {
      case 'houseChosen':
        if (e.player === you) dazu('aufbau');
        break;
      case 'heroReady':
        if (e.player === you) {
          dazu('wuerfeln');
          dazu('held');
        }
        break;
      case 'draftOffered':
        if (e.player === you && e.source === 'fund') dazu('fund');
        break;
      case 'plunder':
        if (e.player === you) dazu('pluenderung');
        break;
      case 'burn':
        if (e.player === you) dazu('feuer');
        break;
      case 'horde':
      case 'slimes':
        dazu('nacht');
        break;
      case 'questOffered':
        if (e.player === you) dazu('auftrag');
        break;
      case 'aid':
        if (e.player === you) dazu('hilfe');
        break;
      case 'nestDestroyed':
        if (e.players.includes(you)) dazu('beute');
        break;
      case 'ruin':
        if (e.player === you && e.result === 'beute') dazu('beute');
        break;
      default:
        break;
    }
  }
  return neu.map((id) => ({ id, ...TIPPS[id]! }));
}
