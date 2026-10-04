/**
 * Die erste Wahl: Abenteuer oder Strategie.
 *
 * Strategie ist das bisherige Spiel (Home, Lobby, Game). Abenteuer ist ein
 * eigener Modus (client/abenteuer) auf derselben Welt. Die Wahl merkt sich der
 * Browser; zurueck geht es ueber "‹ Modus" in beiden.
 */

import { Px } from '../ui/KartenPixel';
import { SYMBOL } from '../abenteuer/symbole';
import { KRONE } from '../ui/KartenPixel';

export type Modus = 'abenteuer' | 'strategie';

export const MODUS_KEY = 'infinitecarthage.modus';

export function leseModus(): Modus | null {
  try {
    const m = localStorage.getItem(MODUS_KEY);
    return m === 'abenteuer' || m === 'strategie' ? m : null;
  } catch {
    return null;
  }
}

export function merkeModus(m: Modus | null): void {
  try {
    if (m) localStorage.setItem(MODUS_KEY, m);
    else localStorage.removeItem(MODUS_KEY);
  } catch {
    // Privater Modus - dann nur fuer diese Sitzung.
  }
}

function Bild({ karte }: { karte: readonly string[] }) {
  const b = Math.max(...karte.map((z) => z.length));
  return (
    <svg width={56} height={56} viewBox={`0 0 ${b} ${karte.length}`} shapeRendering="crispEdges" aria-hidden>
      <Px karte={karte} />
    </svg>
  );
}

export function ModusWahl({ onWahl }: { onWahl: (m: Modus) => void }) {
  return (
    <div className="home">
      <div className="home-card modus-karte">
        <h1>InfiniteCarthage</h1>
        <p className="note">Wie willst du spielen?</p>
        <div className="modus-wahl">
          <button className="modus-knopf" onClick={() => onWahl('abenteuer')}>
            <Bild karte={SYMBOL['schwert']!} />
            <b>Abenteuer</b>
            <span>Ein Ritter, ein Wuerfel, die weite Welt. Ziehe umher, sammle Schaetze, erschlage Schleime.</span>
          </button>
          <button className="modus-knopf" onClick={() => onWahl('strategie')}>
            <Bild karte={KRONE} />
            <b>Strategie</b>
            <span>Baue ein Reich: Doerfer, Strassen, Karten, drei Akte mit Bossen - allein, mit Bots oder Freunden.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
