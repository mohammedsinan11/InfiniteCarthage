/**
 * Der erste offene Tipp (client/tipps.ts) als Tafel ueber der Aktionsleiste.
 * Er bleibt, bis man ihn gelesen hat - anders als Meldungen, die von selbst
 * gehen: eine Erklaerung, die verschwindet, bevor man sie liest, erklaert nichts.
 */

import type { Tipp } from '../tipps';

export function TippBox({ tipp, mehr, onGelesen }: { tipp: Tipp; mehr: number; onGelesen: () => void }) {
  return (
    <div className="tipp" role="note">
      <div className="tipp-kopf">
        <span className="tipp-marke">Tipp</span>
        <b>{tipp.titel}</b>
        {mehr > 0 && <span className="tipp-mehr">+{mehr}</span>}
      </div>
      <p>{tipp.text}</p>
      <button className="primary" onClick={onGelesen}>
        Verstanden
      </button>
    </div>
  );
}
