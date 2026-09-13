/**
 * Die oeffentliche Raumliste: was die Startseite ueber offene und laufende
 * Raeume zeigt.
 *
 * Jeder Raum ist ein eigenes Durable Object und weiss nichts von den anderen.
 * Eine Liste braucht deshalb eine Stelle, an der sich alle melden - das
 * Verzeichnis (worker/directory.ts). Ein Raum meldet sich, wenn jemand
 * beitritt, die Partie startet, sich Einstellungen aendern und - hoechstens
 * alle MELDEN_ALLE_MS - wenn gespielt wird.
 *
 * Hier liegt nur, was beide Seiten brauchen und was sich ohne Worker pruefen
 * laesst: die Form eines Eintrags, welche Eintraege sichtbar sind, wie "zuletzt
 * gespielt" gelesen wird.
 */

/** Nach so vielen Tagen ohne Aktivitaet verschwindet ein Raum aus der Liste. */
export const VERFALL_TAGE = 7;
export const VERFALL_MS = VERFALL_TAGE * 24 * 60 * 60 * 1000;

/** Zuege melden sich hoechstens so oft beim Verzeichnis. */
export const MELDEN_ALLE_MS = 30_000;

/** Unter diesem Namen gibt es genau ein Verzeichnis. */
export const VERZEICHNIS_NAME = 'raumliste';

export type RaumStatus = 'lobby' | 'laeuft' | 'beendet';

export type RaumEintrag = {
  code: string;
  /** Private Raeume melden sich auch - damit sie verschwinden, wenn jemand umschaltet. */
  oeffentlich: boolean;
  status: RaumStatus;
  gastgeber: string;
  spieler: string[];
  maxSpieler: number;
  /** Runde der laufenden Partie, sonst null. */
  runde: number | null;
  zielpunkte: number;
  /** Millisekunden seit 1970. */
  erstellt: number;
  /** Letzte Aktivitaet: Beitritt, Start, Zug. */
  zuletzt: number;
};

const RANG: Record<RaumStatus, number> = { lobby: 0, laeuft: 1, beendet: 2 };

export const istAbgelaufen = (e: RaumEintrag, jetzt: number): boolean =>
  jetzt - e.zuletzt > VERFALL_MS;

/**
 * Was die Startseite zeigt: oeffentliche Raeume mit Spielern, nicht aelter als
 * VERFALL_TAGE. Offene zuerst - dort kann man beitreten -, dann laufende, dann
 * beendete, jeweils das zuletzt Aktive oben.
 */
export function sichtbareRaeume(eintraege: readonly RaumEintrag[], jetzt: number): RaumEintrag[] {
  return eintraege
    .filter((e) => e.oeffentlich && e.spieler.length > 0 && !istAbgelaufen(e, jetzt))
    .sort((a, b) => RANG[a.status] - RANG[b.status] || b.zuletzt - a.zuletzt);
}

/** "zuletzt gespielt" in Worten. */
export function zuletztText(zuletzt: number, jetzt: number): string {
  const min = Math.floor(Math.max(0, jetzt - zuletzt) / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std`;
  const tage = Math.floor(std / 24);
  return tage === 1 ? 'vor 1 Tag' : `vor ${tage} Tagen`;
}

/** Ist das ein gueltiger Eintrag? Das Verzeichnis nimmt nichts anderes an. */
export function istRaumEintrag(v: unknown): v is RaumEintrag {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  const zahl = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  return (
    typeof e.code === 'string' &&
    e.code.length > 0 &&
    e.code.length <= 12 &&
    typeof e.oeffentlich === 'boolean' &&
    (e.status === 'lobby' || e.status === 'laeuft' || e.status === 'beendet') &&
    typeof e.gastgeber === 'string' &&
    Array.isArray(e.spieler) &&
    e.spieler.length <= 12 &&
    e.spieler.every((s) => typeof s === 'string') &&
    zahl(e.maxSpieler) &&
    (e.runde === null || zahl(e.runde)) &&
    zahl(e.zielpunkte) &&
    zahl(e.erstellt) &&
    zahl(e.zuletzt)
  );
}
