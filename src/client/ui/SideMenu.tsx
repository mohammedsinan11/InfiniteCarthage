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
import { getVolume, initAudio, setVolume } from '../audio';
import { TRACKS, getMusicMode, setMusicMode } from '../music';
import type { MusicMode } from '../music';

type Reiter = 'reich' | 'technik' | 'auftraege' | 'ton';

const REITER: ReadonlyArray<{ id: Reiter; kurz: string; titel: string }> = [
  { id: 'reich', kurz: 'RE', titel: 'Reich' },
  { id: 'technik', kurz: 'TE', titel: 'Technik' },
  { id: 'auftraege', kurz: 'AU', titel: 'Auftraege' },
  { id: 'ton', kurz: 'TO', titel: 'Ton' },
];

/** Was es noch nicht gibt, sagt das auch. */
function NochNicht({ was }: { was: string }) {
  return <p className="menu-leer">{was} folgt noch.</p>;
}

export function SideMenu({
  turn,
  showNumbers,
  onToggleNumbers,
}: {
  turn: number;
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
