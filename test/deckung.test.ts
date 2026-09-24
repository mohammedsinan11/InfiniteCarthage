/**
 * Kampf: wo einer steht, zaehlt. Gelaende und eigenes Mauerwerk machen ein
 * Ziel schwerer zu treffen (core/combat.ts, deckungFuer), und wer die Haelfte
 * verliert, weicht aus statt zu fallen (MORAL_ANTEIL, rules/army.ts).
 */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { tickArmy } from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { DECKUNG, DECKUNG_BAU, DECKUNG_BAU_BEFESTIGT, deckungFuer } from '../src/core/combat';
import { einheitVorlage, isLandAt, isNestActive } from '../src/core/units';
import { hexDistance, hexKey, hexVertices, hexesInRange, vertexKey } from '../src/core/coords';
import { ruinAt } from '../src/core/ruins';
import { nestAt } from '../src/core/raiders';

const ORIGIN = { q: 0, r: 0 };
const FREMD = 'f:99:99';

function spiel(): Game {
  const game = createGame([{ id: 'p0', name: 'A' }], 2024, 4711, 0);
  game.state.phase = { t: 'main' };
  game.state.turn = 3;
  return game;
}

/** Ein freies Landfeld ohne Lager und Ruine, mit lauter Land ringsum. */
function freiesFeld(game: Game, nr = 0) {
  const seed = game.state.worldSeed;
  return hexesInRange(ORIGIN, 12).filter(
    (h) =>
      hexesInRange(h, 1).every(
        (x) => isLandAt(seed, x.q, x.r) && !nestAt(seed, x.q, x.r) && !ruinAt(seed, x.q, x.r),
      ),
  )[nr]!;
}

describe('Deckung', () => {
  it('Wald und Gebirge decken, offenes Land nicht', () => {
    expect(DECKUNG.forest).toBe(1);
    expect(DECKUNG.mountain).toBe(1);
    expect(DECKUNG.pasture).toBe(0);
    expect(DECKUNG.field).toBe(0);
    expect(DECKUNG.desert).toBe(0);
  });

  it('zaehlt Gelaende und eigenes Mauerwerk zusammen', () => {
    const game = spiel();
    const h = freiesFeld(game);
    const ritter = { q: h.q, r: h.r, owner: 'p0' as const };

    expect(deckungFuer(game.state, 'pasture', ritter)).toBe(0);
    expect(deckungFuer(game.state, 'forest', ritter)).toBe(DECKUNG.forest);

    // Ein eigener Turm an einer Ecke des Feldes deckt zusaetzlich.
    const ecke = vertexKey(hexVertices(h.q, h.r)[0]!);
    game.state.tuerme[ecke] = { owner: 'p0', stufe: 1 };
    expect(deckungFuer(game.state, 'pasture', ritter)).toBe(DECKUNG_BAU);
    expect(deckungFuer(game.state, 'forest', ritter)).toBe(DECKUNG.forest + DECKUNG_BAU);
  });

  it('ein befestigter Turm (Stufe 3) deckt staerker als ein Geschuetzturm', () => {
    const game = spiel();
    const h = freiesFeld(game);
    const ritter = { q: h.q, r: h.r, owner: 'p0' as const };
    const ecke = vertexKey(hexVertices(h.q, h.r)[0]!);

    game.state.tuerme[ecke] = { owner: 'p0', stufe: 2 };
    expect(deckungFuer(game.state, 'pasture', ritter)).toBe(DECKUNG_BAU);

    game.state.tuerme[ecke] = { owner: 'p0', stufe: 3 };
    expect(deckungFuer(game.state, 'pasture', ritter)).toBe(DECKUNG_BAU_BEFESTIGT);
    expect(DECKUNG_BAU_BEFESTIGT).toBeGreaterThan(DECKUNG_BAU);
  });

  it('ein fremder Turm deckt nicht, und Fraktionen deckt kein Mauerwerk', () => {
    const game = spiel();
    const h = freiesFeld(game);
    const ecke = vertexKey(hexVertices(h.q, h.r)[0]!);
    game.state.tuerme[ecke] = { owner: 'p1', stufe: 1 };

    expect(deckungFuer(game.state, 'pasture', { q: h.q, r: h.r, owner: 'p0' })).toBe(0);
    // Raeuber gehoeren niemandem - fuer sie zaehlt nur das Gelaende.
    expect(deckungFuer(game.state, 'forest', { q: h.q, r: h.r, owner: null })).toBe(DECKUNG.forest);
  });

  it('die eigene Hauptstadt deckt ihre Besatzung', () => {
    const game = spiel();
    const h = freiesFeld(game);
    game.state.hauptstaedte[hexKey(h.q, h.r)] = { owner: 'p0', stufe: 1, seit: 1 };
    expect(deckungFuer(game.state, 'pasture', { q: h.q, r: h.r, owner: 'p0' })).toBe(DECKUNG_BAU);
  });
});

describe('Moral', () => {
  /** Zwei Ritter gegen eine Uebermacht Raeuber auf einem Feld. */
  function gemetzel(seed: number) {
    const game = createGame([{ id: 'p0', name: 'A' }], seed, seed * 7 + 1, 0);
    game.state.phase = { t: 'main' };
    game.state.turn = 3;
    const h = freiesFeld(game);
    let id = 1;
    for (let i = 0; i < 2; i++) {
      game.state.units.push({ ...einheitVorlage('ritter', h.q, h.r, { owner: 'p0' }), id: id++ });
    }
    for (let i = 0; i < 5; i++) {
      game.state.units.push({
        ...einheitVorlage('raeuber', h.q, h.r, { fraktion: FREMD, auftrag: 'raub' }),
        id: id++,
      });
    }
    return { game, h };
  }

  it('wer die Haelfte verliert, weicht auf ein Nachbarfeld aus', () => {
    let gesehen = false;
    for (let seed = 1; seed <= 60 && !gesehen; seed++) {
      const { game, h } = gemetzel(seed);
      const events: ArmyEvent[] = [];
      tickArmy(game.state, game.world, events);
      const rueckzug = events.find((e) => e.t === 'retreat');
      if (!rueckzug) continue;
      gesehen = true;
      expect(rueckzug.anzahl).toBeGreaterThan(0);
      // Sie stehen jetzt nebenan, nicht mehr im Kampf.
      expect(hexDistance(rueckzug.von, rueckzug.nach)).toBe(1);
      const dort = game.state.units.filter((u) => u.q === rueckzug.nach.q && u.r === rueckzug.nach.r);
      expect(dort.length).toBe(rueckzug.anzahl);
      expect(isLandAt(game.state.worldSeed, rueckzug.nach.q, rueckzug.nach.r)).toBe(true);
      expect(isNestActive(game.state, rueckzug.nach.q, rueckzug.nach.r)).toBe(false);
      expect(rueckzug.von).toEqual({ q: h.q, r: h.r });
    }
    expect(gesehen).toBe(true);
  });

  it('wo der Held steht, weicht niemand', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { game, h } = gemetzel(seed);
      game.state.units.push({
        ...einheitVorlage('held', h.q, h.r, { owner: 'p0' }),
        id: 99,
      });
      const events: ArmyEvent[] = [];
      tickArmy(game.state, game.world, events);
      const rueckzug = events.filter((e) => e.t === 'retreat');
      // Die Raeuber duerfen weichen - die Seite des Helden nie.
      for (const r of rueckzug) expect(r.seite).not.toBe('p:p0');
    }
  });
});
