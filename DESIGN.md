# Entwurf: Karten, Wuerfel, Held

Kein fertiger Plan, sondern ein Vorschlag zum Widersprechen. Was hier steht,
ist noch nicht gebaut.

## Wohin das Spiel geht

Aus Catan wird ein Wuerfelspiel mit Aufbau, Karten und Erkundung - Anleihen
bei Roguelike, Echtzeitstrategie und rundenbasierten Aufbauspielen. Der
Antrieb ist Steigerung: jede Runde soll etwas dazukommen.

Zwei Dinge folgen daraus sofort:

**Der Raeuber passt nicht mehr.** Er lebt davon, jemandem zu schaden. Wer
allein spielt, bestraft sich selbst. Er verschwindet.

**Die Sieben wird frei.** Statt Strafe wird sie das seltene Ereignis - der
Wurf, auf den man hofft.

---

## Karten

### Was eine Karte ist

Eine Karte veraendert den Spielstand. Vier Arten, die sich mischen lassen:

| Art | Wirkung | Beispiel |
| --- | --- | --- |
| **dauerhaft** | gilt ab jetzt immer | "Alle Weiden liefern +1 Wolle" |
| **einmalig** | wirkt sofort, dann weg | "Nimm 4 Erz" |
| **beides** | Sofortwirkung plus Dauerwirkung | "Nimm 2 Holz. Waelder liefern +1" |
| **Regel** | aendert eine Spielregel | "Die 2 zaehlt wie die 12" |

Die vierte Art ist die interessanteste und die gefaehrlichste. Sie macht
Partien unterscheidbar, kann aber auch alles zerlegen. Vorschlag: solche
Karten selten halten und jede einzeln pruefen, statt eine Mechanik zu bauen,
die beliebige Regeln erlaubt.

### Woher Karten kommen

Drei Quellen, mit unterschiedlichem Charakter:

| Quelle | Wann | Kosten | Seltenheit |
| --- | --- | --- | --- |
| **Markt** | jede Runde nach dem Wurf | kostet Rohstoffe | ueberwiegend gewoehnlich |
| **Belohnung** | nach jeder grossen Runde (5 Runden) | umsonst | gehobene Mischung |
| **Fund** | bei einer Sieben | umsonst | selten bis legendaer |

Immer drei zur Auswahl, eine wird genommen, die anderen beiden verschwinden -
wie im Roguelike. Das ist die Stelle, an der Entscheidungen weh tun sollen.

### Seltenheit

Fuenf Stufen: gewoehnlich, ungewoehnlich, selten, episch, legendaer. Sie
bestimmen Ziehwahrscheinlichkeit, Rahmenfarbe und Wucht der Wirkung.

### Wie die Auswahl entsteht

Hier lohnt es, dem Weltgenerator zu folgen: **kein gemischter Stapel, sondern
eine reine Funktion aus Seed und Rundennummer.**

    kartenAuswahl(secretSeed, runde, quelle) -> [Karte, Karte, Karte]

Der Grund ist derselbe wie beim Gelaende. Ein Stapel ist Zustand: er muss
gespeichert, uebertragen und beim Wiedereinstieg wiederhergestellt werden.
Eine Funktion braucht nichts davon - sie liefert bei gleicher Runde immer
dieselben drei Karten, auch nach einem Neuladen. Und weil die Auswahl aus
dem geheimen Seed kommt, kann kein Client vorausrechnen, was kommt.

Nachteil: "diese Karte kommt nur einmal vor" laesst sich so nicht ohne
Weiteres zusichern. Das liesse sich ueber eine Liste bereits genommener
Karten im Spielstand nachruesten - klein genug, um sie zu speichern.

### Was zu bauen waere

1. `core/cards/types.ts` — Karte, Seltenheit, Wirkung
2. `core/cards/catalog.ts` — die Karten selbst, als Daten
3. `core/cards/draft.ts` — die reine Auswahlfunktion
4. `core/cards/apply.ts` — wie eine Karte den Spielstand aendert
5. Phase `draft` im Reducer, zwischen Wurf und Bauphase
6. Dauerwirkungen als Liste im Spielstand, gelesen von `production` und `costs`

Punkt 6 ist der Eingriff, der wehtut: Ertrag und Kosten muessen kuenftig
fragen, ob Karten sie veraendern. Besser jetzt einbauen als spaeter
nachruesten.

### Ein erster Satz zum Ausprobieren

Zehn Karten genuegen, um zu sehen, ob es traegt:

- **Reiche Ernte** (gewoehnlich, einmalig) — nimm 3 Getreide
- **Holzfaellerlager** (gewoehnlich, dauerhaft) — Waelder liefern +1
- **Steinbruch** (ungewoehnlich, dauerhaft) — Berge liefern +1
- **Guter Handel** (gewoehnlich, dauerhaft) — Bankhandel eine Karte guenstiger
- **Wanderhaendler** (ungewoehnlich, einmalig) — tausche beliebig 2 gegen 2
- **Gluecksstraehne** (selten, Regel) — die 6 zaehlt auch als 8
- **Doppelernte** (selten, dauerhaft) — bei einer 12 doppelter Ertrag
- **Vorratskammer** (ungewoehnlich, dauerhaft) — Handkartengrenze steigt
- **Karge Jahre** (gewoehnlich, beides) — nimm 5 Rohstoffe, Weiden liefern -1
- **Der Fund** (legendaer, beides) — nimm 8 beliebige, waehle sofort erneut

Karge Jahre ist Absicht: eine Karte, bei der man ueberlegen muss, ob man sie
ueberhaupt will.

---

## Die Sieben

Der Raeuber verschwindet ersatzlos. Stattdessen: **Fund** - drei seltene
Karten zur Auswahl, umsonst.

Das dreht die Sieben von der haeufigsten Strafe zum haeufigsten Geschenk. Sie
faellt in einem Sechstel aller Wuerfe, also etwa alle sechs Runden - haeufig
genug, um darauf zu spielen, selten genug, dass es sich lohnt.

Was mit dem Abwerfen bei mehr als sieben Handkarten geschieht, ist offen. Es
ist die einzige Bremse gegen das Horten. Vorschlag: bleibt zunaechst, aber
ohne Raeuber, und eine Karte kann die Grenze anheben.

---

## Der Held

Deine Idee einer zweiten, parallel laufenden Ebene. Sie passt gut zur
unbegrenzten Karte: bisher waechst die Welt, aber niemand geht hinaus.

### Grundzuege

Eine Figur, die jede Runde ein Stueck weit laeuft, waehrend das Aufbauspiel
seinen Gang geht. Sie deckt Gelaende auf, findet Dinge, geraet in
Begegnungen.

### Offene Fragen, in der Reihenfolge ihrer Wichtigkeit

**Wer bestimmt den Weg?** Drei Moeglichkeiten, mit sehr verschiedenen Folgen:

- *Der Spieler setzt ein Ziel*, der Held laeuft dorthin. Steuerbar, aber eine
  weitere Sache, die jede Runde Aufmerksamkeit verlangt.
- *Der Held zieht selbst*, etwa zum naechsten unerkundeten Feld. Laeuft
  nebenher, kostet nichts - dafuer schaut man ihm nur zu.
- *Gewuerfelt*, wie du vorgeschlagen hast. Passt zum Wuerfelspiel und macht
  ihn zum zweiten Spannungsbogen je Runde.

Mein Vorschlag: **Ziel setzen, Bewegungsweite wuerfeln.** Die Richtung ist
Entscheidung, die Weite ist Spannung.

**Was findet er?** Gegenstaende, Karten, Rohstoffe, Orte? Das Einfachste
waere: er findet Karten - dann braucht es kein zweites Belohnungssystem.

**Was heisst Kampf?** Hier wuerde ich zurueckhaltend anfangen. Ein Kampfsystem
ist ein eigenes Spiel. Ein erster Schritt koennte sein, dass Begegnungen wie
Karten funktionieren: eine Wahl mit Folgen, kein Gefecht.

**Deckt er Gelaende auf, das sonst verborgen bliebe?** Derzeit waechst die
Karte nur durch Bauen. Wenn der Held ebenfalls aufdeckt, bekommt Erkundung
einen zweiten Weg - und die unbegrenzte Karte endlich einen Grund.

### Was zuerst

Der Held ist der groessere Brocken. Sinnvolle Reihenfolge: erst das
Kartensystem, weil der Held ohnehin Karten als Belohnung braucht - dann steht
das Geruest schon.

---

## Vorschlag zum Vorgehen

1. **Raeuber raus, Sieben wird Fund** — klein, sofort spuerbar, macht das
   Alleinspiel stimmiger.
2. **Kartengeruest** — Typen, Katalog, Auswahlfunktion, Draft-Phase, zehn
   Karten zum Ausprobieren.
3. **Dauerwirkungen** — der Eingriff in Ertrag und Kosten.
4. **Markt und Kosten** — die Runden-Karten, die etwas kosten.
5. **Held** — erst wenn Karten stehen.
