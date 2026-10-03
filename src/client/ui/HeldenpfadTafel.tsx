/**
 * Der Heldenpfad im Bild (core/heldenpfad.ts): die Wahl des naechsten Ziels -
 * wie die Wegkarte von Slay the Spire, nur auf der echten Karte - und die
 * Wahl einer Eigenschaft nach einem Aufstieg. PLATZHALTER (ASSETS.md).
 */

import { EIGENSCHAFTEN, HELD_STUFEN_AB, NARBEN_MAX, eigenschaftById, heldStufeVon } from '../../core/heldenpfad';
import type { PfadZiel } from '../../core/heldenpfad';

const ART_NAME = { ruine: 'Ruine', lager: 'Lager', ort: 'Ort', hexe: 'Hexe' } as const;

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
  held = null,
  nacht = false,
  ziele,
  darf,
  onWahl,
  onZeigen,
  onZu,
}: {
  /** Leben des Helden - vor dem Aufbruch sichtbar (Spieltest 13: "er laeuft blind in den Tod"). */
  held?: { leben: number; max: number } | null;
  nacht?: boolean;
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
      {held && (
        <p className={held.leben * 2 <= held.max ? 'pfad-warnung' : 'pfad-leben'}>
          Dein Held: {held.leben} von {held.max} Leben
          {held.leben * 2 <= held.max ? ' - verwundet! Gefahr 2 und 3 koennen ihn toeten. Rasten heilt (Waldkapelle, Erntefest).' : ''}
        </p>
      )}
      {nacht && <p className="pfad-warnung">Es ist Nacht: Schleime ziehen umher - unterwegs droht ein Kampf.</p>}
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

/** Ein Grabspruch je Stufe - aus dem, was der Held erlebt hat. */
const GRABSPRUCH = [
  'Nicht weit gekommen - aber immer voran.',
  'Die Wege von damals tragen noch die Spuren.',
  'An langen Abenden wird man davon erzaehlen.',
  'Die Barden kennen den Namen schon jetzt.',
  'Ein Lied fuer jeden Ort, der gesehen wurde.',
  'Solche kommen nicht wieder.',
];

/**
 * Der Fall des eigenen Helden als Szene (C11, Spieltest 10: "Heldentode sind
 * keine Ereignisse - eine Meldung, eine Logzeile, dann kehrt er zurueck").
 * Jetzt: Name, Grabspruch, was verloren ist, die Narbe, die bleibt.
 */
export function HeldFallSzene({
  name,
  weiblich,
  xp,
  narben,
  relikteVerloren,
  zurueck,
  onZu,
}: {
  name: string;
  weiblich: boolean;
  xp: number;
  narben: number;
  relikteVerloren: number;
  /** Runde der Rueckkehr - null, wenn die Partie vorher endet. */
  zurueck: number | null;
  onZu: () => void;
}) {
  const stufe = heldStufeVon(xp);
  // Nicht jedes Mal derselbe Spruch (Spieltest 13): Stufe und Narben waehlen ihn.
  const spruch = GRABSPRUCH[(stufe + narben * 2) % GRABSPRUCH.length]!;
  const er = weiblich ? 'sie' : 'er';
  return (
    <div className="draft-overlay ereignis-huelle">
      <div className="ereignis held-fall">
        <span className="ereignis-zeit">Stufe {stufe} · {narben === 1 ? 'erste Narbe' : `${narben} Narben`}</span>
        <h2>{name} ist gefallen</h2>
        <p className="ereignis-text held-fall-spruch">„{spruch}“</p>
        <ul className="held-fall-folgen">
          {relikteVerloren > 0 && <li>{relikteVerloren === 1 ? 'Ein Relikt bleibt' : `${relikteVerloren} Relikte bleiben`} auf dem Schlachtfeld zurueck.</li>}
          {narben <= NARBEN_MAX ? (
            <li>Eine Narbe bleibt: ein Leben weniger, aber +1 bei Proben des Mutes.</li>
          ) : (
            <li>Mehr Narben traegt kein Koerper - die alten zaehlen weiter.</li>
          )}
          <li>Erfahrung und Eigenschaften bleiben.</li>
          <li>{zurueck === null ? `In dieser Partie kehrt ${er} nicht mehr zurueck.` : `${weiblich ? 'Sie' : 'Er'} kehrt in Runde ${zurueck} zurueck.`}</li>
        </ul>
        <div className="ereignis-wahlen">
          <button onClick={onZu}>Ehre {weiblich ? 'ihrem' : 'seinem'} Andenken</button>
        </div>
      </div>
    </div>
  );
}
