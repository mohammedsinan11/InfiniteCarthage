/**
 * Erste Schritte: sechs kleine Ziele fuer die erste Partie.
 *
 * Wer neu ist, weiss nach dem Aufbau nicht, was er als Naechstes tun soll -
 * die Leiste unten hat zwoelf Knoepfe, das Menue vier Reiter. Diese Liste
 * nennt die Grundbewegungen der Reihe nach: Strasse, Dorf, Stadt, Karte,
 * Held, Handel. Jedes Ziel hakt sich selbst ab, sobald es im Spielstand
 * steht - man muss nichts melden.
 *
 * Sind alle erreicht oder wird die Liste geschlossen, bleibt sie in diesem
 * Browser fuer immer weg. Erfahrene Spieler sehen sie nach einem Klick nie
 * wieder.
 */

import { useState } from 'react';
import type { PublicState } from '../../core/redact';

const SPEICHER = 'infinitecarthage.erste-schritte';

type Ziel = { text: string; erreicht: boolean };

export function ersteSchritteZiele(state: PublicState, you: string): Ziel[] {
  const me = state.players.find((p) => p.id === you);
  const bauten = Object.values(state.buildings).filter((b) => b.owner === you);
  const strassen = Object.values(state.roads).filter((o) => o === you).length;
  const stats = state.chronik?.stats[you];
  const held = state.units.find((u) => u.owner === you && u.kind === 'held');
  return [
    { text: 'Baue eine Strasse (Holz + Lehm)', erreicht: strassen > 2 },
    { text: 'Baue ein drittes Dorf an deiner Strasse', erreicht: bauten.length >= 3 },
    { text: 'Werte ein Dorf zur Stadt auf (2 Getreide + 3 Erz)', erreicht: bauten.some((b) => b.type === 'city') },
    {
      text: 'Nimm eine Karte - bei einer 7 oder mit Beute',
      erreicht: (me?.cards.length ?? 0) + (me?.equipment.length ?? 0) + (me?.tacticCount ?? 0) > 0,
    },
    {
      text: 'Schicke deinen Helden auf Erkundung (oben links anklicken)',
      erreicht: (held !== undefined && (held.auftrag === 'erkunden' || held.ziel !== null)) || (stats?.ruinen ?? 0) > 0,
    },
    { text: 'Tausche mit der Bank (Pfeile unten links)', erreicht: (stats?.handel ?? 0) > 0 },
  ];
}

function istAus(): boolean {
  try {
    return localStorage.getItem(SPEICHER) === 'aus';
  } catch {
    return false;
  }
}

function merkeAus(): void {
  try {
    localStorage.setItem(SPEICHER, 'aus');
  } catch {
    // Privater Modus - dann eben beim naechsten Mal wieder.
  }
}

export function ErsteSchritte({ state, you }: { state: PublicState; you: string }) {
  const [aus, setAus] = useState(istAus);
  const [zu, setZu] = useState(false);
  if (aus) return null;
  const ziele = ersteSchritteZiele(state, you);
  const erreicht = ziele.filter((z) => z.erreicht).length;
  if (erreicht === ziele.length) {
    merkeAus();
    return null;
  }
  return (
    <div className="erste-schritte">
      <button className="es-kopf" onClick={() => setZu((v) => !v)} title={zu ? 'Aufklappen' : 'Zuklappen'}>
        Erste Schritte <span className="es-zahl">{erreicht}/{ziele.length}</span>
      </button>
      {!zu && (
        <>
          <ol>
            {ziele.map((z) => (
              <li key={z.text} className={z.erreicht ? 'erreicht' : ''}>
                {z.erreicht ? '✓ ' : ''}
                {z.text}
              </li>
            ))}
          </ol>
          <button
            className="es-weg"
            onClick={() => {
              merkeAus();
              setAus(true);
            }}
          >
            Kenne ich schon - ausblenden
          </button>
        </>
      )}
    </div>
  );
}
