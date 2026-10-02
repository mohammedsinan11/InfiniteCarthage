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

import { HANDELSSTRASSE_AB, laengsteRoute } from '../../core/handelswege';
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
import { reichskartenPlaetze } from '../../core/cards/loadout';
import { SideMenu } from '../ui/SideMenu';
import { Chronik } from '../ui/Chronik';
import { HausWahl } from '../ui/HausWahl';
import { TippBox } from '../ui/TippBox';
import { EreignisTafel } from '../ui/EreignisTafel';
import { ErsteSchritte } from '../ui/ErsteSchritte';
import { hausById } from '../../core/haus';
import { kartenPunkte } from '../../core/cards/wirkung';
import { COST_WUNDER, WUNDER, wunderAt } from '../../core/wunder';
import { szenarioById, szenarioStand } from '../../core/szenario';
import { KOOP_ZIEL_JE, wahlFrei, wunderHindernis } from '../../core/rules/reducer';
import type { Action } from '../../core/rules/reducer';
import { neuerRaumCode } from '../net/socket';
import { garrisonOf, isNestActive, nestFraktionOf, sightOf } from '../../core/units';
import { abkommenVon } from '../../core/combat';
import { WESEN, fraktionById } from '../../core/factions';
import { hexDistance, hexKey, hexVertices, hexesInRange, parseVertexKey, vertexAdjacentHexes, vertexKey } from '../../core/coords';
import { beiStumm, initAudio, istStumm, playBuild, playGain, playTurm, playWurfStart, setStumm } from '../audio';
import { setAmbiente } from '../ambiente';
import { roundOf, seasonOf } from '../../core/season';
import { RESOURCES } from '../../core/types';
import type { Resource } from '../../core/types';
import { COST_ARCHER, COST_CAPITAL, COST_CITY, COST_KNIGHT, COST_MAUER, COST_STUFE, COST_ROAD, COST_TOR, COST_TOWER, COST_TURM_STUFE, canAfford } from '../../core/rules/costs';
import { FRIEDEN_PREIS, nimmtFrieden, tributKarten } from '../../core/rules/diplomatie';
import { brennt } from '../../core/rules/feuer';
// maxLeben kennt Art, Zweig des Ernannten und Rang (core/combat.ts).
import { maxLeben } from '../../core/combat';
import { kampfFelder as kampfFelderVon } from '../../core/combat';
import type { UnitState as HeerEinheit } from '../../core/state';
import { bundleText } from '../log';
import { eckenWert, istBotId } from '../../core/bot';
import { weltArtVon } from '../../core/weltart';
import { einwohnerVon, platzFuer, stadtReif } from '../../core/bevoelkerung';
import { erstarkt, fraktionIn, stimmungText, stimmungVon } from '../../core/fraktionsleben';
import { geruechte } from '../geruechte';
import { holeTagesInfo } from '../net/socket';
import { KundeTafel } from '../ui/KundeTafel';
import { ratschlag } from '../rat';
import type { Rat } from '../rat';
import { vorhabenById, vorhabenFortschritt } from '../../core/vorhaben';
import { SIEGWEGE, fortschritt, schwelle, siegwegText, siegwegeAn } from '../../core/siegwege';
import { limitFor } from '../../core/rules/handlimit';
import { erzeugteSorten } from '../../core/rules/hilfe';
import {
  HAUPTSTADT_PUNKTE as PUNKTE_HAUPTSTADT,
  MAX_TURM_STUFE,
  STUFE_PUNKTE as PUNKTE_STUFE,
  TURM_NAME,
} from '../../core/state';
import { einheitNamen, gruppenStatus, heerGruppen, untaetig } from '../heer';
import { heldKurz } from '../../core/lore';
import { Heerleiste } from '../ui/Heerleiste';
import { Inventar } from '../ui/Inventar';
import {
  FAST_GESCHLOSSEN,
  MAX_STUFE,
  STUFE_NAME,
  ausbauHindernis,
  hatKoenigssitz,
  naechsteStufe,
  hauptstadtFelder,
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
  legalMauerEdges,
  legalRoadEdges,
  legalSettlementVertices,
  legalTowerVertices,
} from '../../core/rules/placement';
import { productionSources } from '../../core/rules/production';
import { tradeRatio, tradeRatioErklaert } from '../../core/rules/trade';
import { Aktionsleiste, SymHandel } from '../ui/Aktionsleiste';
import { aktPunkte, bossById } from '../../core/akte';
import { hatSystem, neuesSystem } from '../../core/systeme';
import { wirkungenVon } from '../../core/cards/wirkung';
import { kannBezahlen } from '../../core/rules/kosten';
import type { Bauwerk } from '../../core/cards/types';
import { leseProfil } from '../profil';
import { BossTafel, aktZahl } from '../ui/BossTafel';
import { EigenschaftWahl, PfadTafel } from '../ui/HeldenpfadTafel';
import type { BuildMode } from '../ui/Aktionsleiste';
import { reichArtVon } from '../ui/Aktionsleiste';
import { REICHSBAU_NAME, REICHSBAU_ZWECK, reichsbauHindernis, reichsgebiet } from '../../core/rules/reich';

export function Game() {
  const state = useStore((s) => s.state)!;
  const world = useStore((s) => s.world)!;
  const you = useStore((s) => s.you);
  const act = useStore((s) => s.act);
  const disconnect = useStore((s) => s.disconnect);
  const connect = useStore((s) => s.connect);
  const tipps = useStore((s) => s.tipps);
  const tippGelesen = useStore((s) => s.tippGelesen);
  /*
   * Der Feuer-Tipp wartet, solange es bei einem nicht brennt (Spieltest 4:
   * er kam, nachdem der Regen das Feuer schon geloescht hatte). Er bleibt in
   * der Reihe und erscheint beim naechsten eigenen Feuer.
   */
  // Hoechstens ein Tipp alle zwei Runden (Spieltest 5: zu viel Text auf
  // einmal) - Aufbau, Feuer und Fund ausgenommen: sie gehoeren zu genau
  // dem Moment, in dem sie kommen (Spieltest 6: der Fund-Tipp kam zu spaet).
  const [tippRuhe, setTippRuhe] = useState(-99);
  const sichtbareTipps = tipps
    .filter((t) => t.id !== 'feuer' || (state?.braende ?? []).some((b) => b.owner === you))
    .filter((t) => t.id === 'aufbau' || t.id === 'feuer' || t.id === 'fund' || (state?.turn ?? 0) >= tippRuhe + 2);
  const tippWeg = () => {
    setTippRuhe(state?.turn ?? 0);
    tippGelesen();
  };
  const pendingRoll = useStore((s) => s.pendingRoll);
  const kunde = useStore((s) => s.kunde);
  const schliesseKunde = useStore((s) => s.schliesseKunde);
  const clearPendingRoll = useStore((s) => s.clearPendingRoll);
  const announcements = useStore((s) => s.announcements);
  const dropAnnouncement = useStore((s) => s.dropAnnouncement);
  const log = useStore((s) => s.log);
  const welt = useStore((s) => s.welt);
  const produceEffect = useStore((s) => s.produceEffect);
  const pfeile = useStore((s) => s.pfeile);
  const clearPfeile = useStore((s) => s.clearPfeile);
  const treffer = useStore((s) => s.treffer);
  const clearTreffer = useStore((s) => s.clearTreffer);
  // Pfeile nach ihrem Flug wegraeumen - je Salve hoechstens fuenf, je 0,14 s versetzt.
  useEffect(() => {
    if (pfeile.length === 0) return;
    const t = window.setTimeout(clearPfeile, 1800);
    return () => window.clearTimeout(t);
  }, [pfeile, clearPfeile]);
  // Trefferzahlen steigen gut eine Sekunde lang auf, dann sind sie fort.
  useEffect(() => {
    if (treffer.length === 0) return;
    const t = window.setTimeout(clearTreffer, 2200);
    return () => window.clearTimeout(t);
  }, [treffer, clearTreffer]);
  const clearProduceEffect = useStore((s) => s.clearProduceEffect);

  const [mode, setMode] = useState<BuildMode>(null);
  /** Wo die Ausbau-Tafel offen ist: an einem eigenen Gebaeude oder an einer Krone. */
  const [ausbauOrt, setAusbauOrt] = useState<{ art: 'ecke' | 'feld' | 'raub'; key: string } | null>(null);
  /*
   * Auf Touch-Geraeten gibt es kein Darueberfahren: im Aufbau stehen dort alle
   * Zahlen, sonst waehlt man den Startplatz blind (Spieltest am Handy).
   */
  const grobZeiger = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true,
    [],
  );
  /** Zahlen festpinnen - fuer alle, die sie lieber dauerhaft sehen. */
  const [pinNumbers, setPinNumbers] = useState(() => {
    try {
      return localStorage.getItem('infinitecarthage.zahlen') === 'an';
    } catch {
      return false;
    }
  });
  /*
   * Welche Tafel der Bauleiste offen ist. Lag frueher in ui/Aktionsleiste.tsx.
   * Der Handelsknopf sitzt jetzt oben als Karte neben der Hand, also in einem
   * anderen Rasterfeld der unteren Leiste - beide brauchen denselben Zustand.
   */
  const [tafel, setTafel] = useState<null | 'handel' | 'karten'>(null);
  /** Das Angebot an Mitspieler (ui/TradePanel.tsx) - geoeffnet aus dem Bankhandel. */
  const [angebotOffen, setAngebotOffen] = useState(false);

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
  /*
   * Befehlstafel (Truppen, DESIGN.md): kandidaten sind die Einheiten der
   * gewaehlten Gruppe, auswahl die davon angehakten, die mitgehen. zielWahl:
   * der naechste Klick auf ein Feld schickt die Auswahl dorthin.
   */
  const [kandidaten, setKandidaten] = useState<number[]>([]);
  const [auswahl, setAuswahl] = useState<number[]>([]);
  const [zielWahl, setZielWahl] = useState(false);
  const [fokus, setFokus] = useState<{ q: number; r: number; n: number } | null>(null);
  const zeigeFeld = (q: number, r: number) => setFokus((alt) => ({ q, r, n: (alt?.n ?? 0) + 1 }));
  const waehleGruppe = (ids: number[], ziel = false) => {
    setKandidaten(ids);
    setAuswahl(ids);
    setZielWahl(ziel && ids.length > 0);
    // Befehle und Bauen schliessen sich aus: wer eine Einheit waehlt, will nicht
    // mehr bauen - sonst waeren die Befehlsknoepfe stumm gesperrt.
    if (ids.length > 0) setMode(null);
  };
  const auswahlSchliessen = () => {
    setKandidaten([]);
    setAuswahl([]);
    setZielWahl(false);
  };
  // Faellt eine Einheit, verschwindet sie aus Tafel und Auswahl.
  useEffect(() => {
    const da = new Set(meineEinheiten.map((u) => u.id));
    if (kandidaten.some((id) => !da.has(id))) setKandidaten((k) => k.filter((id) => da.has(id)));
    if (auswahl.some((id) => !da.has(id))) setAuswahl((a) => a.filter((id) => da.has(id)));
  }, [meineEinheiten, kandidaten, auswahl]);
  useEffect(() => {
    if (auswahl.length === 0) setZielWahl(false);
  }, [auswahl]);
  // Esc: erst die Zielwahl, dann die Tafel.
  useEffect(() => {
    if (kandidaten.length === 0) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (zielWahl) setZielWahl(false);
      else auswahlSchliessen();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [kandidaten, zielWahl]);
  /** Das Heer in Gruppen (client/heer.ts): Scharen und Felder. */
  const heer = useMemo(() => heerGruppen(meineEinheiten), [meineEinheiten]);
  /** Kein Gebaeude mehr, aber die Frist laeuft: eine Siedlung darf ueberall stehen (rules/untergang.ts). */
  const notbau = !!me && me.untergang !== null && !me.besiegt && !Object.values(state.buildings).some((b) => b.owner === me.id);
  // Geruechte (client/geruechte.ts): nur neu, wenn sich Reich, Sicht oder Funde aendern.
  const geruechteListe = useMemo(
    // Nur Geruechte zu Systemen dieser Partie (Spieltest 8: ein Wunder-Geruecht in der dritten Partie).
    () =>
      you && state.phase.t !== 'setup'
        ? geruechte(state, you, sicht).filter((g) => (g.art === 'wunder' ? hatSystem(state, 'reich') : hatSystem(state, 'held')))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [you, state.buildings, state.exploredRuins, state.wunder, sicht, state.worldSeed],
  );
  /*
   * Spuren der Tagesexpedition: wer heute schon in dieser Welt siedelte, hat
   * dort einen Gedenkstein (core/tages.ts, orte). Einmal geholt, nicht mehr.
   */
  const [spuren, setSpuren] = useState<{ q: number; r: number; text: string }[]>([]);
  useEffect(() => {
    if (!state.tagesDatum) return;
    let aus = false;
    holeTagesInfo()
      .then((info) => {
        if (aus || info.datum !== state.tagesDatum) return;
        const code = useStore.getState().code;
        setSpuren(
          info.eintraege
            .filter((e) => e.code !== code)
            .flatMap((e) =>
              (e.orte ?? []).map(([q, r]) => ({ q, r, text: `Hier siedelte ${e.name}${e.held ? ` mit ${e.held}` : ''} - Wertung ${e.wertung}` })),
            ),
        );
      })
      .catch(() => {});
    return () => {
      aus = true;
    };
  }, [state.tagesDatum]);
  /** Die Tafel eines angeklickten Lagers - Feldschluessel oder null. */
  const [lagerTafel, setLagerTafel] = useState<string | null>(null);
  /** Der Rat (client/rat.ts): ein Vorschlag, bis man ihn wegklickt oder der Zug wechselt. */
  const [rat, setRat] = useState<Rat | null>(null);
  /*
   * Neu in dieser Partie (core/systeme.ts): ein System, das zum ersten Mal
   * dabei ist, stellt sich einmal vor - beim ersten eigenen Zug.
   */
  const neuGezeigt = useRef(false);
  useEffect(() => {
    if (neuGezeigt.current || !state.systeme || state.turn > 2 || state.phase.t === 'setup' || state.phase.t === 'hauswahl') return;
    neuGezeigt.current = true;
    const neu = neuesSystem(leseProfil().partien);
    if (neu && state.systeme.includes(neu.id)) setRat({ text: `Neu in dieser Partie - ${neu.name}: ${neu.text}` });
  }, [state.systeme, state.turn, state.phase.t]);
  useEffect(() => setRat(null), [state.turn, state.current]);
  /** Vorhaben fuers Menue (core/vorhaben.ts). */
  const vorhabenSicht = useMemo(() => {
    const lohnText = (l: { ruhm?: number; beute?: number }) =>
      [l.ruhm ? `+${l.ruhm} Ruhm` : '', l.beute ? 'Kartenwahl' : ''].filter(Boolean).join(', ');
    const stand = you ? state.vorhaben?.[you] : undefined;
    const angebot = (stand?.angebot ?? [])
      .map((id) => vorhabenById(id))
      .filter((v): v is NonNullable<typeof v> => !!v)
      .map((v) => ({ id: v.id, name: v.name, text: v.text, lohn: lohnText(v.lohn) }));
    const a = stand?.aktiv;
    const v = a ? vorhabenById(a.id) : undefined;
    const f = you ? vorhabenFortschritt(state, you) : null;
    return {
      angebot,
      aktiv:
        a && v && f
          ? { name: v.name, text: v.text, lohn: lohnText(v.lohn), ist: f[0], soll: f[1], rest: Math.max(0, a.bis - state.turn + 1) }
          : null,
    };
  }, [state, you]);
  const kampfOrte = useMemo(() => new Set(kampfFelderVon(state).keys()), [state]);
  /** Wie der eigene Held heisst (core/lore.ts) - undefined, bevor er antritt. */
  const heldName = useMemo(() => {
    const lore = state.players.find((p) => p.id === you)?.held;
    return lore ? heldKurz(lore) : undefined;
  }, [state.players, you]);
  const heerNamen = useMemo(() => einheitNamen(meineEinheiten, heldName), [meineEinheiten, heldName]);
  const untaetige = meineEinheiten.filter(untaetig);
  const naechsteUntaetige = useRef(0);

  /** Die Felder an meinen Siedlungen - von hier aus wird gemessen. */
  const meineFelder = useMemo(
    () =>
      Object.entries(state.buildings)
        .filter(([, b]) => b.owner === you)
        .flatMap(([vk]) => vertexAdjacentHexes(parseVertexKey(vk))),
    [state.buildings, you],
  );

  /**
   * Ein Raubzug, der auf mich zuhaelt und nah ist: dafuer die Warnung mit
   * Gegenmitteln, bevor es brennt (Spieltest: Raubzuege kamen ohne Vorwarnung).
   * Nur Truppen ohne Beute - wer schon traegt, zieht heim.
   */
  /** Ausgeblendete Warnungen: Fraktion -> bis zu welcher Runde (Spieltest: kam jede Runde wieder). */
  const [weggeklickt, setWeggeklickt] = useState<Record<string, number>>({});
  /** Die Tafel des Aktes (core/akte.ts) - oeffnet sich, wenn ein neuer Akt beginnt. */
  const [bossOffen, setBossOffen] = useState(false);
  /** Der Heldenpfad (core/heldenpfad.ts): die Wahl des Ziels - oeffnet sich bei einem neuen Angebot. */
  const meinPfad = you ? state.pfade?.[you] : undefined;
  const [pfadOffen, setPfadOffen] = useState(false);
  const pfadGesehen = useRef<string>('');
  useEffect(() => {
    const k = meinPfad?.angebot ? meinPfad.angebot.map((z) => `${z.q}:${z.r}`).join('|') : '';
    if (k && k !== pfadGesehen.current) setPfadOffen(true);
    pfadGesehen.current = k;
  }, [meinPfad]);
  const meinAkt = you ? state.akte?.stand[you] : undefined;
  const gesehenerAkt = useRef<number | null>(null);
  useEffect(() => {
    if (!meinAkt || state.phase.t === 'finished') return;
    if (gesehenerAkt.current !== meinAkt.akt) {
      // Beim Wiedereinstieg mitten im Akt nicht noch einmal aufdraengen.
      if (gesehenerAkt.current !== null || state.turn - (meinAkt.bis - (state.akte?.laenge ?? 0)) <= 2) setBossOffen(true);
      gesehenerAkt.current = meinAkt.akt;
    }
  }, [meinAkt, state.turn, state.akte?.laenge, state.phase.t]);
  const raubWarnung = useMemo(() => {
    // Nach dem Ende warnt nichts mehr (Spieltest 4: die Warnung zaehlte weiter).
    if (!you || meineFelder.length === 0 || state.phase.t === 'finished') return null;
    const felder = new Set(meineFelder.map((h) => hexKey(h.q, h.r)));
    let best: { u: HeerEinheit; weg: number; anzahl: number; schluessel: string; tribut: number } | null = null;
    for (const u of state.units) {
      if (u.auftrag !== 'raub' || u.fraktion === null || u.ziel === null || u.traegt > 0) continue;
      if (!felder.has(hexKey(u.ziel.q, u.ziel.r))) continue;
      if (abkommenVon(state, you, u.fraktion)) continue;
      const weg = hexDistance(u, u.ziel);
      if (weg > 12) continue;
      const schluessel = u.fraktion;
      if ((weggeklickt[schluessel] ?? -1) >= state.turn) continue;
      const anzahl = state.units.filter((x) => x.heimat === u.heimat && x.auftrag === 'raub').length;
      if (!best || weg < best.weg) best = { u, weg, anzahl, schluessel, tribut: tributKarten(state, you, u.fraktion) };
    }
    return best;
  }, [state, you, meineFelder, weggeklickt]);

  const hand = me?.hand;
  const phase = state.phase;
  const isMine = state.currentPlayer === you && phase.t !== 'finished';
  useEffect(() => {
    if (!isMine) setAngebotOffen(false);
  }, [isMine]);
  /*
   * Beute loest sich selbst ein (Spieltest 7: der Beuteknopf war einer von zu
   * vielen): in der Bauphase oeffnet sich die Kartenwahl von allein, solange
   * in diesem Zug noch eine Wahl frei ist (rules/reducer.ts, wahlFrei). Je Zug
   * und Beutestand nur ein Versuch - scheitert er, bleibt die Beute liegen.
   */
  const beuteVersucht = useRef(new Set<string>());
  const meineTrophaeen = me?.trophaeen ?? 0;
  const meineBeute = (me?.loot ?? 0) + meineTrophaeen;
  useEffect(() => {
    if (!isMine || phase.t !== 'main' || meineBeute <= 0 || state.draft !== null) return;
    // Trophaeen besiegter Bosse kommen immer - Beute nur, solange eine Wahl frei ist.
    if (meineTrophaeen === 0 && !wahlFrei({ ...state, wahlen: state.wahlen ?? undefined })) return;
    const schluessel = `${state.turn}:${meineBeute}`;
    if (beuteVersucht.current.has(schluessel)) return;
    beuteVersucht.current.add(schluessel);
    act({ t: 'claimLoot' });
  }, [isMine, phase.t, meineBeute, meineTrophaeen, state, act]);

  /**
   * Die besten Bauplaetze hervorheben: viele Wurfpunkte, dazu Sorten, die man
   * noch nicht hat (core/bot.ts, eckenWert) - Spieltest: auf der vollen Karte
   * fanden Neue keinen guten Start.
   */
  const mitEmpfehlung = (vertices: string[], n: number): Targets => {
    if (!you) return { vertices };
    const schon = erzeugteSorten(state, world, you);
    const wert = new Map(vertices.map((vk) => [vk, eckenWert(world, vk, schon)]));
    // Verteilt: keine zwei Empfehlungen am selben Feld, sonst saessen alle
    // Sterne um dieselbe gute Stelle.
    const empfohlen: string[] = [];
    const belegt = new Set<string>();
    const sortiert = [...vertices].sort((a, b) => wert.get(b)! - wert.get(a)!);
    /*
     * Nicht nahe an ein Lager empfehlen - dort brennt das erste Dorf
     * (Spieltests 3 und 4: der Stern im Lehrgang lag gleich neben den
     * Goblins). Zuerst mit drei Feldern Abstand; reicht das nicht fuer genug
     * Sterne, mit zwei.
     */
    for (const abstand of [2, 1]) {
      for (const vk of sortiert) {
        if (empfohlen.length >= n) break;
        if (empfohlen.includes(vk)) continue;
        const nachbarn = vertexAdjacentHexes(parseVertexKey(vk));
        const felder = nachbarn.map((h) => hexKey(h.q, h.r));
        if (felder.some((k) => belegt.has(k))) continue;
        if (nachbarn.some((h) => hexesInRange(h, abstand).some((x) => isNestActive(state, x.q, x.r)))) continue;
        empfohlen.push(vk);
        for (const k of felder) belegt.add(k);
      }
    }
    return { vertices, empfohlen };
  };

  /** Welche Stellen darf ich gerade anklicken? */
  const targets: Targets = useMemo(() => {
    if (!you || !isMine) return {};
    switch (phase.t) {
      case 'setup':
        return phase.awaiting === 'settlement'
          ? mitEmpfehlung(legalSettlementVertices(state, world, you, { setup: true }), 5)
          : { edges: legalRoadEdges(state, world, you, phase.lastVertex ?? undefined) };
      case 'roadBuilding':
        return { edges: legalRoadEdges(state, world, you) };
      case 'main':
        if (mode === 'road') {
          // Reicht es nur fuer den Wiederaufbau, stehen nur die eigenen Aschekanten zur Wahl.
          const alle = legalRoadEdges(state, world, you);
          return {
            edges: hand && you && !kannBezahlen(hand, COST_ROAD, wirkungenVon(state, you), 'strasse') ? alle.filter((ek) => state.asche[ek] === you) : alle,
          };
        }
        if (mode === 'tower') {
          // Freie Ecke an einer eigenen Strasse oder im eigenen Einflussbereich,
          // ohne Abstandsregel (rules/placement.ts).
          return { vertices: legalTowerVertices(state, world, you) };
        }
        if (mode === 'mauer' || mode === 'tor') {
          // Freie Kante im eigenen Einflussbereich - dieselbe Regel fuer Wand und Tor.
          return { edges: legalMauerEdges(state, world, you) };
        }
        if (reichArtVon(mode) !== null) {
          // Phase 2: alle Kacheln des eigenen Reichs, auf denen ein Bau erlaubt ist.
          const gebiet = reichsgebiet(state, you);
          return {
            hexes: [...gebiet].filter((k) => {
              const [q, r] = k.split(':').map(Number) as [number, number];
              return reichsbauHindernis(state, you, q, r, gebiet) === null;
            }),
          };
        }
        if (mode === 'settlement') {
          return mitEmpfehlung(legalSettlementVertices(state, world, you, { setup: notbau }), 3);
        }
        if (mode === 'city') return { vertices: legalCityVertices(state, you).filter((vk) => stadtReif(state, vk)) };
        return {};
      default:
        return {};
    }
  }, [state, world, you, isMine, phase, mode, hand]);

  /** Gibt es ueberhaupt einen Platz fuer ein Dorf? Sonst bleibt der Knopf aus (Spieltest 5). */
  const dorfPlatz = useMemo(
    () => !!you && isMine && phase.t === 'main' && legalSettlementVertices(state, world, you, { setup: notbau }).length > 0,
    [state, world, you, isMine, phase.t, notbau],
  );

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
      if ((mode === 'mauer' || mode === 'tor') && kind === 'edge') {
        act({ t: 'buildMauer', edge: key, art: mode === 'tor' ? 'tor' : 'wand' });
      }
      const reichArt = reichArtVon(mode);
      if (reichArt !== null && kind === 'hex') {
        const [q, r] = key.split(':').map(Number) as [number, number];
        act({ t: 'buildReich', q, r, art: reichArt });
      }
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
    if (zielWahl && auswahl.length > 0) {
      act({ t: 'orderUnits', units: auswahl, q: q!, r: r! });
      auswahlSchliessen();
      return;
    }
    // Ein Klick auf eigene Einheiten oeffnet ihre Tafel: die ganze Schar, wenn
    // alle auf dem Feld zu ihr gehoeren, sonst alle Einheiten des Feldes.
    const aufFeld = befehleMoeglich ? meineEinheiten.filter((u) => u.q === q && u.r === r) : [];
    if (aufFeld.length === 0) {
      auswahlSchliessen();
      // Ein Lager: seine Tafel - Anfuehrer, Besatzung, Abkommen (OVERHAUL.md, 2).
      // Lager stehen auch im Nebel auf der Karte - wer sie sieht, soll sie anklicken koennen.
      const lagerDa = isNestActive(state, q!, r!);
      setLagerTafel(lagerDa ? key : null);
      if (lagerDa) setRat(null);
      return;
    }
    setLagerTafel(null);
    const schar = heer.find((g) => g.schar !== null && aufFeld.every((u) => g.einheiten.includes(u)));
    // Gleich scharf: der naechste Klick auf die Karte ist das Ziel.
    waehleGruppe((schar ? schar.einheiten : aufFeld).map((u) => u.id), true);
  };
  const befehleMoeglich = isMine && (phase.t === 'main' || phase.t === 'roll') && mode === null;


  /** Siegpunkte aufgeschluesselt - fuers Menue (Reich). */
  // Bekannte Wunderstaetten (core/wunder.ts): alle auf aufgedeckten Feldern.
  const wunderListe = useMemo(() => {
    const out: { key: string; q: number; r: number; name: string; text: string; punkte: number; besitzer: string | null; grund: string | null; bezahlbar: boolean }[] = [];
    for (const t of world.tiles.values()) {
      const art = wunderAt(state.worldSeed, t.q, t.r);
      if (!art) continue;
      const key = hexKey(t.q, t.r);
      const w = state.wunder[key];
      const typ = WUNDER[art];
      out.push({
        key,
        q: t.q,
        r: t.r,
        name: typ.name,
        text: typ.text,
        punkte: typ.punkte,
        besitzer: w ? (state.players.find((p) => p.id === w.owner)?.name ?? 'jemand') : null,
        grund: you ? wunderHindernis(state, world, you, t.q, t.r) : 'Zuschauer',
        bezahlbar: !!me?.hand && canAfford(me.hand, COST_WUNDER),
      });
    }
    return out;
  }, [world, state, you, me]);

  const punkte = useMemo(() => {
    const eigene = Object.values(state.buildings).filter((b) => b.owner === you);
    const doerfer = eigene.filter((b) => b.type === 'settlement').length;
    const staedte = eigene.filter((b) => b.type === 'city').length;
    const haupt = Object.values(state.hauptstaedte ?? {}).filter((h) => h.owner === you);
    const hauptPunkte = haupt.reduce((n, h) => n + PUNKTE_HAUPTSTADT + (h.stufe - 1) * PUNKTE_STUFE, 0);
    const karten = (state.players.find((p) => p.id === you)?.dev ?? []).filter((d) => d.type === 'victoryPoint').length;
    return {
      gesamt: state.myPoints,
      // Mit Akten gibt es kein Punkteziel - am Ende zaehlt die Wertung.
      ziel: state.akte ? 0 : state.targetPoints,
      rundenLimit: state.rundenLimit,
      wertung: state.myPoints * 10 + (state.players.find((p) => p.id === you)?.ruhm ?? 0),
      zeilen: [
        { text: `Doerfer ${doerfer} × 1`, wert: doerfer > 0 ? doerfer : null },
        { text: `Staedte ${staedte} × 2`, wert: staedte > 0 ? staedte * 2 : null },
        { text: haupt.length > 1 ? `Hauptstaedte ${haupt.length}` : 'Hauptstadt', wert: hauptPunkte > 0 ? hauptPunkte : null },
        { text: 'Siegpunktkarten', wert: karten > 0 ? karten : null },
        { text: 'Punktekarten', wert: you && kartenPunkte(state, you) > 0 ? kartenPunkte(state, you) : null },
        { text: 'Ruhmreichster', wert: state.ruhmreichster === you ? 2 : null },
        // Die Handelsstrasse (core/handelswege.ts): der laengste Weg zwischen zwei eigenen Siedlungen.
        {
          text: `Handelsstrasse${you ? ` (dein Weg: ${laengsteRoute(state, you)?.laenge ?? 0}, ab ${HANDELSSTRASSE_AB})` : ''}`,
          wert: state.handelsstrasse === you ? 2 : null,
        },
        // Bestandene Akte (core/akte.ts): je Akt so viele Punkte wie seine Zahl.
        ...(state.akte ? [{ text: `Bosse bezwungen (Akt ${(state.akte.siege[you ?? ''] ?? []).join(', ') || '-'})`, wert: you && aktPunkte(state.akte, you) > 0 ? aktPunkte(state.akte, you) : null }] : []),
      ],
    };
  }, [state, you]);

  /** Rohstoffkarten je Wuerfelzahl aus eigenen Siedlungen - fuers Menue (Reich). */
  const ertrag = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [vk, b] of Object.entries(state.buildings)) {
      if (b.owner !== you) continue;
      for (const h of vertexAdjacentHexes(parseVertexKey(vk))) {
        const t = world.tiles.get(hexKey(h.q, h.r));
        if (!t || t.number === null) continue;
        out[t.number] = (out[t.number] ?? 0) + (b.type === 'city' ? 2 : 1);
      }
    }
    return out;
  }, [state.buildings, world, you]);

  /*
   * Die Befehlstafel an den gewaehlten Einheiten (Board): jede Einheit als Chip
   * zum An- und Abwaehlen - wer angehakt ist, geht mit. Ziel, Halt, Erkunden,
   * Folgen, und fuer eine Schar "Banner aufloesen". PLATZHALTER (ASSETS.md).
   */
  const tafelEinheiten = kandidaten
    .map((id) => meineEinheiten.find((u) => u.id === id))
    .filter((u): u is HeerEinheit => u !== undefined);
  const gewaehlte = tafelEinheiten.filter((u) => auswahl.includes(u.id));
  const tafelSchar = heer.find(
    (g) => g.schar !== null && tafelEinheiten.length > 0 && tafelEinheiten.every((u) => g.einheiten.includes(u)),
  );
  const befehlsTafel =
    tafelEinheiten.length === 0
      ? null
      : {
          q: tafelEinheiten[0]!.q,
          r: tafelEinheiten[0]!.r,
          inhalt: (
            <>
              <div className="ausbau-titel">
                <span>
                  {tafelSchar ? `Schar ${tafelSchar.schar}` : tafelEinheiten.length > 1 ? 'Verband' : heerNamen.get(tafelEinheiten[0]!.id)}
                  {tafelEinheiten.length > 1 ? ` · ${tafelEinheiten.length}` : ''}
                </span>
                <button className="dock-zu" title="Schliessen" onClick={auswahlSchliessen}>
                  x
                </button>
              </div>
              {tafelEinheiten.length > 1 && (
                <div className="befehl-chips">
                  {tafelEinheiten.map((u) => {
                    const an = auswahl.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        className={an ? 'befehl-chip an' : 'befehl-chip'}
                        title={an ? 'Geht mit - klicken, damit sie bleibt' : 'Bleibt - klicken, damit sie mitgeht'}
                        onClick={() => setAuswahl((a) => (an ? a.filter((x) => x !== u.id) : [...a, u.id]))}
                      >
                        {heerNamen.get(u.id)} <span className="befehl-chip-leben">{u.leben}/{maxLeben(u)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                className={zielWahl ? 'ausbau-option aktiv' : 'ausbau-option'}
                disabled={!befehleMoeglich || gewaehlte.length === 0}
                title={befehleMoeglich ? undefined : 'Befehle gibt es in deinem Zug'}
                onClick={() => setZielWahl((z) => !z)}
              >
                {zielWahl
                  ? 'Jetzt ein Feld auf der Karte waehlen'
                  : gewaehlte.length > 1
                    ? `Ziel fuer ${gewaehlte.length} waehlen`
                    : 'Ziel waehlen'}
              </button>
              <div className="befehl-knoepfe">
                <button
                  disabled={!befehleMoeglich || !gewaehlte.some((u) => u.ziel !== null || u.folgt !== null || u.auftrag === 'erkunden')}
                  onClick={() => act({ t: 'orderUnits', units: gewaehlte.map((u) => u.id), q: 0, r: 0, halt: true })}
                >
                  Halt
                </button>
                <button
                  disabled={!befehleMoeglich || gewaehlte.length === 0}
                  title="Von selbst erkunden: zur naechsten Ruine oder ins Unbekannte"
                  onClick={() => {
                    for (const u of gewaehlte) act({ t: 'explore', unit: u.id, explore: true });
                    auswahlSchliessen();
                  }}
                >
                  Erkunden
                </button>
                {meinHeld && (
                  <button
                    disabled={!befehleMoeglich || !gewaehlte.some((u) => u.kind !== 'held')}
                    title="Dem Helden folgen - so schnell wie er"
                    onClick={() => {
                      for (const u of gewaehlte) if (u.kind !== 'held') act({ t: 'follow', unit: u.id, follow: true });
                      auswahlSchliessen();
                    }}
                  >
                    Folgen
                  </button>
                )}
                {tafelSchar && (
                  <button
                    disabled={!befehleMoeglich}
                    title="Das Banner einholen - die Einheiten stehen wieder fuer sich"
                    onClick={() => act({ t: 'disbandGroup', verband: tafelSchar.verband! })}
                  >
                    Banner aufloesen
                  </button>
                )}
              </div>
            </>
          ),
        };

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
    if (mode !== null || kandidaten.length > 0) setAusbauOrt(null);
  }, [mode, kandidaten]);
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
    // Rabatt und Ersatz der Karten (rules/kosten.ts) gelten auch hier.
    const wk = wirkungenVon(state, you);
    const bezahlbar = (k: Cost, was?: Bauwerk) => !!hand && (was ? kannBezahlen(hand, k, wk, was) : canAfford(hand, k));
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
    /** Die naechste Ausbaustufe einer eigenen Hauptstadt: Festungsring, dann Koenigssitz. */
    const ausbauOption = (q: number, r: number, stufe: number) => {
      const hindernis = ausbauHindernis(state, you, q, r);
      const kosten = COST_STUFE[stufe]!;
      return {
        name: STUFE_NAME[stufe] ?? `Stufe ${stufe}`,
        kosten,
        darf: jetzt && hindernis === null && bezahlbar(kosten),
        hinweis: hindernis ?? warum ?? armut(kosten),
        wahl: dann(() => {
          act({ t: 'upgradeCapital', q, r });
          playBuild();
        }),
      };
    };
    if (ausbauOrt.art === 'raub') {
      // Die Gegenmittel gegen den Raubzug - am roten Banner auf der Karte.
      const rw = raubWarnung;
      if (!rw) return null;
      const f = fraktionIn(state, rw.u.fraktion!);
      const karten = hand ? RESOURCES.reduce((n, r) => n + hand[r], 0) : 0;
      const optionen: AusbauTafel['optionen'] = [
        { name: 'Trupp zeigen', darf: true, wahl: dann(() => zeigeFeld(rw.u.q, rw.u.r)) },
        {
          name: 'Heer entgegen',
          darf: meineEinheiten.length > 0 && befehleMoeglich,
          hinweis: meineEinheiten.length === 0 ? 'Du hast keine Ritter oder Bogenschuetzen' : (warum ?? 'Jetzt nicht'),
          wahl: dann(() => {
            const wer = (untaetige.length > 0 ? untaetige : meineEinheiten).map((u) => u.id);
            act({ t: 'orderUnits', units: wer, q: rw.u.ziel!.q, r: rw.u.ziel!.r });
          }),
        },
        {
          name: `Tribut: ${mehrzahl(rw.tribut, 'Karte', 'Karten')} je Runde`,
          darf: jetzt && karten >= rw.tribut,
          hinweis: warum ?? 'Zu wenig Karten',
          wahl: dann(() => act({ t: 'diplomacy', fraktion: rw.u.fraktion!, art: 'tribut' })),
        },
      ];
      if (nimmtFrieden(state.worldSeed, rw.u.fraktion!, state.fraktionen)) {
        optionen.push({
          name: 'Frieden (20 Runden)',
          kosten: FRIEDEN_PREIS,
          darf: jetzt && bezahlbar(FRIEDEN_PREIS),
          hinweis: warum ?? armut(FRIEDEN_PREIS),
          wahl: dann(() => act({ t: 'diplomacy', fraktion: rw.u.fraktion!, art: 'frieden' })),
        });
      }
      optionen.push({ name: 'Ausblenden', darf: true, wahl: dann(() => setWeggeklickt((w) => ({ ...w, [rw.schluessel]: state.turn + 5 }))) });
      return {
        ort: ausbauOrt,
        titel: `Raubzug: ${f.name}`,
        text: `${rw.anzahl > 1 ? `${rw.anzahl} Mann` : 'Ein Trupp'}${f.anfuehrer ? ` unter ${f.anfuehrer}` : ''}, noch ${mehrzahl(rw.weg, 'Feld', 'Felder')}. Ritter und Bogenschuetzen halten sie auf.`,
        optionen,
      };
    }
    if (ausbauOrt.art === 'feld') {
      const hauptstadt = state.hauptstaedte?.[ausbauOrt.key];
      if (hauptstadt && hauptstadt.owner === you) {
        const [q, r] = ausbauOrt.key.split(':').map(Number) as [number, number];
        const naechste = naechsteStufe(state, q, r);
        return {
          ort: ausbauOrt,
          titel: `Hauptstadt · ${STUFE_NAME[hauptstadt.stufe] ?? `Stufe ${hauptstadt.stufe}`}`,
          optionen: naechste !== null ? [ausbauOption(q, r, naechste)] : [],
          leer: 'Der Koenigssitz steht - hoeher geht es nicht.',
        };
      }
      /*
       * Ein eigener Reichsbau: ausbauen laesst er sich nicht, aber die Tafel
       * sagt, was er bewirkt. Ohne diesen Zweig fiel ein Klick auf ihn bis zum
       * "return null" durch - die Tafel blieb leer, und der Bau wirkte tot.
       */
      const reichsbau = state.reichsbauten?.[ausbauOrt.key];
      if (reichsbau && reichsbau.owner === you) {
        const art = reichsbau.art as 'burgfeste';
        return {
          ort: ausbauOrt,
          titel: REICHSBAU_NAME[art] ?? 'Reichsbau',
          optionen: [],
          leer: REICHSBAU_ZWECK[art] ?? 'Ein Bau deines Reichs.',
        };
      }
      const u = umland.find((x) => hexKey(x.q, x.r) === ausbauOrt.key);
      if (!u) return null;
      return { ort: ausbauOrt, titel: u.bereit ? 'Umschlossenes Feld' : 'Fast umschlossen', optionen: [hauptstadtOption(u)] };
    }
    // Ein eigener Wachturm: die Tafel zeigt, was er werden kann (state.tuerme).
    const turm = state.tuerme?.[ausbauOrt.key];
    if (turm && turm.owner === you) {
      const naechste = turm.stufe < MAX_TURM_STUFE ? turm.stufe + 1 : null;
      return {
        ort: ausbauOrt,
        titel: `Wachturm · ${TURM_NAME[turm.stufe] ?? `Stufe ${turm.stufe}`}`,
        optionen:
          naechste === null
            ? []
            : [
                {
                  name: TURM_NAME[naechste] ?? `Stufe ${naechste}`,
                  kosten: COST_TURM_STUFE[naechste]!,
                  darf: jetzt && bezahlbar(COST_TURM_STUFE[naechste]!),
                  hinweis: warum ?? armut(COST_TURM_STUFE[naechste]!),
                  wahl: dann(() => {
                    act({ t: 'upgradeTower', vertex: ausbauOrt.key });
                    playTurm();
                  }),
                },
              ],
        leer: `Der ${TURM_NAME[MAX_TURM_STUFE]} steht - hoeher geht es nicht.`,
      };
    }
    const b = state.buildings[ausbauOrt.key];
    if (!b || b.owner !== you) return null;
    const feuer = brennt(state, ausbauOrt.key) ? 'Hier brennt es' : undefined;
    const optionen: AusbauTafel['optionen'] = [];
    if (b.type === 'settlement') {
      optionen.push({
        name: 'Stadt',
        kosten: COST_CITY,
        darf: jetzt && !feuer && bezahlbar(COST_CITY, 'stadt'),
        hinweis: warum ?? feuer ?? armut(COST_CITY),
        wahl: dann(() => {
          act({ t: 'buildCity', vertex: ausbauOrt.key });
          playBuild();
        }),
      });
    }
    /*
     * Was frueher in der Leiste unter Befestigen und Truppe lag, steht hier am
     * eigenen Haus (Spieltest 7: "zu viele Knoepfe, die ich nie benutze").
     * Turm, Palisade und Tor waehlen den Bau - die Plaetze zeigt dann die
     * Karte; Ritter und Bogen treten sofort an.
     */
    const bauWahl = (name: string, kosten: Cost, m: BuildMode) => ({
      name,
      kosten,
      darf: jetzt && bezahlbar(kosten),
      hinweis: warum ?? armut(kosten),
      wahl: dann(() => setMode(m)),
    });
    const truppe = (name: string, kosten: Cost, a: Action) => ({
      name,
      kosten,
      darf: jetzt && bezahlbar(kosten),
      hinweis: warum ?? armut(kosten),
      wahl: dann(() => act(a)),
    });
    // Wehr und Truppen erst, wenn Raubzuege dabei sind (core/systeme.ts).
    if (hatSystem(state, 'raub')) {
      optionen.push(
        bauWahl('Turm', COST_TOWER, 'tower'),
        bauWahl('Palisade', COST_MAUER, 'mauer'),
        bauWahl('Tor', COST_TOR, 'tor'),
        truppe('Ritter', COST_KNIGHT, { t: 'recruitKnight' }),
        truppe('Bogen', COST_ARCHER, { t: 'recruitArcher' }),
      );
    }
    // Jedes fast geschlossene Feld an dieser Ecke - eine Stadt kann an mehreren Ringen liegen.
    for (const u of umland) {
      if (u.fehlt > FAST_GESCHLOSSEN || !hexVertices(u.q, u.r).some((v) => vertexKey(v) === ausbauOrt.key)) continue;
      optionen.push(hauptstadtOption(u));
    }
    // An einer Ecke der eigenen Hauptstadt: die naechste Stufe geht auch von hier.
    for (const [hk, h] of Object.entries(state.hauptstaedte ?? {})) {
      if (h.owner !== you || h.stufe >= MAX_STUFE) continue;
      const [q, r] = hk.split(':').map(Number) as [number, number];
      if (hexVertices(q, r).some((v) => vertexKey(v) === ausbauOrt.key)) optionen.push(ausbauOption(q, r, h.stufe + 1));
    }
    const ew = state.ereignisseAn ? ` · ${einwohnerVon(state, ausbauOrt.key)}/${platzFuer(state, ausbauOrt.key)} Einwohner` : '';
    return { ort: ausbauOrt, titel: `${b.type === 'city' ? 'Stadt' : 'Dorf'}${ew}`, optionen };
  }, [ausbauOrt, you, isMine, phase.t, hand, state, umland, act, raubWarnung, meineEinheiten, untaetige, befehleMoeglich]);

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

  /** Was auf einer freien Kante als Vorschau steht - Strasse ist der Normalfall. */
  const geisterKante: 'strasse' | 'wand' | 'tor' = mode === 'mauer' ? 'wand' : mode === 'tor' ? 'tor' : 'strasse';

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
  // Ohne eigene Wahl: allein aus (niemand wartet, und wer das Protokoll liest,
  // soll nicht weggewuerfelt werden - IDEEN.md, Spielbarkeit 5), zu mehreren an.
  const [autoWurf, setAutoWurf] = useState(() => {
    try {
      const gewaehlt = localStorage.getItem(AUTO_WURF_KEY);
      // Nur gegen Menschen an - allein oder gegen Bots wartet niemand (Spieltest 8:
      // die Uhr spielte Zuege, waehrend man Karten las).
      const andereMenschen = state.order.some((id) => id !== you && !istBotId(id));
      return gewaehlt === null ? andereMenschen : gewaehlt !== 'aus';
    } catch {
      return false;
    }
  });
  const [tafelOffen, setTafelOffen] = useState(false);
  /*
   * Der Wuerfel beendet auch den Zug (Spieltest 5: "Zug Ende" war doppelt).
   * Allein oder nur gegen Bots wirft er danach gleich den naechsten Wurf -
   * die Bots ziehen auf dem Server sofort. Gegen Menschen beendet er nur den
   * Zug und heisst dann auch so.
   */
  const nurBots = state.order.every((id) => id === you || istBotId(id));
  const wurfMoeglich =
    isMine && pendingRoll === null && !wurfUnterwegs && (phase.t === 'roll' || phase.t === 'main');
  const nurZugEnde = phase.t === 'main' && !nurBots;
  const uhrLaeuft =
    wurfMoeglich &&
    // Gegen Menschen beendet die Uhr den Zug nicht von selbst.
    !nurZugEnde &&
    autoWurf &&
    mode === null &&
    kandidaten.length === 0 &&
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
    if (phase.t === 'main') {
      act({ t: 'endTurn' });
      if (state.order.length > 1) {
        // Gegen Bots: geworfen wird, sobald der eigene Zug wieder da ist.
        if (nurBots) wurfNachZug.current = true;
        return;
      }
    }
    act({ t: 'roll' });
  };
  const wuerfelnRef = useRef(wuerfeln);
  wuerfelnRef.current = wuerfeln;
  const wurfNachZug = useRef(false);
  useEffect(() => {
    if (!wurfNachZug.current || !isMine || phase.t !== 'roll' || pendingRoll !== null) return;
    wurfNachZug.current = false;
    setWurfUnterwegs(false);
    act({ t: 'roll' });
  }, [isMine, phase.t, pendingRoll]);
  // Ein Zug ohne Wurf danach (gegen Menschen): der Knopf ist wieder frei.
  useEffect(() => {
    if (!isMine) setWurfUnterwegs(false);
  }, [isMine]);

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
      // Auf dem Handy liegt das Menue ueber der Karte, statt neben ihr: dann
      // schrumpft die Leiste nicht mit (Spieltest 5 - sie wurde unlesbar klein).
      const menu = window.innerWidth > 700 ? document.querySelector('.menu') : null;
      const rechts = menu ? menu.getBoundingClientRect().left - 12 : window.innerWidth - 36;
      const skala = Math.min(1, Math.max(0.5, (rechts - links) / natur));
      el.style.setProperty('--unten-skala', skala.toFixed(3));
      // Wie hoch der Block unten reicht - Zeitleiste, Warnung und Rat stehen darueber.
      const main = el.closest('.main') as HTMLElement | null;
      if (main) {
        const hoch = main.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
        main.style.setProperty('--unten-oben', `${Math.round(hoch)}px`);
      }
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

  /*
   * Die Heerleiste sitzt unter der Kopfleiste. Deren Hoehe haengt von Breite,
   * Hausname und Schildern ab - auf dem Handy bricht sie in zwei oder drei
   * Zeilen. Gemessen statt geschaetzt, sonst deckt die Leiste Schilder zu.
   */
  const mainRef = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hud = hudRef.current;
    const main = mainRef.current;
    if (!hud || !main || typeof ResizeObserver === 'undefined') return;
    const setze = () => {
      const unten = hud.getBoundingClientRect().bottom - main.getBoundingClientRect().top;
      main.style.setProperty('--heerleiste-oben', `${Math.round(unten + 6)}px`);
    };
    const ro = new ResizeObserver(setze);
    ro.observe(hud);
    setze();
    return () => ro.disconnect();
  }, []);

  return (
    <div className="game">
      <main className="main" ref={mainRef}>
        {/*
          Die Karte bekommt den ganzen Platz. Was frueher in einer linken
          Spalte stand - Protokoll, Zuganzeige, Spielerliste - ist weg: allein
          weiss man ohnehin, dass man dran ist, und die Landschaft ist das,
          was man sehen will.

          Nur zwei Dinge legen sich als kleine Schilder darueber: der Raumcode
          zum Weitergeben und, sobald mehr als einer mitspielt, wer am Zug ist.
          Ohne das waere eine Partie zu mehreren nicht spielbar.
        */}
        <div className="hud" ref={hudRef}>
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
            <span className="hud-wetter-text">
              {TAGESZEIT_NAME[tageszeit]} · {WETTER_NAME[wetter]}
            </span>
            {WETTER_WIRKUNG[echtesWetter] && <span className="hud-wirkung">!</span>}
          </span>
          {/* Nur, wenn ein anderer dran ist - den eigenen Zug zeigt der Wuerfel (Spieltest 7). */}
          {state.order.length > 1 && (phase.t === 'finished' || !isMine) && (
            <span className="hud-turn">
              {phase.t === 'finished' ? 'Partie beendet' : `${state.players.find((p) => p.id === state.currentPlayer)?.name} ist dran`}
            </span>
          )}
          {/* Siegpunkte: eigene, bei mehreren auch die der anderen im Tooltip. */}
          <span
            className="hud-punkte"
            title={[
              state.akte ? 'Drei Akte: am Ende gewinnt die hoechste Wertung' : state.targetPoints > 0 ? `Ziel: ${state.targetPoints} Siegpunkte` : 'Endlosspiel - kein Siegpunktziel',
              ...state.players.filter((p) => p.id !== you).map((p) => `${p.name}: ${p.points}`),
            ].join(' · ')}
          >
            ★ {state.myPoints}
            {state.targetPoints > 0 && !state.akte ? ` / ${state.targetPoints}` : ''}
          </span>
          {/* Szenario: wie weit das Ziel ist (core/szenario.ts). */}
          {szenarioById(state.szenario) && you && (
            <span className="hud-koop" title={szenarioById(state.szenario)!.aufgabe}>
              {(() => {
                const sz = szenarioById(state.szenario)!;
                if (sz.ziel.t === 'unversehrt') {
                  const brand = state.chronik?.stats[you]?.abgebrannt ?? 0;
                  return brand === 0 ? `Ziel: unversehrt · ${sz.ziel.punkte} Siegpunkte` : 'Ziel verfehlt: es hat gebrannt';
                }
                const [ist, soll] = szenarioStand(state, you, sz.ziel);
                return `Ziel: ${sz.aufgabe.replace(/\.$/, '')} · ${Math.min(ist, soll)}/${soll}`;
              })()}
            </span>
          )}
          {/* Gemeinsam: wie weit die Summe vom Ziel ist (rules/reducer.ts, koopZiel). */}
          {state.koop && (
            <span className="hud-koop" title="Gemeinsam gegen die Wildnis: die Summe eurer Siegpunkte muss am Ende das Ziel erreichen.">
              Gemeinsam ★ {state.players.reduce((n, p) => n + (p.id === you ? state.myPoints : p.points), 0)} / {KOOP_ZIEL_JE * state.order.length}
            </span>
          )}
          {/* Die Rundengrenze: wie viele Runden bleiben (core/chronik.ts). */}
          {state.rundenLimit !== null && (
            <span
              className="hud-runden"
              title={`Nach Runde ${state.rundenLimit} ist Schluss - dann gewinnt die hoechste Wertung (Siegpunkte x 10 + Ruhm).`}
            >
              {state.tagesDatum ? <span className="hud-lang">Tagesexpedition · </span> : ''}<span className="hud-lang">Runde </span>{Math.min(roundOf(state.turn), state.rundenLimit)} / {state.rundenLimit}
            </span>
          )}
          {/* Der Akt und sein Boss (core/akte.ts): Name, Fortschritt, wie lange noch. */}
          {meinAkt && phase.t !== 'finished' && (
            <button
              className={['hud-akt', meinAkt.ergebnis !== 'offen' ? meinAkt.ergebnis : meinAkt.bis - state.turn < 3 ? 'knapp' : ''].filter(Boolean).join(' ')}
              title={`Akt ${meinAkt.akt}: ${bossById(meinAkt.boss)?.name ?? 'Boss'} - bis Runde ${meinAkt.bis}. Antippen fuer Einzelheiten.`}
              onClick={() => setBossOffen((v) => !v)}
            >
              <b>{aktZahl(meinAkt.akt)}</b>
              <span className="hud-lang">{bossById(meinAkt.boss)?.name ?? 'Boss'}</span>
              <span>{meinAkt.ergebnis === 'besiegt' ? '✓' : meinAkt.ergebnis === 'verfehlt' ? '✗' : `${Math.max(0, meinAkt.bis - state.turn + 1)}`}</span>
            </button>
          )}
          {state.order.length > 1 && !state.koop && (
            <span
              className="hud-rivalen"
              title="Sichtbare Siegpunkte der anderen. +? heisst: verdeckte Entwicklungskarten - darunter koennen Siegpunkte sein, die erst am Ende zaehlen."
            >
              {state.players
                .filter((p) => p.id !== you)
                .map((p) => (
                  <span key={p.id} className={p.besiegt ? 'besiegt' : undefined}>
                    <i className="dot" style={{ background: p.color }} />
                    <span className="hud-lang">{p.name} </span>★{p.points}
                    {p.devCount > 0 ? '+?' : ''}
                  </span>
                ))}
            </span>
          )}
          {weltArtVon(state.worldSeed).art !== 'kernland' && (
            <span className="hud-haus hud-welt" title={weltArtVon(state.worldSeed).text}>
              {weltArtVon(state.worldSeed).name}
            </span>
          )}
          {me?.haus && hausById(me.haus) && (
            <span
              className="hud-haus"
              title={`${hausById(me.haus)!.name}\n+ ${hausById(me.haus)!.staerke}\n- ${hausById(me.haus)!.schwaeche}`}
            >
              {hausById(me.haus)!.name}
            </span>
          )}
          {/* Der Ton bleibt oben, neben Welt und Haus (Wunsch aus dem Spieltest). */}
          <button
            className={stumm ? 'hud-ton aus' : 'hud-ton'}
            title={stumm ? 'Ton einschalten' : 'Ton ausschalten - Umgebung, Musik und Klaenge'}
            onClick={tonUmschalten}
          >
            <TonSymbol aus={stumm} />
          </button>
        </div>


        <SideMenu
          onVerlassen={disconnect}
          zaehler={me?.zaehler}
          krone={me?.krone ?? null}
          onKrone={(card) => act({ t: 'setKrone', card })}
          plus={me?.plus ?? []}
          heldXp={me?.heldXp ?? 0}
          eigenschaften={me?.eigenschaften ?? []}
          schmiede={me?.schmiede ?? 0}
          onSchmieden={(card, art) => act({ t: 'schmieden', card, art })}
          mitHeld={hatSystem(state, 'held')}
          mitReich={hatSystem(state, 'reich')}
          sippe={state.ereignisseAn ? (me?.sippe ?? {}) : undefined}
          sippeSeit={me?.sippeSeit}
          onKarten={() => setTafel('karten')}
          onRat={
            you && isMine && world
              ? () => {
                  const r = ratschlag(state, world, you);
                  setRat(r ?? { text: 'Gerade faellt dem Rat nichts ein.' });
                  if (r?.ort) zeigeFeld(r.ort.q, r.ort.r);
                }
              : undefined
          }
          turn={state.turn}
          cards={me?.cards ?? []}
          activeCards={me?.activeCards ?? []}
          kartenPlaetze={you ? reichskartenPlaetze(state, you) : 0}
          kannUmstellen={isMine && phase.t === 'main'}
          onLoadout={(cards) => act({ t: 'setLoadout', cards })}
          tactics={me?.tactics ?? []}
          equipment={me?.equipment ?? []}
          log={log}
          welt={welt}
          raumcode={useStore.getState().code}
          pin={useStore.getState().pin}
          punkte={punkte}
          ertrag={ertrag}
          showNumbers={pinNumbers}
          onToggleNumbers={() =>
            setPinNumbers((v) => {
              try {
                localStorage.setItem('infinitecarthage.zahlen', v ? 'aus' : 'an');
              } catch {
                // Privater Modus - dann nur fuer diese Sitzung.
              }
              return !v;
            })
          }
          autoWurfSekunden={AUTO_WURF_MS / 1000}
          zeitInfo={{
            tageszeit,
            wetter,
            bisTageszeit: rundenBisTageszeit(state.turn),
            bisWetter: rundenBisWetter(state.turn),
            wirkung: WETTER_WIRKUNG[echtesWetter],
          }}
          geruechte={geruechteListe}
          omens={state.omens}
          berichte={state.berichte}
          vorhaben={vorhabenSicht}
          onVorhaben={(id) => act({ t: 'chooseAmbition', id })}
          siegwege={
            you && siegwegeAn(state)
              ? SIEGWEGE.map((w) => ({
                  name: w.name,
                  text: siegwegText(w, state.targetPoints),
                  ist: fortschritt(state, you, w),
                  soll: schwelle(w, state.targetPoints),
                }))
              : []
          }
          auftraege={meineAuftraege}
          onAuftrag={(id, annehmen) => act({ t: 'answerQuest', id, accept: annehmen })}
          onZeigenFeld={zeigeFeld}
          nameVon={(id) => fraktionById(state.worldSeed, id).name}
          braende={meineBraende}
          loeschKarte={loeschKarte}
          loeschenMoeglich={loeschenMoeglich}
          onLoeschen={loeschen}
          wunderListe={wunderListe}
          onWunder={(q, r) => act({ t: 'buildWonder', q, r })}
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
            besitz={me?.cards ?? []}
            aktiv={me?.activeCards ?? []}
            plaetze={you ? reichskartenPlaetze(state, you) : 0}
            sippe={state.ereignisseAn ? (me?.sippe ?? {}) : undefined}
            sippeSeit={me?.sippeSeit}
            krone={me?.krone ?? null}
            onChoose={(card, replace) => act({ t: 'chooseCard', card, replace })}
          />
        )}

        <Announcements items={announcements} onDone={dropAnnouncement} />

        {phase.t !== 'finished' && me?.untergang != null && !me.besiegt && (
          <div className="hud-untergang" role="alert">
            {notbau
              ? `Dein letztes Gebaeude ist gefallen! Setze bis Zug ${me.untergang} eine Siedlung - auch ohne Strasse davor (${state.turn >= me.untergang ? 'jetzt' : `noch ${me.untergang - state.turn} Zuege`}).`
              : 'Dein Reich steht wieder.'}
          </div>
        )}

        {/* Die Erste-Schritte-Liste nur im Einstiegsszenario (Spieltest 7). */}
        {state.szenario === 'gruendung' && phase.t !== 'hauswahl' && phase.t !== 'setup' && phase.t !== 'finished' && you && (
          <ErsteSchritte state={state} you={you} />
        )}
        {sichtbareTipps.length > 0 && phase.t !== 'finished' && phase.t !== 'hauswahl' && state.draft === null && !bossOffen && !(meinPfad?.angebot && pfadOffen) && (
          <TippBox tipp={sichtbareTipps[0]!} mehr={0} onGelesen={tippWeg} />
        )}

        {kunde && phase.t !== 'ereignis' && state.draft === null && pendingRoll === null && <KundeTafel bericht={kunde} onZu={schliesseKunde} />}

        {phase.t === 'ereignis' && pendingRoll === null && (
          <EreignisTafel state={state} you={you} onWahl={(wahl) => act({ t: 'answerEvent', wahl })} />
        )}

        {phase.t === 'hauswahl' && (
          <HausWahl state={state} you={you} onChoose={(haus) => act({ t: 'chooseHouse', haus })} />
        )}

        {phase.t === 'finished' && (
          <Chronik
            state={state}
            you={you}
            code={useStore.getState().code}
            verlassen={disconnect}
            nochmal={(neu) => connect(neuerRaumCode(), me?.name ?? 'Spieler', true, !neu.tages, undefined, neu)}
          />
        )}

        <Board
          world={world}
          state={state}
          targets={targets}
          showAllNumbers={pinNumbers || (phase.t === 'setup' && grobZeiger)}
          flashHexes={flashHexes}
          pfeile={pfeile}
          treffer={treffer}
          flights={flights}
          onPick={onPick}
          sicht={sicht}
          du={you}
          onHex={you ? onHex : undefined}
          onFeuer={loeschenMoeglich && loeschKarte ? loeschen : undefined}
          zielWahl={zielWahl}
          auswahl={kandidaten.length > 0 ? auswahl : []}
          befehlsTafel={befehlsTafel}
          fokus={fokus}
          spuren={spuren}
          tageszeit={tageszeit}
          wetter={wetter}
          geisterBau={isMine ? geisterBau : null}
          geisterKante={isMine ? geisterKante : 'strasse'}
          kronen={kronen}
          onKrone={(q, r) => setAusbauOrt({ art: 'feld', key: hexKey(q, r) })}
          pfadMarken={[
            ...(meinPfad?.aktiv ? [{ q: meinPfad.aktiv.q, r: meinPfad.aktiv.r, titel: `Ziel deines Helden: ${meinPfad.aktiv.name}`, art: 'ziel' as const }] : []),
            ...(meinPfad?.angebot ?? []).map((z) => ({ q: z.q, r: z.r, titel: `Zur Wahl: ${z.name} (Gefahr ${z.gefahr})`, art: 'angebot' as const })),
          ]}
          raubMarke={
            raubWarnung
              ? { q: raubWarnung.u.ziel!.q, r: raubWarnung.u.ziel!.r, titel: `Raubzug von ${fraktionIn(state, raubWarnung.u.fraktion!).name} - antippen fuer Gegenmittel` }
              : null
          }
          onRaubMarke={() => raubWarnung && setAusbauOrt({ art: 'raub', key: hexKey(raubWarnung.u.ziel!.q, raubWarnung.u.ziel!.r) })}
          onGebaeude={
            you && mode === null && kandidaten.length === 0 && phase.t !== 'setup'
              ? (vk) => setAusbauOrt({ art: 'ecke', key: vk })
              : undefined
          }
          onHauptstadtKlick={
            you && mode === null && kandidaten.length === 0 ? (hk) => setAusbauOrt({ art: 'feld', key: hk }) : undefined
          }
          onLeer={() => setAusbauOrt(null)}
          ausbau={ausbau}
        >
          {/*
            Unten links Hand und Aktionsleiste als ein Block. Die Leiste steht
            immer da, ausgegraut, solange nichts geht (ui/Aktionsleiste.tsx).
          */}
          <div className="unten" ref={untenRef}>
            {hand && <HandPanel hand={hand} grenze={you ? limitFor(state, you) : undefined} verderb={!!state.ereignisseAn} />}
            {/*
              Der Handel steht als EIGENES Feld neben dem Rohstoffblatt, mit
              eigenem Rahmen und eigenem Hintergrund - er gehoert sichtbar
              nicht zu den Karten.

              Er sass zwischendurch als sechster Platz im Blatt. Dort stimmte
              zwar die Kante von selbst, aber er las sich als weitere
              Ressource. Dass es daneben frueher nicht sauber ausgerichtet
              war, lag am 10-Punkte-Versatz des Blattes - der ist seit
              f90ae84 weg, deshalb geht es jetzt.
            */}
            {hand && (
              <button
                className={['handel-karte', tafel === 'handel' ? 'gewaehlt' : ''].filter(Boolean).join(' ')}
                title="Bankhandel"
                aria-pressed={tafel === 'handel'}
                onClick={() => setTafel((alt) => (alt === 'handel' ? null : 'handel'))}
              >
                <SymHandel />
              </button>
            )}
            {hand && (
              <Aktionsleiste
                state={state}
                me={me}
                hand={hand}
                isMine={isMine}
                mode={mode}
                setMode={(m) => {
                  // Umgekehrt: wer bauen will, gibt keinen Befehl mehr.
                  if (m !== null) setZielWahl(false);
                  setMode(m);
                }}
                act={act}
                verhaeltnis={(r) => (you ? tradeRatio(state, world, you, r) : 4)}
                gruende={(r) => (you ? tradeRatioErklaert(state, world, you, r).gruende : [])}
                onTafel={setTafelOffen}
                tafel={tafel}
                setTafel={setTafel}
                hauptstadtBereit={bereiteFelder.length > 0}
                reichOffen={you !== null && hatKoenigssitz(state, you)}
                onHauptstadt={() => {
                  const k = bereiteFelder[0];
                  if (!k) return;
                  zeigeFeld(k.q, k.r);
                  setAusbauOrt({ art: 'feld', key: hexKey(k.q, k.r) });
                }}
                onAngebot={state.order.length > 1 ? () => setAngebotOffen(true) : undefined}
                dorfPlatz={dorfPlatz}
              />
            )}
            {/*
              Der Wuerfelknopf rechts neben der Aktionsleiste. Er erledigt Zug
              beenden und Wuerfeln in einem - gegen Menschen nur Zug beenden. Die Leiste am Fuss schrumpft
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
                    ? `Wuerfeln - geschieht nach ${AUTO_WURF_MS / 1000} Sekunden von selbst (abschaltbar im Menue unter Chronik)`
                    : 'Wuerfeln'
                }
                onClick={wuerfeln}
              >
                <span key={`s${wurfStoss}`} className="wuerfel-inhalt">
                  <span className="wuerfel-symbol">
                    <DieIcon />
                  </span>
                  {/* Nach dem Wurf beendet der Knopf den Zug - das soll er auch sagen (Spieltest 8). */}
                  <span className="wuerfel-text">{nurZugEnde ? 'Zug beenden' : phase.t === 'main' ? 'Naechster Zug' : 'Wuerfeln'}</span>
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
            {/* Gesammeltes - der Knopf steht rechts neben dem Wuerfel (ui/Inventar.tsx). */}
            {hand && Object.values(me?.inventar ?? {}).some((n) => n > 0) && <Inventar inventar={me?.inventar ?? {}} />}
          </div>

          {/*
            Handel zwischen Spielern - nur zu mehreren. Steht ausserhalb des
            Zugs: ein Angebot geht alle an, nicht nur den Spieler am Zug.
          */}
          {hand &&
            you &&
            state.order.length > 1 &&
            (state.trade !== null || (angebotOffen && isMine && phase.t === 'main')) && (
              <div className="handel-schwebe">
                <TradePanel state={state} you={you} hand={hand} act={act} onZu={() => setAngebotOffen(false)} />
              </div>
            )}

          {/* Die Zeitleiste ist weg (Spieltest 7) - ein Raubzug zeigt sich als Marke auf der Karte. */}

          {lagerTafel &&
            isNestActive(state, ...(lagerTafel.split(':').map(Number) as [number, number])) &&
            (() => {
              const [lq, lr] = lagerTafel.split(':').map(Number) as [number, number];
              const fid = nestFraktionOf(state, lq, lr);
              const f = fraktionIn(state, fid);
              const abk = you ? abkommenVon(state, you, fid) : undefined;
              const tribut = you ? tributKarten(state, you, fid) : 1;
              const karten = hand ? RESOURCES.reduce((n, r) => n + hand[r], 0) : 0;
              const darf = isMine && phase.t === 'main';
              return (
                <div className="rat-tafel lager-tafel" role="dialog" aria-label={`Lager: ${f.name}`}>
                  <b>Lager · {f.name}</b>
                  {f.anfuehrer && (
                    <p>
                      {f.anfuehrer}
                      {f.wesen ? ` - ${WESEN[f.wesen].name}: ${WESEN[f.wesen].text}` : ''}
                    </p>
                  )}
                  {f.wesen && (
                    <p className="lager-tafel-klein">
                      Sie {WESEN[f.wesen].ziel}.
                      {you && state.ereignisseAn ? ` Dir gegenueber: ${stimmungText(stimmungVon(state, fid, you))}.` : ''}
                      {erstarkt(state, fid) ? ' Voller Beute - der naechste Raubzug kommt verstaerkt.' : ''}
                    </p>
                  )}
                  <p className="lager-tafel-klein">
                    Besatzung {garrisonOf(state, lq, lr)} ·{' '}
                    {abk ? (abk.art === 'frieden' ? `Frieden bis Runde ${abk.bis}` : 'du zahlst Tribut') : 'Krieg'}
                    {' · '}Zerstoert: +2 Ruhm und eine Kartenwahl.
                  </p>
                  <span className="rat-knoepfe">
                    {meineEinheiten.length > 0 && (
                      <button
                        disabled={!befehleMoeglich}
                        title="Alle Einheiten ohne Auftrag (sonst alle) ziehen zum Lager"
                        onClick={() => {
                          const wer = (untaetige.length > 0 ? untaetige : meineEinheiten).map((u) => u.id);
                          act({ t: 'orderUnits', units: wer, q: lq, r: lr });
                          setLagerTafel(null);
                        }}
                      >
                        Heer schicken
                      </button>
                    )}
                    {!abk && (
                      <button
                        disabled={!darf || karten < tribut}
                        title={`Tribut: ${tribut} ${tribut === 1 ? 'Karte' : 'Karten'} sofort und je grosser Runde`}
                        onClick={() => act({ t: 'diplomacy', fraktion: fid, art: 'tribut' })}
                      >
                        Tribut ({tribut})
                      </button>
                    )}
                    {!abk && nimmtFrieden(state.worldSeed, fid, state.fraktionen) && (
                      <button
                        disabled={!darf || !hand || !canAfford(hand, FRIEDEN_PREIS)}
                        title={`Frieden fuer 20 Runden: ${bundleText(FRIEDEN_PREIS)}`}
                        onClick={() => act({ t: 'diplomacy', fraktion: fid, art: 'frieden' })}
                      >
                        Frieden
                      </button>
                    )}
                    <button className="klein" onClick={() => setLagerTafel(null)}>
                      Schliessen
                    </button>
                  </span>
                </div>
              );
            })()}

          {bossOffen && you && state.akte && state.draft === null && phase.t !== 'finished' && (
            <BossTafel
              state={state}
              you={you}
              darfZahlen={isMine && phase.t === 'main'}
              onZahlen={(r) => act({ t: 'bossZahlen', resource: r })}
              onZeigen={(q, r) => zeigeFeld(q, r)}
              onZu={() => setBossOffen(false)}
            />
          )}

          {rat && (
            <div className="rat-tafel" role="status">
              <b>Der Rat meint:</b> {rat.text}
              <span className="rat-knoepfe">
                {rat.ort && <button onClick={() => zeigeFeld(rat.ort!.q, rat.ort!.r)}>Zeigen</button>}
                <button className="klein" onClick={() => setRat(null)}>
                  Danke
                </button>
              </span>
            </div>
          )}

          {raubWarnung && !zielWahl && tafel === null && ausbauOrt?.art !== 'raub' && (
            <div className="raub-zeile" role="alert">
              <button
                title="Zum bedrohten Feld - am roten Banner stehen die Gegenmittel"
                onClick={() => {
                  zeigeFeld(raubWarnung.u.ziel!.q, raubWarnung.u.ziel!.r);
                  setAusbauOrt({ art: 'raub', key: hexKey(raubWarnung.u.ziel!.q, raubWarnung.u.ziel!.r) });
                }}
              >
                <b>Raubzug!</b>
                {fraktionIn(state, raubWarnung.u.fraktion!).name} - noch {raubWarnung.weg} {raubWarnung.weg === 1 ? 'Feld' : 'Felder'}
              </button>
              <button
                className="raub-zu"
                title="Fuer fuenf Runden ausblenden"
                onClick={() => setWeggeklickt((w) => ({ ...w, [raubWarnung.schluessel]: state.turn + 5 }))}
              >
                x
              </button>
            </div>
          )}

          {zielWahl && auswahl.length > 0 && (
            <div className="befehl-hinweis">
              Ziel fuer {auswahl.length > 1 ? `${auswahl.length} Einheiten` : heerNamen.get(auswahl[0]!) ?? 'die Einheit'}{' '}
              waehlen · Esc bricht ab
            </div>
          )}

          {/* Heldenpfad: das Angebot als Tafel, zugeklappt als Knopf links oben. */}
          {meinPfad?.angebot && pfadOffen && !bossOffen && state.draft === null && phase.t !== 'finished' && (
            <PfadTafel
              ziele={meinPfad.angebot}
              darf={isMine && (phase.t === 'main' || phase.t === 'roll')}
              onWahl={(i) => {
                act({ t: 'pfadWaehlen', index: i });
                setPfadOffen(false);
              }}
              onZeigen={(q, r) => zeigeFeld(q, r)}
              onZu={() => setPfadOffen(false)}
            />
          )}
          {meinPfad?.angebot && !pfadOffen && (
            <button className="pfad-chip" onClick={() => setPfadOffen(true)} title="Dein Held wartet auf ein Ziel">
              Heldenpfad ({meinPfad.angebot.length})
            </button>
          )}
          {me?.eigenschaftAngebot && me.eigenschaftAngebot.length > 0 && state.draft === null && (
            <EigenschaftWahl angebot={me.eigenschaftAngebot} xp={me.heldXp ?? 0} onWahl={(id) => act({ t: 'eigenschaftWaehlen', id })} />
          )}

          {/* Heerleiste: je Schar oder Feld ein Kaertchen, dazu "untaetig" (ui/Heerleiste.tsx). */}
          <Heerleiste
            kompakt
            gruppen={heer}
            heldName={heldName}
            status={(g) => gruppenStatus(g, kampfOrte)}
            aktiv={
              heer.find(
                (g) => g.einheiten.length === kandidaten.length && g.einheiten.every((u) => kandidaten.includes(u.id)),
              )?.key ?? null
            }
            onWahl={(g) => {
              // Ein Klick auf die Gruppe, ein Klick auf die Karte - fertig ist der Befehl.
              waehleGruppe(g.einheiten.map((u) => u.id), true);
              zeigeFeld(g.q, g.r);
            }}
            untaetig={untaetige.length}
            onUntaetig={() => {
              const u = untaetige[naechsteUntaetige.current % untaetige.length];
              naechsteUntaetige.current += 1;
              if (!u) return;
              const g = heer.find((x) => x.einheiten.some((y) => y.id === u.id));
              waehleGruppe((g ? g.einheiten : [u]).map((x) => x.id), true);
              zeigeFeld(u.q, u.r);
            }}
          />
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
