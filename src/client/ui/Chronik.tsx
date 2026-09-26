/**
 * Die Schlussseite einer Partie: die Chronik (core/chronik.ts).
 *
 * Frueher stand am Ende eine Zeile - "X gewinnt!". Genau hier entscheidet
 * sich aber, ob jemand eine zweite Partie anfaengt. Deshalb: wer wie weit kam
 * (Rangliste mit Wertung), wie es verlief (Punkte ueber die Runden), was man
 * erlebt hat (Momente), unter welchen Vorzeichen (Omen) - und zwei Knoepfe,
 * um weiterzumachen: dieselbe Welt noch einmal oder, bei der
 * Tagesexpedition, ein neuer Versuch.
 *
 * Das Fenster laesst sich schliessen, um die Karte in Ruhe anzusehen; ein
 * Schild bringt es zurueck.
 */

import { useEffect, useMemo, useState } from 'react';
import type { PublicState } from '../../core/redact';
import type { ChronikStats } from '../../core/chronik';
import { roundOf, SEASON_NAME, seasonOf, yearOf } from '../../core/season';
import { RESOURCES } from '../../core/types';
import { playerColor } from '../theme';
import { OmenListe } from './OmenListe';
import { holeTagesInfo } from '../net/socket';
import { hausById } from '../../core/haus';
import { werteAus } from '../profil';
import { saga } from '../../core/chronik';
import { STUFE_NAME } from '../../core/stufe';
import type { BestenEintrag } from '../../core/tages';

type Props = {
  state: PublicState;
  you: string | null;
  code: string | null;
  /** Neuer Raum: dieselbe Welt, oder eine neue Tagesexpedition. */
  nochmal: (neu: { welt?: number; tages?: boolean }) => void;
  verlassen: () => void;
};

type Zeile = {
  id: string;
  name: string;
  farbe: string;
  punkte: number;
  ruhm: number;
  wertung: number;
  haus: string | null;
};

export function Chronik({ state, you, code, nochmal, verlassen }: Props) {
  const [offen, setOffen] = useState(true);
  const [besten, setBesten] = useState<BestenEintrag[] | null>(null);
  // Einmal je Partie ins Profil dieses Browsers eintragen (client/profil.ts).
  const [bilanz] = useState(() => (you && code && state.phase.t === 'finished' ? werteAus(state, you, code) : null));
  const phase = state.phase;
  const chronik = state.chronik;
  const tages = state.tagesDatum;

  // Bei der Tagesexpedition: welcher Platz ist das heute?
  useEffect(() => {
    if (!tages) return;
    let lebt = true;
    const t = window.setTimeout(() => {
      holeTagesInfo()
        .then((info) => {
          if (lebt && info.datum === tages) setBesten(info.eintraege);
        })
        .catch(() => {});
    }, 800);
    return () => {
      lebt = false;
      window.clearTimeout(t);
    };
  }, [tages]);

  const zeilen: Zeile[] = useMemo(() => {
    const letzte = chronik?.verlauf[chronik.verlauf.length - 1];
    return state.order
      .map((id, i) => {
        const p = state.players.find((x) => x.id === id)!;
        // Der Schlusseintrag enthaelt die aufgedeckten Siegpunktkarten.
        const punkte = letzte?.punkte[i] ?? (id === you ? state.myPoints : p.points);
        return {
          id,
          name: p.name,
          farbe: playerColor(p.color),
          punkte,
          ruhm: p.ruhm,
          wertung: punkte * 10 + p.ruhm,
          haus: p.haus ?? null,
        };
      })
      .sort((a, b) => b.wertung - a.wertung);
  }, [chronik, state, you]);

  if (phase.t !== 'finished') return null;

  const sieger = state.players.find((p) => p.id === phase.winner);
  const runde = roundOf(state.turn);
  const ich = zeilen.find((z) => z.id === you);
  const platz = besten && code ? besten.findIndex((e) => e.code === code) : -1;

  if (!offen) {
    return (
      <button className="chronik-schild" onClick={() => setOffen(true)}>
        Chronik
      </button>
    );
  }

  let kopf: string;
  if (state.koop && state.koopErgebnis)
    kopf = state.koopErgebnis.erfolg
      ? `Gemeinsam geschafft - ${state.koopErgebnis.summe} von ${state.koopErgebnis.ziel} Siegpunkten`
      : `Gemeinsam gescheitert - ${state.koopErgebnis.summe} von ${state.koopErgebnis.ziel} Siegpunkten`;
  else if (phase.winner === null) kopf = tages ? `Tagesexpedition ${tages} - verloren` : 'Alle Reiche sind gefallen';
  else if (tages) kopf = `Tagesexpedition ${tages}`;
  else if (phase.durch === 'zeit' && state.order.length === 1) kopf = 'Das Jahr ist um';
  else if (phase.durch === 'zeit') kopf = `Das Jahr ist um - ${sieger?.name ?? 'Jemand'} gewinnt`;
  else kopf = `${sieger?.name ?? 'Jemand'} gewinnt`;

  return (
    <div className="chronik-huelle" role="dialog" aria-label="Chronik der Partie">
      <div className="chronik">
        <header className="chronik-kopf">
          <span className="chronik-titel">Chronik</span>
          <h2>{kopf}</h2>
          <p className="note">
            Runde {runde} · {SEASON_NAME[seasonOf(state.turn)]} im Jahr {yearOf(state.turn)}
            {state.stufe > 0 ? ` · Chronikstufe ${state.stufe}` : ''}
            {phase.durch === 'ziel' && state.targetPoints > 0 ? ` · Ziel ${state.targetPoints} Siegpunkte erreicht` : ''}
          </p>
          {state.players.find((p) => p.id === you)?.besiegt && phase.winner !== null && (
            <p className="note">Dein Reich ist gefallen.</p>
          )}
          {tages && ich && (
            <p className="chronik-wertung">
              Deine Wertung: <b>{ich.wertung}</b>
              <span className="note">
                {' '}
                ({ich.punkte} {ich.punkte === 1 ? 'Siegpunkt' : 'Siegpunkte'} x 10 + {ich.ruhm} Ruhm)
                {platz >= 0 ? ` · Platz ${platz + 1} von ${besten!.length} heute` : ''}
              </span>
            </p>
          )}
          {you && <p className="chronik-saga">{saga(state, you)}</p>}
        </header>

        {bilanz && !bilanz.schonGewertet && (bilanz.neueTaten.length > 0 || bilanz.neueStufe !== null) && (
          <section className="chronik-neu">
            {bilanz.neueStufe !== null && (
              <p className="chronik-stufe-frei">
                Chronikstufe {bilanz.neueStufe} ({STUFE_NAME[bilanz.neueStufe]}) freigeschaltet - waehle sie in der Lobby.
              </p>
            )}
            {bilanz.neueTaten.length > 0 && (
              <>
                <h3>Neue Taten</h3>
                <ul className="taten-liste">
                  {bilanz.neueTaten.map((t) => (
                    <li key={t.id}>
                      <b>{t.name}</b> <span>{t.text}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <section>
          <h3>Rangliste</h3>
          <table className="chronik-rang">
            <thead>
              <tr>
                <th />
                <th>Spieler</th>
                <th>Siegpunkte</th>
                <th>Ruhm</th>
                <th title="Siegpunkte x 10 + Ruhm">Wertung</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => (
                <tr key={z.id} className={z.id === you ? 'du' : ''}>
                  <td>{i + 1}.</td>
                  <td>
                    <span className="dot" style={{ background: z.farbe }} /> {z.name}
                    {z.haus && <span className="chronik-haus"> · {hausById(z.haus)?.name}</span>}
                  </td>
                  <td>{z.punkte}</td>
                  <td>{z.ruhm}</td>
                  <td>
                    <b>{z.wertung}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {chronik && chronik.verlauf.length > 1 && (
          <section>
            <h3>Siegpunkte im Verlauf</h3>
            <Verlauf state={state} />
          </section>
        )}

        {chronik && chronik.momente.length > 0 && (
          <section>
            <h3>Momente</h3>
            <ol className="chronik-momente">
              {chronik.momente.slice(-14).map((m, i) => (
                <li key={i} className={`moment-${m.art}`}>
                  <span className="moment-runde">R{roundOf(m.turn)}</span> {m.text}
                </li>
              ))}
            </ol>
          </section>
        )}

        {chronik && (
          <section>
            <h3>In Zahlen</h3>
            <Zahlen state={state} />
          </section>
        )}

        <section>
          <h3>Welt</h3>
          <OmenListe omens={state.omens} knapp />
          <p className="note">Welt Nr. {state.worldSeed >>> 0}</p>
        </section>

        <div className="chronik-knoepfe">
          {tages ? (
            <button className="primary" onClick={() => nochmal({ tages: true })}>
              Nochmal versuchen
            </button>
          ) : (
            <button
              className="primary"
              title="Dieselbe Landschaft, neue Wuerfel und Karten"
              onClick={() => nochmal({ welt: state.worldSeed })}
            >
              Diese Welt nochmal
            </button>
          )}
          <button onClick={() => setOffen(false)}>Karte ansehen</button>
          <button className="ghost" onClick={verlassen}>
            Zur Startseite
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Verlauf ----------------------------------------------------------------

const B = 520;
const H = 190;
const RAND = { l: 30, r: 78, o: 12, u: 24 };

/**
 * Siegpunkte ueber die Runden, je Spieler eine Linie in seiner Farbe. Die
 * Farbe folgt dem Spieler wie auf der Karte; der Name steht am Linienende und
 * in der Legende, damit niemand Farben vergleichen muss. Zeiger ueber dem Bild
 * zeigt die Werte der naechsten Runde.
 */
function Verlauf({ state }: { state: PublicState }) {
  const verlauf = state.chronik!.verlauf;
  const [zeiger, setZeiger] = useState<number | null>(null);
  const spieler = state.order.map((id) => state.players.find((p) => p.id === id)!);

  const x0 = verlauf[0]!.turn;
  const x1 = Math.max(x0 + 1, verlauf[verlauf.length - 1]!.turn);
  const yMax = Math.max(4, ...verlauf.flatMap((v) => v.punkte));
  const schritt = yMax <= 10 ? 2 : yMax <= 30 ? 5 : 10;
  const oben = Math.ceil(yMax / schritt) * schritt;
  const x = (t: number) => RAND.l + ((t - x0) / (x1 - x0)) * (B - RAND.l - RAND.r);
  const y = (p: number) => H - RAND.u - (p / oben) * (H - RAND.o - RAND.u);
  const ticks: number[] = [];
  for (let p = 0; p <= oben; p += schritt) ticks.push(p);

  const naechster = zeiger === null ? null : verlauf.reduce((a, b) => (Math.abs(b.turn - zeiger) < Math.abs(a.turn - zeiger) ? b : a));

  // Namen am Linienende - zusammenrueckende nach unten schieben, damit nichts ueberlappt.
  const enden = spieler
    .map((p, i) => ({ p, i, y: y(verlauf[verlauf.length - 1]!.punkte[i] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < enden.length; k++) enden[k]!.y = Math.max(enden[k]!.y, enden[k - 1]!.y + 12);

  return (
    <div className="chronik-verlauf">
      {spieler.length > 1 && (
        <ul className="chronik-legende">
          {spieler.map((p) => (
            <li key={p.id}>
              <span className="linie" style={{ background: playerColor(p.color) }} />
              {p.name}
            </li>
          ))}
        </ul>
      )}
      <svg
        viewBox={`0 0 ${B} ${H}`}
        role="img"
        aria-label="Siegpunkte je Spieler ueber die Runden"
        onMouseLeave={() => setZeiger(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * B;
          setZeiger(x0 + ((px - RAND.l) / (B - RAND.l - RAND.r)) * (x1 - x0));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="gitter" x1={RAND.l} x2={B - RAND.r} y1={y(t)} y2={y(t)} />
            <text className="achse" x={RAND.l - 6} y={y(t) + 3} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <text className="achse" x={RAND.l} y={H - 6}>
          Runde {roundOf(x0)}
        </text>
        <text className="achse" x={B - RAND.r} y={H - 6} textAnchor="end">
          Runde {roundOf(x1)}
        </text>
        {spieler.map((p, i) => (
          <polyline
            key={p.id}
            className="verlauf-linie"
            stroke={playerColor(p.color)}
            points={verlauf.map((v) => `${x(v.turn)},${y(v.punkte[i] ?? 0)}`).join(' ')}
          />
        ))}
        {spieler.length <= 4 &&
          enden.map(({ p, y: ly }) => (
            <text key={p.id} className="achse ende" x={B - RAND.r + 8} y={ly + 3}>
              {p.name.length > 10 ? p.name.slice(0, 9) + '.' : p.name}
            </text>
          ))}
        {naechster && (
          <g>
            <line className="zeiger" x1={x(naechster.turn)} x2={x(naechster.turn)} y1={RAND.o} y2={H - RAND.u} />
            {spieler.map((p, i) => (
              <circle
                key={p.id}
                className="zeiger-punkt"
                cx={x(naechster.turn)}
                cy={y(naechster.punkte[i] ?? 0)}
                r={4}
                fill={playerColor(p.color)}
              />
            ))}
          </g>
        )}
      </svg>
      {naechster && (
        <div className="chronik-tooltip">
          <b>Runde {roundOf(naechster.turn)}</b>
          {spieler.map((p, i) => (
            <span key={p.id}>
              <span className="linie" style={{ background: playerColor(p.color) }} />
              {p.name}: {naechster.punkte[i] ?? 0}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Zahlen -----------------------------------------------------------------

const ZAHLEN: { name: string; wert: (s: ChronikStats) => number }[] = [
  { name: 'Ertrag aus Wuerfen', wert: (s) => RESOURCES.reduce((n, r) => n + s.ertrag[r], 0) },
  { name: 'Strassen gebaut', wert: (s) => s.strassen },
  { name: 'Doerfer gebaut', wert: (s) => s.doerfer },
  { name: 'Staedte gebaut', wert: (s) => s.staedte },
  { name: 'Karten genommen', wert: (s) => s.karten },
  { name: 'Handel', wert: (s) => s.handel },
  { name: 'Lager zerstoert', wert: (s) => s.lager },
  { name: 'Ruinen erkundet', wert: (s) => s.ruinen },
  { name: 'Auftraege erfuellt', wert: (s) => s.auftraege },
  { name: 'Karten gepluendert', wert: (s) => s.gepluendert },
  { name: 'Abgebrannt', wert: (s) => s.abgebrannt },
  { name: 'Held gefallen', wert: (s) => s.heldGefallen },
];

function Zahlen({ state }: { state: PublicState }) {
  const chronik = state.chronik!;
  const spieler = state.order.map((id) => state.players.find((p) => p.id === id)!);
  return (
    <table className="chronik-zahlen">
      {spieler.length > 1 && (
        <thead>
          <tr>
            <th />
            {spieler.map((p) => (
              <th key={p.id}>
                <span className="dot" style={{ background: playerColor(p.color) }} /> {p.name}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {ZAHLEN.map((z) => (
          <tr key={z.name}>
            <td>{z.name}</td>
            {spieler.map((p) => {
              const s = chronik.stats[p.id];
              return <td key={p.id}>{s ? z.wert(s) : 0}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
