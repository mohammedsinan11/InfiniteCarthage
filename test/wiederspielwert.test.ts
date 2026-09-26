/**
 * Omen, Rundengrenze, Wuerfel je Zug, Chronik und Tagesexpedition
 * (REPLAYABILITY.md).
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame, wuerfelFuer } from '../src/core/rules/reducer';
import type { Action, Game, PartieOptionen } from '../src/core/rules/reducer';
import { legalRoadEdges, legalSettlementVertices } from '../src/core/rules/placement';
import { currentPlayerId, publicPoints } from '../src/core/state';
import { hexKey, hexVertices, vertexKey } from '../src/core/coords';
import type { PlayerId } from '../src/core/state';
import { NO_TARGET } from '../src/core/protocol';
import { OMEN, ertragsBonus, gueltigeOmen, handelsAufschlag, handelsDeckel, omenById, wuerfleOmen } from '../src/core/omen';
import { productionSources } from '../src/core/rules/production';
import { tradeRatio } from '../src/core/rules/trade';
import { HAND_LIMIT, limitFor } from '../src/core/rules/handlimit';
import { MAX_MOMENTE, chronikFortschreiben, wertung } from '../src/core/chronik';
import { redactStateFor } from '../src/core/redact';
import { migriereStand } from '../src/core/rules/migration';
import {
  TAGES_RUNDEN,
  bestenliste,
  istBestenEintrag,
  tagesDatum,
  tagesOmen,
  tagesWeltSeed,
} from '../src/core/tages';
import type { BestenEintrag } from '../src/core/tages';
import { sendHorde } from '../src/core/rules/army';
import { Rng } from '../src/core/rng';

function solo(optionen: PartieOptionen = {}, targetPoints = NO_TARGET, secret = 77): Game {
  return createGame([{ id: 'p0', name: 'Solo' }], 4242, secret, targetPoints, optionen);
}

function must(game: Game, action: Action, actor: PlayerId) {
  const r = applyAction(game, action, actor);
  if (!r.ok) throw new Error(`${action.t} scheiterte: ${r.error}`);
  return r;
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

/** Einen ganzen Zug spielen: wuerfeln, eine Wahl treffen, beenden. */
function spieleZug(game: Game): void {
  const p = currentPlayerId(game.state);
  must(game, { t: 'roll' }, p);
  while (game.state.phase.t === 'draft') {
    must(game, { t: 'chooseCard', card: game.state.draft!.options[0]! }, p);
  }
  if (game.state.phase.t === 'main') must(game, { t: 'endTurn' }, p);
}

describe('Omen', () => {
  it('haben eindeutige Kennungen und heben Gegensaetze gegenseitig auf', () => {
    const ids = OMEN.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of OMEN) {
      for (const g of o.gegen ?? []) expect(omenById(g)?.gegen).toContain(o.id);
    }
  });

  it('wuerfleOmen liefert einen Segen und einen Fluch, rein aus der Zahl', () => {
    for (let seed = 0; seed < 200; seed++) {
      const o = wuerfleOmen(seed);
      expect(o).toEqual(wuerfleOmen(seed));
      expect(o.map((id) => omenById(id)!.art).sort()).toEqual(['fluch', 'segen']);
      // Nie zwei, die sich widersprechen.
      expect(gueltigeOmen(o)).toEqual(o);
    }
  });

  it('gueltigeOmen verwirft Unbekanntes, Doppeltes und Widerspruechliches', () => {
    expect(gueltigeOmen(['blutmond', 'gibtsnicht', 'blutmond', 7])).toEqual(['blutmond']);
    expect(gueltigeOmen(['handelswinde', 'zoellner'])).toEqual(['handelswinde']);
  });

  it('createGame nimmt nur gueltige Omen an', () => {
    const g = solo({ omens: ['reiche_adern', 'unsinn'] });
    expect(g.state.omens).toEqual(['reiche_adern']);
  });

  it('Reiche Adern hebt den Ertrag der Berge fuer alle', () => {
    expect(ertragsBonus(['reiche_adern'], 'mountain')).toBe(1);
    const g = solo();
    // Ein Dorf an einen Berg mit Zahl setzen - die Startplaetze treffen nicht immer einen.
    const berg = [...g.world.tiles.values()].find((t) => t.terrain === 'mountain' && t.number !== null)!;
    expect(berg).toBeDefined();
    const ecke = vertexKey(hexVertices(berg.q, berg.r)[0]!);
    g.state.buildings = { [ecke]: { owner: 'p0', type: 'settlement' } };
    const erz = (omens: string[]) =>
      productionSources({ ...g.state, omens }, g.world, berg.number!)
        .filter((q) => q.hex === hexKey(berg.q, berg.r))
        .reduce((a, q) => a + q.amount, 0);
    expect(erz([])).toBe(1);
    expect(erz(['reiche_adern'])).toBe(2);
  });

  it('Magere Weiden laesst den Ertrag nie unter null fallen', () => {
    expect(ertragsBonus(['magere_weiden'], 'pasture')).toBe(-1);
    const g = solo({ omens: ['magere_weiden'] });
    runSetup(g);
    for (let n = 2; n <= 12; n++) {
      for (const s of productionSources(g.state, g.world, n)) expect(s.amount).toBeGreaterThan(0);
    }
  });

  it('Handelswinde deckeln den Bankhandel bei 3:1, Zoellner schlagen auf', () => {
    expect(handelsDeckel(['handelswinde'])).toBe(3);
    expect(handelsAufschlag(['zoellner'])).toBe(1);
    const g = solo();
    runSetup(g);
    const basis = tradeRatio(g.state, g.world, 'p0', 'lumber');
    expect(tradeRatio({ ...g.state, omens: ['handelswinde'] }, g.world, 'p0', 'lumber')).toBe(Math.min(basis, 3));
    expect(tradeRatio({ ...g.state, omens: ['zoellner'] }, g.world, 'p0', 'lumber')).toBe(basis + 1);
  });

  it('Volle Speicher und Leere Taschen verschieben die Handkartengrenze', () => {
    const g = solo();
    expect(limitFor({ ...g.state, omens: ['volle_speicher'] }, 'p0')).toBe(HAND_LIMIT + 3);
    expect(limitFor({ ...g.state, omens: ['leere_taschen'] }, 'p0')).toBe(HAND_LIMIT - 2);
  });

  it('Gruenderzeit gibt jedem nach dem Aufbau eine Beute', () => {
    const g = solo({ omens: ['gruenderzeit'] });
    runSetup(g);
    expect(g.state.players[0]!.loot).toBe(1);
    const ohne = solo();
    runSetup(ohne);
    expect(ohne.state.players[0]!.loot).toBe(0);
  });

  it('Unter dem Blutmond kommt die Horde sicher - und groesser', () => {
    // Ohne Blutmond gibt es Seeds, bei denen keine Horde kommt; mit ihm nie
    // weniger Goblins als ohne.
    const g = solo({ omens: ['blutmond'] });
    runSetup(g);
    const ohne = solo();
    runSetup(ohne);
    for (let seed = 1; seed < 30; seed++) {
      const a = structuredClone(g.state);
      const b = structuredClone(ohne.state);
      const ea: { t: string; anzahl?: number }[] = [];
      const eb: { t: string; anzahl?: number }[] = [];
      sendHorde(a, new Rng(seed), ea);
      sendHorde(b, new Rng(seed), eb);
      const na = ea.find((e) => e.t === 'horde')?.anzahl ?? 0;
      const nb = eb.find((e) => e.t === 'horde')?.anzahl ?? 0;
      if (nb > 0) expect(na).toBe(nb + 2);
      if (na === 0) {
        // Kein Lager in Reichweite - dann kann auch der Blutmond nichts schicken.
        expect(nb).toBe(0);
      }
    }
  });

  it('stehen in der redigierten Sicht fuer alle', () => {
    const g = solo({ omens: ['zoellner'] });
    expect(redactStateFor(g.state, 'p0').omens).toEqual(['zoellner']);
  });
});

describe('Wuerfel je Zug', () => {
  it('haengen nur von geheimem Seed und Zugnummer ab', () => {
    expect(wuerfelFuer(5, 10)).toEqual(wuerfelFuer(5, 10));
    const alle = new Set<string>();
    for (let t = 1; t < 200; t++) {
      const [a, b] = wuerfelFuer(123, t);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(6);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(6);
      alle.add(`${a}${b}`);
    }
    // Alle 36 Paare kommen in 200 Wuerfen vor - kein kaputter Strom.
    expect(alle.size).toBe(36);
  });

  it('bleiben gleich, auch wenn eine Partie zwischendurch anders verlief', () => {
    const a = solo();
    const b = solo();
    runSetup(a);
    runSetup(b);
    // b verbraucht den fortlaufenden Zufall anders (etwa ein Kampf oder eine Karte).
    b.state.rngState = (b.state.rngState + 999) | 0;
    for (let i = 0; i < 5; i++) {
      spieleZug(a);
      spieleZug(b);
      expect(a.state.lastRoll).toEqual(b.state.lastRoll);
    }
  });
});

describe('Rundengrenze', () => {
  it('beendet die Partie nach der letzten Runde mit der hoechsten Wertung', () => {
    const g = solo({ rundenLimit: 6 });
    runSetup(g);
    let guard = 0;
    while (g.state.phase.t !== 'finished') {
      if (guard++ > 20) throw new Error('Rundengrenze greift nicht');
      spieleZug(g);
    }
    expect(g.state.turn).toBe(6);
    expect(g.state.phase).toEqual({ t: 'finished', winner: 'p0', durch: 'zeit' });
    expect(applyAction(g, { t: 'roll' }, 'p0')).toEqual({ ok: false, error: 'Die Partie ist beendet.' });
  });

  it('entscheidet zu mehreren nach der Wertung', () => {
    const g = createGame(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      4242,
      77,
      NO_TARGET,
      { rundenLimit: 4 },
    );
    runSetup(g);
    g.state.players[1]!.ruhm = 7; // B liegt vorn
    while (g.state.phase.t !== 'finished') spieleZug(g);
    expect(g.state.phase.t === 'finished' && g.state.phase.winner).toBe('b');
  });

  it('wer untergegangen ist, gewinnt auch nach Wertung nicht', () => {
    const g = createGame(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      4242,
      77,
      NO_TARGET,
      { rundenLimit: 4 },
    );
    runSetup(g);
    g.state.players[1]!.ruhm = 50; // B laege weit vorn ...
    g.state.players[1]!.besiegt = true; // ... ist aber gefallen
    while (g.state.phase.t !== 'finished') spieleZug(g);
    expect(g.state.phase.t === 'finished' && g.state.phase.winner).toBe('a');
  });

  it('wertung: Siegpunkte zehnfach, Ruhm einfach', () => {
    const g = solo();
    runSetup(g);
    g.state.players[0]!.ruhm = 3;
    expect(wertung(g.state, 'p0')).toBe(publicPoints(g.state, 'p0') * 10 + 3);
  });
});

describe('Chronik', () => {
  it('beginnt nach dem Aufbau und schreibt Ertrag, Karten und Verlauf fort', () => {
    const g = solo({ rundenLimit: 12 });
    runSetup(g);
    const c = () => g.state.chronik!;
    expect(c().verlauf).toHaveLength(1);
    expect(c().stats.p0!.strassen).toBe(0); // der Aufbau zaehlt nicht
    while (g.state.phase.t !== 'finished') spieleZug(g);
    // Runde 1, dann grosse Runden bei 6 und 11, dann der Schluss.
    expect(c().verlauf.map((v) => v.turn)).toEqual([1, 6, 11, 12]);
    const ertrag = Object.values(c().stats.p0!.ertrag).reduce((a, b) => a + b, 0);
    expect(ertrag).toBeGreaterThan(0);
    expect(c().momente.at(-1)?.art).toBe('ende');
  });

  it('haelt verdeckte Siegpunkte aus dem Verlauf, bis die Partie endet', () => {
    const g = solo({ rundenLimit: 6 });
    runSetup(g);
    g.state.players[0]!.dev.push({ type: 'victoryPoint', boughtTurn: 0, played: false });
    for (let i = 0; i < 5; i++) spieleZug(g);
    const vorher = g.state.chronik!.verlauf.at(-1)!.punkte[0];
    expect(vorher).toBe(publicPoints(g.state, 'p0'));
    spieleZug(g);
    expect(g.state.phase.t).toBe('finished');
    expect(g.state.chronik!.verlauf.at(-1)!.punkte[0]).toBe(publicPoints(g.state, 'p0') + 1);
  });

  it('deckelt die Momente', () => {
    const g = solo();
    runSetup(g);
    const viele = Array.from({ length: MAX_MOMENTE + 30 }, (_, i) => ({ t: 'questDone', player: 'p0', id: i, art: 'jagd' }));
    chronikFortschreiben(g.state, viele as never);
    expect(g.state.chronik!.momente).toHaveLength(MAX_MOMENTE);
    expect(g.state.chronik!.stats.p0!.auftraege).toBe(MAX_MOMENTE + 30);
  });

  it('nennt jede Horde eines Stammes nur einmal', () => {
    const g = solo();
    runSetup(g);
    const horde = { t: 'horde', round: 1, q: 0, r: 0, fraktion: 'f:0:0', anzahl: 4 };
    chronikFortschreiben(g.state, [horde, horde, horde] as never);
    expect(g.state.chronik!.momente.filter((m) => m.art === 'horde')).toHaveLength(1);
  });

  it('wird bei alten Spielstaenden nachgetragen', () => {
    const g = solo();
    runSetup(g);
    const alt = structuredClone(g.state) as Partial<typeof g.state>;
    delete alt.chronik;
    delete alt.omens;
    delete alt.rundenLimit;
    delete alt.tagesDatum;
    const neu = migriereStand(alt as typeof g.state);
    expect(neu.omens).toEqual([]);
    expect(neu.rundenLimit).toBeNull();
    expect(neu.chronik!.verlauf).toHaveLength(1);
    expect(neu.chronik!.stats.p0).toBeDefined();
  });
});

describe('Tagesexpedition', () => {
  it('Datum in UTC, Welt und Omen rein aus dem Datum', () => {
    expect(tagesDatum(new Date('2026-09-26T23:30:00Z'))).toBe('2026-09-26');
    expect(tagesWeltSeed('2026-09-26')).toBe(tagesWeltSeed('2026-09-26'));
    expect(tagesWeltSeed('2026-09-26')).not.toBe(tagesWeltSeed('2026-09-27'));
    const o = tagesOmen('2026-09-26');
    expect(o.map((id) => omenById(id)!.art).sort()).toEqual(['fluch', 'fluch', 'segen']);
    expect(gueltigeOmen(o)).toEqual(o);
    expect(TAGES_RUNDEN).toBe(60);
  });

  it('zwei Spieler am selben Tag bekommen dieselbe Welt und dieselben Wuerfe', () => {
    const datum = '2026-09-26';
    const neu = (id: string) =>
      createGame([{ id, name: id }], tagesWeltSeed(datum), 31337, NO_TARGET, {
        omens: tagesOmen(datum),
        rundenLimit: TAGES_RUNDEN,
        tagesDatum: datum,
      });
    const a = neu('a');
    const b = neu('b');
    expect(a.state.worldSeed).toBe(b.state.worldSeed);
    runSetup(a);
    runSetup(b);
    for (let i = 0; i < 8; i++) {
      spieleZug(a);
      spieleZug(b);
      expect(a.state.lastRoll).toEqual(b.state.lastRoll);
    }
    expect(redactStateFor(a.state, 'a').tagesDatum).toBe(datum);
  });

  it('bestenliste: je Name das Beste, hoechste Wertung zuerst', () => {
    const e = (name: string, wertung: number, zeit: number, code = name + zeit): BestenEintrag => ({
      name,
      wertung,
      punkte: Math.floor(wertung / 10),
      ruhm: wertung % 10,
      code,
      zeit,
    });
    const liste = bestenliste([e('Anna', 80, 1), e('anna', 120, 2), e('Bo', 120, 1), e('Cy', 50, 1)]);
    expect(liste.map((x) => `${x.name}:${x.wertung}`)).toEqual(['Bo:120', 'anna:120', 'Cy:50']);
    expect(bestenliste(Array.from({ length: 40 }, (_, i) => e('n' + i, i, i)))).toHaveLength(20);
  });

  it('istBestenEintrag prueft die Form', () => {
    expect(istBestenEintrag({ name: 'A', wertung: 10, punkte: 1, ruhm: 0, code: 'ABCDEF', zeit: 1 })).toBe(true);
    expect(istBestenEintrag({ name: '', wertung: 10, punkte: 1, ruhm: 0, code: 'X', zeit: 1 })).toBe(false);
    expect(istBestenEintrag({ name: 'A', wertung: 1.5, punkte: 1, ruhm: 0, code: 'X', zeit: 1 })).toBe(false);
  });
});
