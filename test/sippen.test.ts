/** Sippen (core/cards/sippen.ts) und die Gruendungswahl. */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame, marktPreisFuer } from '../src/core/rules/reducer';
import type { Action, Game } from '../src/core/rules/reducer';
import { legalRoadEdges, legalSettlementVertices } from '../src/core/rules/placement';
import { currentPlayerId } from '../src/core/state';
import type { PlayerId } from '../src/core/state';
import { CARDS } from '../src/core/cards/catalog';
import { SIPPEN_BONI, SIPPE_VON, naechsteStufe, sippenBoni } from '../src/core/cards/sippen';
import { wirksameKarten } from '../src/core/cards/wirkung';
import { modifiersOf } from '../src/core/cards/effects';
import { draftOptions } from '../src/core/cards/draft';

function must(game: Game, action: Action, actor: PlayerId) {
  const r = applyAction(game, action, actor);
  if (!r.ok) throw new Error(`${action.t} scheiterte: ${r.error}`);
  return r;
}

function aufgebaut(ereignisse: boolean): Game {
  const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77, 0, ereignisse ? { ereignisse: true } : {});
  while (g.state.phase.t === 'setup') {
    const p = currentPlayerId(g.state);
    const ph = g.state.phase;
    if (ph.awaiting === 'settlement') must(g, { t: 'placeSettlement', vertex: legalSettlementVertices(g.state, g.world, p, { setup: true })[0]! }, p);
    else must(g, { t: 'placeRoad', edge: legalRoadEdges(g.state, g.world, p, ph.lastVertex ?? undefined)[0]! }, p);
  }
  return g;
}

describe('Sippen', () => {
  it('die grossen Rohstoffkarten gibt es nur als Beute', () => {
    for (let t = 1; t < 200; t++) {
      for (const src of ['fund', 'markt', 'gruendung'] as const) expect(draftOptions(7, t, src)).not.toContain('grosse_scheune');
    }
  });

  it('jede Katalogkarte gehoert einer Familie, keine Stufe steht im Katalog', () => {
    for (const c of CARDS) expect(SIPPE_VON[c.id], c.id).toBeDefined();
    const ids = new Set(CARDS.map((c) => c.id));
    for (const b of SIPPEN_BONI) expect(ids.has(b.id)).toBe(false);
  });

  it('Stufen bei 2 und 4, als unsichtbare Karten wirksam', () => {
    expect(sippenBoni({ ernte: 1 })).toEqual([]);
    expect(sippenBoni({ ernte: 2 })).toEqual(['sippe:ernte:2']);
    expect(sippenBoni({ ernte: 4, krieg: 2 })).toEqual(['sippe:ernte:2', 'sippe:ernte:4', 'sippe:krieg:2']);
    expect(naechsteStufe({ handel: 3 }, 'handel')!.fehlt).toBe(1);
    expect(naechsteStufe({ handel: 4 }, 'handel')!.bonus.id).toBe('sippe:handel:6');
    expect(naechsteStufe({ handel: 6 }, 'handel')).toBeNull();
    const m = modifiersOf(wirksameKarten({ activeCards: [], sippe: { krieg: 2, handel: 2 } }));
    expect(m.schutz).toBe(1);
    expect(m.marktRabatt).toBe(1);
  });

  it('nur die zwei staerksten Familien wirken; Gleichstand gewinnt, wer frueher da war', () => {
    expect(sippenBoni({ ernte: 3, handel: 2, bau: 2 }, { ernte: 5, handel: 7, bau: 4 })).toEqual(['sippe:ernte:2', 'sippe:bau:2']);
    expect(sippenBoni({ ernte: 3, handel: 2, bau: 2 }, { ernte: 5, handel: 4, bau: 7 })).toEqual(['sippe:ernte:2', 'sippe:handel:2']);
    expect(sippenBoni({ ernte: 6, krieg: 5, bau: 4 })).toEqual(['sippe:ernte:2', 'sippe:ernte:4', 'sippe:krieg:2', 'sippe:krieg:4', 'sippe:ernte:6']);
  });

  it('das Handelshaus stapelt mit der besten Vorratskarte', () => {
    const m = modifiersOf(wirksameKarten({ activeCards: ['grosse_scheune'], sippe: { handel: 4 } }));
    expect(m.handLimitBonus).toBe(4 + 3);
  });

  it('die Handels-Sippe macht den Markt billiger', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 1, 2, 10, { ereignisse: true });
    expect(marktPreisFuer(g.state, 'p0')).toBe(3);
    g.state.players[0]!.sippe = { handel: 2 };
    expect(marktPreisFuer(g.state, 'p0')).toBe(2);
  });

  it('eine neue Stadt bringt eine Gruendungswahl, ein Dorf nicht; hoechstens zwei Wahlen je Zug', () => {
    const g = aufgebaut(true);
    must(g, { t: 'roll' }, 'p0');
    for (let i = 0; i < 5 && g.state.phase.t !== 'main'; i++) {
      if (g.state.phase.t === 'draft') must(g, { t: 'chooseCard', card: g.state.draft!.options[0]! }, 'p0');
      else if (g.state.phase.t === 'ereignis') must(g, { t: 'answerEvent', wahl: 0 }, 'p0');
    }
    const p = g.state.players[0]!;
    p.hand = { lumber: 20, brick: 20, wool: 5, grain: 20, ore: 20 };
    let platz: string | undefined;
    for (let i = 0; i < 6 && !platz; i++) {
      must(g, { t: 'buildRoad', edge: legalRoadEdges(g.state, g.world, 'p0')[0]! }, 'p0');
      platz = legalSettlementVertices(g.state, g.world, 'p0', { setup: false })[0];
    }
    must(g, { t: 'buildSettlement', vertex: platz! }, 'p0');
    expect(g.state.phase.t).toBe('main');

    // Alle Doerfer bewohnt genug fuer eine Stadt.
    const doerfer = Object.keys(g.state.buildings).filter((vk) => g.state.buildings[vk]!.owner === 'p0');
    g.state.einwohner = Object.fromEntries(doerfer.map((vk) => [vk, 3]));
    const vorher = Object.values(p.sippe ?? {}).reduce((n, x) => n + (x ?? 0), 0);
    must(g, { t: 'buildCity', vertex: doerfer[0]! }, 'p0');
    expect(g.state.phase.t).toBe('draft');
    expect(g.state.draft!.source).toBe('gruendung');
    const erste = [...g.state.draft!.options];
    must(g, { t: 'chooseCard', card: erste[0]! }, 'p0');
    expect(Object.values(g.state.players[0]!.sippe ?? {}).reduce((n, x) => n + (x ?? 0), 0)).toBe(vorher + 1);

    // Die zweite Stadt im selben Zug: eine neue Auslage, nicht dieselbe.
    must(g, { t: 'buildCity', vertex: doerfer[1]! }, 'p0');
    expect(g.state.phase.t).toBe('draft');
    expect(g.state.draft!.options).not.toEqual(erste);
    must(g, { t: 'chooseCard', card: g.state.draft!.options[0]! }, 'p0');

    // Die dritte Wahl in diesem Zug gibt es nicht - weder Gruendung noch Beute.
    g.state.players[0]!.loot = 1;
    expect(applyAction(g, { t: 'claimLoot' }, 'p0').ok).toBe(false);
  });

  it('ohne Ereignisse keine Gruendungswahl', () => {
    const g = aufgebaut(false);
    must(g, { t: 'roll' }, 'p0');
    for (let i = 0; i < 5 && g.state.phase.t === 'draft'; i++) must(g, { t: 'chooseCard', card: g.state.draft!.options[0]! }, 'p0');
    const p = g.state.players[0]!;
    p.hand = { lumber: 20, brick: 20, wool: 5, grain: 5, ore: 0 };
    let platz: string | undefined;
    for (let i = 0; i < 6 && !platz; i++) {
      must(g, { t: 'buildRoad', edge: legalRoadEdges(g.state, g.world, 'p0')[0]! }, 'p0');
      platz = legalSettlementVertices(g.state, g.world, 'p0', { setup: false })[0];
    }
    must(g, { t: 'buildSettlement', vertex: platz! }, 'p0');
    expect(g.state.phase.t).toBe('main');
  });
});
