/**
 * Kleines Pixelsymbol fuer Tageszeit und Wetter - oben im Schild neben dem
 * Raumcode. Sonne, Mond, Wolke, Regen, Blitz, Schnee, Nebel aus Zeichenkarten
 * wie die Figuren. PLATZHALTER (ASSETS.md).
 */

import type { ReactElement } from 'react';
import type { Tageszeit, Wetter } from '../../core/zeit';

const FARBE: Record<string, string> = {
  y: '#f2c94c',
  o: '#f08a24',
  w: '#e8ecf2',
  g: '#a9b1bd',
  G: '#6d7785',
  b: '#6fa8dc',
};

const SONNE = ['....y....', '.y.....y.', '...yyy...', '..yyyyy..', 'y.yyoyy.y', '..yyyyy..', '...yyy...', '.y.....y.', '....y....'];
const MOND = ['..www..', '.ww....', 'ww.....', 'ww.....', 'ww.....', 'ww.....', '.ww....', '..www..'];
const WOLKE = ['....wwww....', '..wwwwwwww..', '.wwwwwwwwww.', 'wwwwwwwwwwww', 'wwwwwwwwwwww', '.wwwwwwwwww.'];
const BLITZ = ['..y.', '.yy.', 'yyyy', '.yy.', '.y..', 'y...'];
const TROPFEN = ['b...b...', 'b...b..b', '..b....b', '..b.....'];
const FLOCKEN = ['w....w..', '...w...w', '.w......', '....w...'];
const NEBEL = ['.wwwwwwww...', '............', '...wwwwwwwww', '............', 'wwwwwwww....', '............', '..wwwwwwwww.'];

function teile(karte: readonly string[], dx: number, dy: number, statt?: string) {
  const out: ReactElement[] = [];
  karte.forEach((zeile, y) => {
    [...zeile].forEach((ch, x) => {
      if (ch === '.') return;
      const farbe = ch === 'w' && statt ? statt : FARBE[ch]!;
      out.push(<rect key={`${dx}:${dy}:${x}:${y}`} x={dx + x} y={dy + y} width={1} height={1} fill={farbe} />);
    });
  });
  return out;
}

export function WetterSymbol({ tageszeit, wetter }: { tageszeit: Tageszeit; wetter: Wetter }) {
  const nacht = tageszeit === 'nacht';
  const himmel = nacht ? teile(MOND, 3, 1) : teile(SONNE, 2, 1);
  let inhalt: ReactElement[];
  switch (wetter) {
    case 'klar':
      inhalt = nacht ? [...teile(MOND, 4, 2), ...teile(['w'], 11, 3)] : teile(SONNE, 2, 2);
      break;
    case 'wolkig':
      inhalt = [...(nacht ? teile(MOND, 7, 0) : teile(SONNE, 5, 0)), ...teile(WOLKE, 0, 6)];
      break;
    case 'regen':
      inhalt = [...teile(WOLKE, 1, 1, FARBE.g), ...teile(TROPFEN, 3, 8)];
      break;
    case 'gewitter':
      inhalt = [...teile(WOLKE, 1, 1, FARBE.G), ...teile(BLITZ, 5, 7)];
      break;
    case 'schnee':
      inhalt = [...teile(WOLKE, 1, 1, FARBE.g), ...teile(FLOCKEN, 3, 8)];
      break;
    case 'nebel':
      inhalt = teile(NEBEL, 1, 3, FARBE.g);
      break;
    default:
      inhalt = himmel;
  }
  return (
    <svg viewBox="0 0 14 14" width={18} height={18} shapeRendering="crispEdges" aria-hidden="true">
      {inhalt}
    </svg>
  );
}
