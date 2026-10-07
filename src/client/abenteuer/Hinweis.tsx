/**
 * Hinweise fuer den Einstieg: kurze Tipps, je einer, genau dann, wenn sie
 * gebraucht werden - und jeder nur einmal (im Browser gemerkt).
 *
 * Spieltest: "Ladung, Pentagramm-Formen, Jaeger, Autoroll, wann Warten heilt -
 * nichts davon wird erklaert."
 */

import { useState } from 'react';
import { faehigkeitBereit } from '../../abenteuer/regeln';
import type { Abenteuer } from '../../abenteuer/regeln';
import { hexDistance as hexDistanceZu } from '../../core/coords';

const GESEHEN = 'infinitecarthage.abenteuer.hinweise';

type Tipp = { id: string; wann: (a: Abenteuer) => boolean; text: string };

const TIPPS: readonly Tipp[] = [
  { id: 'wuerfeln', wann: (a) => a.phase === 'wuerfeln' && a.zug === 1, text: 'Wuerfle mit Enter (oder tippe die Karte an). Die Augen sind deine Schritte in diesem Zug.' },
  { id: 'laufen', wann: (a) => a.phase === 'ziehen' && a.zug === 1, text: 'Laufe mit Q E A D Z X (die sechs Nachbarfelder) oder klicke ein Feld an. S wartet einen Schritt. Jeder Schritt laesst auch die Gegner ziehen.' },
  {
    id: 'ziel',
    wann: (a) => a.zug >= 2 && a.phase === 'wuerfeln',
    text: 'Dein Ziel: drei Akte. Erlege Gegner, bis der Boss des Akts erwacht (Zaehler unter der Karte). Der dritte Boss ist der Endboss.',
  },
  {
    id: 'rot',
    wann: (a) => a.schleime.some((s) => (s.angriff || s.flaeche) && hexDistanceZu(s, a.pos) <= 4),
    text: 'Rot = angesagter Angriff! Er trifft erst im naechsten Takt. Geh vom roten Feld - oder schlag vorher zu, indem du in den Gegner laeufst.',
  },
  { id: 'faehigkeit', wann: (a) => faehigkeitBereit(a), text: 'Deine Waffe ist voll geladen! Druecke 1 (oder den runden Knopf unten), um ihre Faehigkeit auszuloesen.' },
  { id: 'wenig', wann: (a) => a.leben <= 2 && a.phase !== 'tot', text: 'Wenig Leben! Kraeuter im Inventar heilen (antippen). Wartest du (S), ohne dass ein Gegner nah ist, bekommst du einmal je Zug +1 Leben.' },
  {
    id: 'leute',
    wann: (a) => (a.orte ?? []).some((o) => hexDistanceZu(o, a.pos) <= 2),
    text: 'Laufe in den Haendler, um Beute zu verkaufen und einzukaufen - oder in den Werber, um Soeldner anzuheuern.',
  },
  { id: 'akt2', wann: (a) => (a.akt ?? 1) >= 2, text: 'Akt 2! Die Gegner werden zaeher, golden umrandete Elite-Gegner lassen Gold fallen. Sieh dich beim Haendler nach besserer Ausruestung um.' },
];

function gesehen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(GESEHEN) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function Hinweis({ a }: { a: Abenteuer }) {
  const [weg, setWeg] = useState<string[]>(gesehen);
  const tipp = TIPPS.find((t) => !weg.includes(t.id) && t.wann(a));
  if (!tipp || a.wahl || a.laden != null || a.phase === 'tot' || a.phase === 'sieg') return null;
  const ok = () => {
    const neu = [...weg, tipp.id];
    setWeg(neu);
    try {
      localStorage.setItem(GESEHEN, JSON.stringify(neu));
    } catch {
      // ohne Speicher nur fuer jetzt
    }
  };
  return (
    <div className="ab-hinweis" role="note">
      <span>{tipp.text}</span>
      <button className="klein" onClick={ok}>
        Verstanden
      </button>
    </div>
  );
}
