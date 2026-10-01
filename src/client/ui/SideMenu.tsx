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

import { SippenLeiste } from './SippenLeiste';
import type { SippenZaehler } from '../../core/cards/sippen';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { JAHRESZEIT_WIRKUNG, SEASON_NAME, bigRoundOf, roundOf, seasonOf, yearOf } from '../../core/season';
import { cardById } from '../../core/cards/catalog';
import { modifiersOf } from '../../core/cards/effects';
import { RARITY_ORDER, dauerwirkungen } from '../../core/cards/types';
import type { Resource, Terrain } from '../../core/types';
import type { Brand, WandererAuftrag } from '../../core/state';
import { TAGESZEIT_NAME, WETTER_NAME } from '../../core/zeit';
import type { Tageszeit, Wetter } from '../../core/zeit';
import { getVolume, initAudio, setVolume } from '../audio';
import { LogPanel } from './LogPanel';
import { Spielkarte } from './Spielkarte';
import { OmenListe } from './OmenListe';
import type { Bericht } from '../../core/kunde';
import type { WeltEintrag } from '../net/store';
import { TRACKS, getMusicMode, getMusicVolume, setMusicMode, setMusicVolume } from '../music';
import type { MusicMode } from '../music';
import { getUmgebungVolume, setUmgebungVolume } from '../ambiente';
import type { Geruecht } from '../geruechte';
import { BRAND_WAS, auftragText, resourceName } from '../log';
import { tippsZuruecksetzen } from '../tipps';

/*
 * Die Reiter sind Berater (OVERHAUL.md, Abschnitt 2): der Kanzler fuer Wirtschaft,
 * Vorhaben und Karten, der Marschall fuer Lage, Heer und Fraktionen, die
 * Seherin fuer Geruechte, Wunder und Auftraege, der Chronist fuer Punkte,
 * Siegwege, Protokoll und Einstellungen. Jeder sagt oben in einem Satz, was
 * er sieht, und meldet sich mit einem Punkt, wenn etwas drangt.
 */
type Reiter = 'reich' | 'chronik';

/** Eine bekannte Fraktion, fertig fuer die Anzeige. */

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
  // Reich: Kappe und Muenze.
  reich: (
    <svg viewBox="0 0 18 18" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="5" y="2" width="8" height="3" fill="currentColor" />
      <rect x="6" y="5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="12" width="10" height="4" fill="currentColor" opacity="0.6" />
      <rect x="12" y="11" width="4" height="4" fill="#ffd76a" />
    </svg>
  ),
  // Chronik: Buch und Feder.
  chronik: (
    <svg viewBox="0 0 18 18" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="3" y="5" width="10" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="5" y="8" width="6" height="1" fill="currentColor" />
      <rect x="5" y="11" width="6" height="1" fill="currentColor" />
      <path d="M12 2 L16 1 L13 7 Z" fill="currentColor" opacity="0.7" />
    </svg>
  ),
};

const REITER: ReadonlyArray<{ id: Reiter; name: string; amt: string }> = [
  { id: 'reich', name: 'Reich', amt: 'Vorhaben, Sippen, Karten, Auftraege, Omen' },
  { id: 'chronik', name: 'Chronik', amt: 'Punkte, Kunde, Einstellungen, Protokoll' },
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
  raumcode,
  pin,
  punkte,
  ertrag,
  showNumbers,
  onToggleNumbers,
  autoWurf,
  onToggleAutoWurf,
  autoWurfSekunden,
  zeitInfo,
  geruechte,
  omens,
  berichte,
  vorhaben,
  onVorhaben,
  siegwege,
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
  stumm,
  onStumm,
  onZeigenAuftrag,
  kannLiefern,
  onLiefern,
  sippe,
  sippeSeit,
  onKarten,
  onRat,
  onVerlassen,
  mitHeld = true,
  mitReich = true,
  zaehler,
  krone = null,
  onKrone,
}: {
  /** Zaehler der Engine-Karten (ENGINE_KARTEN.md). */
  zaehler?: Record<string, number>;
  /** Die Schluesselkarte im Kronplatz. */
  krone?: string | null;
  /** Eine andere eigene Schluesselkarte in den Kronplatz legen. */
  onKrone?: (card: string) => void;
  /** Held, Auftraege und Geruechte dabei (core/systeme.ts)? */
  mitHeld?: boolean;
  /** Wunder und Vorhaben dabei? */
  mitReich?: boolean;
  /** Die Partie verlassen - steht in der Chronik, weit weg vom Spiel. */
  onVerlassen?: () => void;
  /** Den Rat fragen (client/rat.ts) - nur im eigenen Zug. */
  onRat?: () => void;
  /** Die Kartentafel oeffnen: Entwicklungskarte kaufen, Karten und Taktiken spielen. */
  onKarten?: () => void;
  /** Karten je Familie (core/cards/sippen.ts) - fehlt ohne Ereignisse. */
  sippe?: SippenZaehler;
  sippeSeit?: SippenZaehler;
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
  /** Raumcode und Platz-PIN - fuer den Wiedereinstieg auf einem anderen Geraet. */
  raumcode: string;
  pin: string | null;
  /** Siegpunkte aufgeschluesselt. */
  punkte: PunkteSicht;
  /** Rohstoffkarten je Wuerfelzahl aus eigenen Siedlungen. */
  ertrag: Readonly<Record<number, number>>;
  showNumbers: boolean;
  onToggleNumbers: () => void;
  /** Wuerfelt der Knopf nach einigen Sekunden von selbst? */
  autoWurf: boolean;
  onToggleAutoWurf: () => void;
  autoWurfSekunden: number;
  /** Tageszeit und Wetter mit ihrer Dauer und dem, was das Wetter bewirkt. */
  zeitInfo: { tageszeit: Tageszeit; wetter: Wetter; bisTageszeit: number; bisWetter: number; wirkung: string };
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
  /** Ist aller Ton aus? */
  stumm: boolean;
  /** Ton an oder aus - schaltet um. */
  onStumm: () => void;
  /** Auf der Karte zeigen, wohin ein Auftrag fuehrt. */
  onZeigenAuftrag: (a: WandererAuftrag) => void;
  kannLiefern: (a: WandererAuftrag) => boolean;
  onLiefern: (id: number) => void;
}) {
  // Zu Beginn eingeklappt - die Karte zuerst (weniger Knoepfe). Das Menue ist
  // zum Nachschlagen da, nicht zum Spielen.
  const [offen, setOffen] = useState(false);
  // Wird das Fenster schmal (Handy gedreht, Fenster verkleinert), geht das Menue
  // zu - sonst deckte es halb die Karte (Spieltest 4).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 700px)');
    const wechsel = (e: MediaQueryListEvent) => {
      if (e.matches) setOffen(false);
    };
    mq.addEventListener('change', wechsel);
    return () => mq.removeEventListener('change', wechsel);
  }, []);
  const [reiter, setReiter] = useState<Reiter>('reich');
  /** Welche Karte ihren Text zeigt. */
  const [karteOffen, setKarteOffen] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<LogFilter>('alles');
  const [ton, setTon] = useState(getVolume);
  const [musik, setMusik] = useState<MusicMode>(getMusicMode);
  const [musikPegel, setMusikPegel] = useState(getMusicVolume);
  const [umgebung, setUmgebung] = useState(getUmgebungVolume);

  const saison = seasonOf(turn);
  /*
   * Was jeder Berater sagt - der dringendste Satz zuerst. wichtig: ein Punkt
   * am Reiter, damit man es auch sieht, wenn der Berater nicht offen ist.
   */
  const berater: Record<Reiter, { satz: string; wichtig: boolean; wer: string }> = (() => {
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
    // Im Reich spricht, wer gerade Dringendes hat - sonst der Kanzler.
    const reich = !kanzler.wichtig && seherin.wichtig ? { ...seherin, wer: 'Seherin' } : { ...kanzler, wer: 'Kanzler' };
    return { reich, chronik: { ...chronist, wer: 'Chronist' } };
  })();
  if (!offen) {
    return (
      <button className="menu-auf" title="Menue: Reich und Chronik" onClick={() => setOffen(true)}>
        ‹<span>Menue</span>
        {(berater.reich.wichtig || berater.chronik.wichtig) && <i className="menu-reiter-punkt" aria-label="Etwas drangt" />}
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
            <b>{berater[reiter].wer}</b>
            <span>{berater[reiter].satz}</span>
          </span>
          {/* "Was jetzt?" - frueher ein Schild oben, jetzt beim Berater (Spieltest 7). */}
          {onRat && (
            <button className="klein berater-rat" title="Was waere jetzt sinnvoll? Ein Vorschlag - gespielt wird nichts." onClick={onRat}>
              Rat?
            </button>
          )}
        </div>
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
          </>
        )}

        {reiter === 'reich' && (
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

        {reiter === 'reich' && (
          <>
            {sippe !== undefined && (
              <>
                <Kopf
                  titel="Sippen"
                  hilfe="Jede genommene Karte gehoert einer Familie. Mit 2, 4 und 6 Karten einer Familie wirkt ein Bonus - aber nur fuer deine zwei staerksten Familien. Zeiger auf ein Zeichen zeigt die Stufen."
                />
                <SippenLeiste sippe={sippe} seit={sippeSeit} />
              </>
            )}
            <Kopf
              titel={`Reichskarten${cards.length > 0 ? ` · ${cards.length}` : ''}`}
              hilfe="Nur Karten mit dem Siegel Aktiv liefern eine Dauerwirkung. Anfangs hast du drei Plaetze; eine Hauptstadt erweitert sie. Dazu kommt der Kronplatz fuer eine Schluesselkarte. Tippe eine Dauerkarte an, um sie ein- oder auszuschalten - in deiner Bauphase. Bei vollen Plaetzen waehlst du, welche weicht."
            />
            {/* Der Kronplatz (ENGINE_KARTEN.md): eine Schluesselkarte, die die Regeln beugt. */}
            {krone && cardById(krone) && (
              <div className="menu-krone" title={cardById(krone)!.text}>
                <span className="menu-krone-titel">Krone</span>
                <b>{cardById(krone)!.name}</b>
                <span>{cardById(krone)!.text}</span>
              </div>
            )}
            {cards.length === 0 ? (
              <p className="menu-leer">Noch keine.</p>
            ) : (
              <>
                <ul className="menu-kartenraster">
                  {kartenStapel(cards).map(({ karte, anzahl }) => (
                    <li key={karte.id}>
                      <button
                        className={[`menu-karte-kachel sk-kachel selt-${karte.rarity}`, karteOffen === karte.id ? 'aktiv' : '', dauerwirkungen(karte).length > 0 && !activeCards.includes(karte.id) ? 'inaktiv' : '']
                          .filter(Boolean)
                          .join(' ')}
                        title={karte.text}
                        onClick={() => setKarteOffen((k) => (k === karte.id ? null : karte.id))}
                      >
                        <Spielkarte karte={karte} groesse="mini" zaehler={zaehler?.[karte.id]} />
                        {karte.schluessel
                          ? krone === karte.id && <span className="menu-karte-status">Krone</span>
                          : dauerwirkungen(karte).length > 0 && activeCards.includes(karte.id) && <span className="menu-karte-status">Aktiv</span>}
                        {anzahl > 1 && <span className="menu-karte-anzahl">×{anzahl}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {karteOffen &&
                  (() => {
                    const k = cardById(karteOffen);
                    if (!k) return null;
                    const dauer = dauerwirkungen(k).length > 0 && !k.schluessel;
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
                        {k.schluessel && krone !== k.id && onKrone && (
                          <span className="menu-ritter-knoepfe">
                            <button disabled={!kannUmstellen} onClick={() => onKrone(k.id)}>
                              In die Krone
                            </button>
                          </span>
                        )}
                        {zaehler?.[k.id] !== undefined && <p className="menu-leer">Zaehler: {zaehler[k.id]}</p>}
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

            <Kopf titel={`Taktiken${tactics.length > 0 ? ` · ${tactics.length}` : ''}`} hilfe="Taktiken liegen auf deiner Hand. Spiele sie ueber 'Karten kaufen und spielen' auf eine Einheit; danach sind sie verbraucht." />
            {/* Der Kartenknopf der Leiste ist weg (Spieltest 7) - hier oeffnet sich dieselbe Tafel. */}
            {onKarten && (
              <button className="klein menu-karten-knopf" onClick={onKarten}>
                Karten kaufen und spielen
              </button>
            )}
            {tactics.length === 0 ? (
              <p className="menu-leer">Keine spielbereit.</p>
            ) : (
              <ul className="menu-kartenraster">
                {kartenStapel(tactics).map(({ karte, anzahl }) => (
                  <li key={karte.id}>
                    <button className={`menu-karte-kachel sk-kachel selt-${karte.rarity}`} title={karte.text}>
                      <Spielkarte karte={karte} groesse="mini" />
                      {anzahl > 1 && <span className="menu-karte-anzahl">×{anzahl}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Erst da, wenn es etwas gibt (Spieltest 4: ein leerer Platzhalter mehr). */}
            {equipment.length > 0 && (
              <>
                <Kopf titel={`Ausruestung · ${equipment.length}`} hilfe="Ausruestung ist ein eigener Kartenbereich fuer den Helden." />
                <ul className="menu-kartenraster">
                  {kartenStapel(equipment).map(({ karte, anzahl }) => (
                    <li key={karte.id}>
                      <button className={`menu-karte-kachel sk-kachel selt-${karte.rarity}`} title={karte.text}>
                        <Spielkarte karte={karte} groesse="mini" />
                        {anzahl > 1 && <span className="menu-karte-anzahl">×{anzahl}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

          </>
        )}

        {reiter === 'reich' && mitHeld && (
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

        {reiter === 'reich' && omens.length > 0 && (
          <>
            <Kopf titel="Omen" hilfe="Die Vorzeichen dieser Partie: sie gelten fuer alle, von der ersten bis zur letzten Runde." />
            <OmenListe omens={omens} />
          </>
        )}

        {reiter === 'reich' && (
          <>
            {mitReich && wunderListe.length > 0 && (
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

        {reiter === 'reich' && (
          <>
            {mitHeld && geruechte.length > 0 && (
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

        {reiter === 'reich' && (
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

        {reiter === 'chronik' && (
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
                'Dorf 1, Stadt 2, Hauptstadt 2 und je Ausbaustufe 1 mehr, Siegpunktkarten 1, Ruhmreichster ab 5 Ruhm 2, Handelsstrasse (laengster Weg zwischen zwei eigenen Siedlungen, ab 5 Strassen) 2.'
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

        {reiter === 'chronik' && (
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

        {reiter === 'chronik' && berichte.length > 0 && (
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

        {reiter === 'chronik' && (
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

            <Kopf
              titel="Partie"
              hilfe='Auf einem anderen Geraet: Raumcode eingeben, deinen Platz waehlen, PIN nennen. Hier im Browser steht die Partie auf der Startseite unter "Deine Partien".'
            />
            <div className="menu-box menu-weiter">
              <span>
                Raum <b>{raumcode}</b>
              </span>
              <span>
                PIN <b>{pin ?? '-'}</b>
              </span>
              <span>
                Ziel <b>{zielText(punkte).replace(/^von /, '')}</b>
              </span>
            </div>
            {onVerlassen && (
              <button className="klein menu-verlassen" title="Partie verlassen - sie laeuft weiter, du kannst zurueckkehren" onClick={onVerlassen}>
                Partie verlassen
              </button>
            )}

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
