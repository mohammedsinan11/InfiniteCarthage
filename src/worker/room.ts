/**
 * Ein Durable Object je Spielraum.
 *
 * Das DO ist die einzige Autoritaet: es wuerfelt, es mischt, es entscheidet,
 * was ein gueltiger Zug ist. Die Clients schicken Absichten, nie Ergebnisse.
 * Das ist bei Catan nicht optional - Handkarten und Kartendeck sind verdeckte
 * Information, und der Client traegt dieselbe Regel-Engine.
 *
 * Warum kein Lockstep wie im Nachbarprojekt InfiniteSettler: dort rechnet
 * jeder Client die ganze Welt nach, was bei einem Aufbauspiel ohne verdeckte
 * Information voellig in Ordnung ist. Hier waere es dasselbe wie mit offenen
 * Karten zu spielen.
 *
 * Hibernation: schlafende Raeume kosten nichts. Damit ein Aufwachen den
 * Zustand nicht verliert, wird nach jeder Aktion in den DO-Storage
 * geschrieben - und die Spielerzuordnung haengt als Attachment am Socket,
 * nicht im Arbeitsspeicher.
 */

import { applyAction, createGame, rebuildWorld } from '../core/rules/reducer';
import type { Game, GameEvent } from '../core/rules/reducer';
import { redactEventsFor, redactStateFor } from '../core/redact';
import type { GameState, PlayerId } from '../core/state';
import {
  DEFAULT_TARGET_POINTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TARGET_POINTS_CHOICES,
  parseClientMsg,
} from '../core/protocol';
import type { ClientMsg, Member, RoomInfo, ServerMsg } from '../core/protocol';

export type Env = {
  GAME_ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
};

type RoomData = {
  code: string;
  hostId: PlayerId | null;
  members: Member[];
  targetPoints: number;
  started: boolean;
  /** token -> playerId. Holt nach einem Verbindungsabbruch den Platz zurueck. */
  tokens: Record<string, PlayerId>;
};

type Attachment = { playerId: PlayerId | null };

const STORAGE_ROOM = 'room';
const STORAGE_GAME = 'game';
const STORAGE_SCHEMA = 'schema';

/**
 * Form des gespeicherten Spielstands.
 *
 * Ein Raum kann beliebig lange schlafen - laenger als zwischen zwei Deploys.
 * Wacht er unter neuem Code mit altem Snapshot auf, passt der Zustand nicht
 * mehr zur Engine, und weil der Spielstand bei JEDER Meldung durch die
 * Redaktion laeuft, wirft der Raum dann dauerhaft: er kaeme aus dem Fehler nie
 * wieder heraus.
 *
 * Darum: Version mitschreiben, beim Laden vergleichen, bei Abweichung die
 * Partie verwerfen und den Raum in die Lobby zurueckstellen. Eine laufende
 * Partie zu verlieren ist bitter, ein toter Raum ist schlimmer - aus der Lobby
 * kommt man wieder heraus.
 *
 * Hochzaehlen, sobald sich GameState aendert.
 */
const SCHEMA_VERSION = 8;

function randomId(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! | 0;
}

/** Namen kuerzen und Steuerzeichen entfernen - er landet in fremden Browsern. */
function sanitizeName(name: string): string {
  const clean = String(name ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
    .slice(0, 20);
  return clean.length > 0 ? clean : 'Spieler';
}

export class GameRoom implements DurableObject {
  private room: RoomData | null = null;
  /** Im Speicher gehaltene Partie. Nach Hibernation aus dem Storage neu aufgebaut. */
  private game: Game | null = null;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    void this.env;
  }

  // --- Persistenz -----------------------------------------------------------

  private async loadRoom(code: string): Promise<RoomData> {
    if (this.room) return this.room;
    const stored = await this.ctx.storage.get<RoomData>(STORAGE_ROOM);
    this.room = stored ?? {
      code,
      hostId: null,
      members: [],
      targetPoints: DEFAULT_TARGET_POINTS,
      started: false,
      tokens: {},
    };
    return this.room;
  }

  /**
   * Partie laden. Gespeichert wird nur der GameState - die Landschaft wird
   * aus worldSeed und der Chunkliste neu berechnet, nie abgelegt.
   */
  private async loadGame(): Promise<Game | null> {
    if (this.game) return this.game;
    const state = await this.ctx.storage.get<GameState>(STORAGE_GAME);
    if (!state) return null;

    const version = await this.ctx.storage.get<number>(STORAGE_SCHEMA);
    if (version !== SCHEMA_VERSION) {
      // Snapshot aus einer aelteren Fassung: unbrauchbar, aber loeschbar.
      await this.ctx.storage.delete(STORAGE_GAME);
      const room = await this.loadRoom('');
      room.started = false;
      await this.ctx.storage.put(STORAGE_ROOM, room);
      await this.ctx.storage.put(STORAGE_SCHEMA, SCHEMA_VERSION);
      return null;
    }

    this.game = { state, world: rebuildWorld(state) };
    return this.game;
  }

  private async save(): Promise<void> {
    if (this.room) await this.ctx.storage.put(STORAGE_ROOM, this.room);
    if (this.game) {
      await this.ctx.storage.put(STORAGE_GAME, this.game.state);
      await this.ctx.storage.put(STORAGE_SCHEMA, SCHEMA_VERSION);
    }
  }

  // --- Verbindungen ---------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get('code') ?? '';
    const create = url.searchParams.get('create') === '1';

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Erwartet wird eine WebSocket-Verbindung.', { status: 426 });
    }

    const room = await this.loadRoom(code);
    const exists = room.members.length > 0 || room.started;
    if (!create && !exists) {
      return new Response('Raum nicht gefunden.', { status: 404 });
    }
    if (create && !exists) {
      room.code = code;
      await this.save();
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // Hibernation-API: der Socket ueberlebt das Einschlafen des Objekts.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null } satisfies Attachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    const msg = parseClientMsg(raw);
    if (!msg) {
      this.send(ws, { t: 'error', message: 'Unlesbare Nachricht.' });
      return;
    }
    try {
      await this.handle(ws, msg);
    } catch (err) {
      this.send(ws, {
        t: 'error',
        message: err instanceof Error ? err.message : 'Unerwarteter Fehler.',
      });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att?.playerId) return;
    await this.loadRoom('');
    if (!this.room) return;

    // Der Platz bleibt reserviert - mit dem Token kommt der Spieler zurueck.
    const m = this.room.members.find((x) => x.id === att.playerId);
    if (m) m.connected = false;
    const game = await this.loadGame();
    if (game) {
      const p = game.state.players.find((x) => x.id === att.playerId);
      if (p) p.connected = false;
    }
    await this.save();
    this.broadcastRoom();
    this.broadcastState();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  // --- Nachrichten ----------------------------------------------------------

  private async handle(ws: WebSocket, msg: ClientMsg): Promise<void> {
    const room = await this.loadRoom('');

    if (msg.t === 'join') {
      await this.onJoin(ws, room, msg);
      return;
    }

    const att = ws.deserializeAttachment() as Attachment | null;
    const playerId = att?.playerId;
    if (!playerId) {
      this.send(ws, { t: 'error', message: 'Erst beitreten.' });
      return;
    }

    switch (msg.t) {
      case 'setOptions': {
        if (room.hostId !== playerId) {
          this.send(ws, { t: 'error', message: 'Nur der Gastgeber kann das aendern.' });
          return;
        }
        if (room.started) {
          this.send(ws, { t: 'error', message: 'Die Partie laeuft bereits.' });
          return;
        }
        if (!(TARGET_POINTS_CHOICES as readonly number[]).includes(msg.targetPoints)) {
          this.send(ws, { t: 'error', message: 'Ungueltige Punktzahl.' });
          return;
        }
        room.targetPoints = msg.targetPoints;
        await this.save();
        this.broadcastRoom();
        return;
      }

      case 'start': {
        if (room.hostId !== playerId) {
          this.send(ws, { t: 'error', message: 'Nur der Gastgeber kann starten.' });
          return;
        }
        if (room.started) {
          this.send(ws, { t: 'error', message: 'Die Partie laeuft bereits.' });
          return;
        }
        if (room.members.length < MIN_PLAYERS) {
          this.send(ws, { t: 'error', message: `Mindestens ${MIN_PLAYERS} Spieler noetig.` });
          return;
        }
        this.game = createGame(
          room.members.map((m) => ({ id: m.id, name: m.name })),
          randomSeed(),
          randomSeed(),
          room.targetPoints,
        );
        room.started = true;
        await this.save();
        this.broadcastRoom();
        this.broadcastState();
        return;
      }

      case 'action': {
        const game = await this.loadGame();
        if (!game) {
          this.send(ws, { t: 'error', message: 'Die Partie laeuft noch nicht.' });
          return;
        }
        const result = applyAction(game, msg.action, playerId);
        if (!result.ok) {
          this.send(ws, { t: 'error', message: result.error });
          return;
        }
        await this.save();
        this.broadcastState();
        this.broadcastEvents(result.events);
        return;
      }
    }
  }

  private async onJoin(
    ws: WebSocket,
    room: RoomData,
    msg: Extract<ClientMsg, { t: 'join' }>,
  ): Promise<void> {
    let playerId: PlayerId | undefined;
    let token = msg.token;

    // Rueckkehr mit gueltigem Token: derselbe Platz, dieselben Karten.
    if (token !== undefined && room.tokens[token] !== undefined) {
      playerId = room.tokens[token];
    } else if (room.started) {
      this.send(ws, { t: 'error', message: 'Die Partie laeuft bereits.' });
      return;
    } else if (room.members.length >= MAX_PLAYERS) {
      this.send(ws, { t: 'error', message: 'Der Raum ist voll.' });
      return;
    } else {
      playerId = 'p_' + randomId(8);
      token = randomId(16);
      room.tokens[token] = playerId;
      room.members.push({ id: playerId, name: sanitizeName(msg.name), connected: true });
      room.hostId ??= playerId;
    }

    const member = room.members.find((m) => m.id === playerId);
    if (!member || playerId === undefined || token === undefined) {
      this.send(ws, { t: 'error', message: 'Platz nicht gefunden.' });
      return;
    }
    member.connected = true;
    ws.serializeAttachment({ playerId } satisfies Attachment);

    const game = await this.loadGame();
    if (game) {
      const p = game.state.players.find((x) => x.id === playerId);
      if (p) p.connected = true;
    }

    await this.save();
    this.send(ws, { t: 'welcome', you: playerId, token, room: this.info(room) });
    this.broadcastRoom();
    if (game) this.sendState(ws, game.state, playerId);
  }

  // --- Versand --------------------------------------------------------------

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket bereits zu - der close-Handler raeumt auf.
    }
  }

  private info(room: RoomData): RoomInfo {
    return {
      code: room.code,
      hostId: room.hostId,
      started: room.started,
      targetPoints: room.targetPoints,
      members: room.members.map((m) => ({ ...m })),
    };
  }

  private broadcastRoom(): void {
    if (!this.room) return;
    const msg: ServerMsg = { t: 'room', room: this.info(this.room) };
    for (const ws of this.ctx.getWebSockets()) this.send(ws, msg);
  }

  private sendState(ws: WebSocket, state: GameState, viewer: PlayerId): void {
    this.send(ws, { t: 'state', state: redactStateFor(state, viewer) });
  }

  /**
   * Jeder bekommt SEINE Sicht. Ein gemeinsamer Broadcast waere hier ein
   * Sicherheitsloch, kein eingesparter Rechenschritt.
   */
  private broadcastState(): void {
    const state = this.game?.state;
    if (!state) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.playerId) continue;
      this.sendState(ws, state, att.playerId);
    }
  }

  private broadcastEvents(events: GameEvent[]): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.playerId) continue;
      this.send(ws, { t: 'events', events: redactEventsFor(events, att.playerId) });
    }
  }
}
