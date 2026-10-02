/**
 * Der Heldenpfad im Bild (core/heldenpfad.ts): die Wahl des naechsten Ziels -
 * wie die Wegkarte von Slay the Spire, nur auf der echten Karte - und die
 * Wahl einer Eigenschaft nach einem Aufstieg. PLATZHALTER (ASSETS.md).
 */

import { EIGENSCHAFTEN, HELD_STUFEN_AB, eigenschaftById, heldStufeVon } from '../../core/heldenpfad';
import type { PfadZiel } from '../../core/heldenpfad';

const ART_NAME = { ruine: 'Ruine', lager: 'Lager', ort: 'Ort' } as const;

function Gefahr({ n }: { n: number }) {
  return (
    <span className="pfad-gefahr" title={`Gefahr ${n} von 3`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? 'an' : ''} />
      ))}
    </span>
  );
}

export function PfadTafel({
  ziele,
  darf,
  onWahl,
  onZeigen,
  onZu,
}: {
  ziele: readonly PfadZiel[];
  darf: boolean;
  onWahl: (i: number | null) => void;
  onZeigen: (q: number, r: number) => void;
  onZu: () => void;
}) {
  return (
    <div className="pfad-tafel" role="dialog" aria-label="Wohin zieht dein Held?">
      <div className="boss-kopf">
        <span className="boss-akt">Heldenpfad</span>
        <button className="dock-zu" title="Spaeter" onClick={onZu}>
          x
        </button>
      </div>
      <h3>Wohin zieht dein Held?</h3>
      <ul className="pfad-liste">
        {ziele.map((z, i) => (
          <li key={i} className={`pfad-${z.art}`}>
            <span className="pfad-kopf">
              <b>{z.name}</b>
              <Gefahr n={z.gefahr} />
            </span>
            <span className="pfad-lohn">
              {ART_NAME[z.art]} · Lohn: {z.lohn}
            </span>
            <span className="pfad-knoepfe">
              <button className="klein" onClick={() => onZeigen(z.q, z.r)}>
                Zeigen
              </button>
              <button className="klein primary" disabled={!darf} title={darf ? undefined : 'In deinem Zug'} onClick={() => onWahl(i)}>
                Aufbrechen
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button className="klein" disabled={!darf} onClick={() => onWahl(null)}>
        Keines - der Held bleibt
      </button>
    </div>
  );
}

export function EigenschaftWahl({ angebot, xp, onWahl }: { angebot: readonly string[]; xp: number; onWahl: (id: string) => void }) {
  const stufe = heldStufeVon(xp);
  return (
    <div className="draft-overlay ereignis-huelle">
      <div className="ereignis eigenschaft-wahl">
        <span className="ereignis-zeit">Dein Held · Stufe {stufe}</span>
        <h2>Ein neuer Zug im Wesen</h2>
        <p className="ereignis-text">Was er erlebt hat, hat ihn geformt. Waehle eine Eigenschaft.</p>
        <div className="ereignis-wahlen">
          {angebot.map((id) => {
            const e = eigenschaftById(id);
            return (
              <button key={id} onClick={() => onWahl(id)}>
                <b>{e?.name ?? id}</b> {e?.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Die Zeile im Menue: Stufe, Erfahrung bis zur naechsten, Eigenschaften. */
export function HeldZeile({ xp, eigenschaften }: { xp: number; eigenschaften: readonly string[] }) {
  const stufe = heldStufeVon(xp);
  const naechste = HELD_STUFEN_AB[stufe];
  return (
    <div className="menu-box held-zeile">
      <span>
        Stufe <b>{stufe}</b> · Erfahrung {xp}
        {naechste !== undefined ? ` / ${naechste}` : ''}
      </span>
      <span className="held-eigenschaften">
        {eigenschaften.length === 0
          ? 'Noch keine Eigenschaften - Begegnungen bringen Erfahrung.'
          : eigenschaften.map((id) => EIGENSCHAFTEN.find((e) => e.id === id)?.name ?? id).join(' · ')}
      </span>
    </div>
  );
}
