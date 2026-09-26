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
import { migriereStand } from '../core/rules/migration';
import type { GameState, PlayerId } from '../core/state';
import {
  DEFAULT_TARGET_POINTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NO_TARGET,
  PIN_LENGTH,
  BOT_NAMEN,
  RUNDEN_LIMIT_CHOICES,
  TARGET_POINTS_CHOICES,
  normalizePin,
  parseClientMsg,
  randomPin,
} from '../core/protocol';
import type { ClientMsg, Member, RoomInfo, ServerMsg } from '../core/protocol';
import { MELDEN_ALLE_MS, VERZEICHNIS_NAME } from '../core/lobby';
import type { RaumEintrag } from '../core/lobby';
import { roundOf } from '../core/season';
import { gueltigeOmen, wuerfleOmen } from '../core/omen';
import { TAGES_RUNDEN, istTagesDatum, tagesDatum, tagesOmen, tagesWeltSeed } from '../core/tages';
import type { BestenEintrag } from '../core/tages';
import { wertung } from '../core/chronik';
import { istStufe } from '../core/stufe';
import { botsSpielen } from '../core/bot';
import { szenarioById } from '../core/szenario';
import { totalPoints } from '../core/state';

export type Env = {
  GAME_ROOM: DurableObjectNamespace;
  /** Die oeffentliche Raumliste (worker/directory.ts). */
  VERZEICHNIS: DurableObjectNamespace;
  /** Bestenliste und geheimer Seed der Tagesexpedition, eines je Tag (worker/bestenliste.ts). */
  BESTENLISTE: DurableObjectNamespace;
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
  /**
   * playerId -> Platz-PIN (protocol.ts). Fehlt bei Raeumen von vorher; ein
   * Spieler bekommt seine beim naechsten Beitritt.
   */
  pins?: Record<PlayerId, string>;
  /**
   * In der Raumliste sichtbar? Fehlt bei Raeumen von vor der Liste - die gelten
   * als oeffentlich, wie jeder neue Raum ohne ausdrueckliche Wahl.
   */
  oeffentlich?: boolean;
  /** Eroeffnet und zuletzt aktiv, in Millisekunden seit 1970. */
  erstellt?: number;
  /** Die Omen der kommenden Partie (core/omen.ts). Fehlt bei alten Raeumen. */
  omens?: string[];
  /** Rundengrenze, null ohne. Fehlt bei alten Raeumen. */
  rundenLimit?: number | null;
  /** Tagesexpedition: ihr Datum (core/tages.ts). Sonst fehlt es. */
  tagesDatum?: string | null;
  /** Das Ergebnis der Tagesexpedition ist in der Bestenliste. */
  gemeldet?: boolean;
  /** Die Welt einer frueheren Partie ("Diese Welt nochmal"). Sonst eine neue. */
  weltSeed?: number | null;
  /** Chronikstufe (core/stufe.ts). Fehlt: 0. */
  stufe?: number;
  /** Gemeinsam gegen die Wildnis. */
  koop?: boolean;
  /** Ein Szenario (core/szenario.ts) - allein. */
  szenario?: string | null;
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
const SCHEMA_VERSION = 12;

function randomId(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function neuePin(): string {
  const a = new Uint8Array(PIN_LENGTH);
  crypto.getRandomValues(a);
  return randomPin(a);
}

/**
 * Falsche PINs je Raum: nach so vielen innerhalb von PIN_SPERRE_MS keine
 * weiteren Versuche. Nur im Speicher - schlaeft der Raum ein, beginnt es neu,
 * aber zum Durchprobieren von einer Million PINs reicht das nicht.
 */
const PIN_VERSUCHE = 8;
const PIN_SPERRE_MS = 10 * 60 * 1000;

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
  /** Wann sich der Raum zuletzt beim Verzeichnis gemeldet hat. */
  private letzteMeldung = 0;
  /** Falsche PINs im laufenden Zeitfenster (PIN_VERSUCHE, PIN_SPERRE_MS). */
  private pinFehler = { anzahl: 0, seit: 0 };

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

    // Kleine Aenderungen am Zustand werden nachgetragen, statt die Partie zu verwerfen.
    migriereStand(state);
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
      room.oeffentlich = url.searchParams.get('public') !== '0';
      room.erstellt = Date.now();
      if (url.searchParams.get('tages') === '1') {
        // Das Datum bestimmt der Server, nicht der Client: sonst waehlte sich
        // jeder den Tag, dessen Welt ihm am besten gefaellt.
        const datum = tagesDatum();
        room.tagesDatum = datum;
        room.omens = tagesOmen(datum);
        room.rundenLimit = TAGES_RUNDEN;
        room.targetPoints = NO_TARGET;
        room.oeffentlich = false;
      } else if (szenarioById(url.searchParams.get('szenario'))) {
        const sz = szenarioById(url.searchParams.get('szenario'))!;
        room.tagesDatum = null;
        room.szenario = sz.id;
        room.omens = [...sz.omens];
        room.rundenLimit = sz.runden;
        room.targetPoints = NO_TARGET;
        room.oeffentlich = false;
      } else {
        room.tagesDatum = null;
        room.omens = wuerfleOmen(randomSeed());
        // Voreingestellt: 20 Punkte oder ein Jahr, was zuerst kommt - so hat
        // jede Partie ein absehbares Ende und eine Chronik (Spieltest: allein
        // zog sich das offene Spiel zu 30 Punkten zu lange).
        room.rundenLimit = 60;
        // Der Weltseed ist oeffentlich (er steht in jedem Spielstand) - ihn
        // wiederzuverwenden verraet nichts. Wuerfel und Karten kommen neu.
        const welt = Number(url.searchParams.get('welt'));
        room.weltSeed = url.searchParams.has('welt') && Number.isInteger(welt) ? welt | 0 : null;
      }
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
    // Wer geht, hinterlaesst den letzten Stand in der Raumliste - die Zuege
    // davor waren gedrosselt, sonst stuende dort eine alte Runde.
    await this.melden();
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
        if (room.tagesDatum || room.szenario) {
          this.send(ws, { t: 'error', message: room.szenario ? 'Das Szenario hat feste Regeln.' : 'Die Tagesexpedition hat feste Regeln.' });
          return;
        }
        if (msg.omens === 'neu') room.omens = wuerfleOmen(randomSeed());
        else if (msg.omens === 'keine') room.omens = [];
        if (typeof msg.koop === 'boolean') {
          room.koop = msg.koop;
          // Gemeinsam braucht eine Rundengrenze: ein Jahr.
          if (msg.koop) room.rundenLimit = 60;
        }
        if (msg.stufe !== undefined) {
          if (!istStufe(msg.stufe)) {
            this.send(ws, { t: 'error', message: 'Ungueltige Stufe.' });
            return;
          }
          room.stufe = msg.stufe;
        }
        if (msg.rundenLimit !== undefined) {
          if (!(RUNDEN_LIMIT_CHOICES as readonly (number | null)[]).includes(msg.rundenLimit)) {
            this.send(ws, { t: 'error', message: 'Ungueltige Laenge.' });
            return;
          }
          room.rundenLimit = msg.rundenLimit;
        }
        if (msg.targetPoints !== undefined) {
          if (!(TARGET_POINTS_CHOICES as readonly number[]).includes(msg.targetPoints)) {
            this.send(ws, { t: 'error', message: 'Ungueltige Punktzahl.' });
            return;
          }
          room.targetPoints = msg.targetPoints;
        }
        if (typeof msg.oeffentlich === 'boolean') room.oeffentlich = msg.oeffentlich;
        await this.save();
        this.broadcastRoom();
        await this.melden();
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
        const tages = room.tagesDatum ?? null;
        const weltSeed = tages ? tagesWeltSeed(tages) : (room.weltSeed ?? randomSeed());
        const geheimSeed = tages ? await this.tagesGeheimSeed(tages) : randomSeed();
        this.game = createGame(
          room.members.map((m) => ({ id: m.id, name: m.name })),
          weltSeed,
          geheimSeed,
          room.koop && !tages ? 0 : room.targetPoints,
          {
            omens: gueltigeOmen(room.omens ?? []),
            rundenLimit: room.koop && !tages ? (room.rundenLimit ?? 60) : (room.rundenLimit ?? null),
            tagesDatum: tages,
            haeuser: true,
            ereignisse: true,
            stufe: tages ? 0 : (room.stufe ?? 0),
            koop: !tages && !room.szenario && (room.koop ?? false),
            szenario: room.szenario ?? null,
          },
        );
        room.started = true;
        const botZuege = this.spieleBots(this.game, room);
        await this.save();
        this.broadcastRoom();
        this.broadcastState();
        for (const ev of botZuege) this.broadcastEvents(ev);
        await this.melden();
        return;
      }

      case 'addBot':
      case 'removeBot': {
        if (room.hostId !== playerId) {
          this.send(ws, { t: 'error', message: 'Nur der Gastgeber setzt Bots.' });
          return;
        }
        if (room.started || room.tagesDatum || room.szenario) {
          this.send(ws, { t: 'error', message: room.started ? 'Die Partie laeuft bereits.' : 'Die Tagesexpedition spielt man allein.' });
          return;
        }
        if (msg.t === 'addBot') {
          if (room.members.length >= MAX_PLAYERS) {
            this.send(ws, { t: 'error', message: 'Der Raum ist voll.' });
            return;
          }
          const name = BOT_NAMEN.find((n) => !room.members.some((m) => m.name === n)) ?? 'Rivale';
          room.members.push({ id: 'bot_' + randomId(6), name, connected: true, bot: true });
        } else {
          room.members = room.members.filter((m) => !(m.bot && m.id === msg.id));
        }
        await this.save();
        this.broadcastRoom();
        await this.melden();
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
        // Danach sind die Bots dran, bis wieder ein Mensch am Zug ist.
        const botZuege = this.spieleBots(game, room);
        await this.save();
        this.broadcastState();
        this.broadcastEvents(result.events);
        for (const ev of botZuege) this.broadcastEvents(ev);
        // Zuege gedrosselt - ausser dem letzten: eine beendete Partie soll
        // sofort als beendet in der Liste stehen.
        await this.melden(game.state.phase.t === 'finished');
        if (game.state.phase.t === 'finished') await this.tagesErgebnis(room, game.state);
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
    } else if (msg.seat !== undefined) {
      // Anderes Geraet: Raumcode, Platz und dessen PIN. Das neue Geraet
      // bekommt ein eigenes Token - das alte bleibt gueltig.
      const jetzt = Date.now();
      if (jetzt - this.pinFehler.seit > PIN_SPERRE_MS) this.pinFehler = { anzahl: 0, seit: jetzt };
      if (this.pinFehler.anzahl >= PIN_VERSUCHE) {
        this.send(ws, { t: 'error', message: 'Zu viele falsche PINs - in ein paar Minuten nochmal.' });
        return;
      }
      const platz = room.members.find((m) => m.id === msg.seat);
      const pin = platz ? room.pins?.[platz.id] : undefined;
      if (!platz || pin === undefined || pin !== normalizePin(msg.pin ?? '')) {
        this.pinFehler.anzahl += 1;
        this.send(ws, { t: 'error', message: 'Die PIN passt nicht zu diesem Platz.' });
        return;
      }
      playerId = platz.id;
      token = randomId(16);
      room.tokens[token] = playerId;
    } else if (room.started) {
      // Kein Platz ohne Token: die Plaetze zeigen, der Client fragt nach der PIN.
      this.send(ws, { t: 'seats', room: this.info(room) });
      return;
    } else if (room.members.length >= MAX_PLAYERS) {
      this.send(ws, { t: 'error', message: 'Der Raum ist voll.' });
      return;
    } else if ((room.tagesDatum || room.szenario) && room.members.length >= 1) {
      // Allein, damit die Ergebnisse vergleichbar bleiben.
      this.send(ws, { t: 'error', message: 'Die Tagesexpedition spielt man allein.' });
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
    room.pins ??= {};
    const pin = (room.pins[playerId] ??= neuePin());

    /*
     * Neuer Tab oder anderes Geraet: wer vorher mit diesem Platz verbunden war,
     * gibt ihn ab. Sonst spielten zwei Fenster denselben Platz. Die alte
     * Verbindung verliert zuerst ihren Platz - so meldet ihr close-Ereignis den
     * Spieler nicht als getrennt.
     */
    for (const alt of this.ctx.getWebSockets()) {
      if (alt === ws) continue;
      const a = alt.deserializeAttachment() as Attachment | null;
      if (a?.playerId !== playerId) continue;
      alt.serializeAttachment({ playerId: null } satisfies Attachment);
      this.send(alt, { t: 'replaced' });
      try {
        alt.close(4000, 'replaced');
      } catch {
        // schon zu
      }
    }
    ws.serializeAttachment({ playerId } satisfies Attachment);

    const game = await this.loadGame();
    if (game) {
      const p = game.state.players.find((x) => x.id === playerId);
      if (p) p.connected = true;
    }

    await this.save();
    this.send(ws, { t: 'welcome', you: playerId, token, pin, room: this.info(room) });
    this.broadcastRoom();
    if (game) this.sendState(ws, game.state, playerId);
    await this.melden();
  }

  // --- Bots ----------------------------------------------------------------

  /** Die Bots spielen, bis ein Mensch dran ist (core/bot.ts). Ereignisse je Aktion. */
  private spieleBots(game: Game, room: RoomData): GameEvent[][] {
    const bots = new Set(room.members.filter((m) => m.bot).map((m) => m.id));
    if (bots.size === 0) return [];
    return botsSpielen(game, (id) => bots.has(id));
  }

  // --- Tagesexpedition ------------------------------------------------------

  private bestenliste(datum: string): DurableObjectStub {
    return this.env.BESTENLISTE.get(this.env.BESTENLISTE.idFromName('tag:' + datum));
  }

  /**
   * Der geheime Seed des Tages (worker/bestenliste.ts). Faellt die Bestenliste
   * aus, spielt der Raum mit einem eigenen - die Welt ist dieselbe, nur Wuerfel
   * und Karten nicht.
   */
  private async tagesGeheimSeed(datum: string): Promise<number> {
    try {
      const res = await this.bestenliste(datum).fetch('https://bestenliste/seed');
      const { seed } = (await res.json()) as { seed: unknown };
      if (typeof seed === 'number') return seed | 0;
    } catch {
      // Ohne Bestenliste weiter.
    }
    return randomSeed();
  }

  /** Das Ergebnis einer beendeten Tagesexpedition eintragen - genau einmal. */
  private async tagesErgebnis(room: RoomData, state: GameState): Promise<void> {
    const datum = state.tagesDatum;
    if (!datum || !istTagesDatum(datum) || room.gemeldet) return;
    const id = state.order[0]!;
    const p = state.players.find((x) => x.id === id);
    if (!p) return;
    const eintrag: BestenEintrag = {
      name: p.name,
      wertung: wertung(state, id),
      punkte: totalPoints(state, id),
      ruhm: p.ruhm,
      code: room.code,
      zeit: Date.now(),
    };
    try {
      await this.bestenliste(datum).fetch('https://bestenliste/eintragen', {
        method: 'POST',
        body: JSON.stringify(eintrag),
      });
      room.gemeldet = true;
      await this.save();
    } catch {
      // Die Liste ist Beiwerk.
    }
  }

  // --- Raumliste ------------------------------------------------------------

  /**
   * Beim Verzeichnis melden (worker/directory.ts).
   *
   * dringend: sofort. Sonst hoechstens alle MELDEN_ALLE_MS - bei Zuegen, die im
   * Sekundentakt kommen koennen. "Zuletzt gespielt" hinkt dadurch hoechstens
   * eine halbe Minute nach. Private Raeume melden sich auch, als privat: so
   * verschwindet ein Raum aus der Liste, sobald der Gastgeber umschaltet.
   */
  private async melden(dringend = true): Promise<void> {
    const room = this.room;
    if (!room || room.code === '' || room.members.length === 0) return;
    const jetzt = Date.now();
    if (!dringend && jetzt - this.letzteMeldung < MELDEN_ALLE_MS) return;
    this.letzteMeldung = jetzt;

    const state = this.game?.state ?? null;
    const eintrag: RaumEintrag = {
      code: room.code,
      oeffentlich: room.oeffentlich !== false,
      status: !room.started ? 'lobby' : state?.phase.t === 'finished' ? 'beendet' : 'laeuft',
      gastgeber: room.members.find((m) => m.id === room.hostId)?.name ?? room.members[0]!.name,
      spieler: room.members.map((m) => m.name),
      maxSpieler: MAX_PLAYERS,
      runde: room.started && state ? roundOf(state.turn) : null,
      zielpunkte: room.targetPoints,
      erstellt: room.erstellt ?? jetzt,
      zuletzt: jetzt,
    };
    try {
      const stub = this.env.VERZEICHNIS.get(this.env.VERZEICHNIS.idFromName(VERZEICHNIS_NAME));
      await stub.fetch('https://verzeichnis/melden', {
        method: 'POST',
        body: JSON.stringify(eintrag),
      });
    } catch {
      // Die Liste ist Beiwerk - ein Fehler dort darf keinen Zug verhindern.
    }
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
      oeffentlich: room.oeffentlich !== false,
      omens: room.omens ?? [],
      rundenLimit: room.rundenLimit ?? null,
      tagesDatum: room.tagesDatum ?? null,
      weltSeed: room.weltSeed ?? null,
      stufe: room.stufe ?? 0,
      koop: room.koop ?? false,
      szenario: room.szenario ?? null,
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
