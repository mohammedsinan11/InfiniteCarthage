/** Adelshaeuser (core/haus.ts): Wahl vor dem Aufbau und ihre Wirkungen. */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Action, Game } from '../src/core/rules/reducer';
import { legalRoadEdges, legalSettlementVertices } from '../src/core/rules/placement';
import { currentPlayerId, handSize } from '../src/core/state';
import type { PlayerId } from '../src/core/state';
import { NO_TARGET } from '../src/core/protocol';
import { HAEUSER, HAUS_ANGEBOT, hausAngebot, hausById } from '../src/core/haus';
import { tradeRatio } from '../src/core/rules/trade';
import { HAND_LIMIT, limitFor } from '../src/core/rules/handlimit';
import { raidLoss } from '../src/core/rules/raid';
import { productionSources } from '../src/core/rules/production';
import { hexKey, hexVertices, vertexKey } from '../src/core/coords';
import { redactStateFor } from '../src/core/redact';

function must(game: Game, action: Action, actor: PlayerId) {
  const r = applyAction(game, action, actor);
  if (!r.ok) throw new Error(`${action.t} scheiterte: ${r.error}`);
  return r;
}

function zwei(): Game {
  return createGame(
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    4242,
    77,
    NO_TARGET,
    { haeuser: true },
  );
}

function runSetup(game: Game): void {
  let guard = 0;
  while (game.state.phase.t === 'setup') {
    if (guard++ > 50) throw new Error('Aufbau endet nicht');
    const p = currentPlayerId(game.state);
    const ph = game.state.phase;
    if (ph.awaiting === 'settlement') {
      const vs = legalSettlementVertices(game.state, game.world, p, { setup: true });
      must(game, { t: 'placeSettlement', vertex: vs[0]! }, p);
    } else {
      const es = legalRoadEdges(game.state, game.world, p, ph.lastVertex ?? undefined);
      must(game, { t: 'placeRoad', edge: es[0]! }, p);
    }
  }
}

/** Ein Spiel allein mit einem bestimmten Haus - das Angebot wird dafuer gesetzt. */
function alleinMit(haus: string): Game {
  const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77, NO_TARGET, { haeuser: true });
  g.state.hausAngebot = { p0: [haus] };
  must(g, { t: 'chooseHouse', haus }, 'p0');
  return g;
}

describe('Haeuser', () => {
  it('haben eindeutige Kennungen, je eine Staerke, Schwaeche und einen Rat', () => {
    expect(new Set(HAEUSER.map((h) => h.id)).size).toBe(HAEUSER.length);
    for (const h of HAEUSER) {
      expect(h.staerke.length).toBeGreaterThan(10);
      expect(h.schwaeche.length).toBeGreaterThan(10);
      expect(h.rat.length).toBeGreaterThan(10);
    }
  });

  it('das Angebot: drei verschiedene, rein aus Seed und Platz', () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = hausAngebot(seed, 0);
      expect(a).toEqual(hausAngebot(seed, 0));
      expect(new Set(a).size).toBe(HAUS_ANGEBOT);
      for (const id of a) expect(hausById(id)).toBeDefined();
    }
  });

  it('erst waehlen alle, dann beginnt der Aufbau', () => {
    const g = zwei();
    expect(g.state.phase.t).toBe('hauswahl');
    const [ha] = g.state.hausAngebot!.a!;
    const [hb] = g.state.hausAngebot!.b!;
    // Der Zweite darf zuerst waehlen - gewaehlt wird gleichzeitig.
    must(g, { t: 'chooseHouse', haus: hb! }, 'b');
    expect(g.state.phase.t).toBe('hauswahl');
    expect(applyAction(g, { t: 'chooseHouse', haus: hb! }, 'b').ok).toBe(false);
    must(g, { t: 'chooseHouse', haus: ha! }, 'a');
    expect(g.state.phase.t).toBe('setup');
    expect(g.state.players.map((p) => p.haus)).toEqual([ha, hb]);
  });

  it('nimmt nur, was angeboten wurde', () => {
    const g = zwei();
    const fremd = HAEUSER.map((h) => h.id).find((id) => !g.state.hausAngebot!.a!.includes(id))!;
    expect(applyAction(g, { t: 'chooseHouse', haus: fremd }, 'a').ok).toBe(false);
    expect(applyAction(g, { t: 'chooseHouse', haus: 'erfunden' }, 'a').ok).toBe(false);
  });

  it('ohne Hauswahl geht es gleich mit dem Aufbau los', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77);
    expect(g.state.phase.t).toBe('setup');
  });

  it('Karthago handelt 3:1, der Bergclan 5:1', () => {
    const k = alleinMit('karthago');
    runSetup(k);
    expect(tradeRatio(k.state, k.world, 'p0', 'lumber')).toBeLessThanOrEqual(3);
    const b = alleinMit('bergclan');
    runSetup(b);
    const ohne = createGame([{ id: 'p0', name: 'S' }], 4242, 77);
    runSetup(ohne);
    expect(tradeRatio(b.state, b.world, 'p0', 'lumber')).toBe(tradeRatio(ohne.state, ohne.world, 'p0', 'lumber') + 1);
  });

  it('Bergclan: Berge liefern 1 Erz mehr', () => {
    const g = alleinMit('bergclan');
    const berg = [...g.world.tiles.values()].find((t) => t.terrain === 'mountain' && t.number !== null)!;
    g.state.buildings = { [vertexKey(hexVertices(berg.q, berg.r)[0]!)]: { owner: 'p0', type: 'settlement' } };
    const erz = productionSources(g.state, g.world, berg.number!)
      .filter((q) => q.hex === hexKey(berg.q, berg.r))
      .reduce((n, q) => n + q.amount, 0);
    expect(erz).toBe(2);
  });

  it('Ebene: Regen halbiert die eigenen Felder nicht', () => {
    const g = alleinMit('ebene');
    const feld = [...g.world.tiles.values()].find((t) => t.terrain === 'field' && t.number !== null)!;
    g.state.buildings = { [vertexKey(hexVertices(feld.q, feld.r)[0]!)]: { owner: 'p0', type: 'settlement' } };
    const menge = productionSources(g.state, g.world, feld.number!, 'regen')
      .filter((q) => q.hex === hexKey(feld.q, feld.r))
      .reduce((n, q) => n + q.amount, 0);
    expect(menge).toBe(2); // 1 Dorf + 1 Haus, nicht halbiert
  });

  it('Handkartengrenze und Pluenderung', () => {
    expect(limitFor(alleinMit('speicher').state, 'p0')).toBe(HAND_LIMIT + 4);
    expect(limitFor(alleinMit('karthago').state, 'p0')).toBe(HAND_LIMIT - 1);
    const wald = alleinMit('waldvolk');
    wald.state.players[0]!.hand.lumber = 5;
    expect(raidLoss(wald.state, 'p0', 1)).toBe(2);
    const sp = alleinMit('speicher');
    sp.state.players[0]!.hand.lumber = 5;
    expect(raidLoss(sp.state, 'p0', 1)).toBe(0);
    expect(raidLoss(sp.state, 'p0', 2)).toBe(1);
  });

  it('Startausstattung: Waldvolk, Seher, Klingen, Speicher', () => {
    const wald = alleinMit('waldvolk');
    runSetup(wald);
    const ohne = createGame([{ id: 'p0', name: 'S' }], 4242, 77);
    runSetup(ohne);
    expect(wald.state.players[0]!.hand.lumber).toBe(ohne.state.players[0]!.hand.lumber + 2);
    expect(wald.state.players[0]!.hand.brick).toBe(ohne.state.players[0]!.hand.brick + 2);

    const seher = alleinMit('seher');
    runSetup(seher);
    expect(seher.state.players[0]!.loot).toBe(2);

    const klingen = alleinMit('klingen');
    runSetup(klingen);
    expect(klingen.state.units.filter((u) => u.owner === 'p0' && u.kind === 'ritter')).toHaveLength(2);

    const sp = alleinMit('speicher');
    runSetup(sp);
    expect(handSize(sp.state.players[0]!.hand)).toBe(0);
  });

  it('stehen in der redigierten Sicht', () => {
    const g = zwei();
    const sicht = redactStateFor(g.state, 'a');
    expect(sicht.hausAngebot.a).toHaveLength(3);
    expect(sicht.players[0]!.haus).toBeNull();
  });
});
