/**
 * Die Omen einer Partie (core/omen.ts) als kleine Tafeln: Name, Segen oder
 * Fluch, ein Satz Wirkung. Dieselbe Anzeige in Lobby, Startseite und Spiel -
 * ein Omen soll ueberall gleich aussehen, damit man es wiedererkennt.
 */

import { omenById } from '../../core/omen';

export function OmenListe({ omens, knapp = false }: { omens: readonly string[]; knapp?: boolean }) {
  if (omens.length === 0) {
    return <p className="note">Keine Omen - die Partie spielt nach den gewohnten Regeln.</p>;
  }
  return (
    <ul className={knapp ? 'omen-liste knapp' : 'omen-liste'}>
      {omens.map((id) => {
        const o = omenById(id);
        if (!o) return null;
        return (
          <li key={id} className={`omen ${o.art}`} title={o.text}>
            <span className="omen-kopf">
              <span className="omen-art">{o.art === 'segen' ? 'Segen' : 'Fluch'}</span>
              <span className="omen-name">{o.name}</span>
            </span>
            {!knapp && <span className="omen-text">{o.text}</span>}
          </li>
        );
      })}
    </ul>
  );
}
