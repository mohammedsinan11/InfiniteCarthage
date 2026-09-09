/**
 * Handel zwischen Spielern.
 *
 * Drei Zustaende in einer Leiste:
 *   - Spieler am Zug, kein Angebot   -> Angebot zusammenstellen
 *   - Spieler am Zug, Angebot liegt  -> Zusagen sehen und abschliessen
 *   - Mitspieler, Angebot liegt      -> annehmen oder ablehnen
 *
 * Ob eine Zusage moeglich ist, entscheidet nicht diese Datei, sondern
 * hasBundle aus der geteilten Regel-Engine. Der Server prueft beim
 * Abschluss ohnehin erneut - was hier steht, ist eine Vorschau, kein Urteil.
 */

import { useState } from 'react';
import { RESOURCES } from '../../core/types';
import type { Bundle, Resource } from '../../core/types';
import { hasBundle } from '../../core/rules/trade';
import type { Action } from '../../core/rules/reducer';
import type { PublicState } from '../../core/redact';
import type { Hand, PlayerId } from '../../core/state';
import { bundleText, resourceName } from '../log';

type Props = {
  state: PublicState;
  you: PlayerId;
  hand: Hand;
  act: (action: Action) => void;
};

const emptyBundle = (): Bundle => ({});

const size = (b: Bundle): number =>
  RESOURCES.reduce((n, r) => n + (b[r] ?? 0), 0);

export function TradePanel({ state, you, hand, act }: Props) {
  const offer = state.trade;
  const isMine = state.currentPlayer === you;

  if (offer === null) {
    return isMine ? <OfferForm hand={hand} act={act} /> : null;
  }

  return offer.from === you ? (
    <OwnOffer state={state} offer={offer} act={act} />
  ) : (
    <IncomingOffer state={state} offer={offer} hand={hand} you={you} act={act} />
  );
}

// --- Angebot zusammenstellen -----------------------------------------------

function OfferForm({ hand, act }: { hand: Hand; act: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const [give, setGive] = useState<Bundle>(emptyBundle);
  const [want, setWant] = useState<Bundle>(emptyBundle);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}>Handel anbieten</button>
    );
  }

  const reset = () => {
    setGive(emptyBundle());
    setWant(emptyBundle());
  };

  // Dieselben Bedingungen wie canOfferTrade, nur fuer die Knopfsperre.
  const overlap = RESOURCES.some((r) => (give[r] ?? 0) > 0 && (want[r] ?? 0) > 0);
  const ready = size(give) > 0 && size(want) > 0 && !overlap && hasBundle(hand, give);

  return (
    <div className="trade">
      <div className="trade-cols">
        <BundleEditor
          title="Du gibst"
          bundle={give}
          max={(r) => hand[r]}
          onChange={setGive}
        />
        <BundleEditor
          title="Du willst"
          bundle={want}
          max={() => 19}
          onChange={setWant}
        />
      </div>
      {overlap && <p className="note">Derselbe Rohstoff steht auf beiden Seiten.</p>}
      <div className="actions">
        <button
          className="primary"
          disabled={!ready}
          onClick={() => {
            act({ t: 'offerTrade', give, want });
            reset();
            setOpen(false);
          }}
        >
          Anbieten
        </button>
        <button
          className="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function BundleEditor({
  title,
  bundle,
  max,
  onChange,
}: {
  title: string;
  bundle: Bundle;
  max: (r: Resource) => number;
  onChange: (b: Bundle) => void;
}) {
  const set = (r: Resource, n: number) => onChange({ ...bundle, [r]: Math.max(0, n) });
  return (
    <div className="trade-col">
      <strong>{title}</strong>
      {RESOURCES.map((r) => {
        const n = bundle[r] ?? 0;
        return (
          <div key={r} className="drow">
            <span>{resourceName(r)}</span>
            <button disabled={n <= 0} onClick={() => set(r, n - 1)}>
              -
            </button>
            <b>{n}</b>
            <button disabled={n >= max(r)} onClick={() => set(r, n + 1)}>
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}

// --- Eigenes Angebot: Zusagen abwarten -------------------------------------

function OwnOffer({
  state,
  offer,
  act,
}: {
  state: PublicState;
  offer: NonNullable<PublicState['trade']>;
  act: (a: Action) => void;
}) {
  const name = (id: PlayerId) => state.players.find((p) => p.id === id)?.name ?? id;
  const pending = state.order.filter(
    (id) => id !== offer.from && !offer.accepted.includes(id) && !offer.declined.includes(id),
  );

  return (
    <div className="trade">
      <strong>
        Dein Angebot: {bundleText(offer.give)} fuer {bundleText(offer.want)}
      </strong>
      <div className="actions">
        {offer.accepted.length === 0 ? (
          <span className="note">
            {pending.length > 0
              ? `Warten auf ${pending.map(name).join(', ')}...`
              : 'Alle haben abgelehnt.'}
          </span>
        ) : (
          offer.accepted.map((id) => (
            <button key={id} className="primary" onClick={() => act({ t: 'settleTrade', partner: id })}>
              Mit {name(id)} abschliessen
            </button>
          ))
        )}
        {offer.declined.length > 0 && (
          <span className="note">Abgelehnt: {offer.declined.map(name).join(', ')}</span>
        )}
        <button className="ghost" onClick={() => act({ t: 'cancelTrade' })}>
          Zurueckziehen
        </button>
      </div>
    </div>
  );
}

// --- Fremdes Angebot: annehmen oder ablehnen -------------------------------

function IncomingOffer({
  state,
  offer,
  hand,
  you,
  act,
}: {
  state: PublicState;
  offer: NonNullable<PublicState['trade']>;
  hand: Hand;
  you: PlayerId;
  act: (a: Action) => void;
}) {
  const from = state.players.find((p) => p.id === offer.from)?.name ?? 'Jemand';
  const canPay = hasBundle(hand, offer.want);
  const accepted = offer.accepted.includes(you);
  const declined = offer.declined.includes(you);

  return (
    <div className="trade">
      <strong>
        {from} bietet {bundleText(offer.give)} fuer {bundleText(offer.want)}
      </strong>
      <div className="actions">
        <button
          className={accepted ? 'chosen' : 'primary'}
          disabled={!canPay}
          title={canPay ? undefined : 'Du hast nicht, was verlangt wird.'}
          onClick={() => act({ t: 'respondTrade', accept: true })}
        >
          {accepted ? 'Zugesagt' : 'Annehmen'}
        </button>
        <button
          className={declined ? 'chosen' : ''}
          onClick={() => act({ t: 'respondTrade', accept: false })}
        >
          {declined ? 'Abgelehnt' : 'Ablehnen'}
        </button>
        {!canPay && <span className="note">Dir fehlen die verlangten Karten.</span>}
      </div>
    </div>
  );
}
