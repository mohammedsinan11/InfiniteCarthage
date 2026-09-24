/**
 * Der Wachturm steht fuer sich: auf einer freien Ecke an einer eigenen
 * Strasse, ohne Abstandsregel (rules/placement.ts, canPlaceTower). Frueher
 * hing er an einem Dorf oder einer Stadt - alte Staende ziehen um
 * (rules/migration.ts).
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { canPlaceTower, legalTowerVertices } from '../src/core/rules/placement';
import { migriereStand } from '../src/core/rules/migration';
import { benenneHeld, beschuss } from '../src/core/rules/army';
import { GESTALTEN } from '../src/core/lore';
import type { ArmyEvent } from '../src/core/rules/army';
import { COST_BEFESTIGTER_TURM, COST_GESCHUETZTURM, COST_TOWER } from '../src/core/rules/costs';
import { SICHT_TURM, einheitVorlage, isLandAt, sightOf } from '../src/core/units';
import { MAX_TURM_STUFE } from '../src/core/state';
import { Rng } from '../src/core/rng';
import {
  edgeEndpoints,
  edgeKey,
  hexEdges,
  hexVertices,
  hexesInRange,
  parseVertexKey,
  vertexAdjacentHexes,
  vertexKey,
  vertexNeighborVertices,
} from '../src/core/coords';
import { redactStateFor } from '../src/core/redact';
import { RESOURCES } from '../src/core/types';
import type { GameState } from '../src/core/state';

const ORIGIN = { q: 0, r: 0 };

function spiel(): Game {
  const game = createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], 2024, 4711, 0);
  game.state.phase = { t: 'main' };
  game.state.turn = 3;
  return game;
}

/** Ein Feld nahe dem Ursprung, dessen Nachbarn auch Land sind - dort ist alles erzeugt. */
function landFeld(game: Game) {
  const seed = game.state.worldSeed;
  return hexesInRange(ORIGIN, 3).find((h) => hexesInRange(h, 1).every((x) => isLandAt(seed, x.q, x.r)))!;
}

/** Eine Ecke des Feldes und eine eigene Strasse, die dort anliegt. */
function eckeMitStrasse(game: Game, owner = 'p0') {
  const h = landFeld(game);
  const vk = vertexKey(hexVertices(h.q, h.r)[0]!);
  const kante = hexEdges(h.q, h.r).find((e) => edgeEndpoints(e).some((v) => vertexKey(v) === vk))!;
  game.state.roads[edgeKey(kante)] = owner;
  return { h, vk };
}

function geben(game: Game, pid = 'p0') {
  const p = game.state.players.find((x) => x.id === pid)!;
  for (const r of RESOURCES) p.hand[r] += COST_TOWER[r] ?? 0;
}

describe('Wachturm setzen', () => {
  it('braucht eine eigene Strasse an der Ecke', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(hexVertices(h.q, h.r)[0]!);
    geben(game);
    const ohne = applyAction(game, { t: 'buildTower', vertex: vk }, 'p0');
    expect(ohne.ok).toBe(false);
    if (!ohne.ok) expect(ohne.error).toContain('Strasse');

    const kante = hexEdges(h.q, h.r).find((e) => edgeEndpoints(e).some((v) => vertexKey(v) === vk))!;
    game.state.roads[edgeKey(kante)] = 'p0';
    expect(applyAction(game, { t: 'buildTower', vertex: vk }, 'p0').ok).toBe(true);
    expect(game.state.tuerme[vk]).toEqual({ owner: 'p0', stufe: 1 });
    expect(RESOURCES.every((r) => game.state.players[0]!.hand[r] === 0)).toBe(true);
  });

  it('haelt keinen Abstand: direkt neben dem eigenen Dorf ist er erlaubt', () => {
    const game = spiel();
    const { vk } = eckeMitStrasse(game);
    const nachbar = vertexKey(vertexNeighborVertices({ ...parseVk(vk) })[0]!);
    game.state.buildings[nachbar] = { owner: 'p0', type: 'settlement' };
    expect(canPlaceTower(game.state, game.world, 'p0', vk)).toBe(null);
    geben(game);
    expect(applyAction(game, { t: 'buildTower', vertex: vk }, 'p0').ok).toBe(true);
  });

  it('nicht auf ein Haus und nicht zweimal auf dieselbe Ecke', () => {
    const game = spiel();
    const { vk } = eckeMitStrasse(game);
    geben(game);
    expect(applyAction(game, { t: 'buildTower', vertex: vk }, 'p0').ok).toBe(true);
    geben(game);
    const zweimal = applyAction(game, { t: 'buildTower', vertex: vk }, 'p0');
    expect(zweimal.ok).toBe(false);
    if (!zweimal.ok) expect(zweimal.error).toContain('Wachturm');

    const haus = vertexKey(vertexNeighborVertices({ ...parseVk(vk) })[0]!);
    game.state.buildings[haus] = { owner: 'p0', type: 'settlement' };
    expect(canPlaceTower(game.state, game.world, 'p0', haus)).toContain('Haus');
  });

  it('die Liste der erlaubten Ecken kennt dieselbe Regel', () => {
    const game = spiel();
    const { vk } = eckeMitStrasse(game);
    expect(legalTowerVertices(game.state, game.world, 'p0')).toContain(vk);
    expect(legalTowerVertices(game.state, game.world, 'p1')).toEqual([]);
  });

  it('sieht weiter als eine Siedlung - und alle sehen ihn', () => {
    const game = spiel();
    const { h, vk } = eckeMitStrasse(game);
    const ohne = sightOf(game.state, 'p0');
    game.state.tuerme[vk] = { owner: 'p0', stufe: 1 };
    const mit = sightOf(game.state, 'p0');
    expect(mit.size).toBeGreaterThan(ohne.size);
    for (const c of hexesInRange(h, SICHT_TURM - 1)) expect(mit.has(`${c.q}:${c.r}`)).toBe(true);
    expect(redactStateFor(game.state, 'p1').tuerme[vk]).toEqual({ owner: 'p0', stufe: 1 });
  });
});

describe('Geschuetzturm', () => {
  /** Einen eigenen Turm setzen und das Geld fuer den Ausbau geben. */
  function mitTurm() {
    const game = spiel();
    const { h, vk } = eckeMitStrasse(game);
    geben(game);
    expect(applyAction(game, { t: 'buildTower', vertex: vk }, 'p0').ok).toBe(true);
    for (const r of RESOURCES) game.state.players[0]!.hand[r] += COST_GESCHUETZTURM[r] ?? 0;
    return { game, h, vk };
  }

  it('baut den Grenzposten zum Geschuetzturm und weiter zum Festungsturm aus - und hoeher geht es nicht', () => {
    const { game, vk } = mitTurm();
    const res = applyAction(game, { t: 'upgradeTower', vertex: vk }, 'p0');
    expect(res.ok).toBe(true);
    expect(game.state.tuerme[vk]).toEqual({ owner: 'p0', stufe: 2 });
    expect(RESOURCES.every((r) => game.state.players[0]!.hand[r] === 0)).toBe(true);
    if (res.ok) expect(res.events).toContainEqual({ t: 'towerUpgrade', player: 'p0', at: vk, stufe: 2 });

    for (const r of RESOURCES) game.state.players[0]!.hand[r] += COST_BEFESTIGTER_TURM[r] ?? 0;
    const weiter = applyAction(game, { t: 'upgradeTower', vertex: vk }, 'p0');
    expect(weiter.ok).toBe(true);
    expect(game.state.tuerme[vk]).toEqual({ owner: 'p0', stufe: MAX_TURM_STUFE });
    if (weiter.ok) expect(weiter.events).toContainEqual({ t: 'towerUpgrade', player: 'p0', at: vk, stufe: 3 });

    for (const r of RESOURCES) game.state.players[0]!.hand[r] += COST_BEFESTIGTER_TURM[r] ?? 0;
    const nochmal = applyAction(game, { t: 'upgradeTower', vertex: vk }, 'p0');
    expect(nochmal.ok).toBe(false);
    if (!nochmal.ok) expect(nochmal.error).toContain('Festungsturm');
  });

  it('nicht der fremde Turm und nicht ausser der Bauphase', () => {
    const { game, vk } = mitTurm();
    expect(applyAction(game, { t: 'upgradeTower', vertex: vk }, 'p1').ok).toBe(false);
    game.state.phase = { t: 'roll' };
    expect(applyAction(game, { t: 'upgradeTower', vertex: vk }, 'p0').ok).toBe(false);
  });

  it('schiesst auf Feinde in Reichweite - der Grenzposten noch nicht', () => {
    const { game, vk } = mitTurm();
    // Ein Raeuber auf einem Nachbarfeld des Turms.
    const feld = vertexAdjacentHexes(parseVertexKey(vk))[0]!;
    game.state.units.push({ ...einheitVorlage('raeuber', feld.q, feld.r, { fraktion: 'f:9:9' }), id: 7 });

    const ohne: ArmyEvent[] = [];
    beschuss(game.state, new Rng(1), ohne);
    expect(ohne.some((e) => e.t === 'volley')).toBe(false);

    expect(applyAction(game, { t: 'upgradeTower', vertex: vk }, 'p0').ok).toBe(true);
    const mit: ArmyEvent[] = [];
    beschuss(game.state, new Rng(1), mit);
    const salve = mit.find((e) => e.t === 'volley');
    expect(salve).toMatchObject({ player: 'p0', zq: feld.q, zr: feld.r, schuesse: 1 });
  });

  it('der befestigte Turm (Stufe 3) schiesst weiter als der Geschuetzturm', () => {
    const { game, vk } = mitTurm();
    expect(applyAction(game, { t: 'upgradeTower', vertex: vk }, 'p0').ok).toBe(true); // -> Stufe 2
    for (const r of RESOURCES) game.state.players[0]!.hand[r] += COST_BEFESTIGTER_TURM[r] ?? 0;
    expect(applyAction(game, { t: 'upgradeTower', vertex: vk }, 'p0').ok).toBe(true); // -> Stufe 3

    // Ein Raeuber genau ausserhalb der Reichweite eines Geschuetzturms (2),
    // aber innerhalb der eines befestigten Turms (3).
    const von = vertexAdjacentHexes(parseVertexKey(vk))[0]!;
    const feld = hexesInRange(von, 3).find((h) => hexesInRange(von, 2).every((n) => n.q !== h.q || n.r !== h.r))!;
    game.state.units.push({ ...einheitVorlage('raeuber', feld.q, feld.r, { fraktion: 'f:9:9' }), id: 7 });

    const events: ArmyEvent[] = [];
    beschuss(game.state, new Rng(1), events);
    const salve = events.find((e) => e.t === 'volley');
    expect(salve).toMatchObject({ player: 'p0', zq: feld.q, zr: feld.r });
  });
});

describe('Alte Staende', () => {
  it('der Turm am Haus zieht auf seine Ecke um', () => {
    const game = spiel();
    const h = landFeld(game);
    const vk = vertexKey(hexVertices(h.q, h.r)[0]!);
    game.state.buildings[vk] = { owner: 'p0', type: 'city', turm: true };
    // Ein Stand von frueher kennt das Feld noch gar nicht.
    delete (game.state as Partial<GameState>).tuerme;

    migriereStand(game.state);
    expect(game.state.tuerme[vk]).toEqual({ owner: 'p0', stufe: 1 });
    expect(game.state.buildings[vk]!.turm).toBeUndefined();
    // Zweimal migrieren aendert nichts mehr.
    migriereStand(game.state);
    expect(Object.keys(game.state.tuerme)).toEqual([vk]);
  });

  it('fuellt auch das fehlende Heldenfeld', () => {
    const game = spiel();
    delete (game.state.players[0] as { held?: unknown }).held;
    migriereStand(game.state);
    expect(game.state.players[0]!.held).toBe(null);
  });

  it('reicht dem laengst benannten Helden seine Gestalt nach', () => {
    const game = spiel();
    const lore = benenneHeld(game.state, game.state.players[0]!);
    // Ein Held von vor den zehn Gestalten.
    delete (lore as { gestalt?: number }).gestalt;
    migriereStand(game.state);
    const jetzt = game.state.players[0]!.held!;
    expect(jetzt.gestalt).toBeGreaterThanOrEqual(0);
    expect(jetzt.gestalt).toBeLessThan(GESTALTEN);
    // Der Name bleibt derselbe - nur das Gesicht kam dazu.
    expect(jetzt.vorname).toBe(lore.vorname);
    // Zweimal migrieren wuerfelt nicht neu.
    const gestalt = jetzt.gestalt;
    migriereStand(game.state);
    expect(game.state.players[0]!.held!.gestalt).toBe(gestalt);
  });
});

/** "q:r:d" zurueck in eine Ecke - die Tests brauchen nur die Nachbarn davon. */
function parseVk(vk: string) {
  const [q, r, d] = vk.split(':');
  return { q: Number(q), r: Number(r), d: d as 'N' | 'S' };
}
