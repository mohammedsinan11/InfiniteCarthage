# Ideen und Vorschlaege - Uebersicht

Gesammelt aus den Entwurfsrunden, damit nichts verloren geht. Was gebaut ist,
steht in DESIGN.md; hier steht, was vorgeschlagen und noch offen ist.
Stand: 15.09.2026.

---

## 1. Wiedereinstieg in alte Partien

**Heute:** Neu laden im selben Tab holt dich zurueck, ebenso der Raumcode im
selben Tab nach "Verlassen". Neuer Tab, geschlossener Browser oder anderes
Geraet: kein Weg zurueck ("Die Partie laeuft bereits."). Der Ausweis fuer den
Platz liegt nur im Speicher dieses einen Tabs - bewusst, sonst spielten zwei
Tabs denselben Platz. Aendert sich der Aufbau des Spielstands
(`SCHEMA_VERSION`), gehen laufende Partien ohnehin zurueck in die Lobby.

**Vorschlag:**
1. **"Deine Partien" auf der Startseite.** Der Browser merkt sich jeden Raum,
   in dem du einen Platz hast, dauerhaft. Die Startseite listet sie mit
   Raumcode, Mitspielern und Runde und einem Knopf "Weiterspielen". Sind zwei
   Tabs mit demselben Platz verbunden, uebernimmt der neuere, der aeltere
   bekommt einen Hinweis.
2. **Anderes Geraet:** Im Menue steht ein kurzer persoenlicher Code fuer deinen
   Platz, etwa "K7Q2-9F". Wer ihn eingibt, uebernimmt den Platz.
3. **Raumliste:** Laufende Partien, in denen du einen Platz hast, lassen sich
   direkt anklicken.

Reihenfolge: 1 zuerst, 2 wenn zwischen Handy und PC gewechselt wird.

---

## 2. Truppenbewegung und Einheiten

**Schon da:** Zielfahne und Linie zum Ziel, Klick auf ein Feld waehlt die
Einheiten darauf, Ziel/Halt/Folgen/Erkunden im Menue, Verbaende ziehen
gemeinsam. Neu: Einheitenliste je Feld, Verbaende klappen auf.

**Was stoert:** Die Einheiten stecken im Menue (Reiter "HE"), das auf
schmalen Fenstern eingeklappt startet. Welche Einheiten zusammengehoeren, sieht
man auf der Karte nicht. Befehle brauchen den Umweg ueber das Menue.

**Vorschlaege:**

| | Idee | Was es loest |
|---|---|---|
| A | **Heerleiste am Kartenrand:** je Verband oder Einzelner ein kleines Kaertchen (Figuren, Lebensbalken, Symbol steht/zieht/kaempft). Klick waehlt und zeigt auf der Karte. Immer sichtbar, auch bei eingeklapptem Menue. | Einheiten sind nicht mehr versteckt |
| B | **Befehlstafel an der Figur** statt im Menue - wie die Ausbau-Tafel: Klick auf eigene Einheiten oeffnet neben ihnen Ziel, Halt, Erkunden, Folgen. Darin die Einheiten als Chips zum An- und Abwaehlen: wer mitgeht, geht mit. | Verbaende bilden und teilen ohne Menue |
| C | **Banner:** Ein Verband bekommt einen Namen und ein Wimpelzeichen ueber der Gruppe ("1. Schar"). Er bleibt bestehen, bis man ihn aufloest - nicht nur, solange alle auf einem Feld stehen. | Man erkennt Verbaende auf der Karte |
| D | **Wegvorschau beim Zielen:** Unter dem Zeiger der Weg Feld fuer Feld, dazu "3 Runden" und eine Warnung, wenn Feinde am Weg stehen. Die Zielfahne gibt es schon; es fehlen Weg und Dauer. | Man sieht vorher, was ein Befehl bedeutet |
| E | **Stellungsauftraege:** "Bewachen" (bleibt an einer Siedlung, faengt Raubzuege im Umkreis ab), "Streife" zwischen zwei Feldern. | Weniger Befehle je Runde |
| F | **"2 untaetig"** im Schild oben; ein Klick springt zur naechsten Einheit ohne Befehl. | Nichts wird vergessen |
| G | **Rechtsklick / langer Druck** auf ein Feld schickt die gewaehlten Einheiten dorthin - ohne Knopf "Ziel". | Ein Klick weniger je Befehl |
| H | **Kampfvorschau:** Zeiger auf Feinde zeigt ungefaehre Aussichten ("gut", "knapp", "schlecht"). | Weniger Blindgaenge |

**Empfehlung:** A und B zuerst - sie loesen "versteckt" und "welcher Verband".
Danach D und G, dann E.

---

## 3. Spielbarkeit - Kritik

1. **Kein sichtbares Ziel.** Im Schild oben stehen Raumcode, Wetter, Ton und
   Wurf, aber keine Siegpunkte. Bei 30 oder 60 Punkten weiss man nie, wie weit
   man ist. Vorschlag: Punkte (und bei mehreren Spielern die der anderen) ins
   Schild.
2. **Keine Einfuehrung.** Karten-Draft, Fraktionen, Diplomatie, Wetter, Feuer,
   Nebel, Auftraege, Held, Hauptstadt - alles ab Runde 1, ohne Hilfe. Vorschlag:
   Systeme nach und nach freischalten oder beim ersten Auftreten kurz erklaeren
   (eine Zeile, einmalig).
3. **Menue schwer zu lesen.** Reiter heissen RE, KA, TE, HE, TO; "Reich" und
   "Technik" sind noch leer. Pixelschrift in 8-9 px ist auf dem Rechner muehsam.
   Vorschlag: Symbole plus Wort, leere Reiter ausblenden, Fliesstext in
   normaler Schrift.
4. **Kaempfe und Schuesse sieht man kaum.** Schwerter ueber dem Feld, der Rest
   steht im Protokoll. Vorschlag: kurze Treffer-Zahlen ueber den Figuren, Pfeile
   beim Beschuss, eine Meldung "Kampf bei ..." mit "Zeigen".
5. **Druck durch den Selbstwurf.** 30 Sekunden sind allein unnoetig - man liest
   noch das Protokoll, und schon kommt die naechste Runde samt Kartenwahl. Die
   Uhr ist abschaltbar, aber allein koennte sie standardmaessig aus sein.
6. **Viele Unterbrechungen.** 7er-Kartenwahl, Beute, Auftragsangebote,
   Meldungen oben links - alles modal oder fluechtig. Vorschlag: Angebote in
   einem Postfach sammeln ("3 neu") statt sofort aufzugehen.
7. **Leiste wird voll.** Mit Bogen sind es zehn Knoepfe; am Handy passt die
   Reihe nur noch knapp. Vorschlag: Ritter und Bogen unter "Anwerben"
   zusammenfassen, sobald eine dritte Einheit dazukommt.
8. **Wiedereinstieg fehlt** (siehe 1) - in einem Spiel, das lange laufen soll,
   der groesste Verlust.
9. **Werte sind Platzhalter.** Kosten und Punkte von Hauptstadt, Festungsring,
   Bogenschuetzen sind nicht gegeneinander abgewogen. Eine Testpartie ueber 30
   Punkte wuerde zeigen, was sich lohnt und was nie gebaut wird.

---

## 4. Hauptstadt - alle Entwuerfe

### Gebaut
Stufe I Residenz (Burg zwischen drei Staedten), Stufe II Festungsring (Mauer,
Bastionen, Palast), Stein und Dach nach Gelaende, Krone als Hinweis, Ausbau per
Klick, beliebig viele je Spieler, Gipfel verdecken.

### Offen: Stufe III und was sie bringt
- **Stufe III Koenigssitz:** goldene Spitze, Wehrtuerme.
- **Nutzen** ueber Punkte hinaus - vorgeschlagen: das umschlossene Feld liefert
  bei jedem Wurf, ein zweiter Heldenplatz, Diplomatie gegen grosse Fraktionen.
  Mit **einem** starken Effekt anfangen.
- **Tuerme an der Hauptstadt** brauchen eine eigene Aufgabe - etwa
  Bogenschuetzen darauf (erhoeht schiessen sie schon heute zwei Felder weit).

### Richtungen (je Hauptstadt eine)
| Richtung | Wirkung |
|---|---|
| Hexenturm | Die Hexe als zweiter Held: Nebel wirken, Wetter eine Runde wenden, Lager verfluchen |
| Burgfeste | Guenstigere, staerkere Ritter, schnellere Verbaende, ein Paladin |
| Handelskontor | Bankhandel 3:1 ueberall, Karawanen zu Wanderern - passt zu Karthago |
| Tempel | Siegpunkte je Stufe, Heilung in der Naehe, billigerer Frieden |
| Sternwarte | Kartenwahl aus vier statt drei, Wettervorhersage, mehr Sicht |

### Das Platzproblem - vier Wege
A Festungsring (gebaut) · B Hoch hinaus (schlanker Turm) · C Stadtviertel ·
D Stadtkachel (die Kachel wird zur Stadt).

### Formen, die das Sechseck nutzen
Sternfestung · Stufenpyramide · Sechs Sektoren · Wabenstadt · Sechseckiger
Donjon · Hofburg · Erhobenes Plateau · Wasserburg · Kristallkuppel · Heiliger
Hain.
Wachsen: Waben 3-5-7 Zellen, Pyramide Terrasse je Stufe, Sektoren als
Ausbauplaetze (jeder Sektor schaut auf ein Nachbarfeld und bestimmt, was dort
entsteht). Plateau ist am billigsten und laesst sich mit allem kombinieren.

### Je Biom zwei Fassungen
| Biom | A | B |
|---|---|---|
| Wiese | Steinburg | Marktstadt mit Glockenturm |
| Kornfeld | Muehlenstadt | Speicherburg |
| Wald | Holzfeste mit Palisade | Halle unter einem Baum |
| Taiga & Eis | Langhaus | Eisfeste |
| Dschungel | Stufenpyramide | Pfahlpalast |
| Lehmhuegel | Ziegelzitadelle | Terrassenstadt |
| Gebirge | Felsenfeste | Bergkloster |
| Wueste | Kuppelpalast | Oasenstadt |
| Sumpf | Pfahlburg | Moosturm |

### Geschichte, Maerchen, Wildes
Kothon von Karthago (sechseckiger Kriegshafen) · Weltenbaum · Schwebende Insel
(die drei Staedte halten sie an Ketten) · Zwergenbinge (Gesicht im Berg, Loren
statt Strassen) · Karawanserei · Pagode · Lehmmoschee nach Djenne · Haengende
Gaerten · Kolosseum.

### Weltwunder und Fabelwesen
| Hauptstadt | Idee |
|---|---|
| Tenochtitlan | Stadt im sechseckigen See, drei Daemme zu den drei Staedten, Tempelpyramide |
| Petra | In rosenroten Fels gehauen (Entwurf: Fassade ging unter) |
| Akropolis | Felshuegel, Mauerkranz, Saeulentempel, Olivenbaeume |
| Weisse Reiherburg | Nach Himeji: Steinsockel, drei weisse Stockwerke |
| Kloester auf Felssaeulen | Nach Meteora: die drei Staedte werden die drei Kloester |
| Drachenhort | Ein Drache in Spielerfarbe um das Feld gerollt, Gold in der Mitte, Eier an den Ecken |
| Riesenschildkroete | Der Panzer ist sechseckig, jedes Panzerfeld ein Haus, die Staedte sind Boote |
| Nekropole | Mausoleum und Graeber fuer ein duesteres Volk |

### Landschaften und Kulturen
Polderstadt (Deich, Kanaele, Tulpen, Windmuehlen) · Geschlechtertuerme nach San
Gimignano · Kathedrale · Magierakademie mit Runenring · Fjordhalle mit
Palisadenring · Sechsseitige Pyramide mit Sphinx · Kristallgeode · Piratenwrack.

### Weltkulturen
Verbotene Stadt · Angkor Wat · Taj Mahal · Potala · Kasbah · Atlantis (Staedte
als Boote an der Oberflaeche) · Knochenstadt · Venedig.

### Was sich beim Zeichnen gezeigt hat
- **Am staerksten sind Entwuerfe, die die drei Staedte verwandeln** - Kloester
  auf den Saeulen, Boote an der Schildkroete, Dracheneier, Daemme nach
  Tenochtitlan. Dann fuehlt sich die Hauptstadt wie der Abschluss des
  Umschliessens an.
- **Karthago als roter Faden:** Kothon, Karawanserei, Handelskontor.
- **Zwei Wege zur Form:** Das Biom bestimmt sie (Wald wird Hain, Wueste
  Pyramide, Gebirge Donjon, Sumpf Wasserburg) - oder man waehlt frei, und man
  erkennt Spieler an ihrer Hauptstadt.
- **Jede Hauptstadt einmalig:** statt Stufen und Richtungen waehlt man beim
  Gruenden eine Form, und sie bringt ihre eigene Faehigkeit.

### Vorschlag, wie Weltwunder ins Spiel kommen koennten
- **Hauptstadt-Formen** als Wahl bei Stufe III, zwei bis drei je Biom, jede mit
  einer Faehigkeit (die Richtungen oben).
- **Weltwunder** getrennt davon: einmalig je Partie, wer es zuerst baut, hat
  es. Teuer, viele Punkte, eine starke Wirkung - Tenochtitlan, Akropolis,
  Kothon. Das gibt der Endlospartie Wettlaeufe um Ziele auf der Karte.

---

## 5. Weitere offene Ideen

- **Palisaden** als Aufwertung der eigenen Strasse: Holz, schuetzt gegen Brand
  und Pluenderer, fremde Einheiten kommen nicht darueber.
- **Held:** gewuerfelte Weite, Begegnungen als Wahl, Gegenstaende.
- **Belohnung nach grosser Runde**, **Markt** mit Runden-Karten, die kosten.
- **Verbaende ueber mehrere Felder** (Banner), Formationen im Kampf.
- **Bogenschuetzen:** sichtbare Pfeile, Besatzungen beschiessen.
- **Laengste Handelsstrasse**, Accounts und Statistiken.
- **Echte Grafiken** statt Platzhalter (ASSETS.md).
