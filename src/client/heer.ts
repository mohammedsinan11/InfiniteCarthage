/**
 * Das eigene Heer fuer die Oberflaeche: Gruppen, Scharen, Namen, Untaetige.
 *
 * Eine Schar sind Einheiten mit demselben Banner (UnitState.verband,
 * rules/army.ts) - auch wenn sie gerade auf verschiedenen Feldern stehen. Wer
 * kein Banner traegt, wird mit den anderen seines Feldes zusammengefasst.
 * Heerleiste, Befehlstafel, Menue und die Wimpel auf der Karte fragen alle
 * diese Funktionen, damit "Schar 2" ueberall dieselbe Schar ist.
 */

import type { UnitState } from '../core/state';

export type HeerGruppe = {
  /** 's:<banner>' fuer eine Schar, 'f:<q>:<r>' fuer die Einheiten eines Feldes. */
  key: string;
  /** Nummer der Schar (1, 2, ...), null ohne Banner. */
  schar: number | null;
  /** Das Banner selbst (UnitState.verband), null ohne. */
  verband: number | null;
  /** Wo die erste Einheit steht. */
  q: number;
  r: number;
  einheiten: UnitState[];
};

export type HeerStatus = 'kaempft' | 'zieht' | 'erkundet' | 'folgt' | 'steht';

/** Nummern der Scharen: 1, 2, 3 ... nach Banner. Ein Banner mit nur einer Einheit ist keine Schar. */
export function scharNummern(einheiten: readonly UnitState[]): Map<number, number> {
  const zaehl = new Map<number, number>();
  for (const u of einheiten) if (u.verband !== null) zaehl.set(u.verband, (zaehl.get(u.verband) ?? 0) + 1);
  const banner = [...zaehl]
    .filter(([, n]) => n > 1)
    .map(([v]) => v)
    .sort((a, b) => a - b);
  return new Map(banner.map((v, i) => [v, i + 1]));
}

/** Die Gruppen des Heeres: erst die Scharen nach Nummer, dann die Felder nach erster Einheit. */
export function heerGruppen(einheiten: readonly UnitState[]): HeerGruppe[] {
  const nummern = scharNummern(einheiten);
  const m = new Map<string, HeerGruppe>();
  for (const u of [...einheiten].sort((a, b) => a.id - b.id)) {
    const nr = u.verband !== null ? nummern.get(u.verband) : undefined;
    const key = nr !== undefined ? `s:${u.verband}` : `f:${u.q}:${u.r}`;
    const g = m.get(key);
    if (g) g.einheiten.push(u);
    else
      m.set(key, {
        key,
        schar: nr ?? null,
        verband: nr !== undefined ? u.verband : null,
        q: u.q,
        r: u.r,
        einheiten: [u],
      });
  }
  return [...m.values()].sort(
    (a, b) => (a.schar ?? Infinity) - (b.schar ?? Infinity) || a.einheiten[0]!.id - b.einheiten[0]!.id,
  );
}

/** Steht eine Einheit ohne Auftrag herum - kein Ziel, kein Erkunden, kein Gefolge? */
export const untaetig = (u: UnitState): boolean => u.ziel === null && u.folgt === null && u.auftrag !== 'erkunden';

/** Was eine Gruppe gerade tut. kampf: Feldschluessel mit Kampf (core/combat.ts, kampfFelder). */
export function gruppenStatus(g: HeerGruppe, kampf: ReadonlySet<string>): HeerStatus {
  if (g.einheiten.some((u) => kampf.has(`${u.q}:${u.r}`))) return 'kaempft';
  if (g.einheiten.some((u) => u.ziel !== null)) return 'zieht';
  if (g.einheiten.some((u) => u.auftrag === 'erkunden')) return 'erkundet';
  if (g.einheiten.some((u) => u.folgt !== null)) return 'folgt';
  return 'steht';
}

export function gruppenName(g: HeerGruppe): string {
  if (g.schar !== null) return `Schar ${g.schar}`;
  if (g.einheiten.length > 1) return 'Verband';
  const u = g.einheiten[0]!;
  return u.kind === 'held' ? 'Held' : u.kind === 'bogen' ? 'Bogenschuetze' : 'Ritter';
}

/** Wie eine Einheit heisst - je Art nach Nummer gezaehlt: "Ritter 2", "Bogenschuetze 1". */
export function einheitNamen(einheiten: readonly UnitState[]): Map<number, string> {
  const zaehler = new Map<string, number>();
  const out = new Map<number, string>();
  for (const u of [...einheiten].sort((a, b) => a.id - b.id)) {
    if (u.kind === 'held') {
      out.set(u.id, 'Held');
      continue;
    }
    const n = (zaehler.get(u.kind) ?? 0) + 1;
    zaehler.set(u.kind, n);
    out.set(u.id, `${u.kind === 'bogen' ? 'Bogenschuetze' : 'Ritter'} ${n}`);
  }
  return out;
}
