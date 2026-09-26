/**
 * Diplomatie: Frieden und Tribut mit Fraktionen.
 *
 * Bisher war jede Fraktion jedem feind. Jetzt kann ein Spieler mit einer
 * Fraktion ein Abkommen schliessen (state.ts, Abkommen). Solange es gilt, sind
 * beide einander nicht feind (core/combat.ts, feindlich) - das ist der ganze
 * Eingriff: Raubzuege und Horden dieser Fraktion suchen sich andere Ziele,
 * ihre Leute kaempfen nicht mit seinen Rittern, und seine Ritter nicht mit
 * ihnen. Ein Lager, mit dem man Frieden hat, laesst sich nicht zerstoeren.
 *
 *   FRIEDEN  Gaben: 2 Getreide, 2 Wolle. Gilt 20 Runden, dann ist wieder Krieg.
 *            Nur Raeuberbanden - Goblins schliessen keinen Frieden.
 *   TRIBUT   Sofort und zu Beginn jeder grossen Runde je eine Karte pro
 *            Siegpunkt (mindestens eine), vom groessten Stapel. Gilt, bis man
 *            den Krieg erklaert oder nicht zahlen kann. Raeuber wie Goblins
 *            nehmen ihn.
 *   KRIEG    Beendet jedes Abkommen, sofort und ohne Kosten.
 *
 * Abkommen gelten je Spieler: wer Frieden hat, schuetzt nur sich.
 */

import { abkommenVon } from '../combat';
import { fraktionById, istFraktion, wesenVon } from '../factions';
import { handSize, playerById, publicPoints } from '../state';
import type { Abkommen, GameState, PlayerId } from '../state';
import { RESOURCES } from '../types';
import { canAfford, pay } from './costs';
import type { Cost } from './costs';
import { takeFromLargest } from './raid';

export const FRIEDEN_PREIS: Cost = { grain: 2, wool: 2 };
export const FRIEDEN_RUNDEN = 20;
/** Mindestens so viele Karten je Zahlung. */
export const TRIBUT_KARTEN = 1;

/**
 * Was ein Tribut kostet: eine Karte je Siegpunkt, mindestens TRIBUT_KARTEN.
 *
 * Fest eine Karte war fuer jedes Reich gleich billig - wer 20 Doerfer hatte,
 * kaufte sich fuer eine Karte je fuenf Runden von allen Raubzuegen frei, und
 * das ganze Heer war wirtschaftlich sinnlos. So bleibt Tribut der Rettungsring
 * des kleinen Reichs (1 bis 3 Karten) und wird fuer ein grosses eine echte
 * Steuer, gegen die sich ein Heer wieder rechnen kann.
 */
export const tributKarten = (
  s: Pick<GameState, 'buildings' | 'ruhmreichster' | 'hauptstaedte'> & { worldSeed?: number },
  player: PlayerId,
  fraktion?: string,
): number => {
  // Kraemerische Fraktionen (core/factions.ts) nehmen eine Karte weniger.
  const rabatt = fraktion && s.worldSeed !== undefined && wesenVon(s.worldSeed, fraktion) === 'kraemerisch' ? 1 : 0;
  return Math.max(TRIBUT_KARTEN, publicPoints(s, player) - rabatt);
};

export type Verhandlung = 'frieden' | 'tribut' | 'krieg';

export type DiplomatieEvent =
  | { t: 'pact'; player: PlayerId; fraktion: string; art: Abkommen['art']; bis: number | null }
  | {
      t: 'war';
      player: PlayerId;
      fraktion: string;
      grund: 'erklaert' | 'abgelaufen' | 'unbezahlt';
    }
  | { t: 'tribute'; player: PlayerId; fraktion: string; count: number };

type Ereignisse = { push(...e: DiplomatieEvent[]): number };

/** Nimmt diese Fraktion Frieden an? Nur Raeuberbanden. */
export const nimmtFrieden = (seed: number, fraktion: string): boolean => {
  const f = fraktionById(seed, fraktion);
  return f.art === 'raeuber' || (f.art === 'goblin' && f.wesen === 'kraemerisch');
};

/** Tribut vom groessten Stapel an die Bank. Liefert die Kartenzahl, 0 wenn die Hand nicht reicht. */
function zahleTribut(s: GameState, player: PlayerId, fraktion: string): number {
  const p = playerById(s, player);
  const preis = tributKarten(s, player, fraktion);
  if (!p || handSize(p.hand) < preis) return 0;
  const genommen = takeFromLargest(p.hand, preis);
  for (const r of RESOURCES) {
    p.hand[r] -= genommen[r];
  }
  return preis;
}

/** Ein Abkommen schliessen oder beenden. null bei Erfolg, sonst der Grund. */
export function verhandeln(
  s: GameState,
  actor: PlayerId,
  fraktion: string,
  art: Verhandlung,
  events: Ereignisse,
): string | null {
  if (!istFraktion(fraktion)) return 'Diese Fraktion gibt es nicht.';
  const p = playerById(s, actor);
  if (!p) return 'Unbekannter Spieler.';
  const bisher = abkommenVon(s, actor, fraktion);

  if (art === 'krieg') {
    if (!bisher) return 'Mit dieser Fraktion herrscht schon Krieg.';
    s.abkommen = s.abkommen.filter((a) => a !== bisher);
    events.push({ t: 'war', player: actor, fraktion, grund: 'erklaert' });
    return null;
  }
  if (art !== 'frieden' && art !== 'tribut') return 'Unbekanntes Abkommen.';
  if (bisher?.art === art) return art === 'frieden' ? 'Es herrscht schon Frieden.' : 'Du zahlst schon Tribut.';

  if (art === 'frieden') {
    if (!nimmtFrieden(s.worldSeed, fraktion)) return 'Dieser Stamm schliesst keinen Frieden - er nimmt nur Tribut.';
    if (!canAfford(p.hand, FRIEDEN_PREIS)) return 'Fuer den Frieden fehlen dir die Gaben.';
    pay(p.hand, FRIEDEN_PREIS);
  } else if (zahleTribut(s, actor, fraktion) === 0) {
    return `Fuer den Tribut fehlen dir Karten (${tributKarten(s, actor, fraktion)} noetig).`;
  }

  s.abkommen = s.abkommen.filter((a) => a !== bisher);
  const neu: Abkommen = {
    player: actor,
    fraktion,
    art,
    seit: s.turn,
    bis: art === 'frieden' ? s.turn + FRIEDEN_RUNDEN : null,
  };
  s.abkommen.push(neu);
  events.push({ t: 'pact', player: actor, fraktion, art, bis: neu.bis });
  return null;
}

/** Nach jeder Runde: abgelaufener Frieden wird wieder Krieg. */
export function abkommenRunde(s: GameState, events: Ereignisse): void {
  if (s.abkommen.length === 0) return;
  s.abkommen = s.abkommen.filter((a) => {
    if (a.bis === null || s.turn <= a.bis) return true;
    events.push({ t: 'war', player: a.player, fraktion: a.fraktion, grund: 'abgelaufen' });
    return false;
  });
}

/** Zu Beginn jeder grossen Runde: Tribut zahlen - oder es ist Krieg. */
export function tributRunde(s: GameState, events: Ereignisse): void {
  s.abkommen = s.abkommen.filter((a) => {
    if (a.art !== 'tribut') return true;
    const gezahlt = zahleTribut(s, a.player, a.fraktion);
    if (gezahlt > 0) {
      events.push({ t: 'tribute', player: a.player, fraktion: a.fraktion, count: gezahlt });
      return true;
    }
    events.push({ t: 'war', player: a.player, fraktion: a.fraktion, grund: 'unbezahlt' });
    return false;
  });
}
