/**
 * Heldenlore: der Name kommt aus dem rngState - also vom Server und
 * reproduzierbar -, und das Adelshaus ueberlebt seinen Traeger (core/lore.ts).
 */

import { describe, it, expect } from 'vitest';
import { Rng } from '../src/core/rng';
import { GESTALTEN, heldKurz, heldVoll, nachfolger, wuerfleHeld } from '../src/core/lore';
import { createGame } from '../src/core/rules/reducer';
import { benenneHeld } from '../src/core/rules/army';
import { redactStateFor } from '../src/core/redact';

describe('Heldenname', () => {
  it('derselbe Seed gibt denselben Namen, ein anderer einen anderen', () => {
    expect(wuerfleHeld(new Rng(1234))).toEqual(wuerfleHeld(new Rng(1234)));
    expect(wuerfleHeld(new Rng(9999))).not.toEqual(wuerfleHeld(new Rng(1234)));
  });

  it('der Name liest sich als Satz - und bleibt ohne Umlaute', () => {
    for (const seed of [1, 7, 23, 404, 77777]) {
      const l = wuerfleHeld(new Rng(seed));
      expect(heldKurz(l)).toBe(`${l.vorname} ${l.beiname}`);
      expect(l.vorname.startsWith(l.stamm)).toBe(true);
      expect(l.beiname.startsWith(l.geschlecht === 'm' ? 'der ' : 'die ')).toBe(true);
      expect(heldVoll(l)).toContain(l.titel);
      expect(heldVoll(l)).toContain(l.haus);
      expect(/[aouAOU]̈|[äöüÄÖÜß]/.test(heldVoll(l))).toBe(false);
    }
  });

  it('der Nachfolger erbt Stamm und Haus, heisst aber anders', () => {
    const rng = new Rng(42);
    const alt = wuerfleHeld(rng);
    for (let i = 0; i < 20; i++) {
      const neu = nachfolger(rng, alt);
      expect(neu.stamm).toBe(alt.stamm);
      expect(neu.haus).toBe(alt.haus);
      expect(neu.vorname).not.toBe(alt.vorname);
      expect(neu.folge).toBe(alt.folge + 1);
      // Derselbe Titel, nur in der Form, die zum Geschlecht passt.
      if (neu.geschlecht === alt.geschlecht) expect(neu.titel).toBe(alt.titel);
    }
  });

  it('jeder Held bekommt eine der zehn Gestalten - und alle kommen vor', () => {
    const gesehen = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      const l = wuerfleHeld(new Rng(seed));
      expect(l.gestalt).toBeGreaterThanOrEqual(0);
      expect(l.gestalt).toBeLessThan(GESTALTEN);
      gesehen.add(l.gestalt!);
    }
    expect(gesehen.size).toBe(GESTALTEN);
  });

  it('der Nachfolger sieht nie aus wie sein Vorgaenger', () => {
    const rng = new Rng(2024);
    let alt = wuerfleHeld(rng);
    for (let i = 0; i < 50; i++) {
      const neu = nachfolger(rng, alt);
      expect(neu.gestalt).not.toBe(alt.gestalt);
      expect(neu.gestalt).toBeLessThan(GESTALTEN);
      alt = neu;
    }
  });
});

describe('Der Held der Partie', () => {
  function spiel() {
    return createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], 2024, 4711, 0);
  }

  it('bekommt seinen Namen erst beim Antreten', () => {
    const game = spiel();
    const p = game.state.players[0]!;
    expect(p.held).toBe(null);
    const lore = benenneHeld(game.state, p);
    expect(p.held).toEqual(lore);
  });

  it('kehrt als derselbe zurueck - zweimal benennen aendert nichts', () => {
    const game = spiel();
    const p = game.state.players[0]!;
    const lore = benenneHeld(game.state, p);
    const rngVorher = game.state.rngState;
    expect(benenneHeld(game.state, p)).toEqual(lore);
    expect(game.state.rngState).toBe(rngVorher);
  });

  it('der Name ist oeffentlich - auch die anderen sehen ihn', () => {
    const game = spiel();
    const lore = benenneHeld(game.state, game.state.players[0]!);
    const sicht = redactStateFor(game.state, 'p1');
    expect(sicht.players[0]!.held).toEqual(lore);
    expect(sicht.players[1]!.held).toBe(null);
  });

  it('zwei Spieler bekommen verschiedene Helden', () => {
    const game = spiel();
    const a = benenneHeld(game.state, game.state.players[0]!);
    const b = benenneHeld(game.state, game.state.players[1]!);
    expect(heldVoll(a)).not.toBe(heldVoll(b));
  });
});
