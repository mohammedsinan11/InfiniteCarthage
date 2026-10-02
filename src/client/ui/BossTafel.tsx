/**
 * Die Tafel des Aktes (core/akte.ts): wer kommt, was er will, wie weit man
 * ist - und die drei Akte der Partie auf einen Blick. Oeffnet sich von selbst,
 * wenn ein Akt beginnt; sonst ueber das Schild "Akt" oben.
 *
 * Wie bei Slay the Spire sieht man den Boss, bevor er da ist. Das ist der
 * Sinn: nicht ueberrascht werden, sondern auf ihn hin bauen.
 */

import { AKTE, bossById, forderungText, fortschritt, zielWert, ZIEL_NAME } from '../../core/akte';
import type { BossStand } from '../../core/akte';
import type { PublicState } from '../../core/redact';
import { RESOURCES } from '../../core/types';
import type { Resource } from '../../core/types';
import { resourceName } from '../log';
import { ResourceGlyph } from './ResourceIcon';

/** Sichtbare Siegpunkte - der Client rechnet sie nicht nach, der Server liefert sie. */
const sichtbarePunkte = (state: PublicState) => (id: string): number => state.players.find((p) => p.id === id)?.points ?? 0;

const ROEMISCH = ['I', 'II', 'III', 'IV', 'V'];
export const aktZahl = (n: number): string => ROEMISCH[n - 1] ?? String(n);

const ART_NAME = { tribut: 'Tribut', heer: 'Heer', ziel: 'Wachstum' } as const;

type Props = {
  state: PublicState;
  you: string;
  /** Darf jetzt gezahlt werden (eigene Bauphase)? */
  darfZahlen: boolean;
  onZahlen: (r: Resource) => void;
  onZeigen: (q: number, r: number) => void;
  onZu: () => void;
};

export function BossTafel({ state, you, darfZahlen, onZahlen, onZeigen, onZu }: Props) {
  const akte = state.akte;
  const st = akte?.stand[you];
  if (!akte || !st) return null;
  const boss = bossById(st.boss);
  const ich = state.players.find((p) => p.id === you);
  const punkte = sichtbarePunkte(state);
  const anteil = fortschritt(state, you, st.forderung, punkte);
  const rest = Math.max(0, st.bis - state.turn + 1);

  return (
    <div className="boss-tafel" role="dialog" aria-label="Der Boss dieses Aktes">
      <div className="boss-kopf">
        <span className="boss-akt">Akt {aktZahl(st.akt)} von {aktZahl(AKTE)}</span>
        <button className="dock-zu" title="Schliessen" onClick={onZu}>
          x
        </button>
      </div>
      <div className={`boss-name boss-${boss?.art ?? 'ziel'}`}>
        <BossWappen art={boss?.art ?? 'ziel'} />
        <div>
          <b>{boss?.name ?? 'Ein Boss'}</b>
          <span>
            {ART_NAME[boss?.art ?? 'ziel']}
            {st.zugabe ? ` · ${st.zugabe}. Zugabe` : ''}
          </span>
        </div>
      </div>
      {boss && <p className="boss-text">{boss.text}</p>}

      {st.ergebnis === 'offen' ? (
        <>
          <p className="boss-forderung">{forderungText(st.forderung)}</p>
          <div className="boss-balken" title={`${Math.round(anteil * 100)}%`}>
            <i style={{ width: `${Math.round(anteil * 100)}%` }} />
          </div>
          <Forderung st={st} state={state} you={you} hand={ich?.hand} darfZahlen={darfZahlen} onZahlen={onZahlen} onZeigen={onZeigen} />
          <p className="boss-frist">
            {rest <= 1 ? 'Diese Runde ist die letzte!' : `Noch ${rest} Runden (etwa ${Math.ceil(rest / Math.max(1, state.order.length))} eigene Zuege) - bis Runde ${st.bis}.`}
          </p>
          {st.zugabe ? (
            <p className="boss-lohn">Bestanden: +1 Siegpunkt und +0,5 Mult - dann fordert er wieder. Offen am Ende: kein Verlust.</p>
          ) : (
            <p className="boss-lohn">
              Bestanden: +{st.akt} {st.akt === 1 ? 'Siegpunkt' : 'Siegpunkte'} und eine Trophaee (seltene Karte)
              {st.akt === 3 ? ', danach Zugaben' : ''}. Verfehlt: die Haelfte der Hand und 1 Ruhm.
            </p>
          )}
        </>
      ) : (
        <p className={st.ergebnis === 'besiegt' ? 'boss-ergebnis gut' : 'boss-ergebnis schlecht'}>
          {st.ergebnis === 'besiegt' ? 'Bezwungen!' : 'Verfehlt.'}{' '}
          {st.akt < 3 ? `Der naechste Akt beginnt in Runde ${st.bis + 1}.` : 'Das war der letzte Akt - jetzt zaehlt die Wertung.'}
        </p>
      )}

      <ol className="boss-leiste">
        {akte.bosse.map((id, i) => {
          const b = bossById(id);
          const akt = i + 1;
          const gesiegt = (akte.siege[you] ?? []).includes(akt);
          const vorbei = akt < st.akt || (akt === st.akt && st.ergebnis !== 'offen');
          return (
            <li key={id} className={[akt === st.akt ? 'jetzt' : '', vorbei ? (gesiegt ? 'gesiegt' : 'verfehlt') : ''].filter(Boolean).join(' ')}>
              <span>{aktZahl(akt)}</span>
              {b?.name ?? id}
              <i>{vorbei ? (gesiegt ? '✓' : '✗') : `+${akt}`}</i>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Forderung({
  st,
  state,
  you,
  hand,
  darfZahlen,
  onZahlen,
  onZeigen,
}: {
  st: BossStand;
  state: PublicState;
  you: string;
  hand: Partial<Record<Resource, number>> | undefined;
  darfZahlen: boolean;
  onZahlen: (r: Resource) => void;
  onZeigen: (q: number, r: number) => void;
}) {
  const f = st.forderung;
  if (f.t === 'tribut') {
    return (
      <ul className="boss-tribut">
        {RESOURCES.filter((r) => (f.soll[r] ?? 0) > 0).map((r) => {
          const soll = f.soll[r] ?? 0;
          const ist = f.gezahlt[r] ?? 0;
          const da = hand?.[r] ?? 0;
          const fertig = ist >= soll;
          return (
            <li key={r} className={fertig ? 'fertig' : undefined}>
              <ResourceGlyph r={r} />
              <span>
                {resourceName(r)} {Math.min(ist, soll)}/{soll}
              </span>
              {!fertig && (
                <button
                  className="klein"
                  disabled={!darfZahlen || da <= 0}
                  title={da <= 0 ? 'Davon hast du nichts auf der Hand' : !darfZahlen ? 'In deiner Bauphase' : `Bis zu ${Math.min(da, soll - ist)} zahlen`}
                  onClick={() => onZahlen(r)}
                >
                  Zahlen ({Math.min(da, soll - ist)})
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  if (f.t === 'heer') {
    if (f.ids === null) return <p className="boss-klein">Rueste dich: Ritter und Bogenschuetzen in deinen Doerfern, Tuerme und Palisaden.</p>;
    const leben = state.units.filter((u) => f.ids!.includes(u.id));
    const erster = leben[0];
    return (
      <p className="boss-klein">
        {f.entkommen ? 'Es hat gepluendert - der Akt ist verloren.' : `Noch ${leben.length} von ${f.ids.length} Kaempfern stehen.`}{' '}
        {erster && (
          <button className="klein" onClick={() => onZeigen(erster.q, erster.r)}>
            Heer zeigen
          </button>
        )}
      </p>
    );
  }
  const ist = zielWert(state, you, f.mass, sichtbarePunkte(state));
  const [eins, viele] = ZIEL_NAME[f.mass];
  return (
    <p className="boss-klein">
      Jetzt: {ist} {ist === 1 ? eins : viele}, gefordert: {f.soll}.
    </p>
  );
}

/** Ein Wappen je Art: Muenze (Tribut), Schwerter (Heer), Turm (Wachstum). PLATZHALTER (ASSETS.md). */
function BossWappen({ art }: { art: 'tribut' | 'heer' | 'ziel' }) {
  return (
    <svg className="boss-wappen" viewBox="0 0 16 18" aria-hidden shapeRendering="crispEdges">
      <path d="M1 1h14v9l-7 7-7-7z" fill="#2a1f16" stroke="currentColor" strokeWidth="1" />
      {art === 'tribut' && (
        <>
          <rect x="5" y="4" width="6" height="6" fill="#d9a441" />
          <rect x="7" y="5" width="2" height="4" fill="#8a5a2b" />
        </>
      )}
      {art === 'heer' && <path d="M4 3l8 8M12 3l-8 8M3 11h3M10 11h3" stroke="#c9ccd6" strokeWidth="1.4" />}
      {art === 'ziel' && (
        <>
          <rect x="5" y="5" width="6" height="7" fill="#b0784a" />
          <rect x="5" y="3" width="2" height="2" fill="#b0784a" />
          <rect x="9" y="3" width="2" height="2" fill="#b0784a" />
          <rect x="7" y="9" width="2" height="3" fill="#2a1f16" />
        </>
      )}
    </svg>
  );
}
