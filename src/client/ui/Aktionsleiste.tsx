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

import { wirkungenVon } from '../../core/cards/wirkung';
import { gesperrt } from '../../core/cards/effects';
import { kannBezahlen } from '../../core/rules/kosten';
import type { Bauwerk } from '../../core/cards/types';
import { useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { RESOURCES } from '../../core/types';
import type { Resource } from '../../core/types';
import {
  COST_CITY,
  COST_DEV,
  COST_REBUILD_ROAD,
  COST_ROAD,
  COST_SETTLEMENT,
  COST_TOWER,
  COST_MAUER,
  COST_TOR,
  COST_CAPITAL,
  canAfford,
} from '../../core/rules/costs';
import { haefenZu } from '../../core/rules/trade';
import { legalCityVertices } from '../../core/rules/placement';
import { stadtReif } from '../../core/bevoelkerung';
import { REICHSBAU_NAME, REICHSBAU_ZWECK } from '../../core/rules/reich';
import { COST_REICHSBAU } from '../../core/rules/costs';
import type { Cost } from '../../core/rules/costs';
import type { Action } from '../../core/rules/reducer';
import { SPENDE_KARTEN, marktPreisFuer } from '../../core/rules/reducer';
import type { PublicPlayer, PublicState } from '../../core/redact';
import type { DevCardType, Hand, HeldZweig } from '../../core/state';
import { ZWEIGE, ZWEIG_NAME, ZWEIG_ZWECK } from '../../core/rules/zweig';
import { devName, resourceName } from '../log';
import { ResourceGlyph } from './ResourceIcon';
import { KartenBild } from './KartenBild';
import { einheitNamen } from '../heer';
import { heldKurz } from '../../core/lore';
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
  | 'mauer'
  | 'tor'
  | 'reich:burgfeste'
  | 'reich:handelskontor'
  | 'reich:tempel';

/** Die Art hinter einem Reichsbau-Modus, sonst null. */
export const reichArtVon = (m: BuildMode): string | null =>
  typeof m === 'string' && m.startsWith('reich:') ? m.slice(6) : null;


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
const SymKarte = () => (
  <Symbol>
    <rect x={5} y={2} width={11} height={16} rx={1.5} fill="#6a4fa0" stroke="#2a2016" strokeWidth={1.6} />
    <path d="M10.5 6 L12 9.5 L10.5 13 L9 9.5 Z" fill="#f2e7d0" />
  </Symbol>
);
export const SymHandel = () => (
  <Symbol>
    <path d="M3 7 H15 M12 4 L15 7 L12 10" stroke="#c9a46a" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 13 H5 M8 10 L5 13 L8 16" stroke="#c9a46a" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
  hops = false,
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
  /** Huepft, bis man ihn drueckt - fuer Beute, die sonst uebersehen wird. */
  hops?: boolean;
  tip?: string;
  onClick: () => void;
}) {
  const klassen = ['dock-knopf', gewaehlt ? 'gewaehlt' : '', leuchtet ? 'leuchtet' : '', hops ? 'hops' : '']
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
  gruende,
  darf,
  sturm,
  onTausch,
  onZu,
  markt,
  onAngebot,
}: {
  /** Der Markt (rules/reducer.ts, visitMarket): Ueberschuss gegen eine Kartenwahl. */
  markt?: { darf: boolean; besucht: boolean; preis: number; onMarkt: () => void };
  /** Mit Mitspielern handeln - nur zu mehreren (ui/TradePanel.tsx). */
  onAngebot?: () => void;
  hand: Hand;
  verhaeltnis: (r: Resource) => number;
  /** Warum der Kurs so ist, wie er ist (rules/trade.ts, tradeRatioErklaert). */
  gruende?: (r: Resource) => string[];
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
  // Nie dieselbe Sorte vorschlagen (Spieltest 8: "4x Erz gegen Erz"): die knappste andere.
  const [nimm, setNimm] = useState<Resource>(() => {
    const geben = RESOURCES.reduce((a, b) => (hand[b] > hand[a] ? b : a));
    return RESOURCES.filter((r) => r !== geben).reduce((a, b) => (hand[b] < hand[a] ? b : a));
  });
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
      {/* Der Aufschlag stand nur im Kleingedruckten (Spieltest 7) - jetzt sichtbar. */}
      {(gruende?.(gib) ?? []).some((g) => g.includes('Tausch in diesem Zug')) ? (
        <p className="dock-tafel-warnung dock-tafel-aufschlag">Teurer: jeder weitere Tausch in diesem Zug kostet mehr - der Markt ist oft guenstiger.</p>
      ) : (
        <p className="dock-tafel-klein dock-tafel-aufschlag">Der erste Tausch je Zug zum Grundkurs, jeder weitere kostet mehr.</p>
      )}
      <button className="primary dock-tafel-los" disabled={!geht} onClick={() => onTausch(gib, nimm)}>
        {v}x {resourceName(gib)} gegen {resourceName(nimm)}
      </button>
      <p className="dock-tafel-klein">
        Kurs {v}:1 - Grundkurs 4:1
        {(gruende?.(gib) ?? []).map((g) => `, ${g}`).join('')}
      </p>
      {sturm && <p className="dock-tafel-klein">Sturm: die Haefen sind geschlossen.</p>}
      {markt && (
        <div className="dock-markt">
          <button
            disabled={!markt.darf}
            title={markt.besucht ? 'In diesem Zug warst du schon auf dem Markt.' : `${markt.preis} Karten von deinen groessten Stapeln - dafuer eine Kartenwahl`}
            onClick={markt.onMarkt}
          >
            Auf den Markt: {markt.preis} Karten gegen eine Kartenwahl
          </button>
          <p className="dock-tafel-klein">
            {markt.besucht ? 'Heute warst du schon dort.' : 'Nimmt vom groessten Stapel - einmal je Zug. Gut fuer Ueberschuss.'}
          </p>
        </div>
      )}
      {onAngebot && (
        <div className="dock-markt">
          <button disabled={!darf} onClick={onAngebot}>
            Mitspielern etwas anbieten
          </button>
        </div>
      )}
    </Tafel>
  );
}

function KartenTafel({
  anzahl,
  taktiken,
  einheiten,
  heldName,
  darfTaktik,
  kannSpielen,
  kaufen,
  act,
  onZu,
}: {
  /** Eine neue Karte kaufen - frueher ein eigener Knopf in der Leiste. */
  kaufen: { darf: boolean; hand: Hand };
  anzahl: Map<DevCardType, number>;
  taktiken: string[];
  einheiten: PublicState['units'];
  /** Der Name des Helden (core/lore.ts) - statt "held" im Zielfeld. */
  heldName?: string | null;
  darfTaktik: boolean;
  kannSpielen: (t: DevCardType) => boolean;
  act: (a: Action) => void;
  onZu: () => void;
}) {
  const namen = einheitNamen(einheiten, heldName ?? undefined);
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
      <div className="dock-karte dock-kaufen">
        <SymKarte />
        <span className="dock-karte-name">Neue Karte</span>
        <Kosten c={COST_DEV} />
        <button
          disabled={!kaufen.darf || !canAfford(kaufen.hand, COST_DEV)}
          title={`Entwicklungskarte kaufen: ${kostenText(COST_DEV)} - Ritter, Fortschritt oder ein Siegpunkt`}
          onClick={() => act({ t: 'buyDev' })}
        >
          Kaufen
        </button>
      </div>
      {/* Spenden: ein Abfluss fuer den Ueberschuss, ehe die Pluenderer ihn holen (Spieltest 9). */}
      <div className="dock-karte dock-kaufen">
        <SymKarte />
        <span className="dock-karte-name">Spenden</span>
        <span className="dock-karte-beschreibung">{SPENDE_KARTEN} Karten von den groessten Stapeln: 1 Ruhm.</span>
        <button
          disabled={!kaufen.darf || Object.values(kaufen.hand).reduce((n, x) => n + x, 0) < SPENDE_KARTEN}
          title="Ruhm zaehlt in der Wertung - besser als Karten, die verderben oder geraubt werden"
          onClick={() => act({ t: 'spenden' })}
        >
          Spenden
        </button>
      </div>
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
            <span className="dock-karte-name mit-bild">
              <KartenBild karte={karte} klein />
              {karte.name}
            </span>
            <span className="dock-karte-beschreibung">{karte.text}</span>
            <select
              aria-label={`Ziel fuer ${karte.name}`}
              value={gewaehlt ?? ''}
              onChange={(e) => setZiel((alt) => ({ ...alt, [`${id}-${index}`]: Number(e.target.value) }))}
            >
              {kandidaten.map((u) => (
                <option key={u.id} value={u.id}>
                  {namen.get(u.id) ?? 'Einheit'}
                  {u.leben !== undefined ? ` · ${u.leben} Leben` : ''}
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
        Entwicklungskarten gelten ab dem naechsten Zug. Taktiken werden verbraucht und wirken sofort oder in den naechsten Kampfrunden.
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
  gruende,
  onTafel,
  tafel,
  setTafel,
  hauptstadtBereit = false,
  reichOffen = false,
  onHauptstadt,
  onAngebot,
  dorfPlatz = true,
}: {
  state: PublicState;
  me: PublicPlayer | undefined;
  hand: Hand;
  isMine: boolean;
  mode: BuildMode;
  setMode: (m: BuildMode) => void;
  act: (a: Action) => void;
  verhaeltnis: (r: Resource) => number;
  gruende?: (r: Resource) => string[];
  /** Meldet, ob gerade eine Tafel offen ist - solange wuerfelt niemand von selbst. */
  onTafel?: (offen: boolean) => void;
  /*
   * Welche Tafel offen ist - gesteuert von aussen (scenes/Game.tsx).
   *
   * Lag frueher als useState hier drin. Der Handelsknopf sitzt jetzt aber
   * oben neben der Hand, in einem anderen Rasterfeld der unteren Leiste, und
   * kann die Tafel von dort nur oeffnen, wenn beide denselben Zustand teilen.
   */
  tafel: null | 'handel' | 'karten';
  setTafel: Dispatch<SetStateAction<null | 'handel' | 'karten'>>;
  /** Ein Feld ist fuer die Hauptstadt geschlossen - der Knopf erscheint in der Bauzeile. */
  hauptstadtBereit?: boolean;
  /** Steht ein Koenigssitz? Dann zeigt die Leiste die Reichsbauten (Phase 2). */
  reichOffen?: boolean;
  /** Zur Hauptstadt fahren und ihre Tafel oeffnen. */
  onHauptstadt?: () => void;
  /**
   * Ein Angebot an die Mitspieler zusammenstellen. Frueher ein eigener Knopf,
   * der ueber der Hand schwebte (Spieltest 4) - jetzt steht er beim Bankhandel.
   */
  onAngebot?: () => void;
  /** Gibt es einen freien Platz fuer ein Dorf (scenes/Game.tsx rechnet es aus)? */
  dorfPlatz?: boolean;
}) {
  const phase = state.phase;
  const bauen = isMine && phase.t === 'main';
  // tafel kommt von aussen (siehe oben) - der Handelsknopf steht nicht mehr hier.
  // Welcher Ernannte gerade zur Bestaetigung ansteht (rules/zweig.ts).
  const [ernennen, setErnennen] = useState<HeldZweig | null>(null);

  /** Welche Klappe offen ist: Befestigen oder Truppe. */
  const [klappe, setKlappe] = useState<null | 'befestigen' | 'truppe'>(null);

  // Nicht am Zug: offene Tafeln zu, die Bauzeile auch, ein halb gewaehlter Bau verfaellt.
  useEffect(() => {
    if (!isMine) {
      setTafel(null);
      setKlappe(null);
    }
  }, [isMine]);
  useEffect(() => {
    onTafel?.(tafel !== null);
  }, [tafel, onTafel]);

  const offen = (me?.dev ?? []).filter((d) => !d.played);
  const taktiken = me?.tactics ?? [];
  // Nur Kaempfer - Karawanen kann keine Taktik treffen (Spieltest 10: "karawane #79" im Ziel).
  const eigeneEinheiten = state.units.filter(
    (u) => u.owner === me?.id && (u.kind === 'held' || u.kind === 'ritter' || u.kind === 'bogen'),
  );
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
        ? 'Aufbau: setze ein Dorf - ★ markiert gute Plaetze'
        : 'Aufbau: setze eine Strasse'
      : phase.t === 'roll'
        ? 'Erst wuerfeln'
        : phase.t === 'roadBuilding'
          ? `Strassenbau: noch ${phase.remaining} setzen`
          : mode !== null
            ? 'Bauplatz auf der Karte waehlen'
            : '';

  const bau = (m: Exclude<BuildMode, null>) => () => {
    setKlappe(null);
    // Eine offene Tafel laege ueber den Bauplaetzen (Spieltest 5).
    setTafel(null);
    setMode(mode === m ? null : m);
  };
  /** Aus einer Klappe waehlen: der Bau ist gewaehlt, die Klappe geht zu. */
  // Kein Dorf reif (core/bevoelkerung.ts)? Dann gibt es nichts auszubauen.
  const stadtMoeglich = me ? legalCityVertices(state, me.id).some((vk) => stadtReif(state, vk)) : false;
  // Auf eigener Asche kostet eine Strasse nur Holz (rules/feuer.ts).
  const eigeneAsche = Object.values(state.asche).some((id) => id === me?.id);
  // Rabatt und Ersatz der Karten (rules/kosten.ts) - dieselbe Rechnung wie im Reducer.
  const wk = me ? wirkungenVon(state, me.id) : null;
  const geht = (k: Cost, was: Bauwerk): boolean => (wk ? kannBezahlen(hand, k, wk, was) : canAfford(hand, k));
  const strasseGeht = geht(COST_ROAD, 'strasse') || (eigeneAsche && geht(COST_REBUILD_ROAD, 'strasse'));

  /*
   * Ein gewaehlter Bau, der nicht mehr bezahlbar ist, verfaellt (Spieltest 4:
   * Turm gewaehlt, das Holz in einen Bogen gesteckt - der Turm blieb gewaehlt
   * und liess sich nicht mehr abwaehlen).
   */
  const modusKosten: Cost | null =
    mode === 'road'
      ? eigeneAsche && !canAfford(hand, COST_ROAD)
        ? COST_REBUILD_ROAD
        : COST_ROAD
      : mode === 'settlement'
        ? COST_SETTLEMENT
        : mode === 'city'
          ? COST_CITY
          : mode === 'tower'
            ? COST_TOWER
            : mode === 'mauer'
              ? COST_MAUER
              : mode === 'tor'
                ? COST_TOR
                : mode?.startsWith('reich:')
                  ? (COST_REICHSBAU[mode.slice(6) as keyof typeof COST_REICHSBAU] ?? null)
                  : null;
  const modusWerk: Bauwerk | null = mode === 'road' ? 'strasse' : mode === 'settlement' ? 'dorf' : mode === 'city' ? 'stadt' : null;
  const modusBezahlbar = modusKosten === null || (modusWerk ? geht(modusKosten, modusWerk) : canAfford(hand, modusKosten));
  useEffect(() => {
    if (mode !== null && phase.t === 'main' && !modusBezahlbar) setMode(null);
  }, [mode, modusBezahlbar, phase.t]);
  // Esc: erst die Klappe zu, dann den gewaehlten Bau ab.
  useEffect(() => {
    if (klappe === null && mode === null) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (klappe !== null) setKlappe(null);
      else setMode(null);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [klappe, mode]);
  // Ein Klick neben die Klappe schliesst sie.
  useEffect(() => {
    if (klappe === null) return;
    const klick = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.dock-klappe')) setKlappe(null);
    };
    window.addEventListener('pointerdown', klick);
    return () => window.removeEventListener('pointerdown', klick);
  }, [klappe]);

  return (
    <div className="dock">
      {tafel === 'handel' && (
        <HandelTafel
          hand={hand}
          verhaeltnis={verhaeltnis}
          gruende={gruende}
          darf={bauen}
          onTausch={(give, receive) => act({ t: 'bankTrade', give, receive })}
          sturm={haefenZu(state)}
          onZu={() => setTafel(null)}
          onAngebot={
            onAngebot
              ? () => {
                  setTafel(null);
                  onAngebot();
                }
              : undefined
          }
          markt={
            state.ereignisseAn
              ? {
                  darf: bauen && me?.id !== undefined && state.marktZug[me.id] !== state.turn && RESOURCES.reduce((n, r) => n + hand[r], 0) >= marktPreisFuer(state, me.id),
                  preis: me ? marktPreisFuer(state, me.id) : 3,
                  besucht: me?.id !== undefined && state.marktZug[me.id] === state.turn,
                  onMarkt: () => {
                    act({ t: 'visitMarket' });
                    setTafel(null);
                  },
                }
              : undefined
          }
        />
      )}
      {tafel === 'karten' && (
        <KartenTafel
          anzahl={anzahl}
          taktiken={taktiken}
          einheiten={eigeneEinheiten}
          heldName={me?.held ? heldKurz(me.held) : null}
          darfTaktik={isMine && phase.t === 'main'}
          kannSpielen={kannSpielen}
          kaufen={{ darf: bauen, hand }}
          act={act}
          onZu={() => setTafel(null)}
        />
      )}

      <div className="dock-reihe">
        {/*
          Die feste Leiste: sechs Plaetze (Spieltest 4 - "zu viele Knoepfe").
          Den Zug beendet der Wuerfelknopf daneben (Spieltest 5).
          Was selten gebraucht wird, liegt in zwei Klappen: Befestigen (Turm,
          Palisade, Tor) und Truppe (Ritter, Bogen). Die Entwicklungskarte
          kauft man in der Kartentafel. Beute und Hauptstadt erscheinen nur,
          wenn es sie gibt.
        */}
        <DockKnopf
          titel="Strasse"
          symbol={<SymStrasse />}
          kosten={COST_ROAD}
          gewaehlt={mode === 'road'}
          darf={bauen && strasseGeht}
          tip={`Strasse: ${kostenText(COST_ROAD)}${eigeneAsche ? ` - auf eigener Asche nur ${kostenText(COST_REBUILD_ROAD)}` : ''}`}
          onClick={bau('road')}
        />
        <DockKnopf
          titel="Dorf"
          symbol={<SymSiedlung />}
          kosten={COST_SETTLEMENT}
          gewaehlt={mode === 'settlement'}
          darf={bauen && geht(COST_SETTLEMENT, 'dorf') && dorfPlatz}
          tip={
            dorfPlatz
              ? `Dorf: ${kostenText(COST_SETTLEMENT)}`
              : 'Kein freier Platz: ein Dorf braucht eine eigene Strasse und zwei Kanten Abstand zum naechsten Haus - erst eine Strasse bauen.'
          }
          onClick={bau('settlement')}
        />
        <DockKnopf
          titel="Stadt"
          symbol={<SymStadt />}
          kosten={COST_CITY}
          gewaehlt={mode === 'city'}
          darf={bauen && geht(COST_CITY, 'stadt') && stadtMoeglich && !(wk && gesperrt(wk, 'stadt'))}
          tip={
            stadtMoeglich || !state.ereignisseAn
              ? `Ein Dorf zur Stadt ausbauen: doppelter Ertrag, 2 Siegpunkte. ${kostenText(COST_CITY)}${state.ereignisseAn ? ' - das Dorf braucht 2 Einwohner.' : ''}`
              : 'Noch kein Dorf hat 2 Einwohner - sie wachsen jede grosse Runde (das Schild 1/3 am Dorf).'
          }
          onClick={bau('city')}
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
      </div>
      {hinweis && <div className="dock-hinweis">{hinweis}</div>}
    </div>
  );
}
