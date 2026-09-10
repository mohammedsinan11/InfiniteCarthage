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

import { neighbors } from './coords';
import { SEA_LEVEL, fieldsAt, terrainAt } from './worldgen';

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
  if (terrainAt(seed, q, r) === 'water') return 0;
  const h = geglaetteteHoehe(seed, q, r);
  const ueber = (h - SEA_LEVEL) / (1 - SEA_LEVEL);
  if (ueber <= 0) return 0;
  return Math.min(1, ueber) ** GAMMA;
}
