/**
 * Ereignisse in Klartext. Liegt im Client, weil es reine Darstellung ist -
 * der Server schickt Ereignisse, keine Saetze.
 */

import { eigenschaftById } from '../core/heldenpfad';
import { bossById } from '../core/akte';
import { genitiv } from '../core/factions';
import { sippenBonusById } from '../core/cards/sippen';
import { vorhabenById } from '../core/vorhaben';
import { WESEN } from '../core/factions';
import { SEASON_NAME, roundOf } from '../core/season';
import { fraktionIn } from '../core/fraktionsleben';
import type { GameEvent } from '../core/rules/reducer';
import type { Verlust } from '../core/rules/army';
import type { PublicState } from '../core/redact';
import type { Bundle, Resource } from '../core/types';
import { cardById } from '../core/cards/catalog';
import { fraktionById, istFraktion } from '../core/factions';
import { istSpielerSeite, spielerAus } from '../core/combat';
import type { Seite } from '../core/combat';
import type { WandererAuftrag } from '../core/state';
import { STUFE_NAME } from '../core/rules/hauptstadt';
import { TURM_NAME } from '../core/state';
import { REICHSBAU_NAME } from '../core/rules/reich';
import { ZWEIG_NAME } from '../core/rules/zweig';
import { heldKurz } from '../core/lore';
import { hausById } from '../core/haus';
import { ereignisById } from '../core/ereignis';
import { WUNDER } from '../core/wunder';

const RES_NAME: Record<Resource, string> = {
  lumber: 'Holz',
  wool: 'Wolle',
  grain: 'Getreide',
  brick: 'Lehm',
  ore: 'Erz',
};

const DEV_NAME = {
  knight: 'Ritter',
  victoryPoint: 'Siegpunkt',
  roadBuilding: 'Strassenbau',
  yearOfPlenty: 'Erfindung',
  monopoly: 'Monopol',
} as const;

const BUILD_NAME = {
  road: 'Strasse',
  settlement: 'Siedlung',
  city: 'Stadt',
  tower: 'Wachturm',
  // Bewusst mit Artikel, anders als die uebrigen: "baut eine Palisade" liest
  // sich besser als "baut Palisade" - Strasse/Stadt/Wachturm klingen dagegen
  // auch ohne Artikel wie ein Eigenname.
  mauer: 'eine Palisade',
  tor: 'ein Tor',
} as const;

const ART_NAME = {
  karawane: 'Karawane',
  ritter: 'Ritter',
  raeuber: 'Raeuber',
  goblin: 'Goblin',
  wanderer: 'Wanderer',
  held: 'Held',
  bogen: 'Bogenschuetze',
  schleim: 'Schleim',
  haeuptling: 'Haeuptling',
  schamane: 'Schamane',
  hexe: 'Hexe',
  morast: 'Der Morast',
  besatzung: 'Verteidiger',
} as const;

/** Was brennt, in Worten: "eine Strasse", "ein Dorf", "eine Stadt". */
export const BRAND_WAS = { strasse: 'eine Strasse', dorf: 'ein Dorf', stadt: 'eine Stadt' } as const;

const LOESCHER = {
  karte: 'mit einer Karte',
  ritter: 'von einem Ritter',
  bogen: 'von einem Bogenschuetzen',
  held: 'vom Helden',
  regen: 'vom Regen',
} as const;

/** Worum es in einem Auftrag geht, in Worten. nameVon nennt eine Fraktion. */
export function auftragText(
  a: { art: WandererAuftrag['art']; fraktion: string | null; rohstoff: Resource | null; menge: number },
  nameVon: (fraktion: string) => string,
): string {
  switch (a.art) {
    case 'lager':
      return a.fraktion ? `Zerstoere das Lager ${lagerVon(nameVon(a.fraktion))}` : 'Zerstoere das Lager';
    case 'ruine':
      return 'Erkunde die alte Ruine';
    case 'liefern':
      return `Bring mir ${a.menge} ${a.rohstoff ? RES_NAME[a.rohstoff] : 'Rohstoffe'}`;
    case 'jagd':
      return `Schlage ${a.menge} Raeuber oder Goblins`;
    case 'geleit':
      return 'Bring einen Ritter oder deinen Helden zu mir';
    case 'kundschaft':
      return 'Kundschafte das ferne Land aus';
  }
}

export const resourceName = (r: Resource): string => RES_NAME[r];
export const devName = (d: keyof typeof DEV_NAME): string => DEV_NAME[d];

function who(state: PublicState | null, id: string): string {
  return state?.players.find((p) => p.id === id)?.name ?? 'Jemand';
}

/** "der Pilzschlucker", nicht "der Die Pilzschlucker" (Spieltest 10). */
const lagerVon = (name: string): string => {
  const g = genitiv(name);
  return g === name ? `von ${name}` : g;
};

/** Der Lohn eines Bosses in Worten (rules/akt.ts, B8). */
export const BOSS_LOHN_NAME = {
  trophaee: 'eine seltene Kartenwahl',
  schmiede: 'zwei Schmiedearbeiten',
  relikt: 'ein Relikt fuer den Helden',
  ruhm: '3 Ruhm',
} as const;

const karten = (n: number): string => `${n} ${n === 1 ? 'Karte' : 'Karten'}`;

/** Ein Rohstoffbuendel als Text, z.B. "2x Holz, 1x Erz". */
export function bundleText(b: Bundle): string {
  const parts = (Object.entries(b) as [Resource, number][])
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n}x ${RES_NAME[r]}`);
  return parts.length > 0 ? parts.join(', ') : 'nichts';
}

/** Der Name einer Fraktion - aus dem Seed, wie die Fraktion selbst. */
export function fraktionName(state: PublicState | null, id: string): string {
  return state && istFraktion(id) ? fraktionById(state.worldSeed, id).name : 'Unbekannte';
}

/** Der Name einer Kampfseite. Wer liest (du), heisst "deine Truppen" - auch der Held allein. */
export function seiteName(state: PublicState | null, seite: Seite, du: string | null = null): string {
  if (istSpielerSeite(seite)) {
    const id = spielerAus(seite);
    return id === du ? 'deine Truppen' : `die Truppen von ${who(state, id)}`;
  }
  if (istFraktion(seite)) return fraktionName(state, seite);
  // Schleime, Moraeste, die Hexe: kein Name, aber auch nicht "Niemand" (Spieltest 6).
  return 'die Wildnis';
}

/** Wer in einer Kampfrunde fiel, als Text. Leer, wenn niemand fiel. */
export function verlusteText(state: PublicState | null, verluste: readonly Verlust[], du: string | null = null): string {
  return verluste
    .map((v) => `${v.anzahl}x ${ART_NAME[v.kind]} (${seiteName(state, v.seite, du)})`)
    .join(', ');
}

/** Ein Ereignis als Protokollzeile. Leer, wenn es nichts zu erzaehlen gibt. */
export function describeEvent(e: GameEvent, state: PublicState | null): string {
  switch (e.t) {
    case 'roll':
      return `${who(state, e.player)} wuerfelt ${e.dice[0]} + ${e.dice[1]} = ${e.dice[0] + e.dice[1]}.`;
    case 'production': {
      const parts = Object.entries(e.payout).map(([pid, hand]) => {
        const got = (Object.entries(hand) as [Resource, number][])
          .filter(([, n]) => n > 0)
          .map(([r, n]) => `${n}x ${RES_NAME[r]}`)
          .join(', ');
        return `${who(state, pid)}: ${got}`;
      });
      return parts.length > 0 ? `Ertrag - ${parts.join(' | ')}` : 'Niemand bekommt etwas.';
    }
    case 'build':
      return `${who(state, e.player)} baut ${BUILD_NAME[e.kind]}.`;
    case 'capital':
      return `${who(state, e.player)} gruendet eine Hauptstadt.`;
    case 'capitalUpgrade':
      return `${who(state, e.player)} baut die Hauptstadt zum ${STUFE_NAME[e.stufe] ?? `Stufe ${e.stufe}`} aus.`;
    case 'reichsbau':
      return `${who(state, e.player)} baut ${REICHSBAU_NAME[e.art as 'burgfeste'] ?? 'einen Reichsbau'}.`;
    case 'towerUpgrade':
      return `${who(state, e.player)} baut einen Wachturm zum ${TURM_NAME[e.stufe] ?? `Stufe ${e.stufe}`} aus.`;
    // STUFE_NAME kommt aus rules/hauptstadt.ts (Residenz, Festungsring, Koenigssitz).
    case 'knightReady':
      return `${who(state, e.player)} stellt ${e.kind === 'bogen' ? 'einen Bogenschuetzen' : 'einen Ritter'} auf.`;
    case 'volley': {
      const wer = `Bogenschuetzen von ${who(state, e.player)}`;
      if (e.treffer === 0) return `${wer} schiessen daneben.`;
      const tote = verlusteText(state, e.verluste);
      return `${wer} treffen ${e.treffer} von ${e.schuesse}.${tote ? ` Gefallen: ${tote}.` : ''}`;
    }
    case 'march': {
      const staerke = (p: (typeof e.parties)[number]) =>
        (p.anzahl ?? 1) > 1 || (p.rang ?? 0) > 0
          ? ` (${p.anzahl ?? 1} Mann${(p.rang ?? 0) > 0 ? `, Rang ${p.rang}` : ''})`
          : '';
      if (e.parties.length !== 1) return `${e.parties.length} Raubzuege brechen auf.`;
      const zug = e.parties[0]!;
      if (zug.rache) return `Rachezug: ${fraktionName(state, zug.fraktion)} ziehen gegen ${who(state, zug.rache)}${staerke(zug)}.`;
      // Mit Anfuehrer (core/factions.ts): die Welt hat Gesichter, nicht nur Farben.
      const chef = state && istFraktion(zug.fraktion) ? fraktionIn(state, zug.fraktion).anfuehrer : undefined;
      if (zug.erstarkt) return `${fraktionName(state, zug.fraktion)} ziehen mit der Kraft ihrer Beute los${staerke(zug)}.`;
      return chef
        ? `${chef} fuehrt ${fraktionName(state, zug.fraktion).replace(/^Die /, 'die ')} auf Raubzug${staerke(zug)}.`
        : `Raubzug bricht auf: ${fraktionName(state, zug.fraktion)}${staerke(zug)}.`;
    }
    case 'ambitionOffered':
      return '';
    case 'ambitionDone': {
      const v = vorhabenById(e.id);
      const lohn = [e.ruhm > 0 ? `+${e.ruhm} Ruhm` : '', e.beute > 0 ? 'eine Kartenwahl' : ''].filter(Boolean).join(' und ');
      return `${who(state, e.player)} vollendet das Vorhaben "${v?.name ?? e.id}": ${lohn}.`;
    }
    case 'ambitionFailed':
      return `${who(state, e.player)} laesst das Vorhaben "${vorhabenById(e.id)?.name ?? e.id}" fallen - die Zeit ist um.`;
    case 'bauGabe':
      return `Die Bauhuette von ${who(state, e.player)} gibt ${bundleText(e.gained)}.`;
    case 'sippeStufe': {
      const b = sippenBonusById(e.bonus);
      return `${who(state, e.player)} erreicht ${b?.name ?? e.bonus}: ${b?.text ?? ''}`;
    }
    case 'tradeRoute':
      return e.player
        ? `${who(state, e.player)} traegt jetzt die Handelsstrasse: ${e.laenge} Strassen zwischen zwei Siedlungen (+2 Punkte).`
        : `Die Handelsstrasse hat niemand mehr.`;
    case 'aktBeginn': {
      const b = bossById(e.boss);
      return `Akt ${e.akt}: ${b?.name ?? 'Ein Boss'} - ${who(state, e.player)} hat bis Runde ${e.bis} Zeit.`;
    }
    case 'bossNaht':
      return `${bossById(e.boss)?.name ?? 'Der Boss'}: ein Heer von ${e.anzahl} Kaempfern zieht gegen ${who(state, e.player)}.`;
    case 'gespendet':
      return `${who(state, e.player)} spendet ${bundleText(e.given)} - 1 Ruhm.`;
    case 'bossEntkommen':
      // Mit Namen: die Zeile gilt dem Beraubten, nicht jedem, der sie liest (Spieltest 12).
      return `${bossById(e.boss)?.name ?? 'Der Boss'}: sein Heer hat bei ${who(state, e.player)} gepluendert - fuer ${who(state, e.player)} ist der Akt verloren.`;
    case 'bossLohn':
      return `${who(state, e.player)} waehlt als Lohn: ${BOSS_LOHN_NAME[e.wahl]}.`;
    case 'bossZugabe':
      return `${bossById(e.boss)?.name ?? 'Der Boss'} fordert eine Zugabe von ${who(state, e.player)} - bis Runde ${roundOf(e.bis)}. Jede bestandene Zugabe: +1 Siegpunkt und +0,5 Mult.`;
    case 'bossBesiegt':
      if (e.zugabe) return `${who(state, e.player)} besteht die ${e.zugabe}. Zugabe: +1 Siegpunkt, +0,5 Mult.`;
      return `${who(state, e.player)} besteht ${bossById(e.boss)?.name ?? 'den Boss'} - Akt ${e.akt}: +${e.punkte} ${e.punkte === 1 ? 'Siegpunkt' : 'Siegpunkte'}.`;
    case 'bossVerfehlt':
      return `${who(state, e.player)} verfehlt ${bossById(e.boss)?.name ?? 'den Boss'} - ${karten(e.verloren)} und ein Punkt Ruhm sind verloren.`;
    case 'bossGezahlt':
      return `${who(state, e.player)} zahlt Tribut: ${e.anzahl} ${resourceName(e.resource)}.`;
    case 'sippenRuhm':
      return `${sippenBonusById(e.bonus)?.name ?? 'Die Sippe'}: ${who(state, e.player)} gewinnt ${e.amount} Ruhm fuer die neue Stadt.`;
    case 'sippenBeute':
      return `${sippenBonusById(e.bonus)?.name ?? 'Die Sippe'}: ${who(state, e.player)} bekommt ${e.anzahl === 1 ? 'eine Kartenwahl' : `${e.anzahl} Kartenwahlen`}.`;
    case 'botCatchUp':
      return `${who(state, e.player)} liegt weit zurueck und holt auf: +1 ${resourceName(e.resource)}.`;
    case 'spoiled':
      return `Bei ${who(state, e.player)} verdirbt, was ueber die Grenze hinaus lagerte: ${bundleText(e.lost)}.`;
    case 'caravanSet':
      return `${who(state, e.player)} schickt eine Karawane zwischen ihren Siedlungen los.`;
    case 'caravanArrived':
      return `Die Karawane von ${who(state, e.player)} kommt an: ${bundleText(e.gained)}.`;
    case 'growth':
      return `Die Siedlungen von ${who(state, e.player)} wachsen: +${e.zuwachs} Einwohner (jetzt ${e.gesamt}).`;
    case 'peopleLost':
      return `${who(state, e.player)} verliert ${e.count === 1 ? 'einen Einwohner' : `${e.count} Einwohner`} an die Pluenderer.`;
    case 'market':
      return `${who(state, e.player)} geht auf den Markt (${bundleText(e.paid)}).`;
    case 'seasonReport':
      return `Kunde aus dem Land (${SEASON_NAME[e.bericht.saison]}, Jahr ${e.bericht.jahr}): ${e.bericht.zeilen.join(' ')}`;
    case 'chiefChanged':
      return `${e.alt} ist gefallen. ${e.neu} fuehrt nun ${fraktionName(state, e.fraktion).replace(/^Die /, 'die ')} - ${WESEN[e.wesen].name}.`;
    case 'vendetta': {
      const f = state ? fraktionIn(state, e.fraktion) : null;
      return `${f?.anfuehrer ?? 'Ihr Anfuehrer'} (${fraktionName(state, e.fraktion)}) schwoert Rache an ${who(state, e.player)}.`;
    }
    case 'nestRevived':
      return `${fraktionName(state, e.fraktion)} beziehen ein verlassenes Lager neu.`;
    case 'fall':
      return `${who(state, e.player)}: das letzte Gebaeude ist gefallen! Bis Zug ${e.bis} muss wieder eines stehen.`;
    case 'recovered':
      return `${who(state, e.player)} hat wieder ein Gebaeude - das Reich steht.`;
    case 'defeated':
      return `${who(state, e.player)} ist gefallen und scheidet aus.`;
    case 'lost':
      return state?.phase.t === 'finished' && state.phase.durch === 'zeit'
        ? 'Die Zeit ist um - das Ziel ist verfehlt.'
        : 'Alle Reiche sind gefallen. Die Partie ist verloren.';
    case 'feud':
      return `Fehde: ${fraktionName(state, e.fraktion)} gegen ${fraktionName(state, e.gegen)}.`;
    case 'wanderer':
      return 'Ein Wanderer zieht durchs Land.';
    case 'watch':
      return e.schamane
        ? `Der Schamane von ${fraktionName(state, e.fraktion)} ruft ${e.anzahl} Leute ins Lager.`
        : `${fraktionName(state, e.fraktion)} zieht ${e.anzahl} ${e.anzahl === 1 ? 'Wache' : 'Wachen'} nach.`;
    case 'feast':
      return `${fraktionName(state, e.fraktion)} feiert - aus diesem Lager kommt vorerst niemand.`;
    case 'levelUp':
      return e.name
        ? `${who(state, e.player)} hat einen Veteranen: ${e.name}, Stufe ${e.stufe}.`
        : `Eine Einheit von ${who(state, e.player)} steigt auf Stufe ${e.stufe}.`;
    case 'retreat':
      return `${seiteName(state, e.seite)} weicht aus: ${e.anzahl} ${e.anzahl === 1 ? 'Einheit zieht' : 'Einheiten ziehen'} sich zurueck.`;
    case 'morast':
      return `Der Morast erhebt sich - er kommt zu ${who(state, e.gegen)}.`;
    case 'witch':
      return 'Bei einem einsamen Haus steht eine Hexe.';
    case 'slimes':
      return e.anzahl === 1
        ? 'Ein Schleim kriecht aus dem Dunkel.'
        : `${e.anzahl} Schleime kriechen aus dem Dunkel.`;
    case 'slimesRest':
      return e.anzahl === 1
        ? 'Der Morgen kommt - der Schleim wird traege.'
        : `Der Morgen kommt - ${e.anzahl} Schleime werden traege.`;
    case 'fight': {
      const tote = verlusteText(state, e.verluste);
      const gefallen = tote ? ` Gefallen: ${tote}.` : '';
      if (e.ende) {
        return e.sieger
          ? `Kampf entschieden - ${seiteName(state, e.sieger)} behaelt das Feld.${gefallen}`
          : `Kampf vorbei - niemand steht mehr.${gefallen}`;
      }
      if (e.neu) return `Kampf: ${e.seiten.map((s) => seiteName(state, s)).join(' gegen ')}.${gefallen}`;
      return tote ? `Im Kampf gefallen: ${tote}.` : '';
    }
    case 'plunder':
      // Nichts geholt ist keine Zeile wert - Goblins versuchen es oft.
      return e.count > 0 ? `${fraktionName(state, e.fraktion)} pluendern ${who(state, e.player)}: ${karten(e.count)}.` : '';
    case 'homecoming':
      return e.count > 0
        ? `${fraktionName(state, e.fraktion)} bringen ${karten(e.count)} Beute heim.`
        : '';
    case 'lootRecovered':
      return `${who(state, e.player)} holt Beute zurueck: ${karten(e.count)}.`;
    case 'nestDestroyed':
      return `Ein Lager ${genitiv(fraktionName(state, e.fraktion))} faellt. Beute fuer ${e.players.map((p) => who(state, p)).join(', ') || 'niemanden'}.`;
    case 'nestCaptured':
      return `${fraktionName(state, e.an)} erobern ein Lager ${genitiv(fraktionName(state, e.von))}.`;
    case 'horde':
      return `Goblin-Horde greift an! ${fraktionName(state, e.fraktion)} schicken ${e.anzahl} Goblins.`;
    case 'burn':
      return `${fraktionName(state, e.fraktion)} legen Feuer an ${BRAND_WAS[e.art]} von ${who(state, e.player)}.`;
    case 'burnPrevented':
      return `Ein Wachturm von ${who(state, e.player)} vertreibt Brandstifter (${fraktionName(state, e.fraktion)}).`;
    case 'extinguished':
      return `Feuer bei ${who(state, e.player)} geloescht, ${LOESCHER[e.durch]}.`;
    case 'burnedDown':
      return e.art === 'strasse'
        ? `Eine Strasse von ${who(state, e.player)} ist abgebrannt.`
        : e.art === 'dorf'
          ? `Ein Dorf von ${who(state, e.player)} ist niedergebrannt.`
          : `Eine Stadt von ${who(state, e.player)} ist zum Dorf heruntergebrannt.`;
    case 'heroReady': {
      // Der Held hat einen Namen, sobald er einmal angetreten ist (core/lore.ts).
      // Der Ernannte hat seinen eigenen - und sein Amt (rules/zweig.ts).
      const p = state?.players.find((x) => x.id === e.player);
      const lore = e.zweig ? p?.ernannt?.lore : p?.held;
      const amt = e.zweig ? ZWEIG_NAME[e.zweig] : 'Der Held';
      const wer = lore ? `${heldKurz(lore)}${e.zweig ? `, ${ZWEIG_NAME[e.zweig]}` : ''}` : amt;
      return e.zurueck
        ? `${wer} kehrt zu ${who(state, e.player)} zurueck.`
        : `${who(state, e.player)} ruft ${wer} zu den Waffen.`;
    }
    case 'heroFell': {
      const p = state?.players.find((x) => x.id === e.player);
      const lore = e.zweig ? p?.ernannt?.lore : p?.held;
      const amt = e.zweig ? ZWEIG_NAME[e.zweig] : 'Der Held';
      const wer = lore ? heldKurz(lore) : `${amt} von ${who(state, e.player)}`;
      // zurueck ist ein Zug, keine Runde (Spieltest 10: "Runde 66" in einer Partie mit 60).
      const er = lore?.geschlecht === 'w' ? 'Sie' : 'Er';
      const runde = roundOf(e.zurueck);
      return state?.rundenLimit != null && runde > state.rundenLimit
        ? `${wer} faellt - und kehrt in dieser Partie nicht mehr zurueck.`
        : `${wer} faellt. ${er} kehrt in Runde ${runde} zurueck.`;
    }
    case 'ernennung': {
      const lore = state?.players.find((x) => x.id === e.player)?.ernannt?.lore;
      const wer = lore ? heldKurz(lore) : 'einen Getreuen';
      return `${who(state, e.player)} ernennt ${wer} zum ${ZWEIG_NAME[e.zweig]}.`;
    }
    case 'pact':
      return e.art === 'frieden'
        ? `${who(state, e.player)} schliesst Frieden mit ${fraktionName(state, e.fraktion)} bis Runde ${e.bis}.`
        : `${who(state, e.player)} zahlt ${fraktionName(state, e.fraktion)} Tribut.`;
    case 'war':
      return e.grund === 'erklaert'
        ? `${who(state, e.player)} erklaert ${fraktionName(state, e.fraktion)} den Krieg.`
        : e.grund === 'abgelaufen'
          ? `Der Frieden zwischen ${who(state, e.player)} und ${fraktionName(state, e.fraktion)} ist vorbei.`
          : `${who(state, e.player)} kann den Tribut nicht zahlen - ${fraktionName(state, e.fraktion)} ziehen wieder in den Krieg.`;
    case 'tribute':
      return `${who(state, e.player)} zahlt ${fraktionName(state, e.fraktion)} Tribut: ${karten(e.count)}.`;
    case 'questOffered':
      return `Ein Wanderer bietet ${who(state, e.player)} einen Auftrag an: ${auftragText(e, (id) => fraktionName(state, id))}.`;
    case 'questProgress':
      return `${who(state, e.player)} kommt bei der Jagd voran: ${e.fortschritt} von ${e.menge}.`;
    case 'questAccepted':
      return `${who(state, e.player)} nimmt einen Auftrag an.`;
    case 'questDone':
      return `${who(state, e.player)} erfuellt einen Auftrag - Beute: eine Kartenwahl.`;
    case 'questFailed':
      return e.grund === 'abgelaufen'
        ? `Ein Auftrag von ${who(state, e.player)} ist abgelaufen.`
        : `Ein Auftrag von ${who(state, e.player)} ist verloren - jemand kam zuvor.`;
    case 'explorerDone':
      return `${e.held ? 'Der Held' : 'Ein Erkunder'} von ${who(state, e.player)} hat die Gegend erkundet und kehrt heim.`;
    case 'ruin':
      switch (e.result) {
        case 'schatz':
          return `${who(state, e.player)} findet in einer Ruine ${bundleText(e.gained)}.`;
        case 'beute':
          return `${who(state, e.player)} findet in einer Ruine Beute.`;
        case 'karte':
          return `${who(state, e.player)} findet in einer Ruine eine alte Karte.`;
        case 'hinterhalt':
          return e.knightLost
            ? `Hinterhalt in einer Ruine - ein Ritter von ${who(state, e.player)} faellt.`
            : `Hinterhalt in einer Ruine - ${who(state, e.player)} wehrt ihn ab.`;
        case 'aussenposten':
          return `Der Held von ${who(state, e.player)} findet in einer Ruine ein bewohnbares Haus: ein Aussenposten.`;
      }
      return '';
    case 'buyDev':
      return `${who(state, e.player)} kauft eine Entwicklungskarte.`;
    case 'playDev':
      return `${who(state, e.player)} spielt ${DEV_NAME[e.card]}.`;
    case 'yearOfPlenty':
      return `${who(state, e.player)} nimmt ${RES_NAME[e.a]} und ${RES_NAME[e.b]}.`;
    case 'monopoly':
      return `${who(state, e.player)} zieht ${e.taken}x ${RES_NAME[e.resource]} ein.`;
    case 'trade':
      return `${who(state, e.player)} tauscht ${e.ratio}x ${RES_NAME[e.give]} gegen ${RES_NAME[e.receive]}.`;
    case 'tradeOffer':
      return `${who(state, e.player)} bietet ${bundleText(e.give)} fuer ${bundleText(e.want)}.`;
    case 'tradeResponse':
      return e.accept
        ? `${who(state, e.player)} sagt zu.`
        : `${who(state, e.player)} lehnt ab.`;
    case 'tradeSettled':
      return `${who(state, e.from)} gibt ${bundleText(e.give)} an ${who(state, e.to)} und erhaelt ${bundleText(e.want)}.`;
    case 'tradeCancelled':
      return `${who(state, e.player)} zieht das Angebot zurueck.`;
    case 'glory':
      return `${who(state, e.player)} gewinnt ${e.amount} Ruhm.`;
    case 'pfadAngebot':
      return `${who(state, e.player)}: der Held hat ${e.anzahl} Ziele zur Wahl.`;
    case 'pfadAufbruch':
      return `${who(state, e.player)}: der Held bricht auf - ${e.name}.`;
    case 'pfadAnkunft':
      return `${who(state, e.player)}: der Held erreicht ${e.name}.`;
    case 'heldStufe':
      return `${who(state, e.player)}: der Held erreicht Stufe ${e.stufe}.`;
    case 'eigenschaft':
      return `${who(state, e.player)}: der Held ist jetzt ${eigenschaftById(e.id)?.name ?? e.id}.`;
    case 'relikt':
      return `${who(state, e.player)}: der Held findet ${cardById(e.id)?.name ?? 'ein Relikt'}.`;
    case 'relikteVerloren':
      return `${who(state, e.player)}: mit dem Helden gehen ${e.anzahl === 1 ? 'ein Relikt' : `${e.anzahl} Relikte`} verloren.`;
    case 'wahlGedeckelt':
      return `${who(state, e.player)}: keine Kartenwahl mehr in diesem Zug - die naechste Stadt bringt wieder eine.`;
    case 'geschmiedet':
      return `${who(state, e.player)} ${e.art === 'verbessern' ? 'verbessert' : 'verbrennt'} ${cardById(e.card)?.name ?? 'eine Karte'}.`;
    case 'kartenLohn': {
      const teile = [
        bundleText(e.gained),
        e.ruhm > 0 ? `${e.ruhm} Ruhm` : '',
        e.wahl > 0 ? `${e.wahl === 1 ? 'eine Kartenwahl' : `${e.wahl} Kartenwahlen`}` : '',
        e.zaehler > 0 ? `Zaehler +${e.zaehler}` : '',
      ].filter((x) => x && x !== 'nichts');
      return `${cardById(e.card)?.name ?? 'Eine Karte'} (${who(state, e.player)}): ${teile.join(', ')}.`;
    }
    case 'tacticPlayed':
      return `${who(state, e.player)} spielt ${cardById(e.card)?.name ?? 'eine Taktik'}.`;
    case 'chunks':
      // Die Karte waechst staendig - das sieht man, im Protokoll ist es nur Rauschen.
      return '';
    case 'turn':
      return `${who(state, e.player)} ist am Zug.`;
    case 'aid':
      if (e.grund === 'durst') return `Nach mageren Wuerfen hilft ein Nachbar ${who(state, e.player)} mit 1x ${resourceName(e.resource)} aus.`;
      return `Wanderhaendler bringen ${who(state, e.player)} 1x ${resourceName(e.resource)} - das erzeugt das Reich selbst nicht.`;
    case 'eventOffered':
      return `${ereignisById(e.id)?.titel ?? 'Ein Ereignis'} - ${who(state, e.player)} muss entscheiden.`;
    case 'eventResolved': {
      const wahl = ereignisById(e.id)?.wahlen[e.wahl]?.text ?? '';
      return `${who(state, e.player)} entscheidet: ${wahl.split(':')[0]!.split('(')[0]!.trim()}.${e.verloren > 0 ? ` ${karten(e.verloren)} ${e.verloren === 1 ? 'geht' : 'gehen'} verloren.` : ''}`;
    }
    case 'wonder':
      return `${who(state, e.player)} errichtet ${WUNDER[e.art].name}! (+${WUNDER[e.art].punkte} Siegpunkte)`;
    case 'wonderGift':
      return e.beute > 0
        ? `${WUNDER[e.art].name} schenkt ${who(state, e.player)} eine Kartenwahl.`
        : `${WUNDER[e.art].name} mehrt den Ruhm von ${who(state, e.player)}.`;
    case 'houseChosen':
      return `${who(state, e.player)} fuehrt ${hausById(e.haus)?.name ?? 'ein Haus'}.`;
    case 'draftOffered':
      return `${who(state, e.player)} darf eine von drei Karten waehlen.`;
    case 'cardTaken':
      return `${who(state, e.player)} nimmt ${cardById(e.card)?.name ?? 'eine Karte'}.`;
    case 'win':
      return `${who(state, e.player)} gewinnt!`;
  }
}
