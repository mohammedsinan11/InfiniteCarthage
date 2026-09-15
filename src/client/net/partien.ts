/**
 * Deine Partien: welche Raeume dieser Browser mit einem Platz kennt.
 *
 * Anders als das Token des Tabs (store.ts, sessionStorage) liegt diese Liste im
 * localStorage - sie ueberlebt das Schliessen des Browsers. Ihr Token wird nur
 * auf ausdruecklichen Wunsch benutzt ("Weiterspielen"): wer in einem zweiten
 * Tab mit dem Raumcode beitritt, soll nicht still den Platz des ersten
 * uebernehmen - auf einem geteilten Rechner spielen so weiter zwei Leute.
 *
 * Reine Funktionen ueber einen Speicher, damit sie sich ohne Browser pruefen
 * lassen.
 */

export type Partie = {
  code: string;
  token: string;
  /** Unter welchem Namen man dort sitzt. */
  name: string;
  /** Zuletzt beigetreten, Millisekunden seit 1970. */
  zuletzt: number;
};

export type Speicher = Pick<Storage, 'getItem' | 'setItem'>;

export const PARTIEN_KEY = 'infinitecarthage.partien';
/** Mehr merkt sich der Browser nicht - die aeltesten fallen heraus. */
export const PARTIEN_MAX = 20;
/** Nach so vielen Tagen ohne Beitritt verschwindet eine Partie aus der Liste. */
export const PARTIEN_TAGE = 30;
const PARTIEN_MS = PARTIEN_TAGE * 24 * 60 * 60 * 1000;

const istPartie = (v: unknown): v is Partie => {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.code === 'string' &&
    typeof p.token === 'string' &&
    typeof p.name === 'string' &&
    typeof p.zuletzt === 'number' &&
    Number.isFinite(p.zuletzt)
  );
};

/** Alle gemerkten Partien, die zuletzt gespielte zuerst. Kaputtes wird still uebergangen. */
export function lesePartien(sp: Speicher | null, jetzt: number): Partie[] {
  if (!sp) return [];
  try {
    const roh = JSON.parse(sp.getItem(PARTIEN_KEY) ?? '[]') as unknown;
    if (!Array.isArray(roh)) return [];
    return roh
      .filter(istPartie)
      .filter((p) => jetzt - p.zuletzt <= PARTIEN_MS)
      .sort((a, b) => b.zuletzt - a.zuletzt);
  } catch {
    return [];
  }
}

function schreibe(sp: Speicher | null, partien: Partie[]): Partie[] {
  try {
    sp?.setItem(PARTIEN_KEY, JSON.stringify(partien));
  } catch {
    // Speicher voll oder gesperrt - dann bleibt es beim Tab.
  }
  return partien;
}

/** Eine Partie merken oder auffrischen - je Raumcode genau ein Eintrag. */
export function merkePartie(sp: Speicher | null, p: Partie, jetzt: number): Partie[] {
  const rest = lesePartien(sp, jetzt).filter((x) => x.code !== p.code);
  return schreibe(sp, [p, ...rest].slice(0, PARTIEN_MAX));
}

export function vergissPartie(sp: Speicher | null, code: string, jetzt: number): Partie[] {
  return schreibe(
    sp,
    lesePartien(sp, jetzt).filter((x) => x.code !== code),
  );
}

/** Der localStorage, oder null, wo der Browser ihn sperrt. */
export function lokalerSpeicher(): Speicher | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
