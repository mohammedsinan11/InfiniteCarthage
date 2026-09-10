/**
 * Der Wurf als eigener Moment.
 *
 * Wuerfeln ist gerade der Kern des Spiels, taucht in der Oberflaeche aber nur
 * als Zahl in einer Ecke auf. Hier bekommt es den Bildschirm: die Wuerfel
 * rollen sichtbar, landen auf dem Ergebnis und verschwinden wieder.
 *
 * Wichtig fuer spaeter: die Animation ist reine Darstellung. Das Ergebnis
 * faellt im Durable Object und steht schon fest, bevor der erste Wuerfel
 * zuckt - was hier laeuft, ist eine Inszenierung des bereits Entschiedenen.
 * Sonderwuerfel oder andere Augenzahlen aendern spaeter die Regel, nicht
 * diese Datei.
 *
 * Ein Klick ueberspringt das ROLLEN, nicht das ERGEBNIS. Wer hundert Runden
 * spielt, will nicht jedes Mal zusehen - aber wissen, was gefallen ist, will er
 * immer. Frueher schloss der Klick das Fenster sofort, und ein Doppelklick auf
 * "Wuerfeln" (der zweite Klick landet auf diesem Fenster) liess die Augenzahl
 * nie sehen. Jetzt springt der Klick zum Ergebnis; es steht dann wie nach dem
 * normalen Ablauf, und erst ein weiterer Klick schliesst.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { playDiceLand, playDiceRoll } from '../audio';

/** Wie lange die Wuerfel rollen, bevor das Ergebnis steht. */
const ROLL_MS = 850;
/** Wie lange das Ergebnis stehen bleibt, bevor es verschwindet. */
const HOLD_MS = 750;

/** Augen als Punktmuster - Position in einem 3x3-Raster. */
const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

function Die({ value, size = 64 }: { value: number; size?: number }) {
  const pad = size * 0.2;
  const step = (size - 2 * pad) / 2;
  const r = size * 0.085;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="die">
      <rect
        x={2}
        y={2}
        width={size - 4}
        height={size - 4}
        rx={size * 0.12}
        className="die-body"
      />
      {(PIPS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={pad + cx * step} cy={pad + cy * step} r={r} className="die-pip" />
      ))}
    </svg>
  );
}

type Props = {
  /** Das feststehende Ergebnis. */
  dice: [number, number];
  onDone: () => void;
};

export function DiceOverlay({ dice, onDone }: Props) {
  const [shown, setShown] = useState<[number, number]>([1, 1]);
  const [settled, setSettled] = useState(false);
  const fertig = useRef(false);
  const gelandet = useRef(false);
  /** Die laufenden Zeitgeber - das Ueberspringen muss sie anhalten koennen. */
  const zeit = useRef<{ flackern?: number; landen?: number; schliessen?: number }>({});

  const schliessen = useCallback(() => {
    if (fertig.current) return;
    fertig.current = true;
    onDone();
  }, [onDone]);

  /**
   * Das Ergebnis zeigen - aus dem normalen Ablauf wie aus dem Ueberspringen.
   * Beide Wege enden gleich: Augen stehen, Summe steht, HOLD_MS lang.
   */
  const landen = useCallback(() => {
    if (gelandet.current) return;
    gelandet.current = true;
    const z = zeit.current;
    window.clearInterval(z.flackern);
    window.clearTimeout(z.landen);
    setShown(dice);
    setSettled(true);
    playDiceLand();
    window.clearTimeout(z.schliessen);
    z.schliessen = window.setTimeout(schliessen, HOLD_MS);
  }, [dice, schliessen]);

  /** Rollt es noch, springt der Klick zum Ergebnis. Steht es, schliesst er. */
  const klick = () => {
    if (!gelandet.current) landen();
    else schliessen();
  };

  useEffect(() => {
    fertig.current = false;
    gelandet.current = false;
    setSettled(false);
    playDiceRoll(ROLL_MS / 1000);

    const z = zeit.current;
    // Waehrend des Rollens flackern zufaellige Augen - nur Optik.
    z.flackern = window.setInterval(() => {
      setShown([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 70);
    z.landen = window.setTimeout(landen, ROLL_MS);

    return () => {
      window.clearInterval(z.flackern);
      window.clearTimeout(z.landen);
      window.clearTimeout(z.schliessen);
    };
  }, [dice, landen]);

  const summe = shown[0] + shown[1];

  return (
    <div className="dice-overlay" onClick={klick} role="presentation">
      <div className={settled ? 'dice-pair settled' : 'dice-pair'}>
        <Die value={shown[0]} />
        <Die value={shown[1]} />
      </div>
      {/* Die Summe ist das, worauf es ankommt - sie springt heraus und leuchtet. */}
      <div className={settled ? 'dice-sum steht' : 'dice-sum'}>{settled ? summe : ' '}</div>
      <div className="dice-hint">{settled ? 'Klicken zum Schliessen' : 'Klicken zum Ueberspringen'}</div>
    </div>
  );
}
