/**
 * Die Kartenleiste: die eigene Engine am Rand der Karte, wie die Joker bei
 * Balatro.
 *
 * Spieltest (Neuling): "Die Engine ist nicht auf dem Bildschirm - die Karten
 * liegen im Menue, und ihre Ausloeser sind nur Zeilen im Protokoll." Jetzt
 * steht jede wirkende Karte als Kaertchen rechts am Rand - Krone oben, dann
 * die Reichskarten, dann die Relikte des Helden. Loest eine aus (kartenLohn),
 * leuchtet sie auf und ihr Lohn steigt daneben auf.
 */

import { useEffect, useState } from 'react';
import { cardById } from '../../core/cards/catalog';
import { RELIKTE } from '../../core/heldenpfad';
import { kartenArt } from './KartenBild';
import { KartenBild, SIPPE_PIX } from './KartenBild';
import type { CSSProperties } from 'react';
import type { KartenBlitz } from '../net/store';

type Platz = { id: string; art: 'krone' | 'karte' | 'relikt'; plus: boolean };

export function KartenLeiste({
  activeCards,
  krone,
  equipment,
  plus,
  zaehler,
  blitze,
  onAbgelaufen,
  onOeffnen,
}: {
  activeCards: readonly string[];
  krone: string | null | undefined;
  equipment: readonly string[];
  plus: readonly string[];
  zaehler: Record<string, number>;
  blitze: readonly KartenBlitz[];
  onAbgelaufen: () => void;
  onOeffnen: (id: string) => void;
}) {
  const [zu, setZu] = useState(false);
  // Die Blitze leben gut zwei Sekunden, dann raeumt die Leiste sie weg.
  useEffect(() => {
    if (blitze.length === 0) return;
    const t = window.setTimeout(onAbgelaufen, 2600);
    return () => window.clearTimeout(t);
  }, [blitze, onAbgelaufen]);

  const plaetze: Platz[] = [
    ...(krone ? [{ id: krone, art: 'krone' as const, plus: plus.includes(krone) }] : []),
    ...activeCards.map((id) => ({ id, art: 'karte' as const, plus: plus.includes(id) })),
    ...equipment.filter((id) => RELIKTE.some((r) => r.id === id)).map((id) => ({ id, art: 'relikt' as const, plus: false })),
  ];
  if (plaetze.length === 0) return null;

  if (zu) {
    return (
      <button className="kl-zu-knopf" title="Deine Karten zeigen" onClick={() => setZu(false)}>
        Karten {plaetze.length}
      </button>
    );
  }

  return (
    <div className="kartenleiste" aria-label="Deine wirkenden Karten">
      <button className="kl-zu" title="Leiste einklappen" onClick={() => setZu(true)}>
        ›
      </button>
      {plaetze.map((p) => {
        const karte = cardById(p.plus ? p.id + '+' : p.id) ?? cardById(p.id);
        if (!karte) return null;
        const sippe = kartenArt(karte).sippe;
        const meine = blitze.filter((b) => b.card === p.id || b.card === p.id + '+');
        const z = zaehler[p.id];
        const stil = { '--sippe': sippe ? SIPPE_PIX[sippe].F : '#a8937a' } as CSSProperties;
        return (
          <button
            key={p.art + p.id}
            className={['kl-karte', `kl-${p.art}`, meine.length > 0 ? 'blitz' : ''].filter(Boolean).join(' ')}
            style={stil}
            title={`${karte.name}${p.plus ? ' (verbessert)' : ''}: ${karte.text}`}
            onClick={() => onOeffnen(p.id)}
          >
            <span className="kl-bild">
              <KartenBild karte={karte} klein />
            </span>
            <span className="kl-name">
              {karte.name}
              {p.plus ? '+' : ''}
            </span>
            {z !== undefined && z > 0 && <span className="kl-zaehler">{z}</span>}
            {meine.map((b, i) => (
              <span key={b.id} className="kl-lohn" style={{ animationDelay: `${i * 0.25}s` }}>
                {b.text}
              </span>
            ))}
          </button>
        );
      })}
    </div>
  );
}
