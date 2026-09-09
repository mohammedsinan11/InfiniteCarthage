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
import type { PlayerId } from '../../core/state';
import { createWorld, revealChunks } from '../../core/world';
import type { World } from '../../core/world';
import { describeEvent } from '../log';

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

  connect: (code: string, name: string, create: boolean) => void;
  /** Nach einem Neuladen zurueck in die laufende Partie, falls moeglich. */
  resume: () => void;
  disconnect: () => void;
  send: (msg: ClientMsg) => void;
  act: (action: Action) => void;
  dismissError: () => void;
};

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

  connect: (code, name, create) => {
    get().ws?.close();
    set({ status: 'connecting', error: null, code, log: [] });

    const ws = openSocket(code, create, {
      onOpen: () => {
        sendMsg(ws, { t: 'join', name, token: loadToken(code) });
      },
      onClose: () => {
        set((s) => (s.status === 'connecting' ? { status: 'closed' } : { status: 'closed' }));
      },
      onMessage: (msg: ServerMsg) => {
        switch (msg.t) {
          case 'welcome':
            saveToken(code, msg.token);
            set({ you: msg.you, room: msg.room, status: msg.room.started ? 'playing' : 'lobby' });
            break;
          case 'room':
            set((s) => ({ room: msg.room, status: msg.room.started ? s.status : 'lobby' }));
            break;
          case 'state':
            set((s) => ({
              state: msg.state,
              world: buildWorld(s.world, msg.state),
              status: 'playing',
            }));
            break;
          case 'events':
            set((s) => ({
              log: [...s.log, ...msg.events.map((e: GameEvent) => describeEvent(e, s.state))].slice(-120),
            }));
            break;
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
    set({ ws: null, status: 'idle', room: null, state: null, world: null, you: null, log: [] });
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
}));
