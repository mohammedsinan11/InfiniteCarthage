/** Mitspieler mit sichtbaren Punkten, Kartenzahl und Rittern. */

import type { PublicState } from '../../core/redact';
import { playerColor } from '../theme';

export function PlayerList({ state, you }: { state: PublicState; you: string | null }) {
  return (
    <ul className="players">
      {state.order.map((id) => {
        const p = state.players.find((x) => x.id === id);
        if (!p) return null;
        const active = state.currentPlayer === id;
        return (
          <li key={id} className={active ? 'active' : ''}>
            <span className="dot" style={{ background: playerColor(p.color) }} />
            <span className="pname">
              {p.name}
              {p.id === you && <em> du</em>}
              {!p.connected && <em className="off"> offline</em>}
            </span>
            <span className="stats">
              <b title="Sichtbare Siegpunkte">{p.id === you ? state.myPoints : p.points}</b>
              <span title="Handkarten">{p.handCount} K</span>
              <span title="Entwicklungskarten">{p.devCount} E</span>
              <span title="Gespielte Ritter">
                {p.playedKnights} R{state.largestArmy === id ? '+' : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
