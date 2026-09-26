/** Warteraum: Mitspieler sammeln, Zielpunkte, Laenge und Omen waehlen, starten. */

import { botNatur } from '../../core/bot';
import { WELTARTEN, weltArtInfo } from '../../core/weltart';
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
import { MAX_STUFE, STUFE_NAME, omenMitStufe } from '../../core/stufe';
import { leseProfil } from '../profil';
import { KOOP_ZIEL_JE } from '../../core/rules/reducer';
import { szenarioById } from '../../core/szenario';


/** Wie ein Bot spielt - in der Lobby, damit man weiss, gegen wen. */
const NATUR_NAME = { baumeister: 'Baumeister', haendler: 'Haendler', krieger: 'Krieger' } as const;
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
        {szenarioById(room.szenario) ? (
          <>
            <h1>{szenarioById(room.szenario)!.name}</h1>
            <p className="sub">{szenarioById(room.szenario)!.text}</p>
            <p className="szenario-aufgabe gross">
              Ziel: {szenarioById(room.szenario)!.aufgabe} In {szenarioById(room.szenario)!.runden} Runden - je schneller, desto mehr
              Sterne.
            </p>
          </>
        ) : tages ? (
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
              {m.bot && <em title="Wie der Rivale spielt (core/bot.ts)"> Bot · {NATUR_NAME[botNatur(m.id)]}</em>}
              {m.id === room.hostId && <em> Gastgeber</em>}
              {m.id === you && <em> du</em>}
              {!m.connected && <em className="off"> offline</em>}
              {m.bot && isHost && (
                <button className="klein bot-weg" title="Bot entfernen" onClick={() => send({ t: 'removeBot', id: m.id })}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {!tages && !room.szenario && isHost && room.members.length < MAX_PLAYERS && (
          <button onClick={() => send({ t: 'addBot' })} title="Ein Rivale, den das Spiel selbst fuehrt: er siedelt, baut und handelt nach festen Vorlieben">
            + Rivalen dazusetzen (Bot)
          </button>
        )}

        {room.weltSeed !== null && !tages && (
          <p className="note">Gespielt wird die Welt einer frueheren Partie - dieselbe Landschaft, neue Wuerfel.</p>
        )}

        {room.weltArt && (
          <label>
            Welt
            <div className="weltart-karte">
              <b>{weltArtInfo(room.weltArt).name}</b>
              <span>{weltArtInfo(room.weltArt).text}</span>
            </div>
          </label>
        )}
        {room.weltArt && !tages && !room.szenario && room.weltSeed === null && isHost && (
          <div className="choices weltart-wahl">
            {WELTARTEN.map((w) => (
              <button
                key={w.art}
                className={room.weltArt === w.art ? 'chosen' : ''}
                title={w.text}
                onClick={() => send({ t: 'setOptions', weltArt: w.art })}
              >
                {w.name}
              </button>
            ))}
            <button title="Eine zufaellige Weltart" onClick={() => send({ t: 'setOptions', weltArt: 'neu' })}>
              Zufall
            </button>
          </div>
        )}

        <label>
          Omen
          <OmenListe omens={omenMitStufe(room.omens, room.stufe)} />
        </label>
        {!tages && !room.szenario && isHost && (
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

        {!tages && !room.szenario && (
          <>
            <label>
              Spielart
              <div className="choices">
                <button className={!room.koop ? 'chosen' : ''} disabled={!isHost} onClick={() => send({ t: 'setOptions', koop: false })}>
                  Gegeneinander
                </button>
                <button className={room.koop ? 'chosen' : ''} disabled={!isHost} onClick={() => send({ t: 'setOptions', koop: true })}>
                  Gemeinsam
                </button>
              </div>
            </label>
            {room.koop && (
              <p className="note">
                Gemeinsam gegen die Wildnis: ein Jahr lang, und am Ende muss die Summe eurer Siegpunkte {KOOP_ZIEL_JE} je Spieler
                erreichen ({KOOP_ZIEL_JE * room.members.length} bei {room.members.length}). Ihr gewinnt oder verliert zusammen.
              </p>
            )}

            {!room.koop && (
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
            )}

            {(leseProfil().stufeFrei > 0 || room.stufe > 0) && (
            <label>
              Chronikstufe
              <div className="choices">
                {Array.from({ length: MAX_STUFE + 1 }, (_, n) => n).map((n) => {
                  const frei = n <= leseProfil().stufeFrei;
                  return (
                    <button
                      key={n}
                      className={room.stufe === n ? 'chosen' : ''}
                      disabled={!isHost || !frei}
                      title={
                        frei
                          ? `${STUFE_NAME[n]}${n > 0 ? ` - ${n} ${n === 1 ? 'Fluch' : 'Flueche'} mehr` : ' - das gewohnte Spiel'}`
                          : 'Gewinne auf der Stufe davor, um sie freizuschalten'
                      }
                      onClick={() => send({ t: 'setOptions', stufe: n })}
                    >
                      {frei ? n : '🔒'}
                    </button>
                  );
                })}
              </div>
            </label>
            )}
            {room.stufe > 0 && (
              <p className="note">
                {STUFE_NAME[room.stufe]}: {room.stufe} {room.stufe === 1 ? 'Fluch' : 'Flueche'} mehr auf dieser Partie.
              </p>
            )}

            {!room.koop && (
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
            )}
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
            {room.szenario ? 'Szenario beginnen' : tages ? 'Expedition beginnen' : room.members.length === 1 ? 'Allein starten' : 'Partie starten'}
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
