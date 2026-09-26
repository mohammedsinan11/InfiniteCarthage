/**
 * Ein Mitspieler aus Regeln: der Bot.
 *
 * Er denkt nicht voraus und sucht nicht - er folgt einer kurzen Liste von
 * Vorlieben, wie ein ordentlicher Anfaenger: gute Zahlen besiedeln, Staedte
 * vor Doerfern vor Strassen, ueberzaehlige Karten bei der Bank tauschen, die
 * wertvollste Karte nehmen, den Helden erkunden lassen. Das genuegt, um allein
 * nicht allein zu sein - rivalisierende Haeuser, die sich ausbreiten, Lager
 * reizen und Punkte machen (REPLAYABILITY.md, I).
 *
 * Er benutzt ausschliesslich die Regeln, die auch der Mensch hat: jede
 * Entscheidung ist eine Action fuer applyAction. Was nicht geht, lehnt der
 * Reducer ab, und der Bot versucht das Naechste. Kein Zugriff auf verdeckte
 * Information ausser der eigenen Hand - er liest den vollen Zustand nur, weil
 * er auf dem Server laeuft, schaut aber keinem in die Karten.
 *
 * Rein und ohne Zufall: dieselbe Lage ergibt denselben Zug.
 */

import { parseVertexKey, vertexAdjacentHexes, edgeEndpoints, parseEdgeKey, vertexKey } from './coords';
import { tileAt } from './world';
import type { World } from './world';
import { RESOURCES, TERRAIN_RESOURCE } from './types';
import type { Resource } from './types';
import type { GameState, PlayerId } from './state';
import { applyAction } from './rules/reducer';
import type { Action, Game, GameEvent } from './rules/reducer';
import { legalCityVertices, legalRoadEdges, legalSettlementVertices } from './rules/placement';
import { COST_CITY, COST_DEV, COST_KNIGHT, COST_ROAD, COST_SETTLEMENT, canAfford } from './rules/costs';
import type { Cost } from './rules/costs';
import { tradeRatio } from './rules/trade';
import { cardById } from './cards/catalog';
import { kartenWert } from './cards/wert';
import { ereignisById } from './ereignis';
import type { Folge } from './ereignis';
import { hausById } from './haus';
import { COST_WUNDER, wunderAt } from './wunder';
import { hexDistance, hexesInRange } from './coords';
import { isNestActive } from './units';

/**
 * Wie ein Bot tickt - aus seiner Kennung, fest fuer die ganze Partie. Drei
 * Naturen, damit Rivalen sich unterscheiden: der Baumeister baut, der
 * Haendler tauscht frueh und viel, der Krieger wirbt Ritter an und zieht gegen
 * das naechste Lager.
 */
export type BotNatur = 'baumeister' | 'haendler' | 'krieger';

export function botNatur(id: PlayerId): BotNatur {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (['baumeister', 'haendler', 'krieger'] as const)[Math.abs(h) % 3]!;
}

/** Wie oft eine Zahl faellt, in 36steln - der Wert eines Feldes. */
const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

/** Wert einer Ecke: Summe der Zahlen der Nachbarfelder, Vielfalt zaehlt extra. */
export function eckenWert(world: World, vk: string, schon: ReadonlySet<Resource> = new Set()): number {
  let w = 0;
  const neu = new Set<Resource>();
  for (const h of vertexAdjacentHexes(parseVertexKey(vk))) {
    const t = tileAt(world, h.q, h.r);
    if (!t || t.number === null || t.number === undefined) continue;
    const res = TERRAIN_RESOURCE[t.terrain];
    if (res === null) continue;
    w += PIPS[t.number] ?? 0;
    if (!schon.has(res)) neu.add(res);
  }
  // Eine freie Wunderstaette nebenan ist ein Ziel fuer sich.
  const staette = vertexAdjacentHexes(parseVertexKey(vk)).some((h) => wunderAt(world.seed, h.q, h.r) !== null);
  return w + neu.size * 2 + (staette ? 6 : 0);
}

function eigeneSorten(state: GameState, world: World, id: PlayerId): Set<Resource> {
  const out = new Set<Resource>();
  for (const [vk, b] of Object.entries(state.buildings)) {
    if (b.owner !== id) continue;
    for (const h of vertexAdjacentHexes(parseVertexKey(vk))) {
      const t = tileAt(world, h.q, h.r);
      const r = t ? TERRAIN_RESOURCE[t.terrain] : null;
      if (r) out.add(r);
    }
  }
  return out;
}

const beste = <T>(xs: readonly T[], wert: (x: T) => number): T | undefined => {
  let b: T | undefined;
  let bw = -Infinity;
  for (const x of xs) {
    const w = wert(x);
    if (w > bw) {
      b = x;
      bw = w;
    }
  }
  return b;
};

/** Welcher Rohstoff fehlt am meisten fuer das naechste Ziel? */
function fehlt(hand: GameState['players'][number]['hand'], kosten: Cost): Resource | null {
  for (const r of RESOURCES) if ((kosten[r] ?? 0) > hand[r]) return r;
  return null;
}

function folgeWert(f: Folge): number {
  const summe = (b?: Partial<Record<Resource, number>>) => RESOURCES.reduce((n, r) => n + (b?.[r] ?? 0), 0);
  return summe(f.gib) + (f.zufall ?? 0) + (f.beute ?? 0) * 3 + (f.ruhm ?? 0) * 1.5 + (f.ritter ?? 0) * 3 - summe(f.zahle) - (f.verliere ?? 0) * 1.2;
}

/**
 * Die naechste Aktion des Bots in dieser Lage - oder null, wenn er nichts mehr
 * tun will (dann beendet der Raum den Zug nicht selbst: die letzte Aktion ist
 * immer endTurn, sobald nichts anderes mehr geht).
 *
 * versucht: Aktionen, die in diesem Zug schon abgelehnt wurden - so laeuft der
 * Bot nie im Kreis.
 */
export function botAktion(state: GameState, world: World, id: PlayerId, versucht: ReadonlySet<string> = new Set()): Action | null {
  const p = state.players.find((x) => x.id === id);
  if (!p || p.besiegt) return null;
  const phase = state.phase;
  const neu = (a: Action): Action | null => (versucht.has(JSON.stringify(a)) ? null : a);

  if (phase.t === 'hauswahl') {
    if (p.haus) return null;
    const angebot = state.hausAngebot?.[id] ?? [];
    // Ein Haus mit Ertragsstaerke - das spielt der Bot am besten.
    const lieb = ['bergclan', 'ebene', 'waldvolk', 'karthago', 'speicher', 'klingen', 'seher'];
    const wahl = beste(angebot, (h) => -lieb.indexOf(h)) ?? angebot[0];
    return wahl && hausById(wahl) ? { t: 'chooseHouse', haus: wahl } : null;
  }

  // Ab hier nur, wer am Zug ist.
  const amZug = phase.t === 'setup' ? null : state.order[state.current];
  if (phase.t !== 'setup' && amZug !== id) return null;

  if (phase.t === 'setup') {
    if (phase.awaiting === 'settlement') {
      const sorten = eigeneSorten(state, world, id);
      const vk = beste(legalSettlementVertices(state, world, id, { setup: true }), (v) => eckenWert(world, v, sorten));
      return vk ? { t: 'placeSettlement', vertex: vk } : null;
    }
    const es = legalRoadEdges(state, world, id, phase.lastVertex ?? undefined);
    const ek = beste(es, (e) => Math.max(...edgeEndpoints(parseEdgeKey(e)).map((v) => eckenWert(world, vertexKey(v)))));
    return ek ? { t: 'placeRoad', edge: ek } : null;
  }

  if (phase.t === 'roll') return { t: 'roll' };

  if (phase.t === 'draft' && state.draft) {
    const karte = beste(state.draft.options, (c) => {
      const k = cardById(c);
      return k ? kartenWert(k) + (k.lasting ? 2 : 0) : 0;
    });
    return karte ? { t: 'chooseCard', card: karte } : null;
  }

  if (phase.t === 'ereignis' && state.ereignis) {
    const e = ereignisById(state.ereignis.id);
    if (!e) return null;
    const held = state.units.some((u) => u.kind === 'held' && u.owner === id);
    const moeglich = e.wahlen
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => (!w.brauchtHeld || held) && (!w.folge.zahle || canAfford(p.hand, w.folge.zahle)));
    const wahl = beste(moeglich, ({ w }) => folgeWert(w.folge));
    return wahl ? { t: 'answerEvent', wahl: wahl.i } : null;
  }

  if (phase.t === 'roadBuilding') {
    const ek = legalRoadEdges(state, world, id)[0];
    return ek ? neu({ t: 'buildRoad', edge: ek }) ?? { t: 'endTurn' } : null;
  }

  if (phase.t !== 'main') return null;

  // Der Held erkundet von selbst - einmal anstossen genuegt.
  const held = state.units.find((u) => u.kind === 'held' && u.owner === id && !u.zweig);
  if (held && held.auftrag !== 'erkunden') {
    const a = neu({ t: 'explore', unit: held.id, explore: true });
    if (a) return a;
  }

  const natur = botNatur(id);

  // Der Krieger: Ritter, die nichts zu tun haben, ziehen gegen das naechste Lager.
  if (natur === 'krieger') {
    const ritter = state.units.filter((u) => u.owner === id && u.kind === 'ritter' && !u.ziel && u.auftrag === 'befehl');
    if (ritter.length >= 2) {
      const r0 = ritter[0]!;
      const lager = hexesInRange({ q: r0.q, r: r0.r }, 8)
        .filter((h) => isNestActive(state, h.q, h.r))
        .sort((a, b) => hexDistance(a, r0) - hexDistance(b, r0))[0];
      if (lager) {
        const a = neu({ t: 'orderUnits', units: ritter.map((u) => u.id), q: lager.q, r: lager.r });
        if (a) return a;
      }
    }
    if (canAfford(p.hand, COST_KNIGHT) && state.units.filter((u) => u.owner === id && u.kind === 'ritter').length < 4) {
      const a = neu({ t: 'recruitKnight' });
      if (a) return a;
    }
  }

  // Beute einloesen.
  if (p.loot > 0) {
    const a = neu({ t: 'claimLoot' });
    if (a) return a;
  }

  // Ein Weltwunder, wenn eine freie Staette an einem eigenen Gebaeude liegt.
  if (canAfford(p.hand, COST_WUNDER)) {
    for (const [vk, b] of Object.entries(state.buildings)) {
      if (b.owner !== id) continue;
      for (const h of vertexAdjacentHexes(parseVertexKey(vk))) {
        if (wunderAt(state.worldSeed, h.q, h.r) && !state.wunder?.[`${h.q}:${h.r}`]) {
          const a = neu({ t: 'buildWonder', q: h.q, r: h.r });
          if (a) return a;
        }
      }
    }
  }

  // Stadt, dann Dorf, dann Strasse - jeweils der beste Platz.
  if (canAfford(p.hand, COST_CITY)) {
    const vk = beste(legalCityVertices(state, id), (v) => eckenWert(world, v));
    if (vk) {
      const a = neu({ t: 'buildCity', vertex: vk });
      if (a) return a;
    }
  }
  const dorfPlaetze = legalSettlementVertices(state, world, id, { setup: false });
  if (canAfford(p.hand, COST_SETTLEMENT) && dorfPlaetze.length > 0) {
    const sorten = eigeneSorten(state, world, id);
    const vk = beste(dorfPlaetze, (v) => eckenWert(world, v, sorten));
    if (vk) {
      const a = neu({ t: 'buildSettlement', vertex: vk });
      if (a) return a;
    }
  }
  const eigeneStrassen = Object.values(state.roads).filter((o) => o === id).length;
  if (canAfford(p.hand, COST_ROAD) && dorfPlaetze.length === 0 && eigeneStrassen < 20) {
    // Die Strasse, deren Ende an die beste Ecke fuehrt.
    const ek = beste(legalRoadEdges(state, world, id), (e) =>
      Math.max(...edgeEndpoints(parseEdgeKey(e)).map((v) => (state.buildings[vertexKey(v)] ? -5 : eckenWert(world, vertexKey(v))))),
    );
    if (ek) {
      const a = neu({ t: 'buildRoad', edge: ek });
      if (a) return a;
    }
  }

  // Ueberzaehliges tauschen - gegen das, was dem naechsten Ziel fehlt.
  const ziel = legalCityVertices(state, id).length > 0 ? COST_CITY : COST_SETTLEMENT;
  const braucht = fehlt(p.hand, ziel) ?? fehlt(p.hand, COST_ROAD) ?? (natur === 'haendler' ? fehlt(p.hand, COST_CITY) : null);
  if (braucht) {
    const geben = beste(
      RESOURCES.filter((r) => r !== braucht && p.hand[r] - (ziel[r] ?? 0) >= tradeRatio(state, world, id, r)),
      (r) => p.hand[r],
    );
    if (geben) {
      const a = neu({ t: 'bankTrade', give: geben, receive: braucht });
      if (a) return a;
    }
  }

  // Volle Hand: lieber einen Ritter oder eine Karte als Beute fuer Pluenderer.
  const karten = RESOURCES.reduce((n, r) => n + p.hand[r], 0);
  if (karten >= 7) {
    if (canAfford(p.hand, COST_KNIGHT) && state.units.filter((u) => u.owner === id && u.kind === 'ritter').length < 3) {
      const a = neu({ t: 'recruitKnight' });
      if (a) return a;
    }
    if (canAfford(p.hand, COST_DEV)) {
      const a = neu({ t: 'buyDev' });
      if (a) return a;
    }
  }

  return { t: 'endTurn' };
}

/**
 * Alle Bots spielen, bis ein Mensch dran ist oder die Partie endet. Gibt die
 * Ereignisse je gelungener Aktion zurueck - der Raum schickt sie weiter, als
 * haette jemand geklickt.
 *
 * Abgelehnte Aktionen merkt sich die Schleife bis zum naechsten Zugende, damit
 * der Bot etwas anderes versucht statt dasselbe noch einmal. Eine Obergrenze
 * je Aufruf haelt einen Fehler davon ab, den Raum festzuhalten.
 */
export function botsSpielen(game: Game, istBot: (id: PlayerId) => boolean, grenze = 600): GameEvent[][] {
  const alle: GameEvent[][] = [];
  const versucht = new Set<string>();
  for (let i = 0; i < grenze; i++) {
    const s = game.state;
    if (s.phase.t === 'finished') break;
    let wer: PlayerId | undefined;
    if (s.phase.t === 'hauswahl') wer = s.players.find((p) => istBot(p.id) && !p.haus)?.id;
    else if (s.phase.t === 'setup') {
      const n = s.order.length;
      const step = s.phase.step;
      const id = s.order[step < n ? step : 2 * n - 1 - step]!;
      if (istBot(id)) wer = id;
    } else {
      const id = s.order[s.current]!;
      if (istBot(id)) wer = id;
    }
    if (!wer) break;
    const a = botAktion(s, game.world, wer, versucht);
    if (!a) break;
    const r = applyAction(game, a, wer);
    if (r.ok) {
      alle.push(r.events);
      if (a.t === 'endTurn') versucht.clear();
      // Befehle gelingen auch, wenn sie nichts aendern - einmal je Zug genuegt.
      else if (a.t === 'orderUnits' || a.t === 'explore') versucht.add(JSON.stringify(a));
    } else {
      versucht.add(JSON.stringify(a));
      // Selbst das Zugende geht nicht? Dann gibt es nichts mehr zu tun.
      if (a.t === 'endTurn') break;
    }
  }
  return alle;
}
