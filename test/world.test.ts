import { describe, it, expect } from 'vitest';
import {
  createWorld,
  ensureGenerated,
  revealChunks,
  tileAt,
  isGenerated,
  originDesert,
  chunkCoords,
  GROWTH_RADIUS,
} from '../src/core/world';
import { hexesInRange, hexDistance, vertexAdjacentHexes, cornerVertex } from '../src/core/coords';
import type { Hex } from '../src/core/coords';

describe('Aufdecken', () => {
  it('erzeugt rund um den Ursprung alles im Wachstumsradius', () => {
    const w = createWorld(1);
    ensureGenerated(w, { q: 0, r: 0 });
    for (const h of hexesInRange({ q: 0, r: 0 }, GROWTH_RADIUS)) {
      expect(isGenerated(w, h.q, h.r), `Hex ${h.q},${h.r} fehlt`).toBe(true);
    }
  });

  it('ist reihenfolgeunabhaengig - zwei Wege, dieselbe Welt', () => {
    const a = createWorld(5);
    ensureGenerated(a, { q: 0, r: 0 });
    ensureGenerated(a, { q: 5, r: -2 });
    ensureGenerated(a, { q: -3, r: 4 });

    const b = createWorld(5);
    ensureGenerated(b, { q: -3, r: 4 });
    ensureGenerated(b, { q: 5, r: -2 });
    ensureGenerated(b, { q: 0, r: 0 });

    expect(new Set(a.tiles.keys())).toEqual(new Set(b.tiles.keys()));
    for (const [k, tile] of a.tiles) expect(b.tiles.get(k)).toEqual(tile);
    expect(new Set(a.ports.keys())).toEqual(new Set(b.ports.keys()));
  });

  it('meldet nur wirklich neue Chunks', () => {
    const w = createWorld(2);
    const first = ensureGenerated(w, { q: 0, r: 0 });
    expect(first.length).toBeGreaterThan(0);
    // Zweiter Aufruf an derselben Stelle deckt nichts Neues auf.
    expect(ensureGenerated(w, { q: 0, r: 0 })).toHaveLength(0);
  });

  it('revealChunks reproduziert die Serverwelt aus blossen Koordinaten', () => {
    // So laeuft es im Netz: der Server erzeugt, der Client bekommt nur (m,n).
    const server = createWorld(31337);
    ensureGenerated(server, { q: 0, r: 0 });
    ensureGenerated(server, { q: 7, r: 1 });

    const client = createWorld(31337);
    revealChunks(client, chunkCoords(server));

    expect(new Set(client.tiles.keys())).toEqual(new Set(server.tiles.keys()));
    for (const [k, tile] of server.tiles) expect(client.tiles.get(k)).toEqual(tile);
  });
});

describe('Endloses Wachstum', () => {
  it('laesst sich beliebig weit nach aussen schieben', () => {
    const w = createWorld(9);
    ensureGenerated(w, { q: 0, r: 0 });

    // Eine Strassenkette nach aussen: Schritt fuer Schritt weiterbauen.
    let pos: Hex = { q: 0, r: 0 };
    for (let step = 0; step < 60; step++) {
      pos = { q: pos.q + 1, r: pos.r };
      // Das naechste Feld muss bereits erzeugt sein, BEVOR wir es betreten -
      // genau das ist die Zusage des Wachstumsradius.
      expect(isGenerated(w, pos.q, pos.r), `Karte endet bei ${pos.q},${pos.r}`).toBe(true);
      ensureGenerated(w, pos);
    }
    expect(hexDistance({ q: 0, r: 0 }, pos)).toBe(60);
    // Und dahinter geht es weiter.
    expect(isGenerated(w, pos.q + GROWTH_RADIUS, pos.r)).toBe(true);
  });

  it('haelt jede Ecke am Bauteil vollstaendig umgeben', () => {
    const w = createWorld(11);
    ensureGenerated(w, { q: 0, r: 0 });
    for (const h of hexesInRange({ q: 0, r: 0 }, 1)) {
      for (let c = 0; c < 6; c++) {
        // Fuer jede Ecke rund ums Zentrum muessen alle drei Nachbarhexes da sein,
        // sonst waere nicht entscheidbar, ob dort gebaut werden darf.
        for (const nb of vertexAdjacentHexes(cornerVertex(h.q, h.r, c))) {
          expect(isGenerated(w, nb.q, nb.r)).toBe(true);
        }
      }
    }
  });
});

describe('Startbedingungen', () => {
  it('findet die Wueste im Startchunk als Raeuberfeld', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = createWorld(seed);
      ensureGenerated(w, { q: 0, r: 0 });
      const d = originDesert(w);
      expect(tileAt(w, d.q, d.r)?.terrain).toBe('desert');
    }
  });

  it('kennt die Haefen der aufgedeckten Chunks', () => {
    const w = createWorld(1);
    for (const h of hexesInRange({ q: 0, r: 0 }, 12)) ensureGenerated(w, h, 1);
    expect(w.ports.size).toBeGreaterThan(0);
  });
});
