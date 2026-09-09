/** Startseite: Raum eroeffnen oder mit Code beitreten. */

import { useState } from 'react';
import { useStore } from '../net/store';
import { ROOM_CODE_LENGTH, isRoomCode } from '../../core/protocol';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Raumcode ohne 0/O und 1/I - die werden beim Vorlesen zu oft verwechselt. */
function freshCode(): string {
  const a = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(a);
  return [...a].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function Home() {
  const connect = useStore((s) => s.connect);
  const status = useStore((s) => s.status);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('infinitecatan.name') ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState('');

  const remember = (n: string) => {
    setName(n);
    try {
      localStorage.setItem('infinitecatan.name', n);
    } catch {
      // Privater Modus - dann eben jedes Mal neu eintippen.
    }
  };

  const ready = name.trim().length > 0;

  return (
    <div className="home">
      <div className="home-card">
        <h1>InfiniteCatan</h1>
        <p className="sub">
          Siedeln auf einer Karte ohne Rand. Sie waechst weiter, sobald jemand nach
          aussen baut.
        </p>

        <label>
          Dein Name
          <input
            value={name}
            maxLength={20}
            placeholder="z.B. Anna"
            onChange={(e) => remember(e.target.value)}
          />
        </label>

        <button
          className="primary"
          disabled={!ready || status === 'connecting'}
          onClick={() => connect(freshCode(), name.trim(), true)}
        >
          Neuen Raum eroeffnen
        </button>

        <div className="divider">oder</div>

        <label>
          Raumcode
          <input
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="ABC234"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <button
          disabled={!ready || !isRoomCode(code) || status === 'connecting'}
          onClick={() => connect(code, name.trim(), false)}
        >
          Beitreten
        </button>

        {status === 'connecting' && <p className="note">Verbinde...</p>}
        {status === 'closed' && <p className="note">Verbindung getrennt.</p>}
      </div>
    </div>
  );
}
