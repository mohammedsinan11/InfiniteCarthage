/**
 * Ein Ereignis mit Wahl (core/ereignis.ts) als Tafel ueber der Karte.
 *
 * Im Stil der Kartenwahl, aber als Brief statt als Karten: Titel, zwei Saetze
 * Geschichte, darunter die Antworten als Knoepfe. Was man sich nicht leisten
 * kann oder wofuer der Held fehlt, ist ausgegraut - mit dem Grund daneben,
 * statt nur stumm gesperrt.
 */

import type { PublicState } from '../../core/redact';
import { ereignisById } from '../../core/ereignis';
import type { Folge } from '../../core/ereignis';
import { wahlHindernis } from '../../core/rules/reducer';
import { SEASON_NAME, seasonOf } from '../../core/season';
import { PROBE_NAME, begegnungById, heldStufeVon, probeBonus } from '../../core/heldenpfad';

/** Wie wahrscheinlich zwei Wuerfel mindestens n zeigen. */
/** Was eine Folge bringt, ganz kurz - fuer "gelingt / misslingt" an einer Probe. */
function folgeKurz(f: Folge): string {
  const teile: string[] = [];
  if (f.relikt) teile.push('Relikt');
  if (f.beute) teile.push(f.beute === 1 ? 'Kartenwahl' : `${f.beute} Kartenwahlen`);
  if (f.ruhm) teile.push(`${f.ruhm} Ruhm`);
  if (f.ritter) teile.push(f.ritter === 1 ? 'ein Ritter' : `${f.ritter} Ritter`);
  if (f.schmiede) teile.push('Schmiedearbeit');
  const roh = Object.values(f.gib ?? {}).reduce<number>((n, x) => n + (x ?? 0), 0) + (f.zufall ?? 0);
  if (roh > 0) teile.push(`${roh} Rohstoffe`);
  if (f.heilen) teile.push('Heilung');
  if (f.xp) teile.push(`${f.xp} Erfahrung`);
  if (f.wunde) teile.push(`${f.wunde} ${f.wunde === 1 ? 'Wunde' : 'Wunden'}`);
  if (f.verliere) teile.push(`${f.verliere} ${f.verliere === 1 ? 'Karte' : 'Karten'} weg`);
  return teile.length > 0 ? teile.join(', ') : 'nichts';
}

function chanceMit(n: number): number {
  let gut = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= n) gut += 1;
  return gut / 36;
}

export function EreignisTafel({
  state,
  you,
  onWahl,
}: {
  state: PublicState;
  you: string | null;
  onWahl: (i: number) => void;
}) {
  const offen = state.ereignis;
  const e = offen ? ereignisById(offen.id) : undefined;
  if (!offen || !e) return null;
  const meins = offen.player === you;
  const wer = state.players.find((p) => p.id === offen.player)?.name ?? 'Jemand';

  return (
    <div className="draft-overlay ereignis-huelle">
      <div className="ereignis">
        <span className="ereignis-zeit">{SEASON_NAME[seasonOf(state.turn)]} · {begegnungById(offen.id) ? 'Begegnung' : 'Ereignis'}</span>
        <h2>{e.titel}</h2>
        <p className="ereignis-text">{e.text}</p>
        {meins ? (
          <div className="ereignis-wahlen">
            {e.wahlen.map((w, i) => {
              const grund = wahlHindernis(state, offen.player, w.folge, w.brauchtHeld ?? false);
              // Eine Probe zeigt, wie gut die Chancen stehen (core/heldenpfad.ts).
              const p = state.players.find((x) => x.id === offen.player);
              const bonus = w.probe ? probeBonus(heldStufeVon(p?.heldXp ?? 0), p?.eigenschaften ?? [], w.probe.art, p?.narben ?? 0) : 0;
              const chance = w.probe ? chanceMit(w.probe.ziel - bonus) : 0;
              return (
                <button key={i} disabled={grund !== null} title={grund ?? undefined} onClick={() => onWahl(i)}>
                  {w.text}
                  {w.probe && (
                    <span className="ereignis-probe">
                      Probe {PROBE_NAME[w.probe.art]}: {w.probe.ziel}+ mit 2 Wuerfeln, dein Bonus +{bonus} · {Math.round(chance * 100)}%
                    </span>
                  )}
                  {w.probe && (
                    <span className="ereignis-probe">
                      Gelingt: {folgeKurz(w.probe.gelingt)} · Misslingt: {folgeKurz(w.probe.misslingt)}
                    </span>
                  )}
                  {grund && <span className="ereignis-grund">{grund}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="note">{wer} entscheidet...</p>
        )}
      </div>
    </div>
  );
}
