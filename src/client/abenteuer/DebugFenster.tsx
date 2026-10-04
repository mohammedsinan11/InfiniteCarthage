/**
 * Das Debugfenster des Abenteuers: Figuren, Waffen und Gegner im laufenden
 * Spiel ausprobieren (Spieltest: "ein kleines Debugfenster, wo ich
 * verschiedene Designs im Spiel testen kann"). Unten in der Mitte, auf- und
 * zuklappbar (auch mit F2). Alles hier ist zum Testen, nicht fuers Spiel.
 */

import { useEffect, useRef, useState } from 'react';
import { FAEHIGKEIT_NAME, GEGENSTAENDE } from '../../abenteuer/regeln';
import type { DebugAktion } from '../../abenteuer/regeln';
import { FIGUREN, SYMBOL, malKachelFigur } from './symbole';
import { Px } from '../ui/KartenPixel';
import { artVon, statZeilen, tippHandler } from './ItemTipp';
import type { Tipp } from './ItemTipp';

export const FIGUR_KEY = 'infinitecarthage.abenteuer.figur';
const OFFEN_KEY = 'infinitecarthage.abenteuer.debug';

/** Die gewaehlte Figur - 'kachel' ist der Kachel-Ritter, 'klassik' der bisherige. */
export function leseFigur(): string {
  try {
    return localStorage.getItem(FIGUR_KEY) ?? 'kachel';
  } catch {
    return 'kachel';
  }
}

/** Ein kleines Bild der Figur fuer die Auswahl. */
function FigurBild({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const d = FIGUREN.find((x) => x.id === id);
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !d) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    malKachelFigur(ctx, c.width / 2, c.height - 2, 3, d, 'steh', 'ruhe', 'schwert', 1, false, null);
  }, [id]);
  return <canvas ref={ref} width={44} height={48} className="ab-debug-bild" />;
}

function Bild({ id }: { id: string }) {
  const karte = SYMBOL[id];
  if (!karte) return null;
  const b = Math.max(...karte.map((z) => z.length));
  return (
    <svg width={26} height={26} viewBox={`0 0 ${b} ${karte.length}`} shapeRendering="crispEdges" aria-hidden>
      <Px karte={karte} />
    </svg>
  );
}

const SCHLEIME: {
  art: Extract<DebugAktion, { t: 'schleim' }>['art'];
  name: string;
}[] = [
  { art: 'normal', name: 'Schleim' },
  { art: 'gross', name: 'Grosser' },
  { art: 'spuck', name: 'Spuck' },
  { art: 'spring', name: 'Spring' },
  { art: 'panzer', name: 'Panzer' },
  { art: 'koenig', name: 'Koenig' },
];

export function DebugFenster({
  figur,
  onFigur,
  waffe,
  onAktion,
  setTipp,
}: {
  figur: string;
  onFigur: (id: string) => void;
  waffe: string | null;
  onAktion: (d: DebugAktion) => void;
  setTipp: (t: Tipp) => void;
}) {
  const [reiter, setReiter] = useState<'test' | 'items'>('test');
  const [offen, setOffen] = useState(() => {
    try {
      return localStorage.getItem(OFFEN_KEY) === 'an';
    } catch {
      return false;
    }
  });
  const umschalten = (neu: boolean) => {
    setOffen(neu);
    try {
      localStorage.setItem(OFFEN_KEY, neu ? 'an' : 'aus');
    } catch {
      // nur fuer jetzt
    }
  };
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setOffen((o) => {
          try {
            localStorage.setItem(OFFEN_KEY, o ? 'aus' : 'an');
          } catch {
            // nur fuer jetzt
          }
          return !o;
        });
      }
    };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, []);

  const waffen = GEGENSTAENDE.filter((g) => g.slot === 'waffe');
  if (!offen) {
    return (
      <button className="ab-debug-zu" onClick={() => umschalten(true)} title="Debugfenster oeffnen (F2)">
        Debug
      </button>
    );
  }
  return (
    <div className="ab-fenster ab-debug" onPointerUp={(e) => e.stopPropagation()}>
      <div className="ab-debug-kopf">
        <span className="ab-titel">Debug (F2)</span>
        <span className="ab-debug-reiter">
          <button className={reiter === 'test' ? 'ab-debug-wahl an' : 'ab-debug-wahl'} onClick={() => setReiter('test')}>
            Testen
          </button>
          <button className={reiter === 'items' ? 'ab-debug-wahl an' : 'ab-debug-wahl'} onClick={() => setReiter('items')}>
            Alle Items
          </button>
        </span>
        <button className="klein" onClick={() => umschalten(false)} title="Schliessen">
          ×
        </button>
      </div>
      {reiter === 'items' && (
        <div className="ab-debug-items">
          {GEGENSTAENDE.map((g) => (
            <div key={g.id} className={g.legendaer ? 'ab-debug-item legendaer' : 'ab-debug-item'} {...tippHandler(g.id, setTipp)}>
              <span className="ab-debug-item-bild">
                <Bild id={g.id} />
              </span>
              <span className="ab-debug-item-text">
                <b>{g.name}</b>
                <small>{artVon(g.id)}</small>
                {statZeilen(g.id).map((z, i) => (
                  <em key={i} className={z.gut === true ? 'gut' : z.gut === false ? 'schlecht' : ''}>
                    {z.text}
                  </em>
                ))}
              </span>
              <button className="ab-debug-wahl" onClick={() => onAktion({ t: 'item', id: g.id })}>
                Anprobieren
              </button>
            </div>
          ))}
        </div>
      )}
      {reiter === 'test' && (
        <>
          <div className="ab-debug-zeile">
            <small>Figur</small>
            <button className={figur === 'klassik' ? 'ab-debug-wahl an' : 'ab-debug-wahl'} onClick={() => onFigur('klassik')} title="Der bisherige Ritter">
              Klassik
            </button>
            {FIGUREN.map((d) => (
              <button key={d.id} className={figur === d.id ? 'ab-debug-wahl an' : 'ab-debug-wahl'} onClick={() => onFigur(d.id)} title={d.name}>
                <FigurBild id={d.id} />
                <span>{d.name}</span>
              </button>
            ))}
          </div>
          <div className="ab-debug-zeile">
            <small>Waffe</small>
            {waffen.map((g) => (
              <button
                key={g.id}
                className={waffe === g.id ? 'ab-debug-wahl an' : 'ab-debug-wahl'}
                onClick={() => onAktion({ t: 'waffe', id: g.id })}
                title={g.text}
              >
                {g.name}
                {g.faehigkeit ? (
                  <em>
                    {' '}
                    {FAEHIGKEIT_NAME[g.faehigkeit]} ({g.ladung})
                  </em>
                ) : null}
              </button>
            ))}
            <button className="ab-debug-wahl" onClick={() => onAktion({ t: 'ladung' })} title="Die Faehigkeit der Waffe sofort ausloesen">
              Ladung voll
            </button>
          </div>
          <div className="ab-debug-zeile">
            <small>Gegner</small>
            {SCHLEIME.map((s) => (
              <button key={s.art} className="ab-debug-wahl" onClick={() => onAktion({ t: 'schleim', art: s.art })}>
                {s.name}
              </button>
            ))}
            <small>Legendaer</small>
            <button className="ab-debug-wahl" onClick={() => onAktion({ t: 'legendaer', id: 'sololeveling' })}>
              Solo-Leveling
            </button>
            <button className="ab-debug-wahl" onClick={() => onAktion({ t: 'legendaer', id: 'herzcontainer' })}>
              Herzcontainer
            </button>
            <button className="ab-debug-wahl" onClick={() => onAktion({ t: 'legendaer', id: 'extraleben' })}>
              Extra-Leben
            </button>
            <button className="ab-debug-wahl" onClick={() => onAktion({ t: 'legendaer', id: 'hermes' })}>
              Hermes
            </button>
            <button className="ab-debug-wahl" onClick={() => onAktion({ t: 'ep' })} title="Erfahrung bis zum naechsten Level">
              Level +1
            </button>
            <small>Sonst</small>
            <button className="ab-debug-wahl" onClick={() => onAktion({ t: 'heilen' })}>
              Leben voll
            </button>
            <button className="ab-debug-wahl" onClick={() => onAktion({ t: 'schritte' })}>
              6 Schritte
            </button>
          </div>
        </>
      )}
    </div>
  );
}
