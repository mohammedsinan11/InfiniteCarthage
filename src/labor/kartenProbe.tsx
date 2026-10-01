/**
 * Kartenprobe - nur im Entwicklungsserver (probe-karten.html), nicht im Spiel.
 *
 * Zeigt alle Karten des Katalogs mit dem neuen Rahmen (ui/Spielkarte.tsx),
 * dazu Beispiele fuer die kuenftigen Engine- und Schluesselkarten aus
 * ENGINE_KARTEN.md - als Daten, die der Kern noch nicht kennt. So sieht man,
 * dass Ausloeser, Zaehler und Kronen schon ein Bild bekommen.
 *
 *   /probe-karten.html                  alles: Katalog, Engine, Menue
 *   /probe-karten.html?ansicht=wahl     nur eine Kartenwahl, wie im Spiel
 *   /probe-karten.html?ansicht=engine   nur die Beispiele fuer neue Karten
 *   /probe-karten.html?ansicht=menue    nur das Raster im Menue
 */

import { createRoot } from 'react-dom/client';
import '../client/styles.css';
import { CARDS } from '../core/cards/catalog';
import type { Card } from '../core/cards/types';
import { CardDraft } from '../client/ui/CardDraft';
import { Spielkarte } from '../client/ui/Spielkarte';

/** Beispielkarten aus ENGINE_KARTEN.md - Wirkungen, die der Kern noch nicht auswertet. */
const NEU = [
  {
    id: 'saatgut', name: 'Saatgut', rarity: 'ungewoehnlich', sippe: 'ernte',
    text: 'Faellt eine 6 oder 8: +1 Zaehler. Felder liefern +1 je 5.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'wurf', zahlen: [6, 8] }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 5, max: 3, dann: { t: 'terrainBonus', terrain: 'field', amount: 1 } },
    ],
    zaehler: 7,
  },
  {
    id: 'wegezoll', name: 'Wegezoll', rarity: 'ungewoehnlich', sippe: 'bau',
    text: 'Jede neue Strasse: +1 Zaehler. Jeder eigene Wurf: 1 Holz je 4.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'strasse' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'wurf', wer: 'ich' }, dann: { t: 'gainJe', je: { aus: 'zaehler' }, pro: 4, max: 3, resource: 'lumber' } },
    ],
    zaehler: 12,
  },
  {
    id: 'kriegskasse', name: 'Kriegskasse', rarity: 'gewoehnlich', sippe: 'krieg',
    text: 'Jedes zerstoerte Lager: 3 zufaellige Rohstoffe.',
    lasting: { t: 'wenn', anlass: { bei: 'lager' }, dann: { t: 'gainAny', count: 3 } },
  },
  {
    id: 'kontor', name: 'Kontor', rarity: 'ungewoehnlich', sippe: 'handel',
    text: 'Jeder Handel: 1 Ruhm, hoechstens einmal je Zug.',
    lasting: { t: 'wenn', anlass: { bei: 'handel' }, dann: { t: 'ruhm', amount: 1 }, jeZug: 1 },
  },
  {
    id: 'seidenstrasse', name: 'Seidenstrasse', rarity: 'selten', sippe: 'handel',
    text: 'Jede Karawane: +1 Zaehler. Je 3: 1 Siegpunkt.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'karawane' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 3, max: 5, dann: { t: 'punkte', amount: 1 } },
    ],
  },
  {
    id: 'fernweh', name: 'Fernweh', rarity: 'selten', sippe: 'wildnis',
    text: 'Jeder erfuellte Auftrag bringt eine Kartenwahl.',
    lasting: { t: 'wenn', anlass: { bei: 'auftrag' }, dann: { t: 'wahl', anzahl: 1 } },
  },
  {
    id: 'pflugschar', name: 'Pflugschar', rarity: 'selten', sippe: 'ernte',
    text: 'Felder liefern +1 je aktive Ernte-Karte.',
    lasting: { t: 'je', groesse: { aus: 'aktiv', sippe: 'ernte' }, pro: 1, max: 3, dann: { t: 'terrainBonus', terrain: 'field', amount: 1 } },
  },
  {
    id: 'doppeljoch', name: 'Doppeljoch', rarity: 'selten', sippe: 'ernte',
    text: 'Bei 2 und 12 liefern alle deine Felder dreifach.',
    lasting: { t: 'ertragMal', faktor: 3, zahlen: [2, 12] },
  },
  {
    id: 'steinmetz', name: 'Steinmetz', rarity: 'ungewoehnlich', sippe: 'bau',
    text: 'Beim Stadtbau zaehlt Erz als Getreide.',
    lasting: { t: 'ersatz', von: 'ore', fuer: 'grain', bei: 'stadt' },
  },
  {
    id: 'sagenschreiber', name: 'Sagenschreiber', rarity: 'episch', sippe: 'wildnis',
    text: 'Jeder Auftrag, jede Ruine, jedes Lager: +1 Zaehler. Je 4: 1 Siegpunkt.',
    lasting: [
      { t: 'wenn', anlass: { bei: 'auftrag' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'wenn', anlass: { bei: 'ruine' }, dann: { t: 'zaehler', amount: 1 } },
      { t: 'je', groesse: { aus: 'zaehler' }, pro: 4, max: 5, dann: { t: 'punkte', amount: 1 } },
    ],
    zaehler: 9,
  },
  {
    id: 'fuellhorn', name: 'Fuellhorn', rarity: 'legendaer', sippe: 'ernte', schluessel: true,
    text: 'Alle deine Ertraege doppelt. Die Bank handelt nicht mit dir.',
    lasting: [{ t: 'ertragMal', faktor: 2 }, { t: 'sperre', was: 'bank' }],
  },
  {
    id: 'metropole', name: 'Metropole', rarity: 'legendaer', sippe: 'bau', schluessel: true,
    text: 'Staedte liefern 3, Doerfer nichts.',
    lasting: { t: 'grundErtrag', dorf: 0, stadt: 3 },
  },
  {
    id: 'raubritter', name: 'Raubritter', rarity: 'legendaer', sippe: 'krieg', schluessel: true,
    text: 'Pluenderer geben dir, was sie dir nehmen wuerden. Du baust keine Palisaden.',
    lasting: [{ t: 'beuteStattVerlust' }, { t: 'sperre', was: 'mauer' }],
  },
  {
    id: 'karawanserei', name: 'Karawanserei', rarity: 'legendaer', sippe: 'handel', schluessel: true,
    text: 'Alle deine Wenn-Karten loesen doppelt aus. Keine Kartenwahl beim Stadtbau.',
    lasting: [{ t: 'nachhall' }, { t: 'sperre', was: 'gruendungswahl' }],
  },
  {
    id: 'weltenbaum', name: 'Weltenbaum', rarity: 'legendaer', sippe: 'wildnis', schluessel: true,
    text: 'Jeder Jahreszeitwechsel loest alle deine Wenn-Karten aus.',
    lasting: { t: 'ausloeserJahr' },
  },
  {
    id: 'wanderstab', name: 'Wanderstab', rarity: 'selten', sippe: 'wildnis', kind: 'ausruestung',
    text: 'Der Held zieht ein Feld weiter. Jede Ruine: der Held heilt 1.',
    lasting: { t: 'wenn', anlass: { bei: 'ruine' }, dann: { t: 'heilen', amount: 1 } },
  },
] as unknown as (Card & { zaehler?: number })[];

const ansicht = new URLSearchParams(location.search).get('ansicht');

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '10px 16px 18px' }}>
      <h2 style={{ fontFamily: 'var(--pixel)', fontSize: 14, color: 'var(--accent)', margin: '0 0 10px' }}>{titel}</h2>
      {children}
    </section>
  );
}

const reihe: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' };

function Raster({ breite, karten }: { breite: number; karten: readonly Card[] }) {
  return (
    <div className="menu" style={{ position: 'static', width: breite, padding: 8, display: 'block' }}>
      <ul className="menu-kartenraster">
        {karten.map((k, i) => (
          <li key={k.id}>
            <button className={`menu-karte-kachel sk-kachel selt-${k.rarity}${i === 2 ? ' inaktiv' : ''}${i === 1 ? ' aktiv' : ''}`} title={k.text}>
              <Spielkarte karte={k} groesse="mini" />
              {i === 0 && <span className="menu-karte-status">Aktiv</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Seite() {
  if (ansicht === 'wahl') {
    const ids = (new URLSearchParams(location.search).get('karten') ?? 'goldene_ernte,belagerungsplan,handelsflotte').split(',');
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <CardDraft
          options={ids}
          source="fund"
          darfWaehlen
          besitz={['holzlager', 'markttag']}
          aktiv={['holzlager', 'markttag']}
          plaetze={2}
          sippe={{ ernte: 1, handel: 3, bau: 2 }}
          onChoose={() => {}}
        />
      </div>
    );
  }
  const neu = (
    <Abschnitt titel="Neu: Engine- und Schluesselkarten (ENGINE_KARTEN.md)">
      <div style={reihe}>
        {NEU.map((k) => (
          <Spielkarte key={k.id} karte={k} zaehler={k.zaehler} />
        ))}
      </div>
    </Abschnitt>
  );
  if (ansicht === 'engine') return neu;
  const menue = (
    <Abschnitt titel="Menue: Raster bei 240 und 168 Pixel Breite">
      <div style={reihe}>
        <Raster breite={240} karten={[...CARDS.slice(8, 20), ...NEU.slice(0, 3), NEU[10]!, NEU[15]!, CARDS[46]!]} />
        <Raster breite={168} karten={[...CARDS.slice(28, 37), ...NEU.slice(10, 13)]} />
      </div>
    </Abschnitt>
  );
  if (ansicht === 'menue') return menue;
  return (
    <>
      {neu}
      <Abschnitt titel={`Katalog · ${CARDS.length} Karten`}>
        <div style={reihe}>
          {CARDS.map((k) => (
            <Spielkarte key={k.id} karte={k} />
          ))}
        </div>
      </Abschnitt>
      {menue}
    </>
  );
}

createRoot(document.getElementById('probe')!).render(<Seite />);
