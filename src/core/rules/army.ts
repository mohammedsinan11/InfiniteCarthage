/**
 * Das Heer: Ritter, Raubzuege, Fehden, Wanderer, Kaempfe, Lager und Ruinen.
 *
 * Alles geschieht im Takt der Runde. Bei jedem Zugende (endTurn) zieht jede
 * Einheit mit Ziel genau ein Feld. Raeuber pluendern erst, wenn sie eine
 * Siedlung erreichen, und tragen die Beute danach heim - wer sie auf dem
 * Rueckweg abfaengt, holt sie sich zurueck.
 *
 * FRAKTIONEN. Jedes Lager gehoert einer Bande oder einem Stamm
 * (core/factions.ts). Fraktionen sind einander feind und den Spielern ebenso
 * (core/combat.ts, feindlich). Stehen Feinde auf einem Feld, wird gekaempft,
 * Runde um Runde, bis nur noch eine Seite steht. Die Karte zeigt das mit zwei
 * Schwertern.
 *
 * REIHENFOLGE JE RUNDE
 *   1. Ziehen, nach Nummer. Wer in einen Kampf verwickelt ist, bleibt stehen.
 *      Ritter gehen, wohin man sie schickt, und erkunden Ruinen. Raubzuege
 *      suchen die naechste Siedlung, Heimkehrer ihr Lager, Fehden das feindliche
 *      Lager, Wanderer irgendein Ziel.
 *   2. Heimkehr: wer am eigenen Lager ankommt, geht darin auf. Die Beute ist fort.
 *   3. Angriff: wer diese Runde nicht gezogen ist, stuermt auf ein Nachbarfeld
 *      mit Feinden. So stellen Ritter, wer an ihnen vorbeiwill. Heimkehrer und
 *      Wanderer greifen nicht an.
 *   3b. Beschuss: Bogenschuetzen schiessen auf Feinde in Reichweite (beschuss).
 *   4. Kampf: eine Runde auf jedem Feld, auf dem Feinde stehen.
 *   5. Pluenderung: wer auf Raubzug an einer Siedlung steht und nicht kaempft,
 *      nimmt und kehrt um.
 *   6. Erholung: Ritter an eigenen Siedlungen bekommen ein Leben zurueck.
 *
 * KAMPF. Jeder Kaempfer wuerfelt einmal; er trifft bei Wurf + Angriff >= 6, mit
 * einer Sechs immer, mit einer Eins nie (core/combat.ts). Jeder Treffer kostet
 * einen zufaelligen Feind ein Leben, alle schlagen gleichzeitig. Ein Lager
 * kaempft mit: wer es angreift, rennt gegen die Palisade (-1), die Besatzung ist
 * ungeordnet (-2) und hat je Kopf ein Leben.
 *
 * LAGER FALLEN, wenn die Besatzung aufgerieben ist. Stehen Ritter darauf, wird es
 * zerstoert, und ihre Besitzer bekommen Beute. Stehen dort nur Leute einer
 * fremden Fraktion, erobern sie es und werden seine neue Besatzung.
 *
 * WUERFEL kommen aus dem rngState, wie der Ertrag: auf dem Server und nicht
 * vorhersagbar.
 *
 * ZU MEHREREN ist die Runde der Spielerzug (state.turn), wie ueberall im Spiel.
 * Zu viert ziehen Einheiten also viermal, bis man selbst wieder dran ist.
 *
 * DER HELD. Jeder Spieler hat einen (spawnHeld). Er zieht zwei Felder je Runde,
 * deckt weiter auf, geraet in Ruinen nie in einen Hinterhalt und findet eher
 * Beute. Ritter auf seinem Feld treffen leichter (ANFUEHRUNG), und Ritter in
 * seinem Gefolge (folgt) ziehen mit ihm, so schnell wie er. Faellt er, kehrt er
 * nach HELD_RUECKKEHR Runden an einer Siedlung zurueck.
 *
 * WETTER. Im Schnee ziehen Einheiten nur jede zweite Runde (core/zeit.ts).
 * DIPLOMATIE. Wer mit einer Fraktion Frieden hat oder Tribut zahlt, ist fuer
 * ihre Raubzuege kein Ziel (feindlich mit dem Spielstand, rules/diplomatie.ts).
 */

import { Rng } from '../rng';
import { hexDistance, hexKey, hexesInRange, neighbors, parseVertexKey, vertexAdjacentHexes } from '../coords';
import type { Hex } from '../coords';
import { ensureGenerated, isGenerated } from '../world';
import type { World } from '../world';
import type { ChunkCoord } from '../chunks';
import { ruinAt, ruinResultFor } from '../ruins';
import type { RuinResult } from '../ruins';
import { RESOURCES } from '../types';
import { MAX_TURM_STUFE, emptyHand, handSize, playerById } from '../state';
import { NACHT_ID } from '../factions';
import type { GameState, Hand, PlayerId, UnitKind, UnitState } from '../state';
import { einheitName, wuerfleHeld } from '../lore';
import type { HeldLore } from '../lore';
import {
  BESATZUNG_MAX,
  WERTE,
  befehlbar,
  bogenErhoeht,
  einheitVorlage,
  garrisonOf,
  isLandAt,
  isNestActive,
  knightMusterHex,
  lagerArt,
  nestFraktionOf,
  nextStep,
  settlementApproaches,
} from '../units';
import {
  BESATZUNG_UNGEORDNET,
  NEUTRAL,
  PALISADE,
  feindlich,
  imKampf,
  istKampf,
  istSpielerSeite,
  kampfFelder,
  seitenAuf,
  seiteVon,
  trifft,
} from '../combat';
import type { Seite } from '../combat';
import {
  ANFUEHRUNG,
  BOGEN_NAHKAMPF,
  BOGEN_REICHWEITE,
  BOGEN_REICHWEITE_ERHOEHT,
  MORAL_ANTEIL,
  NAME_AB_STUFE,
  STUFE_ANGRIFF,
  STUFE_LEBEN,
  deckungFuer,
  spielerSeite,
  stufeFuer,
} from '../combat';
import { terrainAt } from '../worldgen';
import { fraktionById } from '../factions';
import type { FraktionArt } from '../factions';
import { raidLoss, takeFromLargest } from './raid';
import { roundOf } from '../season';
import { einheitenRasten } from '../zeit';
import { feuerLegen } from './feuer';
import type { FeuerEvent } from './feuer';

/**
 * Lager bis zu dieser Entfernung von einer Siedlung schicken Raubzuege.
 *
 * Eine erste Fassung nahm 10. Im Spiel brachen damit in Runde 6 sechs Raubzuege
 * gleichzeitig auf - auf den grossen Kontinenten liegen im Zehnerumkreis schnell
 * fuenf, sechs Lager. Sechs Karten Verlust je grosser Runde gegen einen einzigen
 * Ritter ist keine Bedrohung mehr, sondern eine Steuer. Deshalb 8 - und dazu
 * die Obergrenze je Runde (maxAufbrueche).
 */
export const SPAWN_RANGE = 8;

/**
 * Wie viele Raubzuege je grosser Runde hoechstens aufbrechen: einer mehr, als
 * Spieler am Tisch sitzen - allein also zwei. Die naechsten Lager zuerst, damit
 * die Gefahr von dort kommt, wo man sie sieht.
 */
export const maxAufbrueche = (spieler: number): number => 1 + spieler;

/** Ab diesem Wurf uebersteht ein Ritter einen Hinterhalt in einer Ruine. */
export const HINTERHALT_UEBERSTEHT_AB = 3;
/** Wie weit eine alte Karte aus einer Ruine aufdeckt. */
export const KARTE_RADIUS = 8;
/** Wie weit ein Ritter beim Ziehen aufdeckt - wie beim Bauen. */
const ERKUNDUNG_RADIUS = 3;
/** Wie weit der Held beim Ziehen aufdeckt. */
const ERKUNDUNG_HELD = 4;
/** Felder je Runde fuer den Helden und sein Gefolge. */
export const HELD_SCHRITTE = 2;
/**
 * DIE NACHT. Mit ihrem Beginn kriechen Schleime aus dem Dunkel: je Spieler
 * einige, in Abstand SCHLEIM_ABSTAND zu seinen Siedlungen, also ausserhalb der
 * Sicht. Sie ziehen auf die Siedlungen zu und greifen an, was ihnen begegnet -
 * pluendern aber nichts und legen kein Feuer. Bei Tagesanbruch verschwinden
 * sie nicht, sie werden nur friedfertig (Auftrag 'ruht'); wer sie erschlaegt,
 * bekommt Gelee ins Inventar.
 */
export const SCHLEIM_JE_NACHT = 2;
export const SCHLEIM_ABSTAND = 4;
/** Was ein erschlagener Schleim hinterlaesst (Player.inventar). */
export const GELEE = 'gelee';

/** Wie weit ein Geschuetzturm schiesst - von jedem seiner drei Nachbarfelder aus. */
export const TURM_REICHWEITE = 2;
/** Womit er trifft: wie ein Bogenschuetze, aber er steht fest und ruhig. */
export const TURM_ANGRIFF = 3;

/** Nach so vielen Runden kehrt ein gefallener Held zurueck. */
export const HELD_RUECKKEHR = 10;

/** Wie weit ein Lager ein feindliches angreift. */
export const FEHDE_REICHWEITE = 7;
/**
 * Fehden gibt es nur nahe den Spielern: was weit draussen geschieht, sieht
 * niemand, und die Wegsuche soll nicht die halbe Welt abgehen.
 */
const FEHDE_UM_SIEDLUNGEN = SPAWN_RANGE + 4;
/** So viele ziehen in eine Fehde. */
export const FEHDE_TRUPP = 2;
/** Chance je grosser Runde auf eine neue Fehde - hoechstens eine ist unterwegs. */
const FEHDE_CHANCE = 0.5;

/** Wie viele Runden ein Wanderer bleibt. */
export const WANDERER_DAUER = 20;
/** Hoechstens so viele Wanderer gleichzeitig: einer je Spieler. */
export const maxWanderer = (spieler: number): number => spieler;
/** Chance je grosser Runde, dass ein Wanderer auftaucht. */
const WANDERER_CHANCE = 0.6;

/** So weit sucht ein Heimkehrer ein anderes Lager seiner Fraktion, wenn seines fiel. */
const HEIMKEHR_SUCHE = 12;
const SUCHE_RITTER = 2500;
const SUCHE_RAEUBER = 900;
const UINT = 4294967296;

type Feind = FraktionArt;

/** Gefallene je Seite und Art. 'besatzung' zaehlt Verteidiger eines Lagers. */
export type Verlust = { seite: Seite; kind: UnitKind | 'besatzung'; anzahl: number };

export type ArmyEvent =
  /** Ein Ritter oder Bogenschuetze tritt an (kind fehlt bei alten Staenden: Ritter). */
  | { t: 'knightReady'; player: PlayerId; unit: number; q: number; r: number; kind?: 'ritter' | 'bogen' }
  | {
      /** Bogenschuetzen eines Spielers haben diese Runde auf ein Feld geschossen (beschuss). */
      t: 'volley';
      player: PlayerId;
      /** Wo die Schuetzen stehen - der erste von ihnen. */
      q: number;
      r: number;
      /** Das beschossene Feld. */
      zq: number;
      zr: number;
      schuesse: number;
      treffer: number;
      verluste: Verlust[];
    }
  | {
      t: 'march';
      round: number;
      parties: { q: number; r: number; kind: Feind; fraktion: string }[];
    }
  | {
      t: 'feud';
      round: number;
      q: number;
      r: number;
      fraktion: string;
      gegen: string;
      zq: number;
      zr: number;
      anzahl: number;
    }
  | { t: 'wanderer'; q: number; r: number }
  /** Eine Einheit ist eine Stufe aufgestiegen - mit Namen, wenn sie sich einen verdient hat. */
  | { t: 'levelUp'; unit: number; player: PlayerId; stufe: number; name: string | null }
  /** Eine Seite hat zu viele verloren und weicht auf ein Nachbarfeld aus. */
  | {
      t: 'retreat';
      seite: Seite;
      von: { q: number; r: number };
      nach: { q: number; r: number };
      anzahl: number;
    }
  /** So viele Schleime sind mit der Nacht aus dem Dunkel gekrochen. */
  | { t: 'slimes'; anzahl: number }
  /** So viele Schleime sind im Morgengrauen friedfertig geworden. */
  | { t: 'slimesRest'; anzahl: number }
  | {
      /** Eine Kampfrunde auf einem Feld. */
      t: 'fight';
      q: number;
      r: number;
      /** Wer zu Beginn der Runde auf dem Feld kaempfte. */
      seiten: Seite[];
      /** Der Kampf hat in dieser Runde begonnen. */
      neu: boolean;
      /** Der Kampf ist mit dieser Runde vorbei. */
      ende: boolean;
      /** Wer am Ende steht - null, solange es weitergeht oder niemand bleibt. */
      sieger: Seite | null;
      verluste: Verlust[];
      /**
       * Jeder Treffer dieser Runde, je getroffener Einheit. Damit zeigt der
       * Client, wer wie viel abbekommen hat - Zahl ueber der Figur, rotes
       * Aufblitzen (DESIGN.md, Kampf sehen). Fehlt bei alten Staenden.
       */
      treffer?: { unit: number; seite: Seite; anzahl: number; gefallen: boolean }[];
    }
  | {
      t: 'plunder';
      round: number;
      player: PlayerId;
      kind: Feind;
      fraktion: string;
      q: number;
      r: number;
      /** Was genommen wurde. Fuer Fremde redigiert (redact.ts). */
      taken: Hand;
      count: number;
    }
  | { t: 'homecoming'; q: number; r: number; fraktion: string; count: number }
  | {
      /** Ein Ritter hat einem Raeuber die Beute abgenommen. */
      t: 'lootRecovered';
      player: PlayerId;
      q: number;
      r: number;
      /** Fuer Fremde redigiert (redact.ts). */
      taken: Hand;
      count: number;
    }
  | { t: 'nestDestroyed'; q: number; r: number; kind: Feind; fraktion: string; players: PlayerId[] }
  | { t: 'nestCaptured'; q: number; r: number; von: string; an: string }
  | {
      t: 'ruin';
      q: number;
      r: number;
      player: PlayerId;
      result: RuinResult;
      gained: Hand;
      knightLost: boolean;
      /** Der Held hat sie erkundet. */
      held: boolean;
    }
  | {
      /** Nachts: eine Goblin-Horde bricht auf. */
      t: 'horde';
      round: number;
      q: number;
      r: number;
      fraktion: string;
      anzahl: number;
    }
  /** Der Held tritt an - zu Beginn oder nach seinem Fall (zurueck). */
  | { t: 'heroReady'; player: PlayerId; unit: number; q: number; r: number; zurueck: boolean }
  /** Der Held ist gefallen und kehrt in Zug zurueck wieder. */
  | { t: 'heroFell'; player: PlayerId; q: number; r: number; zurueck: number }
  /** Feuer: gelegt, abgewehrt, geloescht, abgebrannt (rules/feuer.ts). */
  | FeuerEvent
  | { t: 'chunks'; coords: ChunkCoord[] };

/** Nimmt Heeresereignisse auf - ein GameEvent[] passt hinein. */
type Ereignisse = { push(...e: ArmyEvent[]): number };

const wurf = (rng: Rng): number => 1 + rng.int(6);
const nachNummer = (a: UnitState, b: UnitState): number => a.id - b.id;
const nachSchluessel = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const feld = (k: string): Hex => {
  const [q, r] = k.split(':').map(Number);
  return { q: q!, r: r! };
};

function aufstellen(s: GameState, vorlage: Omit<UnitState, 'id'>): UnitState {
  const u: UnitState = { ...vorlage, id: s.nextUnitId++ };
  s.units.push(u);
  return u;
}

function entfernen(s: GameState, weg: readonly UnitState[]): void {
  s.units = s.units.filter((x) => !weg.includes(x));
}

/** Welt um ein Feld wachsen lassen und die neuen Chunks melden - wie beim Bauen. */
function wachsen(
  s: GameState,
  world: World,
  h: { q: number; r: number },
  radius: number,
  events: Ereignisse,
): void {
  const neu = ensureGenerated(world, h, radius);
  if (neu.length === 0) return;
  s.chunks.push(...neu);
  events.push({ t: 'chunks', coords: neu });
}

// --- Beute -----------------------------------------------------------------

/** Beute aufladen. Stammt sie von verschiedenen Beraubten, weiss keiner mehr, was es ist. */
function ladeAuf(u: UnitState, hand: Hand, beraubt: PlayerId | null): void {
  const vorher = u.traegt;
  if (!u.fracht) u.fracht = emptyHand();
  for (const r of RESOURCES) u.fracht[r] += hand[r];
  u.traegt = handSize(u.fracht);
  u.beraubt = vorher === 0 || u.beraubt === beraubt ? beraubt : null;
}

/** Was niemand mehr traegt, ist fort - die Bank ist unendlich und fuehrt keinen Bestand. */
function frachtZurBank(s: GameState, u: UnitState): void {
  void s;
  u.fracht = null;
  u.traegt = 0;
  u.beraubt = null;
}

/** Die Beute eines Gefallenen geht an den, der ihn schlug. */
function uebergib(s: GameState, tot: UnitState, erbe: UnitState, events: Ereignisse): void {
  const fracht = tot.fracht ?? emptyHand();
  const count = tot.traegt;
  if (erbe.owner !== null) {
    const p = playerById(s, erbe.owner);
    if (p) {
      for (const r of RESOURCES) p.hand[r] += fracht[r];
      events.push({ t: 'lootRecovered', player: erbe.owner, q: erbe.q, r: erbe.r, taken: { ...fracht }, count });
    }
  } else {
    ladeAuf(erbe, fracht, tot.beraubt);
    // Wer Beute gemacht hat, bringt sie heim.
    if (erbe.auftrag === 'raub' || erbe.auftrag === 'fehde') {
      erbe.auftrag = 'heimkehr';
      erbe.ziel = null;
    }
  }
  tot.fracht = null;
  tot.traegt = 0;
  tot.beraubt = null;
}

// --- Aufbruch zu Beginn der grossen Runde -----------------------------------

/**
 * Den Helden eines Spielers antreten lassen - an einer eigenen Siedlung, auf der
 * Seite der naechsten Gefahr, lieber auf einem Feld ohne Zahl (Wueste), wenn
 * eines anliegt. null ohne Siedlung oder wenn er schon steht.
 */
export function spawnHeld(s: GameState, id: PlayerId, events: Ereignisse): UnitState | null {
  if (s.units.some((u) => u.kind === 'held' && u.owner === id)) return null;
  const feldAn = knightMusterHex(s, id, true);
  if (!feldAn) return null;
  const p = playerById(s, id);
  const zurueck = p?.heldZurueck !== null && p?.heldZurueck !== undefined;
  if (p) benenneHeld(s, p);
  const unit = aufstellen(s, einheitVorlage('held', feldAn.q, feldAn.r, { owner: id }));
  if (p) p.heldZurueck = null;
  events.push({ t: 'heroReady', player: id, unit: unit.id, q: unit.q, r: unit.r, zurueck });
  return unit;
}

/**
 * Dafuer sorgen, dass der Held dieses Spielers einen Namen hat (core/lore.ts).
 * Wer schon einen hat, behaelt ihn: der gefallene Held kehrt als derselbe
 * zurueck. Der Nachfolger aus dem Adelshaus kommt spaeter (DESIGN.md,
 * Heldenlore). Der Name kommt aus dem rngState - also vom Server.
 */
export function benenneHeld(s: GameState, p: GameState['players'][number]): HeldLore {
  if (p.held) return p.held;
  const rng = new Rng(s.rngState);
  const lore = wuerfleHeld(rng);
  s.rngState = rng.getState();
  p.held = lore;
  return lore;
}

/** Nach jeder Runde: gefallene Helden kehren zurueck, wenn ihre Zeit um ist. */
export function heldenRunde(s: GameState, events: Ereignisse): void {
  for (const p of s.players) {
    // Partien von vor der Heldenlore: der Held steht schon, nur der Name fehlt.
    if (!p.held && s.units.some((u) => u.kind === 'held' && u.owner === p.id)) benenneHeld(s, p);
    if (p.heldZurueck === null || s.turn < p.heldZurueck) continue;
    spawnHeld(s, p.id, events);
  }
}

/**
 * Einen Sieg gutschreiben: die Einheit zaehlt ihn, steigt vielleicht auf und
 * verdient sich ab NAME_AB_STUFE einen Namen (core/combat.ts, stufeFuer).
 * Jede Stufe hebt Angriff und Leben; das gewonnene Leben gibt es sofort, sonst
 * bliebe der Aufstieg mitten im Kampf ohne Wirkung.
 *
 * Nur fuer Einheiten eines Spielers - Raeuber und Schleime dienen sich nicht hoch.
 */
export function siegGutschreiben(s: GameState, u: UnitState, rng: Rng, events: Ereignisse): void {
  if (u.owner === null || !befehlbar(u.kind)) return;
  const vorher = stufeFuer(u.siege ?? 0);
  u.siege = (u.siege ?? 0) + 1;
  const jetzt = stufeFuer(u.siege);
  if (jetzt === vorher) return;
  u.stufe = jetzt;
  u.leben += STUFE_LEBEN * (jetzt - vorher);
  if (jetzt >= NAME_AB_STUFE && !u.name) u.name = einheitName(rng);
  events.push({ t: 'levelUp', unit: u.id, player: u.owner, stufe: jetzt, name: u.name ?? null });
}

/** Ein Stueck Gelee ins Inventar dieses Spielers (DESIGN.md, Inventar). */
export function gelee(s: GameState, id: PlayerId, anzahl = 1): void {
  const p = playerById(s, id);
  if (!p) return;
  if (!p.inventar) p.inventar = {};
  p.inventar[GELEE] = (p.inventar[GELEE] ?? 0) + anzahl;
}

/** Welche Spieler unter diesen Einheiten stehen - jeder nur einmal, nach Nummer. */
const spielerAuf = (leute: readonly UnitState[]): PlayerId[] =>
  [...new Set(leute.filter((x) => x.owner !== null).map((x) => x.owner!))].sort();

/** Ein Held faellt: sein Gefolge steht allein, und er kehrt spaeter zurueck. */
function heldFaellt(s: GameState, u: UnitState, events: Ereignisse): void {
  if (u.owner === null) return;
  const zurueck = s.turn + HELD_RUECKKEHR;
  const p = playerById(s, u.owner);
  if (p) p.heldZurueck = zurueck;
  for (const x of s.units) if (x.folgt === u.id) x.folgt = null;
  events.push({ t: 'heroFell', player: u.owner, q: u.q, r: u.r, zurueck });
}

/**
 * Wer mit dieser Fraktion im Krieg ist - fuer die Wahl der Raubziele. Frieden
 * und Tribut nehmen einen Spieler heraus (rules/diplomatie.ts).
 */
const imKriegMit = (s: GameState, fraktion: string | null) => (id: PlayerId): boolean =>
  fraktion === null || feindlich(spielerSeite(id), fraktion, s);

/** Einen Ritter - oder Bogenschuetzen - fuer diesen Spieler antreten lassen. null ohne Siedlung. */
export function spawnKnight(
  s: GameState,
  id: PlayerId,
  events: Ereignisse,
  kind: 'ritter' | 'bogen' = 'ritter',
): UnitState | null {
  const feldAn = knightMusterHex(s, id);
  if (!feldAn) return null;
  const unit = aufstellen(s, einheitVorlage(kind, feldAn.q, feldAn.r, { owner: id }));
  events.push({ t: 'knightReady', player: id, unit: unit.id, q: unit.q, r: unit.r, kind });
  return unit;
}

/**
 * Raubzuege losschicken - zum Beginn jeder grossen Runde.
 *
 * Aktive Lager bis SPAWN_RANGE von einer Siedlung schicken einen Raubzug, sofern
 * keiner von dort schon unterwegs ist und ein Landweg existiert - die naechsten
 * zuerst, hoechstens maxAufbrueche je Runde. Lager weiter draussen bleiben
 * ruhig: auf einer Karte ohne Rand wuerde sonst die ganze Welt marschieren.
 */
export function sendRaiders(s: GameState, events: Ereignisse): void {
  const ziele = settlementApproaches(s);
  if (ziele.size === 0) return;

  // Aktive Lager in Reichweite, jeweils mit dem Abstand zur naechsten Siedlung.
  const lager = new Map<string, { q: number; r: number; d: number }>();
  for (const [k, owner] of ziele) {
    const an = feld(k);
    for (const c of hexesInRange(an, SPAWN_RANGE)) {
      if (!isNestActive(s, c.q, c.r)) continue;
      if (!imKriegMit(s, nestFraktionOf(s, c.q, c.r))(owner)) continue;
      const ck = hexKey(c.q, c.r);
      const d = hexDistance(an, c);
      const bisher = lager.get(ck);
      if (!bisher || d < bisher.d) lager.set(ck, { q: c.q, r: c.r, d });
    }
  }

  const unterwegs = new Set(
    s.units.map((u) => u.heimat).filter((h): h is string => h !== null),
  );
  const grenze = maxAufbrueche(s.order.length);
  const parties: { q: number; r: number; kind: Feind; fraktion: string }[] = [];
  const reihe = [...lager].sort((a, b) => a[1].d - b[1].d || nachSchluessel(a[0], b[0]));
  for (const [k, nest] of reihe) {
    if (parties.length >= grenze) break;
    if (unterwegs.has(k)) continue;
    const fraktion = nestFraktionOf(s, nest.q, nest.r);
    const zielSet = new Set(settlementApproaches(s, undefined, imKriegMit(s, fraktion)).keys());
    const schonDa = zielSet.has(k);
    const weg = schonDa ? null : nextStep(s.worldSeed, nest, zielSet, SUCHE_RAEUBER);
    if (!weg && !schonDa) continue;
    // Die Art der Fraktion meldet das Ereignis, die Art der Einheit stellt an.
    const art = fraktionById(s.worldSeed, fraktion).art;
    aufstellen(
      s,
      einheitVorlage(lagerArt(art), nest.q, nest.r, {
        fraktion,
        heimat: k,
        auftrag: 'raub',
        ziel: weg ? weg.ziel : { q: nest.q, r: nest.r },
      }),
    );
    parties.push({ q: nest.q, r: nest.r, kind: art, fraktion });
  }
  if (parties.length > 0) events.push({ t: 'march', round: roundOf(s.turn), parties });
}

/**
 * Eine Fehde anzetteln: ein Lager nahe den Spielern schickt einen Trupp gegen
 * ein feindliches Lager in der Naehe. Hoechstens eine Fehde ist unterwegs, und
 * nicht jede grosse Runde bringt eine.
 */
export function sendFeud(s: GameState, rng: Rng, events: Ereignisse): void {
  if (s.units.some((u) => u.auftrag === 'fehde')) return;
  if (rng.next() / UINT >= FEHDE_CHANCE) return;
  const ziele = settlementApproaches(s);
  if (ziele.size === 0) return;

  const lager = new Map<string, Hex>();
  const geprueft = new Set<string>();
  for (const k of ziele.keys()) {
    for (const c of hexesInRange(feld(k), FEHDE_UM_SIEDLUNGEN)) {
      const ck = hexKey(c.q, c.r);
      if (geprueft.has(ck)) continue;
      geprueft.add(ck);
      if (isNestActive(s, c.q, c.r)) lager.set(ck, c);
    }
  }

  const unterwegs = new Set(s.units.map((u) => u.heimat).filter((h): h is string => h !== null));
  const paare: { von: Hex; vk: string; nach: Hex; nk: string }[] = [];
  for (const [vk, von] of [...lager].sort((a, b) => nachSchluessel(a[0], b[0]))) {
    if (unterwegs.has(vk) || garrisonOf(s, von.q, von.r) < FEHDE_TRUPP) continue;
    const eigene = nestFraktionOf(s, von.q, von.r);
    for (const c of hexesInRange(von, FEHDE_REICHWEITE)) {
      if (!isNestActive(s, c.q, c.r)) continue;
      if (!feindlich(eigene, nestFraktionOf(s, c.q, c.r), s)) continue;
      paare.push({ von, vk, nach: c, nk: hexKey(c.q, c.r) });
    }
  }

  for (let versuch = 0; versuch < 4 && paare.length > 0; versuch++) {
    const p = paare.splice(rng.int(paare.length), 1)[0]!;
    if (!nextStep(s.worldSeed, p.von, new Set([p.nk]), SUCHE_RAEUBER)) continue;
    const fraktion = nestFraktionOf(s, p.von.q, p.von.r);
    const kind = lagerArt(fraktionById(s.worldSeed, fraktion).art);
    for (let i = 0; i < FEHDE_TRUPP; i++) {
      aufstellen(
        s,
        einheitVorlage(kind, p.von.q, p.von.r, {
          fraktion,
          heimat: p.vk,
          auftrag: 'fehde',
          ziel: { q: p.nach.q, r: p.nach.r },
        }),
      );
    }
    events.push({
      t: 'feud',
      round: roundOf(s.turn),
      q: p.von.q,
      r: p.von.r,
      fraktion,
      gegen: nestFraktionOf(s, p.nach.q, p.nach.r),
      zq: p.nach.q,
      zr: p.nach.r,
      anzahl: FEHDE_TRUPP,
    });
    return;
  }
}

/**
 * Einen Wanderer auftauchen lassen: ein Stueck draussen, mit dem ersten Ziel an
 * einer Siedlung, damit man ihn vorbeiziehen sieht. Er ist neutral - noch tut er
 * nichts, er ist der Platz fuer Begegnungen, die spaeter kommen.
 */
export function sendWanderer(s: GameState, rng: Rng, events: Ereignisse): void {
  const zahl = s.units.filter((u) => u.kind === 'wanderer').length;
  if (zahl >= maxWanderer(s.order.length)) return;
  if (rng.next() / UINT >= WANDERER_CHANCE) return;
  const ziele = [...settlementApproaches(s).keys()];
  if (ziele.length === 0) return;
  const an = feld(ziele[rng.int(ziele.length)]!);
  const seed = s.worldSeed;
  const starts = hexesInRange(an, 9).filter(
    (h) => hexDistance(h, an) >= 7 && isLandAt(seed, h.q, h.r) && !isNestActive(s, h.q, h.r),
  );
  for (let versuch = 0; versuch < 4 && starts.length > 0; versuch++) {
    const start = starts.splice(rng.int(starts.length), 1)[0]!;
    if (!nextStep(seed, start, new Set([hexKey(an.q, an.r)]), SUCHE_RAEUBER)) continue;
    aufstellen(
      s,
      einheitVorlage('wanderer', start.q, start.r, { ziel: an, dauer: WANDERER_DAUER }),
    );
    events.push({ t: 'wanderer', q: start.q, r: start.r });
    return;
  }
}

/** Was zu Beginn jeder grossen Runde aufbricht. Nach dem Ziehen, damit Frische nicht sofort handeln. */
export function beginBigRound(s: GameState, events: Ereignisse): void {
  sendRaiders(s, events);
  const rng = new Rng(s.rngState);
  sendFeud(s, rng, events);
  sendWanderer(s, rng, events);
  s.rngState = rng.getState();
}

// --- Die Nacht -----------------------------------------------------------------

/** Wie viele Goblins eine Horde zaehlt: drei und einer je Spieler, hoechstens sechs. */
export const hordeGroesse = (spieler: number): number => Math.min(6, 3 + spieler);
/** Chance, dass eine Nacht eine Horde bringt. */
const HORDE_CHANCE = 0.6;
/** Wie weit ein Goblinlager fuer eine Horde ausholt - weiter als ein Raubzug. */
const HORDE_REICHWEITE = SPAWN_RANGE + 4;

/** Zu Beginn jeder Nacht (core/zeit.ts). */
export function beginNight(s: GameState, events: Ereignisse): void {
  const rng = new Rng(s.rngState);
  sendHorde(s, rng, events);
  // Was vom letzten Mal noch herumliegt, wacht mit auf.
  for (const u of s.units) if (u.kind === 'schleim') u.auftrag = 'jagd';
  nachtVolk(s, rng, events);
  s.rngState = rng.getState();
}

/**
 * Tagesanbruch: die Schleime werden friedfertig. Sie bleiben liegen, wo sie
 * sind - anders als Wanderer verschwinden sie nie -, und solange sie ruhen,
 * ist ihre Seite NEUTRAL (core/combat.ts, seiteVon). Ein laufender Kampf
 * endet damit von selbst.
 */
export function beginDay(s: GameState, events: Ereignisse): void {
  let wach = 0;
  for (const u of s.units) {
    if (u.kind !== 'schleim' || u.auftrag === 'ruht') continue;
    u.auftrag = 'ruht';
    u.ziel = null;
    wach += 1;
  }
  if (wach > 0) events.push({ t: 'slimesRest', anzahl: wach });
}

/**
 * Schleime aus dem Dunkel: je Spieler mit Siedlungen SCHLEIM_JE_NACHT Stueck,
 * auf Landfeldern in SCHLEIM_ABSTAND um seine Siedlungen - weit genug, dass
 * sie aus dem Nebel kommen, nah genug, dass sie vor dem Morgen ankommen.
 * Nicht auf Lagern, nicht auf Feldern, auf denen schon jemand steht.
 */
export function nachtVolk(s: GameState, rng: Rng, events: Ereignisse): void {
  let neu = 0;
  for (const p of s.players) {
    const eigene = [...settlementApproaches(s, p.id).keys()].map(feld);
    if (eigene.length === 0) continue;
    const plaetze = new Map<string, Hex>();
    for (const an of eigene) {
      for (const h of hexesInRange(an, SCHLEIM_ABSTAND)) {
        if (hexDistance(an, h) < SCHLEIM_ABSTAND) continue;
        const k = hexKey(h.q, h.r);
        if (plaetze.has(k)) continue;
        if (!isLandAt(s.worldSeed, h.q, h.r) || isNestActive(s, h.q, h.r)) continue;
        if (s.units.some((x) => x.q === h.q && x.r === h.r)) continue;
        plaetze.set(k, h);
      }
    }
    const frei = [...plaetze.values()].sort((a, b) => nachSchluessel(hexKey(a.q, a.r), hexKey(b.q, b.r)));
    for (let i = 0; i < SCHLEIM_JE_NACHT && frei.length > 0; i++) {
      const h = frei.splice(rng.int(frei.length), 1)[0]!;
      aufstellen(
        s,
        einheitVorlage('schleim', h.q, h.r, { fraktion: NACHT_ID, auftrag: 'jagd' }),
      );
      neu += 1;
    }
  }
  if (neu > 0) events.push({ t: 'slimes', anzahl: neu });
}

/**
 * Eine Goblin-Horde losschicken: das naechste Goblinlager mit Landweg schickt
 * hordeGroesse Goblins auf einmal gegen die Siedlungen. Sie ziehen als ein
 * Haufen, pluendern jeder fuer sich und legen jeder fuer sich Feuer - eine
 * Horde, die ankommt, ist ein Ereignis, kein Nadelstich.
 */
export function sendHorde(s: GameState, rng: Rng, events: Ereignisse): void {
  if (rng.next() / UINT >= HORDE_CHANCE) return;
  const ziele = settlementApproaches(s);
  if (ziele.size === 0) return;

  const lager = new Map<string, { q: number; r: number; d: number }>();
  for (const [k, owner] of ziele) {
    const an = feld(k);
    for (const c of hexesInRange(an, HORDE_REICHWEITE)) {
      if (!isNestActive(s, c.q, c.r)) continue;
      const ck = hexKey(c.q, c.r);
      const d = hexDistance(an, c);
      const bisher = lager.get(ck);
      if (bisher && bisher.d <= d) continue;
      if (fraktionById(s.worldSeed, nestFraktionOf(s, c.q, c.r)).art !== 'goblin') continue;
      if (!imKriegMit(s, nestFraktionOf(s, c.q, c.r))(owner)) continue;
      lager.set(ck, { q: c.q, r: c.r, d });
    }
  }

  const reihe = [...lager].sort((a, b) => a[1].d - b[1].d || nachSchluessel(a[0], b[0]));
  for (const [k, nest] of reihe) {
    const fraktion = nestFraktionOf(s, nest.q, nest.r);
    const zielSet = new Set(settlementApproaches(s, undefined, imKriegMit(s, fraktion)).keys());
    const weg = nextStep(s.worldSeed, nest, zielSet, SUCHE_RAEUBER * 2);
    if (!weg) continue;
    const anzahl = hordeGroesse(s.order.length);
    for (let i = 0; i < anzahl; i++) {
      aufstellen(
        s,
        einheitVorlage('goblin', nest.q, nest.r, { fraktion, heimat: k, auftrag: 'raub', ziel: weg.ziel }),
      );
    }
    events.push({ t: 'horde', round: roundOf(s.turn), q: nest.q, r: nest.r, fraktion, anzahl });
    return;
  }
}

// --- Brandschatzen --------------------------------------------------------------
//
// Steht jetzt in rules/feuer.ts (feuerLegen): das Feuer brennt erst eine Runde
// und laesst sich loeschen, bevor es abbrennt.

// --- Die Runde ---------------------------------------------------------------

/** Eine Ruine unter einem Ritter erkunden. */
function erkunde(
  s: GameState,
  world: World,
  rng: Rng,
  u: UnitState,
  events: Ereignisse,
): void {
  s.exploredRuins.push(hexKey(u.q, u.r));
  const owner = u.owner!;
  const p = playerById(s, owner);
  // Der Held kennt die alten Wege: ein Auge mehr - kein Hinterhalt, eher Beute.
  const held = u.kind === 'held';
  const result = ruinResultFor(Math.min(6, wurf(rng) + (held ? 1 : 0)));
  const gained = emptyHand();
  let knightLost = false;

  if (result === 'hinterhalt') {
    if (wurf(rng) < HINTERHALT_UEBERSTEHT_AB) {
      entfernen(s, [u]);
      knightLost = true;
    }
  } else if (result === 'schatz' && p) {
    for (let i = 0; i < 3; i++) {
      const r = RESOURCES[rng.int(RESOURCES.length)]!;
      p.hand[r] += 1;
      gained[r] += 1;
    }
  } else if (result === 'beute' && p) {
    p.loot += 1;
  } else if (result === 'karte') {
    wachsen(s, world, u, KARTE_RADIUS, events);
  }
  events.push({ t: 'ruin', q: u.q, r: u.r, player: owner, result, gained, knightLost, held });
}

/** Das Lager, zu dem ein Heimkehrer zieht: sein eigenes, sonst das naechste seiner Fraktion. */
function heimFuer(s: GameState, u: UnitState): Hex | null {
  if (u.heimat) {
    const h = feld(u.heimat);
    if (isNestActive(s, h.q, h.r) && nestFraktionOf(s, h.q, h.r) === u.fraktion) return h;
  }
  let best: Hex | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of hexesInRange(u, HEIMKEHR_SUCHE)) {
    if (!isNestActive(s, c.q, c.r) || nestFraktionOf(s, c.q, c.r) !== u.fraktion) continue;
    const d = hexDistance(u, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Wie viele Felder die Suche eines Erkunders hoechstens abgeht. */
const ERKUNDEN_SUCHE = 1500;

/**
 * Wohin ein Erkunder zieht: zum naechsten Feld, das Neues bringt - eine
 * unerkundete Ruine oder Land, das noch niemand gesehen hat. Breitensuche ueber
 * Land, um Lager herum statt hindurch. null, wenn in Reichweite nichts mehr ist.
 */
function erkundungsziel(s: GameState, world: World, u: UnitState): Hex | null {
  const seed = s.worldSeed;
  const gesehen = new Set([hexKey(u.q, u.r)]);
  const warte: Hex[] = [{ q: u.q, r: u.r }];
  for (let i = 0; i < warte.length && gesehen.size < ERKUNDEN_SUCHE; i++) {
    const h = warte[i]!;
    for (const n of neighbors(h.q, h.r)) {
      const k = hexKey(n.q, n.r);
      if (gesehen.has(k) || !isLandAt(seed, n.q, n.r)) continue;
      gesehen.add(k);
      if (isNestActive(s, n.q, n.r)) continue;
      if (!isGenerated(world, n.q, n.r)) return n;
      if (ruinAt(seed, n.q, n.r) && !s.exploredRuins.includes(k)) return n;
      warte.push(n);
    }
  }
  return null;
}

/** Bringt dieses Ziel einem Erkunder noch etwas? */
function lohntSich(s: GameState, world: World, z: Hex): boolean {
  if (!isGenerated(world, z.q, z.r)) return true;
  return ruinAt(s.worldSeed, z.q, z.r) && !s.exploredRuins.includes(hexKey(z.q, z.r));
}

/** Ein neues Ziel fuer einen Wanderer, fuenf bis acht Felder weiter. */
function wanderziel(s: GameState, rng: Rng, von: Hex): Hex | null {
  const kandidaten = hexesInRange(von, 8).filter(
    (h) =>
      hexDistance(h, von) >= 5 && isLandAt(s.worldSeed, h.q, h.r) && !isNestActive(s, h.q, h.r),
  );
  for (let versuch = 0; versuch < 4 && kandidaten.length > 0; versuch++) {
    const h = kandidaten.splice(rng.int(kandidaten.length), 1)[0]!;
    if (nextStep(s.worldSeed, von, new Set([hexKey(h.q, h.r)]), 600)) return h;
  }
  return null;
}

/**
 * Ritter und Held gehen bis zu `schritte` Felder auf ihr Ziel zu, decken dabei
 * auf, erkunden Ruinen am Weg und bleiben vor Feinden stehen. true, wenn sie
 * gezogen sind.
 */
function schreite(
  s: GameState,
  world: World,
  rng: Rng,
  u: UnitState,
  schritte: number,
  events: Ereignisse,
): boolean {
  const seed = s.worldSeed;
  let gezogen = false;
  for (let i = 0; i < schritte && u.ziel; i++) {
    const zk = hexKey(u.ziel.q, u.ziel.r);
    const weg = nextStep(seed, u, new Set([zk]), SUCHE_RITTER);
    if (weg) {
      u.q = weg.step.q;
      u.r = weg.step.r;
      gezogen = true;
      wachsen(s, world, u, u.kind === 'held' ? ERKUNDUNG_HELD : ERKUNDUNG_RADIUS, events);
    }
    // Am Ziel oder ohne Weg: der Befehl ist erledigt. Die Schar bleibt beisammen -
    // ihr Banner loest erst ein neuer Einzelbefehl oder "Aufloesen".
    if (!weg || hexKey(u.q, u.r) === zk) {
      u.ziel = null;
    }
    if (!weg) break;
    if (u.owner !== null && ruinAt(seed, u.q, u.r) && !s.exploredRuins.includes(hexKey(u.q, u.r))) {
      erkunde(s, world, rng, u, events);
      if (!s.units.includes(u)) return true;
    }
    if (imKampf(s, u)) break;
  }
  return gezogen;
}

/** Ein Schritt. true, wenn die Einheit gezogen ist. */
function ziehe(
  s: GameState,
  world: World,
  rng: Rng,
  u: UnitState,
  /** Die Siedlungsfelder, die fuer diese Fraktion Ziel sind. */
  zieleFuer: (fraktion: string | null) => ReadonlySet<string>,
  events: Ereignisse,
): boolean {
  const seed = s.worldSeed;
  const schritt = (h: Hex) => {
    u.q = h.q;
    u.r = h.r;
  };

  switch (u.auftrag) {
    case 'erkunden': {
      // Ein Ziel, das nichts mehr bringt - schon aufgedeckt, schon erkundet -,
      // wird gegen das naechste getauscht.
      if (!u.ziel || (u.q === u.ziel.q && u.r === u.ziel.r) || !lohntSich(s, world, u.ziel)) {
        u.ziel = erkundungsziel(s, world, u);
      }
      if (!u.ziel) {
        // Nichts mehr zu entdecken in Reichweite: stehen bleiben.
        u.auftrag = 'befehl';
        return false;
      }
      return schreite(s, world, rng, u, u.kind === 'held' ? HELD_SCHRITTE : 1, events);
    }

    case 'befehl': {
      // Im Verband: im Tempo des Langsamsten, also ein Feld - es sei denn, der
      // Held zieht mit. Er gibt sein Tempo an seine Schar weiter, wie an sein
      // Gefolge. Ob der Verband wartet, weil einer kaempft, entscheidet
      // tickArmy vor dem Ziehen.
      if (u.verband !== null) {
        const genossen = s.units.filter((x) => x.verband === u.verband && x.owner === u.owner);
        if (genossen.length > 1) {
          const mitHeld = genossen.some((x) => x.kind === 'held');
          return schreite(s, world, rng, u, mitHeld ? HELD_SCHRITTE : 1, events);
        }
        u.verband = null;
      }
      // Im Gefolge: das Ziel ist, wo der Held gerade steht.
      let fuehrer: UnitState | undefined;
      if (u.folgt !== null) {
        fuehrer = s.units.find((x) => x.id === u.folgt && x.owner === u.owner && x.kind === 'held');
        if (!fuehrer) {
          u.folgt = null;
          u.ziel = null;
          return false;
        }
        u.ziel = u.q === fuehrer.q && u.r === fuehrer.r ? null : { q: fuehrer.q, r: fuehrer.r };
      }
      return schreite(s, world, rng, u, u.kind === 'held' || fuehrer ? HELD_SCHRITTE : 1, events);
    }

    case 'raub': {
      const siedlungen = zieleFuer(u.fraktion);
      const weg = siedlungen.size > 0 ? nextStep(seed, u, siedlungen, SUCHE_RAEUBER) : null;
      if (weg) {
        schritt(weg.step);
        u.ziel = weg.ziel;
        return true;
      }
      if (siedlungen.has(hexKey(u.q, u.r))) {
        u.ziel = { q: u.q, r: u.r };
        return false;
      }
      // Nichts zu holen: umkehren.
      u.auftrag = 'heimkehr';
      u.ziel = null;
      return false;
    }

    case 'fehde': {
      const z = u.ziel;
      if (
        !z ||
        u.fraktion === null ||
        !isNestActive(s, z.q, z.r) ||
        !feindlich(u.fraktion, nestFraktionOf(s, z.q, z.r), s)
      ) {
        u.auftrag = 'heimkehr';
        u.ziel = null;
        return false;
      }
      const weg = nextStep(seed, u, new Set([hexKey(z.q, z.r)]), SUCHE_RAEUBER);
      if (weg) {
        schritt(weg.step);
        return true;
      }
      if (u.q !== z.q || u.r !== z.r) {
        u.auftrag = 'heimkehr';
        u.ziel = null;
      }
      return false;
    }

    case 'heimkehr': {
      const heim = heimFuer(s, u);
      if (!heim) {
        // Kein Lager mehr: der Trupp zerstreut sich.
        frachtZurBank(s, u);
        entfernen(s, [u]);
        return false;
      }
      const hk = hexKey(heim.q, heim.r);
      u.heimat = hk;
      u.ziel = heim;
      const weg = nextStep(seed, u, new Set([hk]), SUCHE_RAEUBER);
      if (weg) {
        schritt(weg.step);
        return true;
      }
      if (hexKey(u.q, u.r) !== hk) {
        frachtZurBank(s, u);
        entfernen(s, [u]);
      }
      return false;
    }

    case 'ruht':
      // Bei Tag liegt der Schleim, wo er liegt.
      return false;

    case 'jagd': {
      // Zur naechsten Siedlung - und was im Weg steht, wird angegriffen.
      // Gepluendert und gebrannt wird nicht: die Nacht will kein Gut.
      const ziele = zieleFuer(u.fraktion);
      const weg = ziele.size > 0 ? nextStep(seed, u, ziele, SUCHE_RAEUBER) : null;
      if (!weg) return false;
      schritt(weg.step);
      return true;
    }

    case 'wandern': {
      if ((u.dauer ?? 0) <= 0) {
        entfernen(s, [u]);
        return false;
      }
      u.dauer = (u.dauer ?? 0) - 1;
      if (!u.ziel || (u.q === u.ziel.q && u.r === u.ziel.r)) u.ziel = wanderziel(s, rng, u);
      if (!u.ziel) return false;
      const weg = nextStep(seed, u, new Set([hexKey(u.ziel.q, u.ziel.r)]), SUCHE_RAEUBER);
      if (weg) {
        schritt(weg.step);
        return true;
      }
      u.ziel = null;
      return false;
    }
  }
}

/** Eine Kampfrunde auf einem Feld. */
function schlacht(
  s: GameState,
  rng: Rng,
  q: number,
  r: number,
  seiten: Seite[],
  neu: boolean,
  events: Ereignisse,
): void {
  const k = hexKey(q, r);
  const kaempfer = s.units
    .filter((u) => u.q === q && u.r === r && seiteVon(u) !== NEUTRAL)
    .sort(nachNummer);
  const lager = isNestActive(s, q, r);
  const lagerSeite = lager ? nestFraktionOf(s, q, r) : null;
  const besatzungVorher = lager ? garrisonOf(s, q, r) : 0;
  const besatzungArt = lagerSeite !== null ? fraktionById(s.worldSeed, lagerSeite).art : null;

  // Alle schlagen gleichzeitig: erst Treffer sammeln, dann anwenden.
  const schaden = new Map<number, number>();
  let besatzungTreffer = 0;
  const gelaende = terrainAt(s.worldSeed, q, r);
  /*
   * Erst das Ziel, dann der Wurf: wo einer steht, entscheidet mit, ob er
   * getroffen wird (core/combat.ts, deckungFuer). Frueher wurde gewuerfelt
   * und das Opfer danach gezogen - dann konnte Deckung nichts bewirken.
   */
  /** Wer zuletzt auf dieses Ziel traf - ihm gehoert der Sieg, wenn es faellt. */
  const letzterTreffer = new Map<number, UnitState>();
  const schlage = (seite: Seite, angriff: number, aufschlag: number, von?: UnitState) => {
    const einheiten = kaempfer.filter((x) => feindlich(seite, seiteVon(x), s));
    const plaetze = lagerSeite !== null && feindlich(seite, lagerSeite, s) ? besatzungVorher : 0;
    const anzahl = einheiten.length + plaetze;
    if (anzahl === 0) return;
    const i = rng.int(anzahl);
    const ziel = i < einheiten.length ? einheiten[i]! : null;
    const deckung = ziel ? deckungFuer(s, gelaende, ziel) : 0;
    if (!trifft(wurf(rng), angriff, aufschlag - deckung)) return;
    if (ziel) {
      schaden.set(ziel.id, (schaden.get(ziel.id) ?? 0) + 1);
      if (von) letzterTreffer.set(ziel.id, von);
    } else besatzungTreffer += 1;
  };
  for (const u of kaempfer) {
    const seite = seiteVon(u);
    const angefuehrt =
      u.kind === 'ritter' && kaempfer.some((x) => x.kind === 'held' && x.owner === u.owner) ? ANFUEHRUNG : 0;
    // Bogenschuetzen im Nahkampf treffen schlechter (combat.ts, BOGEN_NAHKAMPF).
    const nahkampf = u.kind === 'bogen' ? -BOGEN_NAHKAMPF : 0;
    // Wer sich hochgedient hat, trifft besser (core/combat.ts, STUFE_ANGRIFF).
    const stufe = STUFE_ANGRIFF * (u.stufe ?? 0);
    schlage(
      seite,
      WERTE[u.kind].angriff + angefuehrt + stufe,
      (lagerSeite !== null && seite !== lagerSeite ? -PALISADE : 0) + nahkampf,
      u,
    );
  }
  if (lagerSeite !== null && besatzungArt !== null) {
    for (let i = 0; i < besatzungVorher; i++) {
      schlage(lagerSeite, WERTE[lagerArt(besatzungArt)].angriff, -BESATZUNG_UNGEORDNET);
    }
  }

  const verluste = new Map<string, Verlust>();
  const zaehle = (seite: Seite, kind: Verlust['kind']) => {
    const key = seite + '|' + kind;
    const v = verluste.get(key);
    if (v) v.anzahl += 1;
    else verluste.set(key, { seite, kind, anzahl: 1 });
  };
  const gefallen: UnitState[] = [];
  // Jeder Treffer wird gemeldet, nicht nur der toedliche - der Client zeigt ihn an.
  const treffer: NonNullable<Extract<ArmyEvent, { t: 'fight' }>['treffer']> = [];
  for (const u of kaempfer) {
    const d = schaden.get(u.id) ?? 0;
    if (d === 0) continue;
    u.leben -= d;
    treffer.push({ unit: u.id, seite: seiteVon(u), anzahl: d, gefallen: u.leben <= 0 });
    if (u.leben <= 0) {
      gefallen.push(u);
      zaehle(seiteVon(u), u.kind);
    }
  }
  const besatzungVerlust = Math.min(besatzungTreffer, besatzungVorher);
  for (let i = 0; i < besatzungVerlust; i++) zaehle(lagerSeite!, 'besatzung');
  entfernen(s, gefallen);
  for (const tot of gefallen) if (tot.kind === 'held') heldFaellt(s, tot, events);
  const stehen = kaempfer.filter((x) => !gefallen.includes(x));
  // Gelee: jeder erschlagene Schleim hinterlaesst es denen, die ihn erschlugen.
  for (const tot of gefallen) {
    if (tot.kind !== 'schleim') continue;
    for (const o of spielerAuf(stehen)) gelee(s, o);
  }
  // Siege: wer den letzten Treffer setzte, dient sich hoch - wenn er noch steht.
  for (const tot of gefallen) {
    const sieger = letzterTreffer.get(tot.id);
    if (sieger && stehen.includes(sieger)) siegGutschreiben(s, sieger, rng, events);
  }

  /*
   * Moral: wer in einer Runde mindestens die Haelfte seiner Leute verliert,
   * weicht aus, statt bis zum letzten Mann zu fallen (combat.ts,
   * MORAL_ANTEIL). Der Held bleibt stehen - und wer bei ihm steht, auch.
   * Ein verlorener Kampf ist damit kein Totalverlust mehr.
   */
  for (const seite of seiten) {
    const vorher = kaempfer.filter((x) => seiteVon(x) === seite).length;
    const tot = gefallen.filter((x) => seiteVon(x) === seite).length;
    if (vorher === 0 || tot === 0 || tot / vorher < MORAL_ANTEIL) continue;
    const rest = stehen.filter((x) => seiteVon(x) === seite);
    if (rest.length === 0 || rest.some((x) => x.kind === 'held')) continue;
    const weg = neighbors(q, r).find(
      (h) =>
        isLandAt(s.worldSeed, h.q, h.r) &&
        !isNestActive(s, h.q, h.r) &&
        !s.units.some((x) => x.q === h.q && x.r === h.r && feindlich(seite, seiteVon(x), s)),
    );
    if (!weg) continue;
    for (const x of rest) {
      x.q = weg.q;
      x.r = weg.r;
      x.ziel = null;
      x.verband = null;
    }
    events.push({ t: 'retreat', seite, von: { q, r }, nach: { q: weg.q, r: weg.r }, anzahl: rest.length });
  }

  // Beute der Gefallenen: an einen Feind, der noch steht, sonst an einen Kameraden.
  for (const tot of gefallen) {
    if (tot.traegt === 0 && !tot.fracht) continue;
    const seite = seiteVon(tot);
    const feinde = stehen.filter((x) => feindlich(seite, seiteVon(x), s));
    const kameraden = stehen.filter((x) => seiteVon(x) === seite);
    const erben = feinde.length > 0 ? feinde : kameraden;
    if (erben.length === 0) frachtZurBank(s, tot);
    else uebergib(s, tot, erben[rng.int(erben.length)]!, events);
  }

  // Das Lager.
  if (lagerSeite !== null && besatzungArt !== null && besatzungVerlust > 0) {
    const rest = besatzungVorher - besatzungVerlust;
    if (rest > 0) {
      s.nestGarrison[k] = rest;
    } else {
      const eigene = stehen.filter((x) => seiteVon(x) === lagerSeite);
      const ritter = stehen.filter((x) => befehlbar(x.kind));
      const fremde = new Map<Seite, UnitState[]>();
      for (const x of stehen) {
        const seite = seiteVon(x);
        if (istSpielerSeite(seite) || !feindlich(seite, lagerSeite, s)) continue;
        fremde.set(seite, [...(fremde.get(seite) ?? []), x]);
      }

      if (eigene.length > 0) {
        // Wer vom eigenen Lager noch steht, zieht hinein.
        eigene.forEach((x) => frachtZurBank(s, x));
        s.nestGarrison[k] = Math.min(BESATZUNG_MAX, eigene.length);
        entfernen(s, eigene);
      } else if (ritter.length > 0 || fremde.size === 0) {
        const players = [...new Set(ritter.map((x) => x.owner!))].sort();
        s.destroyedNests.push(k);
        delete s.nestGarrison[k];
        delete s.nestFraktion[k];
        for (const o of players) {
          const p = playerById(s, o);
          if (p) p.loot += 1;
        }
        events.push({ t: 'nestDestroyed', q, r, kind: besatzungArt, fraktion: lagerSeite, players });
      } else {
        // Nur fremde Fraktionen: die staerkste erobert das Lager.
        const [an, leute] = [...fremde].sort(
          (a, b) => b[1].length - a[1].length || nachSchluessel(a[0], b[0]),
        )[0]!;
        leute.forEach((x) => frachtZurBank(s, x));
        s.nestFraktion[k] = an;
        s.nestGarrison[k] = Math.min(BESATZUNG_MAX, leute.length);
        entfernen(s, leute);
        events.push({ t: 'nestCaptured', q, r, von: lagerSeite, an });
      }
    }
  }

  const nachher = seitenAuf(s, q, r);
  const ende = !istKampf(nachher, s);
  const sieger = !ende
    ? null
    : (nachher[0] ?? (isNestActive(s, q, r) ? nestFraktionOf(s, q, r) : null));
  events.push({ t: 'fight', q, r, seiten, neu, ende, sieger, verluste: [...verluste.values()], treffer });
}

/**
 * Beschuss: jeder Bogenschuetze eines Spielers, der nicht selbst im Nahkampf
 * steht, schiesst einmal - auf das naechste Feld mit Feinden in Reichweite,
 * ein Feld weit, erhoeht zwei (units.ts, bogenErhoeht). Ein Treffer kostet
 * einen zufaelligen Feind dort ein Leben; zurueckschlagen kann er nicht. Wer
 * faellt, laesst seine Beute beim Schuetzen. Die Besatzung eines Lagers sitzt
 * hinter der Palisade - sie trifft kein Pfeil.
 *
 * Gemeldet wird je Spieler und Zielfeld eine Salve, nicht jeder Pfeil.
 */
export function beschuss(s: GameState, rng: Rng, events: Ereignisse): void {
  type Salve = Extract<ArmyEvent, { t: 'volley' }>;
  const salven = new Map<string, Salve>();
  const schuetzen = s.units.filter((x) => x.kind === 'bogen' && x.owner !== null).sort(nachNummer);
  for (const u of schuetzen) {
    if (!s.units.includes(u) || imKampf(s, u)) continue;
    const eigene = seiteVon(u);
    const weite = bogenErhoeht(s, u) ? BOGEN_REICHWEITE_ERHOEHT : BOGEN_REICHWEITE;
    const ziel = hexesInRange(u, weite)
      .filter((h) => h.q !== u.q || h.r !== u.r)
      .map((h) => ({
        h,
        feinde: s.units
          .filter((x) => x.q === h.q && x.r === h.r && feindlich(eigene, seiteVon(x), s))
          .sort(nachNummer),
      }))
      .filter((z) => z.feinde.length > 0)
      .sort(
        (a, b) =>
          hexDistance(u, a.h) - hexDistance(u, b.h) ||
          nachSchluessel(hexKey(a.h.q, a.h.r), hexKey(b.h.q, b.h.r)),
      )[0];
    if (!ziel) continue;
    const key = `${u.owner}|${hexKey(ziel.h.q, ziel.h.r)}`;
    let salve = salven.get(key);
    if (!salve) {
      salve = { t: 'volley', player: u.owner!, q: u.q, r: u.r, zq: ziel.h.q, zr: ziel.h.r, schuesse: 0, treffer: 0, verluste: [] };
      salven.set(key, salve);
    }
    salve.schuesse += 1;
    if (!trifft(wurf(rng), WERTE.bogen.angriff)) continue;
    salve.treffer += 1;
    const opfer = ziel.feinde[rng.int(ziel.feinde.length)]!;
    opfer.leben -= 1;
    if (opfer.leben > 0) continue;
    const seite = seiteVon(opfer);
    const v = salve.verluste.find((x) => x.seite === seite && x.kind === opfer.kind);
    if (v) v.anzahl += 1;
    else salve.verluste.push({ seite, kind: opfer.kind, anzahl: 1 });
    if (opfer.traegt > 0 || opfer.fracht) uebergib(s, opfer, u, events);
    // Auch aus der Ferne erschlagen: Gelee und Sieg gehoeren dem Schuetzen.
    if (opfer.kind === 'schleim' && u.owner !== null) gelee(s, u.owner);
    siegGutschreiben(s, u, rng, events);
    entfernen(s, [opfer]);
  }

  /*
   * Geschuetztuerme (state.tuerme ab Stufe 2) schiessen mit. Sie stehen auf
   * einer Ecke, nicht auf einem Feld - der Schuss geht deshalb von dem ihrer
   * drei Nachbarfelder aus, das dem Ziel am naechsten liegt. So fliegt der
   * Pfeil auf der Karte von Kachel zu Kachel wie bei den Schuetzen.
   */
  for (const [vk, turm] of Object.entries(s.tuerme ?? {}).sort((a, b) => nachSchluessel(a[0], b[0]))) {
    if (turm.stufe < MAX_TURM_STUFE) continue;
    const eigene = spielerSeite(turm.owner);
    let bestes: { von: { q: number; r: number }; ziel: { q: number; r: number }; feinde: UnitState[]; d: number } | null = null;
    for (const von of vertexAdjacentHexes(parseVertexKey(vk))) {
      for (const h of hexesInRange(von, TURM_REICHWEITE)) {
        const feinde = s.units
          .filter((x) => x.q === h.q && x.r === h.r && feindlich(eigene, seiteVon(x), s))
          .sort(nachNummer);
        if (feinde.length === 0) continue;
        const d = hexDistance(von, h);
        const besser =
          !bestes ||
          d < bestes.d ||
          (d === bestes.d && nachSchluessel(hexKey(h.q, h.r), hexKey(bestes.ziel.q, bestes.ziel.r)) < 0);
        if (besser) bestes = { von, ziel: h, feinde, d };
      }
    }
    if (!bestes) continue;
    const salve: Salve = {
      t: 'volley',
      player: turm.owner,
      q: bestes.von.q,
      r: bestes.von.r,
      zq: bestes.ziel.q,
      zr: bestes.ziel.r,
      schuesse: 1,
      treffer: 0,
      verluste: [],
    };
    if (trifft(wurf(rng), TURM_ANGRIFF)) {
      salve.treffer = 1;
      const opfer = bestes.feinde[rng.int(bestes.feinde.length)]!;
      opfer.leben -= 1;
      if (opfer.leben <= 0) {
        salve.verluste.push({ seite: seiteVon(opfer), kind: opfer.kind, anzahl: 1 });
        if (opfer.traegt > 0 || opfer.fracht) frachtZurBank(s, opfer);
        // Der Turm gehoert einem Spieler - sein Gelee bekommt er.
        if (opfer.kind === 'schleim') gelee(s, turm.owner);
        entfernen(s, [opfer]);
      }
    }
    salven.set(`turm|${vk}`, salve);
  }
  events.push(...salven.values());
}

/** Eine Runde des Heeres. Aendert Einheiten, Haende, Bank, Lager und Welt. */
export function tickArmy(s: GameState, world: World, events: Ereignisse): void {
  if (s.units.length === 0) return;
  const rng = new Rng(s.rngState);
  const seed = s.worldSeed;
  const vorher = new Set(kampfFelder(s).keys());
  const gezogen = new Set<number>();
  // Raubziele je Fraktion: wer mit ihr Frieden hat, ist keines.
  const zielCache = new Map<string, Map<string, PlayerId>>();
  const besitzerFuer = (fraktion: string | null): Map<string, PlayerId> => {
    const k = fraktion ?? '';
    let m = zielCache.get(k);
    if (!m) {
      m = settlementApproaches(s, undefined, imKriegMit(s, fraktion));
      zielCache.set(k, m);
    }
    return m;
  };
  const felderFuer = new Map<string, Set<string>>();
  const zieleFuer = (fraktion: string | null): ReadonlySet<string> => {
    const k = fraktion ?? '';
    let f = felderFuer.get(k);
    if (!f) {
      f = new Set(besitzerFuer(fraktion).keys());
      felderFuer.set(k, f);
    }
    return f;
  };
  const siedlungen = settlementApproaches(s);
  // Im Schnee bleibt in jeder zweiten Runde alles stehen (core/zeit.ts).
  const rast = einheitenRasten(seed, s.turn);

  // 1. Ziehen - der Held vor seinem Gefolge, sonst nach Nummer. Ein Verband
  // wartet, solange einer von ihnen kaempft - gefragt vor dem ersten Schritt,
  // sonst liefe der Rest weiter, sobald der Erste in einen Kampf geraet.
  const reihe = [...s.units].sort((a, b) => (a.folgt === null ? 0 : 1) - (b.folgt === null ? 0 : 1) || a.id - b.id);
  const verbandWartet = new Set(
    s.units.filter((x) => x.verband !== null && imKampf(s, x)).map((x) => x.verband),
  );
  for (const u of rast ? [] : reihe) {
    if (!s.units.includes(u) || imKampf(s, u)) continue;
    if (u.verband !== null && verbandWartet.has(u.verband)) continue;
    if (ziehe(s, world, rng, u, zieleFuer, events)) gezogen.add(u.id);
  }
  // Wer auf einer Ruine steht, erkundet sie - auch wer dort erst antrat.
  for (const u of [...s.units].sort(nachNummer)) {
    if (u.owner === null || !befehlbar(u.kind)) continue;
    if (!ruinAt(seed, u.q, u.r) || s.exploredRuins.includes(hexKey(u.q, u.r))) continue;
    erkunde(s, world, rng, u, events);
  }

  // 2. Heimkehr: am eigenen Lager angekommen.
  for (const u of s.units.filter((x) => x.auftrag === 'heimkehr').sort(nachNummer)) {
    if (u.heimat !== hexKey(u.q, u.r) || u.fraktion === null) continue;
    if (!isNestActive(s, u.q, u.r) || nestFraktionOf(s, u.q, u.r) !== u.fraktion) continue;
    if (imKampf(s, u)) continue;
    const besatzung = Math.min(BESATZUNG_MAX, garrisonOf(s, u.q, u.r) + 1);
    if (besatzung !== garrisonOf(s, u.q, u.r)) s.nestGarrison[u.heimat] = besatzung;
    const count = u.traegt;
    frachtZurBank(s, u);
    entfernen(s, [u]);
    events.push({ t: 'homecoming', q: u.q, r: u.r, fraktion: u.fraktion, count });
  }

  // 3. Angriff: wer stand, stuermt auf Feinde nebenan. Im Schnee nicht.
  for (const u of rast ? [] : [...s.units].sort(nachNummer)) {
    if (!s.units.includes(u) || gezogen.has(u.id)) continue;
    if (u.auftrag === 'heimkehr' || u.auftrag === 'wandern') continue;
    // Bogenschuetzen stuermen nicht - sie schiessen (3b).
    if (u.kind === 'bogen') continue;
    const eigene = seiteVon(u);
    if (eigene === NEUTRAL || imKampf(s, u)) continue;
    const nebenan = neighbors(u.q, u.r).find((n) =>
      s.units.some((x) => x.q === n.q && x.r === n.r && feindlich(eigene, seiteVon(x), s)),
    );
    if (!nebenan) continue;
    u.q = nebenan.q;
    u.r = nebenan.r;
    gezogen.add(u.id);
  }

  // 3b. Beschuss: Bogenschuetzen schiessen, bevor gekaempft wird. Im Schnee nicht.
  if (!rast) beschuss(s, rng, events);

  // 4. Kampf.
  const gekaempft = new Set<string>();
  for (const [k, seiten] of [...kampfFelder(s)].sort((a, b) => nachSchluessel(a[0], b[0]))) {
    gekaempft.add(k);
    const h = feld(k);
    schlacht(s, rng, h.q, h.r, seiten, !vorher.has(k), events);
  }

  // 5. Pluenderung.
  for (const u of s.units.filter((x) => x.auftrag === 'raub').sort(nachNummer)) {
    const owner = besitzerFuer(u.fraktion).get(hexKey(u.q, u.r));
    if (owner === undefined || imKampf(s, u)) continue;
    const p = playerById(s, owner);
    if (!p) continue;
    const menge = raidLoss(s, owner, 1);
    const taken = takeFromLargest(p.hand, menge);
    for (const r of RESOURCES) p.hand[r] -= taken[r];
    ladeAuf(u, taken, owner);
    u.auftrag = 'heimkehr';
    u.ziel = null;
    events.push({
      t: 'plunder',
      round: roundOf(s.turn),
      player: owner,
      kind: u.kind as Feind,
      fraktion: u.fraktion ?? '',
      q: u.q,
      r: u.r,
      taken,
      count: menge,
    });
    feuerLegen(s, rng, u, owner, events);
  }

  // 6. Erholung an eigenen Siedlungen.
  for (const u of s.units) {
    if (!befehlbar(u.kind) || u.leben >= WERTE[u.kind].leben) continue;
    const k = hexKey(u.q, u.r);
    if (gekaempft.has(k) || siedlungen.get(k) !== u.owner) continue;
    u.leben += 1;
  }

  s.rngState = rng.getState();
}
