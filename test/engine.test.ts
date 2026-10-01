/** Engine-Karten (ENGINE_KARTEN.md): Ausloeser, Zaehler, Regelbrueche, Kronplatz. */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { GameEvent } from '../src/core/rules/reducer';
import { CARDS, cardById } from '../src/core/cards/catalog';
import { modifiersOf, terrainBonusFor, ertragsFaktor } from '../src/core/cards/effects';
import { kartenPunkte, kontextVon, sippenRegeln, wirkungenVon, wirksameKarten } from '../src/core/cards/wirkung';
import { ausloeserAusEreignissen } from '../src/core/cards/ausloeser';
import { SIPPE_VON, sippenBoni } from '../src/core/cards/sippen';
import { bezahle, kannBezahlen, kostenFuer } from '../src/core/rules/kosten';
import { COST_CITY, COST_ROAD } from '../src/core/rules/costs';
import { limitFor } from '../src/core/rules/handlimit';
import { emptyHand } from '../src/core/state';

const sammeln = () => {
  const ev: GameEvent[] = [];
  return { ev, push: (...e: GameEvent[]) => ev.push(...e) };
};

function partie() {
  const g = createGame([{ id: 'p0', name: 'S' }, { id: 'p1', name: 'T' }], 7, 11, 15, { ereignisse: true });
  g.state.turn = 3;
  g.state.phase = { t: 'main' };
  const p = g.state.players[0]!;
  p.hand = emptyHand();
  return { g, s: g.state, p };
}

describe('Katalog', () => {
  it('jede neue Karte hat eine Sippe, Schluesselkarten sind legendaer', () => {
    const neu = CARDS.filter((c) => c.wert !== undefined);
    expect(neu.length).toBeGreaterThanOrEqual(56);
    for (const c of neu) expect(SIPPE_VON[c.id], c.id).toBeDefined();
    for (const c of CARDS.filter((x) => x.schluessel)) expect(c.rarity).toBe('legendaer');
    expect(CARDS.filter((x) => x.schluessel).length).toBe(16);
  });
});

describe('Skalierung (je)', () => {
  it('ohne Kontext zaehlt nichts, mit Kontext an den Deckeln vorbei', () => {
    expect(modifiersOf(['pflugschar']).terrainSkaliert.field ?? 0).toBe(0);
    const { s, p } = partie();
    p.activeCards = ['pflugschar', 'saatgut', 'erntedank'];
    const m = wirkungenVon(s, 'p0');
    expect(m.terrainSkaliert.field).toBe(3);
    expect(terrainBonusFor(m, 'field', 1)).toBe(4);
  });

  it('Zaehler: Wegezoll waechst mit Strassen und zahlt beim eigenen Wurf', () => {
    const { s, p } = partie();
    p.activeCards = ['wegezoll'];
    const e = sammeln();
    for (let i = 0; i < 8; i++) ausloeserAusEreignissen(s, [{ t: 'build', player: 'p0', kind: 'road', at: 'x' + i }], e, { jahreszeit: false });
    expect(p.zaehler?.wegezoll).toBe(8);
    ausloeserAusEreignissen(s, [{ t: 'roll', player: 'p0', dice: [3, 4] }], e, { jahreszeit: false });
    expect(p.hand.lumber).toBe(2);
    expect(e.ev.some((x) => x.t === 'kartenLohn')).toBe(true);
  });

  it('jeZug deckelt, ein neuer Zug setzt zurueck', () => {
    const { s, p } = partie();
    p.activeCards = ['meilenstein'];
    const e = sammeln();
    const bau = [1, 2, 3].map((i) => ({ t: 'build', player: 'p0', kind: 'road', at: 'k' + i }));
    ausloeserAusEreignissen(s, bau, e, { jahreszeit: false });
    expect(Object.values(p.hand).reduce((n, x) => n + x, 0)).toBe(1);
    s.turn += 1;
    ausloeserAusEreignissen(s, bau, e, { jahreszeit: false });
    expect(Object.values(p.hand).reduce((n, x) => n + x, 0)).toBe(2);
  });

  it('Ruhm aus Ausloesern und Punkte aus Ruhm (Eiserne Krone)', () => {
    const { s, p } = partie();
    p.activeCards = ['richtfest'];
    p.krone = 'eiserne_krone';
    p.ruhm = 7;
    const e = sammeln();
    ausloeserAusEreignissen(s, [{ t: 'build', player: 'p0', kind: 'settlement', at: 'v' }], e, { jahreszeit: false });
    expect(p.ruhm).toBe(8);
    expect(p.hand.brick).toBe(1);
    expect(kartenPunkte(s, 'p0')).toBe(2);
  });

  it('Nachhall (Karawanserei) loest doppelt aus, Weltenbaum zur Jahreszeit', () => {
    const { s, p } = partie();
    p.activeCards = ['richtfest'];
    p.krone = 'karawanserei';
    ausloeserAusEreignissen(s, [{ t: 'build', player: 'p0', kind: 'settlement', at: 'v' }], sammeln(), { jahreszeit: false });
    expect(p.hand.brick).toBe(2);
    p.krone = 'weltenbaum';
    ausloeserAusEreignissen(s, [], sammeln(), { jahreszeit: true });
    expect(p.hand.brick).toBe(3);
  });

  it('Kontext: Hand, Bauten, Sippen', () => {
    const { s, p } = partie();
    p.hand = { lumber: 5, brick: 5, wool: 0, grain: 0, ore: 0 };
    p.sippe = { ernte: 4 };
    s.roads = { a: 'p0', b: 'p0', c: 'p1' };
    const k = kontextVon(s, 'p0');
    expect(k.groesse({ aus: 'hand' }, 'x')).toBe(10);
    expect(k.groesse({ aus: 'bau', art: 'strasse' }, 'x')).toBe(2);
    expect(k.groesse({ aus: 'sippe', sippe: 'ernte' }, 'x')).toBe(4);
  });
});

describe('Regelbrueche', () => {
  it('Rabatt und Ersatz beim Bezahlen', () => {
    const m = modifiersOf(['zunfthaus', 'steinmetz']);
    expect(kostenFuer(m, 'stadt', COST_CITY).grain).toBe((COST_CITY.grain ?? 0) - 1);
    // Ohne Getreide, aber mit genug Erz: Erz zaehlt als Getreide.
    const hand = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 5 };
    expect(kannBezahlen(hand, COST_CITY, m, 'stadt')).toBe(true);
    expect(bezahle(hand, COST_CITY, m, 'stadt')).toBe(true);
    // 3 Erz fuer die Stadt, 1 Erz statt des einen Getreides (nach Rabatt).
    expect(hand.ore).toBe(1);
    // Ziegelgold: Lehm zaehlt als alles.
    const z = modifiersOf(['ziegelgold']);
    expect(kannBezahlen({ lumber: 0, brick: 2, wool: 0, grain: 0, ore: 0 }, COST_ROAD, z, 'strasse')).toBe(true);
    expect(kannBezahlen({ lumber: 0, brick: 1, wool: 0, grain: 0, ore: 0 }, COST_ROAD, z, 'strasse')).toBe(false);
  });

  it('Multiplikatoren sind gedeckelt, gelten je Gelaende und Zahl', () => {
    const m = modifiersOf(['fuellhorn', 'doppeljoch']);
    expect(ertragsFaktor(m, 'field', 2, 'dorf')).toBe(6);
    expect(ertragsFaktor(m, 'field', 6, 'dorf')).toBe(2);
    expect(ertragsFaktor(modifiersOf(['monopol']), 'field', 6, 'dorf')).toBe(0);
    expect(ertragsFaktor(modifiersOf(['monopol']), 'forest', 6, 'dorf')).toBe(1);
  });

  it('Sperren der Krone wirken im Reducer', () => {
    const { g, p } = partie();
    p.krone = 'fuellhorn';
    p.hand = { lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0 };
    const r = applyAction(g, { t: 'bankTrade', give: 'lumber', receive: 'ore' }, 'p0');
    expect(r.ok).toBe(false);
  });

  it('Zinseszins senkt die Handgrenze, nie unter zwei', () => {
    const { s, p } = partie();
    const vorher = limitFor(s, 'p0');
    p.krone = 'zinseszins';
    expect(limitFor(s, 'p0')).toBe(vorher - 3);
  });

  it('Ahnenmutter verdoppelt die Sippen, laesst nur eine wirken; Bund deckelt', () => {
    const sippe = { ernte: 2, handel: 2, bau: 2 };
    expect(sippenBoni(sippe, undefined, sippenRegeln(['ahnenmutter']))).toEqual(['sippe:ernte:2', 'sippe:ernte:4']);
    const bund = sippenBoni({ ernte: 6, handel: 2, bau: 2 }, undefined, sippenRegeln(['bund_der_sippen']));
    expect(bund).toContain('sippe:bau:2');
    expect(bund).not.toContain('sippe:ernte:6');
    expect(wirksameKarten({ activeCards: ['saatgut'], krone: 'ahnenmutter', sippe: { ernte: 1 } })).toContain('sippe:ernte:2');
  });
});

describe('Kronplatz', () => {
  it('eine gewaehlte Schluesselkarte geht in die Krone, nicht in die Plaetze', () => {
    const { g, s } = partie();
    s.phase = { t: 'draft' };
    s.draft = { source: 'trophaee', options: ['metropole', 'fuellhorn', 'dorfidyll'] };
    expect(applyAction(g, { t: 'chooseCard', card: 'metropole' }, 'p0').ok).toBe(true);
    const p = g.state.players[0]!;
    expect(p.krone).toBe('metropole');
    expect(p.activeCards).not.toContain('metropole');
    // Wechsel zu einer nicht besessenen Krone geht nicht.
    g.state.phase = { t: 'main' };
    expect(applyAction(g, { t: 'setKrone', card: 'fuellhorn' }, 'p0').ok).toBe(false);
    expect(cardById('metropole')!.schluessel).toBe(true);
  });
});
