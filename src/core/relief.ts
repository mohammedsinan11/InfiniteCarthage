/**
 * Wie hoch ein Feld gezeichnet wird.
 *
 * OPTIK, keine Regel - wie biome.ts. Ein Berg liefert Erz, ob er hoch oder
 * flach gezeichnet wird. Wer an dieser Datei dreht, aendert kein einziges
 * Spielergebnis.
 *
 * Das Vorbild (hexmap) schiebt jede Landkachel beim Zeichnen nach oben, je
 * nach geglaetteter Hoehe. Weil die Zeilen einander ueberlappen und von oben
 * nach unten gezeichnet werden, verdeckt die vordere Zeile die angehobene
 * dahinter - und aus einer Flaeche wird eine Landschaft. Es ist der groesste
 * einzelne Unterschied zwischen seinen Bildern und unseren, und er kostet
 * keine globale Information: die Hoehe ist bei uns ohnehin eine reine
 * Funktion.
 *
 * GEGLAETTET, weil die rohe Hoehe von Feld zu Feld springt. Ungeglaettet
 * saehe die Karte aus wie ein Nagelbrett; erst der Mittelwert ueber die
 * Nachbarschaft ergibt Haenge.
 *
 * WASSER BLEIBT UNTEN. Das ist nicht nur huebscher, es ist die Aussage: Land
 * erhebt sich aus dem Meer. Ein angehobener Ozean waere eine Behauptung ueber
 * Wassertiefe, die wir nicht treffen koennen.
 */

import { HEX_DIRS, neighbors } from './coords';
import { LAKE_LEVEL, SEA_LEVEL, fieldsAt, isSeaAt, terrainAt } from './worldgen';

/**
 * Wie stark hohe Lagen bevorzugt werden.
 *
 * Ueber 1 heisst: das Flachland bleibt flach und erst das Gebirge steigt
 * deutlich. Bei 1 waere schon jeder Huegel angehoben und die Karte wirkte
 * durchgehend wellig statt gegliedert.
 */
const GAMMA = 1.35;

/**
 * Wie weit gemittelt wird.
 *
 * Ein Ring (das Feld und seine sechs Nachbarn) genuegt. Zwei Ringe waeren
 * glatter, kosten aber 19 statt 7 Auswertungen je Feld - und die Kaemme, die
 * wir uns in worldgen gerade erst geholt haben, wuerden wieder verschwinden.
 */
function geglaetteteHoehe(seed: number, q: number, r: number): number {
  let summe = hoeheVon(seed, q, r);
  for (const n of neighbors(q, r)) summe += hoeheVon(seed, n.q, n.r);
  return summe / 7;
}

/**
 * Gemerkte Hoehen.
 *
 * Jedes Feld wird beim Glaetten siebenmal gebraucht - einmal fuer sich und
 * sechsmal als Nachbar - und jede Auswertung sind mehrere Rauschlagen. Ohne
 * dieses Gedaechtnis rechnet der Bildaufbau dieselben Werte wieder und wieder.
 *
 * Der Speicher ist gedeckelt und wird beim Seedwechsel geleert. Semantisch
 * bleibt die Funktion rein: gleiche Eingabe, gleiches Ergebnis.
 */
const GEDAECHTNIS_MAX = 60000;
let gemerkterSeed = Number.NaN;
const gedaechtnis = new Map<string, number>();

/** Gemerktes rohes Relief - die begrenzte Fassung fragt es hundertfach ab. */
let rohSeed = Number.NaN;
const rohCache = new Map<string, number>();

function hoeheVon(seed: number, q: number, r: number): number {
  if (seed !== gemerkterSeed) {
    gedaechtnis.clear();
    gemerkterSeed = seed;
  }
  const k = q + ':' + r;
  const da = gedaechtnis.get(k);
  if (da !== undefined) return da;

  const v = fieldsAt(seed, q, r).elevation;
  if (gedaechtnis.size >= GEDAECHTNIS_MAX) gedaechtnis.clear();
  gedaechtnis.set(k, v);
  return v;
}

/**
 * Hoehe eines Feldes fuers Zeichnen, 0 bis 1.
 *
 * 0 heisst Meereshoehe, 1 der hoechste Gipfel. Wasser ist immer 0.
 */
export function reliefAt(seed: number, q: number, r: number): number {
  if (seed !== rohSeed) {
    rohCache.clear();
    rohSeed = seed;
  }
  const k = q + ':' + r;
  const da = rohCache.get(k);
  if (da !== undefined) return da;
  const v = berechneRelief(seed, q, r);
  if (rohCache.size >= GEDAECHTNIS_MAX) rohCache.clear();
  rohCache.set(k, v);
  return v;
}

function berechneRelief(seed: number, q: number, r: number): number {
  if (terrainAt(seed, q, r) === 'water') return 0;
  const h = geglaetteteHoehe(seed, q, r);
  // Land beginnt an der Seegrenze; das Meer entscheidet ein anderes Feld.
  const ueber = (h - LAKE_LEVEL) / (1 - LAKE_LEVEL);
  if (ueber <= 0) return 0;
  return Math.min(1, ueber) ** GAMMA;
}

// --- Wohin das Relief strebt -------------------------------------------------

/**
 * Grundhebung aus dem Kontinentkern.
 *
 * Das rohe Relief folgt dem Gelaende und wechselt alle paar Felder; mit
 * begrenzter Steigung zieht jede Niederung die Umgebung herunter. Die Haelfte
 * der Zielhoehe kommt deshalb aus dem Kontinentfeld: je tiefer im Land, desto
 * hoeher - so entstehen Hochebenen im Inneren und flache Kuesten, wie bei
 * hexmap. Eine erste Fassung nahm dafuer ein eigenes, zufaelliges Rauschen;
 * seit es Kontinente gibt, ist der Kern die ehrlichere Quelle.
 */
const BREIT_ANTEIL = 0.5;

/*
 * Meer oder See: hexmap legt nur das MEER auf Hoehe null, Seen liegen, wo ihr
 * Ufer liegt. Die Unterscheidung liefert inzwischen die Weltgenerierung selbst
 * (isSeaAt) - eine fruehere Fassung schaetzte sie aus dem Wasseranteil im
 * Umkreis, weil Land und Meer noch am selben Feld hingen.
 */

let zielSeed = Number.NaN;
const zielCache = new Map<string, number>();

/**
 * Die Hoehe, die ein Feld haette, gaebe es keine Steigungsgrenze. 0 bis 1.
 *
 * Land: halb Gelaende, halb Kontinentkern. Meer: 0. See: unendlich - ein See
 * zieht niemanden herunter, er liegt einfach, wo seine Ufer liegen.
 */
export function reliefTargetAt(seed: number, q: number, r: number): number {
  if (seed !== zielSeed) {
    zielCache.clear();
    zielSeed = seed;
  }
  const k = q + ':' + r;
  const da = zielCache.get(k);
  if (da !== undefined) return da;

  let v: number;
  if (terrainAt(seed, q, r) === 'water') {
    v = isSeaAt(seed, q, r) ? 0 : Number.POSITIVE_INFINITY;
  } else {
    // Wie tief im Kontinent: 0 an seiner Kueste, 1 im Kern.
    const kont = fieldsAt(seed, q, r).kontinent;
    const kern = Math.min(1, Math.max(0, (kont - SEA_LEVEL) / (1 - SEA_LEVEL)));
    v = Math.min(1, (1 - BREIT_ANTEIL) * reliefAt(seed, q, r) + BREIT_ANTEIL * kern);
  }
  if (zielCache.size >= GEDAECHTNIS_MAX) zielCache.clear();
  zielCache.set(k, v);
  return v;
}

/**
 * Relief mit begrenzter Steigung - so wie hexmap zeichnet.
 *
 * hexmap laesst keine Kachel mehr als 2 Kunstpixel hoeher oder tiefer stehen
 * als ihre Nachbarn. So kleine Stufen verdeckt die gemalte Unterkante der
 * Kachel selbst; einen Sockel darunter braucht es nicht. Dort erledigt das
 * eine Warteschlange ueber die ganze Karte (enforce_dy_limit), die so lange
 * nachbessert, bis nichts mehr ueber die Grenze geht.
 *
 * Es geht auch ohne Kartenrand. Gesucht ist die hoechste Flaeche, die nirgends
 * ueber dem rohen Relief liegt und von Feld zu Feld hoechstens um `slope`
 * springt. Die hat eine geschlossene Form:
 *
 *   begrenzt(h) = min ueber alle Felder c von  roh(c) + slope * abstand(h, c)
 *
 * (roh ist hier reliefTargetAt: Land mit Grundhebung, Meer 0, Seen ohne Einfluss.)
 *
 * Und sie ist LOKAL. roh ist nie negativ, also kann ein Feld im Abstand d den
 * Wert hoechstens auf slope * d druecken. Sobald slope * d das bisher Beste
 * erreicht, kann kein weiter entferntes Feld mehr etwas aendern, und die Suche
 * hoert auf. Das Ergebnis ist exakt dasselbe wie mit Blick auf die ganze Karte
 * (test/relief.test.ts prueft das gegen eine Suche mit grossem Umkreis).
 *
 * Eine Folge sieht man sofort: Land steigt von der Kueste nur langsam an. Ein
 * Berg direkt am Meer bleibt niedrig, ein Berg tief im Land wird hoch. Genau so
 * sehen hexmaps Karten aus.
 *
 * Unterschied zum Vorbild: hexmap hebt auch Mulden an, die zu tief unter ihren
 * Nachbarn liegen. Hier wird nur abgesenkt. Die Grenze gilt trotzdem in beide
 * Richtungen - ein Minimum von Flaechen, die alle hoechstens um slope springen,
 * springt selbst hoechstens um slope.
 */
let begrenztSeed = Number.NaN;
let begrenztSlope = Number.NaN;
const begrenztCache = new Map<string, number>();

export function reliefLimitedAt(seed: number, q: number, r: number, slope: number): number {
  if (!(slope > 0)) {
    const z = reliefTargetAt(seed, q, r);
    return Number.isFinite(z) ? z : 0;
  }
  if (seed !== begrenztSeed || slope !== begrenztSlope) {
    begrenztCache.clear();
    begrenztSeed = seed;
    begrenztSlope = slope;
  }
  const k = q + ':' + r;
  const da = begrenztCache.get(k);
  if (da !== undefined) return da;

  let best = reliefTargetAt(seed, q, r);
  const ecke = HEX_DIRS[4]!;
  // Ein See beginnt bei unendlich; weiter als 1/slope muss trotzdem niemand
  // suchen, denn jedes Ufer liegt hoechstens auf 1.
  const weitester = Math.ceil(1 / slope) + 1;
  for (let d = 1; d <= weitester && d * slope < best; d++) {
    // Ring im Abstand d: an einer Ecke beginnen, die sechs Seiten ablaufen.
    let x = q + ecke[0] * d;
    let y = r + ecke[1] * d;
    for (let seite = 0; seite < 6; seite++) {
      const [dq, dr] = HEX_DIRS[seite]!;
      for (let j = 0; j < d; j++) {
        const v = reliefTargetAt(seed, x, y) + slope * d;
        if (v < best) best = v;
        x += dq;
        y += dr;
      }
    }
  }

  if (!Number.isFinite(best)) best = 0;
  if (begrenztCache.size >= GEDAECHTNIS_MAX) begrenztCache.clear();
  begrenztCache.set(k, best);
  return best;
}
