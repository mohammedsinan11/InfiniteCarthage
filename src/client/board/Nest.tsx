/**
 * Ein Raeubernest auf der Karte.
 *
 * PLATZHALTER. Gezeichnet, nicht gemalt - eine Palisade aus drei Pfaehlen mit
 * Wimpel, aus Polygonen zusammengesetzt. Es liest sich auf einen Blick als
 * "hier wohnt jemand, der nichts Gutes will", und mehr soll es vorerst nicht.
 * Sobald jemand die Kachel wirklich zeichnet, faellt diese Datei weg; sie
 * steht so auch in ASSETS.md.
 *
 * Die Groesse haengt am Hex, nicht an festen Pixeln, damit der Marker jede
 * Zoomstufe mitgeht.
 */

export function Nest({ x, y, size }: { x: number; y: number; size: number }) {
  const s = size;
  return (
    <g className="nest" pointerEvents="none" transform={`translate(${x} ${y})`}>
      {/* Schattenfleck, damit der Marker auf hellem Gelaende nicht verschwindet */}
      <ellipse cx={0} cy={s * 0.36} rx={s * 0.62} ry={s * 0.2} className="nest-schatten" />

      {/* Drei Pfaehle, der mittlere hoeher */}
      <polygon points={`${-s * 0.5},${s * 0.34} ${-s * 0.26},${s * 0.34} ${-s * 0.38},${-s * 0.16}`} className="nest-pfahl" />
      <polygon points={`${s * 0.26},${s * 0.34} ${s * 0.5},${s * 0.34} ${s * 0.38},${-s * 0.16}`} className="nest-pfahl" />
      <polygon points={`${-s * 0.14},${s * 0.36} ${s * 0.14},${s * 0.36} ${0},${-s * 0.52}`} className="nest-pfahl hoch" />

      {/* Wimpel am mittleren Pfahl */}
      <polygon points={`${s * 0.04},${-s * 0.46} ${s * 0.44},${-s * 0.34} ${s * 0.04},${-s * 0.22}`} className="nest-wimpel" />
    </g>
  );
}
