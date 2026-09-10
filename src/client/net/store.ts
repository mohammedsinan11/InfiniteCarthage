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
import { playRaid } from '../audio';
import type { PlayerId } from '../../core/state';
import { createWorld, revealChunks } from '../../core/world';
import type { World } from '../../core/world';
import { describeEvent } from '../log';
import { SEASON_NAME, seasonChangedAt, seasonOf } from '../../core/season';

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
      // Nachricht, der eigene ist eine Ohrfeige.
      const meins = e.hits.find((h) => h.player === you);
      if (meins) {
        playRaid();
        out.push({
          id: naechsteId++,
          text: `Raeuber pluendern dich: ${meins.count} ${meins.count === 1 ? 'Karte' : 'Karten'}`,
          kind: 'raid',
        });
      }
      for (const h of e.hits) {
        if (h.player === you) continue;
        out.push({
          id: naechsteId++,
          text: `${wer(h.player)} wird gepluendert: ${h.count}`,
          kind: 'raid',
        });
      }
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
  log: [],
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
    set({ status: 'connecting', error: null, code, log: [], state: null, world: null });

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
              return {
                state: msg.state,
                world: buildWorld(s.world, msg.state),
                status: 'playing' as const,
                announcements: [...s.announcements, ...wechsel].slice(-6),
              };
            });
            break;
          case 'events': {
            const wurf = msg.events.find((e: GameEvent) => e.t === 'roll');
            const neue = meldungenAus(msg.events, get().state, get().you);
            set((s) => ({
              log: [...s.log, ...msg.events.map((e: GameEvent) => describeEvent(e, s.state))].slice(-120),
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
      log: [],
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
