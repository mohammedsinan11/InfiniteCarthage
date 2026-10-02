/**
 * Die Sippen (core/cards/sippen.ts) auf einen Blick: fuenf Zeichen mit der
 * Zahl genommener Karten und Punkten bis zur naechsten Stufe. Steht in der
 * Kartenwahl - dort faellt die Entscheidung - und beim Kanzler im Menue.
 *
 * Und ein Schild auf jeder angebotenen Karte: welche Familie, und ob sie eine
 * Stufe freischaltet. So wird aus "welche Karte ist besser" die Frage "wohin
 * will ich". PLATZHALTER-Zeichen (ASSETS.md).
 */

import { SIPPEN, SIPPEN_BONI, SIPPEN_STUFEN, SIPPE_NAME, naechsteStufe, sippeVon, wirkendeSippen } from '../../core/cards/sippen';
import type { Sippe, SippenZaehler } from '../../core/cards/sippen';

export const SIPPE_FARBE: Record<Sippe, string> = {
  ernte: '#d9b44a',
  handel: '#5aa0d8',
  bau: '#b0784a',
  krieg: '#c8402f',
  wildnis: '#5aa05a',
};

/** Ein kleines Zeichen je Familie: Aehre, Muenze, Hammer, Schwert, Kompass. */
export function SippenZeichen({ sippe, groesse = 14 }: { sippe: Sippe; groesse?: number }) {
  const f = SIPPE_FARBE[sippe];
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 12 12" aria-hidden shapeRendering="crispEdges">
      {sippe === 'ernte' && <path d="M6 1h1v10H6zM4 3h1v2H4zM8 3h1v2H8zM4 6h1v2H4zM8 6h1v2H8z" fill={f} />}
      {sippe === 'handel' && (
        <>
          <rect x="2" y="2" width="8" height="8" fill={f} />
          <rect x="5" y="4" width="2" height="4" fill="#1b130d" />
        </>
      )}
      {sippe === 'bau' && (
        <>
          <rect x="2" y="2" width="8" height="3" fill={f} />
          <rect x="5" y="5" width="2" height="6" fill="#8a6a45" />
        </>
      )}
      {sippe === 'krieg' && (
        <>
          <rect x="5" y="1" width="2" height="7" fill="#c9ccd6" />
          <rect x="3" y="8" width="6" height="1" fill={f} />
          <rect x="5" y="9" width="2" height="2" fill={f} />
        </>
      )}
      {sippe === 'wildnis' && (
        <>
          <rect x="2" y="2" width="8" height="8" fill="none" stroke={f} strokeWidth="1" />
          <path d="M6 3l1 3-1 3-1-3z" fill={f} />
        </>
      )}
    </svg>
  );
}

function stufenText(s: Sippe): string {
  return SIPPEN_BONI.filter((b) => b.sippe === s)
    .map((b) => `${b.ab}: ${b.name} - ${b.text}`)
    .join('\n');
}

export function SippenLeiste({ sippe, seit }: { sippe: SippenZaehler | undefined; seit?: SippenZaehler }) {
  const wirken = new Set(wirkendeSippen(sippe, seit));
  return (
    <div className="sippen-leiste" title="Nur deine zwei staerksten Familien wirken - die anderen ruhen, bis sie eine davon ueberholen.">
      {SIPPEN.map((s) => {
        const n = sippe?.[s] ?? 0;
        const naechste = naechsteStufe(sippe, s);
        const stufe = SIPPEN_STUFEN.filter((ab) => n >= ab).length;
        const wirkt = wirken.has(s);
        const ruht = stufe > 0 && !wirkt;
        return (
          <span
            key={s}
            className={['sippe-chip', wirkt ? 'erreicht' : '', ruht ? 'ruht' : ''].filter(Boolean).join(' ')}
            style={{ borderColor: wirkt ? SIPPE_FARBE[s] : undefined }}
            title={`${SIPPE_NAME[s]}: ${n} ${n === 1 ? 'Karte' : 'Karten'}${ruht ? ' - ruht (nur die zwei staerksten Familien wirken)' : ''}${naechste ? ` - noch ${naechste.fehlt} bis ${naechste.bonus.name}` : ' - alle Stufen erreicht'}\n${stufenText(s)}`}
          >
            <SippenZeichen sippe={s} />
            <b>{n}</b>
            <span className="sippe-pips" aria-hidden>
              {SIPPEN_STUFEN.map((ab) => (
                <i key={ab} className={n >= ab ? 'an' : ''} style={n >= ab ? { background: SIPPE_FARBE[s] } : undefined} />
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Das Schild auf einer angebotenen Karte: Familie und ob sie eine Stufe bringt. */
export function SippenSchild({ card, sippe, seit }: { card: string; sippe: SippenZaehler | undefined; seit?: SippenZaehler }) {
  const s = sippeVon(card);
  if (!s) return null;
  const naechste = naechsteStufe(sippe, s);
  // Wirkt die Familie nach dieser Karte? Sonst schaltet sie nichts frei, sie ruht.
  const danach = { ...(sippe ?? {}), [s]: (sippe?.[s] ?? 0) + 1 };
  const nachSeit = { ...(seit ?? {}), [s]: Infinity };
  const wirktDann = wirkendeSippen(danach, nachSeit).includes(s);
  const schaltetFrei = naechste !== null && naechste.fehlt === 1 && wirktDann;
  return (
    <span
      className={schaltetFrei ? 'sippe-schild frei' : 'sippe-schild'}
      style={{ borderColor: SIPPE_FARBE[s] }}
      // "(ruht)" erklaeren (Spieltest 9): nur die zwei staerksten Familien wirken.
      title={!wirktDann ? 'Ruht: nur deine zwei staerksten Familien wirken. Diese zaehlt mit, wirkt aber erst, wenn sie eine davon ueberholt.' : undefined}
    >
      <SippenZeichen sippe={s} groesse={12} />
      {SIPPE_NAME[s]} {(sippe?.[s] ?? 0) + 1}
      {schaltetFrei ? ` - ${naechste.bonus.name}!` : !wirktDann && (danach[s] ?? 0) >= SIPPEN_STUFEN[0] ? ' (ruht)' : naechste ? ` (noch ${naechste.fehlt - 1})` : ''}
    </span>
  );
}
