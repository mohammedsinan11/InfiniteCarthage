/**
 * Ein Ereignis mit Wahl (core/ereignis.ts) als Tafel ueber der Karte.
 *
 * Im Stil der Kartenwahl, aber als Brief statt als Karten: Titel, zwei Saetze
 * Geschichte, darunter die Antworten als Knoepfe. Was man sich nicht leisten
 * kann oder wofuer der Held fehlt, ist ausgegraut - mit dem Grund daneben,
 * statt nur stumm gesperrt.
 */

import type { PublicState } from '../../core/redact';
import { ereignisById } from '../../core/ereignis';
import { wahlHindernis } from '../../core/rules/reducer';
import { SEASON_NAME, seasonOf } from '../../core/season';

export function EreignisTafel({
  state,
  you,
  onWahl,
}: {
  state: PublicState;
  you: string | null;
  onWahl: (i: number) => void;
}) {
  const offen = state.ereignis;
  const e = offen ? ereignisById(offen.id) : undefined;
  if (!offen || !e) return null;
  const meins = offen.player === you;
  const wer = state.players.find((p) => p.id === offen.player)?.name ?? 'Jemand';

  return (
    <div className="draft-overlay ereignis-huelle">
      <div className="ereignis">
        <span className="ereignis-zeit">{SEASON_NAME[seasonOf(state.turn)]} · Ereignis</span>
        <h2>{e.titel}</h2>
        <p className="ereignis-text">{e.text}</p>
        {meins ? (
          <div className="ereignis-wahlen">
            {e.wahlen.map((w, i) => {
              const grund = wahlHindernis(state, offen.player, w.folge, w.brauchtHeld ?? false);
              return (
                <button key={i} disabled={grund !== null} title={grund ?? undefined} onClick={() => onWahl(i)}>
                  {w.text}
                  {grund && <span className="ereignis-grund">{grund}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="note">{wer} entscheidet...</p>
        )}
      </div>
    </div>
  );
}
