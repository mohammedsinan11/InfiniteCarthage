/**
 * Das Seitenmenue am rechten Rand.
 *
 * Vorbild ist die Leiste aus RuneScape: ein schmales Feld mit Reiterreihe,
 * das immer da ist und in dem alles Nicht-Kartenbezogene wohnt. Anders als
 * dort laesst es sich einklappen - die Karte hat kein festes Format, und wer
 * weit hinausbaut, will den Platz.
 *
 * Oben steht die Zeit, weil sie zum Spielstand gehoert und nicht zu den
 * Einstellungen. In der Mitte ist Raum fuer alles, was noch kommt:
 * Bevoelkerung, Beliebtheit, Technologien, Auftraege, Helden. Die Reiter
 * dafuer stehen schon, ihr Inhalt sagt ehrlich, dass er noch fehlt - ein
 * leerer Reiter ist besser als eine erfundene Zahl.
 *
 * Der Kartenreiter ist der erste, der wirklich etwas zeigt. Er muss es auch:
 * eine Karte wirkt dauerhaft und verschwindet nach der Wahl vom Bildschirm.
 * Ohne Ablage waere jeder Vorteil nach ein paar Runden vergessen - man haette
 * gewaehlt, ohne je nachsehen zu koennen, was man gewaehlt hat.
 */

import { useState } from 'react';
import {
  ROUNDS_PER_BIG_ROUND,
  SEASON_NAME,
  bigRoundOf,
  roundOf,
  roundsLeftInSeason,
  seasonOf,
  yearOf,
} from '../../core/season';
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

type Reiter = 'reich' | 'karten' | 'technik' | 'auftraege' | 'ton';

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

const REITER: ReadonlyArray<{ id: Reiter; kurz: string; titel: string }> = [
  { id: 'reich', kurz: 'RE', titel: 'Reich' },
  { id: 'karten', kurz: 'KA', titel: 'Karten' },
  { id: 'technik', kurz: 'TE', titel: 'Technik' },
  { id: 'auftraege', kurz: 'HE', titel: 'Heer & Auftraege' },
  { id: 'ton', kurz: 'TO', titel: 'Ton' },
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
 * Was die Karten zusammen bewirken, in Worten.
 *
 * Die einzelnen Kartentexte stehen darueber - hier interessiert die Summe,
 * denn zwei Karten auf dasselbe Gelaende addieren sich, und das sieht man
 * den Einzeltexten nicht an.
 */
function wirkungen(cardIds: readonly string[]): string[] {
  const m = modifiersOf(cardIds);
  const zeilen: string[] = [];
  for (const [terrain, wert] of Object.entries(m.terrainBonus)) {
    if (!wert) continue;
    const name = GELAENDE[terrain as Terrain] ?? terrain;
    zeilen.push(`${name}: ${wert > 0 ? '+' : ''}${wert} je Ertrag`);
  }
  if (m.tradeDiscount > 0) zeilen.push(`Bankhandel: ${m.tradeDiscount} guenstiger`);
  if (m.handLimitBonus > 0) zeilen.push(`Handkarten: ${m.handLimitBonus} mehr erlaubt`);
  return zeilen;
}

/**
 * Gleiche Karten als Stapel: eine Zeile je Karte mit ihrer Anzahl. Die
 * Reihenfolge, in der sie genommen wurden, sagt nichts - sortiert wird nach
 * Seltenheit, die seltensten oben, dann nach Namen.
 */
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

/** Wie eine Einheit heisst - je Art nach Nummer gezaehlt: "Ritter 2", "Bogenschuetze 1". */
function einheitNamen(einheiten: readonly UnitState[]): Map<number, string> {
  const zaehler = new Map<string, number>();
  const out = new Map<number, string>();
  for (const u of [...einheiten].sort((a, b) => a.id - b.id)) {
    if (u.kind === 'held') {
      out.set(u.id, 'Held');
      continue;
    }
    const n = (zaehler.get(u.kind) ?? 0) + 1;
    zaehler.set(u.kind, n);
    out.set(u.id, `${u.kind === 'bogen' ? 'Bogenschuetze' : 'Ritter'} ${n}`);
  }
  return out;
}

/** Wer in einem Verband steht, kurz: "Held, 2 Ritter, 1 Bogenschuetze". */
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

/**
 * Die eigenen Einheiten je Feld. Mehrere auf einem Feld sind ein Verband: sie
 * lassen sich zusammen schicken und ziehen gemeinsam (rules/army.ts). Groessere
 * Verbaende zuerst, dann nach Nummer.
 */
function nachFeld(einheiten: readonly UnitState[]) {
  const m = new Map<string, { key: string; q: number; r: number; einheiten: UnitState[] }>();
  for (const u of [...einheiten].sort((a, b) => a.id - b.id)) {
    const key = `${u.q}:${u.r}`;
    const g = m.get(key);
    if (g) g.einheiten.push(u);
    else m.set(key, { key, q: u.q, r: u.r, einheiten: [u] });
  }
  return [...m.values()].sort(
    (a, b) => b.einheiten.length - a.einheiten.length || a.einheiten[0]!.id - b.einheiten[0]!.id,
  );
}

/** Was eine Einheit gerade tut. */
function statusVon(u: UnitState): { art: 'erkundet' | 'folgt' | 'zieht' | 'steht'; text: string } {
  if (u.auftrag === 'erkunden') return { art: 'erkundet', text: 'erkundet von selbst' };
  if (u.folgt !== null) return { art: 'folgt', text: 'folgt dem Helden' };
  if (u.ziel) {
    const weit = hexDistance(u, u.ziel);
    return { art: 'zieht', text: `zieht · noch ${weit} ${weit === 1 ? 'Feld' : 'Felder'}` };
  }
  return { art: 'steht', text: 'steht' };
}

/** Alle Einheiten in einer Zeile: wie viele, wie viele Verbaende, was sie tun. */
function einheitenSumme(einheiten: readonly UnitState[]): string {
  const verbaende = nachFeld(einheiten).filter((g) => g.einheiten.length > 1).length;
  const arten = [
    ['zieht', 'zieht', 'ziehen'],
    ['erkundet', 'erkundet', 'erkunden'],
    ['folgt', 'folgt', 'folgen'],
    ['steht', 'steht', 'stehen'],
  ] as const;
  const teile = [
    verbaende > 0 ? `${verbaende} ${verbaende === 1 ? 'Verband' : 'Verbaende'}` : '',
    ...arten.map(([art, eins, viele]) => {
      const n = einheiten.filter((u) => statusVon(u).art === art).length;
      return n > 0 ? `${n} ${n === 1 ? eins : viele}` : '';
    }),
  ].filter(Boolean);
  return `${einheiten.length} ${einheiten.length === 1 ? 'Einheit' : 'Einheiten'} · ${teile.join(' · ')}`;
}

/** Was es noch nicht gibt, sagt das auch. */
function NochNicht({ was }: { was: string }) {
  return <p className="menu-leer">{was} folgt noch.</p>;
}

export function SideMenu({
  turn,
  cards,
  log,
  welt,
  einheiten,
  raumcode,
  pin,
  lage,
  fraktionen,
  befehl,
  beute,
  befehleMoeglich,
  beuteMoeglich,
  onBefehl,
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
  verbandFeld,
  onVerbandZiel,
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
  /** Raumcode und Platz-PIN - fuer den Wiedereinstieg auf einem anderen Geraet. */
  raumcode: string;
  pin: string | null;
  /** Raubzuege unterwegs, wie nah der naechste den eigenen Siedlungen ist, Kaempfe in Sicht. */
  lage: { unterwegs: number; naechster: number | null; kaempfe: number };
  /** Bekannte Fraktionen, die naechsten zuerst. */
  fraktionen: readonly FraktionsZeile[];
  /** Ritter, der gerade auf sein Ziel wartet. */
  befehl: number | null;
  /** Uneingeloeste Beute. */
  beute: number;
  /** Duerfen gerade Befehle gegeben werden (eigener Zug)? */
  befehleMoeglich: boolean;
  /** Darf gerade Beute eingeloest werden (eigene Bauphase)? */
  beuteMoeglich: boolean;
  onBefehl: (id: number) => void;
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
  /** Der Verband, der gerade auf sein Ziel wartet (Feldschluessel), oder null. */
  verbandFeld: string | null;
  onVerbandZiel: (q: number, r: number) => void;
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
  /** Welcher Ritter in der Liste aufgeklappt ist - hoechstens einer. */
  const [offenerRitter, setOffenerRitter] = useState<number | null>(null);
  /** Welche Verbaende (Feldschluessel) aufgeklappt sind. */
  const [offeneVerbaende, setOffeneVerbaende] = useState<ReadonlySet<string>>(() => new Set());
  const [ton, setTon] = useState(getVolume);
  const [musik, setMusik] = useState<MusicMode>(getMusicMode);
  const [musikPegel, setMusikPegel] = useState(getMusicVolume);
  const [umgebung, setUmgebung] = useState(getUmgebungVolume);

  const saison = seasonOf(turn);
  // Raubzuege brechen zum Beginn jeder grossen Runde auf (rules/army.ts, sendRaiders).
  const bisPluenderung = ROUNDS_PER_BIG_ROUND - ((Math.max(1, turn) - 1) % ROUNDS_PER_BIG_ROUND);

  const namen = einheitNamen(einheiten);
  const umschaltenVerband = (key: string) =>
    setOffeneVerbaende((alt) => {
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
            <button
              disabled={!befehleMoeglich}
              className={befehl === u.id ? 'aktiv' : ''}
              onClick={() => onBefehl(u.id)}
            >
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
      <button
        className="menu-auf"
        title="Menue oeffnen"
        onClick={() => setOffen(true)}
      >
        ‹
      </button>
    );
  }

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
        <div className="menu-rest">noch {roundsLeftInSeason(turn)} bis zum Wechsel</div>
        <div className="menu-rest">
          {TAGESZEIT_NAME[zeitInfo.tageszeit]} noch {zeitInfo.bisTageszeit} · {WETTER_NAME[zeitInfo.wetter]} noch{' '}
          {zeitInfo.bisWetter}
        </div>
      </div>

      <div className="menu-reiter">
        {REITER.map((r) => (
          <button
            key={r.id}
            className={reiter === r.id ? 'menu-reiter-knopf aktiv' : 'menu-reiter-knopf'}
            title={r.titel}
            onClick={() => setReiter(r.id)}
          >
            {r.kurz}
          </button>
        ))}
      </div>

      <div className="menu-inhalt">
        {reiter === 'reich' && (
          <>
            <h3>Reich</h3>
            <NochNicht was="Bevoelkerung und Beliebtheit" />

            {/* Wiedereinstieg auf einem anderen Geraet (protocol.ts, Platz-PIN). */}
            <h3>Weiterspielen</h3>
            <div className="menu-wache">
              <span>Raumcode</span>
              <b>{raumcode}</b>
              <span>Deine PIN</span>
              <b>{pin ?? '-'}</b>
              <span className="menu-wache-hinweis">
                Auf einem anderen Geraet: Raumcode eingeben, deinen Platz waehlen, PIN nennen. Hier im Browser steht
                die Partie auf der Startseite unter "Deine Partien".
              </span>
            </div>

            {/*
              Die Lage draussen: wie viele Raubzuege unterwegs sind, wie nah der
              naechste schon ist, und wann die naechsten aufbrechen - genau das
              braucht man, um zu entscheiden, wohin die Ritter sollen.
            */}
            <h3>Lage</h3>
            <div className="menu-wache">
              <span>Raubzuege unterwegs</span>
              <b className={lage.unterwegs > 0 ? 'gefahr' : undefined}>{lage.unterwegs}</b>
              <span>Naechster bis zu dir</span>
              <b className={lage.naechster !== null && lage.naechster <= 3 ? 'gefahr' : undefined}>
                {lage.naechster === null ? '-' : `${lage.naechster} Felder`}
              </b>
              <span>Deine Einheiten</span>
              <b>{einheiten.length}</b>
              <span>Kaempfe in Sicht</span>
              <b className={lage.kaempfe > 0 ? 'gefahr' : undefined}>{lage.kaempfe}</b>
              <span>Naechster Aufbruch</span>
              <b>{bisPluenderung === 1 ? 'naechste Runde' : `in ${bisPluenderung} Runden`}</b>
              <span>Wetter</span>
              <b className={zeitInfo.wirkung ? 'gefahr' : undefined}>{WETTER_NAME[zeitInfo.wetter]}</b>
              {zeitInfo.wirkung && <span className="menu-wache-hinweis">{zeitInfo.wirkung}.</span>}
              <span className="menu-wache-hinweis">
                {lage.unterwegs === 0
                  ? 'Ruhig. Zum Beginn jeder grossen Runde brechen Raubzuege aus nahen Lagern auf.'
                  : 'Raeuber pluendern erst an einer Siedlung und tragen die Beute heim. Ein Ritter in ihrem Weg stellt sie - und holt die Beute zurueck.'}
              </span>
            </div>

            {/*
              Feuer: was brennt, und womit es sich loeschen laesst. Ein Zug
              bleibt dafuer - danach brennt es ab (rules/feuer.ts).
            */}
            {braende.length > 0 && (
              <>
                <h3 className="gefahr">Es brennt</h3>
                <ul className="menu-braende">
                  {braende.map((b) => (
                    <li key={b.key}>
                      <span>
                        Es brennt {BRAND_WAS[b.art]} - loeschen, sonst brennt es nach deinem Zug ab.
                      </span>
                      <div className="menu-ritter-knoepfe">
                        <button onClick={() => onZeigenFeld(b.q, b.r)}>Zeigen</button>
                        <button
                          className="aktiv"
                          disabled={!loeschenMoeglich || loeschKarte === null}
                          title={
                            loeschKarte
                              ? `Loeschen kostet eine Karte: ${resourceName(loeschKarte)}`
                              : 'Dafuer fehlt dir eine Karte'
                          }
                          onClick={() => onLoeschen(b.key)}
                        >
                          Loeschen{loeschKarte ? ` (1 ${resourceName(loeschKarte)})` : ''}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="menu-leer">Auch ein Ritter oder dein Held daneben loescht, und Regen tut es von selbst.</p>
              </>
            )}

            {/*
              Die Fraktionen: wem die Lager ringsum gehoeren. Mit jeder laesst sich
              verhandeln - Frieden (nur Raeuber) oder Tribut. Solange ein Abkommen
              gilt, ziehen ihre Raubzuege an dir vorbei (rules/diplomatie.ts).
            */}
            <h3>Fraktionen</h3>
            {fraktionen.length === 0 ? (
              <p className="menu-leer">Noch keine entdeckt.</p>
            ) : (
              <ul className="menu-fraktionen">
                {fraktionen.map((f) => (
                  <li key={f.id}>
                    <span className="menu-fraktion-farbe" style={{ background: f.farbe }} />
                    <span className="menu-fraktion-name">{f.name}</span>
                    <span
                      className={
                        f.abkommen ? 'menu-fraktion-haltung friedlich' : 'menu-fraktion-haltung'
                      }
                    >
                      {f.abkommen === null
                        ? 'Krieg'
                        : f.abkommen.art === 'tribut'
                          ? 'Tribut'
                          : `Frieden bis R${f.abkommen.bis}`}
                    </span>
                    <span className="menu-fraktion-info">
                      {f.art === 'goblin' ? 'Goblins' : 'Raeuber'} · {f.lager} Lager
                      {f.unterwegs > 0 ? ` · ${f.unterwegs} unterwegs` : ''}
                      {f.naechster !== null ? ` · ${f.naechster} Felder` : ''}
                    </span>
                    <span className="menu-fraktion-knoepfe">
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
                            disabled={!diplomatieMoeglich || !tributBezahlbar}
                            title={`Tribut: ${TRIBUT_KARTEN} Karte sofort und zu Beginn jeder grossen Runde, vom groessten Stapel. Wer nicht zahlen kann, hat wieder Krieg.`}
                            onClick={() => onDiplomatie(f.id, 'tribut')}
                          >
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

            {/*
              Das Protokoll stand frueher links neben dem Brett und ist beim
              Umbau auf die Karte gewichen. Vermisst wurde es trotzdem. Hier
              nimmt es der Karte keinen Platz weg.
            */}
            <h3>Protokoll</h3>
            <div className="menu-log">
              <LogPanel log={log} />
            </div>

            {/* Unten, und neueste zuerst: man sucht das Letzte, was geschah. */}
            <h3 className="menu-welt-kopf">Weltereignisse</h3>
            {welt.length === 0 ? (
              <p className="menu-leer">Noch ruhig. Hier landen Pluenderungen und Zeitenwechsel.</p>
            ) : (
              <ul className="menu-welt">
                {[...welt].reverse().map((w) => (
                  <li key={w.id} className={`welt-${w.art}`}>
                    <span className="menu-welt-runde">R{w.runde}</span>
                    {w.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {reiter === 'karten' && (
          <>
            <h3>Karten{cards.length > 0 ? ` (${cards.length})` : ''}</h3>
            {cards.length === 0 ? (
              <p className="menu-leer">
                Noch keine. Bei einer Sieben findest du welche.
              </p>
            ) : (
              <>
                <ul className="menu-karten">
                  {kartenStapel(cards).map(({ karte, anzahl }) => (
                    <li key={karte.id} className={`menu-karte selt-${karte.rarity}`}>
                      <KartenBild karte={karte} klein />
                      <span className="menu-karte-kopf">
                        <span className="menu-karte-name">{karte.name}</span>
                        {anzahl > 1 && <span className="menu-karte-anzahl">×{anzahl}</span>}
                      </span>
                      <span className="menu-karte-text">{karte.text}</span>
                    </li>
                  ))}
                </ul>

                {wirkungen(cards).length > 0 && (
                  <>
                    <h3>Zusammen</h3>
                    <ul className="menu-wirkung">
                      {wirkungen(cards).map((z) => (
                        <li key={z}>{z}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </>
        )}

        {reiter === 'technik' && (
          <>
            <h3>Technik</h3>
            <NochNicht was="Der Technologiebaum" />
          </>
        )}

        {reiter === 'auftraege' && (
          <>
            {/*
              Die eigenen Einheiten je Feld. Mehrere auf einem Feld sind ein
              Verband: eine Zeile fuer alle, aufgeklappt stehen die Einheiten
              darin, jede mit ihren eigenen Befehlen. Ein Ziel fuer eine einzelne
              Einheit loest sie aus dem Verband (rules/army.ts).
            */}
            <h3>Einheiten</h3>
            {einheiten.length === 0 ? (
              <p className="menu-leer">
                Noch keine. Ritter und Bogenschuetzen wirbst du in der Leiste unten an, der Held tritt nach dem
                Aufbau an.
              </p>
            ) : (
              <>
                <p className="menu-ritter-summe">{einheitenSumme(einheiten)}</p>
                <ul className="menu-ritter">
                  {nachFeld(einheiten).map((g) => {
                    if (g.einheiten.length === 1) return einheitZeile(g.einheiten[0]!);
                    const auf =
                      offeneVerbaende.has(g.key) || verbandFeld === g.key || g.einheiten.some((u) => u.id === befehl);
                    const status = statusVon(g.einheiten.find((u) => u.ziel) ?? g.einheiten[0]!);
                    return (
                      <li
                        key={g.key}
                        className={['menu-verband', auf ? 'offen' : '', verbandFeld === g.key ? 'aktiv' : '']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <button className="menu-ritter-zeile" aria-expanded={auf} onClick={() => umschaltenVerband(g.key)}>
                          <span className="menu-ritter-name">Verband · {g.einheiten.length}</span>
                          <span className="menu-ritter-pfeil">{auf ? '▾' : '▸'}</span>
                          {/* Wer drin ist, in der zweiten Zeile - oben neben dem Namen war zu wenig Platz. */}
                          <span className={`menu-ritter-status ${status.art}`}>
                            {zusammensetzung(g.einheiten)} · {status.text}
                          </span>
                        </button>
                        {auf && (
                          <>
                            <div className="menu-ritter-knoepfe">
                              <button onClick={() => onZeigenFeld(g.q, g.r)}>Zeigen</button>
                              <button
                                disabled={!befehleMoeglich}
                                className={verbandFeld === g.key ? 'aktiv' : ''}
                                onClick={() => onVerbandZiel(g.q, g.r)}
                              >
                                {verbandFeld === g.key ? 'Waehle Ziel' : 'Ziel fuer alle'}
                              </button>
                            </div>
                            <ul className="menu-ritter menu-verband-glieder">{g.einheiten.map(einheitZeile)}</ul>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <p className="menu-leer">
              Bogenschuetzen schiessen jede Runde auf Feinde nebenan und stuermen nicht vor. Neben einem eigenen
              Wachturm oder auf der eigenen Hauptstadt reichen sie zwei Felder weit. Im Nahkampf sind sie schwach.
            </p>

            {/*
              Der Held: eine Figur, die schneller zieht, Ruinen ohne Hinterhalt
              erkundet und Ritter anfuehrt (rules/army.ts). Seine Befehle stehen
              oben bei den Einheiten.
            */}
            <h3>Held</h3>
            <p className="menu-leer">
              {held
                ? `Leben ${held.leben}/${WERTE.held.leben} · ${statusVon(held).text}. `
                : heldZurueck !== null
                  ? `Gefallen - er kehrt in Runde ${heldZurueck} zurueck. `
                  : 'Er tritt nach dem Aufbau an. '}
              Zieht zwei Felder je Runde, geraet in Ruinen nie in einen Hinterhalt. Ritter bei ihm treffen leichter,
              Ritter im Gefolge ziehen so schnell wie er. Nachts traegt er das hellste Licht.
            </p>

            {/*
              Auftraege der Wanderer: annehmen, zeigen, liefern, und was sie
              einbringen (rules/auftraege.ts).
            */}
            <h3>Auftraege</h3>
            {auftraege.length === 0 ? (
              <p className="menu-leer">
                Wanderer bieten Auftraege an, wenn sie an deinen Siedlungen vorbeikommen.
              </p>
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
                        {a.status === 'angebot' ? 'Angebot' : 'angenommen'} · noch {Math.max(0, a.bis - turn + 1)}{' '}
                        Runden · Lohn: eine Kartenwahl
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

            <h3>Beute</h3>
            {beute === 0 ? (
              <p className="menu-leer">Zerstoerte Lager und erkundete Ruinen bringen Beute.</p>
            ) : (
              <div className="menu-liste">
                <button className="aktiv" disabled={!beuteMoeglich} onClick={onBeute}>
                  {beute} {beute === 1 ? 'Kartenwahl' : 'Kartenwahlen'} einloesen
                </button>
              </div>
            )}

          </>
        )}

        {reiter === 'ton' && (
          <>
            <h3>Ton</h3>
            <div className="menu-liste">
              <button
                className={stumm ? 'aktiv' : ''}
                onClick={onStumm}
              >
                {stumm ? 'Ton ist aus - einschalten' : 'Ton ausschalten'}
              </button>
            </div>
            <p className="menu-leer">
              Schaltet alles zusammen ab: Umgebung, Musik und Klaenge. Der Knopf steht auch oben neben dem Wetter.
            </p>
            <label className="menu-zeile">
              Umgebung
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(umgebung * 100)}
                onChange={(e) => {
                  initAudio();
                  const v = Number(e.target.value) / 100;
                  setUmgebungVolume(v);
                  setUmgebung(v);
                }}
              />
            </label>
            <label className="menu-zeile">
              Musik
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(musikPegel * 100)}
                onChange={(e) => {
                  initAudio();
                  const v = Number(e.target.value) / 100;
                  setMusicVolume(v);
                  setMusikPegel(v);
                }}
              />
            </label>
            <label className="menu-zeile">
              Klaenge
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(ton * 100)}
                onChange={(e) => {
                  initAudio();
                  const v = Number(e.target.value) / 100;
                  setVolume(v);
                  setTon(v);
                }}
              />
            </label>

            <h3>Musik</h3>
            <div className="menu-liste">
              <button
                className={musik === 'aus' ? 'aktiv' : ''}
                onClick={() => {
                  setMusicMode('aus');
                  setMusik('aus');
                }}
              >
                aus
              </button>
              <button
                className={musik === 'erzeugt' ? 'aktiv' : ''}
                onClick={() => {
                  initAudio();
                  setMusicMode('erzeugt');
                  setMusik('erzeugt');
                }}
              >
                erzeugt
              </button>
              {TRACKS.map((t) => (
                <button
                  key={t.id}
                  className={musik === t.id ? 'aktiv' : ''}
                  onClick={() => {
                    initAudio();
                    setMusicMode(t.id);
                    setMusik(t.id);
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
            {TRACKS.length === 0 && (
              <p className="menu-leer">
                Noch keine Stuecke eingebaut. Dateien nach src/assets/music legen -
                das README dort nennt die Lizenzbedingungen.
              </p>
            )}

            <h3>Anzeige</h3>
            <div className="menu-liste">
              <button className={showNumbers ? 'aktiv' : ''} onClick={onToggleNumbers}>
                Zahlen dauerhaft
              </button>
            </div>

            <h3>Spiel</h3>
            <div className="menu-liste">
              <button className={autoWurf ? 'aktiv' : ''} onClick={onToggleAutoWurf}>
                Nach {autoWurfSekunden} s selbst wuerfeln
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
