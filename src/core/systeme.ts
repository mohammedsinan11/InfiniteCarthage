/**
 * Systeme, die sich ueber die Partien hinweg zeigen (Weniger ist mehr, D12).
 *
 * Wer zum ersten Mal spielt, soll nicht alles auf einmal sehen. Die erste
 * Partie kennt nur das Herz des Spiels: Doerfer, Strassen, Staedte, den
 * Wuerfel, die Kartenwahl - und die Akte mit ihren Bossen (core/akte.ts).
 * Mit jeder gespielten Partie kommt ein System dazu, wie in Against the Storm
 * oder The Binding of Isaac: die zweite Partie bringt Raubzuege und Ritter,
 * die dritte den Helden mit Ruinen und Auftraegen, und so weiter. Nach der
 * fuenften ist alles da.
 *
 * Gezaehlt werden die Partien im Browser (client/profil.ts); der Raum gibt
 * die Zahl beim Start weiter. Spielen mehrere Menschen zusammen, gilt alles -
 * und wer schon weiss, wie es geht, schaltet in der Lobby alles frei.
 *
 * Fehlt state.systeme (alte Staende, Mehrspieler), gilt jedes System.
 */

export type SystemId = 'raub' | 'held' | 'ereignisse' | 'reich';

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
    id: 'raub',
    name: 'Raubzuege und Ritter',
    text: 'Aus den Lagern brechen Raubzuege auf. Wirb Ritter und Bogenschuetzen in deinen Doerfern an und stelle dich ihnen.',
    ab: 1,
  },
  {
    id: 'held',
    name: 'Der Held',
    text: 'Dein Held zieht durchs Land: Ruinen erkunden, Wanderern helfen, Geruechten folgen.',
    ab: 2,
  },
  {
    id: 'ereignisse',
    name: 'Ereignisse und Karawanen',
    text: 'Ereignisse stellen dich vor eine Wahl, und Karawanen ziehen auf deinen Strassen von Siedlung zu Siedlung.',
    ab: 3,
  },
  {
    id: 'reich',
    name: 'Das Reich',
    text: 'Vorhaben fuer jede Jahreszeit, Weltwunder, Abkommen mit den Fraktionen und andere Wege zum Sieg.',
    ab: 4,
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
