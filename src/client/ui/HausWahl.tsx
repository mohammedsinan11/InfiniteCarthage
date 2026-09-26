/**
 * Die Hauswahl vor dem Aufbau (core/haus.ts): drei Haeuser, eines nehmen.
 *
 * Aussehen wie die Kartenwahl - man kennt die Geste schon. Jede Tafel sagt in
 * je einem Satz, was das Haus kann, was es kostet und wie man es spielt; das
 * Letzte ist fuer Einsteiger, die noch nicht wissen, was "3:1" bedeutet.
 *
 * Gewaehlt wird gleichzeitig. Wer fertig ist, sieht, auf wen noch gewartet wird.
 */

import { useState } from 'react';
import type { PublicState } from '../../core/redact';
import { hausById } from '../../core/haus';
import { playerColor } from '../theme';

export function HausWahl({
  state,
  you,
  onChoose,
}: {
  state: PublicState;
  you: string | null;
  onChoose: (haus: string) => void;
}) {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const me = state.players.find((p) => p.id === you);
  const angebot = (you && state.hausAngebot[you]) || [];
  const fertig = !!me?.haus || gewaehlt !== null;
  const warten = state.players.filter((p) => !p.haus && p.id !== you);

  return (
    <div className="draft-overlay haus-wahl">
      <h2 className="draft-titel">Waehle dein Haus</h2>
      <p className="draft-sub">
        {fertig
          ? warten.length > 0
            ? `Warte auf ${warten.map((p) => p.name).join(', ')}.`
            : 'Gleich geht es los.'
          : 'Jedes Haus hat eine Staerke und eine Schwaeche. Keines ist falsch.'}
      </p>
      <div className="draft-karten">
        {angebot.map((id) => {
          const h = hausById(id);
          if (!h) return null;
          const meins = (me?.haus ?? gewaehlt) === id;
          return (
            <div key={id} className={fertig && !meins ? 'draft-platz verworfen' : 'draft-platz'}>
              <button
                className={meins ? 'draft-karte haus-karte gewaehlt' : 'draft-karte haus-karte'}
                disabled={fertig}
                onClick={() => {
                  setGewaehlt(id);
                  onChoose(id);
                }}
              >
                <span className="draft-selt">{h.motto}</span>
                <span className="draft-name">{h.name}</span>
                <span className="haus-zeile plus">+ {h.staerke}</span>
                <span className="haus-zeile minus">- {h.schwaeche}</span>
                <span className="haus-rat">{h.rat}</span>
              </button>
            </div>
          );
        })}
      </div>
      {state.players.length > 1 && (
        <ul className="haus-stand">
          {state.players.map((p) => (
            <li key={p.id}>
              <span className="dot" style={{ background: playerColor(p.color) }} />
              {p.name}: {p.haus ? hausById(p.haus)?.name : '...'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
