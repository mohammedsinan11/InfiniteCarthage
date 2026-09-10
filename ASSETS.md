# Grafiken: Bestand und Bedarf

Eine ehrliche Bestandsaufnahme. Sie sagt, was da ist, woher es kommt, was es
taugt und was ein Zeichner daraus machen sollte.

## Vorbemerkung zur Herkunft

Die Hexkacheln stammen von einem Pixelkuenstler. Alles Uebrige - Symbole,
Wuerfel, Spielsteine, Raeuber - habe ich als SVG geschrieben. Das ist etwas
anderes als gezeichnet: es ist geometrisch konstruiert, funktioniert bei
kleinen Groessen und traegt die Information, aber es hat keine Handschrift.
Nebeneinandergelegt sieht man den Unterschied sofort, und mit wachsendem
Umfang - Karten, Helden, Gegenstaende - wird er groesser statt kleiner.

Deshalb: die Liste unten ist keine Wunschliste, sondern eine Schuldenliste.

## Bewertung

| Stufe | Bedeutung |
| --- | --- |
| **gut** | passt zum Spiel, bleibt |
| **tragbar** | erfuellt seinen Zweck, wuerde von echter Zeichnung profitieren |
| **Platzhalter** | sollte ersetzt werden, bevor das Spiel jemand Fremdes sieht |

---

## Bestand

### Gelaendekacheln — **gut**

48 Stueck, 26 x 32 px, aus [hexmap von Astropulse](https://github.com/Astropulse/hexmap)
(MIT, siehe `THIRD_PARTY.md`). Sauberes Pixel-Art mit Aufbauten, die ueber das
Feld ragen. Sie geben den Stil vor, an dem sich alles andere messen lassen
muss.

*Bedarf spaeter:* weitere Sorten, wenn Gelaende dazukommt (Sumpf und Schnee
liegen ungenutzt im Ordner), und Jahreszeitvarianten, falls die Farbschicht
irgendwann nicht mehr genuegt.

### Rohstoffsymbole — **Platzhalter**

`src/client/ui/ResourceIcon.tsx`. Fuenf Sinnbilder: gestapelte Staemme, Schaf,
Getreidegarbe, Ziegelmauer, Erzbrocken. Zweiter Anlauf; der erste war so
undeutlich, dass sich Getreide und Erz nicht unterscheiden liessen.

*Was fehlt:* Handschrift. Sie sind erkennbar, aber leblos - gleichmaessige
Linien, keine Textur, kein Licht. Eine echte Handkarte haette einen Rahmen mit
Charakter, eine Sorte hervorgehoben, vielleicht ein Wappenmotiv.

*Aufwand:* 5 Bilder, etwa 48 x 48 px, plus Kartenrahmen.

### Wuerfel — **tragbar**

`src/client/ui/DiceOverlay.tsx`, als SVG mit Punktmuster. Lesbar und
funktioniert, aber es sind Rechtecke mit Kreisen.

*Was fehlt:* Wuerfel aus Holz oder Knochen mit Kantenlicht. Fuer die
angedachten Sonderwuerfel braucht es ohnehin unterscheidbare Formen -
spaetestens dann lohnt eine Zeichnung.

*Aufwand:* 6 Augenzahlen je Wuerfelart, etwa 64 x 64 px.

### Spielsteine: Siedlung, Stadt, Strasse — **Platzhalter**

In `Board.tsx` als SVG-Pfade. Ein Haus mit Giebel, ein breiteres Haus, eine
dicke Linie. In Spielerfarbe eingefaerbt.

*Was fehlt:* alles. Sie sollten wie gebaute Dinge aussehen, nicht wie
Piktogramme, und in sechs Spielerfarben lesbar bleiben.

*Aufwand:* 3 Formen x 6 Farben, oder 3 Graustufenbilder, die eingefaerbt
werden.

### Figuren: Lager, Raeuber, Goblins, Ritter — **Platzhalter, sprite-bereit**

`src/client/units.ts`: kleine Pixelkarten aus Zeichen, gezeichnet im Kunstpixel
der Kacheln auf dem Canvas - also im selben Raster wie die Karte und von den
Kacheln davor richtig verdeckt. Das ersetzt den frueheren Vektor-Marker fuer
Nester, dessen Stilbruch hier notiert war.

Zu sehen: das Lager selbst (Zelt, Palisade, Wimpel), zwei bis drei Bewohner
davor - Raeuber oder, in etwa jedem dritten Nest, Goblins -, und die Wachen
eines Spielers als Ritter in seiner Farbe an seinen Siedlungen.

**Sprites ohne Codeaenderung:** `raeuber.png`, `goblin.png`, `ritter.png`,
`lager.png` nach `src/assets/units/` legen. Format und Anker stehen im README
dort. Offen: eine Farbmaske fuer Ritter-Sprites, damit sie die Spielerfarbe
tragen.

### Zahlenmarker und Haefen — **tragbar**

Kreis mit Zahl und Punktreihe; Hafen als Rechteck mit "2:1". Zweckmaessig und
gut lesbar. Ein gezeichneter Holzmarker waere schoener, aber hier ist
Lesbarkeit wichtiger als Schoenheit - der Posten hat niedrige Prioritaet.

### Oberflaeche — **tragbar**

Pixelschrift Silkscreen (Google Fonts), harte Rahmen, Farben aus den Kacheln.
Das Seitenmenue und die Meldungen haben Charakter.

*Was fehlt:* echte Rahmengrafik statt CSS-Kanten - Ecken, Beschlaege, eine
Zierleiste am Menuekopf. Derzeit ist das Zierzeichen ein Schriftzeichen.

### Hintergrund — **Platzhalter**

Einfarbig dunkel mit feinem Gewebemuster hinter der Karte. Ausserhalb des
erzeugten Gelaendes ist schlicht nichts.

*Was fehlt:* etwas, das den Rand der bekannten Welt erklaert - Nebel,
Seekarte, Pergament. Auf einer Karte ohne Rand ist das eine sichtbare Luecke.

### Bewegung — **tragbar**

Wuerfelrollen, Aufleuchten getroffener Felder, fliegende Karten, angehobenes
Feld, hereinfliegende Meldungen. Alles per CSS und Canvas.

*Was fehlt:* Einzelbildfolgen statt reiner Bewegung. Eine fliegende Karte, die
sich dreht, ein Feld, das aufblitzt statt nur heller zu werden.

### Karteneffekte — **Platzhalter, bewusst**

Auf Wunsch eingebaut, damit sich die Kartenwahl nach etwas anfuehlt, solange es
keine gezeichneten Karten gibt - und ausdruecklich zum Ersetzen gedacht:

- Austeilen (Karten fliegen gefaechert von unten herein)
- Neigen unter dem Zeiger mit mitlaufendem Lichtfleck
- Glanzstreifen ab selten, pulsierende Glut ab episch
- aufsteigende Pixelfunken ab episch, Strahlenkranz bei legendaer
- Lichtblitz beim Nehmen, Zerfallen der nicht gewaehlten Karten
- auf der Handkarte: Huepfen und Lichtfleck bei Zugewinn

Alles CSS in `styles.css` (Abschnitt "Karteneffekte") und `CardDraft.tsx`. Wenn
echte Karten kommen, sollten die meisten davon wegfallen; ein gezeichneter
Rahmen je Seltenheit traegt mehr als jeder Glanz.

### Klaenge — **Platzhalter**

Alles im Browser erzeugt (`audio.ts`): Wuerfel, Bauen, Ertrag, Pluenderung,
Kartenwahl (Austeilen, Zeiger, Nehmen je Seltenheit, Zerfallen), Wache,
Abwehr. Zweckmaessig und lizenzfrei, aber erkennbar synthetisch. Ertrag und
Karten sind die Momente, die am meisten von echten Aufnahmen profitieren
wuerden.

---

## Noch nicht vorhanden

| Was | Umfang | Anmerkung |
| --- | --- | --- |
| **Spielkarten** | Rahmen je Seltenheit, Motiv je Karte | Der groesste Posten. Bei 40 Karten sind das 40 Motive - hier entscheidet sich, ob das Spiel gezeichnet wirkt. |
| **Helden** | Figur auf der Karte, Portraet, Gehbewegung | Siehe `DESIGN.md`. Eine Figur, die ueber Hexfelder laeuft, braucht mindestens zwei Blickrichtungen. |
| **Gegenstaende** | Symbole | Zahl offen, waechst mit dem Kartensystem. |
| **Technologien** | Symbole | Fuer den Reiter im Menue. |
| **Auftraege und Ereignisse** | Symbole, evtl. kleine Bilder | Ereignisse koennten ein Bild vertragen, Auftraege genuegt ein Symbol. |
| **Lager-Sprite** | 1 bis 3 Varianten (`lager.png`) | Ersetzt das Pixel-Zelt. Raeuber- und Goblinlager duerfen verschieden aussehen - dafuer braeuchte es zwei Dateien. |
| **Einheiten-Sprites** | `raeuber.png`, `goblin.png`, `ritter.png`, spaeter je Einheit | Werden ohne Codeaenderung gezeichnet (README in `src/assets/units`). Fuer Bewegung spaeter zwei Blickrichtungen. |
| **Kartenrahmen je Seltenheit** | 5 Rahmen, dazu Glanz als Einzelbildfolge | Ersetzt die CSS-Glut, Funken und Strahlen. Legendaer darf animiert sein, der Rest eher nicht. |
| **Kartenrueckseite** | 1 Motiv | Fuer das Austeilen - derzeit fliegen die Vorderseiten herein. |
| **Ritter-Farbmaske** | 1 Datei neben `ritter.png` | Wachen stehen inzwischen als Figuren an den Siedlungen; ein Sprite koennte die Spielerfarbe aber noch nicht tragen. |
| **Abwehr und Pluenderung** | kurze Einzelbildfolgen | Derzeit nur Meldung und Klang. Ein Schwertblitz am Nest, eine Staubwolke an der Siedlung. |
| **Klaenge** | Aufnahmen oder komponiert | Ertrag, Karte nehmen (je Seltenheit), Wache, Abwehr, Pluenderung zuerst. |
| **Gegner und Kampf** | offen | Sobald der Held kaempfen soll. |
| **Menuereiter** | 4 bis 8 Symbole | Derzeit stehen dort Kuerzel wie "RE" und "TE". Das ist offensichtlich vorlaeufig. |

---

## Vorschlag zur Reihenfolge

1. **Menuereiter-Symbole** — kleinster Aufwand, sofort sichtbar, ersetzt die
   Buchstabenkuerzel.
2. **Rohstoffkarten** — man sieht sie in jeder Runde, sie liegen dauerhaft im
   Bild.
3. **Spielsteine** — sie stehen auf der Karte und stechen neben den Kacheln ab.
4. **Kartenrahmen** — bevor viele Karten entstehen, muss der Rahmen stehen.
5. **Wuerfel** — zusammen mit den Sonderwuerfeln.
6. **Hintergrund** — wirkt stark, ist aber nicht dringend.

## Woran sich eine Zeichnung messen lassen sollte

- **Aufloesung wie die Kacheln.** Die sind 26 x 32 mit sichtbaren Pixeln.
  Feiner gezeichnete Symbole daneben wirken wie ausgeliehen.
- **Gedaempfte Farben.** Die Kachelpalette ist erdig. Reine, kraeftige Farben
  fallen heraus - deshalb sind auch die Spielerfarben abgedunkelt.
- **Erkennbar bei halber Groesse.** Karten werden klein dargestellt, Symbole im
  Menue noch kleiner. Silhouette vor Detail.
- **Keine Umrisslinie um alles.** Die Kacheln haben keine, aufgesetzte Symbole
  sollten sie auch nicht haben, sonst wirken sie aufgeklebt.
