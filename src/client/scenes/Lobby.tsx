/** Warteraum: Mitspieler sammeln, Zielpunkte waehlen, starten. */

import { useStore } from '../net/store';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  TARGET_POINTS_CHOICES,
  targetPointsLabel,
} from '../../core/protocol';
import { playerColor } from '../theme';

export function Lobby() {
  const room = useStore((s) => s.room);
  const you = useStore((s) => s.you);
  const send = useStore((s) => s.send);
  const disconnect = useStore((s) => s.disconnect);
  if (!room) return null;

  const isHost = room.hostId === you;
  const canStart = isHost && room.members.length >= MIN_PLAYERS;

  return (
    <div className="home">
      <div className="home-card">
        <h1>Raum {room.code}</h1>
        <p className="sub">
          Code weitergeben, damit andere beitreten koennen. {MIN_PLAYERS} bis{' '}
          {MAX_PLAYERS} Spieler - allein geht auch.
        </p>

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

        {isHost ? (
          <button className="primary" disabled={!canStart} onClick={() => send({ t: 'start' })}>
            {room.members.length === 1 ? 'Allein starten' : 'Partie starten'}
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
