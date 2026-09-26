/**
 * Das Seitenmenue am rechten Rand.
 *
 * Vorbild ist die Leiste aus RuneScape: ein schmales Feld mit Reiterreihe,
 * das immer da ist und in dem alles Nicht-Kartenbezogene wohnt. Anders als
 * dort laesst es sich einklappen - die Karte hat kein festes Format, und wer
 * weit hinausbaut, will den Platz.
 *
 * Oben steht die Zeit, weil sie zum Spielstand gehoert und nicht zu den
 * Einstellungen. Darunter vier Berater als Reiter: Kanzler, Marschall,
 * Seherin, Chronist (mit Protokoll und Einstellungen). Jeder sagt oben in
 * einem Satz, was er sieht (OVERHAUL.md, Abschnitt 2). Erklaerungen
 * stehen nicht mehr als Absaetze da, sondern hinter einem "?" am Abschnitt -
 * wer spielt, liest sie einmal, danach nehmen sie nur Platz.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { JAHRESZEIT_WIRKUNG, SEASON_NAME, bigRoundOf, ROUNDS_PER_BIG_ROUND, roundOf, seasonOf, yearOf } from '../../core/season';
import { cardById } from '../../core/cards/catalog';
import { modifiersOf } from '../../core/cards/effects';
import { RARITY_ORDER, dauerwirkungen } from '../../core/cards/types';
import type { Resource, Terrain } from '../../core/types';
import type { Abkommen, Brand, UnitState, WandererAuftrag } from '../../core/state';
import { hexDistance } from '../../core/coords';
// maxLeben kennt Art, Zweig des Ernannten und Rang (core/combat.ts).
import { maxLeben } from '../../core/combat';
import { TAGESZEIT_NAME, WETTER_NAME } from '../../core/zeit';
import type { Tageszeit, Wetter } from '../../core/zeit';
import { FRIEDEN_PREIS } from '../../core/rules/diplomatie';
import type { Verhandlung } from '../../core/rules/diplomatie';
import { getVolume, initAudio, setVolume } from '../audio';
import { LogPanel } from './LogPanel';
import { KartenBild } from './KartenBild';
import { OmenListe } from './OmenListe';
import type { Bericht } from '../../core/kunde';
import type { WeltEintrag } from '../net/store';
import { TRACKS, getMusicMode, getMusicVolume, setMusicMode, setMusicVolume } from '../music';
import type { MusicMode } from '../music';
import { getUmgebungVolume, setUmgebungVolume } from '../ambiente';
import { WESEN } from '../../core/factions';
import type { Geruecht } from '../geruechte';
import type { FraktionsWesen } from '../../core/factions';
import { BRAND_WAS, auftragText, bundleText, resourceName } from '../log';
import { einheitNamen, gruppenName, heerGruppen, untaetig } from '../heer';
import { tippsZuruecksetzen } from '../tipps';

/*
 * Die Reiter sind Berater (OVERHAUL.md, Abschnitt 2): der Kanzler fuer Wirtschaft,
 * Vorhaben und Karten, der Marschall fuer Lage, Heer und Fraktionen, die
 * Seherin fuer Geruechte, Wunder und Auftraege, der Chronist fuer Punkte,
 * Siegwege, Protokoll und Einstellungen. Jeder sagt oben in einem Satz, was
 * er sieht, und meldet sich mit einem Punkt, wenn etwas drangt.
 */
type Reiter = 'kanzler' | 'marschall' | 'seherin' | 'chronist';

/** Eine bekannte Fraktion, fertig fuer die Anzeige. */
export type FraktionsZeile = {
  id: string;
  name: string;
  /** 'nacht' ist die Fraktion der Schleime - ohne Lager und ohne Diplomatie. */
  art: 'raeuber' | 'goblin' | 'nacht';
  /** CSS-Farbe. */
  farbe: string;
  /** Aktive Lager auf der aufgedeckten Karte. */
  lager: number;
  /** Ihre Leute auf der Karte. */
  unterwegs: number;
  /** Abstand des naechsten Lagers zu den eigenen Siedlungen. */
  naechster: number | null;
  /** Das eigene Abkommen mit ihr, falls eines gilt. */
  abkommen: Abkommen | null;
  /** Schliesst sie Frieden? Nur Raeuberbanden (rules/diplomatie.ts). */
  nimmtFrieden: boolean;
  /** Anfuehrer und Wesen (core/factions.ts). */
  anfuehrer?: string;
  wesen?: FraktionsWesen;
  /** Was ein Tribut an sie kostet. */
  tribut: number;
  /** Wie sie zu dir steht (core/fraktionsleben.ts). */
  stimmung?: string;
  /** Genug Beute beisammen: der naechste Raubzug kommt verstaerkt. */
  erstarkt?: boolean;
};

/** Siegpunkte aufgeschluesselt (Game): Summe, Ziel (0 = endlos) und woher sie kommen. */
export type PunkteSicht = {
  gesamt: number;
  ziel: number;
  /** Rundengrenze der Partie, null ohne (core/chronik.ts). */
  rundenLimit: number | null;
  /** Siegpunkte x 10 + Ruhm - zaehlt, wenn die Rundengrenze erreicht ist. */
  wertung: number;
  zeilen: { text: string; wert: number | null }[];
};

/** Was neben der Punktzahl steht: das Ziel, die Rundengrenze - oder endlos. */
function zielText(p: PunkteSicht): string {
  const teile: string[] = [];
  if (p.ziel > 0) teile.push(`von ${p.ziel}`);
  if (p.rundenLimit !== null) teile.push(`bis Runde ${p.rundenLimit}`);
  return teile.length > 0 ? teile.join(' · ') : 'endlos';
}

/* Bildnisse der Berater - kleine Pixelgesichter. PLATZHALTER (ASSETS.md). */
const SYMBOL: Record<Reiter, ReactNode> = {
  // Kanzler: Kappe und Muenze.
  kanzler: (
    <svg viewBox="0 0 18 18" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="5" y="2" width="8" height="3" fill="currentColor" />
      <rect x="6" y="5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="12" width="10" height="4" fill="currentColor" opacity="0.6" />
      <rect x="12" y="11" width="4" height="4" fill="#ffd76a" />
    </svg>
  ),
  // Marschall: Helm mit Sehschlitz.
  marschall: (
    <svg viewBox="0 0 18 18" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M4 15 V6 Q9 0 14 6 V15 Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="6" y="7" width="6" height="2" fill="currentColor" />
      <rect x="8" y="1" width="2" height="3" fill="#e0473a" />
    </svg>
  ),
  // Seherin: Kapuze und Auge.
  seherin: (
    <svg viewBox="0 0 18 18" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M3 16 L5 5 Q9 1 13 5 L15 16 Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <ellipse cx="9" cy="9" rx="3" ry="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8" y="8" width="2" height="2" fill="#9ad0ff" />
    </svg>
  ),
  // Chronist: Buch und Feder.
  chronist: (
    <svg viewBox="0 0 18 18" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="3" y="5" width="10" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="5" y="8" width="6" height="1" fill="currentColor" />
      <rect x="5" y="11" width="6" height="1" fill="currentColor" />
      <path d="M12 2 L16 1 L13 7 Z" fill="currentColor" opacity="0.7" />
    </svg>
  ),
};

const REITER: ReadonlyArray<{ id: Reiter; name: string; amt: string }> = [
  { id: 'kanzler', name: 'Kanzler', amt: 'Wirtschaft, Vorhaben, Karten' },
  { id: 'marschall', name: 'Marschall', amt: 'Lage, Heer, Fraktionen' },
  { id: 'seherin', name: 'Seherin', amt: 'Geruechte, Wunder, Auftraege' },
  { id: 'chronist', name: 'Chronist', amt: 'Punkte, Protokoll, Einstellungen' },
];

/** Gelaendenamen fuers Auge - der Kern kennt nur die englischen Kennungen. */
const GELAENDE: Partial<Record<Terrain, string>> = {
  forest: 'Waelder',
  pasture: 'Weiden',
  field: 'Felder',
  hill: 'Huegel',
  mountain: 'Berge',
};

/**
 * Was die Karten zusammen bewirken, in Worten. Die einzelnen Karten stehen
 * darueber - hier interessiert die Summe, denn zwei Karten auf dasselbe
 * Gelaende addieren sich.
 */
function wirkungen(cardIds: readonly string[]): string[] {
  const m = modifiersOf(cardIds);
  const zeilen: string[] = [];
  for (const [terrain, wert] of Object.entries(m.terrainBonus)) {
    if (!wert) continue;
    zeilen.push(`${GELAENDE[terrain as Terrain] ?? terrain} ${wert > 0 ? '+' : ''}${wert}`);
  }
  if (m.tradeDiscount > 0) zeilen.push(`Bankhandel -${m.tradeDiscount}`);
  if (m.handLimitBonus > 0) zeilen.push(`Hand +${m.handLimitBonus}`);
  return zeilen;
}

/** Gleiche Karten als Stapel, die seltensten zuerst, dann nach Namen. */
function kartenStapel(cardIds: readonly string[]) {
  const anzahl = new Map<string, number>();
  for (const id of cardIds) anzahl.set(id, (anzahl.get(id) ?? 0) + 1);
  return [...anzahl]
    .map(([id, n]) => ({ karte: cardById(id), anzahl: n }))
    .filter((s): s is { karte: NonNullable<ReturnType<typeof cardById>>; anzahl: number } => s.karte !== undefined)
    .sort(
      (a, b) =>
        RARITY_ORDER.indexOf(b.karte.rarity) - RARITY_ORDER.indexOf(a.karte.rarity) ||
        a.karte.name.localeCompare(b.karte.name),
    );
}

/** Wer in einer Gruppe steht, kurz: "Held, 2 Ritter, 1 Bogenschuetze". */
function zusammensetzung(einheiten: readonly UnitState[]): string {
  const ritter = einheiten.filter((u) => u.kind === 'ritter').length;
  const bogen = einheiten.filter((u) => u.kind === 'bogen').length;
  return [
    einheiten.some((u) => u.kind === 'held') ? 'Held' : '',
    ritter > 0 ? `${ritter} Ritter` : '',
    bogen > 0 ? `${bogen} ${bogen === 1 ? 'Bogenschuetze' : 'Bogenschuetzen'}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/** Was eine Einheit gerade tut. */
function statusVon(u: UnitState): { art: 'erkundet' | 'folgt' | 'zieht' | 'steht'; text: string } {
  if (u.auftrag === 'erkunden') return { art: 'erkundet', text: 'erkundet' };
  if (u.folgt !== null) return { art: 'folgt', text: 'folgt dem Helden' };
  if (u.ziel) {
    const weit = hexDistance(u, u.ziel);
    return { art: 'zieht', text: `zieht, noch ${weit} ${weit === 1 ? 'Feld' : 'Felder'}` };
  }
  return { art: 'steht', text: 'steht' };
}

/** Protokoll-Filter: grob nach Worten, das Protokoll sind fertige Saetze (log.ts). */
type LogFilter = 'alles' | 'kaempfe' | 'ertrag' | 'welt';
const KAEMPFE = /kampf|bogenschuetzen|gefallen|lager|raubzug|pluender|hinterhalt|horde|fehde|ritter/i;
const ERTRAG = /ertrag|wuerfelt|beute|monopol|handel|fund|karte/i;

/** Ein Abschnittskopf. hilfe: die Erklaerung hinter dem "?", ein Klick klappt sie auf. */
function Kopf({ titel, hilfe, rechts, gefahr }: { titel: string; hilfe?: string; rechts?: ReactNode; gefahr?: boolean }) {
  const [auf, setAuf] = useState(false);
  return (
    <>
      <h3 className={gefahr ? 'menu-kopf gefahr' : 'menu-kopf'}>
        <span>{titel}</span>
        <span className="menu-kopf-rechts">
          {rechts}
          {hilfe && (
            <button className={auf ? 'menu-hilfe aktiv' : 'menu-hilfe'} title={hilfe} aria-expanded={auf} onClick={() => setAuf((a) => !a)}>
              ?
            </button>
          )}
        </span>
      </h3>
      {auf && hilfe && <p className="menu-hilfe-text">{hilfe}</p>}
    </>
  );
}

/** Ein Schalter mit Beschriftung - an oder aus. */
function Schalter({ an, onClick, children }: { an: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="menu-schalter" aria-pressed={an} onClick={onClick}>
      <span>{children}</span>
      <span className={an ? 'menu-kippe an' : 'menu-kippe'} />
    </button>
  );
}

/** Ein Lautstaerkeregler 0-100. */
function Regler({ name, wert, setzen }: { name: string; wert: number; setzen: (v: number) => void }) {
  return (
    <label className="menu-regler">
      <span>{name}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(wert * 100)}
        onChange={(e) => {
          initAudio();
          setzen(Number(e.target.value) / 100);
        }}
      />
      <b>{Math.round(wert * 100)}</b>
    </label>
  );
}

export function SideMenu({
  turn,
  cards,
  activeCards,
  kartenPlaetze,
  kannUmstellen,
  onLoadout,
  tactics,
  equipment,
  log,
  welt,
  einheiten,
  heldName,
  raumcode,
  pin,
  punkte,
  ertrag,
  lage,
  fraktionen,
  befehl,
  zielAuswahl,
  beute,
  befehleMoeglich,
  beuteMoeglich,
  onBefehl,
  onGruppeZiel,
  onHalt,
  onZeigen,
  onBeute,
  showNumbers,
  onToggleNumbers,
  autoWurf,
  onToggleAutoWurf,
  autoWurfSekunden,
  zeitInfo,
  held,
  heldZurueck,
  onFolgen,
  diplomatieMoeglich,
  friedenBezahlbar,
  geruechte,
  omens,
  berichte,
  vorhaben,
  onVorhaben,
  siegwege,
  handKarten,
  tributPreis,
  onDiplomatie,
  auftraege,
  onAuftrag,
  onZeigenFeld,
  wunderListe,
  onWunder,
  nameVon,
  braende,
  loeschKarte,
  loeschenMoeglich,
  onLoeschen,
  onErkunden,
  stumm,
  onStumm,
  onZeigenAuftrag,
  kannLiefern,
  onLiefern,
}: {
  turn: number;
  /** Die eigenen genommenen Karten, in der Reihenfolge der Wahl. */
  cards: readonly string[];
  /** Reichskarten, deren Dauerwirkung in die begrenzten Plaetze gelegt ist. */
  activeCards: readonly string[];
  /** Wie viele Dauerkarten gleichzeitig wirken duerfen (cards/loadout.ts). */
  kartenPlaetze: number;
  /** Umstellen geht nur in der eigenen Bauphase. */
  kannUmstellen: boolean;
  onLoadout: (cards: string[]) => void;
  /** Verbrauchbare Taktikkarten auf der eigenen Hand. */
  tactics: readonly string[];
  /** Getrennte Ausruestungssammlung fuer den Abenteuerzweig. */
  equipment: readonly string[];
  /** Das Protokoll: wer was getan hat. */
  log: string[];
  /** Was der Welt geschehen ist - Pluenderungen, Zeitenwechsel. */
  welt: readonly WeltEintrag[];
  /** Die eigenen Einheiten: Held, Ritter, Bogenschuetzen. */
  einheiten: readonly UnitState[];
  /** Wie der eigene Held heisst (core/lore.ts) - sonst steht da nur "Held". */
  heldName?: string;
  /** Raumcode und Platz-PIN - fuer den Wiedereinstieg auf einem anderen Geraet. */
  raumcode: string;
  pin: string | null;
  /** Siegpunkte aufgeschluesselt. */
  punkte: PunkteSicht;
  /** Rohstoffkarten je Wuerfelzahl aus eigenen Siedlungen. */
  ertrag: Readonly<Record<number, number>>;
  /** Raubzuege unterwegs, wie nah der naechste den eigenen Siedlungen ist, Kaempfe in Sicht. */
  lage: { unterwegs: number; naechster: number | null; kaempfe: number };
  /** Bekannte Fraktionen, die naechsten zuerst. */
  fraktionen: readonly FraktionsZeile[];
  /** Die eine Einheit, die gerade auf ihr Ziel wartet. */
  befehl: number | null;
  /** Alle Einheiten, die gerade auf ihr Ziel warten. */
  zielAuswahl: readonly number[];
  /** Uneingeloeste Beute. */
  beute: number;
  /** Duerfen gerade Befehle gegeben werden (eigener Zug)? */
  befehleMoeglich: boolean;
  /** Darf gerade Beute eingeloest werden (eigene Bauphase)? */
  beuteMoeglich: boolean;
  onBefehl: (id: number) => void;
  /** Eine ganze Gruppe auf ihr Ziel warten lassen. */
  onGruppeZiel: (ids: number[]) => void;
  onHalt: (id: number) => void;
  onZeigen: (id: number) => void;
  onBeute: () => void;
  showNumbers: boolean;
  onToggleNumbers: () => void;
  /** Wuerfelt der Knopf nach einigen Sekunden von selbst? */
  autoWurf: boolean;
  onToggleAutoWurf: () => void;
  autoWurfSekunden: number;
  /** Tageszeit und Wetter mit ihrer Dauer und dem, was das Wetter bewirkt. */
  zeitInfo: { tageszeit: Tageszeit; wetter: Wetter; bisTageszeit: number; bisWetter: number; wirkung: string };
  /** Der eigene Held, wenn er auf der Karte steht. */
  held: UnitState | null;
  /** Wann der gefallene Held zurueckkehrt. */
  heldZurueck: number | null;
  onFolgen: (id: number, folgen: boolean) => void;
  /** Darf gerade verhandelt werden (eigene Bauphase)? */
  diplomatieMoeglich: boolean;
  friedenBezahlbar: boolean;
  /** Was man sich erzaehlt (client/geruechte.ts). */
  geruechte: Geruecht[];
  /** Die Kunde aus dem Land (core/kunde.ts). */
  berichte: readonly Bericht[];
  /** Die Omen der Partie, schon mit Chronikstufe (core/omen.ts). */
  omens: readonly string[];
  /** Vorhaben: Auswahl oder das laufende (core/vorhaben.ts). */
  vorhaben: {
    angebot: { id: string; name: string; text: string; lohn: string }[];
    aktiv: { name: string; text: string; lohn: string; ist: number; soll: number; rest: number } | null;
  };
  onVorhaben: (id: string | null) => void;
  /** Die anderen Wege zum Sieg und wie weit man ist (core/siegwege.ts). Leer, wenn sie nicht gelten. */
  siegwege: { name: string; text: string; ist: number; soll: number }[];
  /** Wie viele Karten man haelt - reicht es fuer den Tribut? */
  handKarten: number;
  /** Was ein Tribut gerade kostet, in Karten (rules/diplomatie.ts, tributKarten). */
  tributPreis: number;
  onDiplomatie: (fraktion: string, art: Verhandlung) => void;
  /** Die eigenen Auftraege - Angebote und angenommene. */
  auftraege: readonly WandererAuftrag[];
  onAuftrag: (id: number, annehmen: boolean) => void;
  onZeigenFeld: (q: number, r: number) => void;
  /** Bekannte Wunderstaetten (core/wunder.ts) - frei oder errichtet. */
  wunderListe: { key: string; q: number; r: number; name: string; text: string; punkte: number; besitzer: string | null; grund: string | null; bezahlbar: boolean }[];
  /** Ein Wunder errichten. */
  onWunder: (q: number, r: number) => void;
  /** Name einer Fraktion. */
  nameVon: (fraktion: string) => string;
  /** Die eigenen Feuer. */
  braende: readonly Brand[];
  /** Welche Karte das Loeschen kostet - der groesste Stapel -, null ohne Karten. */
  loeschKarte: Resource | null;
  loeschenMoeglich: boolean;
  onLoeschen: (key: string) => void;
  /** Ritter oder Held von selbst erkunden lassen - oder nicht mehr. */
  onErkunden: (id: number, an: boolean) => void;
  /** Ist aller Ton aus? */
  stumm: boolean;
  /** Ton an oder aus - schaltet um. */
  onStumm: () => void;
  /** Auf der Karte zeigen, wohin ein Auftrag fuehrt. */
  onZeigenAuftrag: (a: WandererAuftrag) => void;
  kannLiefern: (a: WandererAuftrag) => boolean;
  onLiefern: (id: number) => void;
}) {
  // Auf schmalen Bildschirmen zu Beginn eingeklappt - auf dem Handy deckte das
  // Menue sonst ein gutes Drittel der Karte ab, bevor man sie gesehen hat.
  const [offen, setOffen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 700px)').matches,
  );
  const [reiter, setReiter] = useState<Reiter>('kanzler');
  /** Welche Einheit in der Liste aufgeklappt ist - hoechstens eine. */
  const [offenerRitter, setOffenerRitter] = useState<number | null>(null);
  /** Welche Gruppen aufgeklappt sind. */
  const [offeneGruppen, setOffeneGruppen] = useState<ReadonlySet<string>>(() => new Set());
  /** Welche Karte ihren Text zeigt. */
  const [karteOffen, setKarteOffen] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<LogFilter>('alles');
  const [ton, setTon] = useState(getVolume);
  const [musik, setMusik] = useState<MusicMode>(getMusicMode);
  const [musikPegel, setMusikPegel] = useState(getMusicVolume);
  const [umgebung, setUmgebung] = useState(getUmgebungVolume);

  const saison = seasonOf(turn);
  // Raubzuege brechen zum Beginn jeder grossen Runde auf (rules/army.ts, sendRaiders).
  const bisPluenderung = ROUNDS_PER_BIG_ROUND - ((Math.max(1, turn) - 1) % ROUNDS_PER_BIG_ROUND);

  /*
   * Was jeder Berater sagt - der dringendste Satz zuerst. wichtig: ein Punkt
   * am Reiter, damit man es auch sieht, wenn der Berater nicht offen ist.
   */
  const berater: Record<Reiter, { satz: string; wichtig: boolean }> = (() => {
    const besteZahl = Object.entries(ertrag).sort((a, b) => b[1] - a[1])[0];
    const kanzler =
      braende.length > 0
        ? { satz: 'Es brennt! Loescht, bevor es niederbrennt.', wichtig: true }
        : vorhaben.angebot.length > 0
          ? { satz: 'Waehlt ein Vorhaben fuer diese Jahreszeit - es lohnt sich.', wichtig: true }
          : vorhaben.aktiv
            ? {
                satz: `Unser Vorhaben "${vorhaben.aktiv.name}": ${Math.min(vorhaben.aktiv.ist, vorhaben.aktiv.soll)} von ${vorhaben.aktiv.soll}, noch ${vorhaben.aktiv.rest} Runden.`,
                wichtig: false,
              }
            : besteZahl && besteZahl[1] > 0
              ? { satz: `Die ${besteZahl[0]} bringt uns am meisten ein: ${besteZahl[1]} Karten je Wurf.`, wichtig: false }
              : { satz: 'Noch bringt uns keine Zahl etwas ein - wir brauchen Doerfer an gutem Land.', wichtig: false };
    const faul = einheiten.filter(untaetig).length;
    const marschall =
      lage.unterwegs > 0 && lage.naechster !== null && lage.naechster <= 4
        ? { satz: `Raeuber sind nur ${lage.naechster} Felder vor unseren Siedlungen!`, wichtig: true }
        : beute > 0
          ? { satz: `Beute wartet: ${beute} ${beute === 1 ? 'Kartenwahl' : 'Kartenwahlen'}. Loest sie ein.`, wichtig: true }
          : faul > 0
            ? { satz: `${faul} ${faul === 1 ? 'Einheit steht' : 'Einheiten stehen'} untaetig herum.`, wichtig: false }
            : lage.unterwegs > 0
              ? { satz: `${lage.unterwegs} ${lage.unterwegs === 1 ? 'Raubzug ist' : 'Raubzuege sind'} unterwegs.`, wichtig: false }
              : { satz: `Ruhig an den Grenzen. Der naechste Aufbruch der Banden in ${bisPluenderung} Runden.`, wichtig: false };
    const wunderBereit = wunderListe.find((w) => !w.besitzer && w.grund === null && w.bezahlbar);
    const angebot = auftraege.find((a) => a.status === 'angebot');
    const seherin = wunderBereit
      ? { satz: `${wunderBereit.name} kann errichtet werden!`, wichtig: true }
      : angebot
        ? { satz: 'Ein Wanderer bittet um Hilfe - hoert ihn an.', wichtig: true }
        : geruechte[0]
          ? { satz: geruechte[0].text, wichtig: false }
          : { satz: 'Die Sterne schweigen. Erkundet mehr Land, dann erzaehlen sie wieder.', wichtig: false };
    const nah = [...siegwege].filter((w) => w.soll > 0).sort((a, b) => b.ist / b.soll - a.ist / a.soll)[0];
    const chronist =
      nah && nah.ist / nah.soll >= 0.6
        ? { satz: `Der Weg des ${nah.name} ist nah: ${Math.min(nah.ist, nah.soll)} von ${nah.soll}.`, wichtig: false }
        : {
            satz:
              punkte.ziel > 0
                ? `Wir stehen bei ${punkte.gesamt} von ${punkte.ziel} Siegpunkten.`
                : `Wir stehen bei ${punkte.gesamt} Siegpunkten, Wertung ${punkte.wertung}.`,
            wichtig: false,
          };
    return { kanzler, marschall, seherin, chronist };
  })();
  const namen = einheitNamen(einheiten, heldName);

  const umschaltenGruppe = (key: string) =>
    setOffeneGruppen((alt) => {
      const neu = new Set(alt);
      if (neu.has(key)) neu.delete(key);
      else neu.add(key);
      return neu;
    });

  /** Eine Einheit als Zeile: Name, Leben, Status - ein Klick klappt ihre Befehle auf. */
  const einheitZeile = (u: UnitState) => {
    const status = statusVon(u);
    const auf = offenerRitter === u.id || befehl === u.id;
    const max = maxLeben(u);
    return (
      <li
        key={u.id}
        className={[auf ? 'offen' : '', befehl === u.id ? 'aktiv' : '', u.kind === 'held' ? 'held' : '']
          .filter(Boolean)
          .join(' ') || undefined}
      >
        <button className="menu-ritter-zeile" aria-expanded={auf} onClick={() => setOffenerRitter(auf ? null : u.id)}>
          <span className="menu-ritter-name">{namen.get(u.id)}</span>
          <span className="menu-ritter-leben" title={`Leben ${u.leben} von ${max}`}>
            {Array.from({ length: max }, (_, n) => (
              <i key={n} className={n < u.leben ? 'voll' : undefined} />
            ))}
          </span>
          <span className="menu-ritter-pfeil">{auf ? '▾' : '▸'}</span>
          <span className={`menu-ritter-status ${status.art}`}>{status.text}</span>
        </button>
        {auf && (
          <div className="menu-ritter-knoepfe">
            <button onClick={() => onZeigen(u.id)}>Zeigen</button>
            <button disabled={!befehleMoeglich} className={befehl === u.id ? 'aktiv' : ''} onClick={() => onBefehl(u.id)}>
              {befehl === u.id ? 'Waehle Ziel' : 'Ziel'}
            </button>
            {u.ziel && (
              <button disabled={!befehleMoeglich} onClick={() => onHalt(u.id)}>
                Halt
              </button>
            )}
            {u.kind !== 'held' && (
              <button
                disabled={!befehleMoeglich || (!held && u.folgt === null)}
                className={u.folgt !== null ? 'aktiv' : ''}
                title="Dem Helden folgen - so schnell wie er"
                onClick={() => onFolgen(u.id, u.folgt === null)}
              >
                {u.folgt !== null ? 'Folgt' : 'Folgen'}
              </button>
            )}
            <button
              disabled={!befehleMoeglich}
              className={u.auftrag === 'erkunden' ? 'aktiv' : ''}
              title="Von selbst erkunden: zur naechsten Ruine oder ins Unbekannte"
              onClick={() => onErkunden(u.id, u.auftrag !== 'erkunden')}
            >
              {u.auftrag === 'erkunden' ? 'Erkundet' : 'Erkunden'}
            </button>
          </div>
        )}
      </li>
    );
  };

  if (!offen) {
    return (
      <button className="menu-auf" title="Menue oeffnen" onClick={() => setOffen(true)}>
        ‹
      </button>
    );
  }

  const ertragMax = Math.max(1, ...Object.values(ertrag));
  const gefilterterLog =
    logFilter === 'kaempfe' ? log.filter((z) => KAEMPFE.test(z)) : logFilter === 'ertrag' ? log.filter((z) => ERTRAG.test(z)) : log;

  return (
    <aside className="menu">
      <button className="menu-zu" title="Menue schliessen" onClick={() => setOffen(false)}>
        ›
      </button>

      {/* Zeit - der Kopf des Menues, im Stil einer Wappentafel. */}
      <div className={`menu-zeit saison-${saison}`}>
        <div className="menu-zeit-zier">❧</div>
        <div className="menu-saison">{SEASON_NAME[saison]}</div>
        <div className="menu-jahr">Jahr {yearOf(turn)}</div>
        {JAHRESZEIT_WIRKUNG[saison].text && <div className="menu-saison-wirkung">{JAHRESZEIT_WIRKUNG[saison].text}</div>}
        <div className="menu-trenner" />
        <div className="menu-runde">
          Runde {roundOf(turn)}
          <span> · </span>
          Gr. {bigRoundOf(turn)}
        </div>
        <div className="menu-rest" title={zeitInfo.wirkung || undefined}>
          {TAGESZEIT_NAME[zeitInfo.tageszeit]} noch {zeitInfo.bisTageszeit}, {WETTER_NAME[zeitInfo.wetter]} noch{' '}
          {zeitInfo.bisWetter}
          {zeitInfo.wirkung && <span className="menu-rest-wirkung"> !</span>}
        </div>
      </div>

      <div className="menu-reiter">
        {REITER.map((r) => (
          <button
            key={r.id}
            className={reiter === r.id ? 'menu-reiter-knopf aktiv' : 'menu-reiter-knopf'}
            title={`${r.name}: ${r.amt}`}
            onClick={() => setReiter(r.id)}
          >
            {SYMBOL[r.id]}
            <span>{r.name}</span>
            {berater[r.id].wichtig && reiter !== r.id && <i className="menu-reiter-punkt" aria-label="Etwas drangt" />}
          </button>
        ))}
      </div>

      <div className="menu-inhalt">
        <div className={berater[reiter].wichtig ? 'berater-zeile wichtig' : 'berater-zeile'}>
          <span className="berater-bild">{SYMBOL[reiter]}</span>
          <span className="berater-text">
            <b>{REITER.find((r) => r.id === reiter)!.name}</b>
            <span>{berater[reiter].satz}</span>
          </span>
        </div>
        {reiter === 'kanzler' && (
          <>
            {/* Feuer zuerst: wer brennt, hat nur diesen Zug zum Loeschen (rules/feuer.ts). */}
            {braende.length > 0 && (
              <>
                <Kopf titel="Es brennt" gefahr hilfe="Loeschen kostet eine Karte vom groessten Stapel. Auch ein Ritter, Bogenschuetze oder dein Held daneben loescht, und Regen tut es von selbst. Sonst brennt es nach deinem Zug ab." />
                <ul className="menu-braende">
                  {braende.map((b) => (
                    <li key={b.key}>
                      <span>Es brennt {BRAND_WAS[b.art]}</span>
                      <div className="menu-ritter-knoepfe">
                        <button onClick={() => onZeigenFeld(b.q, b.r)}>Zeigen</button>
                        <button
                          className="aktiv"
                          disabled={!loeschenMoeglich || loeschKarte === null}
                          title={loeschKarte ? `Loeschen kostet eine Karte: ${resourceName(loeschKarte)}` : 'Dafuer fehlt dir eine Karte'}
                          onClick={() => onLoeschen(b.key)}
                        >
                          Loeschen{loeschKarte ? ` (1 ${resourceName(loeschKarte)})` : ''}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {reiter === 'kanzler' && (
          <>
            {/* Vorhaben (core/vorhaben.ts): ein selbst gewaehltes Ziel fuer die Jahreszeit. */}
            {(vorhaben.angebot.length > 0 || vorhaben.aktiv) && (
              <>
                <Kopf
                  titel="Vorhaben"
                  hilfe="Ein Ziel fuer die naechste Jahreszeit (15 Runden), das du selbst waehlst. Wer es schafft, bekommt den Lohn. Neue Vorschlaege kommen zu Beginn jeder grossen Runde, wenn du keines hast."
                />
                {vorhaben.aktiv ? (
                  <div className="menu-box menu-vorhaben aktiv">
                    <b>{vorhaben.aktiv.name}</b>
                    <span>{vorhaben.aktiv.text}</span>
                    <span className="menu-vorhaben-stand">
                      {Math.min(vorhaben.aktiv.ist, vorhaben.aktiv.soll)}/{vorhaben.aktiv.soll} · noch {vorhaben.aktiv.rest} Rd. ·
                      Lohn: {vorhaben.aktiv.lohn}
                    </span>
                  </div>
                ) : (
                  <ul className="menu-vorhaben-wahl">
                    {vorhaben.angebot.map((v) => (
                      <li key={v.id}>
                        <button onClick={() => onVorhaben(v.id)} title={`Annehmen - Lohn: ${v.lohn}`}>
                          <b>{v.name}</b>
                          <span>{v.text}</span>
                          <i>Lohn: {v.lohn}</i>
                        </button>
                      </li>
                    ))}
                    <li>
                      <button className="klein" onClick={() => onVorhaben(null)}>
                        Keines - spaeter neue Vorschlaege
                      </button>
                    </li>
                  </ul>
                )}
              </>
            )}
          </>
        )}

        {reiter === 'chronist' && berichte.length > 0 && (
          <>
            <Kopf titel="Kunde aus dem Land" hilfe="Was in den letzten Jahreszeiten geschah - der Chronist schreibt es zu jedem Wechsel auf." />
            <div className="menu-berichte">
              {[...berichte].reverse().map((b) => (
                <details key={`${b.jahr}-${b.saison}`} open={b === berichte[berichte.length - 1]}>
                  <summary>
                    {SEASON_NAME[b.saison]}, Jahr {b.jahr}
                  </summary>
                  <ul className="kunde-zeilen">
                    {b.zeilen.map((z) => (
                      <li key={z}>{z}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </>
        )}

        {reiter === 'chronist' && (
          <>
            <Kopf
              titel="Siegpunkte"
              hilfe={
                (punkte.ziel > 0
                  ? `Wer zuerst ${punkte.ziel} Punkte hat, gewinnt. `
                  : punkte.rundenLimit === null
                    ? 'Endlosspiel: kein Siegpunktziel. '
                    : '') +
                (punkte.rundenLimit !== null
                  ? `Nach Runde ${punkte.rundenLimit} gewinnt die hoechste Wertung: Siegpunkte x 10 + Ruhm. `
                  : '') +
                'Dorf 1, Stadt 2, Hauptstadt 2 und je Ausbaustufe 1 mehr, Siegpunktkarten 1, Ruhmreichster ab 5 Ruhm 2.'
              }
            />
            <div className="menu-box">
              <div className="menu-punkte">
                <span className="menu-punkte-zahl">★ {punkte.gesamt}</span>
                <span className="menu-punkte-ziel">{zielText(punkte)}</span>
              </div>
              {punkte.rundenLimit !== null && (
                <div className="menu-zeilen">
                  <span>
                    <span>Wertung</span>
                    <b>{punkte.wertung}</b>
                  </span>
                </div>
              )}
              {punkte.ziel > 0 && (
                <div className="menu-balken">
                  <i style={{ width: `${Math.min(100, Math.round((punkte.gesamt / punkte.ziel) * 100))}%` }} />
                </div>
              )}
              <div className="menu-zeilen">
                {punkte.zeilen.map((z) => (
                  <span key={z.text} className={z.wert === null ? 'grau' : undefined}>
                    <span>{z.text}</span>
                    <b>{z.wert ?? '-'}</b>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {reiter === 'chronist' && (
          <>
            {siegwege.length > 0 && (
              <>
                <Kopf
                  titel="Andere Wege zum Sieg"
                  hilfe="Gewonnen hat auch, wer einen dieser Wege zu Ende geht - egal, wie viele Siegpunkte er hat."
                />
                <div className="menu-box menu-zeilen menu-siegwege">
                  {siegwege.map((w) => (
                    <span key={w.name} title={w.text} className={w.ist >= w.soll ? 'fertig' : undefined}>
                      <span>
                        {w.name} <i>{w.text}</i>
                      </span>
                      <b>
                        {Math.min(w.ist, w.soll)}/{w.soll}
                      </b>
                    </span>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {reiter === 'seherin' && omens.length > 0 && (
          <>
            <Kopf titel="Omen" hilfe="Die Vorzeichen dieser Partie: sie gelten fuer alle, von der ersten bis zur letzten Runde." />
            <OmenListe omens={omens} />
          </>
        )}

        {reiter === 'seherin' && (
          <>
            {wunderListe.length > 0 && (
              <>
                <Kopf
                  titel="Weltwunder"
                  hilfe="Wunderstaetten liegen fest auf der Karte, eine immer nahe dem Start. Wer ein Dorf oder eine Stadt daneben hat, kann dort ein Wunder errichten (2 Holz, 3 Lehm, 2 Wolle, 2 Getreide, 3 Erz) - jede Staette nur einmal: wer zuerst baut, hat es."
                />
                <ul className="menu-wunder">
                  {wunderListe.map((w) => (
                    <li key={w.key} className={w.besitzer ? 'vergeben' : ''}>
                      <span className="menu-wunder-kopf">
                        <b>{w.name}</b> <span>+{w.punkte} Siegpunkte</span>
                      </span>
                      <span className="menu-wunder-text">{w.besitzer ? `Errichtet von ${w.besitzer}.` : w.text}</span>
                      <span className="menu-wunder-knoepfe">
                        <button onClick={() => onZeigenFeld(w.q, w.r)}>Zeigen</button>
                        {!w.besitzer && (
                          <button
                            className="primary"
                            disabled={w.grund !== null || !w.bezahlbar}
                            title={w.grund ?? (w.bezahlbar ? 'Errichten' : 'Zu wenig Rohstoffe')}
                            onClick={() => onWunder(w.q, w.r)}
                          >
                            Errichten
                          </button>
                        )}
                      </span>
                      {!w.besitzer && w.grund && <span className="menu-wunder-grund">{w.grund}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {reiter === 'seherin' && (
          <>
            {geruechte.length > 0 && (
              <>
                <Kopf
                  titel="Geruechte"
                  hilfe="Was man sich in deinen Doerfern erzaehlt: wo im Nebel die naechste Ruine, Wunderstaette oder das Haus der Hexe liegt. Schick deinen Helden hin."
                />
                <ul className="menu-geruechte">
                  {geruechte.map((g) => (
                    <li key={g.art}>
                      <span>{g.text}</span>
                      <button className="klein" onClick={() => onZeigenFeld(g.q, g.r)}>
                        Richtung zeigen
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {reiter === 'kanzler' && (
          <>
            <Kopf
              titel="Ertrag je Zahl"
              hilfe="Wie viele Rohstoffkarten dir jede Wuerfelzahl bringt: je Dorf 1, je Stadt 2 fuer jedes angrenzende Feld mit dieser Zahl. Karten und Wetter sind nicht eingerechnet."
            />
            <div className="menu-box">
              <div className="menu-ertrag">
                {[2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map((z) => {
                  const n = ertrag[z] ?? 0;
                  return (
                    <div key={z} title={`${z}: ${n} ${n === 1 ? 'Karte' : 'Karten'} je Wurf`}>
                      <i className={z === 6 || z === 8 ? 'rot' : undefined} style={{ height: `${Math.round((n / ertragMax) * 40)}px` }} />
                      <span>{z}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {reiter === 'marschall' && (
          <>
            <Kopf
              titel="Lage"
              hilfe={
                lage.unterwegs === 0
                  ? 'Ruhig. Zum Beginn jeder grossen Runde brechen Raubzuege aus nahen Lagern auf.'
                  : 'Raeuber pluendern erst an einer Siedlung und tragen die Beute heim. Ein Ritter in ihrem Weg stellt sie - und holt die Beute zurueck.'
              }
            />
            <div className="menu-lage">
              <div className={lage.unterwegs > 0 ? 'gefahr' : undefined} title="Raubzuege unterwegs">
                <b>{lage.unterwegs}</b> Raubzuege
              </div>
              <div
                className={lage.naechster !== null && lage.naechster <= 3 ? 'gefahr' : undefined}
                title="So nah ist der naechste deinen Siedlungen"
              >
                <b>{lage.naechster ?? '-'}</b> Felder weg
              </div>
              <div className={lage.kaempfe > 0 ? 'gefahr' : undefined} title="Kaempfe in Sicht">
                <b>{lage.kaempfe}</b> Kaempfe
              </div>
              <div title="Wann die naechsten Raubzuege aufbrechen">
                <b>{bisPluenderung}</b> Rd. Aufbruch
              </div>
            </div>
          </>
        )}

        {reiter === 'chronist' && (
          <>
            <Kopf
              titel="Weiterspielen"
              hilfe='Auf einem anderen Geraet: Raumcode eingeben, deinen Platz waehlen, PIN nennen. Hier im Browser steht die Partie auf der Startseite unter "Deine Partien".'
            />
            <div className="menu-box menu-weiter">
              <span>
                Raum <b>{raumcode}</b>
              </span>
              <span>
                PIN <b>{pin ?? '-'}</b>
              </span>
            </div>
          </>
        )}

        {reiter === 'marschall' && (
          <>
            {/*
              Die eigenen Einheiten nach Scharen und Feldern (client/heer.ts) -
              dieselben Gruppen wie in der Heerleiste auf der Karte.
            */}
            <Kopf
              titel="Einheiten"
              rechts={
                einheiten.length > 0 ? (
                  <span className="menu-kopf-zahl">
                    {einheiten.length}
                    {einheiten.some(untaetig) ? ` · ${einheiten.filter(untaetig).length} untaetig` : ''}
                  </span>
                ) : undefined
              }
              hilfe="Ritter und Bogenschuetzen wirbst du in der Leiste unten an. Bogenschuetzen schiessen auf Feinde nebenan, neben einem Wachturm oder auf der Hauptstadt zwei Felder weit, und sind im Nahkampf schwach. Der Held zieht zwei Felder, geraet nie in einen Hinterhalt, und Ritter bei ihm treffen leichter. Wer zusammen geschickt wird, bildet eine Schar mit Banner."
            />
            {einheiten.length === 0 ? (
              <p className="menu-leer">Noch keine.</p>
            ) : (
              <ul className="menu-ritter">
                {heerGruppen(einheiten).map((g) => {
                  if (g.einheiten.length === 1) return einheitZeile(g.einheiten[0]!);
                  const ids = g.einheiten.map((u) => u.id);
                  const wartet = ids.length === zielAuswahl.length && ids.every((id) => zielAuswahl.includes(id));
                  const auf = offeneGruppen.has(g.key) || wartet;
                  const status = statusVon(g.einheiten.find((u) => u.ziel) ?? g.einheiten[0]!);
                  const leben = g.einheiten.reduce((n, u) => n + u.leben, 0);
                  const max = g.einheiten.reduce((n, u) => n + maxLeben(u), 0);
                  return (
                    <li
                      key={g.key}
                      className={['menu-verband', g.schar !== null ? 'schar' : '', auf ? 'offen' : '', wartet ? 'aktiv' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <button className="menu-ritter-zeile" aria-expanded={auf} onClick={() => umschaltenGruppe(g.key)}>
                        <span className="menu-ritter-name">
                          {g.schar !== null ? `⚑${g.schar} ` : ''}
                          {gruppenName(g, heldName)} · {g.einheiten.length}
                        </span>
                        <span className="menu-gruppe-leben" title={`Leben ${leben} von ${max}`}>
                          <i style={{ width: `${Math.round((leben / max) * 100)}%` }} />
                        </span>
                        <span className="menu-ritter-pfeil">{auf ? '▾' : '▸'}</span>
                        <span className={`menu-ritter-status ${status.art}`}>
                          {zusammensetzung(g.einheiten)} · {status.text}
                        </span>
                      </button>
                      {auf && (
                        <>
                          <div className="menu-ritter-knoepfe">
                            <button onClick={() => onZeigenFeld(g.q, g.r)}>Zeigen</button>
                            <button disabled={!befehleMoeglich} className={wartet ? 'aktiv' : ''} onClick={() => onGruppeZiel(ids)}>
                              {wartet ? 'Waehle Ziel' : 'Ziel fuer alle'}
                            </button>
                          </div>
                          <ul className="menu-ritter menu-verband-glieder">{g.einheiten.map(einheitZeile)}</ul>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!held && (
              <p className="menu-leer">
                {heldZurueck !== null ? `Held gefallen - er kehrt in Runde ${heldZurueck} zurueck.` : 'Der Held tritt nach dem Aufbau an.'}
              </p>
            )}
          </>
        )}

        {reiter === 'marschall' && (
          <>
            {/* Fraktionen: wem die Lager ringsum gehoeren, und das Abkommen mit ihnen (rules/diplomatie.ts). */}
            <Kopf
              titel="Fraktionen"
              hilfe={`Jede Fraktion hat einen Anfuehrer und ein Wesen, das ihr Verhalten praegt. Frieden (Raeuberbanden und kraemerische Staemme) haelt 20 Runden und kostet ${bundleText(FRIEDEN_PREIS)}. Tribut: eine Karte je Siegpunkt (derzeit ${tributPreis}), sofort und zu Beginn jeder grossen Runde - wer nicht zahlen kann, hat wieder Krieg. Solange ein Abkommen gilt, ziehen ihre Raubzuege an dir vorbei.`}
            />
            {fraktionen.length === 0 ? (
              <p className="menu-leer">Noch keine entdeckt.</p>
            ) : (
              <ul className="menu-frak">
                {fraktionen.map((f) => (
                  <li key={f.id}>
                    <span className="menu-frak-kopf">
                      <i style={{ background: f.farbe }} />
                      <span className="menu-frak-name">
                        {f.name}
                        <span className="menu-frak-info">
                          {' '}
                          · {f.lager} Lager{f.unterwegs > 0 ? ` · ${f.unterwegs} unterwegs` : ''}
                        </span>
                        {f.anfuehrer && (
                          <span className="menu-frak-wesen" title={f.wesen ? WESEN[f.wesen].text : undefined}>
                            {f.anfuehrer}
                            {f.wesen ? ` · ${WESEN[f.wesen].name}: ${WESEN[f.wesen].text} Sie ${WESEN[f.wesen].ziel}.` : ''}
                            {f.stimmung ? ` Dir gegenueber: ${f.stimmung}.` : ''}
                            {f.erstarkt ? ' Voller Beute - der naechste Raubzug kommt verstaerkt!' : ''}
                          </span>
                        )}
                      </span>
                      <span className={f.abkommen ? 'menu-chip frieden' : 'menu-chip krieg'}>
                        {f.abkommen === null ? 'Krieg' : f.abkommen.art === 'tribut' ? 'Tribut' : `Frieden R${f.abkommen.bis}`}
                      </span>
                    </span>
                    <span className="menu-ritter-knoepfe">
                      {f.abkommen === null ? (
                        <>
                          {f.nimmtFrieden && (
                            <button
                              disabled={!diplomatieMoeglich || !friedenBezahlbar}
                              title={`Frieden fuer 20 Runden: ${bundleText(FRIEDEN_PREIS)}`}
                              onClick={() => onDiplomatie(f.id, 'frieden')}
                            >
                              Frieden
                            </button>
                          )}
                          <button
                            disabled={!diplomatieMoeglich || handKarten < f.tribut}
                            title={`Tribut: ${f.tribut} ${f.tribut === 1 ? 'Karte' : 'Karten'} sofort und je grosser Runde`}
                            onClick={() => onDiplomatie(f.id, 'tribut')}
                          >
                            Tribut ({f.tribut})
                          </button>
                        </>
                      ) : (
                        <button disabled={!diplomatieMoeglich} onClick={() => onDiplomatie(f.id, 'krieg')}>
                          Krieg erklaeren
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {reiter === 'seherin' && (
          <>
            {/* Auftraege der Wanderer (rules/auftraege.ts). */}
            <Kopf titel="Auftraege" hilfe="Wanderer bieten Auftraege an, wenn sie an deinen Siedlungen vorbeikommen. Lohn: eine Kartenwahl." />
            {auftraege.length === 0 ? (
              <p className="menu-leer">Keine.</p>
            ) : (
              <ul className="menu-ritter menu-auftraege">
                {auftraege.map((a) => (
                  <li key={a.id} className={`auftrag-${a.status}`}>
                    <div className="menu-ritter-kopf">
                      <span className="menu-ritter-name">
                        {auftragText(a, nameVon)}
                        {a.art === 'jagd' && a.status === 'angenommen' ? ` (${a.fortschritt}/${a.menge})` : ''}
                      </span>
                      <span className="menu-ritter-ort">
                        {a.status === 'angebot' ? 'Angebot' : 'angenommen'} · noch {Math.max(0, a.bis - turn + 1)} Rd.
                      </span>
                    </div>
                    <span className="menu-auftrag-wer">Ein Wanderer bittet darum. Lohn: eine Kartenwahl.</span>
                    <div className="menu-ritter-knoepfe">
                      {a.art !== 'liefern' && <button onClick={() => onZeigenAuftrag(a)}>Zeigen</button>}
                      {a.art === 'liefern' && a.status === 'angenommen' && (
                        <button
                          className="aktiv"
                          disabled={!kannLiefern(a)}
                          title={kannLiefern(a) ? 'Die Rohstoffe abgeben' : 'Dafuer fehlen dir noch Rohstoffe'}
                          onClick={() => onLiefern(a.id)}
                        >
                          Liefern
                        </button>
                      )}
                      {a.status === 'angebot' && (
                        <>
                          <button className="aktiv" onClick={() => onAuftrag(a.id, true)}>
                            Annehmen
                          </button>
                          <button onClick={() => onAuftrag(a.id, false)}>Ablehnen</button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {reiter === 'marschall' && (
          <>
            <Kopf titel="Beute" hilfe="Zerstoerte Lager und erkundete Ruinen bringen Beute: je eine Kartenwahl." />
            {beute === 0 ? (
              <p className="menu-leer">Keine.</p>
            ) : (
              <div className="menu-liste">
                <button className="aktiv" disabled={!beuteMoeglich} onClick={onBeute}>
                  {beute} {beute === 1 ? 'Kartenwahl' : 'Kartenwahlen'} einloesen
                </button>
              </div>
            )}
          </>
        )}


        {reiter === 'kanzler' && (
          <>
            <Kopf
              titel={`Reichskarten${cards.length > 0 ? ` · ${cards.length}` : ''}`}
              hilfe="Nur Karten mit dem Siegel Aktiv liefern eine Dauerwirkung. Anfangs hast du zwei Plaetze; eine Hauptstadt erweitert sie. Tippe eine Dauerkarte an, um sie ein- oder auszuschalten - in deiner Bauphase. Bei vollen Plaetzen waehlst du, welche weicht."
            />
            {cards.length === 0 ? (
              <p className="menu-leer">Noch keine.</p>
            ) : (
              <>
                <ul className="menu-kartenraster">
                  {kartenStapel(cards).map(({ karte, anzahl }) => (
                    <li key={karte.id}>
                      <button
                        className={[`menu-karte-kachel selt-${karte.rarity}`, karteOffen === karte.id ? 'aktiv' : '', dauerwirkungen(karte).length > 0 && !activeCards.includes(karte.id) ? 'inaktiv' : '']
                          .filter(Boolean)
                          .join(' ')}
                        title={karte.text}
                        onClick={() => setKarteOffen((k) => (k === karte.id ? null : karte.id))}
                      >
                        <KartenBild karte={karte} klein />
                        <span className="menu-karte-kachel-name">{karte.name}</span>
                        {dauerwirkungen(karte).length > 0 && activeCards.includes(karte.id) && <span className="menu-karte-status">Aktiv</span>}
                        {anzahl > 1 && <span className="menu-karte-anzahl">×{anzahl}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {karteOffen &&
                  (() => {
                    const k = cardById(karteOffen);
                    if (!k) return null;
                    const dauer = dauerwirkungen(k).length > 0;
                    const an = activeCards.includes(k.id);
                    const voll = activeCards.length >= kartenPlaetze;
                    return (
                      <div className="menu-karte-detail">
                        <p>
                          <b>{k.name}</b> {k.text}
                        </p>
                        {dauer && (
                          <span className="menu-ritter-knoepfe">
                            {an ? (
                              <button
                                disabled={!kannUmstellen}
                                onClick={() => onLoadout(activeCards.filter((c) => c !== k.id))}
                              >
                                Abschalten
                              </button>
                            ) : !voll ? (
                              <button
                                disabled={!kannUmstellen}
                                onClick={() => onLoadout([...activeCards, k.id])}
                              >
                                Aktivieren
                              </button>
                            ) : (
                              activeCards.map((alt) => (
                                <button
                                  key={alt}
                                  disabled={!kannUmstellen}
                                  title={cardById(alt)?.text}
                                  onClick={() => onLoadout(activeCards.map((c) => (c === alt ? k.id : c)))}
                                >
                                  Statt {cardById(alt)?.name ?? alt}
                                </button>
                              ))
                            )}
                          </span>
                        )}
                        {dauer && !kannUmstellen && <p className="menu-leer">Umstellen geht nur in deiner Bauphase.</p>}
                      </div>
                    );
                  })()}
                <p className="menu-leer">
                  Plaetze: {activeCards.length} von {kartenPlaetze} belegt.
                </p>
                {wirkungen(activeCards).length > 0 && (
                  <>
                    <Kopf titel="Zusammen" />
                    <div className="menu-chips">
                      {wirkungen(activeCards).map((z) => (
                        <span key={z}>{z}</span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            <Kopf titel={`Taktiken${tactics.length > 0 ? ` · ${tactics.length}` : ''}`} hilfe="Taktiken liegen auf deiner Hand. Spiele sie im Kartenknopf der Aktionsleiste auf eine Einheit oder ein Feld; danach sind sie verbraucht." />
            {tactics.length === 0 ? (
              <p className="menu-leer">Keine spielbereit.</p>
            ) : (
              <ul className="menu-kartenraster">
                {kartenStapel(tactics).map(({ karte, anzahl }) => (
                  <li key={karte.id}>
                    <button className={`menu-karte-kachel selt-${karte.rarity}`} title={karte.text}>
                      <KartenBild karte={karte} klein />
                      <span className="menu-karte-kachel-name">{karte.name}</span>
                      {anzahl > 1 && <span className="menu-karte-anzahl">×{anzahl}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Kopf titel={`Ausruestung${equipment.length > 0 ? ` · ${equipment.length}` : ''}`} hilfe="Ausruestung ist ein eigener Kartenbereich fuer den kuenftigen Abenteuer- und Heldenzweig." />
            {equipment.length === 0 ? (
              <p className="menu-leer">Noch keine.</p>
            ) : (
              <ul className="menu-kartenraster">
                {kartenStapel(equipment).map(({ karte, anzahl }) => (
                  <li key={karte.id}>
                    <button className={`menu-karte-kachel selt-${karte.rarity}`} title={karte.text}>
                      <KartenBild karte={karte} klein />
                      <span className="menu-karte-kachel-name">{karte.name}</span>
                      {anzahl > 1 && <span className="menu-karte-anzahl">×{anzahl}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}

          </>
        )}

        {reiter === 'chronist' && (
          <>
            <Kopf titel="Spiel" />
            <div className="menu-box">
              <Schalter an={autoWurf} onClick={onToggleAutoWurf}>
                Selbstwurf nach <b className="menu-sek">{autoWurfSekunden} s</b>
              </Schalter>
              <Schalter an={showNumbers} onClick={onToggleNumbers}>
                Zahlen immer zeigen
              </Schalter>
              <button
                className="klein menu-tipps"
                title="Die Erklaerungen beim ersten Auftreten und die Erste-Schritte-Liste wieder zeigen"
                onClick={() => {
                  tippsZuruecksetzen();
                  try {
                    localStorage.removeItem('infinitecarthage.erste-schritte');
                  } catch {
                    // nichts zu tun
                  }
                }}
              >
                Tipps wieder zeigen
              </button>
            </div>

            <Kopf titel="Ton" hilfe="Der Tonknopf oben neben dem Wetter schaltet alles zusammen ab." />
            <div className="menu-box">
              <Schalter an={!stumm} onClick={onStumm}>
                Ton
              </Schalter>
              <Regler
                name="Klaenge"
                wert={ton}
                setzen={(v) => {
                  setVolume(v);
                  setTon(v);
                }}
              />
              <Regler
                name="Musik"
                wert={musikPegel}
                setzen={(v) => {
                  setMusicVolume(v);
                  setMusikPegel(v);
                }}
              />
              <Regler
                name="Umgebung"
                wert={umgebung}
                setzen={(v) => {
                  setUmgebungVolume(v);
                  setUmgebung(v);
                }}
              />
              <div className="menu-segment">
                {[
                  { id: 'aus' as MusicMode, name: 'Aus' },
                  { id: 'erzeugt' as MusicMode, name: 'Erzeugt' },
                  ...TRACKS.map((t) => ({ id: t.id as MusicMode, name: t.name })),
                ].map((m) => (
                  <button
                    key={m.id}
                    className={musik === m.id ? 'aktiv' : ''}
                    onClick={() => {
                      if (m.id !== 'aus') initAudio();
                      setMusicMode(m.id);
                      setMusik(m.id);
                    }}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>

            <Kopf titel="Partie" />
            <div className="menu-box menu-weiter">
              <span>
                Raum <b>{raumcode}</b>
              </span>
              <span>
                Ziel <b>{zielText(punkte).replace(/^von /, '')}</b>
              </span>
            </div>

            {/* Protokoll und Weltereignisse in einem, mit Filter. */}
            <Kopf titel="Protokoll" hilfe="Das Protokoll wird nur im Browser gefuehrt und beginnt nach einem Neuladen von vorn." />
            <div className="menu-filter">
              {(
                [
                  ['alles', 'Alles'],
                  ['kaempfe', 'Kaempfe'],
                  ['ertrag', 'Ertrag'],
                  ['welt', 'Welt'],
                ] as const
              ).map(([id, name]) => (
                <button key={id} className={logFilter === id ? 'aktiv' : ''} onClick={() => setLogFilter(id)}>
                  {name}
                </button>
              ))}
            </div>
            {logFilter === 'welt' ? (
              welt.length === 0 ? (
                <p className="menu-leer">Noch ruhig.</p>
              ) : (
                <ul className="menu-welt">
                  {[...welt].reverse().map((w) => (
                    <li key={w.id} className={`welt-${w.art}`}>
                      <span className="menu-welt-runde">R{w.runde}</span>
                      {w.text}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="menu-log">
                <LogPanel log={gefilterterLog} />
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
