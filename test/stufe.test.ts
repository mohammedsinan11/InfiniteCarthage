/** Chronikstufen (core/stufe.ts). */

import { describe, it, expect } from 'vitest';
import { MAX_STUFE, STUFE_NAME, istStufe, omenMitStufe } from '../src/core/stufe';
import { gueltigeOmen, omenById } from '../src/core/omen';
import { createGame } from '../src/core/rules/reducer';

describe('Chronikstufen', () => {
  it('Stufe 0 laesst die Omen, wie sie sind', () => {
    expect(omenMitStufe(['reiche_adern', 'zoellner'], 0)).toEqual(['reiche_adern', 'zoellner']);
  });

  it('jede Stufe legt einen Fluch mehr auf, ohne Widerspruch und ohne Doppel', () => {
    for (let n = 1; n <= MAX_STUFE; n++) {
      const o = omenMitStufe(['handelswinde', 'blutmond'], n);
      expect(gueltigeOmen(o)).toEqual(o);
      expect(new Set(o).size).toBe(o.length);
      expect(o.filter((id) => omenById(id)!.art === 'fluch').length).toBeGreaterThanOrEqual(n);
    }
    // Zoellner (Stufe 3) verdraengt Handelswinde.
    expect(omenMitStufe(['handelswinde'], 3)).not.toContain('handelswinde');
  });

  it('Namen und Grenzen', () => {
    expect(STUFE_NAME).toHaveLength(MAX_STUFE + 1);
    expect(istStufe(0)).toBe(true);
    expect(istStufe(MAX_STUFE)).toBe(true);
    expect(istStufe(MAX_STUFE + 1)).toBe(false);
    expect(istStufe(1.5)).toBe(false);
  });

  it('createGame nimmt die Stufe in Omen und Zustand', () => {
    const g = createGame([{ id: 'p0', name: 'S' }], 1, 2, 0, { omens: ['reiche_adern'], stufe: 2 });
    expect(g.state.stufe).toBe(2);
    expect(g.state.omens).toContain('magere_weiden');
    expect(g.state.omens).toContain('dunkle_naechte');
    expect(g.state.omens).toContain('reiche_adern');
  });
});
