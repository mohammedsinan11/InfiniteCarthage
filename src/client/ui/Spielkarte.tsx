/**
 * Eine Spielkarte als Sammelkarte: Rahmen, Kopf, Bildfenster, Band, Text, Fuss.
 *
 * Aufbau (von oben):
 *
 *   Kopf      Sippenwappen links, Name, bei Schluesselkarten die Krone
 *   Fenster   das Bild (ui/KartenBild.tsx); seine Form sagt die Kartenart -
 *             Reich eckig, Taktik mit abgeschraegten Ecken, Ausruestung und
 *             Krone mit gestuftem Bogen. Oben rechts das Zaehlerfeld fuer
 *             Karten, die sich etwas merken; unten die Seltenheitssteine.
 *   Band      wie die Karte wirkt: Dauer, Sofort, Ausloeser, Wachsend, Regel,
 *             Taktik, Ausruestung, Krone
 *   Text      die Wirkung auf hellem Pergament, Zahlen hervorgehoben
 *   Fuss      Sippe und Seltenheit; "Beute" fuer Karten, die nur als Beute fallen
 *
 * Die Seltenheit faerbt den Rahmen (Eisen, Bronze, Stahl, Amethyst, Gold);
 * legendaer laeuft als Folie um, Schluesselkarten schillern. Die Sippe faerbt
 * Wappen, Fensterkante und Fuss. Alles CSS und SVG, keine Bilddateien.
 *
 * Drei Groessen: gross (Kartenwahl; auf dem Handy schmaler per CSS), mini
 * (Raster im Menue: nur Fenster und Name). PLATZHALTER (ASSETS.md): ein
 * gezeichneter Rahmen je Seltenheit kann die CSS-Rahmen ersetzen.
 */

import type { CSSProperties, ReactNode } from 'react';
import { SIPPE_NAME } from '../../core/cards/sippen';
import { RARITY_ORDER } from '../../core/cards/types';
import type { Card, Rarity } from '../../core/cards/types';
import { ART_NAME, KartenBild, SIPPE_PIX, kartenArt } from './KartenBild';
import { KRONE, Px, STRICHE, WAPPEN } from './KartenPixel';

export const SELTENHEIT_NAME: Record<Rarity, string> = {
  gewoehnlich: 'gewoehnlich',
  ungewoehnlich: 'ungewoehnlich',
  selten: 'selten',
  episch: 'episch',
  legendaer: 'legendaer',
};

/** Zahlen im Kartentext hervorheben - "+1", "3", "2:1" fallen beim Ueberfliegen auf. */
function textMitZahlen(text: string): ReactNode[] {
  const teile = text.split(/([+\-−]?\d+(?::\d+)?)/);
  return teile.map((t, i) => (i % 2 === 1 ? <b key={i}>{t}</b> : t));
}

/**
 * Weiche Trennstriche fuer lange Woerter - grob nach deutscher Art: vor dem
 * letzten Mitlaut vor einem Selbstlaut ("Holz-fael-ler-la-ger"), ch, ck und
 * sch bleiben beisammen. Der Browser trennt deutsche Woerter nicht ueberall
 * selbst, und eine Menuekachel ist nur 50 Pixel breit.
 */
export function silben(text: string): string {
  const vokal = (c: string | undefined) => !!c && /[aeiouyAEIOUY]/.test(c);
  return text
    .split(' ')
    .map((wort) => {
      if (wort.length < 6) return wort;
      let out = '';
      for (let i = 0; i < wort.length; i++) {
        const c = wort[i]!;
        const vor = wort[i - 1];
        const nach = wort[i + 1];
        const imVerbund = /^(ch|ck|ph|th)$/i.test(`${vor}${c}`) || /^sc$/i.test(`${wort[i - 2]}${vor}`);
        // Mitlaut vor Selbstlaut: davor trennen ("Wan-de-rer") - nicht in bl, tr ...
        const vorSilbe = !vokal(c) && vokal(nach) && (vokal(vor) || vor === c || !/[lr]/i.test(c));
        // Mitlaut mit l oder r vor Selbstlaut: die ganze Gruppe beginnt die Silbe ("Han-dels-flot-te").
        const vorGruppe = /[bdfgkpt]/i.test(c) && /[lr]/i.test(nach ?? '') && !/^[dt]l$/i.test(`${c}${nach}`) && vokal(wort[i + 2]);
        if (i >= 3 && wort.length - i >= 2 && (vorSilbe || vorGruppe) && !imVerbund && !out.endsWith('\u00ad')) {
          out += '\u00ad';
        }
        out += c;
      }
      return out;
    })
    .join(' ');
}

export function Wappen({ karte, groesse = 18 }: { karte: Card; groesse?: number }) {
  const { sippe } = kartenArt(karte);
  if (!sippe) {
    return (
      <svg width={groesse} height={groesse} viewBox="0 0 9 10" shapeRendering="crispEdges" aria-hidden>
        <rect x={3} y={3} width={3} height={3} fill="#a8937a" />
      </svg>
    );
  }
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 9 10" shapeRendering="crispEdges" aria-hidden>
      <Px karte={WAPPEN[sippe]} farbe={SIPPE_PIX[sippe]} />
    </svg>
  );
}

export function Spielkarte({
  karte,
  groesse = 'gross',
  zaehler,
  className,
}: {
  karte: Card;
  groesse?: 'gross' | 'mini';
  /**
   * Stand des Zaehlers einer wachsenden Karte (ENGINE_KARTEN.md, Player.zaehler).
   * Fehlt er, bleibt das Feld sichtbar, aber leer.
   */
  zaehler?: number;
  className?: string;
}) {
  const art = kartenArt(karte);
  const sippe = art.sippe;
  const stufe = RARITY_ORDER.indexOf(karte.rarity);
  const stil = {
    '--sippe': sippe ? SIPPE_PIX[sippe].F : '#a8937a',
    '--sippe-dunkel': sippe ? SIPPE_PIX[sippe].f : '#5c452e',
  } as CSSProperties;
  const klassen = [
    'sk',
    `sk-${groesse}`,
    `sk-selt-${karte.rarity}`,
    `sk-art-${art.art}`,
    art.schluessel ? 'sk-schluessel' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const mini = groesse === 'mini';

  return (
    <div className={klassen} style={stil}>
      {!mini && (
        <div className="sk-kopf">
          <span className="sk-wappen">
            <Wappen karte={karte} groesse={16} />
          </span>
          <span className="sk-name">{karte.name}</span>
          {art.schluessel && (
            <span className="sk-krone" aria-hidden>
              <svg width={22} height={12} viewBox="0 0 11 6" shapeRendering="crispEdges">
                <Px karte={KRONE} />
              </svg>
            </span>
          )}
        </div>
      )}
      <div className="sk-fenster">
        <div className="sk-bild">
          <KartenBild karte={karte} />
          {stufe >= 4 && <span className="sk-folie" aria-hidden />}
        </div>
        {mini && (
          <span className="sk-wappen sk-wappen-klein">
            <Wappen karte={karte} groesse={10} />
          </span>
        )}
        {art.zaehler && (
          <span className="sk-zaehler" title={zaehler === undefined ? 'Zaehler - waechst im Lauf der Partie' : `Zaehler: ${zaehler}`}>
            <svg width={11} height={9} viewBox="0 0 9 7" shapeRendering="crispEdges" aria-hidden>
              <Px karte={STRICHE} />
            </svg>
            {zaehler !== undefined && <b>{zaehler}</b>}
          </span>
        )}
        {!mini && (
          <span className="sk-steine" aria-label={SELTENHEIT_NAME[karte.rarity]}>
            {RARITY_ORDER.map((r, i) => (
              <i key={r} className={i <= stufe ? 'an' : ''} />
            ))}
          </span>
        )}
      </div>
      {mini ? (
        <span className="sk-mini-name">{silben(karte.name)}</span>
      ) : (
        <>
          <span className="sk-band">
            <span>{ART_NAME[art.art]}</span>
          </span>
          <p className="sk-text">{textMitZahlen(karte.text)}</p>
          <span className="sk-fuss">
            <span className="sk-sippe">{sippe ? SIPPE_NAME[sippe] : 'ohne Sippe'}</span>
            {karte.nurBeute && <span className="sk-beute">Beute</span>}
            <span className="sk-selt">{SELTENHEIT_NAME[karte.rarity]}</span>
          </span>
        </>
      )}
    </div>
  );
}
