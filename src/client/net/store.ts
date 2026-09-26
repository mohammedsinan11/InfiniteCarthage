/**
 * Anwendungszustand des Clients.
 *
 * Der Spielzustand kommt fertig redigiert vom Server und wird hier nur
 * gehalten, nie fortgeschrieben. Die Welt dagegen wird lokal erzeugt: aus
 * worldSeed und der Chunkliste rechnet der Client dieselbe Landschaft aus wie
 * der Server, ohne dass ein einziges Gelaendefeld uebertragen wird.
 */

import { letzterAhn } from '../profil';
import { create } from 'zustand';
import { openSocket, sendMsg } from './socket';
import type { RaumWunsch } from './socket';
import { lokalerSpeicher, merkePartie } from './partien';
import { normalizePin } from '../../core/protocol';
import type { ClientMsg, RoomInfo, ServerMsg } from '../../core/protocol';
import type { PublicState } from '../../core/redact';
import type { Seite } from '../../core/combat';
import type { Action, GameEvent } from '../../core/rules/reducer';
import {
  playAbgebrannt,
  playAuftrag,
  playBrand,
  playCardPick,
  playClash,
  playDefend,
  playGuard,
  playHeld,
  playHorde,
  playKrieg,
  playLoeschen,
  playMarch,
  playPakt,
  playRaid,
  playRuin,
} from '../audio';
import { sichtLage } from '../../core/zeit';
import type { PlayerId } from '../../core/state';
import { STUFE_NAME } from '../../core/rules/hauptstadt';
import { createWorld, mitAufgedeckt, revealChunks } from '../../core/world';
import type { World } from '../../core/world';
import { BRAND_WAS, auftragText, bundleText, describeEvent, fraktionName, resourceName, seiteName } from '../log';
import { fraktionById } from '../../core/factions';
import { spielerSeite } from '../../core/combat';
import { sightOf } from '../../core/units';
import { hexKey } from '../../core/coords';
import { bigRoundChangedAt, bigRoundOf, roundOf, SEASON_NAME, seasonChangedAt, seasonOf, JAHRESZEIT_WIRKUNG } from '../../core/season';
import { tippGesehen, tippsAus } from '../tipps';
import type { Tipp } from '../tipps';

/**
 * Ein Weltereignis - was der Welt geschieht, nicht was ein Spieler tut.
 *
 * Getrennt vom Protokoll, weil es eine andere Frage beantwortet. Das
 * Protokoll sagt, wer was getan hat. Die Weltereignisse sagen, was draussen
 * los war - und wer nach drei Runden zurueckschaut, sucht meist das und findet
 * es zwischen dreissig Wuerfen nicht.
 */
export type WeltEintrag = {
  id: number;
  runde: number;
  art:
    | 'march'
    | 'plunder'
    | 'fight'
    | 'nest'
    | 'capture'
    | 'horde'
    | 'feud'
    | 'home'
    | 'wanderer'
    | 'ruin'
    | 'fire'
    | 'hero'
    | 'pact'
    | 'quest'
    | 'season'
    | 'bigRound';
  text: string;
};

export type Announcement = {
  id: number;
  text: string;
  /** Bestimmt Farbe und Ton der Meldung. */
  kind: 'raid' | 'season' | 'gain' | 'info';
};

let naechsteId = 1;

const gleicherWurf = (a: [number, number] | null, b: [number, number]): boolean =>
  a !== null && a[0] === b[0] && a[1] === b[1];

const TOKEN_KEY = 'infinitecarthage.token';
const ROOM_KEY = 'infinitecarthage.room';
const NAME_KEY = 'infinitecarthage.name';

/**
 * Das Wiedereinstiegs-Token liegt im sessionStorage, NICHT im localStorage.
 *
 * localStorage teilen sich alle Tabs derselben Herkunft. Ein zweiter Tab
 * haette damit das Token des ersten geschickt und dessen Platz uebernommen,
 * statt als neuer Spieler beizutreten - auf einem geteilten Rechner koennte
 * so niemand mitspielen. sessionStorage gilt je Tab: ein Tab ist ein
 * Spieler, und ein Neuladen behaelt den Platz trotzdem.
 */

/** platzwahl: die Partie laeuft, dieser Browser hat keinen Platz - welcher bist du (Home)? */
type Status = 'idle' | 'connecting' | 'platzwahl' | 'lobby' | 'playing' | 'closed';

/** Ein Pfeil auf dem Brett: von welchem Feld auf welches, der wievielte der Salve, und ob die Salve traf. */
export type Pfeil = { id: number; von: { q: number; r: number }; nach: { q: number; r: number }; nr: number; trifft: boolean };

/**
 * Ein Treffer der letzten Kampfrunde, damit man den Kampf sieht: die Zahl
 * steigt ueber dem Feld auf, in der Farbe der getroffenen Seite
 * (rules/army.ts, fight.treffer).
 */
export type Treffer = {
  id: number;
  q: number;
  r: number;
  seite: Seite;
  anzahl: number;
  gefallen: boolean;
  /** Der wievielte Treffer auf diesem Feld - fuer Versatz und Verzoegerung. */
  nr: number;
};

/** Unter welchem Namen zuletzt beigetreten wurde - fuer die Platzwahl auf derselben Verbindung. */
let beitrittsName = '';

export type Store = {
  status: Status;
  error: string | null;
  code: string;
  you: PlayerId | null;
  room: RoomInfo | null;
  state: PublicState | null;
  world: World | null;
  log: string[];
  welt: WeltEintrag[];
  ws: WebSocket | null;
  /** Die Platz-PIN fuer ein anderes Geraet (protocol.ts) - kommt mit welcome. */
  pin: string | null;
  /** Die laufende Partie, in der dieser Browser einen Platz waehlen soll. */
  platzWahl: RoomInfo | null;
  /**
   * Ein Wurf, der noch gezeigt werden will.
   *
   * Das Ergebnis steht laengst fest - es kommt aus dem Durable Object. Diese
   * Zwischenablage sorgt nur dafuer, dass die Oberflaeche es inszenieren
   * kann, statt die Zahl kommentarlos einzublenden.
   */
  pendingRoll: [number, number] | null;
  /**
   * Meldungen, die von links hereinfliegen sollen.
   *
   * Eine Warteschlange und keine einzelne Meldung: in einem Zug koennen
   * mehrere Dinge auf einmal passieren - Wurf, Raeuber, Jahreszeitwechsel -,
   * und sie sollen nacheinander zu sehen sein statt sich zu ueberschreiben.
   */
  announcements: Announcement[];
  /** Tipps, die noch gelesen werden wollen (client/tipps.ts) - der erste wird gezeigt. */
  tipps: Tipp[];
  tippGelesen: () => void;
  /**
   * Der letzte Ertrag, damit die Felder aufleuchten und die Karten fliegen
   * koennen. Die Nummer wechselt bei jedem Wurf und stoesst die Animation an.
   */
  produceEffect: { id: number; roll: number } | null;
  /**
   * Pfeile, die gerade fliegen (Beschuss, rules/army.ts): je Salve so viele,
   * wie geschossen wurden. Das Brett zeigt sie kurz, Game raeumt sie weg.
   */
  pfeile: Pfeil[];
  /** Treffer der letzten Kampfrunde - das Brett zeigt sie kurz, Game raeumt sie weg. */
  treffer: Treffer[];

  /**
   * oeffentlich gilt nur beim Eroeffnen: erscheint der Raum in der Raumliste?
   * token: aus "Deine Partien" (net/partien.ts) - sonst nur das Token dieses Tabs.
   */
  connect: (code: string, name: string, create: boolean, oeffentlich?: boolean, token?: string, neu?: RaumWunsch) => void;
  /** In einer laufenden Partie ohne Token: diesen Platz nehmen, mit seiner PIN. */
  waehlePlatz: (seat: PlayerId, pin: string) => void;
  /** Nach einem Neuladen zurueck in die laufende Partie, falls moeglich. */
  resume: () => void;
  disconnect: () => void;
  send: (msg: ClientMsg) => void;
  act: (action: Action) => void;
  dismissError: () => void;
  clearPendingRoll: () => void;
  dropAnnouncement: (id: number) => void;
  clearProduceEffect: () => void;
  clearPfeile: () => void;
  clearTreffer: () => void;
};

/**
 * Felder nachtragen, die ein aelterer Worker noch nicht schickt.
 *
 * Oberflaeche und Worker werden getrennt veroeffentlicht (README,
 * Bereitstellen): die Seite geht mit jedem Push live, der Worker von Hand.
 * Dazwischen spricht eine neue Seite mit einem alten Worker - ohne Omen,
 * Rundengrenze und Chronik. Dann gilt eben keines davon, statt dass die Seite
 * an einem fehlenden Feld zerbricht.
 */
function vervollstaendige(msg: ServerMsg): void {
  const room = 'room' in msg ? msg.room : null;
  if (room) {
    room.omens ??= [];
    room.rundenLimit ??= null;
    room.tagesDatum ??= null;
    room.weltSeed ??= null;
    room.stufe ??= 0;
    room.koop ??= false;
    room.szenario ??= null;
  }
  if (msg.t === 'state') {
    msg.state.omens ??= [];
    msg.state.rundenLimit ??= null;
    msg.state.tagesDatum ??= null;
    msg.state.chronik ??= null;
    msg.state.hausAngebot ??= {};
    msg.state.ereignis ??= null;
    msg.state.stufe ??= 0;
    msg.state.wunder ??= {};
    msg.state.koop ??= false;
    msg.state.szenario ??= null;
    msg.state.szenarioErgebnis ??= null;
    msg.state.koopErgebnis ??= null;
    for (const p of msg.state.players) p.haus ??= null;
  }
}

/** Wie viele Weltereignisse das Menue behaelt. */
const WELT_MAX = 60;

/** Was draussen geschieht, als Weltereignisse. Zeitwechsel kommen aus dem Zustand. */
function weltAus(
  events: GameEvent[],
  state: PublicState | null,
  you: PlayerId | null,
): WeltEintrag[] {
  const out: WeltEintrag[] = [];
  const runde = roundOf(state?.turn ?? 0);
  const wer = (id: string) => state?.players.find((p) => p.id === id)?.name ?? 'Jemand';
  const name = (id: string) => fraktionName(state, id);
  // Kaempfe anderer zaehlen nur, wenn man sie sieht - sonst rauscht die Liste.
  const sicht = state && you ? sightOf(state, you, sichtLage(state.worldSeed, state.turn)) : null;
  const sichtbar = (q: number, r: number) => sicht === null || sicht.has(hexKey(q, r));
  const eintrag = (art: WeltEintrag['art'], text: string, r = runde) =>
    out.push({ id: naechsteId++, runde: r, art, text });
  for (const e of events) {
    switch (e.t) {
      case 'march':
        eintrag(
          'march',
          e.parties.length === 1
            ? `Raubzug bricht auf: ${name(e.parties[0]!.fraktion)}`
            : `${e.parties.length} Raubzuege brechen auf`,
          e.round,
        );
        break;
      case 'feud':
        eintrag('feud', `Fehde: ${name(e.fraktion)} gegen ${name(e.gegen)}`, e.round);
        break;
      case 'wanderer':
        eintrag('wanderer', 'Ein Wanderer zieht durchs Land');
        break;
      case 'plunder':
        eintrag(
          'plunder',
          `${e.player === you ? 'Du wirst' : `${wer(e.player)} wird`} gepluendert: ${e.count} (${name(e.fraktion)})`,
          e.round,
        );
        break;
      case 'homecoming':
        if (e.count > 0) eintrag('home', `${name(e.fraktion)}: ${e.count} Beute heimgebracht`);
        break;
      case 'lootRecovered':
        eintrag('fight', `Beute zurueckerobert: ${e.count} (${e.player === you ? 'du' : wer(e.player)})`);
        break;
      case 'fight': {
        const meins = you !== null && e.seiten.includes(spielerSeite(you));
        if (!meins && !sichtbar(e.q, e.r)) break;
        const gegner = e.seiten.map((s) => seiteName(state, s, you)).join(' gegen ');
        if (e.neu && !e.ende) eintrag('fight', `Kampf: ${gegner}`);
        else if (e.ende) {
          const sieger = e.sieger ? seiteName(state, e.sieger, you) : 'niemand';
          eintrag('fight', e.neu ? `Kampf: ${gegner} - Sieg fuer ${sieger}` : `Kampf entschieden: Sieg fuer ${sieger}`);
        }
        break;
      }
      case 'nestDestroyed':
        eintrag('nest', `Lager zerstoert: ${name(e.fraktion)}`);
        break;
      case 'nestCaptured':
        eintrag('capture', `${name(e.an)} erobern ein Lager von ${name(e.von)}`);
        break;
      case 'horde':
        // Das Menue setzt vor diese Zeile ein Ausrufezeichen (styles.css, welt-horde).
        eintrag('horde', `Goblin-Horde greift an: ${name(e.fraktion)}, ${e.anzahl} Goblins`, e.round);
        break;
      case 'burn': {
        const bei = e.player === you ? 'Bei dir' : `Bei ${wer(e.player)}`;
        eintrag('fire', `${bei} brennt ${BRAND_WAS[e.art]} (${name(e.fraktion)})`);
        break;
      }
      case 'burnedDown': {
        const bei = e.player === you ? 'Bei dir' : `Bei ${wer(e.player)}`;
        eintrag('fire', `${bei} ist ${BRAND_WAS[e.art]} abgebrannt`);
        break;
      }
      case 'extinguished':
        if (e.player === you) eintrag('fire', `Feuer geloescht: ${BRAND_WAS[e.art]}`);
        break;
      case 'burnPrevented':
        if (e.player === you) eintrag('fire', `Dein Wachturm vertreibt Brandstifter (${name(e.fraktion)})`);
        break;
      case 'heroFell':
        eintrag('hero', `${e.player === you ? 'Dein Held' : `Der Held von ${wer(e.player)}`} faellt`);
        break;
      case 'pact':
        if (e.player === you) eintrag('pact', `${e.art === 'frieden' ? 'Frieden' : 'Tribut'}: ${name(e.fraktion)}`);
        break;
      case 'war':
        if (e.player === you) eintrag('pact', `Krieg mit ${name(e.fraktion)}`);
        break;
      case 'questOffered':
        if (e.player === you) eintrag('quest', `Auftrag angeboten: ${auftragText(e, name)}`);
        break;
      case 'questDone':
        if (e.player === you) eintrag('quest', 'Auftrag erfuellt - eine Kartenwahl');
        break;
      case 'questFailed':
        if (e.player === you) eintrag('quest', e.grund === 'abgelaufen' ? 'Auftrag abgelaufen' : 'Auftrag verloren');
        break;
      case 'ruin':
        out.push({ id: naechsteId++, runde, art: 'ruin', text: `Ruine erkundet: ${RUINE_KURZ[e.result]}` });
        break;
      default:
        break;
    }
  }
  return out;
}

const RUINE_KURZ = { schatz: 'ein Schatz', beute: 'Beute', karte: 'eine alte Karte', hinterhalt: 'ein Hinterhalt' } as const;

/** Die Meldung zu einer eigenen Ruine. */
function ruinenMeldung(e: Extract<GameEvent, { t: 'ruin' }>): string {
  switch (e.result) {
    case 'schatz':
      return `Schatz in der Ruine: ${bundleText(e.gained)}`;
    case 'beute':
      return 'Beute in der Ruine - einloesen mit dem Knopf Beute unten';
    case 'karte':
      return 'Eine alte Karte - die Umgebung ist aufgedeckt';
    case 'hinterhalt':
      return e.knightLost ? 'Hinterhalt! Dein Ritter faellt' : 'Hinterhalt in der Ruine - abgewehrt';
  }
}

/** Welche Ereignisse sind eine Meldung wert? Nicht jedes - sonst rauscht es. */
function meldungenAus(
  events: GameEvent[],
  state: PublicState | null,
  you: PlayerId | null,
): Announcement[] {
  const out: Announcement[] = [];
  const wer = (id: string) => state?.players.find((p) => p.id === id)?.name ?? 'Jemand';
  const name = (id: string) => fraktionName(state, id);
  const sicht = state && you ? sightOf(state, you, sichtLage(state.worldSeed, state.turn)) : null;
  const sichtbar = (q: number, r: number) => sicht === null || sicht.has(hexKey(q, r));
  const meldung = (text: string, kind: Announcement['kind']) => out.push({ id: naechsteId++, text, kind });
  for (const e of events) {
    if (e.t === 'capital') {
      meldung(e.player === you ? 'Deine Hauptstadt ist gegruendet' : `${wer(e.player)} gruendet eine Hauptstadt`, e.player === you ? 'gain' : 'info');
      continue;
    }
    if (e.t === 'capitalUpgrade') {
      const was = STUFE_NAME[e.stufe] ?? `Stufe ${e.stufe}`;
      meldung(
        e.player === you ? `Der ${was} steht` : `${wer(e.player)} baut einen ${was}`,
        e.player === you ? 'gain' : 'info',
      );
      continue;
    }
    if (e.t === 'aid' && e.player === you) {
      meldung(`${e.grund === 'durst' ? 'Ein Nachbar hilft aus' : 'Wanderhaendler bringen'}: 1x ${resourceName(e.resource)}`, 'gain');
      continue;
    }
    if (e.t === 'plunder') {
      const karten = `${e.count} ${e.count === 1 ? 'Karte' : 'Karten'}`;
      // Nichts zu holen: kein Alarm, der nach Verlust klingt.
      if (e.count === 0) {
        if (e.player === you) out.push({ id: naechsteId++, text: `${name(e.fraktion)} ziehen ab - bei dir war nichts zu holen`, kind: 'info' });
      } else if (e.player === you) {
        playRaid();
        out.push({ id: naechsteId++, text: `${name(e.fraktion)} pluendern dich: ${karten}`, kind: 'raid' });
      } else {
        out.push({ id: naechsteId++, text: `${wer(e.player)} wird gepluendert: ${e.count}`, kind: 'raid' });
      }
    } else if (e.t === 'vendetta') {
      if (e.player === you) {
        const chef = state ? fraktionById(state.worldSeed, e.fraktion).anfuehrer : undefined;
        meldung(`${chef ?? name(e.fraktion)} schwoert Rache - der naechste Raubzug gilt dir`, 'raid');
      }
    } else if (e.t === 'march') {
      playMarch();
      out.push({
        id: naechsteId++,
        text:
          e.parties.length === 1
            ? `Raubzug: ${name(e.parties[0]!.fraktion)}${(e.parties[0]!.anzahl ?? 1) > 1 ? ` (${e.parties[0]!.anzahl} Mann)` : ''}`
            : `${e.parties.length} Raubzuege brechen auf`,
        kind: 'raid',
      });
    } else if (e.t === 'fight') {
      const eigene = you !== null ? spielerSeite(you) : null;
      if (eigene !== null && e.seiten.includes(eigene)) {
        const gegner = e.seiten
          .filter((s) => s !== eigene)
          .map((s) => seiteName(state, s, you))
          .join(' und ');
        if (e.neu) playClash();
        if (e.neu && !e.ende) {
          out.push({ id: naechsteId++, text: `Deine Ritter kaempfen gegen ${gegner}`, kind: 'raid' });
        }
        if (e.ende) {
          const sieg = e.sieger === eigene;
          if (sieg) playDefend();
          else playRaid();
          out.push({
            id: naechsteId++,
            text: sieg ? `Sieg gegen ${gegner}` : `Niederlage gegen ${gegner}`,
            kind: sieg ? 'gain' : 'raid',
          });
        }
      } else if (e.neu && sichtbar(e.q, e.r)) {
        playClash();
        out.push({
          id: naechsteId++,
          text: `Kampf: ${e.seiten.map((s) => seiteName(state, s, you)).join(' gegen ')}`,
          kind: 'info',
        });
      }
    } else if (e.t === 'lootRecovered') {
      if (e.player === you) {
        playDefend();
        out.push({ id: naechsteId++, text: `Beute zurueckerobert: ${bundleText(e.taken)}`, kind: 'gain' });
      }
    } else if (e.t === 'feud') {
      if (sichtbar(e.q, e.r) || sichtbar(e.zq, e.zr)) {
        out.push({ id: naechsteId++, text: `Fehde: ${name(e.fraktion)} gegen ${name(e.gegen)}`, kind: 'info' });
      }
    } else if (e.t === 'horde') {
      playHorde();
      out.push({
        id: naechsteId++,
        text: `Goblin-Horde greift an! ${name(e.fraktion)}: ${e.anzahl} Goblins`,
        kind: 'raid',
      });
    } else if (e.t === 'burn') {
      if (e.player === you) {
        playBrand();
        const letztes =
          e.art !== 'strasse' && state !== null && Object.values(state.buildings).filter((b) => b.owner === you).length <= 1;
        meldung(
          letztes
            ? 'ALARM: Dein letztes Gebaeude brennt! Loesche es in diesem Zug (Karte, Ritter oder Held) - sonst faellt dein Reich'
            : `Feuer! Es brennt ${BRAND_WAS[e.art]} - loeschen mit Karte, Ritter oder Held`,
          'raid',
        );
      }
    } else if (e.t === 'burnedDown') {
      if (e.player === you) {
        playAbgebrannt();
        meldung(`${BRAND_WAS[e.art].replace(/^e/, 'E')} ist abgebrannt`, 'raid');
      }
    } else if (e.t === 'extinguished') {
      if (e.player === you) {
        playLoeschen();
        meldung(
          e.durch === 'regen' ? 'Der Regen loescht das Feuer' : 'Feuer geloescht',
          'gain',
        );
      }
    } else if (e.t === 'burnPrevented') {
      if (e.player === you) {
        playDefend();
        meldung('Dein Wachturm vertreibt Brandstifter', 'gain');
      }
    } else if (e.t === 'heroReady') {
      if (e.player === you) {
        playHeld();
        const held = state?.players.find((p) => p.id === you)?.held;
        meldung(
          e.zurueck
            ? 'Dein Held kehrt zurueck'
            : held && held.folge > 1
              ? `${held.vorname} tritt an - ${held.folge}. Generation des Hauses ${held.haus}`
              : 'Dein Held tritt an',
          'gain',
        );
      }
    } else if (e.t === 'heroFell') {
      if (e.player === you) {
        playRaid();
        meldung(`Dein Held faellt - er kehrt in Runde ${e.zurueck} zurueck`, 'raid');
      }
    } else if (e.t === 'pact') {
      if (e.player === you) {
        playPakt();
        meldung(e.art === 'frieden' ? `Frieden mit ${name(e.fraktion)}` : `Tribut an ${name(e.fraktion)}`, 'info');
      }
    } else if (e.t === 'war') {
      if (e.player === you) {
        playKrieg();
        meldung(
          e.grund === 'unbezahlt'
            ? `Kein Tribut - ${name(e.fraktion)} ziehen in den Krieg`
            : e.grund === 'abgelaufen'
              ? `Der Frieden mit ${name(e.fraktion)} ist vorbei`
              : `Krieg mit ${name(e.fraktion)}`,
          'raid',
        );
      }
    } else if (e.t === 'questOffered') {
      if (e.player === you) {
        playAuftrag();
        meldung('Ein Wanderer bietet dir einen Auftrag an', 'info');
      }
    } else if (e.t === 'questProgress') {
      if (e.player === you) meldung(`Jagd: ${e.fortschritt} von ${e.menge} geschlagen`, 'info');
    } else if (e.t === 'questDone') {
      if (e.player === you) {
        playCardPick(3);
        meldung('Auftrag erfuellt! Beute: eine Kartenwahl', 'gain');
      }
    } else if (e.t === 'questFailed') {
      if (e.player === you) {
        meldung(e.grund === 'abgelaufen' ? 'Ein Auftrag ist abgelaufen' : 'Ein Auftrag ist verloren', 'info');
      }
    } else if (e.t === 'nestCaptured') {
      if (sichtbar(e.q, e.r)) {
        out.push({ id: naechsteId++, text: `${name(e.an)} erobern ein Lager von ${name(e.von)}`, kind: 'info' });
      }
    } else if (e.t === 'nestDestroyed') {
      const meins = you !== null && e.players.includes(you);
      if (meins) playCardPick(3);
      out.push({
        id: naechsteId++,
        text: meins ? 'Lager zerstoert! Beute: eine Kartenwahl' : `Lager zerstoert: ${name(e.fraktion)}`,
        kind: 'gain',
      });
    } else if (e.t === 'ruin') {
      if (e.player === you) {
        playRuin();
        out.push({
          id: naechsteId++,
          text: ruinenMeldung(e),
          kind: e.result === 'hinterhalt' && e.knightLost ? 'raid' : 'gain',
        });
      }
    } else if (e.t === 'knightReady') {
      if (e.player === you) {
        playGuard();
        out.push({ id: naechsteId++, text: e.kind === 'bogen' ? 'Ein Bogenschuetze tritt an' : 'Ein Ritter tritt an', kind: 'info' });
      }
    } else if (e.t === 'draftOffered') {
      out.push({
        id: naechsteId++,
        text: e.source === 'belohnung' ? 'Beute! Waehle eine Karte' : 'Ein Fund! Waehle eine Karte',
        kind: 'gain',
      });
    } else if (e.t === 'monopoly') {
      out.push({ id: naechsteId++, text: `Monopol: ${e.taken} Karten`, kind: 'info' });
    } else if (e.t === 'glory') {
      out.push({ id: naechsteId++, text: `${wer(e.player)} gewinnt ${e.amount} Ruhm`, kind: 'gain' });
    } else if (e.t === 'tacticPlayed') {
      out.push({ id: naechsteId++, text: `${wer(e.player)} spielt eine Taktik`, kind: 'info' });
    } else if (e.t === 'win') {
      out.push({ id: naechsteId++, text: `${wer(e.player)} gewinnt`, kind: 'info' });
    } else if (e.t === 'fall') {
      out.push({
        id: naechsteId++,
        text: e.player === you ? 'Dein letztes Gebaeude ist gefallen - baue bald eine Siedlung!' : `${wer(e.player)} verliert das letzte Gebaeude`,
        kind: 'raid',
      });
    } else if (e.t === 'recovered') {
      out.push({ id: naechsteId++, text: e.player === you ? 'Dein Reich steht wieder' : `${wer(e.player)} steht wieder`, kind: 'gain' });
    } else if (e.t === 'defeated') {
      out.push({ id: naechsteId++, text: e.player === you ? 'Dein Reich ist gefallen' : `${wer(e.player)} ist gefallen`, kind: 'raid' });
    } else if (e.t === 'lost') {
      out.push({ id: naechsteId++, text: 'Die Partie ist verloren', kind: 'raid' });
    } else if (e.t === 'nestRevived') {
      out.push({ id: naechsteId++, text: `${name(e.fraktion)} beziehen ein Lager neu`, kind: 'raid' });
    }
  }
  return out;
}

/** Token je Raum merken, damit ein Neuladen den Platz nicht verliert. */
const tokenKey = (code: string) => `${TOKEN_KEY}.${code}`;

function loadToken(code: string): string | undefined {
  try {
    return sessionStorage.getItem(tokenKey(code)) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(tokenKey(code), token);
    sessionStorage.setItem(ROOM_KEY, code);
  } catch {
    // Privater Modus: dann eben kein Wiedereinstieg nach Neuladen.
  }
}

/**
 * Welt zum Zustand aufbauen. Wird nur neu gerechnet, wenn Chunks dazukamen -
 * die Erzeugung ist rein, also ist das reine Fleissarbeit, kein Risiko. Kam
 * etwas dazu, ist es ein neues Objekt (mitAufgedeckt), sonst sieht das Brett
 * die neuen Felder nicht.
 */
function buildWorld(prev: World | null, state: PublicState): World {
  if (prev && prev.seed === state.worldSeed) return mitAufgedeckt(prev, state.chunks);
  const w = createWorld(state.worldSeed);
  revealChunks(w, state.chunks);
  return w;
}

/*
 * Protokoll und Weltgeschehen ueberleben ein Neuladen oder eine kurze
 * Trennung: je Raum im sessionStorage (Spieltest: nach jeder Wiederverbindung
 * war das Protokoll leer). Der Server schickt nur den Stand, nicht die
 * Geschichte - was hier fehlt, ist verloren.
 */
const LOG_SPEICHER = 'infinitecarthage.log.';

function ladeLog(code: string): { log: string[]; welt: WeltEintrag[] } {
  try {
    const roh = JSON.parse(sessionStorage.getItem(LOG_SPEICHER + code) ?? 'null') as { log?: string[]; welt?: WeltEintrag[] } | null;
    const welt = Array.isArray(roh?.welt) ? roh.welt : [];
    // Die Zaehler fuer neue Eintraege muessen hinter den alten liegen.
    for (const w of welt) naechsteId = Math.max(naechsteId, w.id + 1);
    return { log: Array.isArray(roh?.log) ? roh.log : [], welt };
  } catch {
    return { log: [], welt: [] };
  }
}

function speichereLog(code: string, log: string[], welt: WeltEintrag[]): void {
  if (!code) return;
  try {
    sessionStorage.setItem(LOG_SPEICHER + code, JSON.stringify({ log, welt }));
  } catch {
    // Voll oder privat - dann eben ohne.
  }
}

export const useStore = create<Store>((set, get) => ({
  status: 'idle',
  error: null,
  code: '',
  you: null,
  room: null,
  state: null,
  world: null,
  log: [], welt: [],
  ws: null,
  pin: null,
  platzWahl: null,
  pendingRoll: null,
  announcements: [],
  tipps: [],
  tippGelesen: () => {
    const [erster, ...rest] = get().tipps;
    if (erster) tippGesehen(erster.id);
    set({ tipps: rest });
  },
  produceEffect: null,
  pfeile: [],
  treffer: [],

  connect:(code, name, create, oeffentlich = true, token, neu = {}) => {
    beitrittsName = name;
    const alt = get().ws;
    if (alt) {
      /*
       * Die Handler der alten Verbindung abschalten, BEVOR sie geschlossen
       * wird.
       *
       * Sonst feuert ihr close-Ereignis erst, nachdem die neue Verbindung
       * schon steht - und setzt den Zustand auf "getrennt" zurueck. Man
       * landet dann mitten im Beitreten wieder auf der Startseite, ohne dass
       * irgendetwas schiefgegangen waere.
       */
      alt.onopen = null;
      alt.onclose = null;
      alt.onmessage = null;
      alt.close();
    }
    const alterLog = ladeLog(code);
    set({ status: 'connecting', error: null, code, log: alterLog.log, welt: alterLog.welt, state: null, world: null, pin: null, platzWahl: null });

    const ws = openSocket(code, create, oeffentlich, {
      onOpen: () => {
        const ahn = letzterAhn();
        sendMsg(ws, { t: 'join', name, token: token ?? loadToken(code), ...(ahn ? { ahn } : {}) });
      },
      onClose: () => {
        // Nur die AKTUELLE Verbindung darf den Zustand aendern.
        if (get().ws !== ws) return;
        set({ status: 'closed' });
      },
      onMessage: (msg: ServerMsg) => {
        if (get().ws !== ws) return;
        vervollstaendige(msg);
        switch (msg.t) {
          case 'welcome':
            saveToken(code, msg.token);
            // Fuer "Deine Partien": auch nach dem Schliessen des Browsers weiterspielen.
            merkePartie(
              lokalerSpeicher(),
              {
                code,
                token: msg.token,
                name: msg.room.members.find((m) => m.id === msg.you)?.name ?? name,
                zuletzt: Date.now(),
              },
              Date.now(),
            );
            set({
              you: msg.you,
              room: msg.room,
              pin: msg.pin ?? null,
              platzWahl: null,
              status: msg.room.started ? 'playing' : 'lobby',
            });
            break;
          case 'seats':
            set({ platzWahl: msg.room, room: msg.room, status: 'platzwahl' });
            break;
          case 'replaced':
            // Derselbe Platz ist jetzt anderswo offen. Nicht still zurueckholen:
            // der Tab vergisst die Partie, ein Neuladen fuehrt auf die Startseite.
            try {
              sessionStorage.removeItem(ROOM_KEY);
            } catch {
              // nichts zu tun
            }
            set({
              ws: null,
              status: 'idle',
              room: null,
              state: null,
              world: null,
              you: null,
              pin: null,
              error: 'Diese Partie ist jetzt in einem anderen Tab oder auf einem anderen Geraet offen.',
            });
            break;
          case 'room':
            /*
             * Eine Raumnachricht darf niemanden aus einer laufenden Partie
             * werfen.
             *
             * Sie kommt bei jedem Beitritt und jedem Verbindungsabbruch -
             * also gerade dann, wenn andere kommen und gehen. Wer bereits
             * einen Spielzustand hat, ist im Spiel; nur ohne Zustand ist die
             * Lobby der richtige Ort.
             */
            set((s) => ({
              room: msg.room,
              status: msg.room.started || s.state !== null ? s.status : 'lobby',
            }));
            break;
          case 'state':
            set((s) => {
              // Jahreszeitwechsel faellt beim Zustand auf, nicht bei den
              // Ereignissen - er ist aus der Zugnummer abgeleitet.
              const vorher = s.state?.turn ?? 0;
              const jetzt = msg.state.turn;
              const wechsel =
                jetzt > vorher && seasonChangedAt(jetzt)
                  ? [
                      {
                        id: naechsteId++,
                        text: [SEASON_NAME[seasonOf(jetzt)], JAHRESZEIT_WIRKUNG[seasonOf(jetzt)].text].filter(Boolean).join(' - '),
                        kind: 'season' as const,
                      },
                    ]
                  : [];
              // Fuers Menue: Zeitwechsel als Weltereignis. Nicht beim ersten
              // Zustand nach dem Verbinden (vorher 0) - sonst meldete ein
              // Neuladen mitten im Winter "Winter beginnt". Faellt ein
              // Jahreszeitwechsel auf eine grosse Runde, zaehlt nur er.
              const zeit: WeltEintrag[] = [];
              if (vorher > 0 && jetzt > vorher) {
                if (seasonChangedAt(jetzt)) {
                  zeit.push({ id: naechsteId++, runde: roundOf(jetzt), art: 'season', text: `${SEASON_NAME[seasonOf(jetzt)]} beginnt` });
                } else if (bigRoundChangedAt(jetzt)) {
                  zeit.push({ id: naechsteId++, runde: roundOf(jetzt), art: 'bigRound', text: `Grosse Runde ${bigRoundOf(jetzt)} beginnt` });
                }
              }
              /*
               * Der Server schickt den Zustand VOR den Ereignissen. Bei einer
               * 7 stuende die Kartenwahl damit schon da, bevor der Wurf in
               * pendingRoll landet, und verdeckte ihn. Also die Wuerfel schon
               * hier vormerken - die Wahl wartet in Game auf sie. Nicht beim
               * ersten Zustand nach dem Verbinden: da laeuft die Wahl schon.
               */
              const siebenGefallen =
                s.state !== null &&
                s.state.phase.t !== 'draft' &&
                msg.state.phase.t === 'draft' &&
                msg.state.draft?.source === 'fund' &&
                msg.state.lastRoll !== null;
              return {
                ...(siebenGefallen ? { pendingRoll: msg.state.lastRoll } : {}),
                state: msg.state,
                world: buildWorld(s.world, msg.state),
                status: 'playing' as const,
                announcements: [...s.announcements, ...wechsel].slice(-6),
                welt: [...s.welt, ...zeit].slice(-WELT_MAX),
              };
            });
            break;
          case 'events': {
            const wurf = msg.events.find((e: GameEvent) => e.t === 'roll');
            const neue = meldungenAus(msg.events, get().state, get().you);
            const neueTipps = tippsAus(msg.events, get().you, get().tipps.map((t) => t.id));
            if (neueTipps.length > 0) set((s) => ({ tipps: [...s.tipps, ...neueTipps] }));
            const weltNeu = weltAus(msg.events, get().state, get().you);
            // Beschuss: je Schuss ein Pfeil, hoechstens fuenf je Salve.
            const pfeile: Pfeil[] = msg.events.flatMap((e: GameEvent) =>
              e.t === 'volley'
                ? Array.from({ length: Math.min(5, e.schuesse) }, (_, nr) => ({
                    id: naechsteId++,
                    von: { q: e.q, r: e.r },
                    nach: { q: e.zq, r: e.zr },
                    nr,
                    trifft: e.treffer > 0,
                  }))
                : [],
            );
            if (pfeile.length > 0) set({ pfeile });
            // Treffer der Kampfrunden: je Treffer eine Zahl ueber dem Feld.
            const treffer: Treffer[] = msg.events.flatMap((e: GameEvent) =>
              e.t === 'fight'
                ? (e.treffer ?? []).map((tr, nr) => ({
                    id: naechsteId++,
                    q: e.q,
                    r: e.r,
                    seite: tr.seite,
                    anzahl: tr.anzahl,
                    gefallen: tr.gefallen,
                    nr,
                  }))
                : [],
            );
            if (treffer.length > 0) set({ treffer });
            set((s) => ({
              log: [
                ...s.log,
                ...msg.events
                  .map((e: GameEvent) => describeEvent(e, s.state))
                  .filter((zeile: string) => zeile !== ''),
              ].slice(-120),
              welt: [...s.welt, ...weltNeu].slice(-WELT_MAX),
              announcements: [...s.announcements, ...neue].slice(-6),
              // Schon beim Zustand vorgemerkt (7)? Dann dieselbe Referenz lassen,
              // sonst finge die Animation von vorn an.
              ...(wurf && wurf.t === 'roll' && !gleicherWurf(s.pendingRoll, wurf.dice)
                ? { pendingRoll: wurf.dice }
                : {}),
            }));
            speichereLog(get().code, get().log, get().welt);
            break;
          }
          case 'error':
            if (get().state?.phase.t === 'finished') break;
            set({ error: msg.message });
            break;
        }
      },
    }, neu);

    set({ ws });
  },

  disconnect: () => {
    try {
      sessionStorage.removeItem(ROOM_KEY);
    } catch {
      // nichts zu tun
    }
    get().ws?.close();
    set({
      ws: null,
      status: 'idle',
      room: null,
      state: null,
      world: null,
      you: null,
      log: [], welt: [],
      pendingRoll: null,
      pin: null,
      platzWahl: null,
    });
  },

  waehlePlatz: (seat, pin) => {
    sendMsg(get().ws, { t: 'join', name: beitrittsName, seat, pin: normalizePin(pin) });
  },

  /**
   * Ein Neuladen soll niemanden aus der Partie werfen. Raumcode und Token
   * liegen im sessionStorage des Tabs, also kann derselbe Tab den Platz
   * ohne Zutun zurueckholen. Ohne das waere die Wiedereinstiegsmoeglichkeit
   * zwar vorhanden, aber fuer den haeufigsten Fall - versehentliches
   * Neuladen - nutzlos.
   */
  resume: () => {
    if (get().status !== 'idle') return;
    let code: string | null = null;
    let name = '';
    try {
      code = sessionStorage.getItem(ROOM_KEY);
      name = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return;
    }
    if (!code || !loadToken(code)) return;
    get().connect(code, name || 'Spieler', false);
  },

  send: (msg) => sendMsg(get().ws, msg),
  act: (action) => {
    // Nach dem Ende gibt es nichts mehr zu tun - keine Fehlermeldung ueber den Knoepfen der Chronik.
    if (get().state?.phase.t === 'finished') return;
    sendMsg(get().ws, { t: 'action', action });
  },
  dismissError: () => set({ error: null }),
  clearPendingRoll: () => {
    // Erst wenn die Wuerfel weg sind, sollen Felder leuchten und Karten
    // fliegen - sonst passiert beides hinter dem Overlay.
    const s = get();
    const roll = s.state?.lastRoll;
    set({
      pendingRoll: null,
      produceEffect:
        roll && roll[0] + roll[1] !== 7
          ? { id: naechsteId++, roll: roll[0] + roll[1] }
          : null,
    });
  },
  dropAnnouncement: (id) =>
    set((s) => ({ announcements: s.announcements.filter((a) => a.id !== id) })),
  clearProduceEffect: () => set({ produceEffect: null }),
  clearPfeile: () => set({ pfeile: [] }),
  clearTreffer: () => set({ treffer: [] }),
}));

/*
 * Nur im Entwicklungsserver: der Store am Fenster, damit sich Anzeigen (Feuer,
 * Auftraege, Held) im Browser pruefen lassen, ohne erst eine Pluenderung
 * abzuwarten. Im Build faellt der Block weg.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __store?: typeof useStore }).__store = useStore;
}
