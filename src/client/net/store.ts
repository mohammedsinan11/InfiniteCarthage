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
import { playDefend, playGuard, playRaid } from '../audio';
import type { PlayerId } from '../../core/state';
import { createWorld, revealChunks } from '../../core/world';
import type { World } from '../../core/world';
import { describeEvent } from '../log';
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
  art: 'raid' | 'defense' | 'season' | 'bigRound';
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

/** Pluenderungen als Weltereignisse. Zeitwechsel kommen aus dem Zustand. */
function weltAus(
  events: GameEvent[],
  state: PublicState | null,
  you: PlayerId | null,
): WeltEintrag[] {
  const out: WeltEintrag[] = [];
  const wer = (id: string) => state?.players.find((p) => p.id === id)?.name ?? 'Jemand';
  for (const e of events) {
    if (e.t !== 'raid') continue;
    for (const h of e.hits) {
      const nester = h.nests === 1 ? '1 Nest' : `${h.nests} Nester`;
      const wen = h.player === you ? 'dich' : wer(h.player);
      const text =
        h.count === 0
          ? `Wachen halten ${nester} ab${h.player === you ? '' : ` (${wer(h.player)})`}`
          : h.blocked > 0
            ? `Raeuber pluendern ${wen}: ${h.count} (${h.blocked} von ${nester} abgehalten)`
            : `Raeuber pluendern ${wen}: ${h.count} (${nester})`;
      out.push({
        id: naechsteId++,
        runde: e.round,
        art: h.count === 0 ? 'defense' : 'raid',
        text,
      });
    }
  }
  return out;
}

/** Welche Ereignisse sind eine Meldung wert? Nicht jedes - sonst rauscht es. */
function meldungenAus(
  events: GameEvent[],
  state: PublicState | null,
  you: PlayerId | null,
): Announcement[] {
  const out: Announcement[] = [];
  const wer = (id: string) => state?.players.find((p) => p.id === id)?.name ?? 'Jemand';
  for (const e of events) {
    if (e.t === 'raid') {
      // Der eigene Verlust zuerst und deutlich - fremde Verluste sind
      // Nachricht, der eigene ist eine Ohrfeige. Eine Abwehr genauso deutlich,
      // nur mit dem umgekehrten Gefuehl.
      const meins = e.hits.find((h) => h.player === you);
      if (meins) {
        if (meins.count === 0) {
          playDefend();
          out.push({
            id: naechsteId++,
            text: `Deine Wachen halten ${meins.blocked === 1 ? 'das Nest' : `${meins.blocked} Nester`} ab`,
            kind: 'gain',
          });
        } else {
          if (meins.blocked > 0) playDefend();
          playRaid();
          const karten = `${meins.count} ${meins.count === 1 ? 'Karte' : 'Karten'}`;
          out.push({
            id: naechsteId++,
            text:
              meins.blocked > 0
                ? `${meins.blocked} abgehalten - trotzdem gepluendert: ${karten}`
                : `Raeuber pluendern dich: ${karten}`,
            kind: 'raid',
          });
        }
      }
      for (const h of e.hits) {
        if (h.player === you) continue;
        out.push({
          id: naechsteId++,
          text:
            h.count === 0
              ? `${wer(h.player)} haelt die Raeuber ab`
              : `${wer(h.player)} wird gepluendert: ${h.count}`,
          kind: h.count === 0 ? 'info' : 'raid',
        });
      }
    } else if (e.t === 'guard') {
      if (e.player === you) playGuard();
      out.push({
        id: naechsteId++,
        text:
          e.player === you
            ? `Ritter bezieht Wache (${e.guards} ${e.guards === 1 ? 'Wache steht' : 'Wachen stehen'})`
            : `${wer(e.player)} stellt eine Wache auf`,
        kind: 'info',
      });
    } else if (e.t === 'draftOffered') {
      out.push({ id: naechsteId++, text: 'Ein Fund! Waehle eine Karte', kind: 'gain' });
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
              log: [...s.log, ...msg.events.map((e: GameEvent) => describeEvent(e, s.state))].slice(-120),
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
