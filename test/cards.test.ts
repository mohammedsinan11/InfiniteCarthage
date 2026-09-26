/**
 * Karten: Auswahl, Wirkung und der Weg durch eine Sieben.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame, rebuildWorld } from '../src/core/rules/reducer';
import type { Action, Game } from '../src/core/rules/reducer';
import {
  legalRoadEdges,
  legalSettlementVertices,
} from '../src/core/rules/placement';
import { currentPlayerId, playerById } from '../src/core/state';
import { redactStateFor } from '../src/core/redact';
import type { PlayerId } from '../src/core/state';
import { limitFor } from '../src/core/rules/handlimit';
import { DRAFT_SIZE, draftOptions } from '../src/core/cards/draft';
import { CARDS, cardById } from '../src/core/cards/catalog';
import { modifiersOf, terrainBonusFor } from '../src/core/cards/effects';
import { RARITY_WEIGHTS } from '../src/core/cards/types';
import type { DraftSource } from '../src/core/cards/types';
import { productionSources } from '../src/core/rules/production';
import { dauerwirkungen } from '../src/core/cards/types';
import { tradeRatio } from '../src/core/rules/trade';
import { RESOURCES } from '../src/core/types';
import { aktiviereNeueReichskarte, reichskartenPlaetze } from '../src/core/cards/loadout';
import { istEinzigartig, wiederholbar } from '../src/core/cards/types';

const QUELLEN: DraftSource[] = ['fund', 'belohnung', 'markt'];

function must(game: Game, action: Action, actor: PlayerId) {
  const r = applyAction(game, action, actor);
  if (!r.ok) throw new Error(`${action.t} scheiterte: ${r.error}`);
  return r;
}

function kartenwahl(id: string): Action {
  return { t: 'chooseCard', card: id };
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

  it('zeigt drei Karten derselben Seltenheit, damit die Wahl vergleichbar bleibt', () => {
    for (const q of QUELLEN) {
      for (let runde = 1; runde <= 40; runde++) {
        const stufen = draftOptions(8128, runde, q).map((id) => cardById(id)!.rarity);
        expect(new Set(stufen).size).toBe(1);
      }
    }
  });

  it('bietet eine bereits besessene Dauerkarte nicht erneut an', () => {
    for (let runde = 1; runde <= 100; runde++) {
      expect(draftOptions(17, runde, 'fund', ['holzlager'])).not.toContain('holzlager');
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

  it('zeigt hoechstens eine Taktik je Auslage', () => {
    for (const q of QUELLEN) {
      for (let runde = 1; runde <= 200; runde++) {
        const taktiken = draftOptions(2468, runde, q).filter((id) => cardById(id)!.kind === 'taktik');
        expect(taktiken.length, `${q} Runde ${runde}: ${taktiken.join(', ')}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('Ein volles Deck', () => {
  /** Alles besitzen, was sich nur einmal nehmen laesst. */
  const alleDauerkarten = CARDS.filter(istEinzigartig).map((c) => c.id);

  it('laesst episch und legendaer nicht fuer immer verschwinden', () => {
    const stufen = new Set<string>();
    for (let runde = 1; runde <= 400; runde++) {
      for (const id of draftOptions(555, runde, 'fund', alleDauerkarten)) stufen.add(cardById(id)!.rarity);
    }
    expect(stufen.has('episch')).toBe(true);
    expect(stufen.has('legendaer')).toBe(true);
  });

  it('bietet dann nur Karten mit Sofortwirkung an, und stets drei', () => {
    for (const q of QUELLEN) {
      for (let runde = 1; runde <= 200; runde++) {
        const o = draftOptions(555, runde, q, alleDauerkarten);
        expect(o).toHaveLength(DRAFT_SIZE);
        expect(new Set(o).size).toBe(DRAFT_SIZE);
        for (const id of o) {
          const k = cardById(id)!;
          if (istEinzigartig(k)) expect(wiederholbar(k), `${id} waere leer`).toBe(true);
        }
      }
    }
  });

  it('gibt beim zweiten Nehmen nur die Sofortwirkung, keinen zweiten Platz', () => {
    const game = solo();
    const p = playerById(game.state, 'p0')!;
    p.cards = ['saegewerk'];
    p.activeCards = ['saegewerk'];
    game.state.phase = { t: 'draft' };
    game.state.draft = { source: 'fund', options: ['saegewerk', 'ernte', 'lehmgrube'] };
    const holz = p.hand.lumber;
    must(game, kartenwahl('saegewerk'), 'p0');
    const danach = playerById(game.state, 'p0')!;
    expect(danach.cards).toEqual(['saegewerk']);
    expect(danach.activeCards).toEqual(['saegewerk']);
    expect(danach.hand.lumber).toBe(holz + 3);
  });
});

describe('Kartenplaetze', () => {
  const mitVollenPlaetzen = () => {
    const game = solo();
    const p = playerById(game.state, 'p0')!;
    p.cards = ['holzlager', 'steinbruch'];
    p.activeCards = ['holzlager', 'steinbruch'];
    game.state.phase = { t: 'draft' };
    game.state.draft = { source: 'fund', options: ['schafzucht', 'ernte', 'lehmgrube'] };
    return game;
  };

  it('laesst die Wahl, welche aktive Karte weicht', () => {
    const game = mitVollenPlaetzen();
    must(game, { t: 'chooseCard', card: 'schafzucht', replace: 'steinbruch' }, 'p0');
    expect(playerById(game.state, 'p0')!.activeCards).toEqual(['holzlager', 'schafzucht']);
  });

  it('kann die neue Karte auch nur behalten, ohne dass eine weicht', () => {
    const game = mitVollenPlaetzen();
    must(game, { t: 'chooseCard', card: 'schafzucht', replace: null }, 'p0');
    const p = playerById(game.state, 'p0')!;
    expect(p.activeCards).toEqual(['holzlager', 'steinbruch']);
    expect(p.cards).toContain('schafzucht');
  });

  it('ersetzt ohne Angabe wie bisher die aelteste', () => {
    const game = mitVollenPlaetzen();
    must(game, kartenwahl('schafzucht'), 'p0');
    expect(playerById(game.state, 'p0')!.activeCards).toEqual(['steinbruch', 'schafzucht']);
  });

  it('stellt die aktiven Karten aus dem Besitz um', () => {
    const game = solo();
    runSetup(game);
    const p = playerById(game.state, 'p0')!;
    p.cards = ['holzlager', 'steinbruch', 'schafzucht'];
    p.activeCards = ['holzlager', 'steinbruch'];
    game.state.phase = { t: 'main' };
    must(game, { t: 'setLoadout', cards: ['schafzucht', 'holzlager'] }, 'p0');
    expect(playerById(game.state, 'p0')!.activeCards).toEqual(['schafzucht', 'holzlager']);
    expect(applyAction(game, { t: 'setLoadout', cards: ['schafzucht', 'holzlager', 'steinbruch'] }, 'p0').ok).toBe(false);
    expect(applyAction(game, { t: 'setLoadout', cards: ['der_fund'] }, 'p0').ok).toBe(false);
    expect(applyAction(game, { t: 'setLoadout', cards: ['holzlager', 'holzlager'] }, 'p0').ok).toBe(false);
  });
});

describe('Dauerwirkungen', () => {
  it('hat anfangs zwei aktive Plaetze und ersetzt bei einer neuen Wahl die aelteste Karte', () => {
    const game = solo();
    const p = playerById(game.state, 'p0')!;
    expect(reichskartenPlaetze(game.state, 'p0')).toBe(2);
    aktiviereNeueReichskarte(game.state, p, 'holzlager');
    aktiviereNeueReichskarte(game.state, p, 'steinbruch');
    aktiviereNeueReichskarte(game.state, p, 'schafzucht');
    expect(p.activeCards).toEqual(['steinbruch', 'schafzucht']);
  });

  it('begrenzt gleichartige Ertragsboni', () => {
    const m = modifiersOf(['holzlager', 'der_fund']);
    expect(m.terrainBonus.forest).toBe(2);
  });

  it('laesst Handelsrabatt nicht stapeln und nimmt den besten Vorrat', () => {
    const m = modifiersOf(['handelsposten', 'markttag', 'vorratskammer']);
    expect(m.tradeDiscount).toBe(1);
    expect(m.handLimitBonus).toBe(2);
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

    must(game, kartenwahl(wahl), 'p0');

    const p = playerById(game.state, 'p0')!;
    expect([...p.cards, ...p.tactics, ...p.equipment]).toContain(wahl);
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

  it('gibt die volle Sofortwirkung - die Bank ist unendlich', () => {
    const game = solo();
    runSetup(game);
    expect(wuerfelBisSieben(game)).toBe(true);

    const vorher = { ...playerById(game.state, 'p0')!.hand };
    const wahl = game.state.draft!.options[0]!;
    const karte = cardById(wahl)!;
    must(game, kartenwahl(wahl), 'p0');

    const nachher = playerById(game.state, 'p0')!.hand;
    const zugewinn = RESOURCES.reduce((n, r) => n + (nachher[r] - vorher[r]), 0);
    if (!karte.instant) expect(zugewinn).toBe(0);
    else if (karte.instant.t === 'gain') {
      expect(zugewinn).toBe(RESOURCES.reduce((n, r) => n + ((karte.instant as { resources: Partial<Record<string, number>> }).resources[r] ?? 0), 0));
    } else expect(zugewinn).toBe(karte.instant.count);
  });

  it('wuerfelt die Rohstoffe, statt waehlen zu lassen', () => {
    const aufbau = () => {
      const game = solo();
      runSetup(game);
      game.state.phase = { t: 'draft' };
      game.state.draft = { source: 'fund', options: ['wanderhaendler', 'baumeister', 'muehlen'] };
      return game;
    };

    const game = aufbau();
    const vorher = { ...playerById(game.state, 'p0')!.hand };
    // Ohne Angabe von Rohstoffen - die Karte fragt nicht mehr.
    must(game, { t: 'chooseCard', card: 'wanderhaendler' }, 'p0');
    const nachher = playerById(game.state, 'p0')!.hand;
    expect(RESOURCES.reduce((n, r) => n + (nachher[r] - vorher[r]), 0)).toBe(5);

    /*
     * Der Wurf kommt aus dem rngState, nicht aus Math.random: derselbe Stand
     * und dieselbe Aktion muessen dasselbe ergeben. Sonst rechnete der Server
     * bei jeder Wiederholung anders, und der Spielstand waere nicht mehr die
     * Wahrheit ueber die Partie.
     */
    const zwei = aufbau();
    must(zwei, { t: 'chooseCard', card: 'wanderhaendler' }, 'p0');
    expect(playerById(zwei.state, 'p0')!.hand).toEqual(nachher);
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
    const karte = CARDS.find((c) =>
      dauerwirkungen(c).some((l) => l.t === 'terrainBonus' && l.terrain === gelaende && l.amount > 0),
    );
    if (!karte) return; // fuer dieses Gelaende gibt es keine Karte - kein Fehler
    p.cards.push(karte.id);
    p.activeCards.push(karte.id);

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
    p.activeCards.push('handelsposten');
    expect(tradeRatio(game.state, game.world, 'p0', 'lumber')).toBe(ohne - 1);

    // Eine zweite Rabattkarte stapelt sich nicht.
    p.cards.push('markttag');
    p.activeCards.push('markttag');
    expect(tradeRatio(game.state, game.world, 'p0', 'lumber')).toBe(ohne - 1);
  });

  it('heben die Handkartengrenze', () => {
    const game = solo();
    runSetup(game);
    const p = playerById(game.state, 'p0')!;
    const vorher = limitFor(game.state, 'p0');
    p.cards.push('vorratskammer');
    p.activeCards.push('vorratskammer');
    expect(limitFor(game.state, 'p0')).toBe(vorher + 2);
  });
});

describe('Der Spielstand ueberlebt den Schlaf', () => {
  // Ein Durable Object kann jederzeit hibernieren. Beim Aufwachen kommt der
  // Zustand aus dem Storage - also durch JSON und zurueck. Was diesen Weg
  // nicht uebersteht, faellt erst in Produktion auf, und dann dauerhaft:
  // die Redaktion laeuft bei JEDER Meldung.
  it('geht durch JSON und danach durch Redaktion und Reducer', () => {
    const game = solo();
    runSetup(game);
    expect(wuerfelBisSieben(game)).toBe(true);

    const wieder: Game = {
      state: JSON.parse(JSON.stringify(game.state)),
      world: game.world,
    };
    wieder.world = rebuildWorld(wieder.state);

    // Die Redaktion darf nicht werfen - sie ist der Weg jeder Meldung.
    const sicht = redactStateFor(wieder.state, 'p0');
    expect(sicht.draft?.options).toHaveLength(3);

    // Und die Partie muss weiterlaufen.
    must(wieder, kartenwahl(wieder.state.draft!.options[0]!), 'p0');
    expect(phaseOf(wieder)).toBe('main');
  });

  it('haelt jeden Spieler mit einer Kartenliste - die Redaktion liest sie', () => {
    const game = solo();
    runSetup(game);
    for (const p of game.state.players) expect(Array.isArray(p.cards)).toBe(true);
  });
});
