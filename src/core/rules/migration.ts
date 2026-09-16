/**
 * Alte Spielstaende auf den heutigen Zustand bringen.
 *
 * Gedacht fuer Aenderungen, die sich ohne Verlust nachtragen lassen - dann
 * muss eine laufende Partie nicht weggeworfen werden. Wo das nicht geht,
 * bleibt der harte Weg ueber SCHEMA_VERSION (worker/room.ts).
 *
 * Aufgerufen beim Laden im Durable Object, einmal je Partie. Die Funktion
 * aendert den Zustand an Ort und Stelle und ist mehrfach aufrufbar, ohne dass
 * sich etwas doppelt.
 */

import type { GameState } from '../state';

export function migriereStand(state: GameState): GameState {
  // Wachtuerme standen frueher neben einem Haus (Building.turm), heute stehen
  // sie fuer sich (state.tuerme). Sie bleiben auf ihrer Ecke stehen.
  if (!state.tuerme) state.tuerme = {};
  for (const [vk, b] of Object.entries(state.buildings)) {
    if (!b.turm) continue;
    if (state.tuerme[vk] === undefined) state.tuerme[vk] = { owner: b.owner, stufe: 1 };
    delete b.turm;
  }
  // Der Held hiess frueher nur "Held" (core/lore.ts). Den Namen bekommt er in
  // der naechsten Runde (rules/army.ts, heldenRunde) - hier fehlt nur das Feld.
  for (const p of state.players) if (p.held === undefined) p.held = null;
  return state;
}
