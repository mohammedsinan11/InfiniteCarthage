import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Action, Game } from '../src/core/rules/reducer';
import {
  legalRoadEdges,
  legalSettlementVertices,
} from '../src/core/rules/placement';
import { currentPlayerId, playerById } from '../src/core/state';
import type { Hand, PlayerId } from '../src/core/state';
import { redactStateFor } from '../src/core/redact';
import { bundleSize, hasBundle } from '../src/core/rules/trade';
import { RESOURCES } from '../src/core/types';
import type { Resource } from '../src/core/types';

function newGame(n = 3): Game {
  return createGame(
    Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'S' + i })),
    2024,
    99,
  );
}

function must(game: Game, action: Action, actor: PlayerId) {
  const r = applyAction(game, action, actor);
  if (!r.ok) throw new Error(`${action.t} scheiterte: ${r.error}`);
  return r;
}

const phaseOf = (game: Game): string => game.state.phase.t;

function runSetup(game: Game): void {
  let guard = 0;
  while (game.state.phase.t === 'setup') {
    if (guard++ > 100) throw new Error('Aufbau endet nicht');
    const p = currentPlayerId(game.state);
    const ph = game.state.phase;
    if (ph.awaiting === 'settlement') {
      must(game, { t: 'placeSettlement', vertex: legalSettlementVertices(game.state, game.world, p, { setup: true })[0]! }, p);
    } else {
      must(game, { t: 'placeRoad', edge: legalRoadEdges(game.state, game.world, p, ph.lastVertex ?? undefined)[0]! }, p);
    }
  }
}

/** Nach dem Wurf eine eventuelle Sieben abarbeiten, bis gebaut werden darf. */
/** Nach dem Wurf eine eventuelle Sieben abarbeiten: abwerfen, dann waehlen. */
function resolveSeven(game: Game): void {
  let guard = 0;
  while (phaseOf(game) === 'draft') {
    if (guard++ > 20) throw new Error('Fund-Phase endet nicht');
    // Der Fund: die erste angebotene Karte nehmen.
    const cur = currentPlayerId(game.state);
    must(game, { t: 'chooseCard', card: game.state.draft!.options[0]! }, cur);
  }
}

/** Hand exakt setzen, damit die Tests nicht vom Wurf abhaengen. */
function setHand(game: Game, pid: PlayerId, h: Partial<Hand>): void {
  const p = playerById(game.state, pid)!;
  for (const r of RESOURCES) p.hand[r] = h[r] ?? 0;
}

/** Spiel bis zur Bauphase des ersten Spielers bringen. */
function toMain(game: Game): PlayerId {
  runSetup(game);
  const pid = currentPlayerId(game.state);
  must(game, { t: 'roll' }, pid);
  resolveSeven(game);
  expect(phaseOf(game)).toBe('main');
  return pid;
}

describe('Angebot stellen', () => {
  it('legt ein Angebot an, das alle sehen', () => {
    const game = newGame();
    const me = toMain(game);
    setHand(game, me, { lumber: 2 });

    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);

    expect(game.state.trade).toMatchObject({
      from: me,
      give: { lumber: 2 },
      want: { ore: 1 },
      accepted: [],
      declined: [],
    });
    // Auch fuer Unbeteiligte sichtbar - sonst koennte niemand antworten.
    for (const viewer of game.state.order) {
      expect(redactStateFor(game.state, viewer).trade).not.toBeNull();
    }
  });

  it('weist Angebote ohne Deckung ab', () => {
    const game = newGame();
    const me = toMain(game);
    setHand(game, me, { lumber: 1 });
    const r = applyAction(game, { t: 'offerTrade', give: { lumber: 5 }, want: { ore: 1 } }, me);
    expect(r).toEqual({ ok: false, error: 'So viele Karten hast du nicht.' });
    expect(game.state.trade).toBeNull();
  });

  it('weist leere Seiten und Ueberschneidungen ab', () => {
    const game = newGame();
    const me = toMain(game);
    setHand(game, me, { lumber: 3, ore: 3 });

    expect(applyAction(game, { t: 'offerTrade', give: {}, want: { ore: 1 } }, me)).toMatchObject({
      ok: false,
      error: expect.stringContaining('mindestens eine Karte'),
    });
    expect(applyAction(game, { t: 'offerTrade', give: { lumber: 1 }, want: {} }, me)).toMatchObject({
      ok: false,
    });
    // Holz gegen Holz ergibt keinen Zug.
    expect(
      applyAction(game, { t: 'offerTrade', give: { lumber: 1 }, want: { lumber: 2 } }, me),
    ).toEqual({ ok: false, error: 'Derselbe Rohstoff steht auf beiden Seiten.' });
    // Negative Mengen sind kein Trick, um sich Karten zu erschleichen.
    expect(
      applyAction(game, { t: 'offerTrade', give: { lumber: -3 }, want: { ore: 1 } }, me),
    ).toEqual({ ok: false, error: 'Ungueltige Mengen.' });
    expect(game.state.trade).toBeNull();
  });

  it('laesst nur ein Angebot gleichzeitig zu', () => {
    const game = newGame();
    const me = toMain(game);
    setHand(game, me, { lumber: 4 });
    must(game, { t: 'offerTrade', give: { lumber: 1 }, want: { ore: 1 } }, me);
    expect(
      applyAction(game, { t: 'offerTrade', give: { lumber: 2 }, want: { wool: 1 } }, me),
    ).toEqual({ ok: false, error: 'Es liegt schon ein Angebot.' });
  });

  it('erlaubt nur dem Spieler am Zug ein Angebot', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, other, { lumber: 3 });
    expect(
      applyAction(game, { t: 'offerTrade', give: { lumber: 1 }, want: { ore: 1 } }, other),
    ).toEqual({ ok: false, error: 'Du bist nicht am Zug.' });
  });
});

describe('Antworten', () => {
  it('nimmt Zusagen von Mitspielern an, obwohl sie nicht am Zug sind', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, me, { lumber: 2 });
    setHand(game, other, { ore: 1 });

    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    must(game, { t: 'respondTrade', accept: true }, other);

    expect(game.state.trade!.accepted).toEqual([other]);
  });

  it('verweigert die Zusage ohne die verlangten Karten', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, me, { lumber: 2 });
    setHand(game, other, {});

    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    expect(applyAction(game, { t: 'respondTrade', accept: true }, other)).toEqual({
      ok: false,
      error: 'Du hast nicht, was verlangt wird.',
    });
    // Ablehnen geht dagegen immer.
    must(game, { t: 'respondTrade', accept: false }, other);
    expect(game.state.trade!.declined).toEqual([other]);
  });

  it('laesst eine Meinungsaenderung zu, ohne doppelte Eintraege', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, me, { lumber: 2 });
    setHand(game, other, { ore: 1 });

    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    must(game, { t: 'respondTrade', accept: false }, other);
    must(game, { t: 'respondTrade', accept: true }, other);
    must(game, { t: 'respondTrade', accept: true }, other);

    expect(game.state.trade!.accepted).toEqual([other]);
    expect(game.state.trade!.declined).toEqual([]);
  });

  it('laesst den Anbieter nicht auf sein eigenes Angebot antworten', () => {
    const game = newGame();
    const me = toMain(game);
    setHand(game, me, { lumber: 2 });
    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    expect(applyAction(game, { t: 'respondTrade', accept: true }, me)).toEqual({
      ok: false,
      error: 'Das ist dein eigenes Angebot.',
    });
  });
});

describe('Abschluss', () => {
  it('schiebt Karten in beide Richtungen, ohne die Bank zu beruehren', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, me, { lumber: 3, wool: 1 });
    setHand(game, other, { ore: 2 });
    const bankBefore = { ...game.state.bank };

    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    must(game, { t: 'respondTrade', accept: true }, other);
    must(game, { t: 'settleTrade', partner: other }, me);

    const a = playerById(game.state, me)!;
    const b = playerById(game.state, other)!;
    expect(a.hand.lumber).toBe(1);
    expect(a.hand.ore).toBe(1);
    expect(a.hand.wool).toBe(1); // unbeteiligt
    expect(b.hand.lumber).toBe(2);
    expect(b.hand.ore).toBe(1);
    // Handel zwischen Spielern ist ein Nullsummenspiel gegenueber der Bank.
    expect(game.state.bank).toEqual(bankBefore);
    expect(game.state.trade).toBeNull();
  });

  it('erlaubt den Abschluss nur mit jemandem, der zugesagt hat', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, me, { lumber: 2 });
    setHand(game, other, { ore: 1 });

    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    expect(applyAction(game, { t: 'settleTrade', partner: other }, me)).toEqual({
      ok: false,
      error: 'Dieser Spieler hat nicht zugesagt.',
    });
  });

  it('erlaubt nur dem Anbieter, abzuschliessen oder zurueckzuziehen', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, me, { lumber: 2 });
    setHand(game, other, { ore: 1 });

    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    must(game, { t: 'respondTrade', accept: true }, other);
    // Der Partner ist nicht am Zug - er kommt gar nicht erst durch die Wache.
    expect(applyAction(game, { t: 'settleTrade', partner: other }, other)).toEqual({
      ok: false,
      error: 'Du bist nicht am Zug.',
    });
    expect(applyAction(game, { t: 'cancelTrade' }, other)).toEqual({
      ok: false,
      error: 'Du bist nicht am Zug.',
    });
  });

  /**
   * Der wichtigste Fall: zwischen Zusage und Abschluss kann sich die Lage
   * aendern. Eine Zusage ist eine Absichtserklaerung, keine Reservierung.
   */
  it('prueft beim Abschluss erneut, wenn der Anbieter zwischendurch ausgibt', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, me, { lumber: 1, brick: 1 });
    setHand(game, other, { ore: 1 });

    must(game, { t: 'offerTrade', give: { lumber: 1 }, want: { ore: 1 } }, me);
    must(game, { t: 'respondTrade', accept: true }, other);

    // Anbieter verbaut das Holz, das er gerade angeboten hat.
    const edge = legalRoadEdges(game.state, game.world, me)[0]!;
    must(game, { t: 'buildRoad', edge }, me);

    expect(applyAction(game, { t: 'settleTrade', partner: other }, me)).toEqual({
      ok: false,
      error: 'Dir fehlen inzwischen Karten.',
    });
    // Und niemand hat dabei Karten verloren.
    expect(playerById(game.state, other)!.hand.ore).toBe(1);
  });

  it('prueft beim Abschluss erneut, wenn dem Partner die Karten fehlen', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, me, { lumber: 2 });
    setHand(game, other, { ore: 1 });

    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    must(game, { t: 'respondTrade', accept: true }, other);

    // Ein Monopol raeumt dem Partner das Erz ab, nachdem er zugesagt hat.
    const p = playerById(game.state, me)!;
    p.dev.push({ type: 'monopoly', boughtTurn: 0, played: false });
    must(game, { t: 'playMonopoly', resource: 'ore' }, me);

    expect(applyAction(game, { t: 'settleTrade', partner: other }, me)).toEqual({
      ok: false,
      error: 'Dem Partner fehlen inzwischen Karten.',
    });
  });
});

describe('Lebensdauer des Angebots', () => {
  it('verfaellt mit dem Zugende', () => {
    const game = newGame();
    const me = toMain(game);
    setHand(game, me, { lumber: 2 });
    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    expect(game.state.trade).not.toBeNull();

    must(game, { t: 'endTurn' }, me);
    expect(game.state.trade).toBeNull();
  });

  it('laesst sich zurueckziehen', () => {
    const game = newGame();
    const me = toMain(game);
    setHand(game, me, { lumber: 2 });
    must(game, { t: 'offerTrade', give: { lumber: 2 }, want: { ore: 1 } }, me);
    must(game, { t: 'cancelTrade' }, me);
    expect(game.state.trade).toBeNull();
    expect(applyAction(game, { t: 'cancelTrade' }, me)).toEqual({
      ok: false,
      error: 'Es liegt kein Angebot vor.',
    });
  });
});

describe('Buchhaltung', () => {
  it('haelt die Gesamtzahl der Karten je Rohstoff konstant', () => {
    const game = newGame();
    const me = toMain(game);
    const other = game.state.order.find((id) => id !== me)!;
    setHand(game, me, { lumber: 4, grain: 2 });
    setHand(game, other, { ore: 3, wool: 1 });

    const total = (r: Resource) =>
      game.state.bank[r] + game.state.players.reduce((n, p) => n + p.hand[r], 0);
    const before = Object.fromEntries(RESOURCES.map((r) => [r, total(r)]));

    must(game, { t: 'offerTrade', give: { lumber: 3, grain: 1 }, want: { ore: 2 } }, me);
    must(game, { t: 'respondTrade', accept: true }, other);
    must(game, { t: 'settleTrade', partner: other }, me);

    for (const r of RESOURCES) expect(total(r)).toBe(before[r]);
  });
});

describe('Hilfsfunktionen', () => {
  it('bundleSize zaehlt, hasBundle prueft Deckung', () => {
    expect(bundleSize({ lumber: 2, ore: 1 })).toBe(3);
    expect(bundleSize({})).toBe(0);
    const hand: Hand = { lumber: 2, wool: 0, grain: 0, brick: 0, ore: 1 };
    expect(hasBundle(hand, { lumber: 2, ore: 1 })).toBe(true);
    expect(hasBundle(hand, { lumber: 3 })).toBe(false);
    expect(hasBundle(hand, {})).toBe(true);
  });
});
