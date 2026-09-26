/**
 * Das Profil dieses Browsers: Partien, Siege, beste Wertung, freigeschaltete
 * Chronikstufe, gespielte Haeuser - und die Taten.
 *
 * Es gibt keine Konten (REPLAYABILITY.md, H). Was hier steht, lebt im
 * localStorage und gehoert dem Geraet, nicht dem Spieler; wer den Browser
 * wechselt, beginnt von vorn. Fuer den Anfang genuegt das: es gibt einen Grund,
 * die naechste Partie anzufangen, und es kostet keinen Server.
 *
 * Gewertet wird jede Partie genau einmal, wenn sie endet (ui/Chronik.tsx) -
 * die Raumcodes merkt sich das Profil, damit ein Neuladen nichts doppelt zaehlt.
 */

import type { PublicState } from '../core/redact';
import { MAX_STUFE } from '../core/stufe';
import { HAEUSER } from '../core/haus';
import { cardById } from '../core/cards/catalog';
import { roundOf } from '../core/season';
import { heldVoll } from '../core/lore';
import type { HeldLore } from '../core/lore';
import { familienart, freieErbstuecke, istErbstueck } from '../core/erbe';
import type { ErbstueckId, Familienart } from '../core/erbe';
import { weltArtVon } from '../core/weltart';

const SPEICHER = 'infinitecarthage.profil';

export type Profil = {
  partien: number;
  siege: number;
  besteWertung: number;
  /** Die hoechste Chronikstufe, die man waehlen darf. */
  stufeFrei: number;
  /** Mit welchen Haeusern man schon gespielt hat. */
  haeuser: string[];
  /** Tat-Kennung -> Zeitpunkt (ms). */
  taten: Record<string, number>;
  /** Schon gewertete Raeume (die letzten 50). */
  gewertet: string[];
  /** Beste Sterne je Szenario (core/szenario.ts). */
  sterne: Record<string, number>;
  /** Die Ahnenhalle: wer in frueheren Partien fuer dich stand, neueste zuerst. */
  ahnen: Ahne[];
  /** Tritt der Nachfolger des letzten Helden an? Fehlt: ja. */
  dynastie?: boolean;
  /** Das Erbstueck fuer die naechste Partie (core/erbe.ts). */
  erbstueck?: ErbstueckId;
};

/**
 * Ein Eintrag der Ahnenhalle: der Held einer beendeten Partie und was aus
 * seinem Reich wurde. Rein erzaehlend - er gibt der naechsten Partie keinen
 * Vorteil, nur eine Geschichte (REPLAYABILITY.md, H - Dynastie).
 */
export type Ahne = {
  zeit: number;
  /** "Aldebrand der Kuehne, Markgraf von Sturmfels" - oder der Spielername, wenn kein Held antrat. */
  name: string;
  haus: string | null;
  welt: string;
  wertung: number;
  sieg: boolean;
  /** Ein Satz: was er vollbracht hat. */
  tat: string;
  /** Der Held selbst - sein Nachfolger tritt in der naechsten Partie an. */
  lore?: HeldLore;
  /** Die Zahlen der Partie - fuer Familienart und Erbstuecke (core/erbe.ts). */
  zahlen?: { staedte: number; lager: number; handel: number; ruinen: number; auftraege: number; wunder: number };
  /** Welche Erbstuecke diese Partie freigeschaltet hat. */
  freie?: ErbstueckId[];
  /** Das Erbstueck, das diese Generation mitbrachte. */
  erbstueck?: ErbstueckId;
  /** Der Raum - damit die Chronik das Erbe dieser Partie findet. */
  code?: string;
};

/** Das Erbstueck, das die naechste Generation mitnimmt (core/erbe.ts). */
export function aktuellesErbstueck(): ErbstueckId | undefined {
  return leseProfil().erbstueck;
}

export function setzeErbstueck(id: ErbstueckId): void {
  const p = leseProfil();
  p.erbstueck = id;
  schreibe(p);
}

/** Die Familienart aus den letzten fuenf Generationen. */
export function unsereArt(): Familienart | null {
  return familienart(leseProfil().ahnen.slice(0, 5).flatMap((a) => (a.zahlen ? [a.zahlen] : [])));
}

/** Der juengste Ahn mit Held - fuer die naechste Partie (Dynastie). */
export function letzterAhn(): HeldLore | undefined {
  const p = leseProfil();
  if (p.dynastie === false) return undefined;
  return p.ahnen.find((a) => a.lore)?.lore;
}

/** Die Dynastie fortfuehren oder mit einem neuen Geschlecht beginnen. */
export function setzeDynastie(an: boolean): void {
  const p = leseProfil();
  p.dynastie = an;
  schreibe(p);
}

const AHNEN_MAX = 12;

const LEER: Profil = { partien: 0, siege: 0, besteWertung: 0, stufeFrei: 0, haeuser: [], taten: {}, gewertet: [], sterne: {}, ahnen: [] };

export function leseProfil(): Profil {
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null') as Partial<Profil> | null;
    return { ...LEER, ...(roh ?? {}) };
  } catch {
    return { ...LEER };
  }
}

function schreibe(p: Profil): void {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(p));
  } catch {
    // Privater Modus - dann gilt es nur fuer diese Sitzung.
  }
}

/** Was eine beendete Partie ueber den Spieler sagt - fuer die Taten. */
type Blick = {
  state: PublicState;
  you: string;
  sieg: boolean;
  wertung: number;
  profil: Profil;
};

export type Tat = { id: string; name: string; text: string; erreicht: (b: Blick) => boolean };

const stats = (b: Blick) => b.state.chronik?.stats[b.you];
const eigene = (b: Blick) => Object.values(b.state.buildings).filter((x) => x.owner === b.you);

export const TATEN: readonly Tat[] = [
  { id: 'erste_partie', name: 'Die erste Chronik', text: 'Beende eine Partie.', erreicht: () => true },
  { id: 'erster_sieg', name: 'Sieger', text: 'Gewinne eine Partie.', erreicht: (b) => b.sieg },
  { id: 'tagesexpedition', name: 'Expeditionsteilnehmer', text: 'Beende eine Tagesexpedition.', erreicht: (b) => b.state.tagesDatum !== null },
  { id: 'stadtbauer', name: 'Stadtbauer', text: 'Besitze am Ende 4 Staedte.', erreicht: (b) => eigene(b).filter((x) => x.type === 'city').length >= 4 },
  {
    id: 'hauptstadt',
    name: 'Die Krone',
    text: 'Gruende eine Hauptstadt.',
    erreicht: (b) => Object.values(b.state.hauptstaedte ?? {}).some((h) => h.owner === b.you),
  },
  { id: 'lagerbrecher', name: 'Lagerbrecher', text: 'Zerstoere 3 Lager in einer Partie.', erreicht: (b) => (stats(b)?.lager ?? 0) >= 3 },
  { id: 'entdecker', name: 'Entdecker', text: 'Erkunde 4 Ruinen in einer Partie.', erreicht: (b) => (stats(b)?.ruinen ?? 0) >= 4 },
  { id: 'wanderfreund', name: 'Freund der Wanderer', text: 'Erfuelle 3 Auftraege in einer Partie.', erreicht: (b) => (stats(b)?.auftraege ?? 0) >= 3 },
  { id: 'sammler', name: 'Sammler', text: 'Nimm 8 Karten in einer Partie.', erreicht: (b) => (stats(b)?.karten ?? 0) >= 8 },
  {
    id: 'legende',
    name: 'Legende',
    text: 'Besitze eine legendaere Karte.',
    erreicht: (b) => (b.state.players.find((p) => p.id === b.you)?.cards ?? []).some((id) => cardById(id)?.rarity === 'legendaer'),
  },
  { id: 'haendler', name: 'Handelsherr', text: 'Handle 15 Mal in einer Partie.', erreicht: (b) => (stats(b)?.handel ?? 0) >= 15 },
  { id: 'ruhm', name: 'Beruehmt', text: 'Sammle 10 Ruhm in einer Partie.', erreicht: (b) => (b.state.players.find((p) => p.id === b.you)?.ruhm ?? 0) >= 10 },
  {
    id: 'entscheider',
    name: 'Der Entscheider',
    text: 'Entscheide 5 Ereignisse in einer Partie.',
    erreicht: (b) => (b.state.chronik?.momente ?? []).filter((m) => m.art === 'ereignis' && m.player === b.you).length >= 5,
  },
  {
    id: 'unversehrt',
    name: 'Unversehrt',
    text: 'Spiele ein ganzes Jahr, ohne dass etwas von dir niederbrennt.',
    erreicht: (b) => roundOf(b.state.turn) >= 60 && (stats(b)?.abgebrannt ?? 1) === 0,
  },
  { id: 'wertung100', name: 'Hundert', text: 'Erreiche eine Wertung von 100.', erreicht: (b) => b.wertung >= 100 },
  { id: 'wertung200', name: 'Zweihundert', text: 'Erreiche eine Wertung von 200.', erreicht: (b) => b.wertung >= 200 },
  {
    id: 'alle_haeuser',
    name: 'Alle Haeuser',
    text: 'Spiele mit jedem Haus mindestens einmal.',
    erreicht: (b) => HAEUSER.every((h) => b.profil.haeuser.includes(h.id)),
  },
  { id: 'stufe3', name: 'Vogt', text: 'Gewinne auf Chronikstufe 3.', erreicht: (b) => b.sieg && b.state.stufe >= 3 },
  { id: 'stufe6', name: 'Koenig', text: 'Gewinne auf Chronikstufe 6.', erreicht: (b) => b.sieg && b.state.stufe >= 6 },
  {
    id: 'phoenix',
    name: 'Phoenix',
    text: 'Verliere dein letztes Gebaeude - und baue dein Reich wieder auf.',
    erreicht: (b) => (b.state.chronik?.momente ?? []).some((m) => m.player === b.you && m.text.includes('baut das Reich wieder auf')),
  },
];

/** Das Bemerkenswerteste einer Partie in einem Satz. */
function ahnenTat(state: PublicState, you: string, sieg: boolean): string {
  const st = state.chronik?.stats[you];
  const eigen = Object.values(state.buildings).filter((b) => b.owner === you);
  const staedte = eigen.filter((b) => b.type === 'city').length;
  const teile: string[] = [];
  if (Object.values(state.wunder ?? {}).some((w) => w.owner === you)) teile.push('errichtete ein Weltwunder');
  if (Object.values(state.hauptstaedte ?? {}).some((h) => h.owner === you)) teile.push('gruendete eine Hauptstadt');
  if ((st?.lager ?? 0) >= 2) teile.push(`zerstoerte ${st!.lager} Lager`);
  if ((st?.ruinen ?? 0) >= 2) teile.push(`erkundete ${st!.ruinen} Ruinen`);
  if ((st?.auftraege ?? 0) >= 2) teile.push(`erfuellte ${st!.auftraege} Auftraege`);
  if (teile.length < 2 && staedte > 0) teile.push(`baute ${staedte} ${staedte === 1 ? 'Stadt' : 'Staedte'}`);
  if (teile.length === 0) teile.push(`hielt ${eigen.length} ${eigen.length === 1 ? 'Siedlung' : 'Siedlungen'}`);
  const satz = teile.slice(0, 2).join(' und ');
  return sieg ? `Siegte, ${satz}.` : `${satz[0]!.toUpperCase()}${satz.slice(1)}.`;
}

function ahneAus(state: PublicState, you: string, wertung: number, sieg: boolean, code: string): Ahne {
  const me = state.players.find((p) => p.id === you);
  const held = me?.held;
  const st = state.chronik?.stats[you];
  const zahlen = {
    staedte: Object.values(state.buildings).filter((b) => b.owner === you && b.type === 'city').length,
    lager: st?.lager ?? 0,
    handel: st?.handel ?? 0,
    ruinen: st?.ruinen ?? 0,
    auftraege: st?.auftraege ?? 0,
    wunder: Object.values(state.wunder ?? {}).filter((w) => w.owner === you).length,
  };
  return {
    zeit: Date.now(),
    name: held ? `${heldVoll(held)}${held.folge > 1 ? ` (${held.folge}. Generation)` : ''}` : (me?.name ?? 'Unbekannt'),
    haus: me?.haus ?? null,
    welt: weltArtVon(state.worldSeed).name,
    wertung,
    sieg,
    tat: ahnenTat(state, you, sieg),
    ...(held ? { lore: held } : {}),
    zahlen,
    freie: freieErbstuecke(zahlen),
    ...(istErbstueck(me?.erbstueck) ? { erbstueck: me!.erbstueck as ErbstueckId } : {}),
    code,
  };
}

export type Wertung = { neueTaten: Tat[]; neueStufe: number | null; sieg: boolean; schonGewertet: boolean };

/**
 * Eine beendete Partie ins Profil eintragen. Sieg heisst: man ist Sieger und
 * hat entweder das Ziel erreicht, gegen andere gewonnen oder allein im Jahr
 * mindestens 10 Siegpunkte geholt - ein Jahr einfach abzusitzen zaehlt nicht.
 */
export function werteAus(state: PublicState, you: string, code: string): Wertung {
  const profil = leseProfil();
  const phase = state.phase;
  if (phase.t !== 'finished') return { neueTaten: [], neueStufe: null, sieg: false, schonGewertet: true };
  const i = state.order.indexOf(you);
  const letzte = state.chronik?.verlauf[state.chronik.verlauf.length - 1];
  const punkte = letzte?.punkte[i] ?? state.myPoints;
  const me = state.players.find((p) => p.id === you);
  const wertung = punkte * 10 + (me?.ruhm ?? 0);
  // Gemeinsam gewinnen alle oder keiner; sonst wie oben beschrieben.
  const sieg = state.szenario
    ? state.szenarioErgebnis?.erreicht === true
    : state.koop
    ? state.koopErgebnis?.erfolg === true
    : phase.winner === you && (phase.durch === 'ziel' || state.order.length > 1 || punkte >= 10);
  if (profil.gewertet.includes(code)) return { neueTaten: [], neueStufe: null, sieg, schonGewertet: true };

  profil.partien += 1;
  if (sieg) profil.siege += 1;
  profil.besteWertung = Math.max(profil.besteWertung, wertung);
  if (me?.haus && !profil.haeuser.includes(me.haus)) profil.haeuser.push(me.haus);
  let neueStufe: number | null = null;
  if (state.szenario && state.szenarioErgebnis?.erreicht) {
    profil.sterne = { ...profil.sterne, [state.szenario]: Math.max(profil.sterne[state.szenario] ?? 0, state.szenarioErgebnis.sterne) };
  }
  // Die Chronikstufen schaltet nur eine freie Partie frei, kein Szenario.
  if (sieg && !state.szenario && state.stufe >= profil.stufeFrei && profil.stufeFrei < MAX_STUFE) {
    profil.stufeFrei = state.stufe + 1;
    neueStufe = profil.stufeFrei;
  }
  profil.ahnen = [ahneAus(state, you, wertung, sieg, code), ...profil.ahnen].slice(0, AHNEN_MAX);
  const blick: Blick = { state, you, sieg, wertung, profil };
  const neueTaten = TATEN.filter((t) => !profil.taten[t.id] && t.erreicht(blick));
  for (const t of neueTaten) profil.taten[t.id] = Date.now();
  profil.gewertet = [...profil.gewertet, code].slice(-50);
  schreibe(profil);
  return { neueTaten, neueStufe, sieg, schonGewertet: false };
}
