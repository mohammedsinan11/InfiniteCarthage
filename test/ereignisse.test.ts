/** Ereignisse mit Wahl (core/ereignis.ts). */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Action, Game } from '../src/core/rules/reducer';
import { legalRoadEdges, legalSettlementVertices } from '../src/core/rules/placement';
import { currentPlayerId, handSize } from '../src/core/state';
import type { PlayerId } from '../src/core/state';
import { EREIGNISSE, ereignisById, ereignisFaellig, waehleEreignis } from '../src/core/ereignis';

function must(game: Game, action: Action, actor: PlayerId) {
  const r = applyAction(game, action, actor);
  if (!r.ok) throw new Error(`${action.t} scheiterte: ${r.error}`);
  return r;
}

function mitEreignissen(): Game {
  const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77, 0, { ereignisse: true });
  while (g.state.phase.t === 'setup') {
    const p = currentPlayerId(g.state);
    const ph = g.state.phase;
    if (ph.awaiting === 'settlement') must(g, { t: 'placeSettlement', vertex: legalSettlementVertices(g.state, g.world, p, { setup: true })[0]! }, p);
    else must(g, { t: 'placeRoad', edge: legalRoadEdges(g.state, g.world, p, ph.lastVertex ?? undefined)[0]! }, p);
  }
  return g;
}

/** Wuerfeln, Fund und Ereignis (mit der letzten, meist freien Wahl) abarbeiten, Zug beenden. */
function zug(g: Game, wahl: (id: string) => number = (id) => ereignisById(id)!.wahlen.length - 1): string | null {
  must(g, { t: 'roll' }, 'p0');
  let erlebt: string | null = null;
  for (let i = 0; i < 5 && g.state.phase.t !== 'main'; i++) {
    if (g.state.phase.t === 'draft') must(g, { t: 'chooseCard', card: g.state.draft!.options[0]! }, 'p0');
    else if (g.state.phase.t === 'ereignis') {
      erlebt = g.state.ereignis!.id;
      must(g, { t: 'answerEvent', wahl: wahl(erlebt) }, 'p0');
    }
  }
  must(g, { t: 'endTurn' }, 'p0');
  return erlebt;
}

describe('Ereignisse', () => {
  it('jedes hat mindestens zwei Wahlen und eine, die nichts kostet und keinen Helden braucht', () => {
    expect(new Set(EREIGNISSE.map((e) => e.id)).size).toBe(EREIGNISSE.length);
    for (const e of EREIGNISSE) {
      expect(e.wahlen.length).toBeGreaterThanOrEqual(2);
      expect(e.wahlen.some((w) => !w.folge.zahle && !w.brauchtHeld)).toBe(true);
    }
  });

  it('jede Jahreszeit hat genug Auswahl', () => {
    for (const z of ['spring', 'summer', 'autumn', 'winter'] as const) {
      expect(EREIGNISSE.filter((e) => !e.zeit || e.zeit.includes(z)).length).toBeGreaterThanOrEqual(10);
    }
  });

  it('faellig ab dem 4. eigenen Zug, dann alle 8', () => {
    const allein = [...Array(40).keys()].map((i) => i + 1).filter((t) => ereignisFaellig(t, 1));
    expect(allein).toEqual([4, 12, 20, 28, 36]);
    // Zu zweit: je Spieler derselbe Takt.
    const zuZweit = [...Array(40).keys()].map((i) => i + 1).filter((t) => ereignisFaellig(t, 2));
    expect(zuZweit).toEqual([7, 8, 23, 24, 39, 40]);
  });

  it('waehlt passend zur Jahreszeit und ohne Wiederholung, solange es geht', () => {
    const gesehen: string[] = [];
    for (let t = 0; t < 8; t++) {
      const id = waehleEreignis(99, t, 'winter', gesehen);
      const e = ereignisById(id)!;
      expect(!e.zeit || e.zeit.includes('winter')).toBe(true);
      expect(gesehen).not.toContain(id);
      gesehen.push(id);
    }
  });

  it('kommt im Spiel nach dem Wurf, blockiert das Zugende bis zur Antwort', () => {
    const g = mitEreignissen();
    for (let i = 0; i < 3; i++) zug(g);
    expect(g.state.turn).toBe(4);
    must(g, { t: 'roll' }, 'p0');
    if (g.state.phase.t === 'draft') must(g, { t: 'chooseCard', card: g.state.draft!.options[0]! }, 'p0');
    expect(g.state.phase.t).toBe('ereignis');
    expect(applyAction(g, { t: 'endTurn' }, 'p0').ok).toBe(false);
    const n = ereignisById(g.state.ereignis!.id)!.wahlen.length;
    expect(applyAction(g, { t: 'answerEvent', wahl: n }, 'p0').ok).toBe(false);
    must(g, { t: 'answerEvent', wahl: n - 1 }, 'p0');
    expect(g.state.phase.t).toBe('main');
    expect(g.state.ereignisseGesehen).toHaveLength(1);
  });

  it('eine Wahl mit Kosten geht nur, wenn man zahlen kann - und zahlt dann', () => {
    const g = mitEreignissen();
    for (let i = 0; i < 3; i++) zug(g);
    must(g, { t: 'roll' }, 'p0');
    if (g.state.phase.t === 'draft') must(g, { t: 'chooseCard', card: g.state.draft!.options[0]! }, 'p0');
    const e = ereignisById(g.state.ereignis!.id)!;
    const teuer = e.wahlen.findIndex((w) => w.folge.zahle);
    if (teuer < 0) return;
    const p = g.state.players[0]!;
    for (const r of Object.keys(p.hand) as (keyof typeof p.hand)[]) p.hand[r] = 0;
    expect(applyAction(g, { t: 'answerEvent', wahl: teuer }, 'p0').ok).toBe(false);
    for (const r of Object.keys(p.hand) as (keyof typeof p.hand)[]) p.hand[r] = 5;
    const vorher = handSize(p.hand);
    must(g, { t: 'answerEvent', wahl: teuer }, 'p0');
    const kosten = Object.values(e.wahlen[teuer]!.folge.zahle!).reduce((a, b) => a + (b ?? 0), 0);
    const gewinn = Object.values(e.wahlen[teuer]!.folge.gib ?? {}).reduce((a, b) => a + (b ?? 0), 0) + (e.wahlen[teuer]!.folge.zufall ?? 0);
    expect(handSize(g.state.players[0]!.hand)).toBe(vorher - kosten + gewinn);
  });

  it('ohne die Option gibt es keine Ereignisse', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 4242, 77);
    expect(g.state.ereignisseAn).toBeUndefined();
  });
});
