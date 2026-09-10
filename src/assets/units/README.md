# Einheiten-Sprites

PNG-Dateien hier ablegen, und das Spiel zeichnet sie statt der Platzhalter -
ohne Codeaenderung (`src/client/units.ts`). Nach dem Hinzufuegen neu bauen
bzw. den Dev-Server neu laden.

| Datei | Was |
| --- | --- |
| `raeuber.png` | Bewohner eines Raeubernests |
| `goblin.png` | Bewohner eines Goblinlagers (etwa jedes dritte Nest) |
| `ritter.png` | Wache eines Spielers, steht an seinen Siedlungen |
| `lager.png` | Das Nest selbst - Zelt, Palisade |

## Format

- **Pixelgrafik im Massstab der Kacheln:** 1 Bildpixel = 1 Kunstpixel. Eine
  Kachel ist 26 x 32, das Sechseck darin 24 x 25. Figuren um 8 x 12 passen gut,
  ein Lager bis etwa 20 x 16.
- **Transparenter Hintergrund, keine Kantenglaettung.** Das Spiel vergroessert
  pixelgenau; weiche Kanten werden zu Matsch.
- **Anker unten mittig:** die unterste Pixelreihe sind die Fuesse, die Mitte der
  Breite steht auf dem Punkt. Bei ungerader Breite ist das die mittlere Spalte.
- **Blickrichtung:** vorerst eine, leicht von vorn.
- **Ritter:** die Spielerfarbe kann ein Sprite noch nicht uebernehmen - der
  Platzhalter faerbt den Waffenrock. Fuer echte Sprites braeuchte es eine
  zweite Datei als Farbmaske (`ritter_maske.png`); das ist noch nicht gebaut.
