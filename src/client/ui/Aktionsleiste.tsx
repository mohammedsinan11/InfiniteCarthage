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
  COST_ARCHER,
  COST_REBUILD_ROAD,
  COST_ROAD,
  COST_SETTLEMENT,
  COST_TOWER,
  COST_CAPITAL,
  canAfford,
} from '../../core/rules/costs';
import { haefenZu } from '../../core/rules/trade';
import { REICHSBAU_NAME, REICHSBAU_ZWECK } from '../../core/rules/reich';
import { COST_REICHSBAU } from '../../core/rules/costs';
import type { Cost } from '../../core/rules/costs';
import type { Action } from '../../core/rules/reducer';
import type { PublicPlayer, PublicState } from '../../core/redact';
import type { DevCardType, Hand, HeldZweig } from '../../core/state';
import { ZWEIGE, ZWEIG_NAME, ZWEIG_ZWECK } from '../../core/rules/zweig';
import { devName, resourceName } from '../log';
import { ResourceGlyph } from './ResourceIcon';
import { cardById } from '../../core/cards/catalog';
import { taktikwirkungen } from '../../core/cards/types';

/**
 * Was gerade gebaut wird. Die Reichsbauten der Phase 2 stehen auf Kacheln,
 * nicht auf Ecken - ihr Modus traegt die Art im Namen (rules/reich.ts).
 */
export type BuildMode =
  | null
  | 'road'
  | 'settlement'
  | 'city'
  | 'tower'
  | 'reich:burgfeste'
  | 'reich:handelskontor'
  | 'reich:tempel';

/** Die Art hinter einem Reichsbau-Modus, sonst null. */
export const reichArtVon = (m: BuildMode): string | null =>
  typeof m === 'string' && m.startsWith('reich:') ? m.slice(6) : null;

/**
 * Bauen als eigene Zeile (Entwurf V2): "Bauen" tauscht die Leiste gegen
 * Strasse, Dorf, Stadt, Turm und - wenn moeglich - Hauptstadt; ein Pfeil fuehrt
 * zurueck. Auf dem Handy passte die lange Leiste nicht mehr in eine Reihe.
 * Vorerst aus: die Leiste war noch nicht so breit, dass es sich lohnte - und in
 * der Bauzeile fehlten Beute, Handel und Zug Ende, solange sie offen stand.
 * true schaltet die Bauzeile wieder ein.
 */
export const BAU_ZEILE = false;

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

export function Kosten({ c }: { c: Cost }) {
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
/** Bogen mit Sehne und Pfeil. PLATZHALTER (ASSETS.md). */
const SymBogen = () => (
  <Symbol>
    <path d="M6 3 Q16 10 6 17" fill="none" stroke="#8a6a45" strokeWidth={2.2} strokeLinecap="round" />
    <path d="M6 3 V17" stroke="#e2d2ab" strokeWidth={1} />
    <path d="M3 10 H16 M13 7.5 L16 10 L13 12.5" fill="none" stroke="#c9ccd6" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
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

const SymBauen = () => (
  <Symbol>
    <path d="M4 17 L11 10" stroke="#2a2016" strokeWidth={4} strokeLinecap="round" />
    <path d="M4 17 L11 10" stroke="#8a6a45" strokeWidth={2} strokeLinecap="round" />
    <path d="M8 5 L13 2 L18 7 L15 12 Z" fill="#b9b3a6" stroke="#2a2016" strokeWidth={1.5} strokeLinejoin="round" />
  </Symbol>
);
/** Die drei Ernannten: Schwert, Kelch, Waage - und der Rueckweg. */
const SymZweig = ({ zweig }: { zweig: HeldZweig | 'zurueck' }) => (
  <Symbol>
    {zweig === 'krieger' && (
      <path d="M10 2 L12 7 V13 h-4 V7 Z M6 13 h8 v2 H6 Z" fill="#b9b3a6" stroke="#2a2016" strokeWidth={1.3} strokeLinejoin="round" />
    )}
    {zweig === 'heilerin' && (
      <>
        <path d="M7 4 h6 v4 a3 3 0 0 1 -6 0 Z" fill="#f2c94c" stroke="#2a2016" strokeWidth={1.3} strokeLinejoin="round" />
        <path d="M10 11 v5 M7 16 h6" stroke="#2a2016" strokeWidth={1.4} strokeLinecap="round" />
      </>
    )}
    {zweig === 'haendler' && (
      <>
        <path d="M10 3 v12 M4 7 h12" stroke="#2a2016" strokeWidth={1.4} strokeLinecap="round" />
        <path d="M4 7 L2 11 h4 Z M16 7 L14 11 h4 Z" fill="#c9a46a" stroke="#2a2016" strokeWidth={1.1} strokeLinejoin="round" />
      </>
    )}
    {zweig === 'zurueck' && (
      <path d="M13 5 L7 10 L13 15" fill="none" stroke="#2a2016" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    )}
  </Symbol>
);

/** Die drei Reichsbauten: Turm, Waage, Saeule - grob wie ihre Bauten. */
const SymReich = ({ art }: { art: string }) => (
  <Symbol>
    {art === 'burgfeste' && (
      <path d="M4 16 V6 h3 V4 h2 v2 h2 V4 h2 v2 h3 v10 Z" fill="#b9b3a6" stroke="#2a2016" strokeWidth={1.4} strokeLinejoin="round" />
    )}
    {art === 'handelskontor' && (
      <>
        <path d="M3 8 L10 3 L17 8 V16 H3 Z" fill="#c94f3a" stroke="#2a2016" strokeWidth={1.4} strokeLinejoin="round" />
        <rect x={7} y={10} width={6} height={6} fill="#e2d2ab" />
      </>
    )}
    {art === 'tempel' && (
      <>
        <path d="M10 2 L16 8 H4 Z" fill="#f2c94c" stroke="#2a2016" strokeWidth={1.4} strokeLinejoin="round" />
        <rect x={5} y={8} width={2} height={8} fill="#e2d2ab" stroke="#2a2016" strokeWidth={1} />
        <rect x={9} y={8} width={2} height={8} fill="#e2d2ab" stroke="#2a2016" strokeWidth={1} />
        <rect x={13} y={8} width={2} height={8} fill="#e2d2ab" stroke="#2a2016" strokeWidth={1} />
      </>
    )}
  </Symbol>
);

const SymHauptstadt = () => (
  <Symbol>
    <path d="M3 16 V7 L7 11 L10 4 L13 11 L17 7 V16 Z" fill="#f2c94c" stroke="#2a2016" strokeWidth={1.6} strokeLinejoin="round" />
    <rect x={5} y={13} width={10} height={2} fill="#9c3226" />
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
  taktiken,
  einheiten,
  darfTaktik,
  kannSpielen,
  act,
  onZu,
}: {
  anzahl: Map<DevCardType, number>;
  taktiken: string[];
  einheiten: PublicState['units'];
  darfTaktik: boolean;
  kannSpielen: (t: DevCardType) => boolean;
  act: (a: Action) => void;
  onZu: () => void;
}) {
  const [monopol, setMonopol] = useState<Resource>('lumber');
  const [erfA, setErfA] = useState<Resource>('lumber');
  const [erfB, setErfB] = useState<Resource>('brick');
  const [ziel, setZiel] = useState<Record<string, number>>({});

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
    <Tafel titel="Karten" onZu={onZu}>
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
      {taktiken.map((id, index) => {
        const karte = cardById(id);
        if (!karte) return null;
        const effekte = taktikwirkungen(karte);
        const brauchtHeld = effekte.some((e) => e.t === 'heroReroll' || (e.t === 'healUnit' && e.heroOnly));
        const brauchtBogen = effekte.some((e) => e.t === 'rangedAttack');
        const kandidaten = einheiten.filter(
          (u) => (!brauchtHeld || u.kind === 'held') && (!brauchtBogen || u.kind === 'bogen'),
        );
        const gewaehlt = ziel[`${id}-${index}`] ?? kandidaten[0]?.id;
        return (
          <div key={`${id}-${index}`} className="dock-karte dock-taktik">
            <span className="dock-karte-name">{karte.name}</span>
            <span className="dock-karte-beschreibung">{karte.text}</span>
            <select
              aria-label={`Ziel fuer ${karte.name}`}
              value={gewaehlt ?? ''}
              onChange={(e) => setZiel((alt) => ({ ...alt, [`${id}-${index}`]: Number(e.target.value) }))}
            >
              {kandidaten.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.kind} #{u.id} · Feld {u.q}/{u.r}
                </option>
              ))}
            </select>
            <button
              disabled={!darfTaktik || gewaehlt === undefined}
              onClick={() => act({ t: 'playTactic', card: id, unit: gewaehlt! })}
            >
              Ausspielen
            </button>
          </div>
        );
      })}
      <p className="dock-tafel-klein">
        Entwicklungskarten gelten ab dem naechsten Zug. Taktiken werden verbraucht und wirken sofort oder in der naechsten Kampfrunde.
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
  hauptstadtBereit = false,
  reichOffen = false,
  onHauptstadt,
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
  /** Ein Feld ist fuer die Hauptstadt geschlossen - der Knopf erscheint in der Bauzeile. */
  hauptstadtBereit?: boolean;
  /** Steht ein Koenigssitz? Dann zeigt die Leiste die Reichsbauten (Phase 2). */
  reichOffen?: boolean;
  /** Zur Hauptstadt fahren und ihre Tafel oeffnen. */
  onHauptstadt?: () => void;
}) {
  const phase = state.phase;
  const bauen = isMine && phase.t === 'main';
  const [tafel, setTafel] = useState<null | 'handel' | 'karten'>(null);
  // Welcher Ernannte gerade zur Bestaetigung ansteht (rules/zweig.ts).
  const [ernennen, setErnennen] = useState<HeldZweig | null>(null);

  /** Steht die Bauzeile statt der Leiste? (BAU_ZEILE) */
  const [bauOffen, setBauOffen] = useState(false);

  // Nicht am Zug: offene Tafeln zu, die Bauzeile auch, ein halb gewaehlter Bau verfaellt.
  useEffect(() => {
    if (!isMine) {
      setTafel(null);
      setBauOffen(false);
    }
  }, [isMine]);
  useEffect(() => {
    onTafel?.(tafel !== null);
  }, [tafel, onTafel]);

  const offen = (me?.dev ?? []).filter((d) => !d.played);
  const taktiken = me?.tactics ?? [];
  const eigeneEinheiten = state.units.filter((u) => u.owner === me?.id);
  const anzahl = new Map<DevCardType, number>();
  for (const d of offen) anzahl.set(d.type, (anzahl.get(d.type) ?? 0) + 1);
  const kannSpielen = (t: DevCardType): boolean =>
    isMine &&
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
  // Ein Turm braucht eine eigene Strasse an seiner Ecke (rules/placement.ts).
  const turmPlatz = Object.values(state.roads).some((id) => id === me?.id);
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
        <KartenTafel
          anzahl={anzahl}
          taktiken={taktiken}
          einheiten={eigeneEinheiten}
          darfTaktik={isMine && phase.t === 'main'}
          kannSpielen={kannSpielen}
          act={act}
          onZu={() => setTafel(null)}
        />
      )}

      <div className="dock-reihe">
        {BAU_ZEILE && !bauOffen && (
          <>
            <DockKnopf
              titel="Bauen"
              symbol={<SymBauen />}
              darf
              leuchtet={hauptstadtBereit}
              tip={hauptstadtBereit ? 'Bauen - eine Hauptstadt ist moeglich' : 'Bauen: Strasse, Dorf, Stadt, Turm'}
              onClick={() => setBauOffen(true)}
            />
            <span className="dock-trenner" />
          </>
        )}
        {BAU_ZEILE && bauOffen && (
          <button
            className="dock-knopf dock-zurueck"
            title="Zurueck zur Leiste"
            onClick={() => {
              setBauOffen(false);
              setMode(null);
            }}
          >
            &lsaquo;
          </button>
        )}
        {(!BAU_ZEILE || bauOffen) && (
          <>
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
          tip={`Wachturm auf eine freie Ecke an einer eigenen Strasse - ohne Abstandsregel. Sieht weit, auch nachts, und laesst Brandstifter nicht an Haeuser und Strassen nebenan. ${kostenText(COST_TOWER)}`}
          onClick={bau('tower')}
        />
        {hauptstadtBereit && (
          <DockKnopf
            titel="Hauptstadt"
            symbol={<SymHauptstadt />}
            kosten={COST_CAPITAL}
            leuchtet
            darf={bauen && canAfford(hand, COST_CAPITAL)}
            tip={`Hauptstadt auf dem umschlossenen Feld: ${kostenText(COST_CAPITAL)}`}
            onClick={() => onHauptstadt?.()}
          />
        )}
        {/*
          Phase 2: die drei Reichsbauten. Sie erscheinen erst, wenn ein
          Koenigssitz steht (rules/reich.ts, hatKoenigssitz) - vorher gibt es
          kein Reich, in dem sie stehen koennten.
        */}
        {reichOffen && (
          <>
            <span className="dock-trenner" />
            {(['burgfeste', 'handelskontor', 'tempel'] as const).map((art) => (
              <DockKnopf
                key={art}
                titel={REICHSBAU_NAME[art]}
                symbol={<SymReich art={art} />}
                kosten={COST_REICHSBAU[art]!}
                gewaehlt={mode === `reich:${art}`}
                darf={bauen && canAfford(hand, COST_REICHSBAU[art]!)}
                tip={`${REICHSBAU_NAME[art]}: ${REICHSBAU_ZWECK[art]}. Auf eine Kachel im eigenen Reich - ${kostenText(COST_REICHSBAU[art]!)}`}
                onClick={bau(`reich:${art}` as Exclude<BuildMode, null>)}
              />
            ))}
          </>
        )}
        {/*
          Phase 2: der Held, den der Koenig ernennt (rules/zweig.ts). Sichtbar,
          solange die Wahl offen ist - danach steht er auf der Karte.

          Zwei Schritte, weil die Wahl ENDGUELTIG ist: ein Fehlklick soll nicht
          die groesste Entscheidung der Partie treffen.
        */}
        {reichOffen && !me?.ernannt && (
          <>
            <span className="dock-trenner" />
            {ernennen === null ? (
              ZWEIGE.map((z) => (
                <DockKnopf
                  key={z}
                  titel={ZWEIG_NAME[z]}
                  symbol={<SymZweig zweig={z} />}
                  darf={bauen}
                  tip={`${ZWEIG_NAME[z]} ernennen - ${ZWEIG_ZWECK[z]}. Du hast nur diese eine Wahl, sie gilt die ganze Partie.`}
                  onClick={() => setErnennen(z)}
                />
              ))
            ) : (
              <>
                <DockKnopf
                  titel={`${ZWEIG_NAME[ernennen]} ernennen`}
                  symbol={<SymZweig zweig={ernennen} />}
                  leuchtet
                  darf={bauen}
                  tip={`Endgueltig ${ZWEIG_NAME[ernennen]} ernennen. Die anderen beiden bleiben die ganze Partie zu.`}
                  onClick={() => {
                    act({ t: 'ernenne', zweig: ernennen });
                    setErnennen(null);
                  }}
                />
                <DockKnopf
                  titel="Zurueck"
                  symbol={<SymZweig zweig="zurueck" />}
                  darf
                  tip="Doch nicht - noch ist nichts entschieden."
                  onClick={() => setErnennen(null)}
                />
              </>
            )}
          </>
        )}
          </>
        )}
        {(!BAU_ZEILE || !bauOffen) && (
          <>
        {!BAU_ZEILE && <span className="dock-trenner" />}
        <DockKnopf titel="Karte" symbol={<SymKarte />} kosten={COST_DEV} darf={bauen && canAfford(hand, COST_DEV)} tip={`Entwicklungskarte kaufen (${state.deckLeft} im Stapel): ${kostenText(COST_DEV)}`} onClick={() => act({ t: 'buyDev' })} />
        <DockKnopf titel="Ritter" symbol={<SymRitter />} kosten={COST_KNIGHT} darf={bauen && canAfford(hand, COST_KNIGHT)} tip={`Ein Ritter tritt an einer deiner Siedlungen oder Burgfesten an: ${kostenText(COST_KNIGHT)}`} onClick={() => act({ t: 'recruitKnight' })} />
        <DockKnopf titel="Bogen" symbol={<SymBogen />} kosten={COST_ARCHER} darf={bauen && canAfford(hand, COST_ARCHER)} tip={`Ein Bogenschuetze tritt an einer deiner Siedlungen oder Burgfesten an. Schiesst auf Feinde nebenan, neben einem Wachturm zwei Felder weit: ${kostenText(COST_ARCHER)}`} onClick={() => act({ t: 'recruitArcher' })} />
        <span className="dock-trenner" />
        <DockKnopf titel="Handel" symbol={<SymHandel />} gewaehlt={tafel === 'handel'} darf={bauen} tip="Bankhandel" onClick={umschalten('handel')} />
        <DockKnopf titel="Karten" symbol={<SymKarten />} zahl={offen.length + taktiken.length} gewaehlt={tafel === 'karten'} darf={offen.length + taktiken.length > 0} tip="Deine Entwicklungs- und Taktikkarten" onClick={umschalten('karten')} />
        {/* Beute rechts neben Handel und Karten - dort, wo Karten ohnehin hingehen. */}
        {(me?.loot ?? 0) > 0 && (
          <DockKnopf titel="Beute" symbol={<SymBeute />} zahl={me?.loot} leuchtet darf={bauen} tip="Beute einloesen: eine Kartenwahl" onClick={() => act({ t: 'claimLoot' })} />
        )}
        {state.order.length > 1 && (
          <DockKnopf titel="Zug Ende" symbol={<SymZugEnde />} darf={bauen} tip="Zug beenden" onClick={() => act({ t: 'endTurn' })} />
        )}
          </>
        )}
      </div>
      {hinweis && <div className="dock-hinweis">{hinweis}</div>}
    </div>
  );
}
