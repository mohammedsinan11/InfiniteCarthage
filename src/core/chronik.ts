/**
 * Die Chronik einer Partie: was geschah, und wer wie weit kam.
 *
 * Bisher endete eine Partie mit einer Zeile ("X gewinnt!"). Gerade dort
 * entscheidet sich aber, ob jemand eine zweite anfaengt. Die Chronik haelt
 * fest, was die Schlussseite zeigt: den Punkteverlauf, eine Handvoll
 * Zahlen je Spieler und die Momente, an die man sich erinnert.
 *
 * Sie wird aus den Ereignissen fortgeschrieben, die applyAction ohnehin
 * erzeugt - an EINER Stelle nach jeder Aktion (rules/reducer.ts). Keine Regel
 * muss von ihr wissen.
 *
 * Oeffentlich wie das Protokoll: Ertrag, Bauten und Kaempfe sieht ohnehin
 * jeder. Deshalb stehen im Verlauf waehrend der Partie nur die SICHTBAREN
 * Punkte; verdeckte Siegpunktkarten kommen erst mit dem Schlusseintrag dazu,
 * wenn sie ohnehin aufgedeckt werden.
 *
 * Klein gehalten: der Verlauf wird je grosser Runde abgetastet, die Momente
 * sind gedeckelt. Auch eine Endlospartie waechst dadurch nur langsam.
 */

import { cardById } from './cards/catalog';
import { fraktionById } from './factions';
import { ereignisById } from './ereignis';
import { WUNDER } from './wunder';
import { SEASON_NAME, bigRoundChangedAt, roundOf, seasonOf, yearOf } from './season';
import { hausById } from './haus';
import { emptyHand, playerById, publicPoints, totalPoints } from './state';
import type { GameState, Hand, PlayerId } from './state';
import { RESOURCES } from './types';
import type { GameEvent } from './rules/reducer';

export type ChronikStats = {
  /** Was die Wuerfel eingebracht haben. */
  ertrag: Hand;
  strassen: number;
  doerfer: number;
  staedte: number;
  /** Genommene Karten aus Fund, Beute und Belohnung. */
  karten: number;
  /** Bankhandel und Handel mit Mitspielern. */
  handel: number;
  lager: number;
  ruinen: number;
  auftraege: number;
  /** An Pluenderer verlorene Karten. */
  gepluendert: number;
  /** Niedergebrannte Doerfer, Staedte und Strassen. */
  abgebrannt: number;
  heldGefallen: number;
};

export type MomentArt =
  | 'stadt'
  | 'hauptstadt'
  | 'karte'
  | 'lager'
  | 'horde'
  | 'brand'
  | 'held'
  | 'morast'
  | 'auftrag'
  | 'stufe'
  | 'sieg'
  | 'ende'
  /** Ein Reich verliert sein letztes Gebaeude oder geht unter (rules/untergang.ts). */
  | 'untergang'
  /** Eine Entscheidung in einem Ereignis (core/ereignis.ts). */
  | 'ereignis';

export type Moment = {
  turn: number;
  player: PlayerId | null;
  art: MomentArt;
  text: string;
};

export type Chronik = {
  /** Punkte je Spieler (in state.order) zu einer Runde. */
  verlauf: { turn: number; punkte: number[] }[];
  stats: Record<PlayerId, ChronikStats>;
  momente: Moment[];
};

/** So viele Momente bleiben stehen; aeltere fallen heraus. */
export const MAX_MOMENTE = 80;

export const leereStats = (): ChronikStats => ({
  ertrag: emptyHand(),
  strassen: 0,
  doerfer: 0,
  staedte: 0,
  karten: 0,
  handel: 0,
  lager: 0,
  ruinen: 0,
  auftraege: 0,
  gepluendert: 0,
  abgebrannt: 0,
  heldGefallen: 0,
});

export function neueChronik(state: Pick<GameState, 'players'>): Chronik {
  const stats: Record<PlayerId, ChronikStats> = {};
  for (const p of state.players) stats[p.id] = leereStats();
  return { verlauf: [], stats, momente: [] };
}

/**
 * Die Wertung einer Partie mit Rundengrenze (und fuer die Bestenliste).
 *
 * Bewusst einfach, damit man sie im Kopf nachrechnen kann: Siegpunkte zaehlen
 * zehnfach, Ruhm einfach. Wer gleich viele Punkte hat, trennt sich ueber
 * Kampf, Auftraege und Veteranen.
 */
export function wertung(state: GameState, id: PlayerId): number {
  const p = playerById(state, id);
  return totalPoints(state, id) * 10 + (p?.ruhm ?? 0);
}

function punkteZeile(state: GameState, verdeckt: boolean): number[] {
  return state.order.map((id) => (verdeckt ? totalPoints(state, id) : publicPoints(state, id)));
}

function nameVon(state: GameState, id: PlayerId | null): string {
  return (id && playerById(state, id)?.name) || 'Jemand';
}

/** Die Chronik zum Spielbeginn: der erste Punkt im Verlauf. */
export function chronikBeginnen(state: GameState): void {
  state.chronik ??= neueChronik(state);
  state.chronik.verlauf.push({ turn: state.turn, punkte: punkteZeile(state, false) });
}

/**
 * Nach jeder erfolgreichen Aktion: Ereignisse in Zahlen und Momente umsetzen.
 * Fehlt die Chronik (alter Spielstand), wird sie angelegt.
 */
export function chronikFortschreiben(state: GameState, events: readonly GameEvent[]): void {
  if (state.phase.t === 'setup') return;
  const c = (state.chronik ??= neueChronik(state));
  const stats = (id: PlayerId): ChronikStats => (c.stats[id] ??= leereStats());
  const moment = (player: PlayerId | null, art: MomentArt, text: string): void => {
    c.momente.push({ turn: state.turn, player, art, text });
  };

  for (const e of events) {
    switch (e.t) {
      case 'production':
        for (const [id, gain] of Object.entries(e.payout)) {
          const s = stats(id);
          for (const r of RESOURCES) s.ertrag[r] += gain[r];
        }
        break;
      case 'build': {
        const s = stats(e.player);
        if (e.kind === 'road') s.strassen += 1;
        else if (e.kind === 'settlement') s.doerfer += 1;
        else if (e.kind === 'city') {
          s.staedte += 1;
          if (s.staedte === 1) moment(e.player, 'stadt', `${nameVon(state, e.player)} baut die erste Stadt.`);
        }
        break;
      }
      case 'capital':
        moment(e.player, 'hauptstadt', `${nameVon(state, e.player)} gruendet eine Hauptstadt.`);
        break;
      case 'capitalUpgrade':
        moment(e.player, 'hauptstadt', `${nameVon(state, e.player)} baut die Hauptstadt aus (Stufe ${e.stufe}).`);
        break;
      case 'cardTaken': {
        stats(e.player).karten += 1;
        const karte = cardById(e.card);
        if (karte && (karte.rarity === 'episch' || karte.rarity === 'legendaer')) {
          const wie = karte.rarity === 'legendaer' ? 'die legendaere' : 'die epische';
          moment(e.player, 'karte', `${nameVon(state, e.player)} nimmt ${wie} Karte ${karte.name}.`);
        }
        break;
      }
      case 'trade':
        stats(e.player).handel += 1;
        break;
      case 'tradeSettled':
        stats(e.from).handel += 1;
        stats(e.to).handel += 1;
        break;
      case 'nestDestroyed': {
        for (const id of e.players) stats(id).lager += 1;
        const wer = e.players.map((id) => nameVon(state, id)).join(' und ') || 'Jemand';
        moment(e.players[0] ?? null, 'lager', `${wer} zerstoert ein Lager von ${fraktionById(state.worldSeed, e.fraktion).name}.`);
        break;
      }
      case 'ruin':
        stats(e.player).ruinen += 1;
        break;
      case 'questDone':
        stats(e.player).auftraege += 1;
        moment(e.player, 'auftrag', `${nameVon(state, e.player)} erfuellt einen Auftrag eines Wanderers.`);
        break;
      case 'plunder':
        stats(e.player).gepluendert += e.count;
        break;
      case 'horde': {
        // Nur die erste Horde je Stamm - unter dem Blutmond kaeme sonst jede
        // Nacht dieselbe Zeile und verdraengte alles andere.
        const name = fraktionById(state.worldSeed, e.fraktion).name;
        const text = `${name} schicken eine Horde von ${e.anzahl} Goblins.`;
        if (!c.momente.some((m) => m.art === 'horde' && m.text.startsWith(name + ' '))) moment(null, 'horde', text);
        break;
      }
      case 'burnedDown': {
        stats(e.player).abgebrannt += 1;
        if (e.art !== 'strasse') {
          const was = e.art === 'stadt' ? 'Eine Stadt' : 'Ein Dorf';
          moment(e.player, 'brand', `${was} von ${nameVon(state, e.player)} brennt nieder.`);
        }
        break;
      }
      case 'heroFell': {
        stats(e.player).heldGefallen += 1;
        const p = playerById(state, e.player);
        const lore = e.zweig ? p?.ernannt?.lore : p?.held;
        const wer = lore ? `${lore.vorname} ${lore.beiname}` : `Der Held von ${nameVon(state, e.player)}`;
        moment(e.player, 'held', `${wer} faellt.`);
        break;
      }
      case 'morast':
        moment(e.gegen, 'morast', `Der Morast erhebt sich gegen ${nameVon(state, e.gegen)}.`);
        break;
      case 'levelUp':
        if (e.name) moment(e.player, 'stufe', `${e.name} dient sich hoch zu Stufe ${e.stufe}.`);
        break;
      case 'turn':
        // Der Verlauf je grosser Runde - dieselbe Stelle, an der die Raubzuege aufbrechen.
        if (bigRoundChangedAt(state.turn)) c.verlauf.push({ turn: state.turn, punkte: punkteZeile(state, false) });
        break;
      case 'wonder':
        moment(e.player, 'hauptstadt', `${nameVon(state, e.player)} errichtet ${WUNDER[e.art].name}.`);
        break;
      case 'eventResolved': {
        const ev = ereignisById(e.id);
        const wahl = ev?.wahlen[e.wahl]?.text.split(':')[0]!.split('(')[0]!.trim();
        if (ev && wahl) moment(e.player, 'ereignis', `${ev.titel}: ${nameVon(state, e.player)} - ${wahl}.`);
        break;
      }
      case 'fall':
        moment(e.player, 'untergang', `Das letzte Gebaeude von ${nameVon(state, e.player)} ist gefallen.`);
        break;
      case 'recovered':
        moment(e.player, 'stadt', `${nameVon(state, e.player)} baut das Reich wieder auf.`);
        break;
      case 'defeated':
        moment(e.player, 'untergang', `Das Reich von ${nameVon(state, e.player)} geht unter.`);
        break;
      case 'lost':
        moment(null, 'ende', 'Alle Reiche sind gefallen - die Partie ist verloren.');
        break;
      case 'win': {
        const zeit = state.phase.t === 'finished' && state.phase.durch === 'zeit';
        const text = !zeit
          ? `${nameVon(state, e.player)} gewinnt in Runde ${roundOf(state.turn)}.`
          : state.order.length === 1
            ? `Nach ${roundOf(state.turn)} Runden ist die Zeit um.`
            : `Nach ${roundOf(state.turn)} Runden ist die Zeit um - ${nameVon(state, e.player)} liegt vorn.`;
        moment(e.player, zeit ? 'ende' : 'sieg', text);
        break;
      }
      default:
        break;
    }
  }

  if (state.phase.t === 'finished') {
    const letzte = c.verlauf[c.verlauf.length - 1];
    const zeile = punkteZeile(state, true);
    if (letzte?.turn === state.turn) letzte.punkte = zeile;
    else c.verlauf.push({ turn: state.turn, punkte: zeile });
  }

  if (c.momente.length > MAX_MOMENTE) c.momente.splice(0, c.momente.length - MAX_MOMENTE);
}

// --- Saga ---------------------------------------------------------------------


/** Was die Saga braucht - auch aus der redigierten Sicht. */
export type SagaSicht = {
  turn: number;
  order: readonly PlayerId[];
  players: ReadonlyArray<{ id: PlayerId; name: string; haus?: string | null; held: { vorname: string; beiname: string; haus: string } | null }>;
  chronik: Chronik | null | undefined;
  phase: GameState['phase'];
};

const zeitVon = (turn: number): string => `im ${SEASON_NAME[seasonOf(turn)]} des Jahres ${yearOf(turn)}`;

/**
 * Die Partie als kleine Erzaehlung, drei, vier Saetze - fuer die Schlussseite.
 * Aus Haus, Held und den Momenten der Chronik; kein Zufall, keine neue Regel.
 * Erzaehlt aus der Sicht eines Spielers (du).
 */
export function saga(s: SagaSicht, du: PlayerId): string {
  const p = s.players.find((x) => x.id === du);
  if (!p) return '';
  const haus = hausById(p.haus ?? null);
  const saetze: string[] = [];
  const held = p.held ? `${p.held.vorname} ${p.held.beiname} vom Haus ${p.held.haus}` : null;
  saetze.push(`Im Fruehling des Jahres 1 zog ${p.name}${haus ? ` unter dem Banner ${haus.banner}` : ''} aus, ein Reich zu gruenden.`);
  if (held) saetze.push(`Zur Seite stand ${held}.`);
  const meine = (s.chronik?.momente ?? []).filter((m) => m.player === du || m.player === null);
  const erste = (art: string) => meine.find((m) => m.art === art);
  const stadt = erste('stadt');
  if (stadt) saetze.push(`${zeitVon(stadt.turn).replace(/^im/, 'Im')} stand die erste Stadt.`);
  const horde = erste('horde');
  const brand = erste('brand');
  if (horde && brand) saetze.push(`Horden kamen aus dem Dunkel, und nicht alles ueberstand das Feuer.`);
  else if (horde) saetze.push(`Horden kamen aus dem Dunkel - das Reich hielt stand.`);
  const heldFiel = erste('held');
  if (heldFiel) saetze.push(`${heldFiel.text.replace(/\.$/, '')} ${zeitVon(heldFiel.turn)}.`);
  const karte = erste('karte');
  if (karte) saetze.push(karte.text.replace(`${p.name} nimmt`, 'Das Schicksal brachte'));
  const ereignis = erste('ereignis');
  if (ereignis) saetze.push(`Lange erzaehlte man sich von jenem Tag ${zeitVon(ereignis.turn)}: ${ereignis.text.split(':')[0]}.`);
  if (s.phase.t === 'finished') {
    const i = s.order.indexOf(du);
    const pkt = s.chronik?.verlauf[s.chronik.verlauf.length - 1]?.punkte[i];
    const wie =
      s.phase.winner === du
        ? 'mit einem Sieg'
        : s.phase.winner === null
          ? 'mit dem Fall aller Reiche'
          : '- ein anderes Haus steht vorn';
    const zeit = zeitVon(s.turn).replace(/^im/, 'Im');
    saetze.push(`${zeit} schliesst die Chronik ${wie}.${pkt !== undefined ? ` Am Ende: ${pkt} Siegpunkte.` : ''}`);
  }
  return saetze.join(' ');
}
