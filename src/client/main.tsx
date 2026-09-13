import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installiereTonFreigabe, nachFreigabe } from './audio';
import { musikFreigeben } from './music';
import { ambienteFreigeben } from './ambiente';
import './styles.css';

// Ton freigeben, sobald jemand irgendwo klickt - und dann die Musik starten.
installiereTonFreigabe();
nachFreigabe(musikFreigeben);
nachFreigabe(ambienteFreigeben);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
