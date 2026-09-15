/**
 * Startseite: Raum eroeffnen, mit Code beitreten - oder aus der Raumliste.
 *
 * Die Liste zeigt oeffentliche Raeume der letzten sieben Tage (core/lobby.ts):
 * offene mit Beitreten-Knopf, laufende zum Weiterspielen. Sie wird alle 15
 * Sekunden neu geholt, solange die Seite offen ist.
 *
 * Darueber "Deine Partien" (net/partien.ts): jeder Raum, in dem dieser Browser
 * einen Platz hat, mit "Weiterspielen" - auch nach dem Schliessen des Browsers.
 * Wer ohne gemerkten Platz eine laufende Partie oeffnet, waehlt seinen Platz
 * und nennt dessen PIN (sie steht im Menue der Partie).
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../net/store';
import { PIN_LENGTH, ROOM_CODE_LENGTH, isPin, isRoomCode, normalizePin, targetPointsLabel } from '../../core/protocol';
import { VERFALL_TAGE, zuletztText } from '../../core/lobby';
import type { RaumEintrag } from '../../core/lobby';
import { SERVER_MISSING, holeRaeume } from '../net/socket';
import { lesePartien, lokalerSpeicher, vergissPartie } from '../net/partien';
import type { Partie } from '../net/partien';

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
  const disconnect = useStore((s) => s.disconnect);
  const waehlePlatz = useStore((s) => s.waehlePlatz);
  const status = useStore((s) => s.status);
  const platzWahl = useStore((s) => s.platzWahl);
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
  const [partien, setPartien] = useState<Partie[]>(() => lesePartien(lokalerSpeicher(), Date.now()));
  const [platz, setPlatz] = useState<string | null>(null);
  const [pin, setPin] = useState('');

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

  // Nach jedem Verbindungsversuch neu lesen: ein Beitritt merkt sich die Partie.
  useEffect(() => {
    setPartien(lesePartien(lokalerSpeicher(), Date.now()));
  }, [status]);

  // Neue Platzwahl: nichts Altes vorbelegen - ausser es gibt nur einen Platz.
  useEffect(() => {
    setPin('');
    setPlatz(platzWahl && platzWahl.members.length === 1 ? platzWahl.members[0]!.id : null);
  }, [platzWahl]);

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
  const partieVon = (c: string) => partien.find((p) => p.code === c);

  const weiterspielen = (p: Partie) => {
    if (verbindet || SERVER_MISSING) return;
    connect(p.code, p.name, false, true, p.token);
  };

  /**
   * Beitreten per Klick auf den Raum. Fehlt der Name, springt der Cursor ins
   * Namensfeld, statt dass der Klick stumm ins Leere geht. Eine laufende
   * Partie oeffnet sich mit gemerktem Platz direkt, sonst mit der Platzwahl.
   */
  const beitreten = (r: RaumEintrag) => {
    if (verbindet || SERVER_MISSING) return;
    if (r.status === 'laeuft') {
      const p = partieVon(r.code);
      if (p) weiterspielen(p);
      else connect(r.code, name.trim() || 'Spieler', false);
      return;
    }
    if (r.status !== 'lobby' || r.spieler.length >= r.maxSpieler) return;
    if (name.trim().length === 0) {
      setNameFehlt(true);
      nameFeld.current?.focus();
      return;
    }
    connect(r.code, name.trim(), false);
  };

  const zeile = (r: RaumEintrag) => {
    const voll = r.spieler.length >= r.maxSpieler;
    const klickbar = (r.status === 'lobby' && !voll) || r.status === 'laeuft';
    const meine = partieVon(r.code);
    return (
      <li
        key={r.code}
        className={klickbar ? 'raum klickbar' : 'raum'}
        title={
          r.status === 'laeuft'
            ? meine
              ? `Weiterspielen als ${meine.name}`
              : 'Weiterspielen - mit Platz und PIN'
            : klickbar
              ? `Raum ${r.code} beitreten`
              : undefined
        }
        onClick={() => beitreten(r)}
      >
        <div className="raum-kopf">
          <span className="raum-code">{r.code}</span>
          <span className={`raum-status ${r.status}`}>{STATUS_TEXT[r.status]}</span>
          {meine && <span className="raum-status dein">dein Platz</span>}
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

  // Die Partie laeuft, und dieser Browser hat dort keinen Platz: welcher bist du?
  if (status === 'platzwahl' && platzWahl) {
    const pinOk = isPin(normalizePin(pin));
    return (
      <div className="home">
        <div className="home-card">
          <h1>InfiniteCarthage</h1>
          <section className="platzwahl">
            <h2>Raum {platzWahl.code} laeuft</h2>
            <p className="note">
              Welcher Platz bist du? Die PIN steht in der Partie im Menue unter Reich - auf dem Geraet, auf dem du
              bisher gespielt hast.
            </p>
            <ul>
              {platzWahl.members.map((m) => (
                <li key={m.id}>
                  <label className="platz">
                    <input type="radio" name="platz" checked={platz === m.id} onChange={() => setPlatz(m.id)} />
                    {m.name}
                    {m.connected ? <em> gerade verbunden</em> : <em className="off"> offline</em>}
                  </label>
                </li>
              ))}
            </ul>
            <label>
              Platz-PIN
              <input
                value={pin}
                maxLength={PIN_LENGTH + 2}
                placeholder="K7Q2"
                autoCapitalize="characters"
                onChange={(e) => setPin(e.target.value.toUpperCase())}
              />
            </label>
            <button
              className="primary"
              disabled={platz === null || !pinOk}
              onClick={() => platz !== null && waehlePlatz(platz, pin)}
            >
              Weiterspielen
            </button>
            <button onClick={disconnect}>Abbrechen</button>
          </section>
        </div>
      </div>
    );
  }

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

        {partien.length > 0 && !SERVER_MISSING && (
          <section className="raumliste deine-partien">
            <h2>Deine Partien</h2>
            <ul>
              {partien.map((p) => {
                const r = (raeume ?? []).find((x) => x.code === p.code);
                return (
                  <li key={p.code} className="raum klickbar" title={`Weiterspielen als ${p.name}`} onClick={() => weiterspielen(p)}>
                    <div className="raum-kopf">
                      <span className="raum-code">{p.code}</span>
                      {r && <span className={`raum-status ${r.status}`}>{STATUS_TEXT[r.status]}</span>}
                    </div>
                    <div className="raum-info">
                      als {p.name}
                      {r ? ` · ${r.spieler.join(', ')}${r.runde !== null ? ` · Runde ${r.runde}` : ''}` : ''} ·{' '}
                      {zuletztText(r?.zuletzt ?? p.zuletzt, jetzt)}
                    </div>
                    <div className="raum-knoepfe">
                      <button
                        className="primary"
                        disabled={verbindet}
                        onClick={(e) => {
                          e.stopPropagation();
                          weiterspielen(p);
                        }}
                      >
                        Weiterspielen
                      </button>
                      <button
                        className="klein"
                        title="Aus der Liste nehmen - der Platz in der Partie bleibt"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPartien(vergissPartie(lokalerSpeicher(), p.code, Date.now()));
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
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
          onClick={() => {
            const p = partieVon(code);
            if (p) weiterspielen(p);
            else connect(code, name.trim(), false);
          }}
        >
          Beitreten
        </button>
        <p className="note">Laeuft die Partie schon, waehlst du deinen Platz und gibst seine PIN ein.</p>

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
              Oeffentliche Raeume der letzten {VERFALL_TAGE} Tage. Eine laufende Partie oeffnet sich per Klick: mit
              deinem Platz direkt, sonst mit Platz und PIN.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
