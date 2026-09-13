/**
 * Startseite: Raum eroeffnen, mit Code beitreten - oder aus der Raumliste.
 *
 * Die Liste zeigt oeffentliche Raeume der letzten sieben Tage (core/lobby.ts):
 * offene mit Beitreten-Knopf, laufende und beendete nur zur Ansicht. Sie wird
 * alle 15 Sekunden neu geholt, solange die Seite offen ist.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../net/store';
import { ROOM_CODE_LENGTH, isRoomCode, targetPointsLabel } from '../../core/protocol';
import { VERFALL_TAGE, zuletztText } from '../../core/lobby';
import type { RaumEintrag } from '../../core/lobby';
import { SERVER_MISSING, holeRaeume } from '../net/socket';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Wie oft die Raumliste neu geholt wird. */
const LISTE_ALLE_MS = 15_000;

/** Raumcode ohne 0/O und 1/I - die werden beim Vorlesen zu oft verwechselt. */
function freshCode(): string {
  const a = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(a);
  return [...a].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

const STATUS_TEXT = { lobby: 'wartet', laeuft: 'laeuft', beendet: 'beendet' } as const;

export function Home() {
  const connect = useStore((s) => s.connect);
  const status = useStore((s) => s.status);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('infinitecarthage.name') ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState('');
  const [oeffentlich, setOeffentlich] = useState(true);
  const [nameFehlt, setNameFehlt] = useState(false);
  const nameFeld = useRef<HTMLInputElement>(null);
  const [raeume, setRaeume] = useState<RaumEintrag[] | null>(null);
  const [listeFehlt, setListeFehlt] = useState(false);
  const [jetzt, setJetzt] = useState(() => Date.now());

  useEffect(() => {
    if (SERVER_MISSING) return;
    let lebt = true;
    const laden = () => {
      holeRaeume()
        .then((r) => {
          if (!lebt) return;
          setRaeume(r);
          setListeFehlt(false);
          setJetzt(Date.now());
        })
        .catch(() => {
          if (lebt) setListeFehlt(true);
        });
    };
    laden();
    const t = window.setInterval(laden, LISTE_ALLE_MS);
    return () => {
      lebt = false;
      window.clearInterval(t);
    };
  }, []);

  const remember = (n: string) => {
    setName(n);
    try {
      localStorage.setItem('infinitecarthage.name', n);
    } catch {
      // Privater Modus - dann eben jedes Mal neu eintippen.
    }
  };

  const ready = name.trim().length > 0 && !SERVER_MISSING;
  const verbindet = status === 'connecting';
  const offen = (raeume ?? []).filter((r) => r.status === 'lobby');
  const laufend = (raeume ?? []).filter((r) => r.status !== 'lobby');

  /**
   * Beitreten per Klick auf den Raum. Fehlt der Name, springt der Cursor ins
   * Namensfeld, statt dass der Klick stumm ins Leere geht.
   */
  const beitreten = (r: RaumEintrag) => {
    if (r.status !== 'lobby' || r.spieler.length >= r.maxSpieler || verbindet) return;
    if (name.trim().length === 0) {
      setNameFehlt(true);
      nameFeld.current?.focus();
      return;
    }
    connect(r.code, name.trim(), false);
  };

  const zeile = (r: RaumEintrag) => {
    const voll = r.spieler.length >= r.maxSpieler;
    const offen = r.status === 'lobby' && !voll;
    return (
      <li
        key={r.code}
        className={offen ? 'raum klickbar' : 'raum'}
        title={offen ? `Raum ${r.code} beitreten` : undefined}
        onClick={() => beitreten(r)}
      >
        <div className="raum-kopf">
          <span className="raum-code">{r.code}</span>
          <span className={`raum-status ${r.status}`}>{STATUS_TEXT[r.status]}</span>
        </div>
        <div className="raum-info">
          {r.spieler.length}/{r.maxSpieler} · {r.spieler.join(', ')}
          {r.runde !== null ? ` · Runde ${r.runde}` : ''} · Ziel {targetPointsLabel(r.zielpunkte)} ·{' '}
          {zuletztText(r.zuletzt, jetzt)}
        </div>
        {r.status === 'lobby' && (
          <button
            disabled={voll || verbindet || SERVER_MISSING}
            title={voll ? 'Der Raum ist voll' : undefined}
            onClick={(e) => {
              e.stopPropagation();
              beitreten(r);
            }}
          >
            {voll ? 'Voll' : 'Beitreten'}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="home">
      <div className="home-card">
        <h1>InfiniteCarthage</h1>

        {SERVER_MISSING && (
          <p className="warn">
            <strong>Kein Spielserver hinterlegt.</strong> Diese Seite ist
            veroeffentlicht, aber die Variable <code>VITE_SERVER_URL</code>
            zeigt auf nichts - deshalb laesst sich kein Raum oeffnen. Der
            Worker muss bereitgestellt und seine Adresse als
            Repository-Variable gesetzt sein (siehe README).
          </p>
        )}

        <label>
          Dein Name
          <input
            ref={nameFeld}
            value={name}
            maxLength={20}
            placeholder="z.B. Anna"
            onChange={(e) => {
              remember(e.target.value);
              setNameFehlt(false);
            }}
          />
        </label>
        {nameFehlt && <p className="note">Erst einen Namen eingeben, dann beitreten.</p>}

        <label className="home-schalter">
          <input
            type="checkbox"
            checked={oeffentlich}
            onChange={(e) => setOeffentlich(e.target.checked)}
          />
          Öffentlich
        </label>
        <button
          className="primary"
          disabled={!ready || verbindet}
          onClick={() => connect(freshCode(), name.trim(), true, oeffentlich)}
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
          disabled={!ready || !isRoomCode(code) || verbindet}
          onClick={() => connect(code, name.trim(), false)}
        >
          Beitreten
        </button>

        {verbindet && <p className="note">Verbinde...</p>}
        {status === 'closed' && <p className="note">Verbindung getrennt.</p>}

        {!SERVER_MISSING && (
          <section className="raumliste">
            <h2>Offene Raeume</h2>
            {raeume === null && !listeFehlt && <p className="raumliste-leer">Lade...</p>}
            {listeFehlt && <p className="raumliste-leer">Die Raumliste ist gerade nicht erreichbar.</p>}
            {raeume !== null && offen.length === 0 && (
              <p className="raumliste-leer">Gerade wartet niemand. Eroeffne selbst einen Raum.</p>
            )}
            {offen.length > 0 && <ul>{offen.map(zeile)}</ul>}

            {laufend.length > 0 && (
              <>
                <h2>Laufende Partien</h2>
                <ul>{laufend.map(zeile)}</ul>
              </>
            )}
            <p className="raumliste-leer">
              Oeffentliche Raeume der letzten {VERFALL_TAGE} Tage. Laufende Partien sind
              nur zur Ansicht.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
