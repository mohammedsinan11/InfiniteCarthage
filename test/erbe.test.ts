/** Dynastie: Erbstuecke, Familienart, Spuren in der Tageswelt. */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { familienart, freieErbstuecke } from '../src/core/erbe';
import { istBestenEintrag } from '../src/core/tages';

describe('Erbstuecke', () => {
  it('wirken allein in gewoehnlichen Partien', () => {
    const g = createGame([{ id: 'p0', name: 'S', erbstueck: 'kriegsbanner' }], 1, 2, 15, { erbeAn: true });
    expect(g.state.players[0]!.ruhm).toBe(2);
    expect(g.state.players[0]!.erbstueck).toBe('kriegsbanner');
  });

  it('nicht gegen Mitspieler, nicht im Szenario, nicht ohne Freigabe', () => {
    const zwei = createGame([{ id: 'a', name: 'A', erbstueck: 'kriegsbanner' }, { id: 'b', name: 'B' }], 1, 2, 15, { erbeAn: true });
    expect(zwei.state.players[0]!.ruhm).toBe(0);
    const sz = createGame([{ id: 'p0', name: 'S', erbstueck: 'kriegsbanner' }], 1, 2, 0, { erbeAn: true, szenario: 'gruendung' });
    expect(sz.state.players[0]!.ruhm).toBe(0);
    const aus = createGame([{ id: 'p0', name: 'S', erbstueck: 'kriegsbanner' }], 1, 2, 15, {});
    expect(aus.state.players[0]!.ruhm).toBe(0);
    const falsch = createGame([{ id: 'p0', name: 'S', erbstueck: 'zauberstab' }], 1, 2, 15, { erbeAn: true });
    expect(falsch.state.players[0]!.erbstueck).toBeUndefined();
  });

  it('eine Partie schaltet frei, was sie verdient hat', () => {
    expect(freieErbstuecke({ staedte: 1, lager: 0, handel: 12, ruinen: 1, auftraege: 1, wunder: 0 })).toEqual([
      'grundstein',
      'handelssiegel',
      'ahnenkarte',
      'andenken',
    ]);
  });

  it('die Familienart folgt den Taten der Generationen', () => {
    expect(familienart([{ staedte: 0, lager: 3, handel: 4, ruinen: 0 }])).toBe('krieger');
    expect(familienart([{ staedte: 4, lager: 0, handel: 4, ruinen: 1 }])).toBe('baumeister');
    expect(familienart([])).toBeNull();
  });
});

describe('Spuren in der Tageswelt', () => {
  it('Eintraege duerfen Orte und Helden tragen - in Grenzen', () => {
    const e = { name: 'A', wertung: 10, punkte: 1, ruhm: 0, code: 'X', zeit: 1 };
    expect(istBestenEintrag({ ...e, orte: [[1, 2]], held: 'Alde der Kuehne' })).toBe(true);
    expect(istBestenEintrag({ ...e, orte: [[1, 2], [1, 2], [1, 2], [1, 2]] })).toBe(false);
    expect(istBestenEintrag({ ...e, orte: [['a', 2]] })).toBe(false);
  });
});
