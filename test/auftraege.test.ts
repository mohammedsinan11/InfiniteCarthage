/**
 * Auftraege der Wanderer: angeboten an Siedlungen, angenommen, erfuellt oder
 * verloren.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import {
  ANGEBOT_RUNDEN,
  AUFTRAG_RUNDEN,
  aufAuftragAntworten,
  auftraegePruefen,
  wandererBieten,
} from '../src/core/rules/auftraege';
import type { AuftragEvent } from '../src/core/rules/auftraege';
import { hexDistance, hexKey, hexesInRange, vertexKey } from '../src/core/coords';
import { einheitVorlage, isLandAt, nestFraktionOf, nextStep, settlementApproaches } from '../src/core/units';
import { nestAt } from '../src/core/raiders';
import { ensureGenerated } from '../src/core/world';
import { Rng } from '../src/core/rng';
import type { WandererAuftrag } from '../src/core/state';

const ORIGIN = { q: 0, r: 0 };
const spiel = (spieler = 1): Game =>
  createGame(
    Array.from({ length: spieler }, (_, i) => ({ id: `p${i}`, name: `S${i}` })),
    2024,
    4711,
    15,
  );

/** Ein Lager und ein Dorf vier Felder davor, mit Weg dazwischen - alles aufgedeckt. */
function lagerMitDorf(game: Game) {
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
    if (!nah) continue;
    game.state.buildings[vertexKey({ q: nah.q, r: nah.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
    ensureGenerated(game.world, nest, 14);
    return nest;
  }
  throw new Error('kein Lager mit Dorf');
}

function auftrag(game: Game, felder: Partial<WandererAuftrag>): WandererAuftrag {
  const a: WandererAuftrag = {
    id: game.state.nextAuftragId++,
    player: 'p0',
    art: 'lager',
    q: 0,
    r: 0,
    fraktion: null,
    rohstoff: null,
    menge: 1,
    fortschritt: 0,
    status: 'angebot',
    bis: game.state.turn + ANGEBOT_RUNDEN,
    wanderer: 99,
    ...felder,
  };
  game.state.auftraege.push(a);
  return a;
}

describe('Auftraege', () => {
  it('ein Wanderer an einer Siedlung bietet einen an - jedem Spieler nur einen', () => {
    const game = spiel();
    const s = game.state;
    lagerMitDorf(game);
    const [an] = [...settlementApproaches(s).keys()];
    const [q, r] = an!.split(':').map(Number);
    s.units.push({ ...einheitVorlage('wanderer', q!, r!, { dauer: 10 }), id: 5 });

    const events: AuftragEvent[] = [];
    wandererBieten(s, game.world, new Rng(1), events);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ t: 'questOffered', player: 'p0' });
    expect(s.auftraege).toMatchObject([{ status: 'angebot', wanderer: 5 }]);

    wandererBieten(s, game.world, new Rng(2), events);
    expect(s.auftraege).toHaveLength(1);
  });

  it('wer annimmt und das Lager zerstoert, bekommt eine Kartenwahl', () => {
    const game = spiel();
    const s = game.state;
    const nest = lagerMitDorf(game);
    const a = auftrag(game, { q: nest.q, r: nest.r, fraktion: nestFraktionOf(s, nest.q, nest.r) });
    expect(aufAuftragAntworten(s, 'p0', a.id, true, [])).toBeNull();
    expect(a.status).toBe('angenommen');
    expect(a.bis).toBe(s.turn + AUFTRAG_RUNDEN);

    s.destroyedNests.push(hexKey(nest.q, nest.r));
    const events: AuftragEvent[] = [];
    auftraegePruefen(
      s,
      [{ t: 'nestDestroyed', q: nest.q, r: nest.r, kind: 'raeuber', fraktion: a.fraktion!, players: ['p0'] }],
      events,
    );
    expect(s.players[0]!.loot).toBe(1);
    expect(s.auftraege).toHaveLength(0);
    expect(events).toMatchObject([{ t: 'questDone', player: 'p0' }]);
  });

  it('kommt jemand anderes zuvor, ist er verloren; laeuft die Frist ab, ebenso', () => {
    const game = spiel();
    const s = game.state;
    const nest = lagerMitDorf(game);
    const a = auftrag(game, { q: nest.q, r: nest.r, status: 'angenommen', bis: 50 });
    s.destroyedNests.push(hexKey(nest.q, nest.r));
    const events: AuftragEvent[] = [];
    auftraegePruefen(s, [{ t: 'nestDestroyed', q: nest.q, r: nest.r, kind: 'raeuber', fraktion: '', players: ['p1'] }], events);
    expect(events).toMatchObject([{ t: 'questFailed', id: a.id, grund: 'verloren' }]);
    expect(s.players[0]!.loot).toBe(0);

    s.destroyedNests = [];
    const spaet = auftrag(game, { q: nest.q, r: nest.r, status: 'angenommen', bis: s.turn });
    const angebot = auftrag(game, { q: nest.q, r: nest.r, bis: s.turn });
    s.turn += 1;
    const spaeter: AuftragEvent[] = [];
    auftraegePruefen(s, [], spaeter);
    expect(spaeter).toMatchObject([{ t: 'questFailed', id: spaet.id, grund: 'abgelaufen' }]);
    expect(s.auftraege.some((x) => x.id === angebot.id)).toBe(false);
  });

  it('antworten darf man auch, wenn ein anderer am Zug ist - aber nur auf eigene', () => {
    const game = spiel(2);
    const a = auftrag(game, { player: 'p1' });
    expect(applyAction(game, { t: 'answerQuest', id: a.id, accept: true }, 'p0').ok).toBe(false);
    expect(applyAction(game, { t: 'answerQuest', id: a.id, accept: false }, 'p1').ok).toBe(true);
    expect(game.state.auftraege[0]!.status).toBe('abgelehnt');
  });
});
