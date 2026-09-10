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
  SEASON_NAME,
  bigRoundOf,
  roundOf,
  roundsLeftInSeason,
  seasonOf,
  yearOf,
} from '../../core/season';
import { cardById } from '../../core/cards/catalog';
import { modifiersOf } from '../../core/cards/effects';
import type { Terrain } from '../../core/types';
import { getVolume, initAudio, setVolume } from '../audio';
import { TRACKS, getMusicMode, setMusicMode } from '../music';
import type { MusicMode } from '../music';

type Reiter = 'reich' | 'karten' | 'technik' | 'auftraege' | 'ton';

const REITER: ReadonlyArray<{ id: Reiter; kurz: string; titel: string }> = [
  { id: 'reich', kurz: 'RE', titel: 'Reich' },
  { id: 'karten', kurz: 'KA', titel: 'Karten' },
  { id: 'technik', kurz: 'TE', titel: 'Technik' },
  { id: 'auftraege', kurz: 'AU', titel: 'Auftraege' },
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

/** Was es noch nicht gibt, sagt das auch. */
function NochNicht({ was }: { was: string }) {
  return <p className="menu-leer">{was} folgt noch.</p>;
}

export function SideMenu({
  turn,
  cards,
  showNumbers,
  onToggleNumbers,
}: {
  turn: number;
  /** Die eigenen genommenen Karten, in der Reihenfolge der Wahl. */
  cards: readonly string[];
  showNumbers: boolean;
  onToggleNumbers: () => void;
}) {
  const [offen, setOffen] = useState(true);
  const [reiter, setReiter] = useState<Reiter>('reich');
  const [ton, setTon] = useState(getVolume);
  const [musik, setMusik] = useState<MusicMode>(getMusicMode);

  const saison = seasonOf(turn);

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
          </>
        )}

        {reiter === 'karten' && (
          <>
            <h3>Karten</h3>
            {cards.length === 0 ? (
              <p className="menu-leer">
                Noch keine. Bei einer Sieben findest du welche.
              </p>
            ) : (
              <>
                <ul className="menu-karten">
                  {cards.map((id, i) => {
                    const karte = cardById(id);
                    if (!karte) return null;
                    return (
                      // Dieselbe Karte kann mehrfach vorkommen - der Index
                      // gehoert dazu, sonst kollidieren die Schluessel.
                      <li key={`${id}-${i}`} className={`menu-karte selt-${karte.rarity}`}>
                        <span className="menu-karte-name">{karte.name}</span>
                        <span className="menu-karte-text">{karte.text}</span>
                      </li>
                    );
                  })}
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
            <h3>Auftraege</h3>
            <NochNicht was="Auftraege, Ereignisse und Helden" />
          </>
        )}

        {reiter === 'ton' && (
          <>
            <h3>Ton</h3>
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
          </>
        )}
      </div>
    </aside>
  );
}
