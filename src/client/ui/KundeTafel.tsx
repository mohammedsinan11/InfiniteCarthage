/**
 * Die Kunde aus dem Land (core/kunde.ts) als Brief ueber der Karte - im Stil
 * der Ereignisse, aber ohne Wahl: zum Wechsel der Jahreszeit erzaehlt der
 * Chronist, was geschah. Ein Klick schliesst ihn; nachlesen laesst er sich
 * beim Chronisten im Menue.
 */

import type { Bericht } from '../../core/kunde';
import type { Season } from '../../core/season';

/** Der Genitiv: Ende des Fruehlings, des Herbstes. */
const DES: Record<Season, string> = { spring: 'Fruehlings', summer: 'Sommers', autumn: 'Herbstes', winter: 'Winters' };

export function KundeTafel({ bericht, onZu }: { bericht: Bericht; onZu: () => void }) {
  return (
    <div className="draft-overlay ereignis-huelle kunde-huelle" onClick={onZu}>
      <div className="ereignis kunde" onClick={(e) => e.stopPropagation()}>
        <span className="ereignis-zeit">
          Ende des {DES[bericht.saison]} · Jahr {bericht.jahr}
        </span>
        <h2>Kunde aus dem Land</h2>
        <ul className="kunde-zeilen">
          {bericht.zeilen.map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
        <div className="ereignis-wahlen">
          <button onClick={onZu}>Weiter</button>
        </div>
      </div>
    </div>
  );
}
