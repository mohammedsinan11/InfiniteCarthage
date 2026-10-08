/** Abenteuer (src/abenteuer/regeln.ts): wuerfeln, gehen, kaempfen, sammeln - im Takt der Spieluhr. */

import { describe, it, expect } from 'vitest';
import { istWasser } from '../src/abenteuer/welt';
import type { Boden } from '../src/abenteuer/welt';
import { angelbar, angeln, betretbar, kannAngeln, BOSS_LEBEN, GRUND_LEBEN, angriffVon, maxLebenVon, benutzen, debugAktion, ladungVon, gegenstand, normalisiere, fundAuf, gelaende, neuesAbenteuer, taste, tasteZu, wuerfeln, zugBeenden, vergleich, naechsterBoss, KREIS_DAUER, PENTA_BOSS_NACH, verkaufen, verkaufsPreis, kaufen, ansprechen, anheuern, werberAngebot, PENTA_STUFE3_NACH, BESCHWOERUNG_VOLL, beschwoeren, angeheuerte, kannNeuWuerfeln, neuWuerfeln, WUERFEL_EFFEKT, aktZiel, waehlen, abenteuerPunkte, ruhmFuer, faehigkeitBereit, faehigkeitNutzen, opfern, AKT_ZUEGE, schmieden, legendaerAnwenden, abwehrVon } from '../src/abenteuer/regeln';
import type { Abenteuer, Taste } from '../src/abenteuer/regeln';
import { HEX_DIRS, hexDistance, hexesInRange as hexesInRangeTest } from '../src/core/coords';

/** Ein Abenteuer im Zug, mit festen Schritten und nur den gegebenen Schleimen. */
function imZug(seed: number, schleime: Abenteuer['schleime'] = [], schritte = 6): Abenteuer {
  const a = structuredClone(wuerfeln(neuesAbenteuer(seed)));
  a.schleime = schleime;
  a.schritte = schritte;
  return a;
}

/** Flaches, begehbares Land: ein Schritt kostet einen. */
const eben = (g: Boden) => !istWasser(g) && g !== 'berg' && g !== 'sumpf' && g !== 'fluss';

/** Eine Taste, die vom Start auf begehbares, flaches Land fuehrt. */
function freieTaste(a: Abenteuer): Taste {
  for (const t of ['d', 'e', 'x', 'z', 'a', 'q'] as Taste[]) {
    const ziel = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t)]!;
    const g = gelaende(a.seed, a.pos.q + ziel[0], a.pos.r + ziel[1]);
    if (g && eben(g)) return t;
  }
  throw new Error('kein freier Nachbar');
}

/** Den naechsten Schritt im Hin und Her: zurueck, wenn man draussen steht, sonst hinaus. */
function i6(a: Abenteuer, hin: Taste, zurueck: Taste): Taste {
  return a.pfad.length % 2 === 0 ? zurueck : hin;
}

describe('Abenteuer', () => {
  it('beginnt auf Land, mit Schwert und ohne Wurf', () => {
    const a = neuesAbenteuer(42);
    expect(istWasser(gelaende(42, a.pos.q, a.pos.r))).toBe(false);
    expect(a.ausruestung.waffe).toBe('schwert');
    expect(a.phase).toBe('wuerfeln');
    expect(a.erkundet.length).toBeGreaterThan(6);
  });

  it('der Ritter beginnt nie im Wasser - auch nicht, wenn um den Ursprung nur Meer ist', () => {
    // 774553834: im Umkreis von sechs Feldern lag nur ein Berg (Spieltest).
    for (const seed of [774553834, 1844960718, 978983017, -1288175827, 2049389901, 1, 2, 3]) {
      const a = neuesAbenteuer(seed);
      const t = gelaende(seed, a.pos.q, a.pos.r);
      expect(istWasser(t)).toBe(false);
      expect(t).not.toBeNull();
    }
  });

  it('ein alter Spielstand mit dem Ritter im Wasser setzt ihn beim Laden an Land', () => {
    const a = structuredClone(neuesAbenteuer(774553834));
    // Ein Wasserfeld in der Naehe suchen und den Ritter darauf stellen (wie ein alter Stand).
    let wasser: { q: number; r: number } | null = null;
    for (let q = -40; q <= 40 && !wasser; q++) for (let r = -40; r <= 40 && !wasser; r++) if (istWasser(gelaende(a.seed, q, r))) wasser = { q, r };
    expect(wasser).not.toBeNull();
    a.pos = wasser!;
    const b = normalisiere(a);
    expect(istWasser(gelaende(b.seed, b.pos.q, b.pos.r))).toBe(false);
  });

  it('Schwerter liegen in Truhen; eine bessere Waffe wandert ins Inventar und leuchtet', () => {
    expect(gegenstand('runenklinge')?.krit).toBe(3);
    expect(gegenstand('flammenschwert')?.angriff).toBe(3);
    // Eine Truhe mit einem Schwert finden und hinlaufen.
    for (let seed = 1; seed < 3000; seed++) {
      const a0 = neuesAbenteuer(seed);
      for (const k of ['d', 'e', 'x', 'z', 'a', 'q'] as Taste[]) {
        const [dq, dr] = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(k)]!;
        const h = { q: a0.pos.q + dq, r: a0.pos.r + dr };
        // Ausruestung liegt offen auf der Karte - man sieht, welche Waffe.
        const liegt = fundAuf(a0, h.q, h.r);
        if (!liegt || !['axt', 'breitschwert', 'runenklinge', 'flammenschwert'].includes(liegt) || !eben(gelaende(seed, h.q, h.r))) continue;
        const b = taste(imZug(seed), k);
        // Nicht gleich anlegen - im Inventar leuchtet sie gruen.
        expect(b.ausruestung.waffe).toBe('schwert');
        expect(b.inventar[liegt]).toBe(1);
        expect(vergleich(b, liegt)).toBe(1);
        expect(vergleich(b, 'schwert')).toBe(0);
        return;
      }
    }
    throw new Error('keine Truhe mit Waffe gefunden');
  });

  it('die Tasten liegen wie die Nachbarn eines Sechsecks um S', () => {
    const o = { q: 0, r: 0 };
    expect(tasteZu(o, { q: 1, r: -1 })).toBe('e');
    expect(tasteZu(o, { q: 1, r: 0 })).toBe('d');
    expect(tasteZu(o, { q: 0, r: 1 })).toBe('x');
    expect(tasteZu(o, { q: -1, r: 1 })).toBe('z');
    expect(tasteZu(o, { q: -1, r: 0 })).toBe('a');
    expect(tasteZu(o, { q: 0, r: -1 })).toBe('q');
    expect(tasteZu(o, o)).toBe('s');
    expect(tasteZu(o, { q: 2, r: 0 })).toBeNull();
  });

  it('jeder Schritt ist ein Tick: die Schleime huepfen mit', () => {
    const a0 = neuesAbenteuer(7);
    const s = { id: 99, q: a0.pos.q + 4, r: a0.pos.r, leben: 2, gross: false };
    const a = imZug(7, [s]);
    // Nach dem ruhigen Anfang (die ersten Takte schlummern die Schleime).
    a.zeit = 10;
    const b = taste(a, 's');
    expect(b.zeit).toBe(a.zeit + 1);
    expect(b.schritte).toBe(5);
    // Der Schleim wittert den Ritter und huepft einen Schritt naeher.
    expect(hexDistance(b.schleime[0]!, b.pos)).toBe(3);
    expect(b.ereignisse.some((e) => e.art === 'gehen' && e.wer === 99)).toBe(true);
  });

  it('sind die Schritte verbraucht, wird wieder gewuerfelt', () => {
    let a = imZug(9, [], 2);
    a = taste(a, 's');
    expect(a.phase).toBe('ziehen');
    a = taste(a, 's');
    expect(a.phase).toBe('wuerfeln');
    expect(a.zug).toBe(2);
  });

  it('Zug beenden wartet die restlichen Schritte ab - jeder ein Tick', () => {
    const a = imZug(9, [], 5);
    const b = zugBeenden(a);
    expect(b.phase).toBe('wuerfeln');
    expect(b.zeit).toBe(a.zeit + 5);
  });

  it('ein Schritt auf einen Schleim ist ein Angriff', () => {
    const a0 = neuesAbenteuer(11);
    let b = imZug(11, [{ id: 99, q: a0.pos.q + 1, r: a0.pos.r, leben: 1, gross: false }]);
    const vorher = b.pos;
    for (let i = 0; i < 6 && b.schleime.length > 0 && b.phase === 'ziehen'; i++) b = taste(b, 'd');
    expect(b.pos).toEqual(vorher);
    expect(b.ereignisse.some((e) => e.art === 'hieb' && e.wer === 'ritter')).toBe(true);
    if (b.schleime.length === 0) {
      expect(b.erschlagen).toBe(1);
      expect(b.inventar['gelee']).toBe(1);
    }
  });

  it('ein Schleim nebenan sagt seinen Angriff an und trifft im naechsten Takt', () => {
    const a0 = neuesAbenteuer(13);
    let a = imZug(13, [{ id: 5, q: a0.pos.q, r: a0.pos.r - 1, leben: 2, gross: false }]);
    a = taste(a, 's');
    expect(a.ereignisse.some((e) => e.art === 'ansage' && e.wer === 5)).toBe(true);
    expect(a.schleime[0]!.angriff).toEqual(a.pos);
    const leben = a.leben;
    a = taste(a, 's');
    expect(a.ereignisse.some((e) => e.art === 'hieb' && e.wer === 5 && e.ziel === 'ritter')).toBe(true);
    // Ohne Schild trifft ein angesagter Hieb immer.
    expect(a.leben).toBe(leben - 1);
  });

  it('wer dem angesagten Feld ausweicht, wird nicht getroffen', () => {
    const a0 = neuesAbenteuer(21);
    let a = imZug(21, []);
    const t = freieTaste(a);
    // Der Schleim steht auf der Gegenseite der freien Richtung.
    const ri = ['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t);
    const gegen = HEX_DIRS[(ri + 3) % 6]!;
    a.schleime = [{ id: 7, q: a0.pos.q + gegen[0], r: a0.pos.r + gegen[1], leben: 2, gross: false, angriff: { ...a0.pos } }];
    const leben = a.leben;
    a = taste(a, t);
    expect(a.ereignisse.some((e) => e.art === 'hieb' && e.wer === 7 && e.ziel === null)).toBe(true);
    expect(a.leben).toBe(leben);
  });

  it('der Ritter geht auf ein Nachbarfeld', () => {
    const a = imZug(21);
    const t = freieTaste(a);
    const b = taste(a, t);
    expect(hexDistance(a.pos, b.pos)).toBe(1);
    expect(b.pfad.length).toBe(2);
    expect(b.ereignisse[0]).toMatchObject({ art: 'gehen', wer: 'ritter', takt: 0 });
  });

  it('Herzen liegen in der Welt und heilen beim Aufheben', () => {
    const a = neuesAbenteuer(3);
    let herzen = 0;
    for (let q = -30; q < 30; q++) for (let r = -30; r < 30; r++) if (fundAuf(a, q, r)?.endsWith('herz')) herzen++;
    expect(herzen).toBeGreaterThan(0);
  });

  it('mit dem letzten Schritt kommt man immer auf einen Berg - niemand sitzt fest', () => {
    // Einen Start neben einem Berg suchen.
    for (let seed = 1; seed < 300; seed++) {
      const a0 = neuesAbenteuer(seed);
      const i = HEX_DIRS.findIndex(([dq, dr]) => gelaende(seed, a0.pos.q + dq, a0.pos.r + dr) === 'berg');
      if (i < 0) continue;
      const t = (['e', 'd', 'x', 'z', 'a', 'q'] as Taste[])[i]!;
      const a = imZug(seed, [], 1);
      const b = taste(a, t);
      expect(hexDistance(a.pos, b.pos)).toBe(1);
      expect(b.phase).toBe('wuerfeln');
      return;
    }
    throw new Error('kein Start neben einem Berg');
  });

  it('Akte: nach AKT_ZIEL Gegnern erwacht der Boss des Akts - bezwungen waehlt man Legendaeres, der naechste Akt beginnt', () => {
    const a0 = neuesAbenteuer(11);
    expect(a0.akt).toBe(1);
    let b = imZug(11, [{ id: 99, q: a0.pos.q + 1, r: a0.pos.r, leben: 1, gross: false }], 20);
    b.aktKills = aktZiel(b) - 1;
    for (let i = 0; i < 20 && b.schleime.some((x) => x.id === 99) && b.phase === 'ziehen'; i++) b = taste(b, 'd');
    // Erst bebt der Boden (Vorwarnung), zwei Zuege spaeter erwacht der Boss.
    expect(b.bossBald).toBe(b.zug + 2);
    expect(b.schleime.some((x) => x.boss)).toBe(false);
    b = { ...structuredClone(b), zug: b.bossBald!, phase: 'ziehen', schritte: 5 };
    b = taste(b, 's');
    const koenig = b.schleime.find((x) => x.boss);
    // Seed 11 ist ungerade: Akt 1 und 2 tauschen ihre Bosse.
    expect(koenig?.bossArt).toBe('schatten');
    expect(b.bossErwacht).toBe(true);
    // Der Koenig faellt: eine Wahl aus drei Legendaeren, dann Akt 2.
    const c = structuredClone(b);
    c.phase = 'ziehen';
    c.schritte = 30;
    c.leben = 99;
    c.schleime = [{ ...koenig!, q: c.pos.q + 1, r: c.pos.r, leben: 1, angriff: null, flaeche: null }];
    let d = c;
    for (let i = 0; i < 30 && d.schleime.some((x) => x.boss); i++) d = taste(d, 'd');
    expect(d.akt).toBe(2);
    expect(d.aktKills).toBe(0);
    expect(d.wahl?.art).toBe('boss');
    expect(d.wahl?.optionen).toHaveLength(3);
    // Solange die Wahl offen ist, ruht das Spiel.
    expect(taste(d, 'd')).toBe(d);
    const e = waehlen(d, 0);
    expect(e.wahl).toBeNull();
    expect(e.legendaer?.length ?? 0).toBeGreaterThan(0);
    expect(naechsterBoss(e)).toBe('koenig');
    // Der neue Akt fuehrt in eine neue Gegend - weit weg, mit vollem Leben.
    expect(hexDistance(e.pos, c.pos)).toBeGreaterThan(20);
    expect(d.leben).toBe(maxLebenVon(d));
  });

  it('der Endboss (Akt 3) entscheidet das Abenteuer: Sieg und Punkte', () => {
    const a0 = neuesAbenteuer(11);
    let b = imZug(11, [], 30);
    b.akt = 3;
    b.leben = 99;
    b.schleime = [{ id: 50, q: a0.pos.q + 1, r: a0.pos.r, leben: 1, max: 22, gross: true, boss: true, bossArt: 'koloss', zaehler: 0 }];
    const vorher = abenteuerPunkte(b);
    for (let i = 0; i < 30 && b.schleime.some((x) => x.boss); i++) b = taste(b, 'd');
    expect(b.phase).toBe('sieg');
    expect(abenteuerPunkte(b)).toBeGreaterThan(vorher + 1000);
    expect(ruhmFuer(b)).toBeGreaterThan(50);
  });

  it('Truhen bieten 1 aus 3; Akt 1 beginnt ruhig', () => {
    let a = imZug(13, [], 10);
    a = structuredClone(a);
    // Eine Truhe auf dem Nachbarfeld simulieren: die Wahl direkt anbieten.
    a.wahl = null;
    const t = freieTaste(a);
    const [dq, dr] = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t)]!;
    // Suche einen Seed mit Truhe neben dem Start.
    for (let seed = 1; seed < 3000; seed++) {
      const s0 = neuesAbenteuer(seed);
      const ziel = { q: s0.pos.q + dq, r: s0.pos.r + dr };
      if (fundAuf(s0, ziel.q, ziel.r) !== 'truhe' || !eben(gelaende(seed, ziel.q, ziel.r))) continue;
      const b = taste(imZug(seed, [], 10), t);
      expect(b.wahl?.art).toBe('truhe');
      expect(new Set(b.wahl!.optionen).size).toBe(3);
      const c = waehlen(b, 1);
      const id = b.wahl!.optionen[1]!;
      expect((c.inventar[id] ?? 0) + (Object.values(c.ausruestung).includes(id) ? 1 : 0)).toBeGreaterThan(0);
      break;
    }
    // Kein Schleim naeher als 5 Felder am Start.
    for (let seed = 1; seed < 30; seed++) {
      const s0 = neuesAbenteuer(seed);
      for (const s of s0.schleime) expect(hexDistance(s, s0.pos)).toBeGreaterThanOrEqual(5);
    }
  });

  it('Klassen: jede beginnt anders', () => {
    const z = neuesAbenteuer(5, { klasse: 'zwerg' });
    expect(z.ausruestung.waffe).toBe('axt');
    expect(z.ausruestung.kopf).toBe('helm');
    expect(maxLebenVon(z)).toBe(7);
    const w = neuesAbenteuer(5, { klasse: 'waldlaeufer', extras: ['kraeuter', 'geldkatze'] });
    expect(w.ausruestung.fuesse).toBe('stiefel');
    // Zwei vom Kraeuterbeutel, eins bekommt jeder.
    expect(w.inventar['kraut']).toBe(3);
    expect(w.inventar['gold']).toBe(10);
    expect(maxLebenVon(neuesAbenteuer(5, { klasse: 'schwarz' }))).toBe(4);
  });

  it('der Koenig sagt Schlag oder Ring an und handelt nur jeden zweiten Tick', () => {
    const a0 = neuesAbenteuer(13);
    let a = imZug(13, [{ id: 50, q: a0.pos.q, r: a0.pos.r - 1, leben: BOSS_LEBEN, gross: true, boss: true, zaehler: 0 }], 10);
    a.leben = 99;
    const ansagen: number[] = [];
    for (let i = 0; i < 8; i++) {
      a = taste(a, 's');
      for (const e of a.ereignisse) if (e.art === 'ansage' && e.wer === 50) ansagen.push(a.zeit);
    }
    expect(ansagen.length).toBeGreaterThan(0);
    // Nur an geraden Ticks.
    for (const z of ansagen) expect(z % 2).toBe(0);
  });

  it('der Spuckschleim sagt eine Linie an und trifft, wer darin stehen bleibt', () => {
    const a0 = neuesAbenteuer(13);
    let a = imZug(13, [{ id: 7, q: a0.pos.q + 2, r: a0.pos.r, leben: 2, gross: false, art: 'spuck' }], 10);
    a.leben = 99;
    a = taste(a, 's');
    const linie = a.schleime[0]!.flaeche;
    expect(linie).toHaveLength(3);
    expect(linie!.some((h) => h.q === a.pos.q && h.r === a.pos.r)).toBe(true);
    const leben = a.leben;
    a = taste(a, 's');
    expect(a.ereignisse.some((e) => e.art === 'spuck')).toBe(true);
    expect(a.leben).toBe(leben - 1);
  });

  it('der Springschleim sagt sein Landefeld an - wer ausweicht, unter dem landet er nicht', () => {
    const a0 = neuesAbenteuer(21);
    let a = imZug(21, [], 10);
    const t = freieTaste(a);
    const ri = ['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t);
    const gegen = HEX_DIRS[(ri + 3) % 6]!;
    // Drei Felder entfernt auf der Gegenseite - wenn das Land ist.
    const sp = { q: a0.pos.q + gegen[0] * 3, r: a0.pos.r + gegen[1] * 3 };
    a.schleime = [{ id: 8, q: sp.q, r: sp.r, leben: 2, gross: false, art: 'spring' }];
    a.leben = 99;
    a = taste(a, 's');
    expect(a.schleime[0]!.angriff).toEqual(a.pos);
    const leben = a.leben;
    const start = a.pos;
    a = taste(a, t);
    expect(a.leben).toBe(leben);
    // Er ist gesprungen - auf das leere Feld, wenn es Land ist.
    if (!istWasser(gelaende(21, start.q, start.r))) expect(a.schleime[0]).toMatchObject({ q: start.q, r: start.r });
  });

  it('der Panzerschleim braucht einen Wurf ab 5', () => {
    const a0 = neuesAbenteuer(11);
    let b = imZug(11, [{ id: 9, q: a0.pos.q + 1, r: a0.pos.r, leben: 3, gross: false, art: 'panzer' }], 30);
    b.leben = 99;
    let treffer = 0;
    for (let i = 0; i < 30 && b.phase === 'ziehen' && b.schleime.length; i++) {
      const sicher = (b.fehlschlaege ?? 0) >= 2;
      b = taste(b, 'd');
      for (const e of b.ereignisse) if (e.art === 'hieb' && e.wer === 'ritter') {
        // Nach zwei Fehlschlaegen trifft der naechste sicher.
        expect(e.schaden > 0).toBe(sicher || e.wurf + 1 >= 5);
        if (e.schaden > 0) treffer++;
      }
    }
    expect(treffer).toBeGreaterThan(0);
  });

  it('Gift: wer in einer Pfuetze steht, verliert ein halbes Leben - sie vertrocknet', () => {
    let a = imZug(13, [], 10);
    a.leben = 5;
    // Zum Vergleich derselbe Tick ohne Pfuetze (Rasten kann heilen).
    const ohne = taste(a, 's').leben;
    a.gift = [{ q: a.pos.q, r: a.pos.r, bis: a.zeit + 2 }];
    a = taste(a, 's');
    expect(a.leben).toBe(ohne - 0.5);
    expect(a.ereignisse.some((e) => e.art === 'gift')).toBe(true);
    a = taste(a, 's');
    a = taste(a, 's');
    expect(a.gift).toHaveLength(0);
  });

  it('der Giftschleim hinterlaesst beim Kriechen eine Pfuetze', () => {
    const a0 = neuesAbenteuer(13);
    let a = imZug(13, [{ id: 7, q: a0.pos.q + 3, r: a0.pos.r, leben: 2, gross: false, art: 'gift' }], 10);
    a.leben = 99;
    a.zeit = 10;
    for (let i = 0; i < 4 && !(a.gift ?? []).length; i++) a = taste(a, 's');
    expect((a.gift ?? []).length).toBeGreaterThan(0);
  });

  it('der Teilschleim zerfaellt in zwei kleine Stuecke', () => {
    const a0 = neuesAbenteuer(21);
    const t = freieTaste(a0);
    const [dq, dr] = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t)]!;
    let a = imZug(21, [{ id: 9, q: a0.pos.q + dq, r: a0.pos.r + dr, leben: 1, gross: false, art: 'teil' }], 30);
    a.leben = 99;
    for (let i = 0; i < 20 && a.schleime.some((s) => s.id === 9); i++) a = taste(a, t);
    expect(a.schleime.some((s) => s.id === 9)).toBe(false);
    const stuecke = a.schleime.filter((s) => !s.art && s.leben === 1);
    expect(stuecke.length).toBeGreaterThan(0);
  });

  it('die Bosse kommen der Reihe nach: Koenig, Schatten, Koloss', () => {
    const a = neuesAbenteuer(13);
    expect(naechsterBoss({ koenige: 0 })).toBe('koenig');
    expect(naechsterBoss({ koenige: 1 })).toBe('schatten');
    expect(naechsterBoss({ koenige: 2 })).toBe('koloss');
    expect(naechsterBoss({ koenige: 3 })).toBe('koenig');
    const b = debugAktion(a, { t: 'boss', art: 'koloss' });
    const boss = b.schleime.find((s) => s.boss);
    expect(boss?.bossArt).toBe('koloss');
    expect(b.koenige ?? 0).toBe(a.koenige ?? 0);
  });

  it('ein Schneehase steht im Weg - er huscht weg, der Ritter bleibt stehen', () => {
    const a0 = imZug(21, [], 10);
    const t = freieTaste(a0);
    const [dq, dr] = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t)]!;
    const a = structuredClone(a0);
    a.tiere = [{ id: 99, q: a0.pos.q + dq, r: a0.pos.r + dr, art: 'hase' }];
    const b = taste(a, t);
    expect(b.pos).toEqual(a0.pos);
  });

  it('Waffen laden mit Schritten und Treffern; voll wirkt ihre Faehigkeit', () => {
    const a0 = neuesAbenteuer(21);
    let a = debugAktion(imZug(21, [], 20), { t: 'waffe', id: 'flammenschwert' });
    expect(ladungVon(a)).toMatchObject({ ist: 0, voll: 7, faehigkeit: 'feuerkreis' });
    const t = freieTaste(a);
    const zurueck = (['e', 'd', 'x', 'z', 'a', 'q'] as Taste[])[(['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t) + 3) % 6]!;
    for (let i = 0; i < 6; i++) a = taste(a, i % 2 ? zurueck : t);
    expect(a.ladung).toBe(6);
    // Der siebte Schritt fuellt den Balken - die Faehigkeit wartet auf Taste 1.
    a.schleime = [{ id: 70, q: a0.pos.q, r: a0.pos.r - 1, leben: 2, gross: false }];
    a = taste(a, i6(a, t, zurueck));
    expect(faehigkeitBereit(a)).toBe(true);
    expect(a.ereignisse.some((e) => e.art === 'geladen')).toBe(true);
    a = faehigkeitNutzen(a);
    expect(a.ereignisse.some((e) => e.art === 'faehigkeit' && e.name === 'feuerkreis')).toBe(true);
    expect(a.ladung).toBe(0);
  });

  it('Debug: Ladung voll loest die Faehigkeit sofort aus', () => {
    const a0 = neuesAbenteuer(13);
    let a = debugAktion(imZug(13, [{ id: 71, q: a0.pos.q + 1, r: a0.pos.r, leben: 2, gross: false }]), { t: 'waffe', id: 'flammenschwert' });
    a = debugAktion(a, { t: 'ladung' });
    expect(a.schleime).toHaveLength(0);
    a = debugAktion(debugAktion(a, { t: 'waffe', id: 'breitschwert' }), { t: 'ladung' });
    expect(a.bereit).toBe('schutzwall');
  });

  it('Legendaer: Solo-Leveling gibt Level mit Statups, der Herzcontainer ein leeres Herz', () => {
    let a = imZug(5);
    const max = maxLebenVon(a);
    a = debugAktion(a, { t: 'legendaer', id: 'herzcontainer' });
    expect(maxLebenVon(a)).toBe(max + 1);
    expect(a.leben).toBe(GRUND_LEBEN);
    a = debugAktion(a, { t: 'legendaer', id: 'sololeveling' });
    expect(a.stufe).toEqual({ lv: 1, ep: 0 });
    a = debugAktion(a, { t: 'ep' });
    expect(a.stufe?.lv).toBe(2);
    expect(maxLebenVon(a)).toBe(max + 2);
    const angriff = angriffVon(a);
    a = debugAktion(a, { t: 'ep' });
    expect(angriffVon(a)).toBe(angriff + 1);
    expect(a.legendaer).toEqual(['herzcontainer', 'sololeveling']);
  });

  it('Angel: am Wasser auswerfen kostet einen Schritt, Fische stapeln sich und heilen 1', () => {
    // Einen Start am Wasser suchen.
    for (let seed = 1; seed < 300; seed++) {
      const a0 = neuesAbenteuer(seed);
      if (!HEX_DIRS.some(([dq, dr]) => angelbar(gelaende(seed, a0.pos.q + dq, a0.pos.r + dr)))) continue;
      let a = debugAktion(imZug(seed, [], 30), { t: 'item', id: 'angel' });
      expect(kannAngeln(a)).toBe(true);
      for (let i = 0; i < 12; i++) a = angeln(a);
      expect(a.schritte).toBe(18);
      expect(a.inventar['fisch'] ?? 0).toBeGreaterThan(0);
      a.leben = 3;
      a = benutzen(a, 'fisch');
      expect(a.leben).toBe(4);
      return;
    }
    throw new Error('kein Start am Wasser');
  });

  it('Extra-Leben: der Ritter steht einmal wieder auf', () => {
    const a0 = neuesAbenteuer(13);
    let a = debugAktion(imZug(13, [{ id: 5, q: a0.pos.q, r: a0.pos.r - 1, leben: 2, gross: false, angriff: { ...a0.pos } }], 10), { t: 'legendaer', id: 'extraleben' });
    a.leben = 1;
    a = taste(a, 's');
    expect(a.phase).toBe('ziehen');
    expect(a.leben).toBe(Math.max(1, Math.ceil(maxLebenVon(a) / 2)));
    expect(a.ereignisse.some((e) => e.art === 'wiederbelebt')).toBe(true);
    expect(a.extraLeben).toBe(0);
  });

  it('Hermes-Stiefel: ein Schritt huepft bis zu drei Felder, auch uebers Wasser', () => {
    let a = debugAktion(imZug(21, [], 10), { t: 'legendaer', id: 'hermes' });
    const vorher = a.pos;
    const t = freieTaste(a);
    a = taste(a, t);
    expect(hexDistance(vorher, a.pos)).toBeGreaterThanOrEqual(1);
    expect(a.schritte).toBe(9);
    expect(betretbar(a, a.pos.q, a.pos.r)).toBe(true);
  });

  it('Pentagrammmeister: ein geschlossener Weg wirkt einen Zauber, danach beginnt die Zeichnung neu', () => {
    // Ein Dreieck: hin, zur Seite, zurueck - drei Schritte zurueck zum Start.
    for (let seed = 1; seed < 400; seed++) {
      const a0 = neuesAbenteuer(seed);
      // Dreieck: d (Ost), z (Suedwest), q (Nordwest) - zurueck am Start.
      const p1 = { q: a0.pos.q + 1, r: a0.pos.r };
      const p2 = { q: a0.pos.q, r: a0.pos.r + 1 };
      if (![p1, p2].every((h) => eben(gelaende(seed, h.q, h.r)))) continue;
      let a = debugAktion(imZug(seed, [], 10), { t: 'legendaer', id: 'pentagramm' });
      a.schleime = [];
      a = taste(a, 'd');
      a = taste(a, 'z');
      a = taste(a, 'q');
      expect(a.pos).toEqual(a0.pos);
      expect(a.ereignisse.some((e) => e.art === 'zauber' && e.name === 'funkenregen')).toBe(true);
      expect(a.pfad).toHaveLength(1);
      return;
    }
    throw new Error('kein Start mit freiem Dreieck');
  });

  it('Pentagrammmeister Stufe 2: der Funkenregen bleibt als Kreis und trifft noch dreimal', () => {
    for (let seed = 1; seed < 400; seed++) {
      const a0 = neuesAbenteuer(seed);
      const p1 = { q: a0.pos.q + 1, r: a0.pos.r };
      const p2 = { q: a0.pos.q, r: a0.pos.r + 1 };
      if (![p1, p2].every((h) => eben(gelaende(seed, h.q, h.r)))) continue;
      let a = debugAktion(debugAktion(imZug(seed, [], 20), { t: 'legendaer', id: 'pentagramm' }), { t: 'pentaStufe' });
      expect(a.pentaStufe).toBe(2);
      a.schleime = [];
      a = taste(a, 'd');
      a = taste(a, 'z');
      a = taste(a, 'q');
      expect(a.kreise).toHaveLength(1);
      expect(a.kreise![0]).toMatchObject({ name: 'funkenregen', mal: 3 });
      let regen = 0;
      for (let i = 0; i < KREIS_DAUER + 1; i++) {
        a = taste(a, 's');
        regen += a.ereignisse.filter((e) => e.art === 'kreis' && e.name === 'funkenregen').length;
      }
      expect(regen).toBe(3);
      expect(a.kreise).toHaveLength(0);
      return;
    }
    throw new Error('kein Start mit freiem Dreieck');
  });

  it('Stufe 2: das Pentagramm schadet dauernd, der Bannkreis bannt, die Schutzrune schuetzt, der Heilkreis heilt', () => {
    const a0 = neuesAbenteuer(13);
    const neben = { q: a0.pos.q + 1, r: a0.pos.r };
    const kreis = (name: 'pentagramm' | 'bannkreis' | 'schutzrune' | 'heilkreis', felder: { q: number; r: number }[]) => [{ id: 900, name, felder, mitte: a0.pos, bis: 99 }];
    // Pentagramm: ein Schleim darin verliert jeden Tick ein Leben.
    let a = imZug(13, [{ id: 7, q: neben.q, r: neben.r, leben: 4, gross: true }], 10);
    a.leben = 99;
    a.kreise = kreis('pentagramm', [neben]);
    a = taste(a, 's');
    expect(a.schleime[0]!.leben).toBe(3);
    // Bannkreis: gebannt holt er nicht aus, obwohl er neben dem Ritter steht.
    a = imZug(13, [{ id: 7, q: neben.q, r: neben.r, leben: 2, gross: false }], 10);
    a.kreise = kreis('bannkreis', [neben]);
    for (let i = 0; i < 4; i++) {
      a = taste(a, 's');
      expect(a.ereignisse.some((e) => e.art === 'ansage')).toBe(false);
    }
    expect(a.schleime[0]!.gebannt).toBeGreaterThan(a.zeit);
    // Schutzrune: der angesagte Schlag prallt ab.
    a = imZug(13, [{ id: 7, q: neben.q, r: neben.r, leben: 2, gross: false, angriff: { ...a0.pos } }], 10);
    a.leben = 5;
    a.kreise = kreis('schutzrune', [a0.pos]);
    a = taste(a, 's');
    expect(a.leben).toBeGreaterThanOrEqual(5);
    expect(a.ereignisse.some((e) => e.art === 'kreis' && e.name === 'schutzrune')).toBe(true);
    // Heilkreis: jeden Tick ein halbes Leben.
    a = imZug(13, [], 10);
    a.leben = 2;
    const ohne = taste(a, 's').leben;
    a.kreise = kreis('heilkreis', [a0.pos]);
    expect(taste(a, 's').leben).toBe(ohne + 0.5);
  });

  it('wer zu oft zaubert, ruft den Pentagrammschleim - bezwungen gibt er Stufe 2', () => {
    for (let seed = 1; seed < 400; seed++) {
      const a0 = neuesAbenteuer(seed);
      const p1 = { q: a0.pos.q + 1, r: a0.pos.r };
      const p2 = { q: a0.pos.q, r: a0.pos.r + 1 };
      if (![p1, p2].every((h) => eben(gelaende(seed, h.q, h.r)))) continue;
      let a = debugAktion(imZug(seed, [], 20), { t: 'legendaer', id: 'pentagramm' });
      a.schleime = [];
      a.zauberZahl = PENTA_BOSS_NACH - 1;
      a = taste(a, 'd');
      a = taste(a, 'z');
      a = taste(a, 'q');
      const boss = a.schleime.find((s) => s.boss);
      expect(boss?.bossArt).toBe('penta');
      expect(a.bossErwacht ?? false).toBe(false);
      // Neben den Ritter, fast bezwungen - zuschlagen, bis er faellt.
      const t = freieTaste(a);
      const [dq, dr] = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t)]!;
      a.schleime = [{ ...boss!, q: a.pos.q + dq, r: a.pos.r + dr, leben: 1, angriff: null, flaeche: null }];
      a.leben = 99;
      a.schritte = 30;
      for (let i = 0; i < 25 && a.schleime.some((s) => s.boss); i++) a = taste(a, t);
      expect(a.schleime.some((s) => s.boss)).toBe(false);
      expect(a.pentaStufe).toBe(2);
      // Kein zweites Mal.
      expect(a.pentaGerufen).toBe(true);
      return;
    }
    throw new Error('kein Start mit freiem Dreieck');
  });

  it('nah am Start stehen ein Haendler und ein Werber - anlaufen oeffnet den Laden, verkaufen bringt Gold', () => {
    const a0 = neuesAbenteuer(13);
    const h = a0.orte!.find((o) => o.art === 'haendler')!;
    const w = a0.orte!.find((o) => o.art === 'werber')!;
    expect(hexDistance(h, a0.pos)).toBe(3);
    expect(hexDistance(w, a0.pos)).toBe(4);
    // Neben den Haendler stellen und gegen ihn laufen.
    let a = imZug(13, [], 10);
    const neben = HEX_DIRS.map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr })).find((x) => betretbar(a, x.q, x.r))!;
    a.pos = neben;
    a.inventar = { gelee: 3, axt: 1 };
    const t = tasteZu(a.pos, h)!;
    a = taste(a, t);
    expect(a.laden).toBe(h.id);
    expect(a.pos).toEqual(neben);
    expect(a.schritte).toBe(10);
    a = verkaufen(a, 'gelee', true);
    expect(a.inventar['gelee']).toBeUndefined();
    expect(a.inventar['gold']).toBe(6);
    a = verkaufen(a, 'axt');
    expect(a.inventar['gold']).toBe(6 + verkaufsPreis('axt'));
    a = kaufen(a, 'kraut');
    expect(a.inventar['kraut']).toBe(1);
    // Legendaeres kauft er nicht.
    expect(verkaufsPreis('hermes')).toBe(0);
  });

  it('Soeldner: anheuern, folgen, zuschlagen und dazulernen', () => {
    const a0 = neuesAbenteuer(13);
    const w = a0.orte!.find((o) => o.art === 'werber')!;
    let a = imZug(13, [], 30);
    a.pos = HEX_DIRS.map(([dq, dr]) => ({ q: w.q + dq, r: w.r + dr })).find((x) => betretbar(a, x.q, x.r))!;
    a.inventar = { gold: 30 };
    a = ansprechen(a, w.id);
    const angebot = werberAngebot(a, w);
    a = anheuern(a, 0);
    expect(a.gefolge).toHaveLength(1);
    expect(a.inventar['gold']).toBe(30 - angebot[0]!.preis);
    expect(a.ereignisse.some((e) => e.art === 'spruch')).toBe(true);
    // Dasselbe Angebot gibt es nur einmal.
    expect(anheuern(a, 0)).toBe(a);
    // Ein Schleim neben dem Soeldner: er schlaegt zu (der Heilerin fehlt der Angriff - dann ein Kaempfer).
    const g = a.gefolge![0]!;
    g.art = 'zwerg';
    a.leben = 99;
    const platz = HEX_DIRS.map(([dq, dr]) => ({ q: g.q + dq, r: g.r + dr })).find((x) => betretbar(a, x.q, x.r) && hexDistance(x, a.pos) > 1 && !(x.q === a.pos.q && x.r === a.pos.r));
    if (platz) {
      a.schleime = [{ id: 500, q: platz.q, r: platz.r, leben: 9, gross: true }];
      let hiebe = 0;
      for (let i = 0; i < 6; i++) {
        a = taste(a, 's');
        hiebe += a.ereignisse.filter((e) => e.art === 'hieb' && e.wer === g.id).length;
      }
      expect(hiebe).toBeGreaterThan(0);
      expect(a.gefolge![0]!.ep + (a.gefolge![0]!.lv - 1) * 5).toBeGreaterThan(0);
    }
  });

  it('der Soeldner folgt dem Ritter', () => {
    const a0 = neuesAbenteuer(21);
    let a = imZug(21, [], 30);
    a.gefolge = [{ id: 600, art: 'zwerg', name: 'Odo', q: a0.pos.q, r: a0.pos.r, leben: 5, max: 5, lv: 1, ep: 0 }];
    // Der Ritter geht weg (wir setzen ihn), der Soeldner holt auf.
    const weg = hexesInRangeTest(a0.pos, 4).find((h) => hexDistance(h, a0.pos) === 4 && betretbar(a, h.q, h.r))!;
    a.pos = weg;
    for (let i = 0; i < 6; i++) a = taste(a, 's');
    expect(hexDistance(a.gefolge![0]!, a.pos)).toBeLessThanOrEqual(1);
  });

  it('Fraktionen ziehen durchs Land: Orden, Jaeger oder Banditen tauchen auf', () => {
    let a = imZug(13, [], 200);
    a.leben = 999;
    let gesehen = false;
    for (let i = 0; i < 60 && !gesehen; i++) {
      a = taste(a, 's');
      gesehen = (a.wanderer ?? []).length > 0 || a.schleime.some((s) => s.art === 'bandit');
    }
    expect(gesehen).toBe(true);
  });

  it('auf den Wiesen grasen Schafe', () => {
    let schafe = 0;
    for (let seed = 1; seed < 40; seed++) schafe += (neuesAbenteuer(seed).tiere ?? []).filter((t) => t.art === 'schaf').length;
    expect(schafe).toBeGreaterThan(5);
  });

  it('mit der Axt im Wald einen Gegner faellen bringt Holz', () => {
    for (let seed = 1; seed < 300; seed++) {
      const a0 = neuesAbenteuer(seed);
      for (const t of ['d', 'e', 'x', 'z', 'a', 'q'] as Taste[]) {
        const [dq, dr] = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(t)]!;
        const h = { q: a0.pos.q + dq, r: a0.pos.r + dr };
        if (gelaende(seed, h.q, h.r) !== 'wald' || fundAuf(a0, h.q, h.r) || (a0.orte ?? []).some((o) => o.q === h.q && o.r === h.r)) continue;
        let a = imZug(seed, [{ id: 77, q: h.q, r: h.r, leben: 1, gross: false }], 30);
        a.ausruestung = { ...a.ausruestung, waffe: 'axt' };
        a.leben = 99;
        a.tiere = [];
        for (let i = 0; i < 25 && a.schleime.some((s) => s.id === 77); i++) a = taste(a, t);
        expect(a.inventar['holz']).toBe(1);
        expect(verkaufsPreis('holz')).toBe(2);
        return;
      }
    }
    throw new Error('kein Wald neben dem Start');
  });

  it('ein Boss verfolgt den Ritter, egal wie weit er ist', () => {
    const a0 = neuesAbenteuer(13);
    let a = imZug(13, [{ id: 50, q: a0.pos.q + 20, r: a0.pos.r - 5, leben: 20, max: 20, gross: true, boss: true, bossArt: 'koloss', zaehler: 0 }], 10);
    a.leben = 99;
    for (let i = 0; i < 3; i++) a = taste(a, 's');
    expect(hexDistance(a.schleime[0]!, a.pos)).toBeLessThanOrEqual(6);
  });

  it('Baeche liegen nur auf Wiese und verbinden zwei Gewaesser', () => {
    for (const seed of [1, 21, 99]) {
      for (let q = -40; q <= 40; q++)
        for (let r = -40; r <= 40; r++) {
          if (gelaende(seed, q, r) !== 'fluss') continue;
          // Entlang einer der beiden Bachlinien liegt an beiden Enden Wasser.
          const ok = [[0, 1], [-1, 1]].some(([dq, dr]) =>
            [1, -1].every((s) => {
              for (let k = 1; k <= 8; k++) {
                const b = gelaende(seed, q + dq! * s * k, r + dr! * s * k);
                if (istWasser(b)) return true;
                if (b !== 'wiese' && b !== 'fluss') return false;
              }
              return false;
            }),
          );
          expect(ok).toBe(true);
        }
    }
  });

  it('Pentagrammmeister Stufe 3: Pentagramm-Kills auf Stufe 2 schalten sie frei, dann laden sie die Beschwoerung', () => {
    const a0 = neuesAbenteuer(13);
    const neben = { q: a0.pos.q + 1, r: a0.pos.r };
    let a = imZug(13, [{ id: 7, q: neben.q, r: neben.r, leben: 1, gross: false }], 10);
    a.pentaStufe = 2;
    a.pentaKills = PENTA_STUFE3_NACH - 1;
    a.kreise = [{ id: 900, name: 'pentagramm', felder: [neben], mitte: a0.pos, bis: 99 }];
    a = taste(a, 's');
    expect(a.pentaStufe).toBe(3);
    expect(a.ereignisse.some((e) => e.art === 'legende' && e.id === 'pentagramm3')).toBe(true);
    // Auf Stufe 3 laedt jeder Pentagramm-Kill die Beschwoerung.
    a.schleime = [{ id: 8, q: neben.q, r: neben.r, leben: 1, gross: false }];
    a = taste(a, 's');
    expect(a.beschwoerung).toBe(1);
  });

  it('Beschwoerung: der haeufigste Zauber bestimmt den Begleiter', () => {
    let a = imZug(13, [], 10);
    a.pentaStufe = 3;
    a.beschwoerung = BESCHWOERUNG_VOLL;
    a.zauberArten = { funkenregen: 1, heilkreis: 4, bannkreis: 2 };
    a = beschwoeren(a);
    const b = a.gefolge!.find((g) => g.beschworen)!;
    expect(b.art).toBe('lichtgeist');
    expect(a.beschwoerung).toBe(0);
    expect(angeheuerte(a)).toBe(0);
    // Leer laesst sich nicht beschwoeren.
    expect(beschwoeren(a)).toBe(a);
    // Ein neuer ersetzt den alten.
    a.beschwoerung = BESCHWOERUNG_VOLL;
    a.zauberArten = { schutzrune: 9 };
    a = beschwoeren(a);
    expect(a.gefolge!.filter((g) => g.beschworen).map((g) => g.art)).toEqual(['golem']);
  });

  it('der Runenwaechter zieht die Schlaege auf sich', () => {
    const a0 = neuesAbenteuer(13);
    // Schleim oestlich des Ritters, Waechter suedoestlich - beide neben dem Schleim.
    const schleim = { q: a0.pos.q + 1, r: a0.pos.r };
    const waechter = { q: a0.pos.q, r: a0.pos.r + 1 };
    let a = imZug(13, [{ id: 7, q: schleim.q, r: schleim.r, leben: 2, gross: false }], 10);
    a.gefolge = [{ id: 600, art: 'golem', name: 'Runenwaechter', q: waechter.q, r: waechter.r, leben: 10, max: 10, lv: 1, ep: 0, beschworen: true }];
    a.leben = 99;
    a = taste(a, 's');
    const ansage = a.ereignisse.find((e) => e.art === 'ansage' && e.wer === 7);
    if (ansage && ansage.art === 'ansage') expect(ansage.feld).toEqual(waechter);
  });

  it('Wuerfel als Ausruestung: jeder wirft anders', () => {
    const mit = (id: string | null, seed: number) => {
      const a = structuredClone(neuesAbenteuer(seed));
      a.ausruestung = { ...a.ausruestung, wuerfel: id };
      return wuerfeln(a);
    };
    const wuerfe = (id: string | null) => Array.from({ length: 80 }, (_, i) => mit(id, i + 1));
    expect(neuesAbenteuer(1).ausruestung.wuerfel).toBeNull();
    // Blei: nie unter 3.
    expect(Math.min(...wuerfe('bleiwuerfel').map((a) => a.wurf!))).toBeGreaterThanOrEqual(3);
    // Wanderwuerfel: auch 7 und 8.
    const wander = wuerfe('wanderwuerfel').map((a) => a.wurf!);
    expect(Math.max(...wander)).toBe(8);
    // Fluchwuerfel: bis 10 - eine 1 kostet ein Leben.
    const fluch = wuerfe('fluchwuerfel');
    expect(Math.max(...fluch.map((a) => a.wurf!))).toBe(10);
    for (const a of fluch) if (a.wurf === 1) expect(a.leben).toBe(GRUND_LEBEN - 1);
    // Zwillinge: der hoehere zaehlt.
    for (const a of wuerfe('zwillingswuerfel')) expect(a.wurf).toBeGreaterThanOrEqual(a.zweiterWurf!);
    // Goldwuerfel: eine 6 bringt Gold.
    for (const a of wuerfe('goldwuerfel')) expect((a.inventar['gold'] ?? 0) > 0).toBe(a.wurf === 6);
  });

  it('Glueckswuerfel: einmal je Zug neu wuerfeln, nur vor dem ersten Schritt', () => {
    let a = structuredClone(neuesAbenteuer(21));
    a.ausruestung = { ...a.ausruestung, wuerfel: 'glueckswuerfel' };
    a = wuerfeln(a);
    expect(kannNeuWuerfeln(a)).toBe(true);
    a = neuWuerfeln(a);
    expect(a.neuGewuerfelt).toBe(true);
    expect(a.schritte).toBe(a.wurf);
    expect(kannNeuWuerfeln(a)).toBe(false);
    // Ohne Glueckswuerfel gar nicht.
    expect(kannNeuWuerfeln(wuerfeln(neuesAbenteuer(21)))).toBe(false);
  });

  it('Wuerfel mit Seiteneffekten: bestimmte Augen loesen etwas aus', () => {
    /** Ein Wurf mit dem Wuerfel, der die gewuenschte Augenzahl zeigt (oder nicht). */
    const wurfMit = (id: string, treffer: boolean, vorher: (a: Abenteuer) => void = () => {}) => {
      for (let seed = 1; seed < 500; seed++) {
        const a = structuredClone(neuesAbenteuer(seed));
        a.ausruestung = { ...a.ausruestung, wuerfel: id };
        vorher(a);
        const b = wuerfeln(a);
        if (WUERFEL_EFFEKT[id]!.includes(b.wurf!) === treffer) return b;
      }
      throw new Error('kein passender Wurf');
    };
    // Kraeuterwuerfel: eine 1 bringt ein Kraut, sonst nichts.
    // (Ein Kraut hat jeder von Anfang an.)
    expect(wurfMit('kraeuterwuerfel', true).inventar['kraut']).toBe(2);
    expect(wurfMit('kraeuterwuerfel', false).inventar['kraut']).toBe(1);
    // Schildwuerfel: 1 oder 2 - Schutzwall.
    expect(wurfMit('schildwuerfel', true).bereit).toBe('schutzwall');
    // Heilwuerfel: gerade Zahl heilt ein halbes Herz.
    const heil = wurfMit('heilwuerfel', true, (a) => (a.leben = 3));
    expect(heil.leben).toBe(3.5);
    // Funkenwuerfel: eine 6 entfesselt die Faehigkeit der Waffe (Flammenschwert: Feuerkreis).
    const funken = wurfMit('funkenwuerfel', true, (a) => (a.ausruestung = { ...a.ausruestung, waffe: 'flammenschwert' }));
    expect(faehigkeitBereit(funken)).toBe(true);
    // Runenwuerfel: 5 oder 6 - Funken auf Gegner bis zwei Felder.
    const rune = wurfMit('runenwuerfel', true, (a) => (a.schleime = [{ id: 7, q: a.pos.q + 2, r: a.pos.r, leben: 3, gross: false }]));
    expect(rune.schleime[0]!.leben).toBe(2);
    // Bannwuerfel: eine 6 bannt Gegner bis drei Felder.
    const bann = wurfMit('bannwuerfel', true, (a) => (a.schleime = [{ id: 7, q: a.pos.q + 3, r: a.pos.r, leben: 3, gross: false }]));
    expect(bann.schleime[0]!.gebannt).toBeGreaterThan(bann.zeit);
    expect(bann.ereignisse.some((e) => e.art === 'wuerfelEffekt')).toBe(true);
  });

  it('Altaere: Blut fuer Legendaeres, Gold fuer eine Truhe, Herausforderung - je einmal', () => {
    const basis = () => {
      const a = imZug(13, [], 10);
      const h = a.orte!.find((o) => o.art === 'haendler')!;
      // Den Haendler zum Altar machen und den Ritter daneben stellen.
      a.orte = a.orte!.map((o) => (o.id === h.id ? { ...o, art: 'altar' as const } : o));
      a.pos = HEX_DIRS.map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr })).find((x) => betretbar(a, x.q, x.r))!;
      a.inventar = { gold: 20 };
      return ansprechen(a, h.id);
    };
    const blut = opfern(basis(), 'blut');
    expect(maxLebenVon(blut)).toBe(GRUND_LEBEN - 1);
    expect(blut.wahl?.art).toBe('schatz');
    const gold = opfern(basis(), 'gold');
    expect(gold.inventar['gold']).toBe(8);
    expect(gold.wahl?.art).toBe('truhe');
    const ruf = opfern(basis(), 'ruf');
    expect(ruf.schleime.length).toBeGreaterThanOrEqual(1);
    expect(ruf.schleime.some((s) => s.elite)).toBe(true);
    // Einmal benutzt ist er erloschen.
    expect(opfern({ ...ansprechen(ruf, ruf.orte!.find((o) => o.benutzt)!.id) }, 'gold').inventar['gold']).toBe(20);
  });

  it('Iteration 2: Boss nach AKT_ZUEGE Zuegen, Soeldner lassen den letzten Schlag, Schmied, Legendaere mit Synergien', () => {
    // Der Boss kommt auch ohne Kills, wenn der Akt lange genug dauert.
    let a = imZug(13, [], 10);
    a.aktStart = a.zug - AKT_ZUEGE;
    a = taste(a, 's');
    expect(a.schleime.some((s) => s.boss)).toBe(true);
    // Ein Soeldner neben einem Boss mit 1 Leben laesst ihn leben.
    const a0 = neuesAbenteuer(13);
    let b = imZug(13, [{ id: 50, q: a0.pos.q + 3, r: a0.pos.r, leben: 1, max: 10, gross: true, boss: true, bossArt: 'koenig', zaehler: 0 }], 30);
    b.gefolge = [{ id: 600, art: 'soeldnerin', name: 'Hilda', q: a0.pos.q + 2, r: a0.pos.r, leben: 9, max: 9, lv: 5, ep: 0 }];
    b.leben = 99;
    for (let i = 0; i < 8; i++) b = taste(b, 's');
    expect(b.schleime.some((s) => s.boss)).toBe(true);
    // Schmied: +1 Angriff fuer Gold.
    let c = imZug(13, [], 10);
    const h = c.orte!.find((o) => o.art === 'haendler')!;
    c.pos = HEX_DIRS.map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr })).find((x) => betretbar(c, x.q, x.r))!;
    c.inventar = { gold: 50 };
    c = ansprechen(c, h.id);
    const vorher = angriffVon(c);
    c = schmieden(c, 'angriff');
    expect(angriffVon(c)).toBe(vorher + 1);
    expect(c.inventar['gold']).toBe(38);
    // Glueckspilz + Sternschnuppe: eine 1 wird zur 6, und ein Komet faellt.
    for (let seed = 1; seed < 300; seed++) {
      const d = structuredClone(neuesAbenteuer(seed));
      d.legendaer = ['glueckspilz', 'kometen'];
      d.schleime = [{ id: 7, q: d.pos.q + 3, r: d.pos.r, leben: 5, gross: false }];
      const e = wuerfeln(structuredClone(d));
      const ohne = wuerfeln(structuredClone({ ...d, legendaer: [] }));
      if (ohne.wurf !== 1) continue;
      expect(e.wurf).toBe(6);
      expect(e.schleime[0]!.leben).toBe(3);
      break;
    }
    // Extra-Leben gibt es hoechstens einmal.
    const f = structuredClone(neuesAbenteuer(3));
    f.ereignisse = [];
    legendaerAnwenden(f, 'extraleben', 0);
    legendaerAnwenden(f, 'extraleben', 0);
    expect(f.extraLeben).toBe(1);
  });

  it('Werber: Namen passen zum Geschlecht und sind nie der eigene', () => {
    for (let seed = 1; seed < 40; seed++) {
      const a = neuesAbenteuer(seed);
      const w = a.orte!.find((o) => o.art === 'werber');
      if (!w) continue;
      for (const an of werberAngebot(a, w)) {
        expect(an.name).not.toBe(w.name);
        if (an.art === 'soeldnerin' || an.art === 'paladin') expect(['Konrad', 'Odo', 'Bjarne', 'Arnulf']).not.toContain(an.name);
      }
    }
  });

  it('Fokus: Warten sammelt ihn, der naechste Hieb nutzt ihn, Gehen bricht ihn', () => {
    let a = imZug(13, [], 10);
    a = taste(a, 's');
    a = taste(a, 's');
    expect(a.fokus).toBe(2);
    a = taste(a, freieTaste(a));
    expect(a.fokus).toBe(0);
    const a0 = neuesAbenteuer(13);
    let b = imZug(13, [{ id: 7, q: a0.pos.q + 3, r: a0.pos.r, leben: 9, gross: false }], 10);
    b.leben = 99;
    b.fokus = 3;
    b.schleime = [{ id: 7, q: a0.pos.q + 1, r: a0.pos.r, leben: 9, gross: false }];
    b = taste(b, 'd');
    const hieb = b.ereignisse.find((e) => e.art === 'hieb' && e.wer === 'ritter');
    expect(hieb && hieb.art === 'hieb' && hieb.schaden).toBeGreaterThanOrEqual(2);
    expect(b.fokus).toBe(0);
  });

  it('Iteration 3: wer ins Leere schlaegt, taumelt; hoechstens zwei Ansagen zugleich; Fehlschlag gibt Fokus', () => {
    const a0 = neuesAbenteuer(13);
    const t = freieTaste(a0);
    let a = imZug(13, [{ id: 7, q: a0.pos.q, r: a0.pos.r - 1, leben: 9, gross: false, angriff: { ...a0.pos } }], 10);
    a.leben = 99;
    a = taste(a, t);
    expect(a.ereignisse.some((e) => e.art === 'hieb' && e.wer === 7 && e.ziel === null)).toBe(true);
    expect(a.schleime[0]!.gebannt).toBeGreaterThan(a.zeit);
    // Fuenf Schleime rundum: hoechstens zwei sagen an.
    let b = imZug(13, [], 10);
    b.leben = 99;
    b.schleime = HEX_DIRS.slice(0, 5).map(([dq, dr], i) => ({ id: 30 + i, q: a0.pos.q + dq, r: a0.pos.r + dr, leben: 9, gross: false }));
    b = taste(b, 's');
    expect(b.schleime.filter((s) => s.angriff || s.flaeche).length).toBeLessThanOrEqual(2);
  });

  it('Gelaende: im Wald +1 Abwehr, auf Huegeln +1 Angriff', () => {
    for (let seed = 1; seed < 200; seed++) {
      const a = neuesAbenteuer(seed);
      const wald = hexesInRangeTest(a.pos, 6).find((h) => gelaende(seed, h.q, h.r) === 'wald');
      const wiese = hexesInRangeTest(a.pos, 6).find((h) => gelaende(seed, h.q, h.r) === 'wiese');
      if (!wald || !wiese) continue;
      expect(abwehrVon({ ...a, pos: wald })).toBe(abwehrVon({ ...a, pos: wiese }) + 1);
      return;
    }
  });

  it('Herzen werden gleich verbraucht - bei vollem Leben bleiben sie liegen', () => {
    // Ein Herz direkt neben den Start legen: das Feld suchen, auf dem eines liegt.
    let seed = 0;
    let ziel: { q: number; r: number } | null = null;
    let t: Taste | null = null;
    for (seed = 1; seed < 400 && !ziel; seed++) {
      const a0 = neuesAbenteuer(seed);
      for (const k of ['d', 'e', 'x', 'z', 'a', 'q'] as Taste[]) {
        const [dq, dr] = HEX_DIRS[['e', 'd', 'x', 'z', 'a', 'q'].indexOf(k)]!;
        const h = { q: a0.pos.q + dq, r: a0.pos.r + dr };
        if (fundAuf(a0, h.q, h.r) === 'herz' && eben(gelaende(seed, h.q, h.r))) {
          ziel = h;
          t = k;
          break;
        }
      }
    }
    seed -= 1;
    expect(ziel).not.toBeNull();
    const voll = taste(imZug(seed), t!);
    expect(voll.inventar['herz']).toBeUndefined();
    expect(fundAuf(voll, ziel!.q, ziel!.r)).toBe('herz');
    const wund = structuredClone(imZug(seed));
    wund.leben = 3;
    const b = taste(wund, t!);
    expect(b.leben).toBe(4);
    expect(b.inventar['herz']).toBeUndefined();
    expect(fundAuf(b, ziel!.q, ziel!.r)).toBeNull();
  });

  it('Kraut heilt, Ausruestung wird angelegt, halbe Herzen zaehlen halb', () => {
    let a = structuredClone(neuesAbenteuer(5));
    a.leben = 2;
    a.inventar = { kraut: 1, axt: 1, halbherz: 1 };
    a = benutzen(a, 'kraut');
    expect(a.leben).toBe(4);
    a = benutzen(a, 'halbherz');
    expect(a.leben).toBe(4.5);
    a = benutzen(a, 'axt');
    expect(a.ausruestung.waffe).toBe('axt');
    expect(a.inventar['schwert']).toBe(1);
  });
});
