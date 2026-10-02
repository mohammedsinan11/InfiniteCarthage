/**
 * Der Heldenpfad (C9-C11, nach Slay the Spire, Darkest Dungeon, DnD).
 *
 * PFADE. Zu Beginn jeder grossen Runde bietet die Welt dem Helden bis zu drei
 * Ziele an - eine Ruine, ein Lager, einen besonderen Ort - jedes mit sichtbarer
 * Gefahr (1 bis 3) und einem Lohn. Man waehlt eines (oder keines), der Held
 * bricht auf. Das ist die Wegwahl von Slay the Spire auf der echten Karte.
 *
 * BEGEGNUNGEN. Wer ankommt, erlebt eine kleine Geschichte mit Wahlen, manche
 * mit einer PROBE: zwei Wuerfel plus Bonus gegen eine Zahl. Mut, Geschick oder
 * Klugheit - die Eigenschaften des Helden helfen. Gelingt sie, winken Relikte,
 * Kartenwahlen, Ruhm; misslingt sie, gibt es Wunden oder Verluste.
 *
 * WACHSTUM. Begegnungen bringen Erfahrung. Mit jeder Stufe waehlt man aus drei
 * Eigenschaften eine. RELIKTE sind Ausruestung mit Dauerwirkung - sie wirken
 * wie Reichskarten (cards/wirkung.ts), ohne einen Platz zu belegen.
 *
 * TOD. Faellt der Held, gehen seine Relikte bis auf eines verloren
 * (rules/army.ts, heldFaellt) - ein Fall ist kein Wegklicken mehr.
 *
 * Alles rein und aus dem Weltseed; nur mit dem System 'held' (core/systeme.ts).
 */

import { hash3i } from './hash';
import { Rng } from './rng';
import type { Ereignis } from './ereignis';
import type { Card } from './cards/types';
import type { PlayerId } from './state';

export type Probe = 'mut' | 'geschick' | 'klugheit';
export const PROBE_NAME: Record<Probe, string> = { mut: 'Mut', geschick: 'Geschick', klugheit: 'Klugheit' };

export type PfadArt = 'ruine' | 'lager' | 'ort';

export type PfadZiel = {
  q: number;
  r: number;
  art: PfadArt;
  /** Der Name des Ortes, wie er auf der Tafel steht. */
  name: string;
  /** Die Begegnung, die dort wartet (BEGEGNUNGEN). */
  begegnung: string;
  gefahr: 1 | 2 | 3;
  /** Was winkt, ein paar Worte. */
  lohn: string;
};

export type PfadStand = {
  /** Die Ziele zur Wahl - null, wenn keine Wahl offen ist. */
  angebot: PfadZiel[] | null;
  /** Wohin der Held gerade zieht. */
  aktiv: PfadZiel | null;
};

// --- Eigenschaften ---------------------------------------------------------

export type Eigenschaft = {
  id: string;
  name: string;
  text: string;
  /** +2 bei Proben dieser Art. */
  probe?: Probe;
  /** So viel mehr Leben. */
  leben?: number;
  /** Je bestandener Probe: Kartenwahl oder Ruhm. */
  jeProbe?: 'wahl' | 'ruhm';
};

export const EIGENSCHAFTEN: readonly Eigenschaft[] = [
  { id: 'mutig', name: 'Mutig', text: '+2 bei Proben des Mutes.', probe: 'mut' },
  { id: 'gewandt', name: 'Gewandt', text: '+2 bei Proben des Geschicks.', probe: 'geschick' },
  { id: 'klug', name: 'Klug', text: '+2 bei Proben der Klugheit.', probe: 'klugheit' },
  { id: 'zaeh', name: 'Zaeh', text: 'Der Held hat 2 Leben mehr.', leben: 2 },
  { id: 'schatzsucher', name: 'Schatzsucher', text: 'Jede bestandene Probe bringt eine Kartenwahl.', jeProbe: 'wahl' },
  { id: 'beliebt', name: 'Beliebt', text: 'Jede bestandene Probe bringt 1 Ruhm.', jeProbe: 'ruhm' },
];

export const eigenschaftById = (id: string): Eigenschaft | undefined => EIGENSCHAFTEN.find((e) => e.id === id);

/** Ab so viel Erfahrung erreicht der Held die naechste Stufe. */
export const HELD_STUFEN_AB = [3, 7, 12, 18, 25] as const;
export const heldStufeVon = (xp: number): number => HELD_STUFEN_AB.filter((ab) => xp >= ab).length;

/** Drei Eigenschaften zur Wahl, die der Held noch nicht hat. */
export function eigenschaftAngebot(seed: number, stufe: number, spieler: number, schon: readonly string[]): string[] {
  const frei = EIGENSCHAFTEN.map((e) => e.id).filter((id) => !schon.includes(id));
  const rng = new Rng(hash3i(seed, stufe, spieler, 401));
  const out: string[] = [];
  while (out.length < 3 && frei.length > 0) out.push(frei.splice(rng.int(frei.length), 1)[0]!);
  return out;
}

/** Der Bonus des Helden fuer eine Probe: seine Stufe plus passende Eigenschaft. */
export function probeBonus(heldStufe: number, eigenschaften: readonly string[], art: Probe): number {
  return heldStufe + (eigenschaften.some((id) => eigenschaftById(id)?.probe === art) ? 2 : 0);
}

/** Zusaetzliche Leben aus Eigenschaften. */
export const lebenBonus = (eigenschaften: readonly string[] | undefined): number =>
  (eigenschaften ?? []).reduce((n, id) => n + (eigenschaftById(id)?.leben ?? 0), 0);

// --- Relikte -----------------------------------------------------------------

/**
 * Relikte: Ausruestung mit Dauerwirkung, gefunden auf Pfaden. Sie wirken wie
 * Reichskarten, belegen aber keinen Platz (cards/wirkung.ts). Nie im Angebot.
 */
export const RELIKTE: readonly Card[] = [
  { id: 'relikt_kompass', name: 'Kompass der Ahnen', rarity: 'selten', kind: 'ausruestung', wert: 12, text: 'Jede Ruine: 2 zufaellige Rohstoffe.', lasting: { t: 'wenn', anlass: { bei: 'ruine' }, dann: { t: 'gainAny', count: 2 } } },
  { id: 'relikt_horn', name: 'Kriegshorn', rarity: 'selten', kind: 'ausruestung', wert: 12, text: 'Jeder gewonnene Kampf: 1 Ruhm.', lasting: { t: 'wenn', anlass: { bei: 'kampfSieg' }, dann: { t: 'ruhm', amount: 1 }, jeZug: 1 } },
  { id: 'relikt_saatbeutel', name: 'Saatbeutel der Erdmutter', rarity: 'selten', kind: 'ausruestung', wert: 12, text: 'Felder liefern dir +1 Getreide.', lasting: { t: 'terrainBonus', terrain: 'field', amount: 1 } },
  { id: 'relikt_siegel', name: 'Koenigssiegel', rarity: 'selten', kind: 'ausruestung', wert: 12, text: 'Bankhandel kostet dich eine Karte weniger.', lasting: { t: 'tradeDiscount', amount: 1 } },
  { id: 'relikt_amulett', name: 'Schutzamulett', rarity: 'selten', kind: 'ausruestung', wert: 12, text: 'Pluenderer nehmen dir eine Karte weniger.', lasting: { t: 'schutz', amount: 1 } },
  { id: 'relikt_chronik', name: 'Chronik der Vorfahren', rarity: 'episch', kind: 'ausruestung', wert: 17, text: '1 Siegpunkt.', lasting: { t: 'punkte', amount: 1 } },
  { id: 'relikt_glocke', name: 'Versunkene Glocke', rarity: 'selten', kind: 'ausruestung', wert: 12, text: 'Jeder Jahreszeitwechsel: 2 zufaellige Rohstoffe.', lasting: { t: 'wenn', anlass: { bei: 'jahreszeit' }, dann: { t: 'gainAny', count: 2 } } },
  { id: 'relikt_klinge', name: 'Sternenklinge', rarity: 'episch', kind: 'ausruestung', wert: 17, text: 'Jedes zerstoerte Lager: eine Kartenwahl.', lasting: { t: 'wenn', anlass: { bei: 'lager' }, dann: { t: 'wahl', anzahl: 1 } } },
];

/** Ein Relikt, das man noch nicht hat - aus dem Seed. */
export function zufallsRelikt(seed: number, turn: number, schon: readonly string[]): string | null {
  const frei = RELIKTE.map((r) => r.id).filter((id) => !schon.includes(id));
  if (frei.length === 0) return null;
  return frei[new Rng(hash3i(seed, turn, frei.length, 409)).int(frei.length)]!;
}

// --- Begegnungen -------------------------------------------------------------

/**
 * Die Geschichten am Ziel. Wie Ereignisse (core/ereignis.ts), dazu Proben.
 * Jede braucht den Helden - er steht ja dort.
 */
export const BEGEGNUNGEN: readonly Ereignis[] = [
  {
    id: 'b_grabkammer',
    titel: 'Die Grabkammer',
    text: 'Unter der Ruine fuehrt eine Treppe in die Tiefe. Unten ruht ein Fuerst, und neben ihm glaenzt etwas im Fackellicht.',
    wahlen: [
      { text: 'Die Grabbeigaben nehmen', folge: {}, probe: { art: 'mut', ziel: 8, gelingt: { relikt: 'zufall', xp: 1 }, misslingt: { wunde: 2, zufall: 1 } } },
      { text: 'Die Inschriften abschreiben', folge: {}, probe: { art: 'klugheit', ziel: 7, gelingt: { beute: 1 }, misslingt: { zufall: 1 } } },
      { text: 'Den Toten ruhen lassen: +1 Ruhm', folge: { ruhm: 1 } },
    ],
  },
  {
    id: 'b_bibliothek',
    titel: 'Die verschuettete Bibliothek',
    text: 'Zwischen eingestuerzten Regalen liegen Schriftrollen, halb verrottet. Ein Balken knarrt bedrohlich ueber dir.',
    wahlen: [
      { text: 'Die Rollen bergen, bevor alles einstuerzt', folge: {}, probe: { art: 'geschick', ziel: 8, gelingt: { beute: 2 }, misslingt: { wunde: 1, beute: 1 } } },
      { text: 'Nur lesen, was offen liegt', folge: {}, probe: { art: 'klugheit', ziel: 6, gelingt: { beute: 1, xp: 1 }, misslingt: {} } },
    ],
  },
  {
    id: 'b_schatzkammer',
    titel: 'Die Schatzkammer',
    text: 'Eine Tuer mit drei Schloessern, jedes in Form eines Tieres. Hinter ihr klimpert es, wenn man klopft.',
    wahlen: [
      { text: 'Die Raetsel der Schloesser loesen', folge: {}, probe: { art: 'klugheit', ziel: 9, gelingt: { relikt: 'zufall' }, misslingt: { zufall: 1 } } },
      { text: 'Die Tuer aufbrechen', folge: {}, probe: { art: 'mut', ziel: 7, gelingt: { zufall: 4 }, misslingt: { wunde: 2 } } },
    ],
  },
  {
    id: 'b_anfuehrer',
    titel: 'Am Feuer des Anfuehrers',
    text: 'Die Wachen lassen deinen Helden durch. Der Anfuehrer mustert ihn ueber die Flammen hinweg: "Sprich - oder kaempfe."',
    wahlen: [
      { text: 'Ihn zum Zweikampf fordern', folge: {}, probe: { art: 'mut', ziel: 9, gelingt: { ruhm: 3, xp: 2, beute: 1 }, misslingt: { wunde: 3 } } },
      { text: 'Mit ihm verhandeln', folge: {}, probe: { art: 'klugheit', ziel: 8, gelingt: { gib: { ore: 2, lumber: 1 }, ruhm: 1 }, misslingt: { verliere: 2 } } },
      { text: 'Sich still zurueckziehen', folge: {} },
    ],
  },
  {
    id: 'b_steinkreis',
    titel: 'Der Steinkreis',
    text: 'Zwoelf Steine im Kreis, in der Mitte ein flacher Altar. Der Wind steht still, als der Held ihn betritt.',
    wahlen: [
      { text: 'Ein Opfer bringen (2 Getreide)', folge: { zahle: { grain: 2 }, relikt: 'relikt_saatbeutel', xp: 1 } },
      { text: 'Die Zeichen deuten', folge: {}, probe: { art: 'klugheit', ziel: 8, gelingt: { beute: 1, ruhm: 1 }, misslingt: { wunde: 1 } } },
      { text: 'Weiterziehen', folge: {} },
    ],
  },
  {
    id: 'b_bruecke',
    titel: 'Die alte Bruecke',
    text: 'Ueber der Schlucht haengt eine Bruecke aus Seilen. Drueben liegt ein verlassener Wagen, die Ladung noch verschnuert.',
    wahlen: [
      { text: 'Hinueber und den Wagen pluendern', folge: {}, probe: { art: 'geschick', ziel: 8, gelingt: { zufall: 5 }, misslingt: { wunde: 2, zufall: 1 } } },
      { text: 'Die Bruecke flicken (2 Holz): +2 Ruhm', folge: { zahle: { lumber: 2 }, ruhm: 2, xp: 1 } },
    ],
  },
  {
    id: 'b_einsiedler',
    titel: 'Der Einsiedler',
    text: 'In einer Huette aus Moos wohnt ein alter Mann. Er sagt, er habe auf deinen Helden gewartet - seit vierzig Jahren.',
    wahlen: [
      { text: 'Ihm zuhoeren', folge: {}, probe: { art: 'klugheit', ziel: 6, gelingt: { xp: 3 }, misslingt: { xp: 1 } } },
      { text: 'Ihm Vorraete lassen (1 Wolle, 1 Getreide)', folge: { zahle: { wool: 1, grain: 1 }, relikt: 'relikt_chronik' } },
      { text: 'Ihn fuer einen Narren halten', folge: {} },
    ],
  },
  {
    id: 'b_mine',
    titel: 'Die verlassene Mine',
    text: 'Ein Stollen fuehrt in den Berg. Spuren an der Wand: jemand hat hier gegraben, bis er floh. Wovor?',
    wahlen: [
      { text: 'Tief hinein', folge: {}, probe: { art: 'mut', ziel: 8, gelingt: { gib: { ore: 4 }, xp: 1 }, misslingt: { wunde: 2, gib: { ore: 1 } } } },
      { text: 'Nur am Eingang schuerfen: 2 Erz', folge: { gib: { ore: 2 } } },
    ],
  },
  {
    id: 'b_wolfsschlucht',
    titel: 'Die Wolfsschlucht',
    text: 'Augen in der Dunkelheit. Ein Rudel umkreist den Helden, und der Leitwolf ist groesser als ein Pferd.',
    wahlen: [
      { text: 'Den Leitwolf stellen', folge: {}, probe: { art: 'mut', ziel: 9, gelingt: { relikt: 'relikt_horn', ruhm: 2, xp: 2 }, misslingt: { wunde: 3 } } },
      { text: 'Sich vorbeischleichen', folge: {}, probe: { art: 'geschick', ziel: 7, gelingt: { xp: 1, zufall: 1 }, misslingt: { wunde: 1 } } },
    ],
  },
  {
    id: 'b_kapelle',
    titel: 'Die Waldkapelle',
    text: 'Eine kleine Kapelle, ueberwuchert, aber die Glocke haengt noch. Wer sie laeutet, sagen die Bauern, wird gehoert.',
    wahlen: [
      { text: 'Die Glocke laeuten', folge: {}, probe: { art: 'geschick', ziel: 7, gelingt: { relikt: 'relikt_glocke' }, misslingt: { verliere: 1 } } },
      { text: 'Rasten und die Wunden pflegen', folge: { heilen: 3, xp: 1 } },
    ],
  },
];

export const begegnungById = (id: string | null | undefined): Ereignis | undefined => BEGEGNUNGEN.find((b) => b.id === id);

const RUINEN_BEGEGNUNG = ['b_grabkammer', 'b_bibliothek', 'b_schatzkammer'];
const ORTE: { name: string; begegnung: string; gefahr: 1 | 2 | 3; lohn: string }[] = [
  { name: 'Ein Steinkreis', begegnung: 'b_steinkreis', gefahr: 1, lohn: 'Relikt, Kartenwahl' },
  { name: 'Eine alte Bruecke', begegnung: 'b_bruecke', gefahr: 2, lohn: 'Rohstoffe, Ruhm' },
  { name: 'Ein Einsiedler', begegnung: 'b_einsiedler', gefahr: 1, lohn: 'Erfahrung, Relikt' },
  { name: 'Eine verlassene Mine', begegnung: 'b_mine', gefahr: 2, lohn: 'Erz' },
  { name: 'Die Wolfsschlucht', begegnung: 'b_wolfsschlucht', gefahr: 3, lohn: 'Relikt, Ruhm' },
  { name: 'Eine Waldkapelle', begegnung: 'b_kapelle', gefahr: 1, lohn: 'Relikt, Heilung' },
];

/**
 * Die Ziele fuer den Helden: die naechste unerkundete Ruine, das naechste
 * Lager und Orte, so weit es reicht - hoechstens drei. Die Suche nach Ruinen
 * und Lagern macht der Aufrufer (rules/pfad.ts), hier wird nur ausgewaehlt.
 */
export function pfadZiele(
  seed: number,
  turn: number,
  spieler: number,
  ruine: { q: number; r: number } | null,
  lager: { q: number; r: number; name: string } | null,
  orte: readonly { q: number; r: number }[],
): PfadZiel[] {
  const rng = new Rng(hash3i(seed, turn, spieler, 419));
  const out: PfadZiel[] = [];
  if (ruine) {
    out.push({ ...ruine, art: 'ruine', name: 'Eine Ruine', begegnung: RUINEN_BEGEGNUNG[rng.int(RUINEN_BEGEGNUNG.length)]!, gefahr: 2, lohn: 'Relikt, Kartenwahlen' });
  }
  if (lager) out.push({ q: lager.q, r: lager.r, art: 'lager', name: `Das Lager: ${lager.name}`, begegnung: 'b_anfuehrer', gefahr: 3, lohn: 'Ruhm, Erfahrung' });
  const pool = [...ORTE];
  for (const o of orte) {
    if (out.length >= 3 || pool.length === 0) break;
    const ort = pool.splice(rng.int(pool.length), 1)[0]!;
    out.push({ q: o.q, r: o.r, art: 'ort', ...ort });
  }
  return out;
}

export type HeldenpfadSpieler = {
  id: PlayerId;
  heldXp?: number;
  eigenschaften?: string[];
};
