/**
 * Das Heer im Spielverlauf: Anwerben, Befehle, Ziehen, Raubzuege, Gefechte,
 * Pluenderungen, Belagerungen, Beute und Ruinen.
 *
 * Gefechte werden gewuerfelt. Die Tests pruefen deshalb nicht, WER gewinnt,
 * sondern dass die Folgen zum Ausgang passen.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { maxAufbrueche, sendRaiders, tickArmy } from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { nestAt } from '../src/core/raiders';
import { ruinAt } from '../src/core/ruins';
import { hexDistance, hexKey, hexesInRange, neighbors, vertexKey } from '../src/core/coords';
import { isLandAt, nextStep, settlementApproaches } from '../src/core/units';
import { redactStateFor } from '../src/core/redact';
import { terrainAt } from '../src/core/worldgen';
import { handSize } from '../src/core/state';
import type { UnitState } from '../src/core/state';
import { RESOURCES } from '../src/core/types';
import { ROUNDS_PER_BIG_ROUND } from '../src/core/season';

const ORIGIN = { q: 0, r: 0 };
const solo = (): Game => createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15);

function must(game: Game, action: Parameters<typeof applyAction>[1]) {
  const res = applyAction(game, action, 'p0');
  if (!res.ok) throw new Error(res.error);
  return res.events;
}

/** Ein Feld, um das im Radius alles Land ist - ohne Lager und Ruinen. */
function landFlaeche(game: Game, radius: number, ab = ORIGIN, suche = 20) {
  const seed = game.state.worldSeed;
  const h = hexesInRange(ab, suche).find((c) =>
    hexesInRange(c, radius).every(
      (x) => isLandAt(seed, x.q, x.r) && !nestAt(seed, x.q, x.r) && !ruinAt(seed, x.q, x.r),
    ),
  );
  if (!h) throw new Error(`keine freie Landflaeche mit Radius ${radius}`);
  return h;
}

function siedlung(game: Game, h: { q: number; r: number }) {
  game.state.buildings[vertexKey({ q: h.q, r: h.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
}

function einheit(game: Game, u: Omit<UnitState, 'id'>): UnitState {
  const neu = { ...u, id: game.state.nextUnitId++ };
  game.state.units.push(neu);
  return neu;
}

const ritter = (q: number, r: number, owner = 'p0'): Omit<UnitState, 'id'> => ({
  kind: 'ritter',
  owner,
  q,
  r,
  ziel: null,
  heimat: null,
});

const bauphase = (game: Game) => {
  game.state.phase = { t: 'main' };
};

/** Ein Lager und eine Siedlung in Reichweite, mit Landweg dazwischen. */
function lagerMitSiedlung(game: Game) {
  const seed = game.state.worldSeed;
  for (const nest of hexesInRange(ORIGIN, 30)) {
    if (!nestAt(seed, nest.q, nest.r)) continue;
    const nah = hexesInRange(nest, 4).find(
      (h) =>
        hexDistance(h, nest) === 4 &&
        isLandAt(seed, h.q, h.r) &&
        !nestAt(seed, h.q, h.r) &&
        nextStep(seed, nest, new Set([hexKey(h.q, h.r)]), 900) !== null,
    );
    if (nah) {
      siedlung(game, nah);
      return { nest, key: hexKey(nest.q, nest.r) };
    }
  }
  throw new Error('kein Lager mit erreichbarer Siedlung gefunden');
}

describe('Ritter', () => {
  it('werden fuer 2 Erz und 1 Getreide an einer eigenen Siedlung angeworben', () => {
    const game = solo();
    siedlung(game, landFlaeche(game, 1, ORIGIN, 7));
    bauphase(game);
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 0;
    p.hand.ore = 2;
    p.hand.grain = 1;
    const events = must(game, { t: 'recruitKnight' });
    const s = game.state;
    expect(handSize(s.players[0]!.hand)).toBe(0);
    expect(s.units).toHaveLength(1);
    const neu = s.units[0]!;
    expect(neu.kind).toBe('ritter');
    expect(neu.owner).toBe('p0');
    expect(settlementApproaches(s, 'p0').has(hexKey(neu.q, neu.r))).toBe(true);
    expect(events.some((e) => e.t === 'knightReady')).toBe(true);
  });

  it('gibt es nicht ohne Rohstoffe', () => {
    const game = solo();
    siedlung(game, landFlaeche(game, 1, ORIGIN, 7));
    bauphase(game);
    for (const r of RESOURCES) game.state.players[0]!.hand[r] = 0;
    expect(applyAction(game, { t: 'recruitKnight' }, 'p0').ok).toBe(false);
  });

  it('treten auch durch eine Ritterkarte an', () => {
    const game = solo();
    siedlung(game, landFlaeche(game, 1, ORIGIN, 7));
    bauphase(game);
    game.state.turn = 6;
    game.state.players[0]!.dev.push({ type: 'knight', boughtTurn: 0, played: false });
    must(game, { t: 'playKnight' });
    expect(game.state.units.filter((u) => u.kind === 'ritter')).toHaveLength(1);
    expect(game.state.players[0]!.playedKnights).toBe(1);
  });
});

describe('Befehle', () => {
  it('gehen nur an eigene Ritter und nur auf Land', () => {
    const game = solo();
    const land = landFlaeche(game, 1, ORIGIN, 7);
    bauphase(game);
    const eigen = einheit(game, ritter(land.q, land.r));
    const fremd = einheit(game, ritter(land.q, land.r, 'p9'));
    const nachbar = neighbors(land.q, land.r)[0]!;
    expect(applyAction(game, { t: 'orderUnit', unit: fremd.id, q: nachbar.q, r: nachbar.r }, 'p0').ok).toBe(false);
    const wasser = hexesInRange(ORIGIN, 9).find(
      (h) => game.world.tiles.get(hexKey(h.q, h.r))?.terrain === 'water',
    );
    if (wasser) {
      expect(applyAction(game, { t: 'orderUnit', unit: eigen.id, q: wasser.q, r: wasser.r }, 'p0').ok).toBe(false);
    }
    must(game, { t: 'orderUnit', unit: eigen.id, q: nachbar.q, r: nachbar.r });
    expect(game.state.units.find((u) => u.id === eigen.id)!.ziel).toEqual(nachbar);
  });

  it('das eigene Feld als Ziel haelt den Ritter an', () => {
    const game = solo();
    const land = landFlaeche(game, 1, ORIGIN, 7);
    bauphase(game);
    const eigen = einheit(game, { ...ritter(land.q, land.r), ziel: { q: land.q + 1, r: land.r } });
    must(game, { t: 'orderUnit', unit: eigen.id, q: land.q, r: land.r });
    expect(game.state.units.find((u) => u.id === eigen.id)!.ziel).toBeNull();
  });
});

describe('Ziehen', () => {
  it('ein Ritter zieht je Runde ein Feld und haelt am Ziel', () => {
    const game = solo();
    const mitte = landFlaeche(game, 3);
    const ziel = { q: mitte.q + 3, r: mitte.r };
    const u = einheit(game, { ...ritter(mitte.q, mitte.r), ziel });
    for (let noch = 2; noch >= 0; noch--) {
      tickArmy(game.state, game.world, []);
      expect(hexDistance(game.state.units.find((x) => x.id === u.id)!, ziel)).toBe(noch);
    }
    expect(game.state.units.find((x) => x.id === u.id)!.ziel).toBeNull();
  });

  it('wer weit hinauszieht, deckt die Karte auf', () => {
    const game = solo();
    const draussen = landFlaeche(game, 2, { q: 24, r: -6 }, 8);
    einheit(game, { ...ritter(draussen.q, draussen.r), ziel: { q: draussen.q + 2, r: draussen.r } });
    const vorher = game.state.chunks.length;
    const events: ArmyEvent[] = [];
    tickArmy(game.state, game.world, events);
    expect(game.state.chunks.length).toBeGreaterThan(vorher);
    expect(events.some((e) => e.t === 'chunks')).toBe(true);
  });
});

describe('Raubzuege', () => {
  it('brechen aus nahen Lagern auf - hoechstens einer je Lager und nicht zu viele auf einmal', () => {
    const game = solo();
    lagerMitSiedlung(game);
    const events: ArmyEvent[] = [];
    sendRaiders(game.state, events);
    const erste = game.state.units.length;
    expect(erste).toBeGreaterThan(0);
    expect(erste).toBeLessThanOrEqual(maxAufbrueche(1));
    expect(events.some((e) => e.t === 'march')).toBe(true);

    // Eine zweite Runde darf weitere Lager schicken, aber keines doppelt.
    sendRaiders(game.state, []);
    const heimaten = game.state.units.map((u) => u.heimat);
    expect(new Set(heimaten).size).toBe(heimaten.length);
    expect(game.state.units.length - erste).toBeLessThanOrEqual(maxAufbrueche(1));
  });

  it('brechen im Takt der grossen Runde auf', () => {
    const game = solo();
    lagerMitSiedlung(game);
    game.state.turn = ROUNDS_PER_BIG_ROUND;
    bauphase(game);
    const events = must(game, { t: 'endTurn' });
    expect(events.some((e) => e.t === 'march')).toBe(true);
    expect(game.state.units.some((u) => u.kind !== 'ritter')).toBe(true);
  });

  it('ziehen je Runde ein Feld und pluendern erst an der Siedlung', () => {
    const game = solo();
    const mitte = landFlaeche(game, 4);
    siedlung(game, mitte);
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 1;
    const ziele = [...settlementApproaches(game.state).keys()].map((k) => {
      const [q, r] = k.split(':').map(Number);
      return { q: q!, r: r! };
    });
    const abstand = (h: { q: number; r: number }) => Math.min(...ziele.map((z) => hexDistance(h, z)));
    const start = hexesInRange(mitte, 4).find((h) => abstand(h) === 2)!;
    const u = einheit(game, { kind: 'raeuber', owner: null, q: start.q, r: start.r, ziel: null, heimat: 'test' });

    const e1: ArmyEvent[] = [];
    tickArmy(game.state, game.world, e1);
    expect(e1.some((e) => e.t === 'plunder')).toBe(false);
    expect(game.state.units.some((x) => x.id === u.id)).toBe(true);

    const e2: ArmyEvent[] = [];
    tickArmy(game.state, game.world, e2);
    expect(e2.some((e) => e.t === 'plunder')).toBe(true);
    expect(game.state.units.some((x) => x.id === u.id)).toBe(false);
    expect(handSize(game.state.players[0]!.hand)).toBe(4);
  });
});

describe('Gefechte', () => {
  it('ein Ritter an der Siedlung stellt den Raeuber', () => {
    const game = solo();
    const mitte = landFlaeche(game, 4);
    siedlung(game, mitte);
    const ziele = [...settlementApproaches(game.state).keys()];
    const [kq, kr] = ziele[0]!.split(':').map(Number);
    const wache = einheit(game, ritter(kq!, kr!));
    const start = neighbors(kq!, kr!).find((h) => !ziele.includes(hexKey(h.q, h.r)))!;
    const feind = einheit(game, { kind: 'raeuber', owner: null, q: start.q, r: start.r, ziel: null, heimat: 'test' });

    const events: ArmyEvent[] = [];
    tickArmy(game.state, game.world, events);
    const kampf = events.find((e) => e.t === 'fight');
    if (!kampf || kampf.t !== 'fight') throw new Error('kein Gefecht');
    const ritterLebt = game.state.units.some((u) => u.id === wache.id);
    const feindLebt = game.state.units.some((u) => u.id === feind.id);
    if (kampf.knightWon) {
      expect(ritterLebt).toBe(true);
      expect(feindLebt).toBe(false);
      expect(events.some((e) => e.t === 'plunder')).toBe(false);
    } else {
      expect(ritterLebt).toBe(false);
    }
  });
});

describe('Belagerung', () => {
  it('zerstoert das Lager und bringt Beute', () => {
    const game = solo();
    const seed = game.state.worldSeed;
    const nest = hexesInRange(ORIGIN, 30).find((h) => nestAt(seed, h.q, h.r))!;
    let zerstoert = false;
    for (let runde = 0; runde < 300 && !zerstoert; runde++) {
      if (!game.state.units.some((u) => u.kind === 'ritter')) einheit(game, ritter(nest.q, nest.r));
      const events: ArmyEvent[] = [];
      tickArmy(game.state, game.world, events);
      zerstoert = events.some((e) => e.t === 'nestDestroyed');
    }
    expect(zerstoert).toBe(true);
    expect(game.state.destroyedNests).toContain(hexKey(nest.q, nest.r));
    expect(game.state.players[0]!.loot).toBe(1);
  });

  it('ein zerstoertes Lager schickt keine Raubzuege mehr', () => {
    const game = solo();
    const { key } = lagerMitSiedlung(game);
    game.state.destroyedNests.push(key);
    sendRaiders(game.state, []);
    expect(game.state.units.some((u) => u.heimat === key)).toBe(false);
  });
});

describe('Beute', () => {
  it('oeffnet eine Kartenwahl', () => {
    const game = solo();
    bauphase(game);
    game.state.players[0]!.loot = 2;
    const events = must(game, { t: 'claimLoot' });
    expect(game.state.draft?.source).toBe('belohnung');
    expect(game.state.players[0]!.loot).toBe(1);
    expect(events.some((e) => e.t === 'draftOffered')).toBe(true);
  });

  it('gibt es nicht ohne Beute', () => {
    const game = solo();
    bauphase(game);
    expect(applyAction(game, { t: 'claimLoot' }, 'p0').ok).toBe(false);
  });
});

describe('Ruinen', () => {
  it('liegen fest, an Land, nicht am Ursprung und nie auf Lagern', () => {
    let gefunden = 0;
    for (const seed of [2024, 7, 31337]) {
      for (const h of hexesInRange(ORIGIN, 30)) {
        if (!ruinAt(seed, h.q, h.r)) continue;
        gefunden++;
        expect(terrainAt(seed, h.q, h.r)).not.toBe('water');
        expect(nestAt(seed, h.q, h.r)).toBe(false);
        expect(hexDistance(h, ORIGIN)).toBeGreaterThan(2);
      }
    }
    expect(gefunden).toBeGreaterThan(0);
  });

  it('werden genau einmal erkundet', () => {
    const game = solo();
    const seed = game.state.worldSeed;
    const ruine = hexesInRange(ORIGIN, 30).find((h) => ruinAt(seed, h.q, h.r))!;
    einheit(game, ritter(ruine.q, ruine.r));
    const e1: ArmyEvent[] = [];
    tickArmy(game.state, game.world, e1);
    expect(e1.filter((e) => e.t === 'ruin')).toHaveLength(1);
    expect(game.state.exploredRuins).toContain(hexKey(ruine.q, ruine.r));

    einheit(game, ritter(ruine.q, ruine.r));
    const e2: ArmyEvent[] = [];
    tickArmy(game.state, game.world, e2);
    expect(e2.some((e) => e.t === 'ruin')).toBe(false);
  });
});

describe('Das Heer im Spielstand', () => {
  it('ueberlebt JSON und ist fuer alle sichtbar', () => {
    const game = solo();
    const land = landFlaeche(game, 1, ORIGIN, 7);
    einheit(game, ritter(land.q, land.r));
    const wieder = JSON.parse(JSON.stringify(game.state));
    expect(wieder.units).toEqual(game.state.units);
    expect(redactStateFor(game.state, 'jemand-anders').units).toHaveLength(1);
  });
});
