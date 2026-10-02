/** Freischaltungen (core/freischalt.ts): der Kartentopf waechst mit Partien und Bossen. */

import { describe, it, expect } from 'vitest';
import { ENGINE_REIHE, SCHLUESSEL_REIHE, gesperrteKarten, neuFrei } from '../src/core/freischalt';
import { CARDS, cardById } from '../src/core/cards/catalog';
import { draftOptions } from '../src/core/cards/draft';

describe('Freischaltungen', () => {
  it('jede Engine- und Schluesselkarte steht genau einmal in einer Reihe', () => {
    const engine = CARDS.filter((c) => c.wert !== undefined && !c.schluessel).map((c) => c.id).sort();
    expect([...ENGINE_REIHE].sort()).toEqual(engine);
    expect([...SCHLUESSEL_REIHE].sort()).toEqual(CARDS.filter((c) => c.schluessel).map((c) => c.id).sort());
    for (const id of [...ENGINE_REIHE, ...SCHLUESSEL_REIHE]) expect(cardById(id)).toBeDefined();
  });

  it('erste Partie: 10 Engine-Karten und 2 Kronen; danach waechst es', () => {
    expect(gesperrteKarten(0, 0)).toHaveLength(39 + 14);
    expect(gesperrteKarten(5, 14)).toEqual([]);
    expect(neuFrei({ partien: 0, bosse: 0 }, { partien: 1, bosse: 2 })).toHaveLength(6 + 2);
  });

  it('gesperrte Karten kommen nie ins Angebot', () => {
    const zu = gesperrteKarten(0, 0);
    for (let r = 1; r < 200; r++) {
      for (const o of draftOptions(42, r, 'trophaee', [], zu)) expect(zu).not.toContain(o);
    }
  });
});

describe('Systemkarten', () => {
  it('jede Kennung gibt es, und ohne Systeme bleibt das Angebot voll', async () => {
    const { SYSTEM_KARTEN, systemGesperrt } = await import('../src/core/freischalt');
    for (const ids of Object.values(SYSTEM_KARTEN)) for (const id of ids) expect(cardById(id), id).toBeDefined();
    const zu = [...systemGesperrt([]), ...gesperrteKarten(0, 0)];
    for (const quelle of ['fund', 'belohnung', 'markt', 'gruendung', 'trophaee'] as const) {
      for (let r = 1; r < 60; r++) {
        const o = draftOptions(7, r, quelle, [], zu);
        expect(new Set(o).size, `${quelle} ${r}`).toBe(3);
        for (const id of o) expect(zu).not.toContain(id);
      }
    }
  });
});
