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

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  TAGESZEITEN,
  TAGESZEIT_NAME,
  WETTER_ARTEN,
  WETTER_NAME,
  WETTER_WIRKUNG,
  rundenBisTageszeit,
  rundenBisWetter,
  sichtLage,
  tageszeitOf,
  wetterOf,
} from '../../core/zeit';
import type { Tageszeit, Wetter } from '../../core/zeit';
import { WetterSymbol } from '../ui/WetterSymbol';
import { useStore } from '../net/store';
import { Board } from '../board/Board';
import type { AusbauTafel, Flight, Krone, Targets } from '../board/Board';
import { HandPanel } from '../ui/HandPanel';
import { TradePanel } from '../ui/TradePanel';
import { DiceOverlay } from '../ui/DiceOverlay';
import { Announcements } from '../ui/Announcements';
import { CardDraft } from '../ui/CardDraft';
import { SideMenu } from '../ui/SideMenu';
import type { FraktionsZeile } from '../ui/SideMenu';
import { isNestActive, nestFraktionOf, sightOf } from '../../core/units';
import { abkommenVon, kampfFelder } from '../../core/combat';
import { fraktionById } from '../../core/factions';
import { fraktionColor } from '../theme';
import { hexDistance, hexKey, hexVertices, parseVertexKey, vertexAdjacentHexes, vertexKey } from '../../core/coords';
import { beiStumm, initAudio, istStumm, playBuild, playGain, playTurm, playWurfStart, setStumm } from '../audio';
import { setAmbiente } from '../ambiente';
import { seasonOf } from '../../core/season';
import { RESOURCES } from '../../core/types';
import type { Resource } from '../../core/types';
import { COST_CAPITAL, COST_CITY, COST_FESTUNG, COST_ROAD, COST_TOWER, canAfford } from '../../core/rules/costs';
import { FRIEDEN_PREIS, TRIBUT_KARTEN, nimmtFrieden } from '../../core/rules/diplomatie';
import { brennt } from '../../core/rules/feuer';
import {
  FAST_GESCHLOSSEN,
  STUFE_NAME,
  festungHindernis,
  hauptstadtFelder,
  anHauptstadt,
  hauptstadtHindernis,
} from '../../core/rules/hauptstadt';
import type { Umland } from '../../core/rules/hauptstadt';
import type { Cost } from '../../core/rules/costs';
import { Diagnose, diagnoseAn } from '../ui/Diagnose';

/** Nach so vielen Millisekunden wuerfelt der Knopf von selbst. Erst fuenf, dann acht - beides zu knapp, um sich umzusehen und zu planen. */
const AUTO_WURF_MS = 30000;
const AUTO_WURF_KEY = 'infinitecarthage.autowurf';

/**
 * Tageszeit und Wetter zum Anschauen ueber die Adresse vorgeben:
 * ?zeit=nacht&wetter=gewitter. Nur die Anzeige - die Regeln (Horde, Sicht)
 * folgen weiter der echten Runde.
 */
function wetterVorschau(): { zeit: Tageszeit | null; wetter: Wetter | null } {
  try {
    const p = new URLSearchParams(window.location.search);
    const z = p.get('zeit') ?? '';
    const w = p.get('wetter') ?? '';
    return {
      zeit: (TAGESZEITEN as readonly string[]).includes(z) ? (z as Tageszeit) : null,
      wetter: (WETTER_ARTEN as readonly string[]).includes(w) ? (w as Wetter) : null,
    };
  } catch {
    return { zeit: null, wetter: null };
  }
}
import {
  legalCityVertices,
  legalRoadEdges,
  legalSettlementVertices,
} from '../../core/rules/placement';
import { productionSources } from '../../core/rules/production';
import { tradeRatio } from '../../core/rules/trade';
import { Aktionsleiste } from '../ui/Aktionsleiste';
import type { BuildMode } from '../ui/Aktionsleiste';

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
  const log = useStore((s) => s.log);
  const welt = useStore((s) => s.welt);
  const produceEffect = useStore((s) => s.produceEffect);
  const clearProduceEffect = useStore((s) => s.clearProduceEffect);

  const [mode, setMode] = useState<BuildMode>(null);
  /** Wo die Ausbau-Tafel offen ist: an einem eigenen Gebaeude oder an einer Krone. */
  const [ausbauOrt, setAusbauOrt] = useState<{ art: 'ecke' | 'feld'; key: string } | null>(null);
  /** Zahlen festpinnen - fuer alle, die sie lieber dauerhaft sehen. */
  const [pinNumbers, setPinNumbers] = useState(false);

  /**
   * Ein Wurf ist abgeschickt, das Ergebnis aber noch nicht da.
   *
   * Der Server schickt erst den neuen Zustand, dann die Ereignisse (room.ts).
   * Bis der Wurf in pendingRoll steht, war der Knopf noch erreichbar - und der
   * zweite Klick eines Doppelklicks traf ihn: meist mit "Jetzt wird nicht
   * gewuerfelt", allein gespielt in einem ungluecklichen Moment aber als "Zug
   * beenden und neu wuerfeln", und der ganze Zug war weg.
   */
  const [wurfUnterwegs, setWurfUnterwegs] = useState(false);
  useEffect(() => {
    if (pendingRoll !== null) setWurfUnterwegs(false);
  }, [pendingRoll]);
  useEffect(() => {
    if (!wurfUnterwegs) return;
    // Faellt der Wurf aus - Fehler, Verbindung weg -, soll der Knopf nicht
    // dauerhaft verschwinden.
    const t = window.setTimeout(() => setWurfUnterwegs(false), 2500);
    return () => window.clearTimeout(t);
  }, [wurfUnterwegs]);

  const me = state.players.find((p) => p.id === you);
  /** Was ich sehe - alles andere liegt im Nebel. */
  /*
   * Im Aufbau kein Nebel. Vor dem ersten Dorf sieht man nichts - die ganze Karte
   * lag abgedunkelt da, genau in dem Moment, in dem man sie lesen muss, um einen
   * Platz zu waehlen.
   */
  const sicht = useMemo(
    () => (you && state.phase.t !== 'setup' ? sightOf(state, you, sichtLage(state.worldSeed, state.turn)) : null),
    [state, you],
  );

  /** Tageszeit und Wetter (core/zeit.ts) - ueber die Adresse vorgebbar, siehe wetterVorschau. */
  const vorschau = useMemo(() => wetterVorschau(), []);
  const tageszeit = vorschau.zeit ?? tageszeitOf(state.turn);
  const wetter = vorschau.wetter ?? wetterOf(state.worldSeed, state.turn);
  /** Das Wetter, nach dem die Regeln gehen - die Vorschau aendert nur die Anzeige. */
  const echtesWetter = wetterOf(state.worldSeed, state.turn);

  /** Aller Ton aus? Oben im Schild und im Menue umschaltbar (audio.ts). */
  const [stumm, setStummZustand] = useState(istStumm);
  useEffect(() => beiStumm(setStummZustand), []);
  // Liest den Stand beim Klick, nicht aus dem letzten Rendern - sonst schalten
  // zwei schnelle Klicks beide in dieselbe Richtung.
  const tonUmschalten = () => {
    initAudio();
    setStumm(!istStumm());
  };

  // Umgebungsgeraeusche folgen Tageszeit, Wetter und Feuer (ambiente.ts).
  const feuerZahl = state.braende.length;
  const winter = seasonOf(state.turn) === 'winter';
  useEffect(() => {
    setAmbiente({ tageszeit, wetter, feuer: feuerZahl, winter, aktiv: true });
  }, [tageszeit, wetter, feuerZahl, winter]);
  useEffect(
    () => () => setAmbiente({ tageszeit: 'tag', wetter: 'klar', feuer: 0, winter: false, aktiv: false }),
    [],
  );

  /** Meine Ritter - und welcher gerade auf sein Ziel wartet. */
  const meineRitter = useMemo(
    () => state.units.filter((u) => (u.kind === 'ritter' || u.kind === 'bogen') && u.owner === you),
    [state.units, you],
  );
  const meinHeld = useMemo(
    () => state.units.find((u) => u.kind === 'held' && u.owner === you) ?? null,
    [state.units, you],
  );
  /** Alles, was Befehle annimmt: Ritter und der Held. */
  const meineEinheiten = useMemo(
    () => (meinHeld ? [meinHeld, ...meineRitter] : meineRitter),
    [meinHeld, meineRitter],
  );
  const [befehl, setBefehl] = useState<number | null>(null);
  /** Gilt der wartende Befehl dem ganzen Verband auf dem Feld der Einheit? */
  const [mitVerband, setMitVerband] = useState(false);
  const [fokus, setFokus] = useState<{ q: number; r: number; n: number } | null>(null);
  const zeigeFeld = (q: number, r: number) => setFokus((alt) => ({ q, r, n: (alt?.n ?? 0) + 1 }));
  // Faellt die Einheit, verfaellt auch der Befehl.
  useEffect(() => {
    if (befehl !== null && !meineEinheiten.some((u) => u.id === befehl)) setBefehl(null);
    if (befehl === null) setMitVerband(false);
  }, [befehl, meineEinheiten]);

  const befehlsEinheit = meineEinheiten.find((u) => u.id === befehl);
  const verbandGroesse =
    befehlsEinheit && mitVerband
      ? meineEinheiten.filter((u) => u.q === befehlsEinheit.q && u.r === befehlsEinheit.r).length
      : 1;
  // Esc bricht die Zielwahl ab.
  useEffect(() => {
    if (befehl === null) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBefehl(null);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [befehl]);

  /** Die Felder an meinen Siedlungen - von hier aus wird gemessen. */
  const meineFelder = useMemo(
    () =>
      Object.entries(state.buildings)
        .filter(([, b]) => b.owner === you)
        .flatMap(([vk]) => vertexAdjacentHexes(parseVertexKey(vk))),
    [state.buildings, you],
  );

  /** Raubzuege unterwegs, wie nah der naechste meinen Siedlungen ist, Kaempfe in Sicht. */
  const lage = useMemo(() => {
    const feinde = state.units.filter((u) => u.auftrag === 'raub');
    let naechster: number | null = null;
    for (const f of feinde) {
      for (const h of meineFelder) {
        const d = hexDistance(f, h);
        if (naechster === null || d < naechster) naechster = d;
      }
    }
    const kaempfe = [...kampfFelder(state).keys()].filter((k) => sicht === null || sicht.has(k)).length;
    return { unterwegs: feinde.length, naechster, kaempfe };
  }, [state, meineFelder, sicht]);

  /**
   * Die Fraktionen, die man kennt: denen die Lager auf der aufgedeckten Karte
   * gehoeren - die naechsten zuerst.
   */
  const fraktionen = useMemo(() => {
    const bezug = meineFelder.length > 0 ? meineFelder : [{ q: 0, r: 0 }];
    const m = new Map<string, FraktionsZeile>();
    for (const t of world.tiles.values()) {
      if (!isNestActive(state, t.q, t.r)) continue;
      const id = nestFraktionOf(state, t.q, t.r);
      let zeile = m.get(id);
      if (!zeile) {
        const f = fraktionById(state.worldSeed, id);
        zeile = {
          id,
          name: f.name,
          art: f.art,
          farbe: fraktionColor(f.farbe),
          lager: 0,
          unterwegs: 0,
          naechster: null,
          abkommen: you ? (abkommenVon(state, you, id) ?? null) : null,
          nimmtFrieden: nimmtFrieden(state.worldSeed, id),
        };
        m.set(id, zeile);
      }
      zeile.lager += 1;
      const d = Math.min(...bezug.map((h) => hexDistance(h, t)));
      if (zeile.naechster === null || d < zeile.naechster) zeile.naechster = d;
    }
    for (const u of state.units) {
      const zeile = u.fraktion !== null ? m.get(u.fraktion) : undefined;
      if (zeile) zeile.unterwegs += 1;
    }
    return [...m.values()]
      .sort((a, b) => (a.naechster ?? Infinity) - (b.naechster ?? Infinity))
      .slice(0, 8);
  }, [world, state, meineFelder]);
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
        if (mode === 'road') {
          // Reicht es nur fuer den Wiederaufbau, stehen nur die eigenen Aschekanten zur Wahl.
          const alle = legalRoadEdges(state, world, you);
          return {
            edges: hand && !canAfford(hand, COST_ROAD) ? alle.filter((ek) => state.asche[ek] === you) : alle,
          };
        }
        if (mode === 'tower') {
          return {
            vertices: Object.entries(state.buildings)
              .filter(([vk, b]) => b.owner === you && !b.turm && !brennt(state, vk))
              .map(([vk]) => vk),
          };
        }
        if (mode === 'settlement') {
          return { vertices: legalSettlementVertices(state, world, you, { setup: false }) };
        }
        if (mode === 'city') return { vertices: legalCityVertices(state, you) };
        return {};
      default:
        return {};
    }
  }, [state, world, you, isMine, phase, mode, hand]);

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
      if (mode === 'tower' && kind === 'vertex') act({ t: 'buildTower', vertex: key });
      if (mode === 'tower') playTurm();
      else if (mode !== null) playBuild();
      setMode(null);
    }
  };

  /**
   * Klick auf ein Feld: wartet ein Ritter auf sein Ziel, geht der Befehl raus.
   * Sonst waehlt ein Klick auf einen eigenen Ritter ihn aus.
   */
  const onHex = (key: string) => {
    const [q, r] = key.split(':').map(Number);
    if (befehl !== null) {
      act({ t: 'orderUnit', unit: befehl, q: q!, r: r!, verband: mitVerband });
      setBefehl(null);
      return;
    }
    // Ein Klick auf ein eigenes Feld waehlt alle Einheiten darauf - den Verband.
    const aufFeld = meineEinheiten.filter((u) => u.q === q && u.r === r);
    if (aufFeld.length > 0) {
      setBefehl(aufFeld[0]!.id);
      setMitVerband(aufFeld.length > 1);
    }
  };
  const befehleMoeglich = isMine && (phase.t === 'main' || phase.t === 'roll') && mode === null;

  /*
   * Hauptstadt (rules/hauptstadt.ts): Kronen ueber Feldern, die fast oder ganz
   * geschlossen sind, und die Ausbau-Tafel an Gebaeude oder Krone - wer etwas
   * ausbauen will, klickt einfach darauf.
   */
  const umland = useMemo(
    () => (you && phase.t !== 'setup' ? hauptstadtFelder(state, you) : []),
    [state, you, phase.t],
  );
  // Beliebig viele Hauptstaedte: jede fast geschlossene Stelle bekommt ihre Krone.
  const kronen: Krone[] = useMemo(
    () =>
      umland
        .filter((u) => u.fehlt <= FAST_GESCHLOSSEN)
        .map((u) => ({
          q: u.q,
          r: u.r,
          bereit: u.bereit,
          titel: u.bereit
            ? 'Umschlossen - hier kann eine Hauptstadt entstehen. Klicken.'
            : `Fast umschlossen: ${u.strassen}/6 Strassen, ${u.staedte}/3 Staedte. Klicken.`,
        })),
    [umland],
  );
  const bereiteFelder = kronen.filter((k) => k.bereit);
  // Eine Bau- oder Befehlswahl schliesst die Tafel.
  useEffect(() => {
    if (mode !== null || befehl !== null) setAusbauOrt(null);
  }, [mode, befehl]);
  useEffect(() => {
    if (ausbauOrt === null) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAusbauOrt(null);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [ausbauOrt]);

  const ausbau: AusbauTafel | null = useMemo(() => {
    if (!ausbauOrt || !you) return null;
    const jetzt = isMine && phase.t === 'main';
    const warum = !isMine ? 'Nicht dein Zug' : phase.t === 'roll' ? 'Erst wuerfeln' : phase.t !== 'main' ? 'Jetzt nicht' : undefined;
    const bezahlbar = (k: Cost) => !!hand && canAfford(hand, k);
    const armut = (k: Cost) => (bezahlbar(k) ? undefined : 'Zu wenig Rohstoffe');
    const dann = (f: () => void) => () => {
      f();
      setAusbauOrt(null);
    };
    const mehrzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;
    const hauptstadtOption = (u: Umland) => {
      const hindernis = hauptstadtHindernis(state, you, u.q, u.r);
      const fehlt = [
        u.strassen < 6 ? mehrzahl(6 - u.strassen, 'Strasse', 'Strassen') : '',
        u.staedte < 3 ? mehrzahl(3 - u.staedte, 'Stadt', 'Staedte') : '',
      ]
        .filter(Boolean)
        .join(' und ');
      return {
        name: 'Hauptstadt',
        kosten: COST_CAPITAL,
        darf: jetzt && hindernis === null && bezahlbar(COST_CAPITAL),
        hinweis: !u.bereit ? `Es fehlen noch ${fehlt}` : (hindernis ?? warum ?? armut(COST_CAPITAL)),
        wahl: dann(() => {
          act({ t: 'foundCapital', q: u.q, r: u.r });
          playBuild();
        }),
      };
    };
    const festungOption = (q: number, r: number) => {
      const hindernis = festungHindernis(state, you, q, r);
      return {
        name: 'Festungsring',
        kosten: COST_FESTUNG,
        darf: jetzt && hindernis === null && bezahlbar(COST_FESTUNG),
        hinweis: hindernis ?? warum ?? armut(COST_FESTUNG),
        wahl: dann(() => {
          act({ t: 'upgradeCapital', q, r });
          playBuild();
        }),
      };
    };
    if (ausbauOrt.art === 'feld') {
      const hauptstadt = state.hauptstaedte?.[ausbauOrt.key];
      if (hauptstadt && hauptstadt.owner === you) {
        const [q, r] = ausbauOrt.key.split(':').map(Number) as [number, number];
        return {
          ort: ausbauOrt,
          titel: `Hauptstadt · ${STUFE_NAME[hauptstadt.stufe] ?? `Stufe ${hauptstadt.stufe}`}`,
          optionen: hauptstadt.stufe < 2 ? [festungOption(q, r)] : [],
          leer: 'Weitere Stufen folgen.',
        };
      }
      const u = umland.find((x) => hexKey(x.q, x.r) === ausbauOrt.key);
      if (!u) return null;
      return { ort: ausbauOrt, titel: u.bereit ? 'Umschlossenes Feld' : 'Fast umschlossen', optionen: [hauptstadtOption(u)] };
    }
    const b = state.buildings[ausbauOrt.key];
    if (!b || b.owner !== you) return null;
    const feuer = brennt(state, ausbauOrt.key) ? 'Hier brennt es' : undefined;
    const optionen: AusbauTafel['optionen'] = [];
    if (b.type === 'settlement') {
      optionen.push({
        name: 'Stadt',
        kosten: COST_CITY,
        darf: jetzt && !feuer && bezahlbar(COST_CITY),
        hinweis: warum ?? feuer ?? armut(COST_CITY),
        wahl: dann(() => {
          act({ t: 'buildCity', vertex: ausbauOrt.key });
          playBuild();
        }),
      });
    }
    // An einer Hauptstadt vorerst kein Wachturm (rules/hauptstadt.ts, anHauptstadt).
    if (!b.turm && !anHauptstadt(state, ausbauOrt.key)) {
      optionen.push({
        name: 'Wachturm',
        kosten: COST_TOWER,
        darf: jetzt && !feuer && bezahlbar(COST_TOWER),
        hinweis: warum ?? feuer ?? armut(COST_TOWER),
        wahl: dann(() => {
          act({ t: 'buildTower', vertex: ausbauOrt.key });
          playTurm();
        }),
      });
    }
    // Jedes fast geschlossene Feld an dieser Ecke - eine Stadt kann an mehreren Ringen liegen.
    for (const u of umland) {
      if (u.fehlt > FAST_GESCHLOSSEN || !hexVertices(u.q, u.r).some((v) => vertexKey(v) === ausbauOrt.key)) continue;
      optionen.push(hauptstadtOption(u));
    }
    // An einer Ecke der eigenen Residenz: der Festungsring laesst sich auch von hier ausbauen.
    for (const [hk, h] of Object.entries(state.hauptstaedte ?? {})) {
      if (h.owner !== you || h.stufe >= 2) continue;
      const [q, r] = hk.split(':').map(Number) as [number, number];
      if (hexVertices(q, r).some((v) => vertexKey(v) === ausbauOrt.key)) optionen.push(festungOption(q, r));
    }
    return { ort: ausbauOrt, titel: b.type === 'city' ? 'Stadt' : 'Dorf', optionen };
  }, [ausbauOrt, you, isMine, phase.t, hand, state, umland, act]);

  /** Was auf freien Bauplaetzen als Vorschau steht (Board). */
  const geisterBau: 'dorf' | 'stadt' | 'turm' | null =
    phase.t === 'setup' && phase.awaiting === 'settlement'
      ? 'dorf'
      : mode === 'settlement'
        ? 'dorf'
        : mode === 'city'
          ? 'stadt'
          : mode === 'tower'
            ? 'turm'
            : null;

  /** Loeschen kostet eine Karte - die vom groessten Stapel. */
  const loeschKarte: Resource | null =
    hand && RESOURCES.some((r) => hand[r] > 0)
      ? RESOURCES.reduce((a, b) => (hand[b] > hand[a] ? b : a))
      : null;
  const loeschenMoeglich = isMine && (phase.t === 'main' || phase.t === 'roll');
  const loeschen = (key: string) => {
    if (loeschKarte && loeschenMoeglich) act({ t: 'putOut', key, mit: loeschKarte });
  };
  const meineBraende = useMemo(() => state.braende.filter((b) => b.owner === you), [state.braende, you]);
  const meineAuftraege = useMemo(
    () => state.auftraege.filter((a) => a.player === you && a.status !== 'abgelehnt'),
    [state.auftraege, you],
  );

  /*
   * Wuerfeln - von Hand oder nach AUTO_WURF_MS von selbst.
   *
   * Die Uhr laeuft nur, wenn nichts anderes ansteht: kein halb gewaehlter Bau,
   * kein Ritterbefehl, keine offene Kartenwahl, kein Handel, keine offene Tafel.
   * Jede Beruehrung, Taste und jedes Mausrad stellt sie zurueck - wer gerade
   * etwas tut, wird nicht weggewuerfelt. Abschaltbar im Menue (TO, Spiel).
   */
  const [autoWurf, setAutoWurf] = useState(() => {
    try {
      return localStorage.getItem(AUTO_WURF_KEY) !== 'aus';
    } catch {
      return true;
    }
  });
  const [tafelOffen, setTafelOffen] = useState(false);
  const wurfMoeglich =
    isMine &&
    pendingRoll === null &&
    !wurfUnterwegs &&
    (phase.t === 'roll' || (phase.t === 'main' && state.order.length === 1));
  const uhrLaeuft =
    wurfMoeglich &&
    autoWurf &&
    mode === null &&
    befehl === null &&
    ausbauOrt === null &&
    state.draft === null &&
    state.trade === null &&
    !tafelOffen;
  const [uhrStart, setUhrStart] = useState({ zeit: 0, n: 0 });
  const [rest, setRest] = useState(AUTO_WURF_MS / 1000);
  /** Zaehlt jeden Wurf - der Schluessel startet Funken und Stoss neu. */
  const [wurfStoss, setWurfStoss] = useState(0);

  const wuerfeln = () => {
    if (!wurfMoeglich) return;
    setWurfUnterwegs(true);
    setWurfStoss((n) => n + 1);
    initAudio();
    playWurfStart();
    if (phase.t === 'main') act({ t: 'endTurn' });
    act({ t: 'roll' });
  };
  const wuerfelnRef = useRef(wuerfeln);
  wuerfelnRef.current = wuerfeln;

  useEffect(() => {
    if (!uhrLaeuft) return;
    let timer = 0;
    const neu = () => {
      window.clearTimeout(timer);
      setUhrStart((u) => ({ zeit: Date.now(), n: u.n + 1 }));
      timer = window.setTimeout(() => wuerfelnRef.current(), AUTO_WURF_MS);
    };
    neu();
    const leise = { passive: true } as AddEventListenerOptions;
    window.addEventListener('pointerdown', neu, leise);
    window.addEventListener('keydown', neu);
    window.addEventListener('wheel', neu, leise);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', neu);
      window.removeEventListener('keydown', neu);
      window.removeEventListener('wheel', neu);
    };
  }, [uhrLaeuft]);

  useEffect(() => {
    if (!uhrLaeuft) return;
    const zaehlen = () =>
      setRest(Math.max(1, Math.ceil((uhrStart.zeit + AUTO_WURF_MS - Date.now()) / 1000)));
    zaehlen();
    const t = window.setInterval(zaehlen, 200);
    return () => window.clearInterval(t);
  }, [uhrLaeuft, uhrStart]);

  /*
   * Hand, Aktionsleiste und Wuerfelknopf muessen neben das Menue passen. Wie
   * breit das ist, haengt von Fenster, Menue (auf oder zu) und Beute-Knopf ab -
   * deshalb gemessen statt geschaetzt: der Block wird so weit verkleinert, dass
   * er vor dem Menue endet.
   */
  const untenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = untenRef.current;
    if (!el) return;
    const passen = () => {
      const natur = el.scrollWidth;
      if (natur === 0) return;
      const links = el.getBoundingClientRect().left;
      const menu = document.querySelector('.menu');
      const rechts = menu ? menu.getBoundingClientRect().left - 12 : window.innerWidth - 36;
      const skala = Math.min(1, Math.max(0.5, (rechts - links) / natur));
      el.style.setProperty('--unten-skala', skala.toFixed(3));
    };
    passen();
    const ro = new ResizeObserver(passen);
    ro.observe(el);
    ro.observe(document.body);
    const mo = new MutationObserver(passen);
    mo.observe(document.querySelector('.main') ?? document.body, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);


  /*
   * Welche Felder hat der Wurf getroffen, und was fliegt davon zu mir?
   *
   * Beides kommt aus productionSources im Kern - dieselbe Funktion, aus der
   * auch die Abrechnung entsteht. Die Anzeige kann damit nichts behaupten,
   * was die Regel nicht deckt.
   */
  const quellen = useMemo(
    () => (produceEffect ? productionSources(state, world, produceEffect.roll, echtesWetter) : []),
    [produceEffect, state, world, echtesWetter],
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
   * Waehrend einer Bauwahl standen frueher ALLE Zahlen auf der Karte, damit man
   * Felder vergleichen kann. Im Aufbau deckten siebzig Marken und siebzig Ringe
   * die Landschaft zu, genau wenn man sie lesen muss. Jetzt zeigt eine Ecke
   * unter dem Zeiger die Zahlen ihrer drei Felder (Board) - wer alle will,
   * pinnt sie im Menue fest.
   */

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
          <span
            className={`hud-wetter zeit-${tageszeit}`}
            title={[
              `${TAGESZEIT_NAME[tageszeit]} noch ${rundenBisTageszeit(state.turn)} Runden`,
              `${WETTER_NAME[wetter]} noch ${rundenBisWetter(state.turn)} Runden`,
              WETTER_WIRKUNG[echtesWetter],
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <WetterSymbol tageszeit={tageszeit} wetter={wetter} />
            {TAGESZEIT_NAME[tageszeit]} · {WETTER_NAME[wetter]}
            {WETTER_WIRKUNG[echtesWetter] && <span className="hud-wirkung">!</span>}
          </span>
          <button
            className={stumm ? 'hud-ton aus' : 'hud-ton'}
            title={stumm ? 'Ton einschalten' : 'Ton ausschalten - Umgebung, Musik und Klaenge'}
            onClick={tonUmschalten}
          >
            <TonSymbol aus={stumm} />
          </button>
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
          log={log}
          welt={welt}
          einheiten={meineEinheiten}
          raumcode={useStore.getState().code}
          pin={useStore.getState().pin}
          lage={lage}
          fraktionen={fraktionen}
          befehl={befehl}
          beute={me?.loot ?? 0}
          befehleMoeglich={befehleMoeglich}
          beuteMoeglich={isMine && phase.t === 'main'}
          onBefehl={(id) => {
            setMitVerband(false);
            setBefehl((alt) => (alt === id && !mitVerband ? null : id));
          }}
          onHalt={(id) => {
            const u = meineEinheiten.find((x) => x.id === id);
            if (u) act({ t: 'orderUnit', unit: id, q: u.q, r: u.r });
          }}
          onZeigen={(id) => {
            const u = meineEinheiten.find((x) => x.id === id);
            if (u) zeigeFeld(u.q, u.r);
          }}
          onBeute={() => act({ t: 'claimLoot' })}
          showNumbers={pinNumbers}
          onToggleNumbers={() => setPinNumbers((v) => !v)}
          autoWurfSekunden={AUTO_WURF_MS / 1000}
          zeitInfo={{
            tageszeit,
            wetter,
            bisTageszeit: rundenBisTageszeit(state.turn),
            bisWetter: rundenBisWetter(state.turn),
            wirkung: WETTER_WIRKUNG[echtesWetter],
          }}
          held={meinHeld}
          heldZurueck={me?.heldZurueck ?? null}
          onFolgen={(id, folgen) => act({ t: 'follow', unit: id, follow: folgen })}
          diplomatieMoeglich={isMine && phase.t === 'main'}
          friedenBezahlbar={!!hand && canAfford(hand, FRIEDEN_PREIS)}
          tributBezahlbar={!!hand && RESOURCES.reduce((n, r) => n + hand[r], 0) >= TRIBUT_KARTEN}
          onDiplomatie={(fraktion, art) => act({ t: 'diplomacy', fraktion, art })}
          auftraege={meineAuftraege}
          onAuftrag={(id, annehmen) => act({ t: 'answerQuest', id, accept: annehmen })}
          onZeigenFeld={zeigeFeld}
          nameVon={(id) => fraktionById(state.worldSeed, id).name}
          braende={meineBraende}
          loeschKarte={loeschKarte}
          loeschenMoeglich={loeschenMoeglich}
          onLoeschen={loeschen}
          onErkunden={(id, an) => act({ t: 'explore', unit: id, explore: an })}
          verbandFeld={mitVerband && befehlsEinheit ? `${befehlsEinheit.q}:${befehlsEinheit.r}` : null}
          onVerbandZiel={(q, r) => {
            const erste = meineEinheiten.find((u) => u.q === q && u.r === r);
            if (!erste) return;
            setBefehl(erste.id);
            setMitVerband(true);
          }}
          onZeigenAuftrag={(a) => {
            const w = a.art === 'geleit' ? state.units.find((u) => u.id === a.wanderer) : undefined;
            zeigeFeld(w ? w.q : a.q, w ? w.r : a.r);
          }}
          kannLiefern={(a) => !!hand && a.rohstoff !== null && hand[a.rohstoff] >= a.menge}
          onLiefern={(id) => act({ t: 'deliverQuest', id })}
          stumm={stumm}
          onStumm={tonUmschalten}
          autoWurf={autoWurf}
          onToggleAutoWurf={() =>
            setAutoWurf((v) => {
              try {
                localStorage.setItem(AUTO_WURF_KEY, v ? 'aus' : 'an');
              } catch {
                // Privater Modus - dann gilt es nur diese Sitzung.
              }
              return !v;
            })
          }
        />

        {/* Erst wenn die Wuerfel weg sind - sonst verdeckt die Wahl die 7, die sie ausgeloest hat. */}
        {state.draft !== null && phase.t === 'draft' && pendingRoll === null && (
          <CardDraft
            options={state.draft.options}
            source={state.draft.source}
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
          showAllNumbers={pinNumbers}
          flashHexes={flashHexes}
          flights={flights}
          onPick={onPick}
          sicht={sicht}
          du={you}
          onHex={befehleMoeglich && meineEinheiten.length > 0 ? onHex : undefined}
          onFeuer={loeschenMoeglich && loeschKarte ? loeschen : undefined}
          zielWahl={befehl !== null}
          auswahl={befehl}
          fokus={fokus}
          tageszeit={tageszeit}
          wetter={wetter}
          geisterBau={isMine ? geisterBau : null}
          kronen={kronen}
          onKrone={(q, r) => setAusbauOrt({ art: 'feld', key: hexKey(q, r) })}
          onGebaeude={
            you && mode === null && befehl === null && phase.t !== 'setup'
              ? (vk) => setAusbauOrt({ art: 'ecke', key: vk })
              : undefined
          }
          onHauptstadtKlick={
            you && mode === null && befehl === null ? (hk) => setAusbauOrt({ art: 'feld', key: hk }) : undefined
          }
          onLeer={() => setAusbauOrt(null)}
          ausbau={ausbau}
        >
          {/*
            Unten links Hand und Aktionsleiste als ein Block. Die Leiste steht
            immer da, ausgegraut, solange nichts geht (ui/Aktionsleiste.tsx).
          */}
          <div className="unten" ref={untenRef}>
            {hand && <HandPanel hand={hand} />}
            {hand && (
              <Aktionsleiste
                state={state}
                me={me}
                hand={hand}
                isMine={isMine}
                mode={mode}
                setMode={setMode}
                act={act}
                verhaeltnis={(r) => (you ? tradeRatio(state, world, you, r) : 4)}
                onTafel={setTafelOffen}
                hauptstadtBereit={bereiteFelder.length > 0}
                onHauptstadt={() => {
                  const k = bereiteFelder[0];
                  if (!k) return;
                  zeigeFeld(k.q, k.r);
                  setAusbauOrt({ art: 'feld', key: hexKey(k.q, k.r) });
                }}
              />
            )}
            {/*
              Der Wuerfelknopf rechts neben der Aktionsleiste. Allein erledigt er
              Zug beenden und Wuerfeln in einem. Die Leiste am Fuss schrumpft
              mit der Zeit, die bis zum Selbstwurf bleibt.
            */}
            {hand && (
              <button
                className={['wuerfel-knopf', uhrLaeuft ? 'zaehlt' : '', wurfUnterwegs ? 'rollt' : '']
                  .filter(Boolean)
                  .join(' ')}
                disabled={!wurfMoeglich}
                title={
                  autoWurf
                    ? `Wuerfeln - geschieht nach ${AUTO_WURF_MS / 1000} Sekunden von selbst (abschaltbar im Menue unter TO)`
                    : 'Wuerfeln'
                }
                onClick={wuerfeln}
              >
                <span key={`s${wurfStoss}`} className="wuerfel-inhalt">
                  <span className="wuerfel-symbol">
                    <DieIcon />
                  </span>
                  <span className="wuerfel-text">Wuerfeln</span>
                </span>
                {uhrLaeuft && (
                  <>
                    <span
                      key={`u${uhrStart.n}`}
                      className="wuerfel-uhr"
                      style={{ animationDuration: `${AUTO_WURF_MS}ms` }}
                    />
                    <span className="wuerfel-rest">{rest}</span>
                  </>
                )}
                {wurfStoss > 0 && (
                  <span key={`f${wurfStoss}`} className="wuerfel-funken" aria-hidden="true">
                    {Array.from({ length: 12 }, (_, i) => (
                      <i key={i} style={{ '--w': `${i * 30}deg` } as CSSProperties} />
                    ))}
                  </span>
                )}
              </button>
            )}
          </div>

          {/*
            Handel zwischen Spielern - nur zu mehreren. Steht ausserhalb des
            Zugs: ein Angebot geht alle an, nicht nur den Spieler am Zug.
          */}
          {hand &&
            you &&
            state.order.length > 1 &&
            (state.trade !== null || (isMine && phase.t === 'main')) && (
              <div className="handel-schwebe">
                <TradePanel state={state} you={you} hand={hand} act={act} />
              </div>
            )}

          {befehl !== null && (
            <div className="befehl-hinweis">
              Ziel fuer{' '}
              {verbandGroesse > 1
                ? `den Verband (${verbandGroesse} Einheiten)`
                : befehl === meinHeld?.id
                  ? 'den Helden'
                  : 'den Ritter'}{' '}
              waehlen · Esc bricht ab
            </div>
          )}
          {diagnoseAn() && <Diagnose />}

          {pendingRoll !== null && (
            <DiceOverlay dice={pendingRoll} onDone={clearPendingRoll} />
          )}
        </Board>

      </main>

      {/* Abwerfen nach einer 7 */}
    </div>
  );
}

/** Lautsprecher mit Wellen oder mit Kreuz. PLATZHALTER (ASSETS.md). */
function TonSymbol({ aus }: { aus: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 6 H5 L9 2 V14 L5 10 H2 Z" fill="currentColor" />
      {aus ? (
        <path d="M11 5 L15 11 M15 5 L11 11" stroke="currentColor" strokeWidth={1.6} />
      ) : (
        <path d="M11 5 Q13 8 11 11 M13 3 Q16 8 13 13" stroke="currentColor" strokeWidth={1.4} fill="none" />
      )}
    </svg>
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


