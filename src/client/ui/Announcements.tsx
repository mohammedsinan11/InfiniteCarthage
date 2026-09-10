/**
 * Meldungen, die vom linken Rand hereinfliegen.
 *
 * Warum ueberhaupt: vieles passiert bisher stumm. Der Raeuber zieht um, eine
 * Jahreszeit wechselt, jemand wird bestohlen - und man merkt es nur, wenn man
 * genau hinsieht. Eine Meldung, die sich bewegt, faengt den Blick, ohne den
 * Spielfluss zu unterbrechen.
 *
 * Sie liegen als Stapel untereinander und verschwinden von selbst. Ein
 * Ereignis, das keiner Handlung bedarf, soll auch keine verlangen - deshalb
 * kein Wegklicken, nur eine Frist.
 */

import { useEffect } from 'react';
import type { Announcement } from '../net/store';

/**
 * Wie lange eine Meldung stehen bleibt, bevor sie verschwindet.
 *
 * Erst 3,2 Sekunden - zu kurz: wer gerade auf die Karte schaute, sah nur noch
 * etwas hinausfliegen. Die Ausblendung in styles.css (meldung-raus) muss mit
 * dieser Zahl uebereinstimmen, sonst verschwindet sie optisch, bevor sie aus
 * dem Stapel faellt, oder umgekehrt.
 */
const DAUER_MS = 6500;

function Eine({ a, onDone }: { a: Announcement; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDone(a.id), DAUER_MS);
    return () => window.clearTimeout(t);
  }, [a.id, onDone]);

  return <div className={`meldung meldung-${a.kind}`}>{a.text}</div>;
}

export function Announcements({
  items,
  onDone,
}: {
  items: Announcement[];
  onDone: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="meldungen">
      {items.map((a) => (
        <Eine key={a.id} a={a} onDone={onDone} />
      ))}
    </div>
  );
}
