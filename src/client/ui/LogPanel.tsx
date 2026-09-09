/** Ereignisprotokoll. Neueste Meldung unten, automatisch nachgefuehrt. */

import { useEffect, useRef } from 'react';

export function LogPanel({ log }: { log: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  return (
    <div className="log" ref={ref}>
      {log.length === 0 && (
        <p className="note">
          Noch nichts passiert. Das Protokoll wird nur im Browser gefuehrt und
          beginnt nach einem Neuladen von vorn.
        </p>
      )}
      {log.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}
