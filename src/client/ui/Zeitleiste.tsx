/**
 * Die Zeitleiste: die naechsten Runden auf einen Blick, direkt ueber der
 * Bauleiste (OVERHAUL.md, Abschnitt 2).
 *
 * Nacht, grosse Runde mit Raubzuegen und Tribut, Jahreszeitenwechsel, das Ende
 * des Vorhabens und der Partie, dazu ein Raubzug, der auf die eigenen
 * Siedlungen zuhaelt. Alles aus Zugnummer und oeffentlichem Stand - nichts
 * davon ist geheim, es war nur schwer zu sehen (Spieltests: "kam ohne
 * Vorwarnung"). Frueher stand eine kurze Liste im Menue; auf dem Handy ist
 * das Menue meist zu, die Leiste nicht.
 */

import { ROUNDS_PER_BIG_ROUND, SEASON_NAME, roundOf, roundsLeftInSeason, seasonOf } from '../../core/season';
import { istNacht } from '../../core/zeit';

const WEITE = 6;

type Marke = { zeichen: string; text: string; art: 'nacht' | 'gross' | 'saison' | 'vorhaben' | 'ende' | 'raub' };

export function Zeitleiste({
  turn,
  rundenLimit,
  vorhabenBis,
  raubIn,
}: {
  turn: number;
  rundenLimit: number | null;
  /** Letzte Runde des laufenden Vorhabens (core/vorhaben.ts). */
  vorhabenBis: number | null;
  /** In wie vielen Runden der naechste Raubzug eintrifft - aus der Raubzugwarnung. */
  raubIn: number | null;
}) {
  const felder = Array.from({ length: WEITE }, (_, i) => {
    const t = turn + i;
    const marken: Marke[] = [];
    if (i > 0 && (Math.max(1, t) - 1) % ROUNDS_PER_BIG_ROUND === 0) {
      marken.push({ zeichen: '⚔', text: 'Grosse Runde: Raubzuege brechen auf, Tribut wird faellig', art: 'gross' });
    }
    if (istNacht(t) && (i === 0 || !istNacht(t - 1))) marken.push({ zeichen: '☾', text: 'Die Nacht: Horden und Schleime', art: 'nacht' });
    if (i > 0 && roundsLeftInSeason(turn) === i) {
      marken.push({ zeichen: '❧', text: `${SEASON_NAME[seasonOf(t)]} beginnt`, art: 'saison' });
    }
    if (vorhabenBis !== null && t === vorhabenBis) marken.push({ zeichen: '⚑', text: 'Letzte Runde fuer dein Vorhaben', art: 'vorhaben' });
    if (raubIn !== null && i === raubIn) marken.push({ zeichen: '!', text: 'Ein Raubzug erreicht deine Siedlungen', art: 'raub' });
    if (rundenLimit !== null && t === rundenLimit) marken.push({ zeichen: '⌛', text: 'Die letzte Runde der Partie', art: 'ende' });
    return { t, nacht: istNacht(t), marken };
  });
  return (
    <div className="zeitleiste" aria-label="Die naechsten Runden">
      {felder.map((f, i) => (
        <div
          key={f.t}
          className={['zl-feld', i === 0 ? 'jetzt' : '', f.nacht ? 'nacht' : ''].filter(Boolean).join(' ')}
          title={[i === 0 ? `Runde ${roundOf(f.t)} (jetzt)` : `Runde ${roundOf(f.t)}`, ...f.marken.map((m) => m.text)].join('\n')}
        >
          <span className="zl-runde">{i === 0 ? 'jetzt' : `+${i}`}</span>
          <span className="zl-marken">
            {f.marken.map((m) => (
              <i key={m.art} className={`zl-${m.art}`}>
                {m.zeichen}
              </i>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
