/**
 * Fortschritt ueber die Abenteuer hinweg (Meta) - im Browser gespeichert.
 *
 * Spieltest: "Nichts bleibt - kein Grund fuer noch eine Runde." Darum bringt
 * jedes Abenteuer Ruhm (abenteuerPunkte / 15). Im Lager schaltet man damit
 * Klassen und Start-Extras frei; ein Sieg oeffnet die naechste Heldenstufe
 * (Schwierigkeit mit mehr Punkten). Dazu Bestwerte und das Tagesabenteuer.
 */

import type { KlasseId } from '../../abenteuer/regeln';

const META = 'infinitecarthage.abenteuer.meta';

export type Meta = {
  ruhm: number;
  /** Freigeschaltet: Klassen ("klasse:zwerg") und Extras ("extra:kraeuter"). */
  frei: string[];
  /** Die zuletzt gewaehlte Klasse, Heldenstufe und die aktiven Extras. */
  klasse: KlasseId;
  stufe: number;
  /** Hoechste freigeschaltete Heldenstufe (0 = normal). */
  stufeMax: number;
  bester: number;
  laeufe: number;
  siege: number;
  /** Bestwert je Tagesabenteuer (Datum). */
  tage: Record<string, number>;
  /** Welche Abenteuer schon belohnt sind (Seed:Zug) - kein doppelter Ruhm. */
  belohnt: string[];
};

const LEER: Meta = { ruhm: 0, frei: [], klasse: 'ritter', stufe: 0, stufeMax: 0, bester: 0, laeufe: 0, siege: 0, tage: {}, belohnt: [] };

export function ladeMeta(): Meta {
  try {
    const t = localStorage.getItem(META);
    return t ? { ...LEER, ...(JSON.parse(t) as Partial<Meta>) } : { ...LEER };
  } catch {
    return { ...LEER };
  }
}

export function speichereMeta(m: Meta): void {
  try {
    localStorage.setItem(META, JSON.stringify({ ...m, belohnt: m.belohnt.slice(-50) }));
  } catch {
    // ohne Speicher gilt es nur fuer jetzt
  }
}

/** Was man im Lager freischalten kann - mit Ruhm. */
export const FREISCHALTUNGEN: readonly { id: string; art: 'klasse' | 'extra'; kosten: number }[] = [
  { id: 'kraeuter', art: 'extra', kosten: 10 },
  { id: 'waldlaeufer', art: 'klasse', kosten: 20 },
  { id: 'geldkatze', art: 'extra', kosten: 25 },
  { id: 'zwerg', art: 'klasse', kosten: 40 },
  { id: 'karte', art: 'extra', kosten: 45 },
  { id: 'bleiwuerfel', art: 'extra', kosten: 60 },
  { id: 'paladin', art: 'klasse', kosten: 70 },
  { id: 'herz', art: 'extra', kosten: 90 },
  { id: 'schwarz', art: 'klasse', kosten: 120 },
];

export const istFrei = (m: Meta, art: 'klasse' | 'extra', id: string): boolean => (art === 'klasse' && id === 'ritter') || m.frei.includes(`${art}:${id}`);

/** Freischalten, wenn der Ruhm reicht. */
export function freischalten(m: Meta, art: 'klasse' | 'extra', id: string): Meta {
  const f = FREISCHALTUNGEN.find((x) => x.id === id && x.art === art);
  if (!f || istFrei(m, art, id) || m.ruhm < f.kosten) return m;
  return { ...m, ruhm: m.ruhm - f.kosten, frei: [...m.frei, `${art}:${id}`], ...(art === 'klasse' ? { klasse: id as KlasseId } : {}) };
}

/** Die naechste Freischaltung, die man sich (fast) leisten kann - als Anreiz auf dem Endbildschirm. */
export function naechsteFreischaltung(m: Meta): { id: string; art: 'klasse' | 'extra'; kosten: number } | null {
  return FREISCHALTUNGEN.filter((f) => !istFrei(m, f.art, f.id)).sort((x, y) => x.kosten - y.kosten)[0] ?? null;
}

/** Die freigeschalteten Extras - sie gelten bei jedem Aufbruch (nicht im Tagesabenteuer). */
export const aktiveExtras = (m: Meta): string[] => m.frei.filter((f) => f.startsWith('extra:')).map((f) => f.slice(6));

/** Das Datum von heute (fuer das Tagesabenteuer) und sein Seed - fuer alle gleich. */
export function heute(): { tag: string; seed: number } {
  const d = new Date();
  const tag = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let seed = 7;
  for (const c of tag) seed = (seed * 31 + c.charCodeAt(0)) | 0;
  return { tag, seed };
}
