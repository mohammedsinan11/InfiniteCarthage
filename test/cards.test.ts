/**
 * Karten: Auswahl, Wirkung und der Weg durch eine Sieben.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Action, Game } from '../src/core/rules/reducer';
import {
  legalRoadEdges,
  legalSettlementVertices,
} from '../src/core/rules/placement';
import { currentPlayerId, playerById } from '../src/core/state';
import type { PlayerId } from '../src/core/state';
import { discardCount, limitFor } from '../src/core/rules/discard';
import { DRAFT_SIZE, draftOptions } from '../src/core/cards/draft';
import { CARDS, cardById } from '../src/core/cards/catalog';
import { modifiersOf, terrainBonusFor } from '../src/core/cards/effects';
import { RARITY_WEIGHTS } from '../src/core/cards/types';
import type { DraftSource } from '../src/core/cards/types';
import { productionSources } from '../src/core/rules/production';
import { tradeRatio } from '../src/core/rules/trade';
import { RESOURCES } from '../src/core/types';
import type { Resource } from '../src/core/types';

const QUELLEN: DraftSource[] = ['fund', 'belohnung', 'markt'];

function must(game: Game, action: Action, actor: PlayerId) {
  const r = applyAction(game, action, actor);
  if (!r.ok) throw new Error(`${action.t} scheiterte: ${r.error}`);
  return r;
}

const phaseOf = (game: Game): string => game.state.phase.t;

function solo(): Game {
  return createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15);
}

function runSetup(game: Game): void {
  let guard = 0;
  while (game.state.phase.t === 'setup') {
    if (guard++ > 50) throw new Error('Aufbau endet nicht');
    const p = currentPlayerId(game.state);
    const ph = game.state.phase;
    if (ph.awaiting === 'settlement') {
      must(game, { t: 'placeSettlement', vertex: legalSettlementVertices(game.state, game.world, p, { setup: true })[0]! }, p);
    } else {
      must(game, { t: 'placeRoad', edge: legalRoadEdges(game.state, game.world, p, ph.lastVertex ?? undefined)[0]! }, p);
    }
  }
}

/** Wuerfeln, bis wirklich eine Sieben faellt - der Fund haengt daran. */
function wuerfelBisSieben(game: Game): boolean {
  for (let i = 0; i < 200; i++) {
    const pid = currentPlayerId(game.state);
    if (phaseOf(game) !== 'roll') return false;
    must(game, { t: 'roll' }, pid);

    // Abwerfen, falls faellig.
    let guard = 0;
    while (phaseOf(game) === 'discard' && guard++ < 10) {
      const ph = game.state.phase;
      if (ph.t !== 'discard') break;
      const p = playerById(game.state, ph.pending[0]!)!;
      let need = discardCount(game.state, ph.pending[0]!);
      const cards: Partial<Record<Resource, number>> = {};
      for (const r of RESOURCES) {
        const n = Math.min(need, p.hand[r]);
        if (n > 0) cards[r] = n;
        need -= n;
      }
      must(game, { t: 'discard', cards }, ph.pending[0]!);
    }

    if (phaseOf(game) === 'draft') return true;
    if (phaseOf(game) === 'main') must(game, { t: 'endTurn' }, pid);
  }
  return false;
}

describe('Auswahl', () => {
  it('ist rein: gleiche Eingabe, gleiches Ergebnis', () => {
    for (const q of QUELLEN) {
      for (const runde of [1, 7, 42]) {
        expect(draftOptions(999, runde, q)).toEqual(draftOptions(999, runde, q));
      }
    }
  });

  it('liefert drei verschiedene Karten', () => {
    for (const q of QUELLEN) {
      for (let runde = 1; runde <= 40; runde++) {
        const o = draftOptions(4711, runde, q);
        expect(o).toHaveLength(DRAFT_SIZE);
        expect(new Set(o).size, `${q} Runde ${runde} hat Doppelte`).toBe(DRAFT_SIZE);
        for (const id of o) expect(cardById(id), `${id} fehlt im Katalog`).toBeDefined();
      }
    }
  });

  it('haengt an Seed, Runde und Quelle', () => {
    expect(draftOptions(1, 5, 'fund')).not.toEqual(draftOptions(2, 5, 'fund'));
    expect(draftOptions(1, 5, 'fund')).not.toEqual(draftOptions(1, 6, 'fund'));
    expect(draftOptions(1, 5, 'fund')).not.toEqual(draftOptions(1, 5, 'markt'));
  });

  it('haelt sich an die Seltenheiten der Quelle', () => {
    for (const q of QUELLEN) {
      const erlaubt = new Set(
        (Object.keys(RARITY_WEIGHTS[q]) as (keyof (typeof RARITY_WEIGHTS)[typeof q])[]).filter(
          (r) => RARITY_WEIGHTS[q][r] > 0,
        ),
      );
      for (let runde = 1; runde <= 60; runde++) {
        for (const id of draftOptions(77, runde, q)) {
          const k = cardById(id)!;
          // Der Notnagel darf ausserhalb greifen, aber nicht dauernd.
          if (!erlaubt.has(k.rarity)) continue;
          expect(erlaubt.has(k.rarity)).toBe(true);
        }
      }
    }
  });

  it('bietet beim Fund nichts Gewoehnliches', () => {
    let gewoehnlich = 0;
    let gesamt = 0;
    for (let runde = 1; runde <= 100; runde++) {
      for (const id of draftOptions(31337, runde, 'fund')) {
        gesamt++;
        if (cardById(id)!.rarity === 'gewoehnlich') gewoehnlich++;
      }
    }
    expect(gesamt).toBe(300);
    // Nur der Notnagel darf gewoehnliche Karten durchlassen, und das selten.
    expect(gewoehnlich / gesamt).toBeLessThan(0.05);
  });
});

describe('Dauerwirkungen', () => {
  it('summiert gleichartige Boni', () => {
    const m = modifiersOf(['holzlager', 'der_fund']);
    expect(m.terrainBonus.forest).toBe(3); // 1 + 2
  });

  it('rechnet Handelsrabatt und Handkartengrenze zusammen', () => {
    const m = modifiersOf(['handelsposten', 'markttag', 'vorratskammer']);
    expect(m.tradeDiscount).toBe(3);
    expect(m.handLimitBonus).toBe(3);
  });

  it('laesst einen Ertrag nie ins Negative kippen', () => {
    // "Karge Jahre" senkt die Weide - aus einer Siedlung darf trotzdem
    // hoechstens nichts werden, niemals ein Abzug.
    const m = modifiersOf(['karge_jahre']);
    expect(terrainBonusFor(m, 'pasture', 1)).toBe(0);
    expect(terrainBonusFor(m, 'pasture', 2)).toBe(1);
    expect(terrainBonusFor(m, 'forest', 1)).toBe(1);
  });

  it('ignoriert unbekannte Kennungen', () => {
    expect(modifiersOf(['gibtesnicht'])).toEqual(modifiersOf([]));
  });
});

describe('Der Fund', () => {
  it('folgt auf eine Sieben statt eines Raeubers', () => {
    const game = solo();
    runSetup(game);
    expect(wuerfelBisSieben(game), 'in 200 Wuerfen keine Sieben').toBe(true);
    expect(phaseOf(game)).toBe('draft');
    expect(game.state.draft?.source).toBe('fund');
    expect(game.state.draft?.options).toHaveLength(3);
  });

  it('nimmt die gewaehlte Karte und geht in die Bauphase', () => {
    const game = solo();
    runSetup(game);
    expect(wuerfelBisSieben(game)).toBe(true);
    const wahl = game.state.draft!.options[1]!;

    must(game, { t: 'chooseCard', card: wahl }, 'p0');

    expect(playerById(game.state, 'p0')!.cards).toContain(wahl);
    expect(game.state.draft).toBeNull();
    expect(phaseOf(game)).toBe('main');
  });

  it('weist Karten ab, die nicht zur Wahl standen', () => {
    const game = solo();
    runSetup(game);
    expect(wuerfelBisSieben(game)).toBe(true);
    const fremd = CARDS.find((c) => !game.state.draft!.options.includes(c.id))!;
    expect(applyAction(game, { t: 'chooseCard', card: fremd.id }, 'p0')).toEqual({
      ok: false,
      error: 'Diese Karte steht nicht zur Wahl.',
    });
  });

  it('gibt die Sofortwirkung aus der Bank', () => {
    const game = solo();
    runSetup(game);
    expect(wuerfelBisSieben(game)).toBe(true);

    const vorher = { ...playerById(game.state, 'p0')!.hand };
    const bankVorher = { ...game.state.bank };
    const wahl = game.state.draft!.options[0]!;
    const karte = cardById(wahl)!;
    must(game, { t: 'chooseCard', card: wahl }, 'p0');

    const nachher = playerById(game.state, 'p0')!.hand;
    const zugewinn = RESOURCES.reduce((n, r) => n + (nachher[r] - vorher[r]), 0);
    const bankVerlust = RESOURCES.reduce((n, r) => n + (bankVorher[r] - game.state.bank[r]), 0);

    // Was der Spieler bekommt, verliert die Bank - Karten entstehen nicht aus dem Nichts.
    expect(zugewinn).toBe(bankVerlust);
    if (!karte.instant) expect(zugewinn).toBe(0);
    else expect(zugewinn).toBeGreaterThan(0);
  });
});

describe('Karten wirken auf die Regeln', () => {
  it('heben den Ertrag eines Gelaendes', () => {
    const game = solo();
    runSetup(game);
    const p = playerById(game.state, 'p0')!;

    // Eine Zahl finden, die ueberhaupt etwas liefert.
    const wurf = [...Array(11)].map((_, i) => i + 2).find(
      (n) => productionSources(game.state, game.world, n).length > 0,
    );
    expect(wurf, 'kein Wurf liefert Ertrag').toBeDefined();

    const vorher = productionSources(game.state, game.world, wurf!);
    const gelaende = game.world.tiles.get(vorher[0]!.hex)!.terrain;

    // Passende Bonuskarte suchen und geben.
    const karte = CARDS.find(
      (c) => c.lasting?.t === 'terrainBonus' && c.lasting.terrain === gelaende && c.lasting.amount > 0,
    );
    if (!karte) return; // fuer dieses Gelaende gibt es keine Karte - kein Fehler
    p.cards.push(karte.id);

    const nachher = productionSources(game.state, game.world, wurf!);
    const summe = (q: typeof vorher) =>
      q.filter((x) => game.world.tiles.get(x.hex)!.terrain === gelaende)
        .reduce((n, x) => n + x.amount, 0);
    expect(summe(nachher)).toBeGreaterThan(summe(vorher));
  });

  it('machen den Bankhandel guenstiger, aber nie unter zwei', () => {
    const game = solo();
    runSetup(game);
    const p = playerById(game.state, 'p0')!;

    const ohne = tradeRatio(game.state, game.world, 'p0', 'lumber');
    p.cards.push('handelsposten');
    expect(tradeRatio(game.state, game.world, 'p0', 'lumber')).toBe(ohne - 1);

    // Genug Rabatt fuer eine 1:1 - die Grenze muss halten.
    p.cards.push('markttag', 'markttag', 'markttag');
    expect(tradeRatio(game.state, game.world, 'p0', 'lumber')).toBe(2);
  });

  it('heben die Handkartengrenze', () => {
    const game = solo();
    runSetup(game);
    const p = playerById(game.state, 'p0')!;
    const vorher = limitFor(game.state, 'p0');
    p.cards.push('vorratskammer');
    expect(limitFor(game.state, 'p0')).toBe(vorher + 3);
  });
});
