/**
 * Die Arten der Wanderer-Auftraege: liefern, jagen, geleiten, auskundschaften -
 * und dass Wanderer mehr als eine Art anbieten.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import { ANGEBOT_RUNDEN, JAGD_MENGE, LIEFER_MENGE, auftraegePruefen, wandererBieten } from '../src/core/rules/auftraege';
import type { AuftragEvent } from '../src/core/rules/auftraege';
import { hexDistance, hexKey, hexesInRange, vertexKey } from '../src/core/coords';
import { einheitVorlage, isLandAt, nextStep, settlementApproaches } from '../src/core/units';
import { nestAt } from '../src/core/raiders';
import { ensureGenerated } from '../src/core/world';
import { Rng } from '../src/core/rng';
import { RESOURCES } from '../src/core/types';
import type { WandererAuftrag } from '../src/core/state';

const ORIGIN = { q: 0, r: 0 };
const spiel = (spieler = 1): Game =>
  createGame(
    Array.from({ length: spieler }, (_, i) => ({ id: `p${i}`, name: `S${i}` })),
    2024,
    4711,
    15,
  );

function auftrag(game: Game, felder: Partial<WandererAuftrag>): WandererAuftrag {
  const a: WandererAuftrag = {
    id: game.state.nextAuftragId++,
    player: 'p0',
    art: 'liefern',
    q: 0,
    r: 0,
    fraktion: null,
    rohstoff: null,
    menge: 1,
    fortschritt: 0,
    status: 'angenommen',
    bis: game.state.turn + 30,
    wanderer: 99,
    ...felder,
  };
  game.state.auftraege.push(a);
  return a;
}

describe('Liefern', () => {
  it('gibt die Rohstoffe ab und bringt eine Kartenwahl - auch ausserhalb des eigenen Zugs', () => {
    const game = spiel(2);
    const a = auftrag(game, { player: 'p1', art: 'liefern', rohstoff: 'wool', menge: LIEFER_MENGE });
    const p1 = game.state.players[1]!;
    for (const r of RESOURCES) p1.hand[r] = 0;
    p1.hand.wool = LIEFER_MENGE - 1;
    expect(applyAction(game, { t: 'deliverQuest', id: a.id }, 'p1').ok).toBe(false);

    game.state.players[1]!.hand.wool = LIEFER_MENGE;
    const res = applyAction(game, { t: 'deliverQuest', id: a.id }, 'p1');
    expect(res.ok).toBe(true);
    expect(game.state.players[1]!.hand.wool).toBe(0);
    expect(game.state.players[1]!.loot).toBe(1);
    expect(game.state.auftraege).toHaveLength(0);
    expect(applyAction(game, { t: 'deliverQuest', id: a.id }, 'p1').ok).toBe(false);
  });
});

describe('Jagd', () => {
  it('zaehlt geschlagene Raeuber und Goblins aus eigenen Kaempfen', () => {
    const game = spiel();
    const s = game.state;
    const a = auftrag(game, { art: 'jagd', menge: JAGD_MENGE });
    const kampf = (seiten: string[], anzahl: number) => ({
      t: 'fight',
      q: 0,
      r: 0,
      seiten,
      neu: false,
      ende: false,
      sieger: null,
      verluste: [{ seite: 'f:1:1', kind: 'raeuber', anzahl }],
    });

    const events: AuftragEvent[] = [];
    auftraegePruefen(s, [kampf(['f:1:1', 'f:2:2'], 2)], events);
    expect(a.fortschritt).toBe(0);
    auftraegePruefen(s, [kampf(['f:1:1', 'p:p0'], 2)], events);
    expect(a.fortschritt).toBe(2);
    expect(events).toMatchObject([{ t: 'questProgress', fortschritt: 2, menge: JAGD_MENGE }]);
    auftraegePruefen(s, [kampf(['f:1:1', 'p:p0'], 1)], events);
    expect(s.players[0]!.loot).toBe(1);
    expect(s.auftraege).toHaveLength(0);
  });
});

describe('Geleit und Kundschaft', () => {
  it('Geleit: ein eigener Ritter beim Wanderer erfuellt ihn, zieht der Wanderer fort, ist er verloren', () => {
    const game = spiel();
    const s = game.state;
    s.units.push({ ...einheitVorlage('wanderer', 5, 5, { dauer: 10 }), id: 50 });
    const a = auftrag(game, { art: 'geleit', wanderer: 50, q: 5, r: 5 });
    auftraegePruefen(s, [], []);
    expect(s.auftraege).toContain(a);
    s.units.push({ ...einheitVorlage('ritter', 5, 5, { owner: 'p0' }), id: 51 });
    auftraegePruefen(s, [], []);
    expect(s.players[0]!.loot).toBe(1);

    auftrag(game, { art: 'geleit', wanderer: 77 });
    const events: AuftragEvent[] = [];
    auftraegePruefen(s, [], events);
    expect(events).toMatchObject([{ t: 'questFailed', grund: 'verloren' }]);
  });

  it('Kundschaft: der Held am Ziel erfuellt sie', () => {
    const game = spiel();
    const s = game.state;
    auftrag(game, { art: 'kundschaft', q: 9, r: -3 });
    s.units.push({ ...einheitVorlage('held', 9, -3, { owner: 'p0' }), id: 60 });
    const events: AuftragEvent[] = [];
    auftraegePruefen(s, [], events);
    expect(events).toMatchObject([{ t: 'questDone', art: 'kundschaft' }]);
  });
});

describe('Angebote', () => {
  it('Wanderer bieten verschiedene Arten an', () => {
    const arten = new Set<string>();
    for (let saat = 1; saat <= 40; saat++) {
      const game = spiel();
      const s = game.state;
      const seed = s.worldSeed;
      // Ein Dorf nahe einem Lager, damit auch Lager und Jagd moeglich sind.
      for (const nest of hexesInRange(ORIGIN, 30)) {
        if (!nestAt(seed, nest.q, nest.r)) continue;
        const nah = hexesInRange(nest, 4).find(
          (h) =>
            hexDistance(h, nest) === 4 &&
            isLandAt(seed, h.q, h.r) &&
            !nestAt(seed, h.q, h.r) &&
            nextStep(seed, nest, new Set([hexKey(h.q, h.r)]), 900) !== null,
        );
        if (!nah) continue;
        s.buildings[vertexKey({ q: nah.q, r: nah.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
        ensureGenerated(game.world, nest, 14);
        break;
      }
      const [an] = [...settlementApproaches(s).keys()];
      const [q, r] = an!.split(':').map(Number);
      s.units.push({ ...einheitVorlage('wanderer', q!, r!, { dauer: 12 }), id: 5 });
      wandererBieten(s, game.world, new Rng(saat), []);
      for (const a of s.auftraege) {
        arten.add(a.art);
        expect(a.bis).toBe(s.turn + ANGEBOT_RUNDEN);
        if (a.art === 'liefern') expect(a.rohstoff).not.toBeNull();
      }
    }
    expect(arten.size).toBeGreaterThanOrEqual(5);
    expect(arten.has('liefern')).toBe(true);
    expect(arten.has('kundschaft')).toBe(true);
  });
});
