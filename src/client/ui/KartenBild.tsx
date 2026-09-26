/**
 * Das Bild einer Spielkarte.
 *
 * Bisher waren Karten nur Text im Rahmen ihrer Seltenheit. Jetzt traegt jede
 * ein Bild, zusammengesetzt aus ihrer Wirkung - so passt es zu jeder Karte,
 * auch zu kuenftigen, ohne dass jemand ein Motiv zeichnen muss:
 *
 *   Gelaendebonus   die Kachel dieses Gelaendes, mit +1 oder -1 daran
 *   Rohstoffe       ihre Sinnbilder mit Anzahl
 *   beliebige       ein Sack mit Anzahl
 *   Bankhandel      eine Waage
 *   Handkarten      eine Truhe
 *
 * Die Kacheln sind echte Pixelgrafik aus dem Spiel, Sack, Waage und Truhe
 * kleine Pixelkarten im selben Raster. PLATZHALTER (ASSETS.md): gezeichnete
 * Motive je Karte ersetzen das.
 */

import type { ReactElement } from 'react';
import { dauerwirkungen, taktikwirkungen } from '../../core/cards/types';
import type { Card } from '../../core/cards/types';
import { RESOURCES } from '../../core/types';
import { kachelFuer } from '../tiles';
import { ResourceGlyph } from './ResourceIcon';

const FARBEN: Record<string, string> = {
  k: '#2a1f16',
  b: '#8a5a2b',
  B: '#6b4420',
  g: '#d9a441',
  y: '#f2c94c',
  m: '#b9b3a6',
  M: '#857e70',
};

const SACK = [
  '...kkkk...',
  '....kk....',
  '...kbbk...',
  '..kbbbbk..',
  '.kbbybbbk.',
  'kbbyyybbbk',
  'kbbbybbbbk',
  'kBbbbbbbBk',
  '.kBBBBBBk.',
  '..kkkkkk..',
];

const WAAGE = [
  '.....kk.....',
  'kkkkkyykkkkk',
  '.k...yy...k.',
  '.k...yy...k.',
  'kyk..yy..kyk',
  'yyyy.yy.yyyy',
  '.kk..yy..kk.',
  '.....yy.....',
  '...kkyykk...',
  '..kggggggk..',
];

const TRUHE = [
  '..kkkkkkkk..',
  '.kbbbbbbbbk.',
  'kbbbbbbbbbbk',
  'kkkkkggkkkkk',
  'kBBBBgyBBBBk',
  'kbbbbggbbbbk',
  'kBBBBBBBBBBk',
  'kbbbbbbbbbbk',
  'kkkkkkkkkkkk',
];

function Pixel({ karte, px }: { karte: readonly string[]; px: number }) {
  const breite = karte[0]!.length;
  const rects: ReactElement[] = [];
  karte.forEach((zeile, y) => {
    for (let x = 0; x < zeile.length; x++) {
      const c = zeile[x]!;
      if (c === '.') continue;
      rects.push(<rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill={FARBEN[c]} />);
    }
  });
  return (
    <svg width={breite * px} height={karte.length * px} viewBox={`0 0 ${breite} ${karte.length}`} shapeRendering="crispEdges">
      {rects}
    </svg>
  );
}

const zahl = (n: number) => (n > 0 ? `+${n}` : String(n));

export function KartenBild({ karte, klein = false }: { karte: Card; klein?: boolean }) {
  const px = klein ? 1 : 2;
  const teile: ReactElement[] = [];
  const wirkungen = dauerwirkungen(karte);
  const taktiken = taktikwirkungen(karte);

  if (taktiken.length > 0) {
    const heilung = taktiken.some((t) => t.t === 'healUnit' || t.t === 'healField');
    const schutz = taktiken.some((t) => t.t === 'cover' || t.t === 'morale');
    const fern = taktiken.some((t) => t.t === 'rangedAttack');
    teile.push(
      <span key="kampf" className="karten-teil">
        <svg viewBox="0 0 48 48" width={24 * px} height={24 * px} shapeRendering="crispEdges">
          {heilung ? (
            <path d="M8 18h10V8h12v10h10v12H30v10H18V30H8z" fill="#b23a32" stroke="#2a1f16" strokeWidth="3" />
          ) : schutz ? (
            <path d="M24 5l15 6v12c0 10-6 16-15 20C15 39 9 33 9 23V11z" fill="#b9b3a6" stroke="#2a1f16" strokeWidth="3" />
          ) : fern ? (
            <><path d="M11 7q25 17 0 34" fill="none" stroke="#c9a46a" strokeWidth="5"/><path d="M10 7v34M6 24h34m-8-7 8 7-8 7" fill="none" stroke="#eee0bd" strokeWidth="2"/></>
          ) : (
            <><path d="M10 39L36 8m-5 1 6-2-2 6M38 39L12 8m5 1-6-2 2 6" fill="none" stroke="#c9ccd6" strokeWidth="5"/><path d="M7 36h12M29 36h12" stroke="#8a5a2b" strokeWidth="5"/></>
          )}
        </svg>
      </span>,
    );
  }

  wirkungen.forEach((l, i) => {
    if (l.t !== 'terrainBonus') return;
    const url = kachelFuer(l.terrain, i);
    if (!url) return;
    teile.push(
      <span key={`g${i}`} className={l.amount < 0 ? 'karten-teil karg' : 'karten-teil'}>
        <img src={url} width={26 * px} height={32 * px} alt="" />
        <b>{zahl(l.amount)}</b>
      </span>,
    );
  });
  if (wirkungen.some((l) => l.t === 'tradeDiscount')) {
    teile.push(
      <span key="w" className="karten-teil">
        <Pixel karte={WAAGE} px={px * 2} />
      </span>,
    );
  }
  if (wirkungen.some((l) => l.t === 'handLimit')) {
    teile.push(
      <span key="t" className="karten-teil">
        <Pixel karte={TRUHE} px={px * 2} />
      </span>,
    );
  }
  // Die neueren Wirkungen als kleine Marken: Zahl und Zeichen, keine Bilder.
  const QUELLE: Record<string, string> = { stadt: 'Staedte', lager: 'Lager', ruine: 'Ruinen', auftrag: 'Auftraege', strasse: 'Strassen' };
  wirkungen.forEach((l, i) => {
    let marke: string | null = null;
    if (l.t === 'siegpunkte') marke = `★ je ${l.pro} ${QUELLE[l.je]}`;
    else if (l.t === 'alsZahl') marke = `${l.von} → ${l.zu}`;
    else if (l.t === 'doppelZahl') marke = `${l.zahlen.join(' · ')} x2`;
    else if (l.t === 'siebenGabe') marke = `7: +${l.anzahl}`;
    else if (l.t === 'schutz') marke = `Schild −${l.amount}`;
    if (marke === null) return;
    // Zwei gleiche Regelmarken (2 → 12, 12 → 2) als eine lesen lassen.
    if (l.t === 'alsZahl' && wirkungen.some((x, j) => j < i && x.t === 'alsZahl' && x.von === l.zu && x.zu === l.von)) return;
    teile.push(
      <span key={`m${i}`} className="karten-teil karten-marke">
        <b>{l.t === 'alsZahl' && wirkungen.some((x) => x.t === 'alsZahl' && x.von === l.zu && x.zu === l.von) ? `${l.von} ↔ ${l.zu}` : marke}</b>
      </span>,
    );
  });
  const sofort = karte.instant;
  if (sofort?.t === 'gain') {
    teile.push(
      <span key="r" className="karten-rohstoffe">
        {RESOURCES.filter((r) => (sofort.resources[r] ?? 0) > 0).map((r) => (
          <span key={r} className="karten-teil">
            <svg viewBox="0 0 24 24" width={12 * px} height={12 * px}>
              <ResourceGlyph r={r} />
            </svg>
            <b>{sofort.resources[r]}</b>
          </span>
        ))}
      </span>,
    );
  } else if (sofort?.t === 'gainAny') {
    teile.push(
      <span key="s" className="karten-teil">
        <Pixel karte={SACK} px={px * 2} />
        <b>{sofort.count}</b>
      </span>,
    );
  }

  return (
    <span className={`karten-bild bild-${karte.rarity}${klein ? ' klein' : ''}`} aria-hidden="true">
      {teile}
    </span>
  );
}
