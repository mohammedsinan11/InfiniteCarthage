/**
 * Das Inventar: was man gesammelt hat - ein Knopf rechts neben dem Wuerfel.
 *
 * Getrennt von der Hand, weil es keine Rohstoffe sind - man baut nichts damit,
 * man sammelt es (core/state.ts, Player.inventar). Der Knopf zeigt eine Truhe
 * und die Gesamtzahl; ein Klick klappt die Tafel nach oben auf, eine Zeile je
 * Ding. Ist nichts da, bleibt der Knopf stehen - sonst waere nicht zu sehen,
 * dass es ihn gibt. PLATZHALTER-Gestaltung (ASSETS.md).
 */

import { useState } from 'react';

/** Eine Truhe mit Beschlag und Schloss. PLATZHALTER (ASSETS.md). */
function TruhenIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 6 L4 3 H12 L14 6 V13 H2 Z" fill="currentColor" opacity="0.9" />
      <path d="M2 6 H14" stroke="#21170a" strokeWidth="1" />
      <rect x="7" y="7" width="2" height="3" fill="#21170a" />
    </svg>
  );
}

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
        title={offen ? 'Inventar schliessen' : 'Inventar: was du gesammelt hast'}
        aria-expanded={offen}
        onClick={() => setOffen((a) => !a)}
      >
        <span className="inventar-truhe" aria-hidden>
          <TruhenIcon />
        </span>
        <span className="inventar-zahl">{gesamt}</span>
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
