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
import { GESTALTEN } from '../lore';
import { Rng } from '../rng';
import { ersteAktiveReichskarten } from '../cards/loadout';

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
  // Die Gestalt kam nach dem Namen dazu. Wer seinen Helden schon hat, bekommt
  // sie hier nachgereicht - sonst bliebe er fuer immer die Standardfigur.
  for (const p of state.players) {
    if (!p.held || p.held.gestalt !== undefined) continue;
    const rng = new Rng(state.rngState);
    p.held.gestalt = rng.int(GESTALTEN);
    state.rngState = rng.getState();
  }
  // Das Inventar kam mit den Schleimen dazu (DESIGN.md, Inventar).
  for (const p of state.players) if (!p.inventar) p.inventar = {};
  // Feste kamen mit dem Lagerleben dazu (DESIGN.md, Lagerleben).
  if (!state.feste) state.feste = {};
  // Reichsbauten kamen mit Phase 2 dazu (DESIGN.md, Phase 2).
  if (!state.reichsbauten) state.reichsbauten = {};
  // Der ernannte Held kam danach dazu. Wer schon spielt, hat noch keinen und
  // darf ihn nachholen, sobald sein Koenigssitz steht (rules/zweig.ts).
  for (const p of state.players) if (p.ernannt === undefined) p.ernannt = null;
  // Die Kartensammlung wurde in Reich, Taktik und Ausruestung getrennt. Alte
  // Dauerwirkungen fuellen die neuen Plaetze in ihrer bisherigen Reihenfolge.
  for (const p of state.players) {
    if (!p.activeCards) p.activeCards = ersteAktiveReichskarten(state, p);
    if (!p.tactics) p.tactics = [];
    if (!p.equipment) p.equipment = [];
    if (p.ruhm === undefined) p.ruhm = 0;
  }
  if (!state.tacticBuffs) state.tacticBuffs = [];
  if (state.ruhmreichster === undefined) {
    // Den alten Zwei-Punkte-Titel erhalten, ohne alle ausgespielten Ritter
    // nachtraeglich zu Ruhmestaten umzudeuten.
    const alt = state.largestArmy ?? null;
    state.ruhmreichster = alt;
    const traeger = state.players.find((p) => p.id === alt);
    if (traeger) traeger.ruhm = Math.max(5, traeger.ruhm);
  }
  // Siege und Stufe kamen mit dem Levelsystem dazu: wer schon auf der Karte
  // steht, faengt bei null an (DESIGN.md, Stufen).
  for (const u of state.units) {
    if (u.siege === undefined) u.siege = 0;
    if (u.stufe === undefined) u.stufe = 0;
  }
  return state;
}
