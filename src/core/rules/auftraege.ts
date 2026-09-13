/**
 * Auftraege der Wanderer.
 *
 * Kommt ein Wanderer an einer Siedlung vorbei - auf ihrem Feld oder daneben -,
 * bietet er ihrem Besitzer einen Auftrag an. Wer annimmt und ihn erfuellt,
 * bekommt eine Kartenwahl als Beute (Player.loot).
 *
 *   lager       ein feindliches Lager in der Naehe zerstoeren
 *   ruine       eine Ruine in der Naehe erkunden
 *   liefern     dem Wanderer 4 Karten eines Rohstoffs bringen - per Knopf
 *   jagd        3 Raeuber oder Goblins schlagen, gleich wo
 *   geleit      einen Ritter oder den Helden zum Wanderer bringen, solange
 *               er noch im Land ist
 *   kundschaft  mit einem Ritter oder dem Helden ein fernes Feld erreichen
 *
 *   Angebot   6 Runden Bedenkzeit, dann zieht es der Wanderer zurueck.
 *   Frist     30 Runden ab Annahme.
 *   Verloren  wenn jemand anderes zuvorkommt oder der Wanderer weiterzieht.
 *
 * Jeder Wanderer bietet jedem Spieler hoechstens einen Auftrag an, niemand hat
 * mehr als drei offene, und von jeder Art nur einen. Lager, Ruinen und
 * Kundschaftsziele liegen in Reichweite des Wanderers.
 */

import type { Rng } from '../rng';
import { hexDistance, hexKey, hexesInRange, neighbors } from '../coords';
import type { Hex } from '../coords';
import { feindlich, spielerSeite } from '../combat';
import { istFraktion } from '../factions';
import { ruinAt } from '../ruins';
import { isLandAt, isNestActive, nestFraktionOf, nextStep, settlementApproaches } from '../units';
import { isGenerated } from '../world';
import type { World } from '../world';
import { playerById } from '../state';
import type { GameState, PlayerId, UnitState, WandererAuftrag } from '../state';
import { RESOURCES } from '../types';
import type { Resource } from '../types';
import type { ArmyEvent } from './army';

export const ANGEBOT_RUNDEN = 6;
export const AUFTRAG_RUNDEN = 30;
/** So weit um den Wanderer sucht er Lager und Ruinen. */
export const AUFTRAG_REICHWEITE = 10;
export const MAX_AUFTRAEGE = 3;
/** Wie viele Karten ein Lieferauftrag verlangt. */
export const LIEFER_MENGE = 4;
/** Wie viele Gegner eine Jagd verlangt. */
export const JAGD_MENGE = 3;
/** Wie weit ein Kundschaftsziel vom Wanderer liegt. */
const KUNDSCHAFT_AB = 7;
const KUNDSCHAFT_BIS = 10;
/** Geleit gibt es nur, wenn der Wanderer noch so viele Runden bleibt. */
const GELEIT_MINDESTENS = 6;

export type AuftragEvent =
  | {
      t: 'questOffered';
      player: PlayerId;
      id: number;
      art: WandererAuftrag['art'];
      q: number;
      r: number;
      fraktion: string | null;
      rohstoff: Resource | null;
      menge: number;
    }
  | { t: 'questAccepted'; player: PlayerId; id: number }
  /** Die Jagd kommt voran. */
  | { t: 'questProgress'; player: PlayerId; id: number; fortschritt: number; menge: number }
  | { t: 'questDone'; player: PlayerId; id: number; art: WandererAuftrag['art'] }
  | {
      t: 'questFailed';
      player: PlayerId;
      id: number;
      art: WandererAuftrag['art'];
      grund: 'abgelaufen' | 'verloren';
    };

type Ereignisse = { push(...e: AuftragEvent[]): number };
type Ziel = Pick<WandererAuftrag, 'art' | 'q' | 'r' | 'fraktion' | 'rohstoff' | 'menge'>;

const offen = (a: WandererAuftrag) => a.status !== 'abgelehnt';

/** Steht ein eigener Ritter oder der Held auf diesem Feld? */
const eigeneEinheitAuf = (s: GameState, player: PlayerId, q: number, r: number): boolean =>
  s.units.some(
    (u) => u.owner === player && (u.kind === 'ritter' || u.kind === 'held') && u.q === q && u.r === r,
  );

/** Ein fernes, erreichbares Landfeld fuer die Kundschaft. */
function kundschaftsZiel(s: GameState, rng: Rng, w: UnitState, vergeben: ReadonlySet<string>): Hex | null {
  const seed = s.worldSeed;
  const kandidaten = hexesInRange(w, KUNDSCHAFT_BIS).filter((h) => {
    const d = hexDistance(h, w);
    return (
      d >= KUNDSCHAFT_AB &&
      isLandAt(seed, h.q, h.r) &&
      !isNestActive(s, h.q, h.r) &&
      !vergeben.has(hexKey(h.q, h.r))
    );
  });
  for (let versuch = 0; versuch < 4 && kandidaten.length > 0; versuch++) {
    const h = kandidaten.splice(rng.int(kandidaten.length), 1)[0]!;
    if (nextStep(seed, w, new Set([hexKey(h.q, h.r)]), 1500)) return h;
  }
  return null;
}

/** Was dieser Wanderer diesem Spieler anbieten kann - eine der moeglichen Arten. */
function zielFuer(s: GameState, world: World, rng: Rng, player: PlayerId, w: UnitState): Ziel | null {
  const eigene = s.auftraege.filter((a) => a.player === player && offen(a));
  const vergeben = new Set(eigene.map((a) => hexKey(a.q, a.r)));
  const arten = new Set(eigene.map((a) => a.art));
  const lager: Hex[] = [];
  const ruinen: Hex[] = [];
  for (const h of hexesInRange(w, AUFTRAG_REICHWEITE)) {
    const k = hexKey(h.q, h.r);
    if (!isGenerated(world, h.q, h.r)) continue;
    if (isNestActive(s, h.q, h.r)) {
      if (feindlich(spielerSeite(player), nestFraktionOf(s, h.q, h.r), s)) lager.push(h);
    } else if (ruinAt(s.worldSeed, h.q, h.r) && !s.exploredRuins.includes(k)) {
      ruinen.push(h);
    }
  }
  const nachNaehe = (a: Hex, b: Hex) => hexDistance(w, a) - hexDistance(w, b) || a.q - b.q || a.r - b.r;
  lager.sort(nachNaehe);
  ruinen.sort(nachNaehe);
  // Eines der drei naechsten - nicht immer dasselbe, aber nie am anderen Ende.
  const eines = (liste: Hex[]) => liste[rng.int(Math.min(3, liste.length))]!;
  const frei = (liste: Hex[]) => liste.filter((h) => !vergeben.has(hexKey(h.q, h.r)));
  const basis = { fraktion: null, rohstoff: null, menge: 1 };

  const optionen: Array<() => Ziel | null> = [];
  if (frei(lager).length > 0) {
    optionen.push(() => {
      const h = eines(frei(lager));
      return { ...basis, art: 'lager', q: h.q, r: h.r, fraktion: nestFraktionOf(s, h.q, h.r) };
    });
  }
  if (frei(ruinen).length > 0) {
    optionen.push(() => {
      const h = eines(frei(ruinen));
      return { ...basis, art: 'ruine', q: h.q, r: h.r };
    });
  }
  if (!arten.has('liefern')) {
    optionen.push(() => ({
      ...basis,
      art: 'liefern',
      q: w.q,
      r: w.r,
      rohstoff: RESOURCES[rng.int(RESOURCES.length)]!,
      menge: LIEFER_MENGE,
    }));
  }
  if (!arten.has('jagd') && lager.length > 0) {
    optionen.push(() => ({ ...basis, art: 'jagd', q: lager[0]!.q, r: lager[0]!.r, menge: JAGD_MENGE }));
  }
  if (!arten.has('geleit') && (w.dauer ?? 0) >= GELEIT_MINDESTENS) {
    optionen.push(() => ({ ...basis, art: 'geleit', q: w.q, r: w.r }));
  }
  if (!arten.has('kundschaft')) {
    optionen.push(() => {
      const h = kundschaftsZiel(s, rng, w, vergeben);
      return h ? { ...basis, art: 'kundschaft', q: h.q, r: h.r } : null;
    });
  }
  while (optionen.length > 0) {
    const ziel = optionen.splice(rng.int(optionen.length), 1)[0]!();
    if (ziel) return ziel;
  }
  return null;
}

/** Nach jeder Runde: Wanderer an Siedlungen bieten Auftraege an. */
export function wandererBieten(s: GameState, world: World, rng: Rng, events: Ereignisse): void {
  const wanderer = s.units.filter((u) => u.kind === 'wanderer').sort((a, b) => a.id - b.id);
  if (wanderer.length === 0) return;
  const an = settlementApproaches(s);
  for (const w of wanderer) {
    const besitzer = new Set<PlayerId>();
    for (const h of [w, ...neighbors(w.q, w.r)]) {
      const o = an.get(hexKey(h.q, h.r));
      if (o !== undefined) besitzer.add(o);
    }
    for (const player of [...besitzer].sort()) {
      if (s.auftraege.some((a) => a.player === player && a.wanderer === w.id)) continue;
      if (s.auftraege.filter((a) => a.player === player && offen(a)).length >= MAX_AUFTRAEGE) continue;
      const ziel = zielFuer(s, world, rng, player, w);
      if (!ziel) continue;
      const auftrag: WandererAuftrag = {
        id: s.nextAuftragId++,
        player,
        ...ziel,
        fortschritt: 0,
        status: 'angebot',
        bis: s.turn + ANGEBOT_RUNDEN,
        wanderer: w.id,
      };
      s.auftraege.push(auftrag);
      events.push({
        t: 'questOffered',
        player,
        id: auftrag.id,
        art: auftrag.art,
        q: auftrag.q,
        r: auftrag.r,
        fraktion: auftrag.fraktion,
        rohstoff: auftrag.rohstoff,
        menge: auftrag.menge,
      });
    }
  }
}

/** Einen Auftrag annehmen oder ablehnen. null bei Erfolg, sonst der Grund. */
export function aufAuftragAntworten(
  s: GameState,
  actor: PlayerId,
  id: number,
  annehmen: boolean,
  events: Ereignisse,
): string | null {
  const a = s.auftraege.find((x) => x.id === id);
  if (!a || a.player !== actor) return 'Diesen Auftrag gibt es nicht.';
  if (a.status !== 'angebot') return 'Darauf hast du schon geantwortet.';
  if (annehmen) {
    a.status = 'angenommen';
    a.bis = s.turn + AUFTRAG_RUNDEN;
    events.push({ t: 'questAccepted', player: actor, id });
  } else {
    // Bleibt als Absage stehen, bis die Bedenkzeit um ist - so fragt derselbe
    // Wanderer nicht in der naechsten Runde gleich wieder.
    a.status = 'abgelehnt';
  }
  return null;
}

/** Die Rohstoffe eines Lieferauftrags abgeben - erfuellt ihn sofort. */
export function auftragLiefern(s: GameState, actor: PlayerId, id: number, events: Ereignisse): string | null {
  const a = s.auftraege.find((x) => x.id === id);
  if (!a || a.player !== actor) return 'Diesen Auftrag gibt es nicht.';
  if (a.art !== 'liefern' || a.rohstoff === null) return 'Bei diesem Auftrag ist nichts zu liefern.';
  if (a.status !== 'angenommen') return 'Nimm den Auftrag erst an.';
  const p = playerById(s, actor);
  if (!p || p.hand[a.rohstoff] < a.menge) return 'Dafuer fehlen dir Rohstoffe.';
  p.hand[a.rohstoff] -= a.menge;
  p.loot += 1;
  a.fortschritt = a.menge;
  s.auftraege = s.auftraege.filter((x) => x !== a);
  events.push({ t: 'questDone', player: actor, id: a.id, art: a.art });
  return null;
}

type Nest = Extract<ArmyEvent, { t: 'nestDestroyed' }>;
type Ruine = Extract<ArmyEvent, { t: 'ruin' }>;
type Kampf = Extract<ArmyEvent, { t: 'fight' }>;

/**
 * Nach jeder Runde: Fortschritt der Jagd, erfuellte, verlorene und abgelaufene
 * Auftraege.
 *
 * geschehen sind die Ereignisse dieser Runde - nur dort steht, WER ein Lager
 * zerstoert, eine Ruine erkundet oder im Kampf wen geschlagen hat.
 */
export function auftraegePruefen(
  s: GameState,
  geschehen: ReadonlyArray<{ t: string } & Record<string, unknown>>,
  events: Ereignisse,
): void {
  if (s.auftraege.length === 0) return;

  // Jagd: geschlagene Raeuber, Goblins und Lagerbesatzungen zaehlen - in jedem
  // Kampf, an dem eigene Leute beteiligt waren.
  for (const a of s.auftraege) {
    if (a.art !== 'jagd' || a.status !== 'angenommen') continue;
    const seite = spielerSeite(a.player);
    let neu = 0;
    for (const e of geschehen) {
      if (e.t !== 'fight') continue;
      const k = e as unknown as Kampf;
      if (!k.seiten.includes(seite)) continue;
      for (const v of k.verluste) if (istFraktion(v.seite)) neu += v.anzahl;
    }
    if (neu === 0) continue;
    a.fortschritt = Math.min(a.menge, a.fortschritt + neu);
    events.push({ t: 'questProgress', player: a.player, id: a.id, fortschritt: a.fortschritt, menge: a.menge });
  }

  const stand = (a: WandererAuftrag): 'offen' | 'erfuellt' | 'verloren' => {
    switch (a.art) {
      case 'lager': {
        const fiel = geschehen.find(
          (e) => e.t === 'nestDestroyed' && (e as unknown as Nest).q === a.q && (e as unknown as Nest).r === a.r,
        ) as unknown as Nest | undefined;
        if (fiel) return fiel.players.includes(a.player) ? 'erfuellt' : 'verloren';
        return isNestActive(s, a.q, a.r) ? 'offen' : 'verloren';
      }
      case 'ruine': {
        const erkundet = geschehen.find(
          (e) => e.t === 'ruin' && (e as unknown as Ruine).q === a.q && (e as unknown as Ruine).r === a.r,
        ) as unknown as Ruine | undefined;
        if (erkundet) return erkundet.player === a.player ? 'erfuellt' : 'verloren';
        return s.exploredRuins.includes(hexKey(a.q, a.r)) ? 'verloren' : 'offen';
      }
      case 'liefern':
        return 'offen';
      case 'jagd':
        return a.fortschritt >= a.menge ? 'erfuellt' : 'offen';
      case 'geleit': {
        const w = s.units.find((u) => u.id === a.wanderer && u.kind === 'wanderer');
        if (!w) return 'verloren';
        return eigeneEinheitAuf(s, a.player, w.q, w.r) ? 'erfuellt' : 'offen';
      }
      case 'kundschaft':
        return eigeneEinheitAuf(s, a.player, a.q, a.r) ? 'erfuellt' : 'offen';
    }
  };

  s.auftraege = s.auftraege.filter((a) => {
    const jetzt = stand(a);
    if (a.status !== 'angenommen') return jetzt === 'offen' && s.turn <= a.bis;
    if (jetzt === 'erfuellt') {
      const p = playerById(s, a.player);
      if (p) p.loot += 1;
      events.push({ t: 'questDone', player: a.player, id: a.id, art: a.art });
      return false;
    }
    if (jetzt === 'verloren' || s.turn > a.bis) {
      events.push({
        t: 'questFailed',
        player: a.player,
        id: a.id,
        art: a.art,
        grund: jetzt === 'verloren' ? 'verloren' : 'abgelaufen',
      });
      return false;
    }
    return true;
  });
}
