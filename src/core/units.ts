/**
 * Einheiten: wohin der Weg fuehrt, was man sieht, wer in den Lagern haust.
 *
 * Reine Hilfen ohne Zustandsaenderung. Die Regeln, nach denen Einheiten ziehen,
 * kaempfen und pluendern, stehen in rules/army.ts. Hier liegt, was auch der
 * Client braucht - Wege fuer Befehle, Sicht fuer den Nebel, Besatzungen fuer
 * die Anzeige - und was deshalb mit der redigierten Sicht auskommen muss.
 */

import { hash3i } from './hash';
import {
  edgeBetween,
  edgeKey,
  hexDistance,
  hexKey,
  hexesInRange,
  hexVertices,
  neighbors,
  parseVertexKey,
  vertexAdjacentHexes,
  vertexKey,
} from './coords';
import { nestAt } from './raiders';
import { terrainAt, tileAtCoord } from './worldgen';
import { fraktionAt, fraktionById } from './factions';
import type { FraktionArt } from './factions';
import type { Hex } from './coords';
import type { GameState, HeldZweig, Mauer, PlayerId, UnitKind, UnitState } from './state';
import type { SichtLage } from './zeit';

export type { UnitKind };
export type Unit = UnitState;

/** Was die Heeresrechnung vom Spielstand braucht - die redigierte Sicht genuegt. */
export type ArmyView = Pick<
  GameState,
  'worldSeed' | 'buildings' | 'units' | 'destroyedNests' | 'nestGarrison' | 'nestFraktion' | 'abkommen'
>;

const SALT_LAGER = 73;

/** Wie weit man um eine Siedlung sieht. */
export const SICHT_SIEDLUNG = 3;
/** Wie weit eine Einheit sieht. */
export const SICHT_EINHEIT = 2;
/** Wie weit ein Wachturm sieht - auch nachts. */
export const SICHT_TURM = 5;
/** Wie weit der Held sieht - auch nachts. */
export const SICHT_HELD = 3;

/**
 * Kampfwerte je Art (core/combat.ts, trifft).
 *
 * Ein Ritter trifft ab 3, ein Raeuber ab 4, ein Goblin ab 5. Goblins sind
 * schwaecher, halten aber so viel aus wie Raeuber - ein Stamm lebt von der
 * Menge, nicht vom Einzelnen. Wanderer kaempfen nicht.
 */
export const WERTE: Record<UnitKind, { angriff: number; leben: number }> = {
  ritter: { angriff: 3, leben: 3 },
  raeuber: { angriff: 2, leben: 2 },
  goblin: { angriff: 1, leben: 2 },
  wanderer: { angriff: 0, leben: 1 },
  // Die Karawane wehrt sich kaum - wer sie schuetzen will, gibt ihr Ritter mit.
  karawane: { angriff: 0, leben: 2 },
  // Der Held haelt mehr aus als ein Ritter und trifft wie er - stark ist er
  // durch das, was er fuer andere tut (ANFUEHRUNG, Sicht, Licht).
  held: { angriff: 3, leben: 5 },
  // Trifft ab 4 wie ein Raeuber, aber aus der Ferne (rules/army.ts, beschuss);
  // im Nahkampf eins schlechter (combat.ts, BOGEN_NAHKAMPF).
  bogen: { angriff: 2, leben: 2 },
  // Ein Schleim allein ist harmlos; gefaehrlich wird die Menge, die nachts
  // aus dem Dunkel kommt (rules/army.ts, nachtVolk).
  schleim: { angriff: 1, leben: 2 },
  // Der grosse Goblin: trifft wie ein Ritter und haelt mehr aus als seine
  // Leute. Einer je Goblinlager - faellt er, ist die Bande kopflos.
  haeuptling: { angriff: 3, leben: 4 },
  // Der Schamane schlaegt kaum zu; er haelt die Seinen auf den Beinen
  // (rules/army.ts, lagerLeben).
  schamane: { angriff: 1, leben: 3 },
  // Die Hexe trifft hart, haelt aber wenig aus - und sie zieht nie vom Haus
  // weg. Wer sie holen will, muss zu ihr (core/hexe.ts).
  hexe: { angriff: 4, leben: 4 },
  // Der Morast: der grosse Schleim. Kein Gegner fuer einen einzelnen Ritter.
  morast: { angriff: 3, leben: 12 },
};

/**
 * Wer in einem Lager dieser Fraktion wohnt. Die Nacht hat keine Lager - sie
 * kommt aus dem Dunkel (rules/army.ts, nachtVolk) -, deshalb faellt sie hier
 * auf Raeuber zurueck; der Fall tritt nie ein, haelt aber den Typ dicht.
 */
export const lagerArt = (art: FraktionArt): UnitKind => (art === 'nacht' ? 'raeuber' : art);

/** Mehr Besatzung hat kein Lager - auch nicht, wenn Trupps heimkehren. */
export const BESATZUNG_MAX = 3;

/** Einheiten, die ein Spieler befehligt: Ritter, Bogenschuetzen, der Held. */
export const befehlbar = (kind: UnitKind): boolean => kind === 'ritter' || kind === 'bogen' || kind === 'held';

/**
 * Kampfwerte der drei ernannten Helden (rules/zweig.ts). Sie traten mit
 * kind 'held' an, sind aber nicht gleich stark: der Krieger schlaegt am
 * haertesten zu und haelt am meisten aus, die Heilerin kaempft kaum - ihre
 * Staerke ist, dass die anderen stehen bleiben.
 */
export const ZWEIG_WERTE: Record<HeldZweig, { angriff: number; leben: number }> = {
  krieger: { angriff: 4, leben: 7 },
  heilerin: { angriff: 1, leben: 4 },
  haendler: { angriff: 2, leben: 4 },
};

/**
 * Steht ein Bogenschuetze erhoeht - auf der eigenen Hauptstadt oder neben einem
 * eigenen Wachturm? Dann schiesst er weiter (combat.ts, BOGEN_REICHWEITE_ERHOEHT).
 */
export function bogenErhoeht(
  view: { hauptstaedte?: GameState['hauptstaedte']; tuerme?: GameState['tuerme'] },
  u: Pick<UnitState, 'q' | 'r' | 'owner'>,
): boolean {
  if (u.owner === null) return false;
  if (view.hauptstaedte?.[hexKey(u.q, u.r)]?.owner === u.owner) return true;
  return hexVertices(u.q, u.r).some((v) => view.tuerme?.[vertexKey(v)]?.owner === u.owner);
}

/** Eine neue Einheit mit vollen Leben und leeren Taschen. Die Nummer vergibt der Aufrufer. */
export function einheitVorlage(
  kind: UnitKind,
  q: number,
  r: number,
  felder: Partial<Omit<UnitState, 'id' | 'kind' | 'q' | 'r'>> = {},
): Omit<UnitState, 'id'> {
  return {
    kind,
    owner: null,
    fraktion: null,
    q,
    r,
    ziel: null,
    heimat: null,
    auftrag: befehlbar(kind)
      ? 'befehl'
      : kind === 'wanderer'
        ? 'wandern'
        : kind === 'karawane'
          ? 'handel'
        : kind === 'schleim' || kind === 'morast'
          ? 'ruht'
          : // Die Hexe zieht nie los - sie bleibt bei ihrem Haus (core/hexe.ts).
            kind === 'hexe'
            ? 'ruht'
            : 'raub',
    leben: WERTE[kind].leben,
    fracht: null,
    traegt: 0,
    beraubt: null,
    dauer: null,
    folgt: null,
    verband: null,
    // Jede Einheit faengt ohne Siege und auf Stufe 0 an (DESIGN.md, Stufen).
    siege: 0,
    stufe: 0,
    ...felder,
  };
}

/**
 * Wer ein Lager von Natur aus bewohnt: die Art seiner Fraktion und zwei bis drei
 * Koepfe. Rein - dasselbe Lager hat immer dieselben Bewohner. Eroberungen
 * aendern die Fraktion (nestFraktionOf), nicht diese Grundzahl.
 */
export function nestOccupants(
  seed: number,
  q: number,
  r: number,
): { kind: FraktionArt; count: number } {
  const h = hash3i(seed, q, r, SALT_LAGER) >>> 0;
  return { kind: fraktionAt(seed, q, r).art, count: 2 + ((h >>> 8) % 2) };
}

/** Welche Fraktion ein Lager haelt - erobert oder von Natur aus. */
export function nestFraktionOf(
  view: Pick<GameState, 'worldSeed' | 'nestFraktion'>,
  q: number,
  r: number,
): string {
  return view.nestFraktion[hexKey(q, r)] ?? fraktionAt(view.worldSeed, q, r).id;
}

/**
 * Ist hier Land? Gemerkt, weil die Wegsuche es tausendfach fragt - und
 * terrainAt ist seit dem Kleckspass nicht mehr billig.
 */
const LAND_MAX = 80000;
let landSeed = Number.NaN;
const landCache = new Map<string, boolean>();

export function isLandAt(seed: number, q: number, r: number): boolean {
  if (seed !== landSeed) {
    landCache.clear();
    landSeed = seed;
  }
  const k = hexKey(q, r);
  const da = landCache.get(k);
  if (da !== undefined) return da;
  const v = terrainAt(seed, q, r) !== 'water';
  if (landCache.size >= LAND_MAX) landCache.clear();
  landCache.set(k, v);
  return v;
}

/** Steht hier ein Lager, das noch nicht zerstoert ist? */
export function isNestActive(
  view: Pick<GameState, 'worldSeed' | 'destroyedNests'>,
  q: number,
  r: number,
): boolean {
  return nestAt(view.worldSeed, q, r) && !view.destroyedNests.includes(hexKey(q, r));
}

/** Wie viele Verteidiger ein Lager noch hat. */
export function garrisonOf(
  view: Pick<GameState, 'worldSeed' | 'nestGarrison'>,
  q: number,
  r: number,
): number {
  const rest = view.nestGarrison[hexKey(q, r)];
  return rest ?? nestOccupants(view.worldSeed, q, r).count;
}

/**
 * Die Besatzung aktiver Lager unter den Feldern - nur zur Anzeige. Diese
 * Figuren sind keine Einheiten im Spielstand, deshalb die Nummer -1.
 */
export function garrisonUnits(view: ArmyView, hexes: Iterable<Hex>): Unit[] {
  const out: Unit[] = [];
  for (const h of hexes) {
    if (!isNestActive(view, h.q, h.r)) continue;
    const fraktion = nestFraktionOf(view, h.q, h.r);
    const art = fraktionById(view.worldSeed, fraktion).art;
    const kind = lagerArt(art);
    const n = garrisonOf(view, h.q, h.r);
    for (let i = 0; i < n; i++) {
      // Der erste Kopf eines Goblinlagers ist sein Haeuptling - jedes Lager
      // hat einen (DESIGN.md, Lagerleben).
      const wer = i === 0 && art === 'goblin' ? 'haeuptling' : kind;
      out.push({
        ...einheitVorlage(wer, h.q, h.r, { fraktion, heimat: hexKey(h.q, h.r), auftrag: 'heimkehr' }),
        id: -1,
      });
    }
  }
  return out;
}

/**
 * Die Landfelder an Gebaeuden - wer dort steht, steht an einer Siedlung.
 * Schluessel des Feldes -> Besitzer. Beruehrt ein Feld Gebaeude mehrerer
 * Besitzer, gilt das erste nach Eckenschluessel, damit es reproduzierbar bleibt.
 */
export function settlementApproaches(
  view: Pick<GameState, 'worldSeed' | 'buildings'>,
  owner?: PlayerId,
  /** Nur Gebaeude, deren Besitzer hier zustimmt - etwa: wer mit der Fraktion im Krieg ist. */
  besitzerPasst?: (id: PlayerId) => boolean,
): Map<string, PlayerId> {
  const out = new Map<string, PlayerId>();
  for (const vk of Object.keys(view.buildings).sort()) {
    const b = view.buildings[vk]!;
    if (owner !== undefined && b.owner !== owner) continue;
    if (besitzerPasst && !besitzerPasst(b.owner)) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) {
      if (!isLandAt(view.worldSeed, h.q, h.r)) continue;
      const k = hexKey(h.q, h.r);
      if (!out.has(k)) out.set(k, b.owner);
    }
  }
  return out;
}

export type Step = { step: Hex; ziel: Hex };

/**
 * Baut die "gesperrt"-Pruefung fuer nextStep/wegNach aus dem Mauer-Bestand:
 * eine fremde Wand haelt auf, ein Tor nie, die eigene Wand die eigenen Leute
 * nie. Eine Funktion fuer beide Seiten (rules/army.ts, schreite; Board.tsx,
 * Wegvorschau), damit Server und Client garantiert dieselbe Regel anwenden.
 */
export function mauerSperrt(
  mauern: Record<string, Mauer> | undefined,
  owner: PlayerId | null,
): (a: Hex, b: Hex) => boolean {
  return (a, b) => {
    const e = edgeBetween(a, b);
    if (!e) return false;
    const m = mauern?.[edgeKey(e)];
    return m !== undefined && m.art === 'wand' && m.owner !== owner;
  };
}

/**
 * Der naechste Schritt auf dem kuerzesten Landweg zu einem der Ziele.
 *
 * Breitensuche ueber Landfelder, begrenzt auf maxKnoten - auf einer Karte ohne
 * Rand darf keine Suche unbegrenzt laufen. Wasser ist unpassierbar. null, wenn
 * die Einheit schon an einem Ziel steht oder kein Weg in Reichweite liegt.
 *
 * gesperrt: haelt eine fremde Palisade eine Bewegung ueber genau diese Kante
 * auf (rules/army.ts, schreite baut das aus state.mauern)? Ohne Angabe sperrt
 * nichts - fuer Raeuber und Goblins, die keine Palisade kennen.
 */
export function nextStep(
  seed: number,
  from: Hex,
  ziele: ReadonlySet<string>,
  maxKnoten = 2500,
  gesperrt?: (a: Hex, b: Hex) => boolean,
): Step | null {
  const start = hexKey(from.q, from.r);
  if (ziele.has(start)) return null;
  const herkunft = new Map<string, string>();
  herkunft.set(start, '');
  const warte: Hex[] = [{ q: from.q, r: from.r }];
  for (let i = 0; i < warte.length && herkunft.size <= maxKnoten; i++) {
    const h = warte[i]!;
    const hk = hexKey(h.q, h.r);
    for (const n of neighbors(h.q, h.r)) {
      const k = hexKey(n.q, n.r);
      if (herkunft.has(k)) continue;
      if (!isLandAt(seed, n.q, n.r)) continue;
      if (gesperrt?.(h, n)) continue;
      herkunft.set(k, hk);
      if (ziele.has(k)) {
        // Zurueck bis zu dem Feld, das direkt am Start liegt.
        let schritt = k;
        while (herkunft.get(schritt) !== start) schritt = herkunft.get(schritt)!;
        const [sq, sr] = schritt.split(':').map(Number);
        return { step: { q: sq!, r: sr! }, ziel: { q: n.q, r: n.r } };
      }
      warte.push(n);
    }
  }
  return null;
}

/**
 * Der GANZE Weg zu einem Ziel - dieselbe Suche wie nextStep, nur bis zum Ende
 * zurueckverfolgt. Ohne das Startfeld; leer, wenn die Einheit schon dort steht;
 * null, wenn kein Landweg in Reichweite liegt oder das Ziel Wasser ist.
 *
 * Bewusst dieselben Regeln wie nextStep, das der Server zum Ziehen benutzt
 * (rules/army.ts, schreite): der Client zeichnet damit die Wegvorschau, und
 * sie darf nichts versprechen, was der Server danach anders rechnet - auch
 * eine fremde Palisade nicht (gesperrt, wie bei nextStep).
 */
export function wegNach(
  seed: number,
  from: Hex,
  ziel: Hex,
  maxKnoten = 2500,
  gesperrt?: (a: Hex, b: Hex) => boolean,
): Hex[] | null {
  const start = hexKey(from.q, from.r);
  const zk = hexKey(ziel.q, ziel.r);
  if (start === zk) return [];
  if (!isLandAt(seed, ziel.q, ziel.r)) return null;

  const herkunft = new Map<string, string>();
  herkunft.set(start, '');
  const warte: Hex[] = [{ q: from.q, r: from.r }];
  for (let i = 0; i < warte.length && herkunft.size <= maxKnoten; i++) {
    const h = warte[i]!;
    const hk = hexKey(h.q, h.r);
    for (const n of neighbors(h.q, h.r)) {
      const k = hexKey(n.q, n.r);
      if (herkunft.has(k)) continue;
      if (!isLandAt(seed, n.q, n.r)) continue;
      if (gesperrt?.(h, n)) continue;
      herkunft.set(k, hk);
      if (k === zk) {
        const weg: Hex[] = [];
        let cur = k;
        while (cur !== start) {
          const [cq, cr] = cur.split(':').map(Number);
          weg.unshift({ q: cq!, r: cr! });
          cur = herkunft.get(cur)!;
        }
        return weg;
      }
      warte.push(n);
    }
  }
  return null;
}

/**
 * Wie viele Schritte jedes erreichbare Feld kostet: Feldschluessel -> Schritte.
 * Das Startfeld steht mit 0 darin.
 *
 * Damit faerbt der Client ein, wie weit eine Einheit kommt. maxSchritte 0 gibt
 * nur das eigene Feld - der Fall im Schnee, wo in geraden Runden niemand zieht
 * (core/zeit.ts, einheitenRasten).
 */
export function reichweite(
  seed: number,
  from: Hex,
  maxSchritte: number,
  maxKnoten = 2500,
): Map<string, number> {
  const out = new Map<string, number>();
  out.set(hexKey(from.q, from.r), 0);
  if (maxSchritte <= 0) return out;

  let rand: Hex[] = [{ q: from.q, r: from.r }];
  for (let schritt = 1; schritt <= maxSchritte && out.size <= maxKnoten; schritt++) {
    const naechste: Hex[] = [];
    for (const h of rand) {
      for (const n of neighbors(h.q, h.r)) {
        const k = hexKey(n.q, n.r);
        if (out.has(k)) continue;
        if (!isLandAt(seed, n.q, n.r)) continue;
        out.set(k, schritt);
        naechste.push(n);
      }
    }
    if (naechste.length === 0) break;
    rand = naechste;
  }
  return out;
}

/** Wie weit ein neuer Ritter nach Gefahr Ausschau haelt. */
const AUSSCHAU = 8;

/**
 * Wo ein neuer Ritter antritt: an einer eigenen Siedlung, auf der Seite, von
 * der das naechste aktive Lager droht. null ohne Siedlung.
 *
 * ohneZahl (der Held): ein anliegendes Feld ohne Wuerfelzahl geht vor - dort
 * steht er nicht unter einem Zahlenmarker. Erst danach zaehlt die Gefahr.
 *
 * zusatz: weitere Musterplaetze, die keine Siedlung sind - die Burgfesten des
 * Spielers (rules/reich.ts). Sie kommen als Felder herein, damit units.ts
 * nichts von Phase 2 wissen muss; die Reichsregeln bleiben in reich.ts.
 */
export function knightMusterHex(
  view: ArmyView,
  id: PlayerId,
  ohneZahl = false,
  zusatz: readonly Hex[] = [],
): Hex | null {
  const felder = [...settlementApproaches(view, id).keys()]
    .map((k) => {
      const [q, r] = k.split(':').map(Number);
      return { q: q!, r: r! };
    })
    .concat(zusatz.map((h) => ({ q: h.q, r: h.r })))
    .filter((h) => !isNestActive(view, h.q, h.r));
  if (felder.length === 0) return null;
  const gefahr = (h: Hex): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const c of hexesInRange(h, AUSSCHAU)) {
      if (isNestActive(view, c.q, c.r)) best = Math.min(best, hexDistance(h, c));
    }
    return best;
  };
  const zahl = (h: Hex): number => (ohneZahl && tileAtCoord(view.worldSeed, h.q, h.r).number !== null ? 1 : 0);
  return felder
    .map((h) => ({ h, z: zahl(h), d: gefahr(h) }))
    .sort((a, b) => a.z - b.z || a.d - b.d || a.h.q - b.h.q || a.h.r - b.h.r)[0]!.h;
}

/**
 * Was ein Spieler gerade sieht: rund um seine Siedlungen und seine Einheiten.
 *
 * Nebel ist Anschauung, keine Geheimhaltung - die Karte folgt ohnehin aus dem
 * oeffentlichen Seed. Er zeigt, wo man gerade hinsieht und wo nicht, und
 * verbirgt dort fremde Einheiten.
 *
 * Nachts und im Nebel reicht der Blick je ein Feld weniger weit (core/zeit.ts),
 * beides zusammen zwei. Wachtuerme und der Held sehen weiter, und die Nacht
 * nimmt ihnen nichts - nur der Nebel.
 */
export function sightOf(
  view: Pick<GameState, 'buildings' | 'units'> & { tuerme?: GameState['tuerme'] },
  id: PlayerId,
  /** true heisst Nacht, wie frueher; sonst Nacht und Nebel einzeln. */
  lage: boolean | Partial<SichtLage> = false,
): Set<string> {
  const { nacht = false, nebel = false } = typeof lage === 'boolean' ? { nacht: lage } : lage;
  const out = new Set<string>();
  const dazu = (h: Hex, radius: number) => {
    for (const c of hexesInRange(h, radius)) out.add(hexKey(c.q, c.r));
  };
  const abzug = (nacht ? 1 : 0) + (nebel ? 1 : 0);
  const nebelAbzug = nebel ? 1 : 0;
  const siedlung = Math.max(1, SICHT_SIEDLUNG - abzug);
  const turm = Math.max(2, SICHT_TURM - nebelAbzug);
  const einheit = Math.max(1, SICHT_EINHEIT - abzug);
  const held = Math.max(2, SICHT_HELD - nebelAbzug);
  for (const [vk, b] of Object.entries(view.buildings)) {
    if (b.owner !== id) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) dazu(h, siedlung);
  }
  // Wachtuerme stehen fuer sich und sehen am weitesten (state.tuerme).
  for (const [vk, t] of Object.entries(view.tuerme ?? {})) {
    if (t.owner !== id) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) dazu(h, turm);
  }
  for (const u of view.units) if (u.owner === id) dazu(u, u.kind === 'held' ? held : einheit);
  return out;
}
