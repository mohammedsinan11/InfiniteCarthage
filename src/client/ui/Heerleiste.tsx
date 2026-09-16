/**
 * Die Heerleiste: je Schar oder Feld ein Kaertchen am oberen Kartenrand -
 * immer sichtbar, auch bei eingeklapptem Menue. Ein Klick waehlt die Gruppe,
 * oeffnet ihre Befehlstafel und zeigt sie auf der Karte. "untaetig" springt
 * reihum zur naechsten Einheit ohne Auftrag. PLATZHALTER-Gestaltung (ASSETS.md).
 */

import { WERTE } from '../../core/units';
import { gruppenName } from '../heer';
import type { HeerGruppe, HeerStatus } from '../heer';

const STATUS_ZEICHEN: Record<HeerStatus, string> = {
  kaempft: '⚔',
  zieht: '➜',
  erkundet: '?',
  folgt: '↪',
  steht: '·',
};
const STATUS_TEXT: Record<HeerStatus, string> = {
  kaempft: 'kaempft',
  zieht: 'zieht',
  erkundet: 'erkundet',
  folgt: 'folgt dem Helden',
  steht: 'steht',
};

export function Heerleiste({
  gruppen,
  status,
  aktiv,
  onWahl,
  untaetig,
  onUntaetig,
  heldName,
}: {
  gruppen: readonly HeerGruppe[];
  status: (g: HeerGruppe) => HeerStatus;
  /** Wie der eigene Held heisst (core/lore.ts) - sonst steht da nur "Held". */
  heldName?: string;
  /** Schluessel der gewaehlten Gruppe, oder null. */
  aktiv: string | null;
  onWahl: (g: HeerGruppe) => void;
  /** Wie viele Einheiten ohne Auftrag herumstehen. */
  untaetig: number;
  onUntaetig: () => void;
}) {
  if (gruppen.length === 0) return null;
  return (
    <div className="heerleiste">
      {untaetig > 0 && (
        <button className="heer-untaetig" title="Zur naechsten Einheit ohne Auftrag" onClick={onUntaetig}>
          {untaetig} untaetig
        </button>
      )}
      {gruppen.map((g) => {
        const s = status(g);
        const leben = g.einheiten.reduce((n, u) => n + u.leben, 0);
        const max = g.einheiten.reduce((n, u) => n + WERTE[u.kind].leben, 0);
        const zahl = (kind: string) => g.einheiten.filter((u) => u.kind === kind).length;
        const ritter = zahl('ritter');
        const bogen = zahl('bogen');
        return (
          <button
            key={g.key}
            className={['heer-karte', `heer-${s}`, aktiv === g.key ? 'aktiv' : ''].filter(Boolean).join(' ')}
            title={`${gruppenName(g, heldName)} · ${STATUS_TEXT[s]} · Leben ${leben}/${max}`}
            onClick={() => onWahl(g)}
          >
            <span className="heer-kopf">
              <span className="heer-name">{g.schar !== null ? `⚑${g.schar}` : g.einheiten.length > 1 ? 'Verb.' : ''}</span>
              <span className="heer-zeichen">{STATUS_ZEICHEN[s]}</span>
            </span>
            <span className="heer-arten">
              {zahl('held') > 0 && <i className="art-held">H</i>}
              {ritter > 0 && <i className="art-ritter">R{ritter > 1 ? ritter : ''}</i>}
              {bogen > 0 && <i className="art-bogen">B{bogen > 1 ? bogen : ''}</i>}
            </span>
            <span className="heer-leben">
              <span style={{ width: `${max > 0 ? Math.round((leben / max) * 100) : 0}%` }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
