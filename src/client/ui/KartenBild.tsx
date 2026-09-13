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
import { dauerwirkungen } from '../../core/cards/types';
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
