/**
 * Anwendungszustand des Clients.
 *
 * Der Spielzustand kommt fertig redigiert vom Server und wird hier nur
 * gehalten, nie fortgeschrieben. Die Welt dagegen wird lokal erzeugt: aus
 * worldSeed und der Chunkliste rechnet der Client dieselbe Landschaft aus wie
 * der Server, ohne dass ein einziges Gelaendefeld uebertragen wird.
 */

import { create } from 'zustand';
import { openSocket, sendMsg } from './socket';
import type { ClientMsg, RoomInfo, ServerMsg } from '../../core/protocol';
import type { PublicState } from '../../core/redact';
import type { Action, GameEvent } from '../../core/rules/reducer';
import { playCardPick, playClash, playDefend, playGuard, playMarch, playRaid, playRuin } from '../audio';
import type { PlayerId } from '../../core/state';
import { createWorld, revealChunks } from '../../core/world';
import type { World } from '../../core/world';
import { bundleText, describeEvent, fraktionName, seiteName } from '../log';
import { spielerSeite } from '../../core/combat';
import { sightOf } from '../../core/units';
import { hexKey } from '../../core/coords';
import { bigRoundChangedAt, bigRoundOf, roundOf, SEASON_NAME, seasonChangedAt, seasonOf } from '../../core/season';

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
    | 'feud'
    | 'home'
    | 'wanderer'
    | 'ruin'
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

type Status = 'idle' | 'connecting' | 'lobby' | 'playing' | 'closed';

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
  /**
   * Der letzte Ertrag, damit die Felder aufleuchten und die Karten fliegen
   * koennen. Die Nummer wechselt bei jedem Wurf und stoesst die Animation an.
   */
  produceEffect: { id: number; roll: number } | null;

  connect: (code: string, name: string, create: boolean) => void;
  /** Nach einem Neuladen zurueck in die laufende Partie, falls moeglich. */
  resume: () => void;
  disconnect: () => void;
  send: (msg: ClientMsg) => void;
  act: (action: Action) => void;
  dismissError: () => void;
  clearPendingRoll: () => void;
  dropAnnouncement: (id: number) => void;
  clearProduceEffect: () => void;
};

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
  const sicht = state && you ? sightOf(state, you) : null;
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
      return 'Beute in der Ruine - einloesen unter Helden & Auftraege';
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
  const sicht = state && you ? sightOf(state, you) : null;
  const sichtbar = (q: number, r: number) => sicht === null || sicht.has(hexKey(q, r));
  for (const e of events) {
    if (e.t === 'plunder') {
      const karten = `${e.count} ${e.count === 1 ? 'Karte' : 'Karten'}`;
      if (e.player === you) {
        playRaid();
        out.push({ id: naechsteId++, text: `${name(e.fraktion)} pluendern dich: ${karten}`, kind: 'raid' });
      } else {
        out.push({ id: naechsteId++, text: `${wer(e.player)} wird gepluendert: ${e.count}`, kind: 'raid' });
      }
    } else if (e.t === 'march') {
      playMarch();
      out.push({
        id: naechsteId++,
        text:
          e.parties.length === 1
            ? `Raubzug: ${name(e.parties[0]!.fraktion)}`
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
        out.push({ id: naechsteId++, text: 'Ein Ritter tritt an', kind: 'info' });
      }
    } else if (e.t === 'draftOffered') {
      out.push({
        id: naechsteId++,
        text: e.source === 'belohnung' ? 'Beute! Waehle eine Karte' : 'Ein Fund! Waehle eine Karte',
        kind: 'gain',
      });
    } else if (e.t === 'monopoly') {
      out.push({ id: naechsteId++, text: `Monopol: ${e.taken} Karten`, kind: 'info' });
    } else if (e.t === 'largestArmy') {
      out.push({ id: naechsteId++, text: `${wer(e.player)}: Groesste Rittermacht`, kind: 'info' });
    } else if (e.t === 'win') {
      out.push({ id: naechsteId++, text: `${wer(e.player)} gewinnt`, kind: 'info' });
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
 * die Erzeugung ist rein, also ist das reine Fleissarbeit, kein Risiko.
 */
function buildWorld(prev: World | null, state: PublicState): World {
  if (prev && prev.seed === state.worldSeed) {
    revealChunks(prev, state.chunks);
    return prev;
  }
  const w = createWorld(state.worldSeed);
  revealChunks(w, state.chunks);
  return w;
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
  pendingRoll: null,
  announcements: [],
  produceEffect: null,

  connect: (code, name, create) => {
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
    set({ status: 'connecting', error: null, code, log: [], welt: [], state: null, world: null });

    const ws = openSocket(code, create, {
      onOpen: () => {
        sendMsg(ws, { t: 'join', name, token: loadToken(code) });
      },
      onClose: () => {
        // Nur die AKTUELLE Verbindung darf den Zustand aendern.
        if (get().ws !== ws) return;
        set({ status: 'closed' });
      },
      onMessage: (msg: ServerMsg) => {
        if (get().ws !== ws) return;
        switch (msg.t) {
          case 'welcome':
            saveToken(code, msg.token);
            set({ you: msg.you, room: msg.room, status: msg.room.started ? 'playing' : 'lobby' });
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
                        text: SEASON_NAME[seasonOf(jetzt)],
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
              return {
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
            const weltNeu = weltAus(msg.events, get().state, get().you);
            set((s) => ({
              log: [
                ...s.log,
                ...msg.events
                  .map((e: GameEvent) => describeEvent(e, s.state))
                  .filter((zeile: string) => zeile !== ''),
              ].slice(-120),
              welt: [...s.welt, ...weltNeu].slice(-WELT_MAX),
              announcements: [...s.announcements, ...neue].slice(-6),
              ...(wurf && wurf.t === 'roll' ? { pendingRoll: wurf.dice } : {}),
            }));
            break;
          }
          case 'error':
            set({ error: msg.message });
            break;
        }
      },
    });

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
    });
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
  act: (action) => sendMsg(get().ws, { t: 'action', action }),
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
}));
