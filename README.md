# InfiniteCarthage

Catan-Klon fuer den Browser auf einer Karte **ohne Rand**, mit Pixel-Art-
Gelaende. Das Brett besteht nicht aus 19 festen Feldern, sondern waechst
weiter, sobald jemand nach aussen baut. Allein spielbar oder zu mehreren
ueber einen Raumcode.

Hervorgegangen aus [InfiniteCatan](https://github.com/mohammedsinan11/InfiniteCatan);
die Regel-Engine ist dieselbe, dazugekommen sind Kachelgrafik, Klimazonen,
Einzelspieler und ein Sandkasten ohne Siegbedingung.

## Loslegen

```bash
npm install
npm run dev:worker   # Spielserver auf :8787
npm run dev          # Oberflaeche auf :5173
```

Dann einen Raum eroeffnen und **Allein starten** - oder den angezeigten Code
weitergeben und zu mehreren spielen.

| Befehl | Wirkung |
| --- | --- |
| `npm run dev` | Vite-Entwicklungsserver |
| `npm run dev:worker` | Cloudflare Worker lokal (wrangler) |
| `npm test` | Testsuite (90 Tests, ohne Browser und ohne Worker) |
| `npm run test:e2e` | End-to-End gegen einen laufenden Worker (lokal, oder mit `CATAN_SERVER=<url>` gegen den veroeffentlichten) |
| `npm run typecheck` | TypeScript fuer Client und Worker |
| `npm run build` | Typecheck plus Produktionsbuild nach `dist/` |
| `npm run deploy:worker` | Worker zu Cloudflare hochladen |

## Wie die unendliche Karte funktioniert

Drei Bausteine, alle in `src/core`:

**Kanonische Koordinaten** (`coords.ts`). Hexes liegen in axialen Koordinaten.
Eine Ecke gehoert zu drei Feldern, eine Kante zu zweien - ohne eindeutige ID
landete dieselbe Siedlung unter drei Schluesseln. Deshalb gilt: jede Ecke ist
die Nord- oder Sued-Spitze *genau eines* Hexes, jede Kante eine der drei
eigenen Kanten *genau eines* Hexes.

**Chunks zu je sieben Feldern** (`chunks.ts`, `worldgen.ts`). Ein Feld plus
seine sechs Nachbarn kacheln die Ebene lueckenlos. `generateChunk(seed, m, n)`
ist rein - das Ergebnis haengt nur von Seed und Koordinate ab, nie von der
Reihenfolge der Erzeugung. Jeder Chunk fuehrt garantiert alle fuenf
Rohstoffgelaende, damit niemand in einer Ein-Rohstoff-Oednis landet.

**Die Wachstumsinvariante** (`world.ts`). Um jedes Bauteil ist das Gelaende
mindestens drei Felder weit erzeugt. Daraus folgt alles Weitere von selbst:
eine Ecke ist nur bebaubar, wenn ihre drei Nachbarfelder existieren, und das
ist durch den Puffer immer erfuellt. Wer nach aussen baut, schiebt die Welt vor
sich her. Es gibt deshalb nirgends einen Sonderfall fuer "Kartenrand", weil der
Rand nie erreichbar ist.

### Was das an den Regeln aendert

| Thema | Umsetzung |
| --- | --- |
| Rote Zahlen | Zwei benachbarte 6er oder 8er sind ausgeschlossen - garantiert, nicht nur meistens. Der Preis: ihr Anteil sinkt von 22 % auf rund 13 %, weil das Verfahren lokale Maxima einer Siebener-Nachbarschaft waehlt. Das kostet etwa 6 % Ertrag. |
| Haefen | Haengen an Wasserfeldern mitten im Land. Eine unendliche Karte hat keine Kueste. |
| Raeuber | Genau einer, Start auf der Wueste im Ursprungschunk. |
| Bank | Bleibt endlich (19 je Rohstoff) - auf unbegrenzter Flaeche die einzige verbleibende Knappheit. |
| Entwicklungskarten | Paecke zu 25 Karten in klassischer Verteilung. Ist eines leer, wird das naechste gemischt, statt dass das Spiel karten los endet. |

## Grafik

Das Gelaende besteht aus 48 Pixel-Art-Kacheln aus
[hexmap von Astropulse](https://github.com/Astropulse/hexmap) (MIT). Herkunft
und Lizenzpflichten stehen in [THIRD_PARTY.md](THIRD_PARTY.md) - dort auch,
warum der Generator jenes Projekts bewusst NICHT uebernommen wurde.

Zwei Dinge, die dabei leicht schiefgehen:

- Das Bild ist 26 x 32 Pixel, das Sechseck darin aber nur **24 x 25** und
  sitzt bei x 1..24, y 7..31. Die freien Zeilen oben tragen Aufbauten, die
  ueber das Feld hinausragen. Wer Bild und Sechseck gleichsetzt, bekommt
  schwarze Fugen zwischen den Feldern.
- Deshalb ist das Raster ueber Breite und Hoehe beschrieben
  (`Layout` in `coords.ts`) statt ueber einen Radius: die Kacheln sind
  schmaler als ein mathematisch exaktes Hex, und Pixel-Art zu verzerren
  faellt sofort auf.

`src/core/biome.ts` legt zwei langwellige Rauschfelder - Waerme und Feuchte -
ueber die Karte. Sie bestimmen, WIE ein Feld aussieht (Wald wird zu Taiga
oder Dschungel), nie WAS es liefert. Auf die Regeln hat das Klima keinerlei
Wirkung.

## Aufbau

```
src/core/     Regeln und Welt. Kennt weder Browser noch Worker, kein Math.random.
src/worker/   Cloudflare Worker, ein Durable Object je Raum.
src/client/   React-Oberflaeche, Brett als SVG.
```

Die gesamte Spiellogik ist **eine reine Funktion**, `applyAction` in
`src/core/rules/reducer.ts`. Der Server ruft sie auf, der Client benutzt
dieselben Regeln nur lesend, um legale Bauplaetze zu markieren. Die Regeln
existieren dadurch genau einmal.

Fehlgeschlagene Aktionen hinterlassen keine Spur: gearbeitet wird auf einer
Kopie, die nur bei Erfolg uebernommen wird.

### Warum ein Server noetig ist

GitHub Pages liefert nur statische Dateien aus. Fuer Catan reicht das nicht,
und zwar nicht wegen der Rechenlast, sondern wegen der **verdeckten
Information**: Handkarten und Kartendeck sind der Kern des Spiels. Ein
Lockstep-Verfahren, bei dem jeder Client alles nachrechnet, waere dasselbe wie
mit offenen Karten zu spielen.

Deshalb ist das Durable Object die einzige Autoritaet. Es wuerfelt, mischt und
entscheidet ueber Gueltigkeit; jeder Socket bekommt **seine** redigierte Sicht.
`src/core/redact.ts` ist damit eine Sicherheitsgrenze, kein Anzeigehelfer:
`secretSeed`, `rngState`, das Deck und fremde Haende verlassen den Server nie.
`npm run test:e2e` weist das ueber echte WebSockets nach.

Zwei Seeds, nicht einer:

- `worldSeed` ist oeffentlich. Die Clients rechnen das Gelaende selbst aus,
  deshalb wird **kein einziges Gelaendefeld uebertragen** - nur Chunk-Koordinaten.
- `secretSeed` verlaesst das Objekt nie. Sonst waeren Wuerfe und Kartenreihenfolge
  vorausberechenbar.

## Bereitstellen

**Worker** (einmalig Cloudflare-Konto und `npx wrangler login`):

```bash
npm run deploy:worker
```

In `wrangler.toml` unter `ALLOWED_ORIGINS` die Pages-Adresse eintragen.

**Oberflaeche**: Der Workflow in `.github/workflows/deploy.yml` testet, baut
und veroeffentlicht bei jedem Push auf `main` nach GitHub Pages. Vorher unter
*Settings → Secrets and variables → Actions → Variables* die Variable
`VITE_SERVER_URL` auf die Worker-Adresse setzen, zum Beispiel
`https://infinite-catan.<konto>.workers.dev`.

## Regelumfang

**Allein spielen** geht ohne Mitspieler; in der Lobby laesst sich als Ziel
"ohne Ziel" waehlen, dann endet die Partie nie und man siedelt einfach vor
sich hin. Die Aufbau-Schlange laeuft dabei zweimal ueber denselben Spieler,
der Zug kehrt zu ihm zurueck, und Raeuber wie Monopol finden schlicht
niemanden - dafuer braucht es keinen Sonderfall im Ablauf.

Enthalten: Aufbau als Schlange, Wuerfeln und Ertrag, Strasse/Siedlung/Stadt,
Raeuber mit Abwerfen und Klauen, Bank- und Hafenhandel, Handel zwischen
Spielern, alle Entwicklungskarten, Groesste Rittermacht, 10/12/15 Siegpunkte,
2 bis 6 Spieler.

Noch nicht enthalten: Laengste Handelsstrasse, Accounts und Statistiken,
KI-Gegner.

### Handel zwischen Spielern

Der Spieler am Zug stellt ein Angebot, die anderen sagen zu oder lehnen ab,
der Anbieter waehlt einen der Zusagenden aus. Das laeuft **ohne eigene
Phase** nebenher: waehrend ein Angebot liegt, darf weitergebaut werden, und
ein unbeantwortetes Angebot blockiert nichts. Es verfaellt mit dem Zugende.

Eine Zusage ist eine Absichtserklaerung, keine Reservierung. Zwischen Zusage
und Abschluss kann der Anbieter das Angebotene verbaut oder ein Monopol die
Hand des Partners geleert haben, deshalb prueft `canSettleTrade` beim
Abschluss beide Seiten erneut. Karten wandern direkt zwischen den Haenden;
die Bank ist nicht beteiligt.

## Anmerkungen

- Ein Tab ist ein Spieler. Das Wiedereinstiegs-Token liegt im `sessionStorage`,
  nicht im `localStorage` - sonst wuerde ein zweiter Tab den Platz des ersten
  uebernehmen, statt beizutreten. Ein Neuladen behaelt den Platz trotzdem.
- Das Ereignisprotokoll wird nur im Browser gefuehrt und beginnt nach einem
  Neuladen von vorn. Der Spielstand selbst nicht - der liegt im Durable Object.
- Der Weltzustand wird nie gespeichert, nur `worldSeed` und die Liste der
  aufgedeckten Chunks. Ein Spielstand bleibt damit klein, egal wie weit die
  Karte gewachsen ist.
