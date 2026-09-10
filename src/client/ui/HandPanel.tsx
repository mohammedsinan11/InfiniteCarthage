/**
 * Die eigene Hand als Kartenblatt unten links.
 *
 * Fremde Haende gibt es hier nicht - der Server sendet sie gar nicht erst.
 *
 * Die Karten sind bewusst gross genug, dass man die Sorte am Bild erkennt
 * und nicht am Wort darunter lesen muss. Ein erster Entwurf war halb so
 * gross; dort liessen sich Getreide und Erz auf einen Blick nicht
 * unterscheiden, und genau das ist der Zweck einer Handkarte.
 *
 * Karten mit Bestand null bleiben sichtbar, nur blass. Wer sie ausblendet,
 * laesst die Leiste bei jedem Wurf springen, und man verliert die feste
 * Reihenfolge, an der sich das Auge festhaelt.
 */

import { useEffect, useRef, useState } from 'react';
import { RESOURCES } from '../../core/types';
import type { Resource } from '../../core/types';
import type { Hand } from '../../core/state';
import { resourceName } from '../log';
import { ResourceCard } from './ResourceIcon';

export function HandPanel({ hand }: { hand: Hand }) {
  const total = RESOURCES.reduce((n, r) => n + hand[r], 0);

  /*
   * Welche Zahl ist gerade gestiegen?
   *
   * Nur dann springt sie kurz - genau in dem Moment, in dem die geflogene
   * Karte ankommt. Ohne diesen Vergleich muesste die Hand wissen, was
   * unterwegs ist; so genuegt ihr, den eigenen Bestand zu beobachten.
   */
  const vorher = useRef<Hand | null>(null);
  const [gestiegen, setGestiegen] = useState<Set<Resource>>(new Set());

  useEffect(() => {
    const alt = vorher.current;
    vorher.current = { ...hand };
    if (!alt) return;
    const neu = new Set(RESOURCES.filter((r) => hand[r] > alt[r]));
    if (neu.size === 0) return;
    setGestiegen(neu);
    const t = window.setTimeout(() => setGestiegen(new Set()), 450);
    return () => window.clearTimeout(t);
  }, [hand]);

  return (
    <div className="hand" title={`${total} Karten insgesamt`}>
      {RESOURCES.map((r) => (
        <div
          key={r}
          data-res={r}
          className={[
            'hand-card',
            hand[r] === 0 ? 'leer' : '',
            gestiegen.has(r) ? 'zugewinn' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={`${resourceName(r)}: ${hand[r]}`}
        >
          <ResourceCard r={r} size={2.6} />
          <span className="hand-zahl">{hand[r]}</span>
        </div>
      ))}
    </div>
  );
}
