/** Drei Akte mit Bossen (core/akte.ts, rules/akt.ts) und Systeme ueber die Partien (core/systeme.ts). */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { GameEvent } from '../src/core/rules/reducer';
import { BOSSE, aktVon, bossById, waehleBosse } from '../src/core/akte';
import { akteFortschreiben, bossLohnNehmen, bossZahlen } from '../src/core/rules/akt';
import { handSize, publicPoints } from '../src/core/state';
import type { GameState } from '../src/core/state';
import { hatSystem, neuesSystem, systemeFuer } from '../src/core/systeme';
import { siegwegeAn } from '../src/core/siegwege';
import { cardById } from '../src/core/cards/catalog';
import { hexVertices, vertexKey } from '../src/core/coords';
import { isLandAt } from '../src/core/units';

const sammeln = () => {
  const ev: GameEvent[] = [];
  return { ev, push: (...e: GameEvent[]) => ev.push(...e) };
};

function partie(systeme?: string[]) {
  const g = createGame([{ id: 'p0', name: 'S' }, { id: 'bot_a', name: 'Hanno' }], 7, 11, 15, {
    ereignisse: true,
    rundenLimit: 45,
    akte: true,
    bots: ['bot_a'],
    ...(systeme ? { systeme: systeme as never } : {}),
  });
  const s = g.state;
  // Nach dem Aufbau: Runde 1, Bauphase.
  s.turn = 1;
  s.phase = { t: 'main' };
  return { g, s };
}

/** Ein Dorf fuer jemanden auf einer Landecke nahe dem Ursprung. */
function dorf(s: GameState, id: string, n = 0): string {
  const ecken = [...hexVertices(0, 0), ...hexVertices(3, -1), ...hexVertices(-2, 2)].filter(() => isLandAt(s.worldSeed, 0, 0));
  const vk = vertexKey(ecken[n * 2]!);
  s.buildings[vk] = { owner: id, type: 'settlement' };
  return vk;
}

describe('Akte', () => {
  it('drei Akte zu je einem Drittel der Rundengrenze', () => {
    const { s } = partie();
    expect(s.akte?.laenge).toBe(15);
    expect(s.akte?.bosse).toHaveLength(3);
    expect(aktVon(s.akte!, 1)).toBe(1);
    expect(aktVon(s.akte!, 15)).toBe(1);
    expect(aktVon(s.akte!, 16)).toBe(2);
    expect(aktVon(s.akte!, 45)).toBe(3);
    expect(aktVon(s.akte!, 99)).toBe(3);
  });

  it('keine Akte ohne Rundengrenze, ohne Ereignisse oder im Szenario', () => {
    expect(createGame([{ id: 'p0', name: 'S' }], 1, 2, 15, { ereignisse: true, akte: true }).state.akte).toBeUndefined();
    expect(createGame([{ id: 'p0', name: 'S' }], 1, 2, 15, { rundenLimit: 45, akte: true }).state.akte).toBeUndefined();
    expect(createGame([{ id: 'p0', name: 'S' }], 1, 2, 15, { ereignisse: true, rundenLimit: 45, akte: true, szenario: 'gruendung' }).state.akte).toBeUndefined();
  });

  it('die Bosse kommen aus dem Weltseed, je Akt passend, ohne Heer ohne Raubzuege', () => {
    for (let seed = 1; seed < 40; seed++) {
      const alle = waehleBosse(seed, {});
      expect(waehleBosse(seed, {})).toEqual(alle);
      alle.forEach((id, i) => expect(bossById(id)!.akte).toContain(i + 1));
      expect(new Set(alle).size).toBe(3);
      const ruhig = waehleBosse(seed, { systeme: [] });
      for (const id of ruhig) expect(bossById(id)!.art).not.toBe('heer');
    }
    expect(BOSSE.filter((b) => b.akte.includes(3)).length).toBeGreaterThanOrEqual(3);
  });

  it('der erste Akt beginnt fuer jeden gleich nach dem Aufbau', () => {
    const { s } = partie();
    const e = sammeln();
    akteFortschreiben(s, e, null);
    expect(Object.keys(s.akte!.stand).sort()).toEqual(['bot_a', 'p0']);
    expect(e.ev.filter((x) => x.t === 'aktBeginn')).toHaveLength(2);
    // Ein zweiter Aufruf aendert nichts.
    const e2 = sammeln();
    akteFortschreiben(s, e2, null);
    expect(e2.ev).toHaveLength(0);
  });

  it('kein frueher Sieg mit Akten', () => {
    const { g, s } = partie();
    s.buildings = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`v${i}`, { owner: 'p0', type: 'city' }])) as GameState['buildings'];
    const r = applyAction(g, { t: 'endTurn' }, 'p0');
    expect(r.ok).toBe(true);
    expect(g.state.phase.t).not.toBe('finished');
  });

  it('Tribut: einzahlen, bei voller Summe sofort bestanden - Punkte und Trophaee', () => {
    const { s } = partie();
    s.akte!.bosse[0] = 'steuervogt';
    akteFortschreiben(s, sammeln(), null);
    const st = s.akte!.stand.p0!;
    expect(st.forderung.t).toBe('tribut');
    const f = st.forderung as Extract<typeof st.forderung, { t: 'tribut' }>;
    const p = s.players[0]!;
    p.hand = { lumber: 9, brick: 9, wool: 9, grain: 9, ore: 9 };
    const vorher = publicPoints(s, 'p0');
    const e = sammeln();
    for (const r of Object.keys(f.soll) as (keyof typeof f.soll)[]) expect(bossZahlen(s, 'p0', r, e)).toBeNull();
    expect(bossZahlen(s, 'p0', Object.keys(f.soll)[0] as never, e)).not.toBeNull();
    akteFortschreiben(s, e, null);
    expect(st.ergebnis).toBe('besiegt');
    expect(s.akte!.siege.p0).toEqual([1]);
    expect(publicPoints(s, 'p0')).toBe(vorher + 1);
    expect(e.ev.some((x) => x.t === 'bossBesiegt')).toBe(true);
    // Der Lohn steht zur Wahl (B8).
    expect(p.bossLohn).toEqual(['trophaee', 'schmiede', 'relikt']);
    expect(bossLohnNehmen(s, 'p0', 'ruhm', e)).not.toBeNull();
    expect(bossLohnNehmen(s, 'p0', 'schmiede', e)).toBeNull();
    expect(p.schmiede).toBe(2);
    expect(p.bossLohn).toBeNull();
    expect(bossLohnNehmen(s, 'p0', 'trophaee', e)).not.toBeNull();
  });

  it('der letzte Boss frueh bezwungen fordert eine Zugabe: +1 Punkt, eine offene kostet nichts', () => {
    const { s } = partie();
    s.akte!.bosse[2] = 'eiserne_koenigin';
    s.turn = 2 * s.akte!.laenge + 1;
    akteFortschreiben(s, sammeln(), null);
    const st = s.akte!.stand.p0!;
    expect(st.akt).toBe(3);
    const f = st.forderung as Extract<typeof st.forderung, { t: 'tribut' }>;
    const p = s.players[0]!;
    p.hand = { lumber: 20, brick: 20, wool: 20, grain: 20, ore: 20 };
    const e = sammeln();
    for (const r of Object.keys(f.soll) as (keyof typeof f.soll)[]) bossZahlen(s, 'p0', r, e);
    akteFortschreiben(s, e, null);
    expect(s.akte!.siege.p0).toEqual([3]);
    expect(s.akte!.zugaben?.p0 ?? 0).toBe(0);
    const zugabe = s.akte!.stand.p0!;
    expect(zugabe.zugabe).toBe(1);
    expect(zugabe.ergebnis).toBe('offen');
    expect(e.ev.some((x) => x.t === 'bossZugabe')).toBe(true);
    // Am Ende offen: kein Verlust.
    const hand = handSize(p.hand);
    akteFortschreiben(s, sammeln(), zugabe.bis);
    expect(zugabe.ergebnis).toBe('verfehlt');
    expect(handSize(p.hand)).toBe(hand);
  });

  it('verfehlt am Ende des Aktes: die Haelfte der Hand und ein Punkt Ruhm', () => {
    const { s } = partie();
    s.akte!.bosse[0] = 'kronbote';
    akteFortschreiben(s, sammeln(), null);
    const p = s.players[0]!;
    p.hand = { lumber: 4, brick: 4, wool: 0, grain: 0, ore: 0 };
    p.ruhm = 2;
    s.turn = 15;
    const e = sammeln();
    akteFortschreiben(s, e, 15);
    expect(s.akte!.stand.p0!.ergebnis).toBe('verfehlt');
    expect(handSize(p.hand)).toBe(4);
    expect(p.ruhm).toBe(1);
    // Danach beginnt der zweite Akt.
    s.turn = 16;
    akteFortschreiben(s, e, null);
    expect(s.akte!.stand.p0!.akt).toBe(2);
  });

  it('Ziel: Wachstum gegenueber dem Beginn des Aktes', () => {
    const { s } = partie();
    s.akte!.bosse[0] = 'kronbote';
    dorf(s, 'p0', 0);
    akteFortschreiben(s, sammeln(), null);
    const f = s.akte!.stand.p0!.forderung;
    expect(f).toMatchObject({ t: 'ziel', mass: 'siedlungen', start: 1, soll: 3 });
    dorf(s, 'p0', 1);
    dorf(s, 'p0', 2);
    const e = sammeln();
    akteFortschreiben(s, e, null);
    expect(s.akte!.stand.p0!.ergebnis).toBe('besiegt');
  });

  it('Heer: bricht zur Mitte auf; erschlagen heisst bestanden', () => {
    const { s } = partie(['raub']);
    s.akte!.bosse[0] = 'grenzfuerst';
    dorf(s, 'p0', 0);
    akteFortschreiben(s, sammeln(), null);
    const st = s.akte!.stand.p0!;
    const f = st.forderung as Extract<typeof st.forderung, { t: 'heer' }>;
    expect(f.ids).toBeNull();
    s.turn = f.abRunde;
    const e = sammeln();
    akteFortschreiben(s, e, null);
    if (st.forderung.t === 'heer') {
      expect(f.ids!.length).toBe(2);
      expect(e.ev.some((x) => x.t === 'bossNaht')).toBe(true);
      // Das Heer faellt.
      s.units = s.units.filter((u) => !f.ids!.includes(u.id));
      akteFortschreiben(s, e, null);
      expect(st.ergebnis).toBe('besiegt');
    } else {
      // Kein Weg ins Reich: der Boss verlangt Wachstum.
      expect(st.forderung.t).toBe('ziel');
    }
  });

  it('Heer: nur echte Beute verliert den Akt - umkehren allein nicht, und es wird gemeldet', () => {
    const { s } = partie(['raub']);
    s.akte!.bosse[0] = 'grenzfuerst';
    dorf(s, 'p0', 0);
    akteFortschreiben(s, sammeln(), null);
    const st = s.akte!.stand.p0!;
    if (st.forderung.t !== 'heer') return;
    s.turn = st.forderung.abRunde;
    akteFortschreiben(s, sammeln(), null);
    if (st.forderung.t !== 'heer' || !st.forderung.ids) return;
    const f = st.forderung;
    const heer = s.units.filter((u) => f.ids!.includes(u.id));
    expect(heer.every((u) => u.bossFuer === 'p0')).toBe(true);
    heer[0]!.auftrag = 'heimkehr';
    const e = sammeln();
    akteFortschreiben(s, e, null);
    expect(f.entkommen).toBe(false);
    heer[0]!.traegt = 3;
    akteFortschreiben(s, e, null);
    expect(f.entkommen).toBe(true);
    expect(e.ev.filter((x) => x.t === 'bossEntkommen').length).toBe(1);
  });

  it('eine Trophaee ohne Krone bietet immer eine Schluesselkarte', () => {
    const { g, s } = partie();
    s.players[0]!.trophaeen = 1;
    s.gesperrt = [];
    const r = applyAction(g, { t: 'claimLoot' }, 'p0');
    expect(r.ok).toBe(true);
    expect(g.state.draft!.options.some((id) => cardById(id)?.schluessel)).toBe(true);
  });

  it('frueh bezwungen: der naechste Akt beginnt sofort, mit seiner normalen Frist', () => {
    const { s } = partie();
    s.akte!.bosse[0] = 'steuervogt';
    akteFortschreiben(s, sammeln(), null);
    const st = s.akte!.stand.p0!;
    const f = st.forderung as Extract<typeof st.forderung, { t: 'tribut' }>;
    s.players[0]!.hand = { lumber: 9, brick: 9, wool: 9, grain: 9, ore: 9 };
    const e = sammeln();
    for (const r of Object.keys(f.soll) as (keyof typeof f.soll)[]) bossZahlen(s, 'p0', r, e);
    akteFortschreiben(s, e, null);
    expect(st.ergebnis).toBe('besiegt');
    akteFortschreiben(s, e, null);
    const neu = s.akte!.stand.p0!;
    expect(neu.akt).toBe(2);
    expect(neu.bis).toBe(2 * s.akte!.laenge);
    expect(e.ev.some((x) => x.t === 'aktBeginn' && x.akt === 2)).toBe(true);
  });

  it('Heer: wer bis zum Ende standhaelt, ohne gepluendert zu werden, hat bestanden', () => {
    const { s } = partie(['raub']);
    s.akte!.bosse[0] = 'grenzfuerst';
    dorf(s, 'p0', 0);
    akteFortschreiben(s, sammeln(), null);
    const st = s.akte!.stand.p0!;
    if (st.forderung.t !== 'heer') return;
    s.turn = st.forderung.abRunde;
    akteFortschreiben(s, sammeln(), null);
    if (st.forderung.t !== 'heer' || !st.forderung.ids) return;
    const ids = st.forderung.ids;
    akteFortschreiben(s, sammeln(), st.bis);
    expect(st.ergebnis).toBe('besiegt');
    expect(s.units.some((u) => ids.includes(u.id))).toBe(false);
  });

  it('die Trophaee oeffnet eine Wahl, auch ueber die Wahlen je Zug hinaus', () => {
    const { g, s } = partie();
    s.players[0]!.trophaeen = 1;
    s.wahlen = { gesamt: 5, zug: 1, imZug: 9 };
    const r = applyAction(g, { t: 'claimLoot' }, 'p0');
    expect(r.ok).toBe(true);
    expect(g.state.draft?.source).toBe('trophaee');
    expect(g.state.players[0]!.trophaeen).toBe(0);
  });
});

describe('Systeme', () => {
  it('kommen nacheinander mit den Partien', () => {
    expect(systemeFuer(0)).toEqual([]);
    expect(systemeFuer(1)).toEqual(['raub']);
    expect(systemeFuer(2)).toEqual(['raub', 'held']);
    expect(systemeFuer(9)).toEqual(['raub', 'held', 'ereignisse', 'reich']);
    expect(neuesSystem(2)?.id).toBe('held');
    expect(neuesSystem(0)).toBeNull();
  });

  it('ohne Liste gilt alles; Siegwege gehoeren zum Reich', () => {
    const { s } = partie();
    expect(hatSystem(s, 'raub')).toBe(true);
    // Mit Akten entscheidet das Ende des dritten Aktes - keine Siegwege.
    expect(siegwegeAn(s)).toBe(false);
    const frei = createGame([{ id: 'p0', name: 'S' }], 7, 11, 15, { ereignisse: true }).state;
    expect(siegwegeAn(frei)).toBe(true);
    const ruhig = createGame([{ id: 'p0', name: 'S' }], 7, 11, 15, { ereignisse: true, systeme: [] }).state;
    expect(hatSystem(ruhig, 'raub')).toBe(false);
    expect(siegwegeAn(ruhig)).toBe(false);
  });
});
