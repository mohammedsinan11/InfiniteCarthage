/**
 * Diagnose fuer den Geraetetest: ?diagnose=1 an die Adresse haengen.
 *
 * Von hier aus laesst sich kein echtes Telefon bedienen. Damit ein Test auf dem
 * eigenen Geraet trotzdem etwas Belastbares ergibt, zeigt diese Tafel, was man
 * sonst nicht sieht: Bilder je Sekunde, ob WebGL laeuft und auf welchem Chip,
 * die Bildschirmskalierung, wie viele Finger gerade auf dem Brett liegen und
 * was die letzte Zwei-Finger-Geste ausgeloest hat. Ein Screenshot davon genuegt.
 */

import { useEffect, useState } from 'react';

export function diagnoseAn(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('diagnose') === '1';
  } catch {
    return false;
  }
}

function webglInfo(): string {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl');
    if (!gl) return 'kein WebGL - Wetter aus';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const chip = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    return `WebGL: ${chip}`;
  } catch {
    return 'WebGL: Fehler';
  }
}

export function Diagnose() {
  const [fps, setFps] = useState(0);
  const [finger, setFinger] = useState(0);
  const [geste, setGeste] = useState('noch keine');
  const [gl] = useState(webglInfo);

  useEffect(() => {
    let id = 0;
    let bilder = 0;
    let seit = performance.now();
    const schritt = (jetzt: number) => {
      bilder += 1;
      if (jetzt - seit >= 1000) {
        setFps(Math.round((bilder * 1000) / (jetzt - seit)));
        bilder = 0;
        seit = jetzt;
      }
      id = requestAnimationFrame(schritt);
    };
    id = requestAnimationFrame(schritt);

    const aktiv = new Map<number, { x: number; y: number }>();
    let start = 0;
    const runter = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      aktiv.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setFinger(aktiv.size);
      if (aktiv.size === 2) {
        const [a, b] = [...aktiv.values()];
        start = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const bewegt = (e: PointerEvent) => {
      if (!aktiv.has(e.pointerId)) return;
      aktiv.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (aktiv.size === 2 && start > 0) {
        const [a, b] = [...aktiv.values()];
        const f = Math.hypot(a!.x - b!.x, a!.y - b!.y) / start;
        setGeste(`Kneifen x${f.toFixed(2)}`);
      }
    };
    const hoch = (e: PointerEvent) => {
      aktiv.delete(e.pointerId);
      setFinger(aktiv.size);
    };
    const safari = (e: Event) => {
      const g = e as Event & { scale?: number };
      if (typeof g.scale === 'number') setGeste(`Safari-Geste x${g.scale.toFixed(2)}`);
    };
    window.addEventListener('pointerdown', runter, true);
    window.addEventListener('pointermove', bewegt, true);
    window.addEventListener('pointerup', hoch, true);
    window.addEventListener('pointercancel', hoch, true);
    window.addEventListener('gesturechange', safari, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('pointerdown', runter, true);
      window.removeEventListener('pointermove', bewegt, true);
      window.removeEventListener('pointerup', hoch, true);
      window.removeEventListener('pointercancel', hoch, true);
      window.removeEventListener('gesturechange', safari, true);
    };
  }, []);

  return (
    <div className="diagnose" aria-live="polite">
      <b>Diagnose</b>
      <span>{fps} Bilder/s</span>
      <span>{gl}</span>
      <span>
        {window.innerWidth} x {window.innerHeight} CSS-Pixel, Skalierung {window.devicePixelRatio}
      </span>
      <span>
        Finger: {finger} · {geste}
      </span>
    </div>
  );
}
