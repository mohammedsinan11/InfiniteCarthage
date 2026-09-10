/**
 * Die Kartenwahl.
 *
 * Drei Karten, eine wird genommen, zwei verschwinden - wie im Roguelike. Das
 * Overlay verdeckt das Brett mit Absicht: die Wahl ist der Moment, und sie
 * soll sich als solcher anfuehlen.
 *
 * Kein Abbrechen. Wer nicht waehlt, blockiert die Runde, und eine Wahl ohne
 * Folgen waere keine.
 */

import { useEffect, useState } from 'react';
import { cardById } from '../../core/cards/catalog';
import type { Rarity } from '../../core/cards/types';
import { playChime, playGain } from '../audio';

const RARITY_NAME: Record<Rarity, string> = {
  gewoehnlich: 'gewoehnlich',
  ungewoehnlich: 'ungewoehnlich',
  selten: 'selten',
  episch: 'episch',
  legendaer: 'legendaer',
};

export function CardDraft({
  options,
  darfWaehlen,
  onChoose,
}: {
  options: string[];
  /** Nur der Spieler am Zug waehlt - die anderen sehen zu. */
  darfWaehlen: boolean;
  onChoose: (card: string) => void;
}) {
  const [genommen, setGenommen] = useState<string | null>(null);

  useEffect(() => {
    playChime();
  }, []);

  return (
    <div className="draft-overlay">
      <h2 className="draft-titel">Ein Fund</h2>
      <p className="draft-sub">
        {darfWaehlen
          ? 'Waehle eine Karte. Die anderen beiden verfallen.'
          : 'Der Spieler am Zug waehlt.'}
      </p>

      <div className="draft-karten">
        {options.map((id) => {
          const karte = cardById(id);
          if (!karte) return null;
          const gewaehlt = genommen === id;
          return (
            <button
              key={id}
              className={[
                'draft-karte',
                `selt-${karte.rarity}`,
                gewaehlt ? 'gewaehlt' : '',
                genommen && !gewaehlt ? 'verworfen' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!darfWaehlen || genommen !== null}
              onClick={() => {
                if (genommen !== null) return;
                setGenommen(id);
                playGain();
                // Kurz stehen lassen, damit man sieht, was man genommen hat.
                window.setTimeout(() => onChoose(id), 420);
              }}
            >
              <span className="draft-selt">{RARITY_NAME[karte.rarity]}</span>
              <span className="draft-name">{karte.name}</span>
              <span className="draft-text">{karte.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
