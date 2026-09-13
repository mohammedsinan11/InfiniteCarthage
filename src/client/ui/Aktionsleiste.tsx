/**
 * Die Aktionsleiste rechts neben der Hand.
 *
 * Frueher eine Leiste unter der Karte, die erst in der eigenen Bauphase
 * erschien: vor dem ersten Ertrag war sie gar nicht da, und bei jedem Wurf
 * sprang das Brett, weil die Leiste kam und ging. Jetzt steht sie immer an
 * derselben Stelle - ausgegraut, solange ein Knopf nichts tun kann. Die Kosten
 * stehen als kleine Rohstoffbilder am Knopf statt im Tooltip, damit man ohne
 * Zeiger sieht, was fehlt.
 *
 * Handel und Entwicklungskarten klappen als kleine Tafeln darueber auf, statt
 * dauerhaft Platz zu belegen. Symbole sind PLATZHALTER (ASSETS.md).
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { RESOURCES } from '../../core/types';
import type { Resource } from '../../core/types';
import {
  COST_CITY,
  COST_DEV,
  COST_KNIGHT,
  COST_REBUILD_ROAD,
  COST_ROAD,
  COST_SETTLEMENT,
  COST_TOWER,
  canAfford,
} from '../../core/rules/costs';
import { haefenZu } from '../../core/rules/trade';
import type { Cost } from '../../core/rules/costs';
import type { Action } from '../../core/rules/reducer';
import type { PublicPlayer, PublicState } from '../../core/redact';
import type { DevCardType, Hand } from '../../core/state';
import { devName, resourceName } from '../log';
import { ResourceGlyph } from './ResourceIcon';

export type BuildMode = null | 'road' | 'settlement' | 'city' | 'tower';

const kostenText = (c: Cost): string =>
  RESOURCES.filter((r) => (c[r] ?? 0) > 0)
    .map((r) => `${c[r]}x ${resourceName(r)}`)
    .join(', ');

/** Ein Rohstoff als kleines Sinnbild. */
function Mini({ r, groesse = 11 }: { r: Resource; groesse?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={groesse} height={groesse} className="dock-mini" aria-hidden="true">
      <ResourceGlyph r={r} />
    </svg>
  );
}

function Kosten({ c }: { c: Cost }) {
  return (
    <span className="dock-kosten">
      {RESOURCES.filter((r) => (c[r] ?? 0) > 0).map((r) => (
        <span key={r} className="dock-kosten-teil">
          {(c[r] ?? 0) > 1 && <b>{c[r]}</b>}
          <Mini r={r} />
        </span>
      ))}
    </span>
  );
}

// --- Symbole: PLATZHALTER aus wenigen Flaechen ------------------------------

const Symbol = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 20 20" width={20} height={20} aria-hidden="true" className="dock-sym">
    {children}
  </svg>
);

const SymStrasse = () => (
  <Symbol>
    <path d="M3 16 L17 5" stroke="#2a2016" strokeWidth={6} strokeLinecap="round" />
    <path d="M3 16 L17 5" stroke="#c9a46a" strokeWidth={3} strokeLinecap="round" />
  </Symbol>
);
const SymSiedlung = () => (
  <Symbol>
    <path d="M4 17 V9 L10 3 L16 9 V17 Z" fill="#c9a46a" stroke="#2a2016" strokeWidth={1.6} strokeLinejoin="round" />
  </Symbol>
);
const SymStadt = () => (
  <Symbol>
    <path d="M2 17 V9 L7 3 L12 9 H18 V17 Z" fill="#c9a46a" stroke="#2a2016" strokeWidth={1.6} strokeLinejoin="round" />
  </Symbol>
);
const SymTurm = () => (
  <Symbol>
    <path d="M6 18 V7 H14 V18 Z" fill="#b9b3a6" stroke="#2a2016" strokeWidth={1.6} />
    <path d="M5 7 V3 H7 V5 H9 V3 H11 V5 H13 V3 H15 V7 Z" fill="#b9b3a6" stroke="#2a2016" strokeWidth={1.4} strokeLinejoin="round" />
    <rect x={9} y={10} width={2} height={3} fill="#f2c94c" />
  </Symbol>
);
const SymKarte = () => (
  <Symbol>
    <rect x={5} y={2} width={11} height={16} rx={1.5} fill="#6a4fa0" stroke="#2a2016" strokeWidth={1.6} />
    <path d="M10.5 6 L12 9.5 L10.5 13 L9 9.5 Z" fill="#f2e7d0" />
  </Symbol>
);
const SymRitter = () => (
  <Symbol>
    <path d="M5 17 V8 Q10 1 15 8 V17 Z" fill="#c9ccd6" stroke="#2a2016" strokeWidth={1.6} />
    <rect x={7} y={9} width={6} height={2} fill="#2a2016" />
  </Symbol>
);
const SymHandel = () => (
  <Symbol>
    <path d="M3 7 H15 M12 4 L15 7 L12 10" stroke="#c9a46a" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 13 H5 M8 10 L5 13 L8 16" stroke="#c9a46a" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Symbol>
);
const SymKarten = () => (
  <Symbol>
    <rect x={3} y={4} width={9} height={13} rx={1.2} fill="#8a6fc0" stroke="#2a2016" strokeWidth={1.4} transform="rotate(-10 7 10)" />
    <rect x={8} y={3} width={9} height={13} rx={1.2} fill="#6a4fa0" stroke="#2a2016" strokeWidth={1.4} />
  </Symbol>
);
const SymBeute = () => (
  <Symbol>
    <rect x={3} y={8} width={14} height={9} fill="#8a5a2b" stroke="#2a2016" strokeWidth={1.6} />
    <path d="M3 8 Q10 2 17 8" fill="#a8743a" stroke="#2a2016" strokeWidth={1.6} />
    <rect x={9} y={10} width={2} height={3} fill="#d9a441" />
  </Symbol>
);
const SymZugEnde = () => (
  <Symbol>
    <path d="M4 4 L11 10 L4 16 Z M11 4 L18 10 L11 16 Z" fill="#c9a46a" stroke="#2a2016" strokeWidth={1.2} strokeLinejoin="round" />
  </Symbol>
);

function DockKnopf({
  titel,
  symbol,
  kosten,
  zahl,
  gewaehlt = false,
  darf,
  leuchtet = false,
  tip,
  onClick,
}: {
  titel: string;
  symbol: ReactNode;
  kosten?: Cost;
  zahl?: number;
  gewaehlt?: boolean;
  darf: boolean;
  leuchtet?: boolean;
  tip?: string;
  onClick: () => void;
}) {
  const klassen = ['dock-knopf', gewaehlt ? 'gewaehlt' : '', leuchtet ? 'leuchtet' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      className={klassen}
      disabled={!darf}
      title={tip ?? (kosten ? `${titel}: ${kostenText(kosten)}` : titel)}
      onClick={onClick}
    >
      {symbol}
      <span className="dock-titel">{titel}</span>
      {kosten && <Kosten c={kosten} />}
      {zahl !== undefined && zahl > 0 && <span className="dock-zahl">{zahl}</span>}
    </button>
  );
}

/** Eine Reihe Rohstoffe zum Auswaehlen. */
function ResWahl({
  wert,
  setze,
  zeigeBestand,
}: {
  wert: Resource;
  setze: (r: Resource) => void;
  zeigeBestand?: Hand;
}) {
  return (
    <span className="dock-reswahl">
      {RESOURCES.map((r) => (
        <button
          key={r}
          className={wert === r ? 'dock-res gewaehlt' : 'dock-res'}
          title={zeigeBestand ? `${resourceName(r)}: ${zeigeBestand[r]}` : resourceName(r)}
          onClick={() => setze(r)}
        >
          <Mini r={r} groesse={16} />
          {zeigeBestand && <span>{zeigeBestand[r]}</span>}
        </button>
      ))}
    </span>
  );
}

function Tafel({ titel, onZu, children }: { titel: string; onZu: () => void; children: ReactNode }) {
  return (
    <div className="dock-tafel">
      <div className="dock-tafel-kopf">
        <span>{titel}</span>
        <button className="dock-zu" title="Schliessen" onClick={onZu}>
          x
        </button>
      </div>
      {children}
    </div>
  );
}

function HandelTafel({
  hand,
  verhaeltnis,
  darf,
  sturm,
  onTausch,
  onZu,
}: {
  hand: Hand;
  verhaeltnis: (r: Resource) => number;
  darf: boolean;
  /** Bei Sturm sind die Haefen zu (core/zeit.ts). */
  sturm: boolean;
  onTausch: (gib: Resource, nimm: Resource) => void;
  onZu: () => void;
}) {
  // Voreingestellt: wovon man am meisten hat.
  const [gib, setGib] = useState<Resource>(() =>
    RESOURCES.reduce((a, b) => (hand[b] > hand[a] ? b : a)),
  );
  const [nimm, setNimm] = useState<Resource>('ore');
  const v = verhaeltnis(gib);
  const geht = darf && gib !== nimm && hand[gib] >= v;
  return (
    <Tafel titel="Bankhandel" onZu={onZu}>
      <div className="dock-tafel-zeile">
        <span className="dock-tafel-label">Gib {v}</span>
        <ResWahl wert={gib} setze={setGib} zeigeBestand={hand} />
      </div>
      <div className="dock-tafel-zeile">
        <span className="dock-tafel-label">Nimm 1</span>
        <ResWahl wert={nimm} setze={setNimm} />
      </div>
      <button className="primary dock-tafel-los" disabled={!geht} onClick={() => onTausch(gib, nimm)}>
        {v}x {resourceName(gib)} gegen {resourceName(nimm)}
      </button>
      {sturm && <p className="dock-tafel-klein">Sturm: die Haefen sind geschlossen.</p>}
    </Tafel>
  );
}

function KartenTafel({
  anzahl,
  kannSpielen,
  act,
  onZu,
}: {
  anzahl: Map<DevCardType, number>;
  kannSpielen: (t: DevCardType) => boolean;
  act: (a: Action) => void;
  onZu: () => void;
}) {
  const [monopol, setMonopol] = useState<Resource>('lumber');
  const [erfA, setErfA] = useState<Resource>('lumber');
  const [erfB, setErfB] = useState<Resource>('brick');

  const zeile = (t: DevCardType, aktion?: () => void, extra?: ReactNode) => (
    <div key={t} className="dock-karte">
      <span className="dock-karte-name">
        {devName(t)} x{anzahl.get(t)}
      </span>
      {aktion && (
        <button disabled={!kannSpielen(t)} onClick={aktion}>
          Spielen
        </button>
      )}
      {extra && <div className="dock-karte-extra">{extra}</div>}
    </div>
  );

  return (
    <Tafel titel="Entwicklungskarten" onZu={onZu}>
      {[...anzahl.keys()].map((t) => {
        switch (t) {
          case 'knight':
            return zeile(t, () => act({ t: 'playKnight' }));
          case 'roadBuilding':
            return zeile(t, () => act({ t: 'playRoadBuilding' }));
          case 'monopoly':
            return zeile(
              t,
              () => act({ t: 'playMonopoly', resource: monopol }),
              <ResWahl wert={monopol} setze={setMonopol} />,
            );
          case 'yearOfPlenty':
            return zeile(
              t,
              () => act({ t: 'playYearOfPlenty', a: erfA, b: erfB }),
              <>
                <ResWahl wert={erfA} setze={setErfA} />
                <ResWahl wert={erfB} setze={setErfB} />
              </>,
            );
          default:
            return zeile(t);
        }
      })}
      <p className="dock-tafel-klein">
        Gekaufte Karten sind ab dem naechsten Zug spielbar, eine je Zug.
      </p>
    </Tafel>
  );
}

export function Aktionsleiste({
  state,
  me,
  hand,
  isMine,
  mode,
  setMode,
  act,
  verhaeltnis,
  onTafel,
}: {
  state: PublicState;
  me: PublicPlayer | undefined;
  hand: Hand;
  isMine: boolean;
  mode: BuildMode;
  setMode: (m: BuildMode) => void;
  act: (a: Action) => void;
  verhaeltnis: (r: Resource) => number;
  /** Meldet, ob gerade eine Tafel offen ist - solange wuerfelt niemand von selbst. */
  onTafel?: (offen: boolean) => void;
}) {
  const phase = state.phase;
  const bauen = isMine && phase.t === 'main';
  const [tafel, setTafel] = useState<null | 'handel' | 'karten'>(null);

  // Nicht am Zug: offene Tafeln zu, ein halb gewaehlter Bau verfaellt.
  useEffect(() => {
    if (!isMine) setTafel(null);
  }, [isMine]);
  useEffect(() => {
    onTafel?.(tafel !== null);
  }, [tafel, onTafel]);

  const offen = (me?.dev ?? []).filter((d) => !d.played);
  const anzahl = new Map<DevCardType, number>();
  for (const d of offen) anzahl.set(d.type, (anzahl.get(d.type) ?? 0) + 1);
  const kannSpielen = (t: DevCardType): boolean =>
    isMine &&
    !state.devPlayedThisTurn &&
    t !== 'victoryPoint' &&
    (phase.t === 'main' || (t === 'knight' && phase.t === 'roll')) &&
    offen.some((d) => d.type === t && d.boughtTurn < state.turn);

  const hinweis = !isMine
    ? state.order.length > 1
      ? 'Nicht dein Zug'
      : ''
    : phase.t === 'setup'
      ? phase.awaiting === 'settlement'
        ? 'Aufbau: setze ein Dorf'
        : 'Aufbau: setze eine Strasse'
      : phase.t === 'roll'
        ? 'Erst wuerfeln'
        : phase.t === 'roadBuilding'
          ? `Strassenbau: noch ${phase.remaining} setzen`
          : mode !== null
            ? 'Bauplatz auf der Karte waehlen'
            : '';

  const bau = (m: Exclude<BuildMode, null>) => () => setMode(mode === m ? null : m);
  // Auf eigener Asche kostet eine Strasse nur Holz (rules/feuer.ts).
  const eigeneAsche = Object.values(state.asche).some((id) => id === me?.id);
  const strasseGeht = canAfford(hand, COST_ROAD) || (eigeneAsche && canAfford(hand, COST_REBUILD_ROAD));
  const turmPlatz = Object.values(state.buildings).some((b) => b.owner === me?.id && !b.turm);
  const umschalten = (t: 'handel' | 'karten') => () => setTafel((alt) => (alt === t ? null : t));

  return (
    <div className="dock">
      {tafel === 'handel' && (
        <HandelTafel
          hand={hand}
          verhaeltnis={verhaeltnis}
          darf={bauen}
          onTausch={(give, receive) => act({ t: 'bankTrade', give, receive })}
          sturm={haefenZu(state)}
          onZu={() => setTafel(null)}
        />
      )}
      {tafel === 'karten' && (
        <KartenTafel anzahl={anzahl} kannSpielen={kannSpielen} act={act} onZu={() => setTafel(null)} />
      )}

      <div className="dock-reihe">
        <DockKnopf
          titel="Strasse"
          symbol={<SymStrasse />}
          kosten={COST_ROAD}
          gewaehlt={mode === 'road'}
          darf={bauen && strasseGeht}
          tip={`Strasse: ${kostenText(COST_ROAD)}${eigeneAsche ? ` - auf eigener Asche nur ${kostenText(COST_REBUILD_ROAD)}` : ''}`}
          onClick={bau('road')}
        />
        <DockKnopf titel="Dorf" symbol={<SymSiedlung />} kosten={COST_SETTLEMENT} gewaehlt={mode === 'settlement'} darf={bauen && canAfford(hand, COST_SETTLEMENT)} onClick={bau('settlement')} />
        <DockKnopf titel="Stadt" symbol={<SymStadt />} kosten={COST_CITY} gewaehlt={mode === 'city'} darf={bauen && canAfford(hand, COST_CITY)} onClick={bau('city')} />
        <DockKnopf
          titel="Turm"
          symbol={<SymTurm />}
          kosten={COST_TOWER}
          gewaehlt={mode === 'tower'}
          darf={bauen && turmPlatz && canAfford(hand, COST_TOWER)}
          tip={`Wachturm an ein Dorf oder eine Stadt: sieht weiter, auch nachts, und laesst Brandstifter nicht an Haus und Strassen. ${kostenText(COST_TOWER)}`}
          onClick={bau('tower')}
        />
        <span className="dock-trenner" />
        <DockKnopf titel="Karte" symbol={<SymKarte />} kosten={COST_DEV} darf={bauen && canAfford(hand, COST_DEV)} tip={`Entwicklungskarte kaufen (${state.deckLeft} im Stapel): ${kostenText(COST_DEV)}`} onClick={() => act({ t: 'buyDev' })} />
        <DockKnopf titel="Ritter" symbol={<SymRitter />} kosten={COST_KNIGHT} darf={bauen && canAfford(hand, COST_KNIGHT)} tip={`Ein Ritter tritt an einer deiner Siedlungen an: ${kostenText(COST_KNIGHT)}`} onClick={() => act({ t: 'recruitKnight' })} />
        <span className="dock-trenner" />
        <DockKnopf titel="Handel" symbol={<SymHandel />} gewaehlt={tafel === 'handel'} darf={bauen} tip="Bankhandel" onClick={umschalten('handel')} />
        <DockKnopf titel="Karten" symbol={<SymKarten />} zahl={offen.length} gewaehlt={tafel === 'karten'} darf={offen.length > 0} tip="Deine Entwicklungskarten" onClick={umschalten('karten')} />
        {(me?.loot ?? 0) > 0 && (
          <DockKnopf titel="Beute" symbol={<SymBeute />} zahl={me?.loot} leuchtet darf={bauen} tip="Beute einloesen: eine Kartenwahl" onClick={() => act({ t: 'claimLoot' })} />
        )}
        {state.order.length > 1 && (
          <DockKnopf titel="Zug Ende" symbol={<SymZugEnde />} darf={bauen} tip="Zug beenden" onClick={() => act({ t: 'endTurn' })} />
        )}
      </div>
      {hinweis && <div className="dock-hinweis">{hinweis}</div>}
    </div>
  );
}
