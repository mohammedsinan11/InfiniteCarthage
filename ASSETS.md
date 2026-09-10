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

### Raeubernester — **Platzhalter**

`src/client/board/Nest.tsx`: drei Pfaehle als Polygone, ein roter Wimpel, eine
Schattenellipse. Es liest sich auf einen Blick als Lager, und es sitzt sauber
auf dem Hex - mehr ist es nicht.

Der eigentliche Mangel ist nicht die Form, sondern der Stil: die Kacheln sind
Pixelgrafik, das Nest ist eine glatte Vektorform. Neben den Spielsteinen faellt
das nicht auf, weil die genauso gebaut sind - aber sobald jemand die Steine
zeichnet, muss das Nest mit.

Als Kachel gedacht waere es besser: ein Nest gehoert zum Feld, nicht darauf.
Dann koennte es auch das Gelaende darunter verdecken, statt daraufzuliegen.

Der alte Raeuber-Spielstein ist ersatzlos entfallen.

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

---

## Noch nicht vorhanden

| Was | Umfang | Anmerkung |
| --- | --- | --- |
| **Spielkarten** | Rahmen je Seltenheit, Motiv je Karte | Der groesste Posten. Bei 40 Karten sind das 40 Motive - hier entscheidet sich, ob das Spiel gezeichnet wirkt. |
| **Helden** | Figur auf der Karte, Portraet, Gehbewegung | Siehe `DESIGN.md`. Eine Figur, die ueber Hexfelder laeuft, braucht mindestens zwei Blickrichtungen. |
| **Gegenstaende** | Symbole | Zahl offen, waechst mit dem Kartensystem. |
| **Technologien** | Symbole | Fuer den Reiter im Menue. |
| **Auftraege und Ereignisse** | Symbole, evtl. kleine Bilder | Ereignisse koennten ein Bild vertragen, Auftraege genuegt ein Symbol. |
| **Raeubernest als Kachel** | 2 bis 3 Varianten | Wuerde den Vektor-Platzhalter ersetzen und ins Gelaende einfuegen statt daraufzulegen. |
| **Einheiten** | Figur je Seite, zwei Blickrichtungen | Sobald Truppen produziert und bewegt werden (`DESIGN.md`, Schritt 4). |
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
