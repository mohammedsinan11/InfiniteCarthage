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
 *
 * SCHMAL. Auf dem Handy nahm das Kartenblatt ueber der Aktionsleiste ein
 * Viertel der Karte weg. Eingeklappt ist die Hand eine Zahlenleiste - fuenf
 * kleine Sinnbilder mit ihrer Anzahl. Ein Tipp klappt sie auf und wieder zu;
 * die Wahl bleibt gespeichert. Auf schmalen Bildschirmen beginnt sie schmal.
 */

import { useEffect, useRef, useState } from 'react';
import { RESOURCES } from '../../core/types';
import type { Resource } from '../../core/types';
import type { Hand } from '../../core/state';
import { resourceName } from '../log';
import { ResourceCard, ResourceGlyph } from './ResourceIcon';

const SCHMAL_KEY = 'infinitecarthage.handschmal';

function schmalAnfangs(): boolean {
  try {
    const v = localStorage.getItem(SCHMAL_KEY);
    if (v === 'schmal') return true;
    if (v === 'breit') return false;
  } catch {
    // Privater Modus - dann nach Bildschirmbreite.
  }
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
}

export function HandPanel({ hand }: { hand: Hand }) {
  const total = RESOURCES.reduce((n, r) => n + hand[r], 0);
  const [schmal, setSchmal] = useState(schmalAnfangs);
  const umschalten = (neu: boolean) => {
    setSchmal(neu);
    try {
      localStorage.setItem(SCHMAL_KEY, neu ? 'schmal' : 'breit');
    } catch {
      // nur fuer diese Sitzung
    }
  };

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

  if (schmal) {
    return (
      <button
        className="hand hand-schmal"
        title={`${total} Karten - antippen zum Aufklappen`}
        onClick={() => umschalten(false)}
      >
        {RESOURCES.map((r) => (
          <span
            key={r}
            data-res={r}
            className={['hand-mini', hand[r] === 0 ? 'leer' : '', gestiegen.has(r) ? 'zugewinn' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden="true">
              <ResourceGlyph r={r} />
            </svg>
            <b>{hand[r]}</b>
          </span>
        ))}
      </button>
    );
  }

  return (
    /*
      Das ganze Blatt klappt ein, nicht nur das kleine Minuszeichen: auf dem
      Handy war der Knopf kaum zu treffen. Eingeklappt ist es ohnehin schon
      als Ganzes anzutippen - jetzt in beide Richtungen gleich.
    */
    <div
      className="hand hand-breit"
      role="button"
      tabIndex={0}
      title={`${total} Karten insgesamt - antippen zum Einklappen`}
      onClick={() => umschalten(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') umschalten(true);
      }}
    >
      <button className="hand-zu" title="Hand einklappen" onClick={() => umschalten(true)}>
        –
      </button>
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
