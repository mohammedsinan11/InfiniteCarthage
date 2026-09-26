/**
 * Vorhaben: ein Ziel fuer die naechste Jahreszeit, selbst gewaehlt.
 *
 * Zwei Spieltests sagten dasselbe: die Laeufe unterscheiden sich vor allem
 * durch den Zufall - Raubzuege, Wuerfel, Karten -, weniger durch eigene
 * Entscheidungen. Ein Vorhaben ist eine solche Entscheidung auf mittlere
 * Sicht: zu Beginn jeder grossen Runde, wenn man keines hat, liegen drei zur
 * Wahl, und man nimmt das, was zur eigenen Lage passt - oder keines. Wer es
 * binnen einer Jahreszeit schafft, bekommt Ruhm oder eine Kartenwahl.
 *
 * Gemessen wird mit den Zahlen der Chronik (core/chronik.ts): was beim
 * Annehmen stand, und was seitdem dazukam. Nur in Partien mit Ereignissen.
 */

import { Rng } from './rng';
import { hash3i } from './hash';
import type { GameState, PlayerId } from './state';
import { totalPoints } from './state';

export type Vorhaben = {
  id: string;
  name: string;
  /** Was zu tun ist. */
  text: string;
  /** Wie viel dazukommen muss. */
  n: number;
  lohn: { ruhm?: number; beute?: number };
  /** Der Zaehler, an dem gemessen wird. */
  mass: (s: Messbar, id: PlayerId) => number;
};

type Messbar = Pick<GameState, 'buildings'> & {
  chronik?: GameState['chronik'] | null;
  players: ReadonlyArray<{ id: PlayerId }>;
  ruhmreichster?: GameState['ruhmreichster'];
  hauptstaedte?: GameState['hauptstaedte'];
};

const stat = (k: 'strassen' | 'doerfer' | 'staedte' | 'lager' | 'ruinen' | 'handel' | 'karten' | 'auftraege') =>
  (s: Messbar, id: PlayerId): number => s.chronik?.stats[id]?.[k] ?? 0;

export const VORHABEN: readonly Vorhaben[] = [
  { id: 'wege', name: 'Neue Wege', text: 'Baue 3 Strassen.', n: 3, lohn: { ruhm: 1 }, mass: stat('strassen') },
  { id: 'siedler', name: 'Siedler', text: 'Gruende ein neues Dorf.', n: 1, lohn: { beute: 1 }, mass: stat('doerfer') },
  { id: 'mauern', name: 'Steinerne Mauern', text: 'Werte ein Dorf zur Stadt auf.', n: 1, lohn: { ruhm: 2 }, mass: stat('staedte') },
  { id: 'feldzug', name: 'Feldzug', text: 'Zerstoere ein Lager.', n: 1, lohn: { ruhm: 1, beute: 1 }, mass: stat('lager') },
  { id: 'spurensuche', name: 'Spurensuche', text: 'Erkunde eine Ruine.', n: 1, lohn: { beute: 1 }, mass: stat('ruinen') },
  { id: 'markt', name: 'Marktherr', text: 'Handle 5 Mal.', n: 5, lohn: { ruhm: 2 }, mass: stat('handel') },
  { id: 'sammler', name: 'Kartensammler', text: 'Nimm 2 Karten.', n: 2, lohn: { ruhm: 1 }, mass: stat('karten') },
  { id: 'dienst', name: 'Im Dienst der Wanderer', text: 'Erfuelle einen Auftrag.', n: 1, lohn: { ruhm: 2 }, mass: stat('auftraege') },
  {
    id: 'aufstieg',
    name: 'Aufstieg',
    text: 'Gewinne 2 Siegpunkte dazu.',
    n: 2,
    lohn: { beute: 1 },
    mass: (s, id) => totalPoints(s as GameState, id),
  },
];

export const vorhabenById = (id: string | null | undefined): Vorhaben | undefined => VORHABEN.find((v) => v.id === id);

/** Was ein Spieler gerade vorhat: die Auswahl, das laufende Vorhaben. */
export type VorhabenStand = {
  angebot: string[];
  aktiv: { id: string; start: number; bis: number } | null;
};

/** Wie lange ein Vorhaben gilt: eine Jahreszeit. */
export const VORHABEN_FRIST = 15;

const SALT = 311;

export type VorhabenEvent =
  | { t: 'ambitionOffered'; player: PlayerId; ids: string[] }
  | { t: 'ambitionDone'; player: PlayerId; id: string; ruhm: number; beute: number }
  | { t: 'ambitionFailed'; player: PlayerId; id: string };

type Ereignisse = { push(...e: VorhabenEvent[]): number };

/**
 * Zu Beginn jeder grossen Runde: abgelaufene Vorhaben verfallen, wer keines
 * hat und keine Auswahl offen, bekommt drei neue zur Wahl.
 */
export function vorhabenRunde(s: GameState, events: Ereignisse): void {
  if (!s.ereignisseAn) return;
  const alle = { ...(s.vorhaben ?? {}) };
  s.order.forEach((id, i) => {
    const p = s.players.find((x) => x.id === id);
    if (!p || p.besiegt) return;
    const stand: VorhabenStand = alle[id] ? { ...alle[id]! } : { angebot: [], aktiv: null };
    if (stand.aktiv && stand.aktiv.bis < s.turn) {
      events.push({ t: 'ambitionFailed', player: id, id: stand.aktiv.id });
      stand.aktiv = null;
    }
    if (!stand.aktiv && stand.angebot.length === 0) {
      const rng = new Rng(hash3i(s.secretSeed, s.turn, i, SALT));
      const pool = [...VORHABEN];
      stand.angebot = Array.from({ length: 3 }, () => pool.splice(rng.int(pool.length), 1)[0]!.id);
      events.push({ t: 'ambitionOffered', player: id, ids: stand.angebot });
    }
    alle[id] = stand;
  });
  s.vorhaben = alle;
}

/** Ein Vorhaben aus der Auswahl annehmen - oder mit null die Auswahl verwerfen. Gibt den Grund zurueck, wenn es nicht geht. */
export function vorhabenWaehlen(s: GameState, id: PlayerId, wahl: string | null): string | null {
  const stand = s.vorhaben?.[id];
  if (!stand || stand.angebot.length === 0) return 'Es liegt keine Auswahl vor.';
  if (wahl === null) {
    s.vorhaben = { ...s.vorhaben, [id]: { angebot: [], aktiv: null } };
    return null;
  }
  const v = vorhabenById(wahl);
  if (!v || !stand.angebot.includes(wahl)) return 'Dieses Vorhaben steht nicht zur Wahl.';
  s.vorhaben = { ...s.vorhaben, [id]: { angebot: [], aktiv: { id: wahl, start: v.mass(s, id), bis: s.turn + VORHABEN_FRIST } } };
  return null;
}

/** Wie weit ein laufendes Vorhaben ist: [dazugekommen, noetig]. */
export function vorhabenFortschritt(s: Messbar & { vorhaben?: GameState['vorhaben'] }, id: PlayerId): [number, number] | null {
  const a = s.vorhaben?.[id]?.aktiv;
  const v = a ? vorhabenById(a.id) : undefined;
  if (!a || !v) return null;
  return [Math.max(0, v.mass(s, id) - a.start), v.n];
}

/** Nach jeder Aktion: erfuellte Vorhaben belohnen. */
export function vorhabenPruefen(s: GameState, events: Ereignisse): void {
  if (!s.vorhaben) return;
  for (const [id, stand] of Object.entries(s.vorhaben)) {
    const a = stand.aktiv;
    const v = a ? vorhabenById(a.id) : undefined;
    const p = s.players.find((x) => x.id === id);
    if (!a || !v || !p) continue;
    if (v.mass(s, id) - a.start < v.n) continue;
    const ruhm = v.lohn.ruhm ?? 0;
    const beute = v.lohn.beute ?? 0;
    // Den Ruhm verbucht rules/ruhm.ts aus dem Ereignis - wie jeden anderen.
    p.loot += beute;
    s.vorhaben = { ...s.vorhaben, [id]: { angebot: [], aktiv: null } };
    events.push({ t: 'ambitionDone', player: id, id: v.id, ruhm, beute });
  }
}
