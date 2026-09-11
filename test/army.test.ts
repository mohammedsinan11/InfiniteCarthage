/**
 * Das Heer im Spielverlauf: Anwerben, Befehle, Ziehen, Raubzuege und Heimkehr,
 * Fraktionen und Kaempfe, Lager, Fehden, Wanderer, Beute und Ruinen.
 *
 * Kaempfe werden gewuerfelt. Die Tests pruefen deshalb nicht, WER gewinnt,
 * sondern dass die Folgen zum Ausgang passen.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import {
  FEHDE_REICHWEITE,
  FEHDE_TRUPP,
  WANDERER_DAUER,
  maxAufbrueche,
  maxWanderer,
  sendFeud,
  sendRaiders,
  sendWanderer,
  tickArmy,
} from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { nestAt } from '../src/core/raiders';
import { ruinAt } from '../src/core/ruins';
import { hexDistance, hexKey, hexesInRange, neighbors, vertexKey } from '../src/core/coords';
import {
  WERTE,
  einheitVorlage,
  garrisonOf,
  isLandAt,
  isNestActive,
  nestFraktionOf,
  nextStep,
  settlementApproaches,
} from '../src/core/units';
import { NEUTRAL, kampfFelder, seiteVon } from '../src/core/combat';
import { redactEventsFor, redactStateFor } from '../src/core/redact';
import { terrainAt } from '../src/core/worldgen';
import { Rng } from '../src/core/rng';
import { emptyHand, handSize } from '../src/core/state';
import type { UnitState } from '../src/core/state';
import { RESOURCES } from '../src/core/types';
import { ROUNDS_PER_BIG_ROUND } from '../src/core/season';

const ORIGIN = { q: 0, r: 0 };
const solo = (geheim = 4711): Game => createGame([{ id: 'p0', name: 'Solo' }], 2024, geheim, 15);

/** Zwei ausgedachte Fraktionen weit draussen - sie haben hier kein Lager. */
const FREMD = 'f:99:99';
const ANDERE = 'f:98:99';

type Felder = Parameters<typeof einheitVorlage>[3];
type Kampf = Extract<ArmyEvent, { t: 'fight' }>;

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

const ritter = (q: number, r: number, owner = 'p0') => einheitVorlage('ritter', q, r, { owner });
const raeuber = (q: number, r: number, felder: Felder = {}) =>
  einheitVorlage('raeuber', q, r, { fraktion: FREMD, heimat: 'test', ...felder });

const tick = (game: Game): ArmyEvent[] => {
  const events: ArmyEvent[] = [];
  tickArmy(game.state, game.world, events);
  return events;
};
const kaempfe = (events: ArmyEvent[]): Kampf[] =>
  events.filter((e): e is Kampf => e.t === 'fight');

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

/** Die Felder an den Siedlungen, als Koordinaten. */
function siedlungsFelder(game: Game) {
  return [...settlementApproaches(game.state).keys()].map((k) => {
    const [q, r] = k.split(':').map(Number);
    return { q: q!, r: r! };
  });
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
    expect(neu.leben).toBe(WERTE.ritter.leben);
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

  it('erholen sich an eigenen Siedlungen', () => {
    const game = solo();
    siedlung(game, landFlaeche(game, 3));
    const [an] = siedlungsFelder(game);
    const u = einheit(game, { ...ritter(an!.q, an!.r), leben: 1 });
    tick(game);
    expect(u.leben).toBe(2);
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
      tick(game);
      expect(hexDistance(game.state.units.find((x) => x.id === u.id)!, ziel)).toBe(noch);
    }
    expect(game.state.units.find((x) => x.id === u.id)!.ziel).toBeNull();
  });

  it('wer weit hinauszieht, deckt die Karte auf', () => {
    const game = solo();
    const draussen = landFlaeche(game, 2, { q: 24, r: -6 }, 8);
    einheit(game, { ...ritter(draussen.q, draussen.r), ziel: { q: draussen.q + 2, r: draussen.r } });
    const vorher = game.state.chunks.length;
    const events = tick(game);
    expect(game.state.chunks.length).toBeGreaterThan(vorher);
    expect(events.some((e) => e.t === 'chunks')).toBe(true);
  });

  it('wer im Kampf steckt, zieht nicht weiter', () => {
    const game = solo();
    const mitte = landFlaeche(game, 3);
    const u = einheit(game, { ...ritter(mitte.q, mitte.r), ziel: { q: mitte.q + 3, r: mitte.r } });
    einheit(game, raeuber(mitte.q, mitte.r, { leben: 50 }));
    tick(game);
    expect(u.q).toBe(mitte.q);
    expect(u.r).toBe(mitte.r);
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
    for (const u of game.state.units) {
      const [q, r] = u.heimat!.split(':').map(Number);
      expect(u.auftrag).toBe('raub');
      expect(u.fraktion).toBe(nestFraktionOf(game.state, q!, r!));
    }

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
    expect(game.state.units.some((u) => u.auftrag === 'raub')).toBe(true);
  });

  it('pluendern erst an der Siedlung und tragen die Beute dann heim', () => {
    const game = solo();
    const mitte = landFlaeche(game, 4);
    siedlung(game, mitte);
    const p = game.state.players[0]!;
    for (const r of RESOURCES) p.hand[r] = 1;
    const bank = { ...game.state.bank };
    const ziele = siedlungsFelder(game);
    const abstand = (h: { q: number; r: number }) => Math.min(...ziele.map((z) => hexDistance(h, z)));
    const start = hexesInRange(mitte, 4).find((h) => abstand(h) === 2)!;
    const u = einheit(game, raeuber(start.q, start.r));

    expect(tick(game).some((e) => e.t === 'plunder')).toBe(false);
    expect(tick(game).some((e) => e.t === 'plunder')).toBe(true);

    // Er steht noch - mit der Beute auf dem Heimweg. Die Bank bekommt nichts.
    expect(game.state.units).toContain(u);
    expect(u.auftrag).toBe('heimkehr');
    expect(u.traegt).toBe(1);
    expect(handSize(u.fracht!)).toBe(1);
    expect(handSize(p.hand)).toBe(4);
    expect(game.state.bank).toEqual(bank);

    // Was er traegt, sieht nur der Beraubte.
    const eigen = redactStateFor(game.state, 'p0').units.find((x) => x.id === u.id)!;
    const fremd = redactStateFor(game.state, 'p9').units.find((x) => x.id === u.id)!;
    expect(eigen.fracht).not.toBeNull();
    expect(fremd.fracht).toBeNull();
    expect(fremd.traegt).toBe(1);
  });

  it('kehren heim, verstaerken ihr Lager, und die Beute ist fort', () => {
    const game = solo();
    const s = game.state;
    const seed = s.worldSeed;
    const nest = hexesInRange(ORIGIN, 30).find(
      (h) => nestAt(seed, h.q, h.r) && neighbors(h.q, h.r).some((n) => isLandAt(seed, n.q, n.r)),
    )!;
    const key = hexKey(nest.q, nest.r);
    s.nestGarrison[key] = 1;
    const nachbar = neighbors(nest.q, nest.r).find(
      (n) => isLandAt(seed, n.q, n.r) && !nestAt(seed, n.q, n.r),
    )!;
    const fraktion = nestFraktionOf(s, nest.q, nest.r);
    const u = einheit(
      game,
      raeuber(nachbar.q, nachbar.r, {
        fraktion,
        heimat: key,
        auftrag: 'heimkehr',
        fracht: { ...emptyHand(), ore: 2 },
        traegt: 2,
        beraubt: 'p0',
      }),
    );
    const erz = s.bank.ore;
    const events = tick(game);
    expect(events.find((e) => e.t === 'homecoming')).toMatchObject({ count: 2, fraktion });
    expect(s.units).not.toContain(u);
    expect(garrisonOf(s, nest.q, nest.r)).toBe(2);
    expect(s.bank.ore).toBe(erz + 2);
  });

  it('zerstreuen sich, wenn ihre Fraktion kein Lager mehr hat', () => {
    const game = solo();
    const land = landFlaeche(game, 2);
    const u = einheit(
      game,
      raeuber(land.q, land.r, { auftrag: 'heimkehr', fracht: { ...emptyHand(), wool: 1 }, traegt: 1 }),
    );
    const wolle = game.state.bank.wool;
    tick(game);
    expect(game.state.units).not.toContain(u);
    expect(game.state.bank.wool).toBe(wolle + 1);
  });
});

describe('Kaempfe', () => {
  it('Feinde auf einem Feld kaempfen Runde um Runde, bis eine Seite steht', () => {
    const game = solo();
    const land = landFlaeche(game, 2);
    const k = hexKey(land.q, land.r);
    einheit(game, raeuber(land.q, land.r, { auftrag: 'heimkehr' }));
    einheit(game, einheitVorlage('goblin', land.q, land.r, { fraktion: ANDERE, auftrag: 'heimkehr' }));
    expect(kampfFelder(game.state).get(k)).toEqual([ANDERE, FREMD]);

    let ende: Kampf | undefined;
    for (let runde = 0; runde < 60 && !ende; runde++) {
      const hier = kaempfe(tick(game));
      expect(hier).toHaveLength(1);
      // Neu ist ein Kampf, der in der Runde selbst entsteht - durch Ziehen oder
      // Angriff. Hier stehen beide schon vorher da; danach ist er es erst recht nicht.
      expect(hier[0]!.neu).toBe(false);
      if (hier[0]!.ende) ende = hier[0];
    }
    expect(ende).toBeDefined();
    const stehen = game.state.units.filter((u) => u.q === land.q && u.r === land.r);
    expect(new Set(stehen.map(seiteVon)).size).toBeLessThanOrEqual(1);
    if (ende!.sieger !== null) expect(stehen.every((u) => seiteVon(u) === ende!.sieger)).toBe(true);
    expect(kampfFelder(game.state).has(k)).toBe(false);
  });

  it('dieselbe Fraktion und Wanderer kaempfen nicht', () => {
    const game = solo();
    const land = landFlaeche(game, 2);
    einheit(game, raeuber(land.q, land.r));
    einheit(game, raeuber(land.q, land.r));
    const wanderer = einheit(game, einheitVorlage('wanderer', land.q, land.r, { dauer: 5 }));
    expect(seiteVon(wanderer)).toBe(NEUTRAL);
    expect(kampfFelder(game.state).size).toBe(0);
    expect(kaempfe(tick(game))).toHaveLength(0);
  });

  it('ein Ritter an der Siedlung stellt den Raeuber, bevor er pluendert', () => {
    const game = solo();
    const mitte = landFlaeche(game, 4);
    siedlung(game, mitte);
    const ziele = [...settlementApproaches(game.state).keys()];
    const [kq, kr] = ziele[0]!.split(':').map(Number);
    einheit(game, ritter(kq!, kr!));
    const start = neighbors(kq!, kr!).find((h) => !ziele.includes(hexKey(h.q, h.r)))!;
    einheit(game, raeuber(start.q, start.r));

    const events = tick(game);
    const kampf = kaempfe(events)[0];
    expect(kampf).toBeDefined();
    expect(kampf!.seiten).toEqual([FREMD, 'p:p0']);
    expect(events.some((e) => e.t === 'plunder')).toBe(false);
  });

  it('wer einen Raeuber schlaegt, holt sich die Beute zurueck', () => {
    let geholt = false;
    for (let versuch = 0; versuch < 20 && !geholt; versuch++) {
      const game = solo(4711 + versuch);
      const land = landFlaeche(game, 2);
      const p = game.state.players[0]!;
      for (const r of RESOURCES) p.hand[r] = 0;
      einheit(game, ritter(land.q, land.r));
      const dieb = einheit(
        game,
        raeuber(land.q, land.r, {
          auftrag: 'heimkehr',
          fracht: { ...emptyHand(), wool: 3 },
          traegt: 3,
          beraubt: 'p0',
        }),
      );
      const wolle = () =>
        game.state.bank.wool +
        p.hand.wool +
        game.state.units.reduce((n, u) => n + (u.fracht?.wool ?? 0), 0) +
        (game.state.units.includes(dieb) ? 0 : (dieb.fracht?.wool ?? 0));
      const vorher = wolle();
      for (let runde = 0; runde < 40; runde++) {
        const events = tick(game);
        expect(wolle()).toBe(vorher);
        const zurueck = events.find((e) => e.t === 'lootRecovered');
        if (zurueck) {
          expect(p.hand.wool).toBe(3);
          geholt = true;
          break;
        }
        if (kampfFelder(game.state).size === 0) break;
      }
    }
    expect(geholt).toBe(true);
  });

  it('zurueckeroberte Beute bleibt fuer Fremde verborgen', () => {
    const taken = { ...emptyHand(), wool: 3 };
    const e = { t: 'lootRecovered' as const, player: 'p0', q: 0, r: 0, taken, count: 3 };
    const [fremd] = redactEventsFor([e], 'p1');
    const [eigen] = redactEventsFor([e], 'p0');
    expect(fremd).toMatchObject({ taken: emptyHand(), count: 3 });
    expect(eigen).toMatchObject({ taken });
  });
});

describe('Lager', () => {
  it('Ritter zerstoeren ein Lager und bringen Beute', () => {
    const game = solo();
    const seed = game.state.worldSeed;
    const nest = hexesInRange(ORIGIN, 30).find((h) => nestAt(seed, h.q, h.r))!;
    let zerstoert = false;
    for (let runde = 0; runde < 300 && !zerstoert; runde++) {
      if (!game.state.units.some((u) => u.kind === 'ritter')) einheit(game, ritter(nest.q, nest.r));
      const events = tick(game);
      zerstoert = events.some((e) => e.t === 'nestDestroyed');
    }
    expect(zerstoert).toBe(true);
    expect(game.state.destroyedNests).toContain(hexKey(nest.q, nest.r));
    expect(game.state.players[0]!.loot).toBe(1);
  });

  it('eine fremde Fraktion erobert ein Lager und wird seine Besatzung', () => {
    const seed = 2024;
    const nester = hexesInRange(ORIGIN, 30).filter((h) => nestAt(seed, h.q, h.r));
    let erobert = false;
    for (const nest of nester.slice(0, 5)) {
      const game = solo();
      const s = game.state;
      for (let runde = 0; runde < 200 && !erobert && isNestActive(s, nest.q, nest.r); runde++) {
        if (!s.units.some((u) => u.fraktion === FREMD)) {
          for (let i = 0; i < 3; i++) {
            einheit(game, raeuber(nest.q, nest.r, { auftrag: 'fehde', ziel: { q: nest.q, r: nest.r } }));
          }
        }
        erobert = tick(game).some((e) => e.t === 'nestCaptured');
      }
      if (erobert) {
        expect(nestFraktionOf(s, nest.q, nest.r)).toBe(FREMD);
        expect(garrisonOf(s, nest.q, nest.r)).toBeGreaterThanOrEqual(1);
        expect(s.units.some((u) => u.fraktion === FREMD)).toBe(false);
        expect(redactStateFor(s, 'p0').nestFraktion[hexKey(nest.q, nest.r)]).toBe(FREMD);
        break;
      }
    }
    expect(erobert).toBe(true);
  });

  it('ein zerstoertes Lager schickt keine Raubzuege mehr', () => {
    const game = solo();
    const { key } = lagerMitSiedlung(game);
    game.state.destroyedNests.push(key);
    sendRaiders(game.state, []);
    expect(game.state.units.some((u) => u.heimat === key)).toBe(false);
  });
});

describe('Fehden', () => {
  /** Zwei Lager verschiedener Fraktionen nah beieinander, eine Siedlung dabei. */
  function feindlicheNachbarn(game: Game) {
    const s = game.state;
    const seed = s.worldSeed;
    const nester = hexesInRange(ORIGIN, 40).filter((h) => nestAt(seed, h.q, h.r));
    for (const a of nester) {
      for (const b of nester) {
        if (hexDistance(a, b) > FEHDE_REICHWEITE) continue;
        if (nestFraktionOf(s, a.q, a.r) === nestFraktionOf(s, b.q, b.r)) continue;
        if (!nextStep(seed, a, new Set([hexKey(b.q, b.r)]), 900)) continue;
        const nah = hexesInRange(a, 4).find(
          (h) => hexDistance(h, a) === 4 && isLandAt(seed, h.q, h.r) && !nestAt(seed, h.q, h.r),
        );
        if (!nah) continue;
        siedlung(game, nah);
        return;
      }
    }
    throw new Error('keine feindlichen Nachbarlager gefunden');
  }

  it('schicken einen Trupp gegen ein feindliches Lager - hoechstens eine zugleich', () => {
    let gesehen = false;
    for (let i = 1; i <= 30 && !gesehen; i++) {
      const game = solo();
      feindlicheNachbarn(game);
      const s = game.state;
      const events: ArmyEvent[] = [];
      sendFeud(s, new Rng(i), events);
      const fehde = events.find((e) => e.t === 'feud');
      if (!fehde || fehde.t !== 'feud') continue;
      gesehen = true;
      const trupp = s.units.filter((u) => u.auftrag === 'fehde');
      expect(trupp).toHaveLength(FEHDE_TRUPP);
      for (const u of trupp) {
        expect(u.fraktion).toBe(fehde.fraktion);
        expect(u.ziel).toEqual({ q: fehde.zq, r: fehde.zr });
        expect(nestFraktionOf(s, fehde.zq, fehde.zr)).not.toBe(u.fraktion);
      }
      for (let j = 0; j < 10; j++) sendFeud(s, new Rng(100 + j), []);
      expect(s.units.filter((u) => u.auftrag === 'fehde')).toHaveLength(FEHDE_TRUPP);
    }
    expect(gesehen).toBe(true);
  });
});

describe('Wanderer', () => {
  it('tauchen nahe den Siedlungen auf, neutral und hoechstens einer je Spieler', () => {
    let gesehen = false;
    for (let i = 1; i <= 30 && !gesehen; i++) {
      const game = solo();
      siedlung(game, landFlaeche(game, 2));
      const events: ArmyEvent[] = [];
      sendWanderer(game.state, new Rng(i), events);
      if (!events.some((e) => e.t === 'wanderer')) continue;
      gesehen = true;
      const [w] = game.state.units;
      expect(w!.kind).toBe('wanderer');
      expect(w!.dauer).toBe(WANDERER_DAUER);
      expect(seiteVon(w!)).toBe(NEUTRAL);
      for (let j = 0; j < 10; j++) sendWanderer(game.state, new Rng(100 + j), []);
      expect(game.state.units.filter((u) => u.kind === 'wanderer').length).toBeLessThanOrEqual(maxWanderer(1));
    }
    expect(gesehen).toBe(true);
  });

  it('werden nicht angegriffen und ziehen nach ihrer Zeit weiter', () => {
    const game = solo();
    const land = landFlaeche(game, 3);
    const wache = einheit(game, ritter(land.q, land.r));
    const nachbar = neighbors(land.q, land.r)[0]!;
    const w = einheit(game, einheitVorlage('wanderer', nachbar.q, nachbar.r, { dauer: 2 }));
    expect(kaempfe(tick(game))).toHaveLength(0);
    expect(wache.q).toBe(land.q);
    tick(game);
    tick(game);
    expect(game.state.units).not.toContain(w);
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
    expect(tick(game).filter((e) => e.t === 'ruin')).toHaveLength(1);
    expect(game.state.exploredRuins).toContain(hexKey(ruine.q, ruine.r));

    einheit(game, ritter(ruine.q, ruine.r));
    expect(tick(game).some((e) => e.t === 'ruin')).toBe(false);
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
