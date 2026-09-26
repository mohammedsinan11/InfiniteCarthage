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
    text: 'Setze zwei Doerfer und je eine Strasse. Gute Plaetze liegen an Feldern mit 6 und 8 (rote Zahlen) und an moeglichst verschiedenen Rohstoffen - die Sterne ★ zeigen dir einige davon. Fahre mit dem Zeiger ueber einen Platz, um seine Zahlen zu sehen.',
  },
  wuerfeln: {
    titel: 'Wuerfeln und Ertrag',
    text: 'Jede Runde wird gewuerfelt: jedes Feld mit dieser Zahl liefert an angrenzende Doerfer (1) und Staedte (2). Baue mit dem Ertrag unten Strassen, Doerfer und Staedte - jedes Dorf ist 1 Siegpunkt, jede Stadt 2.',
  },
  fund: {
    titel: 'Eine 7 ist ein Fund',
    text: 'Waehle eine von drei Karten. Dauerkarten wirken bis zum Ende der Partie, Sofortkarten geben gleich Rohstoffe. Taktikkarten spielst du spaeter im Kampf.',
  },
  pluenderung: {
    titel: 'Pluenderer',
    text: 'Raeuber und Goblins ziehen aus ihren Lagern zu deinen Siedlungen und nehmen Karten vom groessten Stapel. Wer mehr als die Handkartengrenze haelt, verliert die Haelfte. Ritter und Wachtuerme bei den Siedlungen halten sie auf - oder verbaue deine Karten rechtzeitig.',
  },
  feuer: {
    titel: 'Feuer!',
    text: 'Pluenderer haben Feuer gelegt. Du hast einen Zug Zeit: klicke das Feuer an und loesche es mit einer Karte, oder stelle einen Ritter oder den Helden daneben. Regen loescht auch. Sonst brennt es nieder.',
  },
  nacht: {
    titel: 'Die Nacht',
    text: 'Nachts sieht man weniger weit, Goblins ziehen in Horden los und Schleime kriechen aus dem Dunkel. Am Morgen werden die Schleime wieder friedlich.',
  },
  beute: {
    titel: 'Beute',
    text: 'Du hast Beute gemacht. Loese sie in deinem Zug ueber den Knopf "Beute" unten ein - jede Beute ist eine Kartenwahl.',
  },
  auftrag: {
    titel: 'Ein Wanderer bittet um Hilfe',
    text: 'Wanderer bieten Auftraege an: ein Lager zerstoeren, eine Ruine erkunden, Rohstoffe bringen. Wer einen erfuellt, bekommt eine Kartenwahl. Annehmen oder ablehnen bei der Seherin im Menue.',
  },
  hilfe: {
    titel: 'Wanderhaendler',
    text: 'An keinem deiner Doerfer liegt ein Feld fuer diese Sorte. Wanderhaendler bringen dir alle fuenf Runden eine davon - besser ist ein Dorf an einem passenden Feld. Auch der Bankhandel (Knopf mit den Pfeilen) hilft: 4 gleiche gegen 1 beliebige.',
  },
  held: {
    titel: 'Dein Held',
    text: 'Oben links steht dein Held. Klicke ihn an und schicke ihn mit "Erkunden" los: er deckt die Karte auf, findet Ruinen mit Schaetzen und kaempft besser als ein Ritter.',
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
