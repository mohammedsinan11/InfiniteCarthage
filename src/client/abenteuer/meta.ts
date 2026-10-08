/**
 * Fortschritt ueber die Abenteuer hinweg (Meta) - im Browser gespeichert.
 *
 * Spieltest: "Nichts bleibt - kein Grund fuer noch eine Runde." Darum bringt
 * jedes Abenteuer Ruhm (abenteuerPunkte / 15). Im Lager schaltet man damit
 * Klassen und Start-Extras frei; ein Sieg oeffnet die naechste Heldenstufe
 * (Schwierigkeit mit mehr Punkten). Dazu Bestwerte und das Tagesabenteuer.
 */

import { abenteuerPunkte, LEGENDEN_FREI } from '../../abenteuer/regeln';
import type { Abenteuer, KlasseId } from '../../abenteuer/regeln';

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
  /** Erreichte Erfolge. */
  erfolge: string[];
  /** Mit welchen Klassen schon gewonnen wurde. */
  siegKlassen: string[];
  /** Was das letzte Abenteuer neu gebracht hat (Erfolge, Heldenstufe) - fuer den Endbildschirm. */
  zuletzt: string[];
};

const LEER: Meta = { ruhm: 0, frei: [], klasse: 'ritter', stufe: 0, stufeMax: 0, bester: 0, laeufe: 0, siege: 0, tage: {}, belohnt: [], erfolge: [], siegKlassen: [], zuletzt: [] };

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
export type FreiArt = 'klasse' | 'extra' | 'legende';
/**
 * Spieltest: "nach zwei Siegen ist alles freigeschaltet". Darum mehr und
 * teurer - und Legendaeres, das erst ins Spiel kommt, wenn man es hier
 * freischaltet (neue Builds).
 */
export const FREISCHALTUNGEN: readonly { id: string; art: FreiArt; kosten: number }[] = [
  { id: 'kraeuter', art: 'extra', kosten: 10 },
  { id: 'waldlaeufer', art: 'klasse', kosten: 25 },
  { id: 'ruhepuls', art: 'legende', kosten: 35 },
  { id: 'geldkatze', art: 'extra', kosten: 40 },
  { id: 'schatzsucher', art: 'legende', kosten: 55 },
  { id: 'zwerg', art: 'klasse', kosten: 70 },
  { id: 'glueckspilz', art: 'legende', kosten: 85 },
  { id: 'karte', art: 'extra', kosten: 95 },
  { id: 'jagdfieber', art: 'legende', kosten: 110 },
  { id: 'paladin', art: 'klasse', kosten: 130 },
  { id: 'bleiwuerfel', art: 'extra', kosten: 150 },
  { id: 'wirbelwind', art: 'legende', kosten: 170 },
  { id: 'herz', art: 'extra', kosten: 190 },
  { id: 'runenmeister', art: 'legende', kosten: 220 },
  { id: 'schwarz', art: 'klasse', kosten: 260 },
];

export const istFrei = (m: Meta, art: FreiArt, id: string): boolean => (art === 'klasse' && id === 'ritter') || m.frei.includes(`${art}:${id}`);

/** Das freigeschaltete Legendaere - es kommt in den Pool jedes Abenteuers. */
export const freieLegenden = (m: Meta): string[] => LEGENDEN_FREI.filter((id) => istFrei(m, 'legende', id));

/**
 * ERFOLGE - Ziele ueber viele Abenteuer, jeder bringt einmal Ruhm.
 */
export const ERFOLGE: readonly { id: string; name: string; text: string; ruhm: number; pruefe: (a: Abenteuer, m: Meta) => boolean }[] = [
  { id: 'erster', name: 'Erster Schritt', text: 'Besiege den ersten Boss.', ruhm: 15, pruefe: (a) => (a.koenige ?? 0) >= 1 },
  { id: 'sieg', name: 'Held', text: 'Gewinne ein Abenteuer.', ruhm: 40, pruefe: (a) => a.phase === 'sieg' },
  { id: 'allein', name: 'Einsamer Wolf', text: 'Gewinne ohne Gefolge.', ruhm: 50, pruefe: (a) => a.phase === 'sieg' && (a.gefolge ?? []).length === 0 && (a.angeheuert ?? []).length === 0 },
  { id: 'schnell', name: 'Eilbote', text: 'Gewinne in hoechstens 60 Zuegen.', ruhm: 50, pruefe: (a) => a.phase === 'sieg' && a.zug <= 60 },
  { id: 'jaeger', name: 'Schleimjaeger', text: 'Erlege 50 Gegner in einem Abenteuer.', ruhm: 30, pruefe: (a) => a.erschlagen >= 50 },
  { id: 'reich', name: 'Pfeffersack', text: 'Besitze 60 Gold auf einmal.', ruhm: 20, pruefe: (a) => (a.inventar['gold'] ?? 0) >= 60 },
  { id: 'pentagramm', name: 'Erzmagier', text: 'Erreiche Pentagrammmeister Stufe 3.', ruhm: 40, pruefe: (a) => (a.pentaStufe ?? 1) >= 3 },
  { id: 'schwarz', name: 'Schwarze Legende', text: 'Gewinne als Schwarzer Ritter.', ruhm: 80, pruefe: (a) => a.phase === 'sieg' && a.klasse === 'schwarz' },
  { id: 'held2', name: 'Bewaehrt', text: 'Gewinne auf Heldenstufe 2.', ruhm: 60, pruefe: (a) => a.phase === 'sieg' && (a.heldenstufe ?? 0) >= 2 },
  { id: 'held4', name: 'Unbeugsam', text: 'Gewinne auf Heldenstufe 4.', ruhm: 120, pruefe: (a) => a.phase === 'sieg' && (a.heldenstufe ?? 0) >= 4 },
  { id: 'tag', name: 'Taeglich Brot', text: 'Besiege im Tagesabenteuer den ersten Boss.', ruhm: 15, pruefe: (a) => !!a.tag && (a.koenige ?? 0) >= 1 },
  { id: 'alle', name: 'Meister aller Klassen', text: 'Gewinne mit allen fuenf Klassen.', ruhm: 200, pruefe: (a, m) => new Set([...m.siegKlassen, ...(a.phase === 'sieg' ? [a.klasse ?? 'ritter'] : [])]).size >= 5 },
];

/** Am Ende eines Abenteuers: Ruhm, Erfolge, Bestwerte, Heldenstufe - als neuer Meta-Stand. */
export function belohne(m0: Meta, a: Abenteuer, ruhm: number): Meta {
  const m = { ...LEER, ...m0 };
  const punkte = abenteuerPunkte(a);
  const neu: string[] = [];
  let plus = ruhm;
  for (const e of ERFOLGE) {
    if (m.erfolge.includes(e.id) || !e.pruefe(a, m)) continue;
    neu.push(`Erfolg: ${e.name} (+${e.ruhm} Ruhm)`);
    plus += e.ruhm;
  }
  const stufeNeu = a.phase === 'sieg' && (a.heldenstufe ?? 0) + 1 > m.stufeMax && (a.heldenstufe ?? 0) + 1 <= 5;
  if (stufeNeu) neu.push(`Heldenstufe ${(a.heldenstufe ?? 0) + 1} ist im Lager waehlbar`);
  return {
    ...m,
    ruhm: m.ruhm + plus,
    laeufe: m.laeufe + 1,
    siege: m.siege + (a.phase === 'sieg' ? 1 : 0),
    bester: Math.max(m.bester, punkte),
    stufeMax: stufeNeu ? (a.heldenstufe ?? 0) + 1 : m.stufeMax,
    tage: a.tag ? { ...m.tage, [a.tag]: Math.max(m.tage[a.tag] ?? 0, punkte) } : m.tage,
    erfolge: [...m.erfolge, ...ERFOLGE.filter((e) => !m.erfolge.includes(e.id) && e.pruefe(a, m)).map((e) => e.id)],
    siegKlassen: a.phase === 'sieg' ? [...new Set([...m.siegKlassen, a.klasse ?? 'ritter'])] : m.siegKlassen,
    zuletzt: neu,
  };
}

/** Freischalten, wenn der Ruhm reicht. */
export function freischalten(m: Meta, art: FreiArt, id: string): Meta {
  const f = FREISCHALTUNGEN.find((x) => x.id === id && x.art === art);
  if (!f || istFrei(m, art, id) || m.ruhm < f.kosten) return m;
  return { ...m, ruhm: m.ruhm - f.kosten, frei: [...m.frei, `${art}:${id}`], ...(art === 'klasse' ? { klasse: id as KlasseId } : {}) };
}

/** Die naechste Freischaltung, die man sich (fast) leisten kann - als Anreiz auf dem Endbildschirm. */
export function naechsteFreischaltung(m: Meta): { id: string; art: FreiArt; kosten: number } | null {
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
