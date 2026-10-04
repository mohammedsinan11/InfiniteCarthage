/**
 * Tippen statt Darueberfahren: auf Touch-Geraeten zeigt ein Tipp auf ein
 * Schild mit Erklaerung (title) diese Erklaerung als kleine Blase.
 *
 * Handy-Spieltest: Wetter, Siegpunkte der Rivalen, Handgrenze, Akt - alles
 * stand nur im title, den es ohne Maus nicht gibt. Knoepfe zeigen nichts:
 * sie tun beim Tippen ohnehin etwas.
 */

import { useEffect, useState } from 'react';

export function Erklaerung() {
  const [blase, setBlase] = useState<{ text: string; x: number; y: number; n: number } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
    const tipp = (e: MouseEvent) => {
      const ziel = e.target instanceof Element ? e.target : null;
      if (!ziel || ziel.closest('button, a, input, select, textarea, label, .board-svg')) return;
      const el = ziel.closest('[title]');
      const text = el?.getAttribute('title');
      if (!el || !text) return;
      const r = el.getBoundingClientRect();
      setBlase((alt) => ({ text, x: r.left + r.width / 2, y: r.bottom + 6, n: (alt?.n ?? 0) + 1 }));
    };
    document.addEventListener('click', tipp, true);
    return () => document.removeEventListener('click', tipp, true);
  }, []);
  useEffect(() => {
    if (!blase) return;
    const t = window.setTimeout(() => setBlase(null), 4000);
    return () => window.clearTimeout(t);
  }, [blase]);
  if (!blase) return null;
  const links = Math.max(8, Math.min(blase.x - 130, window.innerWidth - 268));
  return (
    <div className="erklaerung" style={{ left: links, top: blase.y }} onClick={() => setBlase(null)} role="status">
      {blase.text}
    </div>
  );
}
