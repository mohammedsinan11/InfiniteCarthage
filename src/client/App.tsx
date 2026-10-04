import { useEffect, useState } from 'react';
import { useStore } from './net/store';
import { Home } from './scenes/Home';
import { Lobby } from './scenes/Lobby';
import { Game } from './scenes/Game';
import { Erklaerung } from './ui/Erklaerung';
import { ModusWahl, leseModus, merkeModus } from './scenes/ModusWahl';
import type { Modus } from './scenes/ModusWahl';
import { Abenteuer } from './abenteuer/Abenteuer';

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const dismissError = useStore((s) => s.dismissError);
  const state = useStore((s) => s.state);
  const resume = useStore((s) => s.resume);
  const room = useStore((s) => s.room);
  const wieder = status === 'reconnecting';
  // Abenteuer oder Strategie (scenes/ModusWahl.tsx) - eine laufende Partie geht immer vor.
  const [modus, setModus] = useState<Modus | null>(() => leseModus());
  const waehle = (m: Modus | null) => {
    merkeModus(m);
    setModus(m);
  };

  // Beim Laden pruefen, ob dieser Tab noch einen Platz in einer Partie hat.
  useEffect(() => {
    resume();
  }, [resume]);

  return (
    <>
      {(status === 'playing' || wieder) && state ? (
        <Game />
      ) : status === 'lobby' || (wieder && room) ? (
        <Lobby />
      ) : modus === 'abenteuer' ? (
        <Abenteuer onZurueck={() => waehle(null)} />
      ) : modus === 'strategie' ? (
        <>
          <Home />
          <button className="klein modus-zurueck" onClick={() => waehle(null)} title="Zur Wahl des Modus">
            ‹ Modus
          </button>
        </>
      ) : (
        <ModusWahl onWahl={waehle} />
      )}
      <Erklaerung />
      {wieder && (
        <div className="wieder-banner" role="status">
          Verbindung unterbrochen - wird wiederhergestellt...
        </div>
      )}
      {error !== null && (
        <div className="toast" role="alert" onClick={dismissError}>
          {error}
          <span className="toast-close">schliessen</span>
        </div>
      )}
    </>
  );
}
