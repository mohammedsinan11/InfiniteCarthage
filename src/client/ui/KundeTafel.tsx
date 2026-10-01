/**
 * Die Kunde aus dem Land (core/kunde.ts) als Brief ueber der Karte - im Stil
 * der Ereignisse, aber ohne Wahl: zum Wechsel der Jahreszeit erzaehlt der
 * Chronist, was geschah. Ein Klick schliesst ihn; nachlesen laesst er sich
 * im Menue unter Chronik.
 */

import type { Bericht } from '../../core/kunde';
import type { Season } from '../../core/season';

/** Der Genitiv: Ende des Fruehlings, des Herbstes. */
/** Hoechstens so viele Zeilen im Brief - der Rest steht beim Chronisten (Spieltest 5: zu viel Text). */
const KURZ = 3;

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
          {bericht.zeilen.slice(0, KURZ).map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
        {bericht.zeilen.length > KURZ && (
          <p className="kunde-mehr">
            Und {bericht.zeilen.length - KURZ} weitere Nachrichten - im Menue unter Chronik.
          </p>
        )}
        <div className="ereignis-wahlen">
          <button onClick={onZu}>Weiter</button>
        </div>
      </div>
    </div>
  );
}
