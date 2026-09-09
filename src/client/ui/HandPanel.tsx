/** Eigene Handkarten. Fremde Haende gibt es hier nicht - der Server sendet sie nicht. */

import { RESOURCES } from '../../core/types';
import type { Hand } from '../../core/state';
import { resourceName } from '../log';

export function HandPanel({ hand }: { hand: Hand }) {
  const total = RESOURCES.reduce((n, r) => n + hand[r], 0);
  return (
    <div className="hand">
      {RESOURCES.map((r) => (
        <div key={r} className={`card res-${r} ${hand[r] === 0 ? 'empty' : ''}`}>
          <span className="cname">{resourceName(r)}</span>
          <span className="cnum">{hand[r]}</span>
        </div>
      ))}
      <div className="card total">
        <span className="cname">gesamt</span>
        <span className="cnum">{total}</span>
      </div>
    </div>
  );
}
