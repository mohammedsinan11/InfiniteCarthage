import { useEffect } from 'react';
import { useStore } from './net/store';
import { Home } from './scenes/Home';
import { Lobby } from './scenes/Lobby';
import { Game } from './scenes/Game';

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const dismissError = useStore((s) => s.dismissError);
  const state = useStore((s) => s.state);
  const resume = useStore((s) => s.resume);

  // Beim Laden pruefen, ob dieser Tab noch einen Platz in einer Partie hat.
  useEffect(() => {
    resume();
  }, [resume]);

  return (
    <>
      {status === 'playing' && state ? <Game /> : status === 'lobby' ? <Lobby /> : <Home />}
      {error !== null && (
        <div className="toast" role="alert" onClick={dismissError}>
          {error}
          <span className="toast-close">schliessen</span>
        </div>
      )}
    </>
  );
}
