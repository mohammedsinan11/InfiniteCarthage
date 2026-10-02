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
 * Die Karte selbst ist eine Sammelkarte (ui/Spielkarte.tsx): Rahmen nach
 * Seltenheit, Wappen nach Sippe, Bild aus der Wirkung. Sippe und Hinweise zur
 * Wahl stehen darunter, nicht darauf. Auf dem Handy stehen die drei Karten
 * schmal nebeneinander.
 *
 * EFFEKTE SIND PLATZHALTER. Austeilen, Neigen unter dem Zeiger, Glanz je
 * Seltenheit, Funken, Strahlen, Aufblitzen und Zerfallen - alles CSS, damit
 * sich die Wahl nach etwas anfuehlt, solange es keine gezeichneten Karten
 * gibt. Was davon spaeter als echte Grafik gebraucht wird, steht in ASSETS.md.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { cardById } from '../../core/cards/catalog';
import { dauerwirkungen, istEinzigartig, wiederholbar } from '../../core/cards/types';
import type { DraftSource, Rarity } from '../../core/cards/types';
import { playCardDeal, playCardHover, playCardPick, playCardVanish } from '../audio';
import { Spielkarte } from './Spielkarte';
import { SippenLeiste, SippenSchild } from './SippenLeiste';
import type { SippenZaehler } from '../../core/cards/sippen';

/** Ueberschrift je Herkunft - ein Fund faellt vom Himmel, Beute ist verdient. */
const TITEL: Record<DraftSource, string> = { fund: 'Ein Fund', belohnung: 'Beute', markt: 'Markt', gruendung: 'Eine Gruendung', trophaee: 'Trophaee' };

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
  besitz = [],
  aktiv = [],
  plaetze = 0,
  sippe,
  sippeSeit,
  onChoose,
  krone = null,
}: {
  /** Die Schluesselkarte im Kronplatz - eine neue verdraengt sie (bleibt im Besitz). */
  krone?: string | null;
  /** Karten je Familie (core/cards/sippen.ts) - nur mit Ereignissen. */
  sippe?: SippenZaehler;
  sippeSeit?: SippenZaehler;
  options: string[];
  /** Woher die Wahl kommt - bestimmt die Ueberschrift. */
  source?: DraftSource;
  /** Nur der Spieler am Zug waehlt - die anderen sehen zu. */
  darfWaehlen: boolean;
  /** Eigene Reichskarten, aktive Reichskarten und ihre Plaetze - damit sichtbar wird, was eine neue Dauerkarte verdraengt. */
  besitz?: readonly string[];
  aktiv?: readonly string[];
  plaetze?: number;
  onChoose: (card: string, ersetze?: string | null) => void;
}) {
  const [genommen, setGenommen] = useState<string | null>(null);
  /*
   * Wer weicht, wenn eine neue Dauerkarte auf volle Plaetze trifft: von selbst
   * niemand - die neue Karte bleibt im Besitz, bis man bewusst eine aktive
   * waehlt (Spieltest 6: ein schneller Klick ersetzte eine tragende Karte).
   * null heisst: niemand weicht.
   */
  const [wahlErsetze, setWahlErsetze] = useState<string | null>(null);
  const ersetze = wahlErsetze;
  const voll = plaetze > 0 && aktiv.length >= plaetze;
  const bringtNeueDauer = (id: string): boolean => {
    const k = cardById(id);
    // Schluesselkarten gehen in den Kronplatz - sie verdraengen keine Reichskarte.
    return !!k && !k.schluessel && dauerwirkungen(k).length > 0 && !besitz.includes(id);
  };
  const fragtErsetzen = voll && options.some(bringtNeueDauer);
  /*
   * Der Bankrabatt zaehlt nur einmal (cards/effects.ts). Wer schon eine
   * Handelskarte aktiv hat, soll das vor der Wahl wissen - Spieltest: die
   * zweite belegte stumm einen Platz.
   */
  const rabattDa = aktiv.find((a) => dauerwirkungen(cardById(a) ?? {}).some((l) => l.t === 'tradeDiscount'));
  const rabattDoppelt = (id: string): boolean =>
    !!rabattDa && id !== rabattDa && dauerwirkungen(cardById(id) ?? {}).some((l) => l.t === 'tradeDiscount');

  /*
   * Die Wahl erscheint, sobald die Wuerfel weg sind - der zweite Klick, mit
   * dem man die Wuerfel wegklickt, traf sonst eine Karte (Spieltest 10). Erst
   * nach einem Augenblick nimmt sie Klicks an.
   */
  const [scharf, setScharf] = useState(false);
  useEffect(() => {
    playCardDeal();
    const t = window.setTimeout(() => setScharf(true), 450);
    return () => window.clearTimeout(t);
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
      {darfWaehlen && (
        <p className="draft-sub draft-slots" title="Dauerwirkungen gelten nur, solange die Karte einen Platz hat. Tauschen kannst du im Menue unter Reich.">
          Dauerwirkungen: {aktiv.length} von {plaetze} Plaetzen belegt
          {aktiv.length > 0 ? ` (${aktiv.map((id) => cardById(id)?.name ?? id).join(', ')})` : ''}
        </p>
      )}

      {darfWaehlen && sippe !== undefined && <SippenLeiste sippe={sippe} seit={sippeSeit} />}

      <div className={darfWaehlen ? 'draft-karten' : 'draft-karten zuschauen'}>
        {options.map((id, i) => {
          const karte = cardById(id);
          if (!karte) return null;
          const stufe = STUFEN.indexOf(karte.rarity);
          const gewaehlt = genommen === id;
          const verworfen = genommen !== null && !gewaehlt;
          const nehmen = () => {
            if (genommen !== null || !scharf) return;
            setGenommen(id);
            playCardPick(stufe);
            window.setTimeout(playCardVanish, 180);
            const mit = voll && bringtNeueDauer(id) ? ersetze : undefined;
            window.setTimeout(() => onChoose(id, mit), NACHKLANG_MS);
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
                  'sk-huelle',
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
                onClick={nehmen}
              >
                <span className="draft-glanz" aria-hidden />
                <Spielkarte karte={karte} />
              </button>
              {/* Unter der Karte, nicht darauf: Sippe und Hinweise zur Wahl. */}
              {sippe !== undefined && <SippenSchild card={id} sippe={sippe} seit={sippeSeit} />}
              {istEinzigartig(karte) && besitz.includes(id) && wiederholbar(karte) && (
                <span className="draft-nochmal">Schon im Besitz - nur die Sofortwirkung</span>
              )}
              {rabattDoppelt(id) && (
                <span className="draft-nochmal draft-verdraengt">
                  Bankrabatt zaehlt nur einmal - {cardById(rabattDa!)?.name} gibt ihn schon
                </span>
              )}
              {/* Eine neue Schluesselkarte nimmt den Kronplatz (Spieltest 8: geschah ohne Hinweis). */}
              {karte.schluessel && krone && krone !== id && (
                <span className="draft-nochmal draft-verdraengt">
                  Ersetzt deine Krone {cardById(krone)?.name ?? ''} - sie bleibt im Besitz, im Menue zurueckholbar
                </span>
              )}
              {voll && bringtNeueDauer(id) && (
                <span className="draft-nochmal draft-verdraengt">
                  {ersetze === null ? 'Kein Platz - bleibt inaktiv' : `Ersetzt ${cardById(ersetze)?.name ?? '?'}`}
                </span>
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
      {fragtErsetzen && darfWaehlen && genommen === null && (
        <div className="draft-plaetze">
          <span>Deine {plaetze} Plaetze sind voll. Eine neue Dauerkarte ersetzt:</span>
          <button
            className={ersetze === null ? 'aktiv' : ''}
            onClick={() => setWahlErsetze(null)}
            title="Die neue Karte bleibt in deinem Besitz, nimmt aber keinen Platz ein - im Menue unter Reich tauschbar."
          >
            keine (nur behalten)
          </button>
          {aktiv.map((id) => (
            <button
              key={id}
              className={ersetze === id ? 'aktiv' : ''}
              onClick={() => setWahlErsetze(id)}
              title={cardById(id)?.text}
            >
              {cardById(id)?.name ?? id}
              {/* Wer eine Vorratskarte ersetzt, haelt sofort weniger (Spieltest 8). */}
              {dauerwirkungen(cardById(id) ?? { lasting: undefined }).some((l) => l.t === 'handLimit' && l.amount > 0) ? ' (Handgrenze sinkt!)' : ''}
              {/* Punktekarten zaehlen nur aktiv (Spieltest 11: ausgetauscht, und zwei Siegpunkte waren still weg). */}
              {dauerwirkungen(cardById(id) ?? { lasting: undefined }).some(
                (l) => l.t === 'punkte' || l.t === 'siegpunkte' || (l.t === 'je' && l.dann.t === 'punkte'),
              )
                ? ' (ihre Siegpunkte gehen mit!)'
                : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
