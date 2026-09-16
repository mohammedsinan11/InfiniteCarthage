/**
 * Bogenschuetzen: Anwerben, Beschuss auf Feinde nebenan, erhoeht zwei Felder
 * weit, kein Schuss aus dem Nahkampf, kein Vorstuermen.
 *
 * Schuesse werden gewuerfelt - die Tests probieren mehrere Wuerfelstaende und
 * pruefen, dass die Folgen zum Ausgang passen.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { beschuss, tickArmy } from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { hexDistance, hexKey, hexVertices, hexesInRange, neighbors, vertexKey } from '../src/core/coords';
import { WERTE, bogenErhoeht, einheitVorlage, isLandAt, settlementApproaches } from '../src/core/units';
import { nestAt } from '../src/core/raiders';
import { ruinAt } from '../src/core/ruins';
import { COST_ARCHER } from '../src/core/rules/costs';
import { Rng } from '../src/core/rng';
import { handSize } from '../src/core/state';
import type { UnitState } from '../src/core/state';
import { RESOURCES } from '../src/core/types';

const ORIGIN = { q: 0, r: 0 };
const FREMD = 'f:99:99';
const solo = (): Game => createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15);

/** Ein Feld, um das im Radius alles Land ist - ohne Lager und Ruinen. */
function landFlaeche(game: Game, radius: number) {
  const seed = game.state.worldSeed;
  const h = hexesInRange(ORIGIN, 20).find((c) =>
    hexesInRange(c, radius).every((x) => isLandAt(seed, x.q, x.r) && !nestAt(seed, x.q, x.r) && !ruinAt(seed, x.q, x.r)),
  );
  if (!h) throw new Error('keine freie Landflaeche');
  return h;
}

function einheit(game: Game, u: Omit<UnitState, 'id'>): UnitState {
  const neu = { ...u, id: game.state.nextUnitId++ };
  game.state.units.push(neu);
  return neu;
}

const bogen = (q: number, r: number) => einheitVorlage('bogen', q, r, { owner: 'p0' });
const raeuber = (q: number, r: number) => einheitVorlage('raeuber', q, r, { fraktion: FREMD, heimat: 'test' });

/** Beschuss mit vielen Wuerfelstaenden, bis einer trifft. */
function bisTreffer(game: Game, ziel: UnitState): ArmyEvent[] {
  for (let seed = 1; seed < 60; seed++) {
    const vorher = structuredClone(game.state);
    const events: ArmyEvent[] = [];
    beschuss(game.state, new Rng(seed), events);
    const nachher = game.state.units.find((u) => u.id === ziel.id);
    if (!nachher || nachher.leben < WERTE.raeuber.leben) return events;
    game.state = vorher;
  }
  throw new Error('kein Treffer in 60 Wuerfen');
}

describe('Bogenschuetzen', () => {
  it('werden fuer 2 Holz und 1 Wolle an einer eigenen Siedlung angeworben', () => {
    const game = solo();
    const h = landFlaeche(game, 1);
    game.state.buildings[vertexKey({ q: h.q, r: h.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    game.state.phase = { t: 'main' };
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = COST_ARCHER[r] ?? 0;
    const res = applyAction(game, { t: 'recruitArcher' }, 'p0');
    expect(res.ok).toBe(true);
    expect(handSize(game.state.players[0]!.hand)).toBe(0);
    const neu = game.state.units.find((u) => u.kind === 'bogen')!;
    expect(neu.owner).toBe('p0');
    expect(neu.leben).toBe(WERTE.bogen.leben);
    expect(settlementApproaches(game.state, 'p0').has(hexKey(neu.q, neu.r))).toBe(true);
    if (res.ok) expect(res.events).toContainEqual(expect.objectContaining({ t: 'knightReady', kind: 'bogen' }));
    expect(applyAction(game, { t: 'recruitArcher' }, 'p0').ok).toBe(false);
  });

  it('schiessen auf Feinde nebenan, ohne selbst getroffen zu werden', () => {
    const game = solo();
    const h = landFlaeche(game, 2);
    const n = neighbors(h.q, h.r)[0]!;
    const schuetze = einheit(game, bogen(h.q, h.r));
    const ziel = einheit(game, raeuber(n.q, n.r));
    const events = bisTreffer(game, ziel);
    const salve = events.find((e) => e.t === 'volley');
    expect(salve).toMatchObject({ player: 'p0', zq: n.q, zr: n.r, schuesse: 1, treffer: 1 });
    expect(game.state.units.find((u) => u.id === schuetze.id)!.leben).toBe(WERTE.bogen.leben);
    // Kein Nahkampf: beide stehen weiter auf ihren Feldern.
    expect(game.state.units.find((u) => u.id === schuetze.id)).toMatchObject({ q: h.q, r: h.r });
  });

  it('reichen erhoeht - neben einem eigenen Wachturm - zwei Felder weit', () => {
    const game = solo();
    const h = landFlaeche(game, 3);
    const fern = hexesInRange(h, 2).find((x) => hexDistance(h, x) === 2)!;
    einheit(game, bogen(h.q, h.r));
    const ziel = einheit(game, raeuber(fern.q, fern.r));

    const ohne: ArmyEvent[] = [];
    beschuss(game.state, new Rng(1), ohne);
    expect(ohne.some((e) => e.t === 'volley')).toBe(false);

    const ecke = vertexKey(hexVertices(h.q, h.r)[0]!);
    game.state.tuerme[ecke] = { owner: 'p0', stufe: 1 };
    expect(bogenErhoeht(game.state, { q: h.q, r: h.r, owner: 'p0' })).toBe(true);
    bisTreffer(game, ziel);
  });

  it('schiessen nicht aus dem Nahkampf und stuermen nicht vor', () => {
    const game = solo();
    const h = landFlaeche(game, 2);
    einheit(game, bogen(h.q, h.r));
    einheit(game, raeuber(h.q, h.r));
    const events: ArmyEvent[] = [];
    beschuss(game.state, new Rng(3), events);
    expect(events.some((e) => e.t === 'volley')).toBe(false);

    // Ohne Feind auf dem eigenen Feld, einer nebenan: der Schuetze bleibt stehen.
    const game2 = solo();
    const h2 = landFlaeche(game2, 2);
    const n2 = neighbors(h2.q, h2.r)[0]!;
    const s2 = einheit(game2, bogen(h2.q, h2.r));
    const r2 = einheit(game2, raeuber(n2.q, n2.r));
    r2.auftrag = 'heimkehr';
    tickArmy(game2.state, game2.world, []);
    const nachher = game2.state.units.find((u) => u.id === s2.id);
    if (nachher) expect(hexKey(nachher.q, nachher.r)).toBe(hexKey(h2.q, h2.r));
  });
});
