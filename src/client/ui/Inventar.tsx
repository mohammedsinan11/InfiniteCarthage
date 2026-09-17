/**
 * Das Inventar: was man gesammelt hat, rechts am Rand zum Ausklappen.
 *
 * Getrennt von der Hand, weil es keine Rohstoffe sind - man baut nichts damit,
 * man sammelt es (core/state.ts, Player.inventar). Eingeklappt steht dort nur
 * ein Beutel mit der Gesamtzahl; ausgeklappt eine Zeile je Ding. Ist nichts
 * da, bleibt der Beutel leer, verschwindet aber nicht - sonst waere nicht zu
 * sehen, dass es ihn gibt. PLATZHALTER-Gestaltung (ASSETS.md).
 */

import { useState } from 'react';

/** Wie ein Ding heisst und aussieht. Spaeter kommen mehr dazu. */
const DINGE: Record<string, { name: string; zeichen: string; was: string }> = {
  gelee: {
    name: 'Gelee',
    zeichen: '◍',
    was: 'Von erschlagenen Schleimen. Wofuer es gut ist, zeigt sich noch.',
  },
};

const beschreibe = (id: string) => DINGE[id] ?? { name: id, zeichen: '?', was: '' };

export function Inventar({ inventar }: { inventar: Readonly<Record<string, number>> }) {
  const [offen, setOffen] = useState(false);
  const zeilen = Object.entries(inventar)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (beschreibe(a).name < beschreibe(b).name ? -1 : 1));
  const gesamt = zeilen.reduce((n, [, anzahl]) => n + anzahl, 0);

  return (
    <div className={offen ? 'inventar offen' : 'inventar'}>
      <button
        className="inventar-griff"
        title={offen ? 'Inventar einklappen' : 'Inventar ausklappen'}
        aria-expanded={offen}
        onClick={() => setOffen((a) => !a)}
      >
        <span className="inventar-beutel" aria-hidden>
          ⛁
        </span>
        {gesamt > 0 && <span className="inventar-zahl">{gesamt}</span>}
      </button>
      {offen && (
        <div className="inventar-tafel">
          <div className="inventar-titel">Inventar</div>
          {zeilen.length === 0 && <div className="inventar-leer">Noch nichts gesammelt.</div>}
          {zeilen.map(([id, anzahl]) => {
            const d = beschreibe(id);
            return (
              <div key={id} className="inventar-zeile" title={d.was}>
                <span className="inventar-zeichen" aria-hidden>
                  {d.zeichen}
                </span>
                <span className="inventar-name">{d.name}</span>
                <span className="inventar-anzahl">{anzahl}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
