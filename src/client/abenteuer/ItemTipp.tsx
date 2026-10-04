/**
 * Der Tooltip eines Gegenstands: Name, Art, Werte und Wirkung - im Stil des
 * Spiels. Gute Werte gruen, schlechte rot (Spieltest: "Wenn du ueber ein Item
 * hoverst, sollen Name und Effekt angezeigt werden").
 */

import { FAEHIGKEIT_NAME, SLOT_NAME, gegenstand } from '../../abenteuer/regeln';
import { lebenText } from '../../abenteuer/regeln';

export type StatZeile = { text: string; gut: boolean | null };

/** Die Werte eines Gegenstands als Zeilen - positiv gruen, negativ rot, sonst neutral. */
export function statZeilen(id: string): StatZeile[] {
  const g = gegenstand(id);
  if (!g) return [];
  const z: StatZeile[] = [];
  const zahl = (n: number | undefined, name: string) => {
    if (!n) return;
    z.push({ text: `${n > 0 ? '+' : ''}${n} ${name}`, gut: n > 0 });
  };
  zahl(g.angriff, 'Angriff');
  zahl(g.abwehr, 'Abwehr');
  zahl(g.leben, 'Leben');
  zahl(g.schritte, g.schritte === 1 ? 'Schritt je Wurf' : 'Schritte je Wurf');
  zahl(g.sicht, 'Sicht');
  if (g.krit && g.krit !== 2) z.push({ text: `Eine 6 macht ${g.krit} Schaden`, gut: g.krit > 2 });
  if (g.heilt) z.push({ text: `+${lebenText(g.heilt)} Leben`, gut: true });
  if (g.faehigkeit && g.ladung)
    z.push({
      text: `${FAEHIGKEIT_NAME[g.faehigkeit]} nach ${g.ladung} Ladungen`,
      gut: true,
    });
  return z;
}

export function artVon(id: string): string {
  const g = gegenstand(id);
  if (!g) return '';
  if (g.legendaer) return 'Legendaer';
  if (g.slot) return SLOT_NAME[g.slot];
  if (g.heilt) return 'Vorrat';
  return 'Gegenstand';
}

export type Tipp = { id: string; x: number; y: number } | null;

/** Das Fenster selbst - neben dem Zeiger, bleibt im Bild. */
export function ItemTipp({ tipp }: { tipp: Tipp }) {
  if (!tipp) return null;
  const g = gegenstand(tipp.id);
  if (!g) return null;
  const breite = 240;
  const links = Math.min(tipp.x + 16, window.innerWidth - breite - 8);
  const oben = Math.max(8, Math.min(tipp.y - 10, window.innerHeight - 180));
  // Nur der Beschreibungsteil, der nicht schon als Wert dasteht.
  const text = g.text.replace(/^Legendaer\.\s*/, '');
  return (
    <div className={g.legendaer ? 'ab-tipp legendaer' : 'ab-tipp'} style={{ left: links, top: oben, width: breite }} role="tooltip">
      <b>{g.name}</b>
      <small>{artVon(tipp.id)}</small>
      {statZeilen(tipp.id).map((z, i) => (
        <span key={i} className={z.gut === true ? 'gut' : z.gut === false ? 'schlecht' : ''}>
          {z.text}
        </span>
      ))}
      <p>{text}</p>
    </div>
  );
}

/** Handler fuer ein Element, das beim Darueberfahren (Maus) den Tooltip zeigt. */
export function tippHandler(id: string, setze: (t: Tipp) => void) {
  return {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') setze({ id, x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') setze({ id, x: e.clientX, y: e.clientY });
    },
    onPointerLeave: () => setze(null),
  };
}
