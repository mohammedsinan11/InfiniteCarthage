/**
 * Das Seitenmenue am rechten Rand.
 *
 * Vorbild ist die Leiste aus RuneScape: ein schmales Feld mit Reiterreihe,
 * das immer da ist und in dem alles Nicht-Kartenbezogene wohnt. Anders als
 * dort laesst es sich einklappen - die Karte hat kein festes Format, und wer
 * weit hinausbaut, will den Platz.
 *
 * Oben steht die Zeit, weil sie zum Spielstand gehoert und nicht zu den
 * Einstellungen. Darunter vier Reiter mit Symbol und Wort: Reich, Heer,
 * Karten & Technologie, Optionen (mit dem Protokoll unten). Erklaerungen
 * stehen nicht mehr als Absaetze da, sondern hinter einem "?" am Abschnitt -
 * wer spielt, liest sie einmal, danach nehmen sie nur Platz.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { SEASON_NAME, bigRoundOf, ROUNDS_PER_BIG_ROUND, roundOf, seasonOf, yearOf } from '../../core/season';
import { cardById } from '../../core/cards/catalog';
import { modifiersOf } from '../../core/cards/effects';
import { RARITY_ORDER } from '../../core/cards/types';
import type { Resource, Terrain } from '../../core/types';
import type { Abkommen, Brand, UnitState, WandererAuftrag } from '../../core/state';
import { hexDistance } from '../../core/coords';
import { WERTE } from '../../core/units';
import { TAGESZEIT_NAME, WETTER_NAME } from '../../core/zeit';
import type { Tageszeit, Wetter } from '../../core/zeit';
import { FRIEDEN_PREIS, TRIBUT_KARTEN } from '../../core/rules/diplomatie';
import type { Verhandlung } from '../../core/rules/diplomatie';
import { getVolume, initAudio, setVolume } from '../audio';
import { LogPanel } from './LogPanel';
import { KartenBild } from './KartenBild';
import type { WeltEintrag } from '../net/store';
import { TRACKS, getMusicMode, getMusicVolume, setMusicMode, setMusicVolume } from '../music';
import type { MusicMode } from '../music';
import { getUmgebungVolume, setUmgebungVolume } from '../ambiente';
import { BRAND_WAS, auftragText, bundleText, resourceName } from '../log';
import { einheitNamen, gruppenName, heerGruppen, untaetig } from '../heer';

type Reiter = 'reich' | 'heer' | 'karten' | 'optionen';

/** Eine bekannte Fraktion, fertig fuer die Anzeige. */
export type FraktionsZeile = {
  id: string;
  name: string;
  art: 'raeuber' | 'goblin';
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
};

/** Siegpunkte aufgeschluesselt (Game): Summe, Ziel (0 = endlos) und woher sie kommen. */
export type PunkteSicht = { gesamt: number; ziel: number; zeilen: { text: string; wert: number | null }[] };

/* Symbole der Reiter - kleine SVG-Flaechen. PLATZHALTER (ASSETS.md). */
const SYMBOL: Record<Reiter, ReactNode> = {
  reich: (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 15 V7 L9 3 L15 7 V15 Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="7" y="10" width="4" height="5" fill="currentColor" />
    </svg>
  ),
  heer: (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M4 15 V6 Q9 0 14 6 V15 Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="6" y="7" width="6" height="2" fill="currentColor" />
    </svg>
  ),
  karten: (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <rect x="3" y="4" width="8" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="2" width="8" height="11" fill="currentColor" opacity="0.6" />
    </svg>
  ),
  optionen: (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M9 1 V4 M9 14 V17 M1 9 H4 M14 9 H17 M3.5 3.5 L5.5 5.5 M12.5 12.5 L14.5 14.5 M3.5 14.5 L5.5 12.5 M12.5 5.5 L14.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  ),
};

const REITER: ReadonlyArray<{ id: Reiter; name: string }> = [
  { id: 'reich', name: 'Reich' },
  { id: 'heer', name: 'Heer' },
  { id: 'karten', name: 'Karten & Technologie' },
  { id: 'optionen', name: 'Optionen' },
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

/** Was es noch nicht gibt, sagt das auch. */
function NochNicht({ was }: { was: string }) {
  return <p className="menu-leer">{was} folgt noch.</p>;
}

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
  tributBezahlbar,
  onDiplomatie,
  auftraege,
  onAuftrag,
  onZeigenFeld,
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
  tributBezahlbar: boolean;
  onDiplomatie: (fraktion: string, art: Verhandlung) => void;
  /** Die eigenen Auftraege - Angebote und angenommene. */
  auftraege: readonly WandererAuftrag[];
  onAuftrag: (id: number, annehmen: boolean) => void;
  onZeigenFeld: (q: number, r: number) => void;
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
  const [reiter, setReiter] = useState<Reiter>('reich');
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
    const max = WERTE[u.kind].leben;
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
            title={r.name}
            onClick={() => setReiter(r.id)}
          >
            {SYMBOL[r.id]}
            <span>{r.name}</span>
          </button>
        ))}
      </div>

      <div className="menu-inhalt">
        {reiter === 'reich' && (
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

            <Kopf
              titel="Siegpunkte"
              hilfe={
                punkte.ziel > 0
                  ? `Wer zuerst ${punkte.ziel} Punkte hat, gewinnt. Dorf 1, Stadt 2, Hauptstadt 2 und je Ausbaustufe 1 mehr, Siegpunktkarten 1, Groesste Rittermacht 2.`
                  : 'Endlosspiel: kein Siegpunktziel. Dorf 1, Stadt 2, Hauptstadt 2 und je Ausbaustufe 1 mehr, Siegpunktkarten 1, Groesste Rittermacht 2.'
              }
            />
            <div className="menu-box">
              <div className="menu-punkte">
                <span className="menu-punkte-zahl">★ {punkte.gesamt}</span>
                <span className="menu-punkte-ziel">{punkte.ziel > 0 ? `von ${punkte.ziel}` : 'endlos'}</span>
              </div>
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

            <Kopf titel="Bevoelkerung" />
            <NochNicht was="Bevoelkerung und Beliebtheit" />
          </>
        )}

        {reiter === 'heer' && (
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
                  const max = g.einheiten.reduce((n, u) => n + WERTE[u.kind].leben, 0);
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

            {/* Fraktionen: wem die Lager ringsum gehoeren, und das Abkommen mit ihnen (rules/diplomatie.ts). */}
            <Kopf
              titel="Fraktionen"
              hilfe={`Frieden (nur Raeuberbanden) haelt 20 Runden und kostet ${bundleText(FRIEDEN_PREIS)}. Tribut: ${TRIBUT_KARTEN} Karte sofort und zu Beginn jeder grossen Runde - wer nicht zahlen kann, hat wieder Krieg. Solange ein Abkommen gilt, ziehen ihre Raubzuege an dir vorbei.`}
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
                          <button disabled={!diplomatieMoeglich || !tributBezahlbar} onClick={() => onDiplomatie(f.id, 'tribut')}>
                            Tribut
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

        {reiter === 'karten' && (
          <>
            <Kopf
              titel={`Karten${cards.length > 0 ? ` · ${cards.length}` : ''}`}
              hilfe="Karten wirken dauerhaft. Bei einer Sieben, aus Beute und aus Auftraegen waehlst du eine von drei. Tippe eine Karte an, um ihren Text zu lesen."
            />
            {cards.length === 0 ? (
              <p className="menu-leer">Noch keine.</p>
            ) : (
              <>
                <ul className="menu-kartenraster">
                  {kartenStapel(cards).map(({ karte, anzahl }) => (
                    <li key={karte.id}>
                      <button
                        className={[`menu-karte-kachel selt-${karte.rarity}`, karteOffen === karte.id ? 'aktiv' : '']
                          .filter(Boolean)
                          .join(' ')}
                        title={karte.text}
                        onClick={() => setKarteOffen((k) => (k === karte.id ? null : karte.id))}
                      >
                        <KartenBild karte={karte} klein />
                        <span className="menu-karte-kachel-name">{karte.name}</span>
                        {anzahl > 1 && <span className="menu-karte-anzahl">×{anzahl}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {karteOffen &&
                  (() => {
                    const k = cardById(karteOffen);
                    return k ? (
                      <p className="menu-karte-detail">
                        <b>{k.name}</b> {k.text}
                      </p>
                    ) : null;
                  })()}
                {wirkungen(cards).length > 0 && (
                  <>
                    <Kopf titel="Zusammen" />
                    <div className="menu-chips">
                      {wirkungen(cards).map((z) => (
                        <span key={z}>{z}</span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            <Kopf titel="Technologie" />
            <NochNicht was="Der Technologiebaum" />
          </>
        )}

        {reiter === 'optionen' && (
          <>
            <Kopf titel="Spiel" />
            <div className="menu-box">
              <Schalter an={autoWurf} onClick={onToggleAutoWurf}>
                Selbstwurf nach <b className="menu-sek">{autoWurfSekunden} s</b>
              </Schalter>
              <Schalter an={showNumbers} onClick={onToggleNumbers}>
                Zahlen immer zeigen
              </Schalter>
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
                Ziel <b>{punkte.ziel > 0 ? punkte.ziel : 'endlos'}</b>
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
