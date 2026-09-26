/**
 * Kunde aus dem Land: was in einer Jahreszeit geschah, in ein paar Saetzen
 * (OVERHAUL.md, Abschnitt 1 - "a season report").
 *
 * Die Welt tut vieles, das man nicht sieht: Fehden, Feste, eroberte Lager,
 * gefallene Anfuehrer, Raubzuege gegen andere Haeuser. Ein Saisonbuch
 * sammelt es mit, und zum Wechsel der Jahreszeit schreibt der Chronist daraus
 * eine Seite. So wird die verborgene Simulation zur Geschichte, und jede
 * Partie erzaehlt eine andere.
 *
 * Rein aus den Ereignissen, die ohnehin entstehen. Nur in Partien mit
 * Ereignissen. Die Berichte bleiben im Spielstand (fuer Chronik und Menue).
 */

import type { GameState, PlayerId } from './state';
import { fraktionIn } from './fraktionsleben';
import { genitiv, imSatz } from './factions';
import { SEASON_NAME, JAHRESZEIT_WIRKUNG, seasonOf, yearOf } from './season';
import type { Season } from './season';
import { WUNDER } from './wunder';
import type { WunderArt } from './wunder';

export type SaisonBuch = {
  ertrag: Record<PlayerId, number>;
  gepluendert: Record<PlayerId, number>;
  raubzuege: number;
  horden: number;
  braende: Record<PlayerId, number>;
  auftraege: Record<PlayerId, number>;
  /** Fertige Saetze fuer das Besondere, in der Reihenfolge des Geschehens. */
  besonderes: string[];
};

export type Bericht = { saison: Season; jahr: number; zeilen: string[] };

export type KundeEvent = { t: 'seasonReport'; bericht: Bericht };

const leer = (): SaisonBuch => ({ ertrag: {}, gepluendert: {}, raubzuege: 0, horden: 0, braende: {}, auftraege: {}, besonderes: [] });

type Ereignis = { t: string } & Record<string, unknown>;

const name = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)?.name ?? 'Jemand';
const frak = (s: GameState, id: string) => fraktionIn(s, id).name;
const add = (r: Record<string, number>, k: string, n: number) => ({ ...r, [k]: (r[k] ?? 0) + n });

/** Nach jeder Aktion: die Ereignisse ins Saisonbuch. */
export function kundeFortschreiben(s: GameState, geschehen: readonly Ereignis[]): void {
  if (!s.ereignisseAn) return;
  let b = s.saisonBuch ?? leer();
  const merke = (satz: string) => {
    if (!b.besonderes.includes(satz)) b = { ...b, besonderes: [...b.besonderes, satz] };
  };
  for (const e of geschehen) {
    switch (e.t) {
      case 'production':
        for (const [id, hand] of Object.entries(e.payout as Record<string, Record<string, number>>)) {
          b = { ...b, ertrag: add(b.ertrag, id, Object.values(hand).reduce((n, x) => n + x, 0)) };
        }
        break;
      case 'plunder':
        if ((e.count as number) > 0) b = { ...b, gepluendert: add(b.gepluendert, e.player as string, e.count as number) };
        break;
      case 'march':
        b = { ...b, raubzuege: b.raubzuege + ((e.parties as unknown[])?.length ?? 0) };
        break;
      case 'horde':
        b = { ...b, horden: b.horden + 1 };
        break;
      case 'burnedDown':
        b = { ...b, braende: add(b.braende, e.player as string, 1) };
        break;
      case 'questDone':
        b = { ...b, auftraege: add(b.auftraege, e.player as string, 1) };
        break;
      case 'nestDestroyed': {
        const wer = ((e.players as PlayerId[]) ?? []).map((id) => name(s, id)).join(' und ');
        if (wer) merke(`${wer} zerstoerte ein Lager ${genitiv(frak(s, e.fraktion as string))}.`);
        break;
      }
      case 'nestCaptured':
        merke(`Ein Lager wechselte den Besitzer: ${frak(s, e.an as string)} vertrieben ${imSatz(frak(s, e.von as string))}.`);
        break;
      case 'feud':
        merke(`Fehde im Land: ${imSatz(frak(s, e.fraktion as string))} gegen ${imSatz(frak(s, e.gegen as string))}.`);
        break;
      case 'feast':
        merke(`${frak(s, e.fraktion as string)} feierten ein grosses Fest.`);
        break;
      case 'chiefChanged':
        merke(`${e.alt} fiel; ${e.neu} fuehrt nun ${imSatz(frak(s, e.fraktion as string))}.`);
        break;
      case 'vendetta':
        merke(`${fraktionIn(s, e.fraktion as string).anfuehrer ?? frak(s, e.fraktion as string)} schwor ${name(s, e.player as string)} Rache.`);
        break;
      case 'nestRevived':
        merke(`${frak(s, e.fraktion as string)} bezogen ein verlassenes Lager neu.`);
        break;
      case 'wonder':
        merke(`${name(s, e.player as string)} errichtete ${WUNDER[e.art as WunderArt].name}.`);
        break;
      case 'pact':
        merke(
          e.art === 'frieden'
            ? `${name(s, e.player as string)} und ${imSatz(frak(s, e.fraktion as string))} schlossen Frieden.`
            : `${name(s, e.player as string)} zahlt Tribut an ${imSatz(frak(s, e.fraktion as string))}.`,
        );
        break;
      default:
        break;
    }
  }
  s.saisonBuch = b;
}

function meiste(r: Record<string, number>): [string, number] | null {
  const e = Object.entries(r).sort((a, c) => c[1] - a[1])[0];
  return e && e[1] > 0 ? e : null;
}

/**
 * Den Bericht fuer die abgelaufene Jahreszeit schreiben und das Buch leeren.
 * turn: die erste Runde der neuen Jahreszeit.
 */
export function kundeSchreiben(s: GameState, turn: number): Bericht | null {
  if (!s.ereignisseAn) return null;
  const b = s.saisonBuch ?? leer();
  const vorher = turn - 1;
  const saison = seasonOf(vorher);
  const jahr = yearOf(vorher);
  const zeilen: string[] = [];

  const ernte = meiste(b.ertrag);
  const summe = Object.values(b.ertrag).reduce((n, x) => n + x, 0);
  if (ernte && s.order.length > 1) zeilen.push(`Die reichste Ernte fuhr ${name(s, ernte[0])} ein: ${ernte[1]} Karten.`);
  else if (ernte) zeilen.push(summe >= 25 ? `Die Felder trugen gut: ${summe} Karten kamen herein.` : `Mager war die Ernte: ${summe} Karten.`);

  const opfer = meiste(b.gepluendert);
  if (b.raubzuege > 0) {
    zeilen.push(
      `${b.raubzuege} ${b.raubzuege === 1 ? 'Raubzug zog' : 'Raubzuege zogen'} durchs Land` +
        (opfer ? `; am schwersten traf es ${name(s, opfer[0])} mit ${opfer[1]} Karten.` : ', doch niemand verlor etwas.'),
    );
  } else {
    zeilen.push('Die Grenzen blieben ruhig - kein Raubzug brach auf.');
  }
  if (b.horden > 0) zeilen.push(`${b.horden === 1 ? 'Eine Horde kam' : `${b.horden} Horden kamen`} aus der Nacht.`);
  const brand = meiste(b.braende);
  if (brand) zeilen.push(`Feuer vernichtete ${brand[1]} ${brand[1] === 1 ? 'Bau' : 'Bauten'} bei ${name(s, brand[0])}.`);
  zeilen.push(...b.besonderes.slice(0, 5));
  const nach = seasonOf(turn);
  const wirkung = JAHRESZEIT_WIRKUNG[nach].text;
  zeilen.push(`Nun kommt der ${SEASON_NAME[nach]}${wirkung ? `: ${wirkung}` : '.'}`);

  s.saisonBuch = leer();
  const bericht: Bericht = { saison, jahr, zeilen };
  s.berichte = [...(s.berichte ?? []), bericht].slice(-12);
  return bericht;
}
