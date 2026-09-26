/**
 * Diplomatie: Frieden und Tribut nehmen einen Spieler aus der Feindschaft einer
 * Fraktion - keine Raubzuege, keine Kaempfe.
 */

import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/rules/reducer';
import type { Game } from '../src/core/rules/reducer';
import {
  FRIEDEN_PREIS,
  FRIEDEN_RUNDEN,
  abkommenRunde,
  tributKarten,
  tributRunde,
  verhandeln,
} from '../src/core/rules/diplomatie';
import type { DiplomatieEvent } from '../src/core/rules/diplomatie';
import { sendRaiders, tickArmy } from '../src/core/rules/army';
import type { ArmyEvent } from '../src/core/rules/army';
import { fraktionById } from '../src/core/factions';
import { feindlich, kampfFelder, spielerSeite } from '../src/core/combat';
import { hexDistance, hexKey, hexesInRange, vertexKey } from '../src/core/coords';
import {
  einheitVorlage,
  isLandAt,
  isNestActive,
  nestFraktionOf,
  nextStep,
  settlementApproaches,
} from '../src/core/units';
import { nestAt } from '../src/core/raiders';
import { ruinAt } from '../src/core/ruins';
import { handSize } from '../src/core/state';
import { RESOURCES } from '../src/core/types';

const ORIGIN = { q: 0, r: 0 };
const solo = (): Game => createGame([{ id: 'p0', name: 'Solo' }], 2024, 4711, 15);

/** Eine Fraktion dieser Art aus einem Lager nahe dem Ursprung. */
function fraktionDerArt(game: Game, art: 'raeuber' | 'goblin'): string {
  const s = game.state;
  for (const h of hexesInRange(ORIGIN, 60)) {
    if (!isNestActive(s, h.q, h.r)) continue;
    const id = nestFraktionOf(s, h.q, h.r);
    const f = fraktionById(s.worldSeed, id);
    // Kraemerische Fraktionen haben eigene Regeln (eigener Test) - hier die gewoehnlichen.
    if (f.art === art && f.wesen !== 'kraemerisch') return id;
  }
  throw new Error(`keine Fraktion der Art ${art}`);
}

function leereHand(game: Game) {
  for (const r of RESOURCES) game.state.players[0]!.hand[r] = 0;
}

describe('Abkommen', () => {
  it('Frieden kostet Gaben, gilt zwanzig Runden, und nur Raeuberbanden nehmen ihn', () => {
    const game = solo();
    const s = game.state;
    const raeuber = fraktionDerArt(game, 'raeuber');
    const goblins = fraktionDerArt(game, 'goblin');
    leereHand(game);
    expect(verhandeln(s, 'p0', raeuber, 'frieden', [])).not.toBeNull();

    for (const [r, n] of Object.entries(FRIEDEN_PREIS)) s.players[0]!.hand[r as 'grain'] = n!;
    const events: DiplomatieEvent[] = [];
    expect(verhandeln(s, 'p0', raeuber, 'frieden', events)).toBeNull();
    expect(handSize(s.players[0]!.hand)).toBe(0);
    expect(s.abkommen).toMatchObject([{ player: 'p0', fraktion: raeuber, art: 'frieden', bis: s.turn + FRIEDEN_RUNDEN }]);
    expect(feindlich(spielerSeite('p0'), raeuber, s)).toBe(false);
    expect(feindlich(spielerSeite('p0'), raeuber)).toBe(true);

    for (const [r, n] of Object.entries(FRIEDEN_PREIS)) s.players[0]!.hand[r as 'grain'] = n!;
    expect(verhandeln(s, 'p0', goblins, 'frieden', [])).toMatch(/keinen Frieden|Goblins/);
  });

  it('Tribut kostet sofort und je grosser Runde eine Karte - wer nicht zahlt, hat Krieg', () => {
    const game = solo();
    const s = game.state;
    const goblins = fraktionDerArt(game, 'goblin');
    leereHand(game);
    expect(verhandeln(s, 'p0', goblins, 'tribut', [])).not.toBeNull();

    s.players[0]!.hand.ore = 2;
    expect(verhandeln(s, 'p0', goblins, 'tribut', [])).toBeNull();
    expect(s.players[0]!.hand.ore).toBe(1);

    const events: DiplomatieEvent[] = [];
    tributRunde(s, events);
    expect(s.players[0]!.hand.ore).toBe(0);
    expect(s.abkommen).toHaveLength(1);
    tributRunde(s, events);
    expect(s.abkommen).toHaveLength(0);
    expect(events.map((e) => e.t)).toEqual(['tribute', 'war']);
    expect(events[1]).toMatchObject({ grund: 'unbezahlt' });
  });

  it('Tribut waechst mit dem Reich: eine Karte je Siegpunkt', () => {
    const game = solo();
    const s = game.state;
    expect(tributKarten(s, 'p0')).toBe(1);
    for (let i = 0; i < 6; i++) s.buildings[`${i}:0:N`] = { owner: 'p0', type: 'settlement' };
    expect(tributKarten(s, 'p0')).toBe(6);
    const goblins = fraktionDerArt(game, 'goblin');
    leereHand(game);
    s.players[0]!.hand.ore = 5;
    expect(verhandeln(s, 'p0', goblins, 'tribut', [])).toMatch(/6 noetig/);
    s.players[0]!.hand.ore = 8;
    expect(verhandeln(s, 'p0', goblins, 'tribut', [])).toBeNull();
    expect(s.players[0]!.hand.ore).toBe(2);
    const events: DiplomatieEvent[] = [];
    tributRunde(s, events);
    expect(events[0]).toMatchObject({ t: 'war', grund: 'unbezahlt' });
  });

  it('Frieden laeuft aus, und Krieg laesst sich jederzeit erklaeren', () => {
    const game = solo();
    const s = game.state;
    const raeuber = fraktionDerArt(game, 'raeuber');
    s.abkommen.push({ player: 'p0', fraktion: raeuber, art: 'frieden', seit: 0, bis: 10 });
    s.turn = 10;
    abkommenRunde(s, []);
    expect(s.abkommen).toHaveLength(1);
    s.turn = 11;
    const events: DiplomatieEvent[] = [];
    abkommenRunde(s, events);
    expect(s.abkommen).toHaveLength(0);
    expect(events).toMatchObject([{ t: 'war', grund: 'abgelaufen' }]);

    s.abkommen.push({ player: 'p0', fraktion: raeuber, art: 'frieden', seit: 11, bis: 40 });
    s.phase = { t: 'main' };
    const res = applyAction(game, { t: 'diplomacy', fraktion: raeuber, art: 'krieg' }, 'p0');
    expect(res.ok).toBe(true);
    expect(game.state.abkommen).toHaveLength(0);
  });
});

describe('Mit Abkommen', () => {
  it('kaempfen die Leute einer Fraktion nicht mit den Rittern des Spielers', () => {
    const game = solo();
    const s = game.state;
    const fraktion = 'f:99:99';
    s.units.push({ ...einheitVorlage('ritter', 40, 40, { owner: 'p0' }), id: 1 });
    s.units.push({ ...einheitVorlage('raeuber', 40, 40, { fraktion, auftrag: 'heimkehr' }), id: 2 });
    expect(kampfFelder(s).size).toBe(1);
    s.abkommen.push({ player: 'p0', fraktion, art: 'tribut', seit: 0, bis: null });
    expect(kampfFelder(s).size).toBe(0);
  });

  it('pluendert niemand an seinen Siedlungen', () => {
    const plunder = (frieden: boolean) => {
      const game = solo();
      const s = game.state;
      const seed = s.worldSeed;
      const mitte = hexesInRange(ORIGIN, 20).find((c) =>
        hexesInRange(c, 2).every((x) => isLandAt(seed, x.q, x.r) && !nestAt(seed, x.q, x.r) && !ruinAt(seed, x.q, x.r)),
      )!;
      s.buildings[vertexKey({ q: mitte.q, r: mitte.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
      s.players[0]!.hand.lumber = 3;
      const [an] = [...settlementApproaches(s).keys()];
      const [q, r] = an!.split(':').map(Number);
      const fraktion = 'f:99:99';
      s.units.push({ ...einheitVorlage('raeuber', q!, r!, { fraktion }), id: 1 });
      if (frieden) s.abkommen.push({ player: 'p0', fraktion, art: 'frieden', seit: 0, bis: 50 });
      const events: ArmyEvent[] = [];
      tickArmy(s, game.world, events);
      return events.some((e) => e.t === 'plunder');
    };
    expect(plunder(false)).toBe(true);
    expect(plunder(true)).toBe(false);
  });

  it('brechen aus den Lagern dieser Fraktion keine Raubzuege gegen ihn auf', () => {
    const seed = solo().state.worldSeed;
    let geprueft = false;
    for (const nest of hexesInRange(ORIGIN, 30)) {
      if (geprueft) break;
      if (!nestAt(seed, nest.q, nest.r)) continue;
      const nah = hexesInRange(nest, 4).find(
        (h) =>
          hexDistance(h, nest) === 4 &&
          isLandAt(seed, h.q, h.r) &&
          !nestAt(seed, h.q, h.r) &&
          nextStep(seed, nest, new Set([hexKey(h.q, h.r)]), 900) !== null,
      );
      if (!nah) continue;
      const aufbruch = (frieden: boolean) => {
        const game = solo();
        const s = game.state;
        s.buildings[vertexKey({ q: nah.q, r: nah.r, d: 'N' })] = { owner: 'p0', type: 'settlement' };
        if (frieden) {
          s.abkommen.push({ player: 'p0', fraktion: nestFraktionOf(s, nest.q, nest.r), art: 'frieden', seit: 0, bis: 99 });
        }
        sendRaiders(s, []);
        return s.units.some((u) => u.heimat === hexKey(nest.q, nest.r));
      };
      if (!aufbruch(false)) continue;
      expect(aufbruch(true)).toBe(false);
      geprueft = true;
    }
    expect(geprueft).toBe(true);
  });
});

describe('Fraktionen mit Wesen', () => {
  it('jede Fraktion hat ein Wesen und einen Anfuehrer, fest aus dem Seed', () => {
    const a = fraktionById(4242, 'f:1:2');
    const b = fraktionById(4242, 'f:1:2');
    expect(a.wesen).toBeDefined();
    expect(a.anfuehrer).toMatch(/^(Hauptmann|Haeuptling) /);
    expect(b).toEqual(a);
    const wesen = new Set<string>();
    for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) wesen.add(fraktionById(99, `f:${x}:${y}`).wesen!);
    expect(wesen.size).toBe(4);
  });

  it('kraemerische nehmen einen Tribut weniger', async () => {
    const { tributKarten } = await import('../src/core/rules/diplomatie');
    let kraemer: string | null = null;
    let anderer: string | null = null;
    for (let x = -6; x <= 6 && (!kraemer || !anderer); x++) {
      const id = `f:${x}:0`;
      if (fraktionById(7, id).wesen === 'kraemerisch') kraemer ??= id;
      else anderer ??= id;
    }
    const s = { worldSeed: 7, buildings: { a: { owner: 'p0', type: 'city' as const }, b: { owner: 'p0', type: 'city' as const } }, ruhmreichster: null, hauptstaedte: {} };
    expect(tributKarten(s as never, 'p0', anderer!)).toBe(4);
    expect(tributKarten(s as never, 'p0', kraemer!)).toBe(3);
  });
});
