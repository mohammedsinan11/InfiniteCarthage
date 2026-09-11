# Einheiten-Sprites

PNG-Dateien hier ablegen, und das Spiel zeichnet sie statt der Platzhalter -
ohne Codeaenderung (`src/client/units.ts`). Nach dem Hinzufuegen neu bauen
bzw. den Dev-Server neu laden.

| Datei | Was |
| --- | --- |
| `raeuber.png` | Angehoeriger einer Raeuberbande - Besatzung, Raubzug, Fehde |
| `goblin.png` | Angehoeriger eines Goblinstamms (etwa jede dritte Fraktion) |
| `ritter.png` | Ritter eines Spielers - zieht, wohin man ihn schickt |
| `wanderer.png` | Neutraler Wanderer, zieht umher |
| `lager.png` | Das Lager selbst - Zelt, Palisade, Wimpel |
| `ruine.png` | Eine noch nicht erkundete Ruine |
| `kampf.png` | Ueber einem umkaempften Feld, etwa 12 x 12, Mitte = Feldmitte |

## Format

- **Pixelgrafik im Massstab der Kacheln:** 1 Bildpixel = 1 Kunstpixel. Eine
  Kachel ist 26 x 32, das Sechseck darin 24 x 25. Figuren um 8 x 12 passen gut,
  ein Lager bis etwa 20 x 16.
- **Transparenter Hintergrund, keine Kantenglaettung.** Das Spiel vergroessert
  pixelgenau; weiche Kanten werden zu Matsch.
- **Anker unten mittig:** die unterste Pixelreihe sind die Fuesse, die Mitte der
  Breite steht auf dem Punkt. Bei ungerader Breite ist das die mittlere Spalte.
- **Blickrichtung:** vorerst eine, leicht von vorn.
- **Farben:** Ritter tragen die Spielerfarbe, Raeuber, Goblins und Lager die
  Farbe ihrer Fraktion. Ein Sprite kann das noch nicht uebernehmen - der
  Platzhalter faerbt Waffenrock, Halstuch, Guertel und Wimpel. Fuer echte
  Sprites braeuchte es je eine zweite Datei als Farbmaske (etwa
  `ritter_maske.png`); das ist noch nicht gebaut.
