/**
 * Ausloeser: "Wenn X geschieht, dann Y" (ENGINE_KARTEN.md, 1.1).
 *
 * Laeuft nach jeder Aktion ueber die Ereignisse, die sie hervorgebracht hat -
 * Bauten, Wuerfe, Ertraege, Kaempfe, Karawanen, Handel, Jahreszeiten. Jede
 * aktive Karte mit einer Wenn-Wirkung, deren Anlass passt, gibt ihren Lohn.
 *
 * Keine Kettenreaktion: gelesen wird nur, was VOR dem Aufruf geschah. Ein
 * Lohn loest keinen Ausloeser aus. Kartenwahlen landen als Beute und sind
 * durch die Wahlen je Zug gedeckelt.
 */

import { cardById } from './catalog';
import { basisKennung } from './plus';
import { dauerwirkungen } from './types';
import type { Anlass, Lasting, Lohn } from './types';
import { kontextVon, wirksameKarten, wirkungenVon } from './wirkung';
import { maxLeben, spielerAus, istSpielerSeite } from '../combat';
import { Rng } from '../rng';
import { RESOURCES } from '../types';
import { emptyHand } from '../state';
import type { GameState, Hand, PlayerId } from '../state';
import { geben } from '../rules/ruhm';
import type { RuhmEvent } from '../rules/ruhm';

export type AusloeserEvent = {
  /** Eine Karte hat ausgeloest. */
  t: 'kartenLohn';
  player: PlayerId;
  card: string;
  gained: Hand;
  ruhm: number;
  wahl: number;
  /** Um wie viel ihr Zaehler wuchs. */
  zaehler: number;
};

type Ereignis = { t: string } & Record<string, unknown>;
type Ausgabe = { push(...e: (AusloeserEvent | RuhmEvent)[]): number };

/** Ein Vorkommen eines Anlasses: wer, wie viel, wo. */
type Vorkommen = { player: PlayerId; menge: number; q?: number; r?: number; karte?: string };

const FEINDE = new Set(['raeuber', 'goblin', 'schleim', 'morast', 'wolf']);

/** Alle Vorkommen eines Anlasses in den Ereignissen. */
function vorkommen(s: GameState, a: Anlass, geschehen: readonly Ereignis[], jahreszeit: boolean): Vorkommen[] {
  const out: Vorkommen[] = [];
  const alle = (menge = 1) => s.players.filter((p) => !p.besiegt).map((p) => ({ player: p.id, menge }));
  for (const e of geschehen) {
    switch (a.bei) {
      case 'strasse':
      case 'dorf':
      case 'stadt': {
        const kind = a.bei === 'strasse' ? 'road' : a.bei === 'dorf' ? 'settlement' : 'city';
        if (e.t === 'build' && e.kind === kind) out.push({ player: e.player as PlayerId, menge: 1 });
        break;
      }
      case 'karawane':
        if (e.t === 'caravanArrived') {
          const g = (e.gained as Record<string, number>) ?? {};
          out.push({ player: e.player as PlayerId, menge: Math.max(1, Object.values(g).reduce((n, x) => n + (x ?? 0), 0)) });
        }
        break;
      case 'wurf':
        if (e.t === 'roll') {
          const d = e.dice as [number, number];
          if (a.zahlen && !a.zahlen.includes(d[0] + d[1])) break;
          if ((a.wer ?? 'jeder') === 'ich') out.push({ player: e.player as PlayerId, menge: 1 });
          else out.push(...alle());
        }
        break;
      case 'ertrag':
        if (e.t === 'production') {
          for (const [id, h] of Object.entries(e.payout as Record<PlayerId, Hand>)) {
            const n = a.resource ? (h[a.resource] ?? 0) : RESOURCES.reduce((x, r) => x + (h[r] ?? 0), 0);
            if (n > 0) out.push({ player: id, menge: n });
          }
        }
        break;
      case 'kampfSieg':
      case 'raubzugAbgewehrt':
        if (e.t === 'fight' && e.ende && typeof e.sieger === 'string' && istSpielerSeite(e.sieger)) {
          const verluste = (e.verluste as { seite: string; kind: string; anzahl: number }[]) ?? [];
          if (a.bei === 'raubzugAbgewehrt' && !verluste.some((v) => FEINDE.has(v.kind) && !istSpielerSeite(v.seite))) break;
          out.push({ player: spielerAus(e.sieger), menge: 1, q: e.q as number, r: e.r as number });
        } else if (a.bei === 'raubzugAbgewehrt' && e.t === 'burnPrevented') {
          out.push({ player: e.player as PlayerId, menge: 1, q: e.q as number, r: e.r as number });
        }
        break;
      case 'lager':
        if (e.t === 'nestDestroyed') for (const id of (e.players as PlayerId[]) ?? []) out.push({ player: id, menge: 1, q: e.q as number, r: e.r as number });
        break;
      case 'ruine':
        if (e.t === 'ruin') out.push({ player: e.player as PlayerId, menge: 1, q: e.q as number, r: e.r as number });
        break;
      case 'auftrag':
        if (e.t === 'questDone') out.push({ player: e.player as PlayerId, menge: 1 });
        break;
      case 'handel':
        if (e.t === 'trade') {
          if (a.kurs !== undefined && (e.ratio as number) > a.kurs) break;
          out.push({ player: e.player as PlayerId, menge: 1 });
        } else if (e.t === 'tradeSettled' && a.kurs === undefined) {
          out.push({ player: e.from as PlayerId, menge: 1 }, { player: e.to as PlayerId, menge: 1 });
        }
        break;
      case 'markt':
        if (e.t === 'market') out.push({ player: e.player as PlayerId, menge: 1 });
        break;
      case 'karte':
        if (e.t === 'cardTaken') out.push({ player: e.player as PlayerId, menge: 1, karte: e.card as string });
        break;
      case 'bossBesiegt':
        if (e.t === 'bossBesiegt') out.push({ player: e.player as PlayerId, menge: 1 });
        break;
      case 'pluenderung':
        if (e.t === 'plunder' && (e.count as number) > 0) out.push({ player: e.player as PlayerId, menge: 1 });
        break;
      case 'jahreszeit':
        break;
    }
  }
  if (a.bei === 'jahreszeit' && jahreszeit) out.push(...alle());
  return out;
}

/** Einheiten heilen: am Feld des Ereignisses, sonst der Held - zur Jahreszeit alle. */
function heilen(s: GameState, id: PlayerId, amount: number, q: number | undefined, r: number | undefined, alleEigenen: boolean): void {
  const eigene = s.units.filter((u) => u.owner === id);
  const wer = alleEigenen
    ? eigene
    : q !== undefined && r !== undefined && eigene.some((u) => u.q === q && u.r === r)
      ? eigene.filter((u) => u.q === q && u.r === r)
      : eigene.filter((u) => u.kind === 'held');
  for (const u of wer) u.leben = Math.min(maxLeben(u), u.leben + amount);
}

export function ausloeserAusEreignissen(
  s: GameState,
  geschehen: readonly Ereignis[],
  out: Ausgabe,
  optionen: { jahreszeit: boolean },
): void {
  const reihe = [...s.order.slice(s.current), ...s.order.slice(0, s.current)];
  let rng: Rng | null = null;
  const zufall = () => (rng ??= new Rng(s.rngState));

  for (const id of reihe) {
    const p = s.players.find((x) => x.id === id);
    if (!p || p.besiegt) continue;
    const karten = wirksameKarten(p);
    const wenn: { karte: string; i: number; l: Extract<Lasting, { t: 'wenn' }> }[] = [];
    for (const k of karten) {
      const c = cardById(k);
      if (!c) continue;
      dauerwirkungen(c).forEach((l, i) => {
        if (l.t === 'wenn') wenn.push({ karte: k, i, l });
      });
    }
    if (wenn.length === 0) continue;
    const m = wirkungenVon(s, id);
    const kontext = kontextVon(s, id);

    for (const { karte, i, l } of wenn) {
      const treffer = vorkommen(s, l.anlass, geschehen, optionen.jahreszeit).filter((v) => v.player === id && v.karte !== karte);
      // Weltenbaum: zum Jahreszeitwechsel loest jede Wenn-Karte einmal aus.
      if (m.ausloeserJahr && optionen.jahreszeit && l.anlass.bei !== 'jahreszeit') treffer.push({ player: id, menge: 1 });
      if (treffer.length === 0) continue;
      const mal = m.nachhall.includes('*') || m.nachhall.includes(l.anlass.bei) ? 2 : 1;
      const lohnListe: readonly Lohn[] = Array.isArray(l.dann) ? (l.dann as readonly Lohn[]) : [l.dann as Lohn];
      const gained = emptyHand();
      let ruhm = 0;
      let wahl = 0;
      let zaehlerPlus = 0;

      for (const v of treffer) {
        for (let wdh = 0; wdh < mal; wdh++) {
          // Hoechstens jeZug-mal je Zug.
          const schl = `${karte}#${i}`;
          if (l.jeZug !== undefined) {
            if (!p.zaehlerZug || p.zaehlerZug.turn !== s.turn) p.zaehlerZug = { turn: s.turn, n: {} };
            if ((p.zaehlerZug.n[schl] ?? 0) >= l.jeZug) continue;
            p.zaehlerZug.n[schl] = (p.zaehlerZug.n[schl] ?? 0) + 1;
          }
          // Nur jedes n-te Mal.
          if (l.jedesNte !== undefined && l.jedesNte > 1) {
            const nk = `${karte}#n${i}`;
            p.zaehler = { ...(p.zaehler ?? {}), [nk]: (p.zaehler?.[nk] ?? 0) + 1 };
            if (p.zaehler[nk]! % l.jedesNte !== 0) continue;
          }
          for (const lohn of lohnListe) {
            switch (lohn.t) {
              case 'gain':
                for (const r of RESOURCES) {
                  p.hand[r] += lohn.resources[r] ?? 0;
                  gained[r] += lohn.resources[r] ?? 0;
                }
                break;
              case 'gainAny':
                for (let k = 0; k < lohn.count; k++) {
                  const r = RESOURCES[zufall().int(RESOURCES.length)]!;
                  p.hand[r] += 1;
                  gained[r] += 1;
                }
                break;
              case 'gainJe': {
                const n = Math.max(0, Math.min(lohn.max, Math.floor(kontext.groesse(lohn.je, karte) / Math.max(1, lohn.pro))));
                for (let k = 0; k < n; k++) {
                  const r = lohn.resource ?? RESOURCES[zufall().int(RESOURCES.length)]!;
                  p.hand[r] += 1;
                  gained[r] += 1;
                }
                break;
              }
              case 'ruhm':
                ruhm += lohn.amount;
                break;
              case 'zaehler': {
                const n = lohn.amount === 'menge' ? v.menge : lohn.amount;
                const k = lohn.key ?? basisKennung(karte);
                p.zaehler = { ...(p.zaehler ?? {}), [k]: (p.zaehler?.[k] ?? 0) + n };
                zaehlerPlus += n;
                break;
              }
              case 'wahl':
                // Ausserhalb der Wahlen je Zug, wie Trophaeen (rules/reducer.ts, claimLoot).
                p.kartenWahl = (p.kartenWahl ?? 0) + lohn.anzahl;
                wahl += lohn.anzahl;
                break;
              case 'heilen':
                heilen(s, id, lohn.amount, v.q, v.r, l.anlass.bei === 'jahreszeit');
                break;
            }
          }
        }
      }
      if (ruhm > 0) geben(s, id, ruhm, 'karte', out);
      const etwas = ruhm > 0 || wahl > 0 || zaehlerPlus > 0 || RESOURCES.some((r) => gained[r] > 0);
      if (etwas) out.push({ t: 'kartenLohn', player: id, card: karte, gained, ruhm, wahl, zaehler: zaehlerPlus });
    }
  }
  if (rng) s.rngState = (rng as Rng).getState();
}
