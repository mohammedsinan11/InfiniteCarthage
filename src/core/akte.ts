/**
 * Drei Akte, drei Bosse (B6: eine Partie mit Gestalt).
 *
 * Bisher lief eine Partie sechzig Runden lang mit gleichmaessigem Druck und
 * ohne Hoehepunkt. Jetzt hat sie drei Akte - so lang wie eine Jahreszeit -, und
 * jeder endet mit einem Boss, den man von Beginn des Aktes an kommen sieht:
 *
 *   TRIBUT  Ein Abgesandter fordert Rohstoffe. Man zahlt nach und nach ein
 *           (Aktion bossZahlen) - wer bis zum Ende des Aktes alles beisammen
 *           hat, besteht. Pruefung der Wirtschaft.
 *   HEER    Zur Mitte des Aktes bricht ein starker Trupp gegen das Reich auf.
 *           Wer ihn schlaegt, bevor er pluendert, besteht. Pruefung der
 *           Verteidigung - nur, wenn Raubzuege dabei sind (core/systeme.ts).
 *   ZIEL    Ein Bote verlangt Wachstum: so viele Siedlungen, Staedte,
 *           Strassen oder Siegpunkte mehr bis zum Ende des Aktes. Pruefung
 *           des Ausbaus.
 *
 * Bestanden: Siegpunkte in Hoehe der Aktzahl (1, 2, 3) und eine Trophaee -
 * eine Kartenwahl mit seltenen Karten (cards/types.ts, Quelle 'trophaee').
 * Verfehlt: der Boss nimmt die Haelfte der Hand und einen Punkt Ruhm.
 *
 * Wie bei Slay the Spire weiss man frueh, was kommt, und baut darauf hin. Die
 * Bosse waehlt der Weltseed - in der Tagesexpedition haben alle dieselben.
 *
 * Nur in Partien mit Ereignissen und Rundengrenze, nicht in Szenarien.
 */

import { hash3i } from './hash';
import { Rng } from './rng';
import { RESOURCES } from './types';
import type { Resource } from './types';
import { hatSystem } from './systeme';
import type { SystemId } from './systeme';
import type { GameState, PlayerId } from './state';

export type BossArt = 'tribut' | 'heer' | 'ziel';
export type ZielMass = 'siedlungen' | 'staedte' | 'strassen' | 'punkte';

export type BossDef = {
  id: string;
  name: string;
  art: BossArt;
  /** In welchen Akten er auftreten kann. */
  akte: readonly (1 | 2 | 3)[];
  /** Der Auftritt, ein Satz. */
  text: string;
  /** Ohne dieses System tritt er nicht auf. */
  braucht?: SystemId;
  /** Nur fuer ZIEL: was gemessen wird. */
  mass?: ZielMass;
};

export const BOSSE: readonly BossDef[] = [
  { id: 'steuervogt', name: 'Der Steuervogt', art: 'tribut', akte: [1, 2], text: 'Der Koenig will seinen Anteil - und sein Vogt zaehlt genau.' },
  { id: 'kronbote', name: 'Der Kronbote', art: 'ziel', mass: 'siedlungen', akte: [1], text: 'Die Krone will Siedler sehen, keine leeren Huegel.' },
  { id: 'wegemeister', name: 'Der Wegemeister', art: 'ziel', mass: 'strassen', akte: [1, 2], text: 'Ein Reich ohne Wege ist kein Reich. Baut Strassen!' },
  { id: 'grenzfuerst', name: 'Der Grenzfuerst', art: 'heer', akte: [1, 2], braucht: 'raub', text: 'Ein Fuerst der Wildnis sammelt seine Leute gegen dich.' },
  { id: 'hungerwinter', name: 'Der Hungerwinter', art: 'tribut', akte: [2, 3], text: 'Ein langer Winter kommt. Fuellt die Speicher, oder die Doerfer hungern.' },
  { id: 'thronanwaerter', name: 'Der Thronanwaerter', art: 'ziel', mass: 'punkte', akte: [2, 3], text: 'Ein Vetter erhebt Anspruch auf den Thron. Zeige, wer herrscht.' },
  { id: 'staedtebund', name: 'Der Staedtebund', art: 'ziel', mass: 'staedte', akte: [2, 3], text: 'Die freien Staedte nehmen nur Gleiche auf. Baue Staedte.' },
  { id: 'kriegsherr', name: 'Der Kriegsherr', art: 'heer', akte: [2, 3], braucht: 'raub', text: 'Ein Kriegsherr zieht mit erprobten Kaempfern heran.' },
  { id: 'eiserne_koenigin', name: 'Die Eiserne Koenigin', art: 'tribut', akte: [3], text: 'Die Koenigin des Nordens verlangt Tribut - oder sie kommt ihn holen.' },
  { id: 'schwarzes_banner', name: 'Das Schwarze Banner', art: 'heer', akte: [3], braucht: 'raub', text: 'Unter dem schwarzen Banner sammelt sich, was die Wildnis an Grausamem hat.' },
];

export const bossById = (id: string | undefined | null): BossDef | undefined => BOSSE.find((b) => b.id === id);

export type BossForderung =
  | { t: 'tribut'; soll: Partial<Record<Resource, number>>; gezahlt: Partial<Record<Resource, number>> }
  /** ids: die Einheiten des Heers, sobald es aufgebrochen ist; entkommen: es hat gepluendert. */
  | { t: 'heer'; anzahl: number; rang: number; ids: number[] | null; entkommen: boolean; abRunde: number }
  | { t: 'ziel'; mass: ZielMass; start: number; soll: number };

export type BossStand = {
  akt: number;
  boss: string;
  /** Am Ende dieser Runde faellt die Entscheidung. */
  bis: number;
  forderung: BossForderung;
  ergebnis: 'offen' | 'besiegt' | 'verfehlt';
  /**
   * Zugabe (wie Balatros Endlos-Runden): der letzte Boss ist vor der Zeit
   * geschlagen, er fordert noch einmal. Die wievielte - fehlt ausserhalb.
   */
  zugabe?: number;
};

export type AkteStand = {
  /** Runden je Akt. */
  laenge: number;
  /** Der Boss je Akt, vom Weltseed gewaehlt. */
  bosse: string[];
  /** Der laufende Akt je Spieler. */
  stand: Record<PlayerId, BossStand>;
  /** Welche Akte jeder bestanden hat - je bestandenem Akt so viele Siegpunkte wie seine Zahl. */
  siege: Record<PlayerId, number[]>;
  /** Abzuege fuer verfehlte Bosse (Chronikstufe 10). */
  strafe?: Record<PlayerId, number>;
};

export const AKTE = 3;
const SALT_AKT = 211;

/** Die Bosse der drei Akte: aus dem Weltseed, nur solche, deren System dabei ist. */
export function waehleBosse(worldSeed: number, s: Pick<GameState, 'systeme'>): string[] {
  const out: string[] = [];
  for (let akt = 1; akt <= AKTE; akt++) {
    const alle = BOSSE.filter(
      (b) => b.akte.includes(akt as 1 | 2 | 3) && (!b.braucht || hatSystem(s, b.braucht)) && !out.includes(b.id),
    );
    // Keine zwei Bosse derselben Art, wenn es sich vermeiden laesst (Spieltest 10:
    // zwei Tribute in einer Partie - "Bosse sind Rechnungen").
    const arten = out.map((id) => bossById(id)?.art);
    const anders = alle.filter((b) => !arten.includes(b.art));
    const moeglich = anders.length > 0 ? anders : alle;
    const rng = new Rng(hash3i(worldSeed, akt, 0, SALT_AKT));
    out.push(moeglich[rng.int(moeglich.length)]!.id);
  }
  return out;
}

/** Siegpunkte aus bestandenen Akten. */
export function aktPunkte(akte: AkteStand | null | undefined, id: PlayerId): number {
  return (akte?.siege[id] ?? []).reduce((n, a) => n + a, 0) - (akte?.strafe?.[id] ?? 0);
}

/** Der Akt zu einer Runde (1..3) - danach bleibt es beim dritten. */
export const aktVon = (akte: Pick<AkteStand, 'laenge'>, turn: number): number =>
  Math.min(AKTE, Math.floor((Math.max(1, turn) - 1) / akte.laenge) + 1);

/** Wie viel ein Ziel misst - rein, auch fuer die Anzeige. */
export function zielWert(
  s: Pick<GameState, 'buildings' | 'roads'>,
  id: PlayerId,
  mass: ZielMass,
  punkte: (id: PlayerId) => number,
): number {
  switch (mass) {
    case 'siedlungen':
      return Object.values(s.buildings).filter((b) => b.owner === id).length;
    case 'staedte':
      return Object.values(s.buildings).filter((b) => b.owner === id && b.type === 'city').length;
    case 'strassen':
      return Object.values(s.roads).filter((o) => o === id).length;
    case 'punkte':
      return punkte(id);
  }
}

/** Um wie viel ein Ziel je Akt waechst. */
const ZIEL_MEHR: Record<ZielMass, [number, number, number]> = {
  siedlungen: [2, 3, 3],
  staedte: [1, 2, 2],
  strassen: [4, 5, 6],
  punkte: [3, 4, 5],
};

/** Wie viele Karten ein Tribut je Akt verlangt. */
const TRIBUT_KARTEN = [5, 8, 12];
/** Wie gross das Heer je Akt ist: Anzahl und Rang. */
const HEER: [number, number][] = [
  [2, 0],
  [3, 1],
  [4, 2],
];

export const ZIEL_NAME: Record<ZielMass, [string, string]> = {
  siedlungen: ['Siedlung', 'Siedlungen'],
  staedte: ['Stadt', 'Staedte'],
  strassen: ['Strasse', 'Strassen'],
  punkte: ['Siegpunkt', 'Siegpunkte'],
};

/** Die Forderung eines Bosses an einen Spieler zu Beginn des Aktes. */
export function forderungFuer(
  s: Pick<GameState, 'worldSeed' | 'buildings' | 'roads' | 'order'> & { stufe?: number },
  boss: BossDef,
  akt: number,
  id: PlayerId,
  beginn: number,
  bis: number,
  punkte: (id: PlayerId) => number,
): BossForderung {
  const i = Math.max(0, Math.min(AKTE, akt) - 1);
  // Ab Chronikstufe 7 fordern die Bosse mehr (core/stufe.ts).
  const haerte = (s.stufe ?? 0) >= 7 ? 1 : 0;
  if (boss.art === 'tribut') {
    // Zwei oder drei Sorten, je Spieler verschieden, aber aus dem Weltseed.
    const rng = new Rng(hash3i(s.worldSeed, akt, s.order.indexOf(id) + 1, SALT_AKT + 1));
    const sorten = [...RESOURCES];
    const wahl: Resource[] = [];
    const n = akt >= 3 ? 3 : 2;
    while (wahl.length < n) wahl.push(sorten.splice(rng.int(sorten.length), 1)[0]!);
    // Der Hungerwinter will Getreide und Wolle - das sagt sein Name.
    if (boss.id === 'hungerwinter') wahl.splice(0, 2, 'grain', 'wool');
    const soll: Partial<Record<Resource, number>> = {};
    const gesamt = TRIBUT_KARTEN[i]! + 2 * haerte;
    for (let k = 0; k < gesamt; k++) {
      const r = wahl[k % wahl.length]!;
      soll[r] = (soll[r] ?? 0) + 1;
    }
    return { t: 'tribut', soll, gezahlt: {} };
  }
  if (boss.art === 'heer') {
    const [grund, rang] = HEER[i]!;
    const anzahl = grund + haerte;
    // Zur Mitte des Aktes bricht es auf - Zeit genug, sich zu ruesten.
    return { t: 'heer', anzahl, rang, ids: null, entkommen: false, abRunde: Math.max(beginn, bis - Math.floor((bis - beginn) / 2)) };
  }
  const mass = boss.mass ?? 'siedlungen';
  const start = zielWert(s, id, mass, punkte);
  return { t: 'ziel', mass, start, soll: start + ZIEL_MEHR[mass][i]! + haerte };
}

/** Ist die Forderung erfuellt? Fuer HEER erst, wenn das Heer aufgebrochen und vollstaendig gefallen ist. */
export function erfuellt(
  s: Pick<GameState, 'buildings' | 'roads' | 'units'>,
  id: PlayerId,
  f: BossForderung,
  punkte: (id: PlayerId) => number,
): boolean {
  switch (f.t) {
    case 'tribut':
      return RESOURCES.every((r) => (f.gezahlt[r] ?? 0) >= (f.soll[r] ?? 0));
    case 'heer':
      return f.ids !== null && !f.entkommen && !s.units.some((u) => f.ids!.includes(u.id));
    case 'ziel':
      return zielWert(s, id, f.mass, punkte) >= f.soll;
  }
}

/** Wie weit die Forderung erfuellt ist, 0..1 - fuer die Anzeige. */
export function fortschritt(
  s: Pick<GameState, 'buildings' | 'roads' | 'units'>,
  id: PlayerId,
  f: BossForderung,
  punkte: (id: PlayerId) => number,
): number {
  switch (f.t) {
    case 'tribut': {
      const soll = RESOURCES.reduce((n, r) => n + (f.soll[r] ?? 0), 0);
      const ist = RESOURCES.reduce((n, r) => n + Math.min(f.gezahlt[r] ?? 0, f.soll[r] ?? 0), 0);
      return soll === 0 ? 1 : ist / soll;
    }
    case 'heer': {
      if (f.ids === null) return 0;
      const lebt = s.units.filter((u) => f.ids!.includes(u.id)).length;
      return f.ids.length === 0 ? 1 : 1 - lebt / f.ids.length;
    }
    case 'ziel': {
      const ist = zielWert(s, id, f.mass, punkte);
      return f.soll <= f.start ? 1 : Math.max(0, Math.min(1, (ist - f.start) / (f.soll - f.start)));
    }
  }
}

/** Die Forderung in einem Satz - fuer Tafel und Meldungen. */
export function forderungText(f: BossForderung): string {
  switch (f.t) {
    case 'tribut':
      return 'Zahle bis zum Ende des Aktes den geforderten Tribut.';
    case 'heer':
      return f.ids === null
        ? `Ein Heer von ${f.anzahl} Kaempfern bricht in Runde ${f.abRunde} auf. Schlage es, bevor es pluendert.`
        : `Schlage das Heer (${f.anzahl} Kaempfer), bevor es pluendert.`;
    case 'ziel': {
      const [eins, viele] = ZIEL_NAME[f.mass];
      const mehr = f.soll - f.start;
      return `Komme auf ${f.soll} ${f.soll === 1 ? eins : viele} (${mehr} mehr als zu Beginn des Aktes).`;
    }
  }
}
