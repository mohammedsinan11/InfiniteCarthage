/**
 * Systeme, die sich ueber die Partien hinweg zeigen (Weniger ist mehr, D12).
 *
 * Wer zum ersten Mal spielt, soll nicht alles auf einmal sehen. Die erste
 * Partie ist so schlicht wie Catan: wuerfeln, ernten, bauen, handeln - wer
 * zuerst EINSTIEG_ZIEL Siegpunkte hat, gewinnt. Mit jeder gespielten Partie
 * kommt ein System dazu, wie in Against the Storm oder The Binding of Isaac:
 * die zweite bringt die Kartenwahl, die dritte die Akte mit ihren Bossen
 * (core/akte.ts), dann Raubzuege, den Helden, Ereignisse und das Reich. Nach
 * der siebten ist alles da.
 *
 * Gezaehlt werden die Partien im Browser (client/profil.ts); der Raum gibt
 * die Zahl beim Start weiter. Spielen mehrere Menschen zusammen, gilt alles -
 * und wer schon weiss, wie es geht, schaltet in der Lobby alles frei.
 *
 * Fehlt state.systeme (alte Staende, Mehrspieler), gilt jedes System.
 */

export type SystemId = 'karten' | 'akte' | 'raub' | 'held' | 'ereignisse' | 'reich';

/** Ohne Akte gewinnt, wer zuerst so viele Siegpunkte hat - wie bei Catan. */
export const EINSTIEG_ZIEL = 10;

export type SystemInfo = {
  id: SystemId;
  name: string;
  /** Ein Satz zur Einfuehrung, wenn es zum ersten Mal dabei ist. */
  text: string;
  /** Ab der wievielten Partie (0 = die erste) es dabei ist. */
  ab: number;
};

export const SYSTEME: readonly SystemInfo[] = [
  {
    id: 'karten',
    name: 'Die Kartenwahl',
    text: 'Jede neue Stadt, jede 7 und der Markt bieten dir drei Karten zur Wahl - sie bauen dein Reich zu einer Maschine aus.',
    ab: 1,
  },
  {
    id: 'akte',
    name: 'Drei Akte mit Bossen',
    text: 'Die Partie hat drei Akte, jeder endet mit einem Boss. Am Ende zaehlt die Wertung: Basis mal Mult.',
    ab: 2,
  },
  {
    id: 'raub',
    name: 'Raubzuege und Ritter',
    text: 'Aus den Lagern brechen Raubzuege auf. Wirb Ritter und Bogenschuetzen in deinen Doerfern an und stelle dich ihnen.',
    ab: 3,
  },
  {
    id: 'held',
    name: 'Der Held',
    text: 'Dein Held zieht durchs Land: Ruinen erkunden, Wanderern helfen, Geruechten folgen.',
    ab: 4,
  },
  {
    id: 'ereignisse',
    name: 'Ereignisse und Karawanen',
    text: 'Ereignisse stellen dich vor eine Wahl, und Karawanen ziehen auf deinen Strassen von Siedlung zu Siedlung.',
    ab: 5,
  },
  {
    id: 'reich',
    name: 'Das Reich',
    text: 'Vorhaben fuer jede Jahreszeit, Weltwunder, Abkommen mit den Fraktionen und andere Wege zum Sieg.',
    ab: 6,
  },
];

export const ALLE_SYSTEME: readonly SystemId[] = SYSTEME.map((s) => s.id);

/** Welche Systeme nach so vielen gespielten Partien dabei sind. */
export function systemeFuer(partien: number): SystemId[] {
  return SYSTEME.filter((s) => partien >= s.ab).map((s) => s.id);
}

/** Welches System in dieser Partie zum ersten Mal dabei ist - fuer die Einfuehrung. */
export function neuesSystem(partien: number): SystemInfo | null {
  return SYSTEME.find((s) => s.ab === partien) ?? null;
}

/** Gilt dieses System in der Partie? Ohne Liste gilt alles. */
export const hatSystem = (s: { systeme?: readonly SystemId[] | null }, id: SystemId): boolean =>
  !s.systeme || s.systeme.includes(id);

export const istSystem = (x: unknown): x is SystemId => typeof x === 'string' && (ALLE_SYSTEME as readonly string[]).includes(x);
