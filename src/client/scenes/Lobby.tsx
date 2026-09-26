/** Warteraum: Mitspieler sammeln, Zielpunkte, Laenge und Omen waehlen, starten. */

import { useStore } from '../net/store';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  RUNDEN_LIMIT_CHOICES,
  TARGET_POINTS_CHOICES,
  rundenLimitLabel,
  targetPointsLabel,
} from '../../core/protocol';
import { playerColor } from '../theme';
import { OmenListe } from '../ui/OmenListe';

export function Lobby() {
  const room = useStore((s) => s.room);
  const you = useStore((s) => s.you);
  const send = useStore((s) => s.send);
  const disconnect = useStore((s) => s.disconnect);
  if (!room) return null;

  const isHost = room.hostId === you;
  const canStart = isHost && room.members.length >= MIN_PLAYERS;
  const tages = room.tagesDatum;

  return (
    <div className="home">
      <div className="home-card">
        {tages ? (
          <>
            <h1>Tagesexpedition</h1>
            <p className="sub">
              {tages} - dieselbe Welt, dieselben Omen und dieselben Wuerfel fuer alle, die heute
              spielen. Ein Jahr lang ({room.rundenLimit} Runden), allein. Es zaehlt die Wertung:
              Siegpunkte mal 10 plus Ruhm.
            </p>
          </>
        ) : (
          <>
            <h1>Raum {room.code}</h1>
            <p className="sub">
              Code weitergeben, damit andere beitreten koennen. {MIN_PLAYERS} bis{' '}
              {MAX_PLAYERS} Spieler - allein geht auch.
            </p>
          </>
        )}

        <ul className="members">
          {room.members.map((m, i) => (
            <li key={m.id}>
              <span className="dot" style={{ background: playerColor(i) }} />
              {m.name}
              {m.id === room.hostId && <em> Gastgeber</em>}
              {m.id === you && <em> du</em>}
              {!m.connected && <em className="off"> offline</em>}
            </li>
          ))}
        </ul>

        {room.weltSeed !== null && !tages && (
          <p className="note">Gespielt wird die Welt einer frueheren Partie - dieselbe Landschaft, neue Wuerfel.</p>
        )}

        <label>
          Omen
          <OmenListe omens={room.omens} />
        </label>
        {!tages && isHost && (
          <div className="choices">
            <button onClick={() => send({ t: 'setOptions', omens: 'neu' })}>Neu wuerfeln</button>
            <button
              disabled={room.omens.length === 0}
              onClick={() => send({ t: 'setOptions', omens: 'keine' })}
            >
              Ohne Omen
            </button>
          </div>
        )}

        {!tages && (
          <>
            <label>
              Siegpunkte
              <div className="choices">
                {TARGET_POINTS_CHOICES.map((n) => (
                  <button
                    key={n}
                    className={room.targetPoints === n ? 'chosen' : ''}
                    disabled={!isHost}
                    onClick={() => send({ t: 'setOptions', targetPoints: n })}
                  >
                    {targetPointsLabel(n)}
                  </button>
                ))}
              </div>
            </label>

            <label>
              Laenge
              <div className="choices">
                {RUNDEN_LIMIT_CHOICES.map((n) => (
                  <button
                    key={String(n)}
                    className={room.rundenLimit === n ? 'chosen' : ''}
                    disabled={!isHost}
                    onClick={() => send({ t: 'setOptions', rundenLimit: n })}
                  >
                    {rundenLimitLabel(n)}
                  </button>
                ))}
              </div>
            </label>
            {room.rundenLimit !== null && (
              <p className="note">
                Nach {room.rundenLimit} Runden ist Schluss, dann gewinnt die hoechste Wertung
                (Siegpunkte mal 10 plus Ruhm) - wenn nicht vorher jemand das Ziel erreicht.
              </p>
            )}

            <label className="home-schalter">
              <input
                type="checkbox"
                checked={room.oeffentlich}
                disabled={!isHost}
                onChange={(e) => send({ t: 'setOptions', oeffentlich: e.target.checked })}
              />
              Öffentlich
            </label>
          </>
        )}

        {isHost ? (
          <button className="primary" disabled={!canStart} onClick={() => send({ t: 'start' })}>
            {tages ? 'Expedition beginnen' : room.members.length === 1 ? 'Allein starten' : 'Partie starten'}
          </button>
        ) : (
          <p className="note">Warten auf den Gastgeber...</p>
        )}

        <button className="ghost" onClick={disconnect}>
          Raum verlassen
        </button>
      </div>
    </div>
  );
}
