/**
 * Hinweise fuer den Einstieg: kurze Tipps, je einer, genau dann, wenn sie
 * gebraucht werden - und jeder nur einmal (im Browser gemerkt).
 *
 * Spieltest: "Ladung, Pentagramm-Formen, Jaeger, Autoroll, wann Warten heilt -
 * nichts davon wird erklaert."
 */

import { useEffect, useState } from 'react';
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
  {
    id: 'trefferzahl',
    wann: (a) => a.phase === 'ziehen' && a.schleime.some((s) => hexDistanceZu(s, a.pos) === 1),
    text: 'Die Zahl ueber dem Gegner (z. B. 3+) zeigt, ab welcher Augenzahl dein Hieb trifft - eine 1 verfehlt immer. Lauf in ihn hinein, um zuzuschlagen. Schlaegt er ins Leere, taumelt er (Sterne): freie Hiebe!',
  },
  {
    id: 'fokus',
    wann: (a) => a.zug >= 3 && a.schleime.some((s) => hexDistanceZu(s, a.pos) <= 2),
    text: 'Tipp: Warten (S) sammelt Fokus (bis 3, kleine Flammen ueber dir). Dein naechster Hieb bekommt ihn auf den Wurf - mit vollem Fokus macht er +1 Schaden. Gehen bricht den Fokus.',
  },
  { id: 'faehigkeit', wann: (a) => faehigkeitBereit(a), text: 'Deine Waffe ist voll geladen! Druecke 1 (oder den runden Knopf unten), um ihre Faehigkeit auszuloesen.' },
  {
    id: 'wenig',
    wann: (a) => a.leben <= 2 && a.phase !== 'tot',
    text: 'Wenig Leben! Geh auf Abstand zu den Gegnern: Wartest du (S), ohne dass ein Gegner nah ist, bekommst du einmal je Zug +1 Leben. Hast du Kraeuter, heilt H (oder der rote Knopf unten).',
  },
  {
    id: 'altar',
    wann: (a) => (a.orte ?? []).some((o) => o.art === 'altar' && !o.benutzt && hexDistanceZu(o, a.pos) <= 3),
    text: 'Ein Altar! Lauf hinein: opfere ein Herz oder Gold fuer eine Belohnung - oder fordere ihn heraus (volles Leben, aber Gegner).',
  },
  {
    id: 'leute',
    wann: (a) => (a.orte ?? []).some((o) => (o.art === 'haendler' || o.art === 'werber') && hexDistanceZu(o, a.pos) <= 2),
    text: 'Laufe in den Haendler, um Beute zu verkaufen und einzukaufen - oder in den Werber, um Soeldner anzuheuern.',
  },
  {
    id: 'ereignis',
    wann: (a) => (a.orte ?? []).some((o) => o.art === 'ereignis' && !o.benutzt && hexDistanceZu(o, a.pos) <= 3),
    text: 'Ein goldenes "?" ist eine Begegnung: lauf hinein und entscheide - Belohnung oder Risiko. Jede gibt es nur einmal.',
  },
  { id: 'akt2', wann: (a) => (a.akt ?? 1) >= 2, text: 'Akt 2! Die Gegner werden zaeher, golden umrandete Elite-Gegner lassen Gold fallen. Beim Haendler schaerft der Schmied deine Waffe. Tipp: im Wald hast du +1 Abwehr, auf Huegeln +1 Angriff.' },
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
  const merke = (ids: string[]) => {
    const neu = [...new Set([...weg, ...ids])];
    if (neu.length === weg.length) return;
    setWeg(neu);
    try {
      localStorage.setItem(GESEHEN, JSON.stringify(neu));
    } catch {
      // ohne Speicher nur fuer jetzt
    }
  };
  // Wer einen Laden schon geoeffnet hat, braucht den Tipp dazu nicht mehr (Spieltest 13: "kam zu spaet").
  const offenArt = a.laden != null ? (a.orte ?? []).find((o) => o.id === a.laden)?.art : undefined;
  useEffect(() => {
    if (offenArt === 'altar') merke(['altar']);
    else if (offenArt) merke(['leute']);
  });
  const tipp = TIPPS.find((t) => !weg.includes(t.id) && t.wann(a));
  if (!tipp || a.wahl || a.laden != null || a.phase === 'tot' || a.phase === 'sieg') return null;
  const ok = () => merke([tipp.id]);
  // Erfahrene Spieler schalten alle Tipps auf einmal ab.
  const alleAus = () => merke(TIPPS.map((t) => t.id));
  return (
    <div className="ab-hinweis" role="note">
      <span>{tipp.text}</span>
      <button className="klein" onClick={ok}>
        Verstanden
      </button>
      <button className="klein ab-hinweis-aus" onClick={alleAus} title="Keine Tipps mehr zeigen">
        Tipps aus
      </button>
    </div>
  );
}
