/** Die Saga (core/chronik.ts): eine kleine Erzaehlung aus der Chronik. */

import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/rules/reducer';
import { botsSpielen } from '../src/core/bot';
import { saga } from '../src/core/chronik';
import { redactStateFor } from '../src/core/redact';

describe('Saga', () => {
  it('erzaehlt eine gespielte Partie in ganzen Saetzen', () => {
    const g = createGame(
      [
        { id: 'a', name: 'Hanno' },
        { id: 'b', name: 'Dido' },
      ],
      77,
      88,
      0,
      { haeuser: true, ereignisse: true, rundenLimit: 40 },
    );
    botsSpielen(g, () => true, 20000);
    const text = saga(redactStateFor(g.state, 'a'), 'a');
    expect(text).toMatch(/^Im Fruehling des Jahres 1 zog Hanno unter dem Banner (Karthagos|des |der )/);
    expect(text).toMatch(/schliesst die Chronik/);
    expect(text.split('. ').length).toBeGreaterThanOrEqual(3);
  });
});
