/**
 * Spielansicht.
 *
 * Die legalen Zuege werden hier NICHT nachgebaut, sondern aus derselben
 * Regel-Engine geholt, die auch der Server benutzt (src/core/rules). Der
 * Client kennt dank der Redaktion weniger als der Server, aber die Bauregeln
 * lesen nur belegte Ecken und Kanten - und die sind oeffentlich.
 *
 * Der Server bleibt trotzdem die Autoritaet: was hier eingefaerbt wird, ist
 * ein Vorschlag an den Nutzer, kein Freibrief. Jede Aktion wird drueben
 * erneut geprueft.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../net/store';
import { Board } from '../board/Board';
import type { Flight, Targets } from '../board/Board';
import { HandPanel } from '../ui/HandPanel';
import { TradePanel } from '../ui/TradePanel';
import { DiceOverlay } from '../ui/DiceOverlay';
import { Announcements } from '../ui/Announcements';
import { CardDraft } from '../ui/CardDraft';
import { SideMenu } from '../ui/SideMenu';
import { initAudio, playBuild, playGain } from '../audio';
import {
  legalCityVertices,
  legalRoadEdges,
  legalSettlementVertices,
} from '../../core/rules/placement';
import { productionSources } from '../../core/rules/production';
import { tradeRatio } from '../../core/rules/trade';
import {
  COST_CITY,
  COST_DEV,
  COST_ROAD,
  COST_SETTLEMENT,
  canAfford,
} from '../../core/rules/costs';
import type { Cost } from '../../core/rules/costs';
import { RESOURCES } from '../../core/types';
import type { Resource } from '../../core/types';
import { devName, resourceName } from '../log';
import type { DevCardType } from '../../core/state';

type BuildMode = null | 'road' | 'settlement' | 'city';

const COST_LABEL = (c: Cost): string =>
  RESOURCES.filter((r) => (c[r] ?? 0) > 0)
    .map((r) => `${c[r]}x ${resourceName(r)}`)
    .join(', ');

export function Game() {
  const state = useStore((s) => s.state)!;
  const world = useStore((s) => s.world)!;
  const you = useStore((s) => s.you);
  const act = useStore((s) => s.act);
  const disconnect = useStore((s) => s.disconnect);
  const pendingRoll = useStore((s) => s.pendingRoll);
  const clearPendingRoll = useStore((s) => s.clearPendingRoll);
  const announcements = useStore((s) => s.announcements);
  const dropAnnouncement = useStore((s) => s.dropAnnouncement);
  const produceEffect = useStore((s) => s.produceEffect);
  const clearProduceEffect = useStore((s) => s.clearProduceEffect);

  const [mode, setMode] = useState<BuildMode>(null);
  const [tradeGive, setTradeGive] = useState<Resource>('lumber');
  const [tradeGet, setTradeGet] = useState<Resource>('ore');
  const [yopA, setYopA] = useState<Resource>('lumber');
  const [yopB, setYopB] = useState<Resource>('brick');
  const [discard, setDiscard] = useState<Partial<Record<Resource, number>>>({});
  /** Zahlen festpinnen - fuer alle, die sie lieber dauerhaft sehen. */
  const [pinNumbers, setPinNumbers] = useState(false);

  const me = state.players.find((p) => p.id === you);
  const hand = me?.hand;
  const phase = state.phase;
  const isMine = state.currentPlayer === you && phase.t !== 'finished';

  /** Welche Stellen darf ich gerade anklicken? */
  const targets: Targets = useMemo(() => {
    if (!you || !isMine) return {};
    switch (phase.t) {
      case 'setup':
        return phase.awaiting === 'settlement'
          ? { vertices: legalSettlementVertices(state, world, you, { setup: true }) }
          : { edges: legalRoadEdges(state, world, you, phase.lastVertex ?? undefined) };
      case 'roadBuilding':
        return { edges: legalRoadEdges(state, world, you) };
      case 'main':
        if (mode === 'road') return { edges: legalRoadEdges(state, world, you) };
        if (mode === 'settlement') {
          return { vertices: legalSettlementVertices(state, world, you, { setup: false }) };
        }
        if (mode === 'city') return { vertices: legalCityVertices(state, you) };
        return {};
      default:
        return {};
    }
  }, [state, world, you, isMine, phase, mode]);

  const onPick = (kind: 'vertex' | 'edge' | 'hex', key: string) => {
    if (!you) return;
    if (phase.t === 'setup') {
      if (kind === 'vertex') act({ t: 'placeSettlement', vertex: key });
      else act({ t: 'placeRoad', edge: key });
      playBuild();
      return;
    }
    if (phase.t === 'roadBuilding' && kind === 'edge') {
      act({ t: 'buildRoad', edge: key });
      return;
    }
    if (phase.t === 'main') {
      if (mode === 'road' && kind === 'edge') act({ t: 'buildRoad', edge: key });
      if (mode === 'settlement' && kind === 'vertex') act({ t: 'buildSettlement', vertex: key });
      if (mode === 'city' && kind === 'vertex') act({ t: 'buildCity', vertex: key });
      if (mode !== null) playBuild();
      setMode(null);
    }
  };

  const playableDev = (me?.dev ?? []).filter(
    (d) => !d.played && d.type !== 'victoryPoint' && d.boughtTurn < state.turn,
  );
  const devCounts = new Map<DevCardType, number>();
  for (const d of me?.dev ?? []) {
    if (d.played) continue;
    devCounts.set(d.type, (devCounts.get(d.type) ?? 0) + 1);
  }
  const canPlay = (t: DevCardType): boolean =>
    !state.devPlayedThisTurn && playableDev.some((d) => d.type === t);

  const mustDiscard =
    phase.t === 'discard' && you !== null && phase.pending.includes(you);
  const discardNeed = mustDiscard && hand
    ? Math.floor(RESOURCES.reduce((n, r) => n + hand[r], 0) / 2)
    : 0;
  const discardChosen = RESOURCES.reduce((n, r) => n + (discard[r] ?? 0), 0);

  const ratio = you ? tradeRatio(state, world, you, tradeGive) : 4;

  /*
   * Welche Felder hat der Wurf getroffen, und was fliegt davon zu mir?
   *
   * Beides kommt aus productionSources im Kern - dieselbe Funktion, aus der
   * auch die Abrechnung entsteht. Die Anzeige kann damit nichts behaupten,
   * was die Regel nicht deckt.
   */
  const quellen = useMemo(
    () => (produceEffect ? productionSources(state, world, produceEffect.roll) : []),
    [produceEffect, state, world],
  );

  const flashHexes = useMemo(() => [...new Set(quellen.map((q) => q.hex))], [quellen]);

  const flights: Flight[] = useMemo(() => {
    if (!produceEffect || !you) return [];
    let lauf = 0;
    return quellen
      .filter((q) => q.owner === you)
      .flatMap((q) =>
        Array.from({ length: q.amount }, () => ({
          id: `${produceEffect.id}-${q.hex}-${q.resource}-${lauf}`,
          hex: q.hex,
          resource: q.resource,
          // Gestaffelt, damit die Karten nacheinander ankommen.
          delay: 120 * lauf++,
        })),
      );
  }, [produceEffect, quellen, you]);

  // Ertrag: Klang je ankommender Karte, danach den Effekt wieder loeschen.
  useEffect(() => {
    if (!produceEffect) return;
    flights.forEach((_, i) => playGain(i));
    const t = window.setTimeout(clearProduceEffect, 1200 + flights.length * 120);
    return () => window.clearTimeout(t);
  }, [produceEffect, flights, clearProduceEffect]);


  /*
   * Waehrend eine Bauwahl offen ist, muss man Felder vergleichen koennen -
   * dann helfen einzeln eingeblendete Zahlen nicht weiter.
   */
  const waehltGerade =
    (targets.vertices?.length ?? 0) > 0 ||
    (targets.edges?.length ?? 0) > 0 ||
    (targets.hexes?.length ?? 0) > 0;

  return (
    <div className="game">
      <main className="main">
        {/*
          Die Karte bekommt den ganzen Platz. Was frueher in einer linken
          Spalte stand - Protokoll, Zuganzeige, Spielerliste - ist weg: allein
          weiss man ohnehin, dass man dran ist, und die Landschaft ist das,
          was man sehen will.

          Nur zwei Dinge legen sich als kleine Schilder darueber: der Raumcode
          zum Weitergeben und, sobald mehr als einer mitspielt, wer am Zug ist.
          Ohne das waere eine Partie zu mehreren nicht spielbar.
        */}
        <div className="hud">
          <span className="hud-room">{useStore.getState().code}</span>
          {state.order.length > 1 && (
            <span className="hud-turn">
              {isMine
                ? 'du bist dran'
                : `${state.players.find((p) => p.id === state.currentPlayer)?.name} ist dran`}
            </span>
          )}
          {state.lastRoll && (
            <span className="hud-roll">
              {state.lastRoll[0]} + {state.lastRoll[1]} = {state.lastRoll[0] + state.lastRoll[1]}
            </span>
          )}
        </div>

        {/* Verlassen steht fuer sich, weit weg von allem, was man oft klickt. */}
        <button className="verlassen" title="Partie verlassen" onClick={disconnect}>
          verlassen
        </button>

        <SideMenu
          turn={state.turn}
          cards={me?.cards ?? []}
          showNumbers={pinNumbers}
          onToggleNumbers={() => setPinNumbers((v) => !v)}
        />

        {state.draft !== null && phase.t === 'draft' && (
          <CardDraft
            options={state.draft.options}
            darfWaehlen={isMine}
            onChoose={(card) => act({ t: 'chooseCard', card })}
          />
        )}

        <Announcements items={announcements} onDone={dropAnnouncement} />

        {phase.t === 'finished' && (
          <div className="hud-win">
            {state.players.find((p) => p.id === phase.winner)?.name} gewinnt!
          </div>
        )}

        <Board
          world={world}
          state={state}
          targets={targets}
          showAllNumbers={pinNumbers || waehltGerade}
          flashHexes={flashHexes}
          flights={flights}
          onPick={onPick}
        >
          {hand && <HandPanel hand={hand} />}

          {/*
            Wuerfeln ist der Taktgeber der Partie und gehoert nicht als
            kleiner Knopf in eine Leiste. Solange gewuerfelt werden muss,
            steht er mitten im Bild - er ist ohnehin der einzige moegliche Zug.
          */}
          {/*
            Der Wuerfelknopf steht auch schon in der Bauphase bereit, wenn
            man allein spielt.

            Sonst kostet jede Runde zwei Klicks an derselben Stelle: erst Zug
            beenden, dann wuerfeln - obwohl gar niemand anders am Zug ist.
            Der Knopf erledigt beides. "Zug beenden" bleibt daneben stehen,
            fuer alle, die vorher noch handeln wollen.
          */}
          {isMine &&
            pendingRoll === null &&
            (phase.t === 'roll' || (phase.t === 'main' && state.order.length === 1)) && (
              <button
                className="roll-button"
                onClick={() => {
                  initAudio();
                  if (phase.t === 'main') act({ t: 'endTurn' });
                  act({ t: 'roll' });
                }}
              >
                <DieIcon />
                <span>Wuerfeln</span>
              </button>
            )}

          {pendingRoll !== null && (
            <DiceOverlay dice={pendingRoll} onDone={clearPendingRoll} />
          )}
        </Board>

        <div className="bar">

          {/*
            Der Handel steht bewusst ausserhalb des isMine-Blocks: ein Angebot
            geht alle an, nicht nur den Spieler am Zug.
          */}
          {hand &&
            you &&
            state.order.length > 1 &&
            (state.trade !== null || (isMine && phase.t === 'main')) && (
              <TradePanel state={state} you={you} hand={hand} act={act} />
            )}

          {isMine && phase.t === 'roll' && canPlay('knight') && (
            <div className="actions">
              <button onClick={() => act({ t: 'playKnight' })}>Ritter vorab spielen</button>
            </div>
          )}

          {isMine && phase.t === 'main' && hand && (
            <div className="actions">
              <button
                className={mode === 'road' ? 'chosen' : ''}
                disabled={!canAfford(hand, COST_ROAD)}
                title={COST_LABEL(COST_ROAD)}
                onClick={() => setMode(mode === 'road' ? null : 'road')}
              >
                Strasse
              </button>
              <button
                className={mode === 'settlement' ? 'chosen' : ''}
                disabled={!canAfford(hand, COST_SETTLEMENT)}
                title={COST_LABEL(COST_SETTLEMENT)}
                onClick={() => setMode(mode === 'settlement' ? null : 'settlement')}
              >
                Siedlung
              </button>
              <button
                className={mode === 'city' ? 'chosen' : ''}
                disabled={!canAfford(hand, COST_CITY)}
                title={COST_LABEL(COST_CITY)}
                onClick={() => setMode(mode === 'city' ? null : 'city')}
              >
                Stadt
              </button>
              <button
                disabled={!canAfford(hand, COST_DEV)}
                title={COST_LABEL(COST_DEV)}
                onClick={() => act({ t: 'buyDev' })}
              >
                Karte kaufen ({state.deckLeft})
              </button>

              {canPlay('knight') && (
                <button onClick={() => act({ t: 'playKnight' })}>Ritter</button>
              )}
              {canPlay('roadBuilding') && (
                <button onClick={() => act({ t: 'playRoadBuilding' })}>Strassenbau</button>
              )}
              {canPlay('monopoly') && (
                <MonopolyButton onPick={(r) => act({ t: 'playMonopoly', resource: r })} />
              )}
              {canPlay('yearOfPlenty') && (
                <span className="inline">
                  <ResSelect value={yopA} onChange={setYopA} />
                  <ResSelect value={yopB} onChange={setYopB} />
                  <button onClick={() => act({ t: 'playYearOfPlenty', a: yopA, b: yopB })}>
                    Erfindung
                  </button>
                </span>
              )}

              <span className="inline">
                <ResSelect value={tradeGive} onChange={setTradeGive} />
                <span className="arrow">{ratio}:1</span>
                <ResSelect value={tradeGet} onChange={setTradeGet} />
                <button
                  disabled={tradeGive === tradeGet || hand[tradeGive] < ratio}
                  onClick={() => act({ t: 'bankTrade', give: tradeGive, receive: tradeGet })}
                >
                  Tauschen
                </button>
              </span>

              <button onClick={() => act({ t: 'endTurn' })}>Zug beenden</button>
            </div>
          )}

          {isMine && phase.t === 'roadBuilding' && (
            <div className="actions">
              <strong>Strassenbau: noch {phase.remaining} setzen</strong>
            </div>
          )}


          {(me?.dev?.length ?? 0) > 0 && (
            <div className="devlist">
              {[...devCounts].map(([t, n]) => (
                <span key={t} className="devcard">
                  {devName(t)} x{n}
                </span>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Abwerfen nach einer 7 */}
      {mustDiscard && hand && (
        <Dialog title={`${discardNeed} Karten abwerfen`}>
          <div className="discard">
            {RESOURCES.map((r) => (
              <div key={r} className="drow">
                <span>{resourceName(r)}</span>
                <button
                  disabled={(discard[r] ?? 0) <= 0}
                  onClick={() => setDiscard({ ...discard, [r]: (discard[r] ?? 0) - 1 })}
                >
                  -
                </button>
                <b>{discard[r] ?? 0}</b>
                <button
                  disabled={(discard[r] ?? 0) >= hand[r] || discardChosen >= discardNeed}
                  onClick={() => setDiscard({ ...discard, [r]: (discard[r] ?? 0) + 1 })}
                >
                  +
                </button>
                <span className="have">von {hand[r]}</span>
              </div>
            ))}
          </div>
          <button
            className="primary"
            disabled={discardChosen !== discardNeed}
            onClick={() => {
              act({ t: 'discard', cards: discard });
              setDiscard({});
            }}
          >
            {discardChosen} von {discardNeed} abwerfen
          </button>
        </Dialog>
      )}
    </div>
  );
}

/** Kleines Wuerfelsymbol fuer den Knopf. */
function DieIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden="true">
      <rect x={2} y={2} width={18} height={18} rx={3} className="die-body" />
      <circle cx={7} cy={7} r={1.8} className="die-pip" />
      <circle cx={15} cy={7} r={1.8} className="die-pip" />
      <circle cx={11} cy={11} r={1.8} className="die-pip" />
      <circle cx={7} cy={15} r={1.8} className="die-pip" />
      <circle cx={15} cy={15} r={1.8} className="die-pip" />
    </svg>
  );
}

function ResSelect({
  value,
  onChange,
}: {
  value: Resource;
  onChange: (r: Resource) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Resource)}>
      {RESOURCES.map((r) => (
        <option key={r} value={r}>
          {resourceName(r)}
        </option>
      ))}
    </select>
  );
}

function MonopolyButton({ onPick }: { onPick: (r: Resource) => void }) {
  const [r, setR] = useState<Resource>('lumber');
  return (
    <span className="inline">
      <ResSelect value={r} onChange={setR} />
      <button onClick={() => onPick(r)}>Monopol</button>
    </span>
  );
}

function Dialog({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overlay">
      <div className="dialog">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
