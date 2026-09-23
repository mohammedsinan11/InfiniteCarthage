/**
 * Die Kartenwahl.
 *
 * Drei Karten, eine wird genommen, zwei verschwinden - wie im Roguelike. Das
 * Overlay verdeckt das Brett mit Absicht: die Wahl ist der Moment, und sie
 * soll sich als solcher anfuehlen.
 *
 * Kein Abbrechen. Wer nicht waehlt, blockiert die Runde, und eine Wahl ohne
 * Folgen waere keine.
 *
 * EFFEKTE SIND PLATZHALTER. Austeilen, Neigen unter dem Zeiger, Glanz je
 * Seltenheit, Funken, Strahlen, Aufblitzen und Zerfallen - alles CSS, damit
 * sich die Wahl nach etwas anfuehlt, solange es keine gezeichneten Karten
 * gibt. Was davon spaeter als echte Grafik gebraucht wird, steht in ASSETS.md.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { cardById } from '../../core/cards/catalog';
import type { DraftSource, Rarity } from '../../core/cards/types';
import { RESOURCES } from '../../core/types';
import type { Bundle, Resource } from '../../core/types';
import { playCardDeal, playCardHover, playCardPick, playCardVanish } from '../audio';
import { resourceName } from '../log';
import { KartenBild } from './KartenBild';

const RARITY_NAME: Record<Rarity, string> = {
  gewoehnlich: 'gewoehnlich',
  ungewoehnlich: 'ungewoehnlich',
  selten: 'selten',
  episch: 'episch',
  legendaer: 'legendaer',
};

/** Ueberschrift je Herkunft - ein Fund faellt vom Himmel, Beute ist verdient. */
const TITEL: Record<DraftSource, string> = { fund: 'Ein Fund', belohnung: 'Beute', markt: 'Markt' };

const STUFEN: readonly Rarity[] = ['gewoehnlich', 'ungewoehnlich', 'selten', 'episch', 'legendaer'];

/** Wie lange die Wahl stehen bleibt, bevor sie an den Server geht - Zeit fuer den Effekt. */
const NACHKLANG_MS = 950;

/** Neigung unter dem Zeiger, in Grad. Mehr wirkt wie ein Wackelbild. */
const NEIGUNG = 9;

function neigen(e: ReactPointerEvent<HTMLButtonElement>): void {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.setProperty('--ry', `${(x * NEIGUNG * 2).toFixed(2)}deg`);
  el.style.setProperty('--rx', `${(-y * NEIGUNG * 2).toFixed(2)}deg`);
  el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
  el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
}

function aufrichten(e: ReactPointerEvent<HTMLButtonElement>): void {
  e.currentTarget.style.setProperty('--rx', '0deg');
  e.currentTarget.style.setProperty('--ry', '0deg');
}

export function CardDraft({
  options,
  source,
  darfWaehlen,
  onChoose,
}: {
  options: string[];
  /** Woher die Wahl kommt - bestimmt die Ueberschrift. */
  source?: DraftSource;
  /** Nur der Spieler am Zug waehlt - die anderen sehen zu. */
  darfWaehlen: boolean;
  onChoose: (card: string, resources?: Bundle) => void;
}) {
  const [genommen, setGenommen] = useState<string | null>(null);
  const [waehltRohstoffe, setWaehltRohstoffe] = useState<string | null>(null);
  const [rohstoffe, setRohstoffe] = useState<Bundle>({});

  useEffect(() => {
    playCardDeal();
  }, []);

  return (
    <div className="draft-overlay">
      <h2 className="draft-titel">{TITEL[source ?? 'fund']}</h2>
      {/* Ein Fund kommt nur von der 7 - das steht hier noch einmal, falls man
          die Wuerfel weggeklickt hat. */}
      {(source ?? 'fund') === 'fund' && <span className="draft-sieben">7 gewuerfelt</span>}
      <p className="draft-sub">
        {darfWaehlen
          ? 'Waehle eine Karte. Die anderen beiden verfallen.'
          : 'Der Spieler am Zug waehlt.'}
      </p>

      <div className="draft-karten">
        {options.map((id, i) => {
          const karte = cardById(id);
          if (!karte) return null;
          const stufe = STUFEN.indexOf(karte.rarity);
          const gewaehlt = genommen === id;
          const verworfen = genommen !== null && !gewaehlt;
          const beliebig = karte.instant?.t === 'gainAny' ? karte.instant.count : 0;
          const gewaehltRohstoffe = waehltRohstoffe === id;
          const summe = RESOURCES.reduce((n, r) => n + (rohstoffe[r] ?? 0), 0);
          const nehmen = (resources?: Bundle) => {
            if (genommen !== null) return;
            setGenommen(id);
            playCardPick(stufe);
            window.setTimeout(playCardVanish, 180);
            window.setTimeout(() => onChoose(id, resources), NACHKLANG_MS);
          };
          return (
            <div
              key={id}
              className={verworfen ? 'draft-platz verworfen' : 'draft-platz'}
              style={{ '--i': i } as CSSProperties}
            >
              {stufe >= 4 && <span className="draft-strahlen" aria-hidden />}
              <button
                className={[
                  'draft-karte',
                  `selt-${karte.rarity}`,
                  gewaehlt ? 'gewaehlt' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={!darfWaehlen || genommen !== null}
                onPointerEnter={() => {
                  if (darfWaehlen && genommen === null) playCardHover();
                }}
                onPointerMove={(e) => {
                  if (genommen === null) neigen(e);
                }}
                onPointerLeave={aufrichten}
                onClick={() => {
                  if (beliebig > 0) {
                    setWaehltRohstoffe(id);
                    setRohstoffe({});
                  } else nehmen();
                }}
              >
                <span className="draft-glanz" aria-hidden />
                <span className="draft-selt">{RARITY_NAME[karte.rarity]}</span>
                <span className="draft-name">{karte.name}</span>
                <KartenBild karte={karte} />
                <span className="draft-text">{karte.text}</span>
              </button>
              {gewaehltRohstoffe && genommen === null && (
                <div className="draft-rohstoffwahl">
                  <strong>Noch {beliebig - summe} waehlen</strong>
                  <div className="draft-rohstoffknopfe">
                    {RESOURCES.map((r: Resource) => (
                      <span key={r} className="draft-rohstoff">
                        <button
                          type="button"
                          disabled={summe >= beliebig}
                          onClick={() => setRohstoffe((alt) => ({ ...alt, [r]: (alt[r] ?? 0) + 1 }))}
                        >
                          + {resourceName(r)}
                        </button>
                        <b>{rohstoffe[r] ?? 0}</b>
                        <button
                          type="button"
                          disabled={(rohstoffe[r] ?? 0) === 0}
                          onClick={() => setRohstoffe((alt) => ({ ...alt, [r]: (alt[r] ?? 0) - 1 }))}
                        >
                          −
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="primary draft-rohstoff-nehmen"
                    disabled={summe !== beliebig}
                    onClick={() => nehmen(rohstoffe)}
                  >
                    Karte nehmen
                  </button>
                </div>
              )}
              {stufe >= 3 && (
                <span className={stufe === 3 ? 'draft-funken episch' : 'draft-funken'} aria-hidden>
                  {Array.from({ length: 10 }, (_, k) => (
                    <i key={k} style={{ '--k': k } as CSSProperties} />
                  ))}
                </span>
              )}
              {gewaehlt && <span className="draft-blitz" aria-hidden />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
