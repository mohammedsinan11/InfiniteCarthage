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

**Die 7** leuchtet violett statt golden, bleibt 1,6 s stehen und traegt die
Zeile "Eine Sieben - ein Fund!"; ueber der Kartenwahl steht das Schildchen
"7 gewuerfelt". Beides CSS (`.dice-sum.sieben`, `.dice-sieben`,
`.draft-sieben`). *Was fehlt:* ein eigener Moment fuer die 7 - etwa eine
aufbrechende Truhe oder ein Sternenfunke, der in die Kartenwahl uebergeht.

### Hauptstadt — **Platzhalter**

- **Burg (Stufe I):** `client/units.ts`, `zeichneHauptstadt` - Pixelgrafik
  21 x 21 (Bergfried, zwei Tuerme, Mauer, Fahne in Spielerfarbe), gespiegelt
  aus einer Haelfte. Der Stein wird je Kachelsorte umgefaerbt
  (`STEIN_JE_SORTE`).
- **Krone:** `client/board/Marken.tsx`, `KronenZeichen` - 11 x 6, golden
  (bereit, wippt per CSS) oder silbern (fast umschlossen). Das leuchtende
  Feld darunter ist ein SVG-Sechseck mit CSS-Puls (`.hex-krone`).
- **Festungsring (Stufe II):** `client/units.ts` - Palast 21 x 28 in der
  Feldmitte (`zeichneHauptstadt`, Stufe 2), Bastion 9 x 13 an den Ecken
  (`zeichneBastion`), Mauer als hoher Weg mit Zinnen entlang der Kanten
  (`zeichneMauern`). Stein nach `STEIN_JE_SORTE`, Turmdach nach
  `DACH_JE_SORTE`, Fahnen in Spielerfarbe.
- **Ausbau-Tafel:** reines CSS (`.ausbau-tafel`) mit Zipfel.
- **Knoepfe der Bauzeile:** `SymBauen` (Hammer) und `SymHauptstadt` (Krone)
  in `ui/Aktionsleiste.tsx`, aus wenigen SVG-Flaechen.

*Was fehlt:* eine gezeichnete Burg je Gelaende statt umgefaerbtem Stein - neun
Sorten (Wiese, Wald, Taiga, Dschungel, Lehm, Gebirge, Wueste, Schnee, Sumpf).
Spaeter Stufe II (Palast, Bastionen, Mauerstuecke) je Gelaende. Eine Krone mit
Glanz, ein Rahmen fuer die Tafel, Symbole fuer Bauen und Hauptstadt.

*Aufwand:* Burg etwa 24 x 24 px je Sorte; Krone 16 x 10 px mit zwei
Bildern fuers Wippen.

### Spielsteine: Dorf, Stadt, Strasse — **Platzhalter, Dorf und Stadt sprite-bereit**

Seit der Ueberarbeitung Pixelgrafik auf dem Canvas (`client/units.ts`), im
Kunstpixel der Kacheln statt als glatte SVG-Formen:

Im Stil der Kacheln: weicher dunkelbrauner Umriss statt Schwarz, Licht von
links oben. Mittelalterlich:

- **Dorf** (15 x 15): Fachwerkhaus auf Steinsockel, Satteldach in Spielerfarbe
  mit Ziegelreihen, Schornstein, erleuchtete Fenster, Tuer.
- **Stadt** (21 x 19): Mauerring mit Zinnen und Tor, dahinter ein Steinturm mit
  Wimpel in Spielerfarbe und ein Fachwerkhaus.
- **Strasse:** schmaler Feldweg entlang der Feldkante - zwei Kunstpixel Erde,
  jeder vierte Stein heller, ringsum ein Kunstpixel dunkler Rand (anfangs 3 in
  5, dann kurz 1 in 3 wie in den Hauptstadt-Entwuerfen - zu duenn). Wem sie
  gehoert, zeigt ein Wimpel in Spielerfarbe in der Mitte (`wimpel`), aber nur
  auf etwa jedem dritten Abschnitt und nie im Ring einer Residenz
  (`ohneWimpel`, Board `wimpelKante`).

Seit der dritten Fassung stehen im Spiel **kompakte** Fassungen (`dorfKlein`
11 x 10, `stadtKlein` 15 x 14) ueber der Ecke, damit das Haus nicht ueber die
Nachbarkacheln ragt (Variante A). Die Lichtung darunter (`lichtung`, 15 x 5,
Variante B) ist wieder draussen. Die grossen Fassungen bleiben zum Vergleich;
alle Varianten: `labor.html?art=gebaeude`.

- **Wachturm** (`turm`, 7 x 13): Steinturm mit Feuerschale und Band in
  Spielerfarbe, rechts hinter Dorf oder Stadt.
- **Asche:** abgebrannte Strasse als verkohlter Weg mit Glutpunkten, ohne
  Wimpel (`zeichneStrassen`, `verbrannt`).

*Was fehlt:* gezeichnete Gebaeude mit Charakter und eine Strasse, die nach Weg
aussieht statt nach Band. `dorf.png` und `stadt.png` werden ohne
Codeaenderung gezeichnet; fuer die Spielerfarbe braeuchte es eine Farbmaske
(noch nicht gebaut).

*Aufwand:* 2 Gebaeude, gern je 2 Varianten, dazu ein Strassenstueck in drei
Richtungen; Farbe ueber Maske oder 6 eingefaerbte Fassungen.

### Figuren: Lager, Ruinen, Raeuber, Goblins, Ritter, Bogenschuetzen, Wanderer — **Platzhalter, sprite-bereit**

`src/client/units.ts`: kleine Pixelkarten aus Zeichen, gezeichnet im Kunstpixel
der Kacheln auf dem Canvas - also im selben Raster wie die Karte und von den
Kacheln davor richtig verdeckt.

Zu sehen: Lager (Zelt, Palisade, Wimpel in Fraktionsfarbe) mit ihrer Besatzung
davor, noch nicht erkundete Ruinen (zwei Saeulen auf einem Sockel), Raubzuege
und Fehden, Wanderer (grauer Kapuzenmantel mit Stab) und die Ritter der
Spieler. Raeuber tragen die Fraktionsfarbe am Halstuch, Goblins am Guertel,
Ritter die Spielerfarbe am Waffenrock. Bogenschuetzen (`bogen`, 9 x 12):
Lederkapuze, Wams in Spielerfarbe, rechts ein Holzbogen. Alle Figuren blicken
nach vorn und haben keine Laufanimation - sie springen je Runde ein Feld weiter.
*Was fehlt:* ein Pfeil, der beim Beschuss sichtbar von Feld zu Feld fliegt -
heute steht der Beschuss nur im Protokoll.

**Sprites ohne Codeaenderung:** `raeuber.png`, `goblin.png`, `ritter.png`,
`wanderer.png`, `lager.png`, `ruine.png` nach `src/assets/units/` legen. Format
und Anker stehen im README dort. Offen: eine Farbmaske fuer Sprites, damit
Ritter die Spielerfarbe und Raeuber, Goblins und Lager die Fraktionsfarbe
tragen - ein geliefertes Sprite waere derzeit einfarbig.

### Held, Feuer, Auftraege, Diplomatie — **Platzhalter**

- **Held** (`held`, 9 x 12): Krone, Umhang in Spielerfarbe, Ruestung mit
  Goldschnalle. Nachts der groesste Lichtkreis im Shader. Sprite-bereit:
  `held.png`.
- **Flammen** (`board/Marken.tsx`): zwei Pixelbilder im Wechsel (CSS
  `.flammen-a/-b`) an brennender Strasse oder brennendem Haus, anklickbar zum
  Loeschen; nachts ein warmer Lichtkreis.
- **Auftragszeichen** (`board/Marken.tsx`): Pergament mit Ausrufezeichen ueber
  dem Ziel, Sprechblase mit Fragezeichen ueber einem Wanderer mit Angebot; wippen
  in zwei Stufen.
- **Diplomatie im Menue:** Haltung als Wort (Krieg rot, Frieden/Tribut gruen),
  Knoepfe Frieden, Tribut, Krieg erklaeren - keine Wappen, keine Siegel.
- **Aktionssymbol Turm** (`SymTurm`) aus SVG-Flaechen.
- **Hand eingeklappt:** fuenf Rohstoff-Sinnbilder mit Zahl (`.hand-schmal`).
- **Diagnose-Tafel** (`?diagnose=1`): reiner Text, nur fuer Tests.
- **Klaenge:** `playLoeschen`, `playAbgebrannt`, `playHeld`, `playPakt`,
  `playKrieg`, `playAuftrag`, `playTurm` in `audio.ts`.

### Musik und Umgebung — **Platzhalter**

- **Musik** (`music.ts`): erzeugte Melodie in D-dorisch ueber Bordun, Bass auf
  der Eins, gelegentliche Terz, kurzes Echo. Startet nach dem ersten Klick.
- **Umgebung** (`ambiente.ts`): Wind (braunes Rauschen mit Boeen), Regen
  (Rauschen, Tropfen), Voegel, Grillen, Eule, Feuerknistern, ferner Hammer - je
  nach Tageszeit, Wetter, Jahreszeit und Feuer.

*Was fehlt:* Aufnahmen. Wind, Regen, Voegel und ein Lagerfeuer sind die Posten,
bei denen Synthese am deutlichsten nach Synthese klingt.

### Kartenbilder — **Platzhalter**

`ui/KartenBild.tsx`: jedes Kartenbild wird aus der Wirkung zusammengesetzt -
Gelaendekachel(n) mit +1/-1, Rohstoff-Sinnbilder mit Anzahl, ein Sack fuer
beliebige Rohstoffe, eine Waage fuer Handel, eine Truhe fuer Handkarten (kleine
Pixelkarten). In der Kartenwahl gross, im Menue klein.

*Was fehlt:* ein gezeichnetes Motiv je Karte (24 Karten), etwa 48 x 32 px.

### Bewegung und Handy — **Platzhalter**

- **Gleiten:** Einheiten gleiten in gut 0,4 s je Feld zum neuen Feld und
  hopsen zweimal (`Board.tsx`, `GLEITEN_MS`) - keine Schrittbilder.
- **Auftragszeichen** jetzt auch fuer Geleit (ueber dem Wanderer) und
  Kundschaft (ueber dem Zielfeld).
- **Handy hochkant:** Wuerfelknopf klein neben der Hand, Aktionsleiste in einer
  scrollbaren Zeile, Zoom nur mit Plus und Minus.

### Nebel und Befehle — **Platzhalter**

- **Nebel:** Kacheln ausserhalb der Sicht werden blaeulich eingetruebt
  (`tiles.ts`, `tileImageFog`). Harte Kanten je Feld, keine Bewegung.
- **Befehle:** gestrichelte Linie vom Ritter zum Ziel, eine Dreiecksfahne in
  Spielerfarbe, ein kreisender Ring um den ausgewaehlten Ritter, ein gelb
  umrandetes Feld unter dem Zeiger (SVG in `Board.tsx`).

### Fraktionen und Kampf — **Platzhalter**

- **Schwerter ueber einem Kampf:** zwei gekreuzte Klingen aus einer Pixelkarte,
  die Parierstangen in den Farben der beiden Seiten, wackeln in zwei Stufen
  (`board/Schwerter.tsx`, CSS `.kampf-schwerter`). Sprite-bereit: `kampf.png`
  in `src/assets/units/` ersetzt sie.
- **Fraktionsfarben:** neun feste Farben (`theme.ts`, `FRAKTION_COLORS`) statt
  Wappen. Sie faerben Halstuch, Guertel, Lagerwimpel und die Punkte in Menue und
  Feldinfo.
- **Lebensanzeige:** rote Kunstpixel ueber verwundeten Figuren, dunkle fuer
  verlorene Leben (`units.ts`, `zeichneLeben`).
- **Feldinfo:** dunkle Tafel oben links mit Lager, Einheiten, Fraktion,
  Vorhaben, Leben und Beute des Feldes unter dem Zeiger (CSS `.feld-info`).
- **Fraktionsliste:** Farbpunkt, Name und "Krieg" im Reiter Reich - die Haltung
  ist ein Platzhalter fuer die Diplomatie.
- **Klang:** `playClash` (Rauschen und zwei helle Toene) beim Kampfbeginn.

### Aktionsleiste und Bauplaetze — **Platzhalter**

- **Aktionsleiste** rechts neben der Hand (`ui/Aktionsleiste.tsx`): Symbole fuer
  Strasse, Dorf, Stadt, Karte, Ritter, Bogen (Bogen mit Sehne und Pfeil), Handel, Karten, Beute und Zugende aus
  wenigen SVG-Flaechen; Kosten als verkleinerte Rohstoffbilder. Handel und
  Entwicklungskarten klappen als Tafeln auf.
- **Bauplaetze:** ein goldener Ring je freiem Platz (CSS `.vertex-ring`), unter
  dem Zeiger gefuellt; dort steht dann auch das Gebaeude als Vorschau, und die
  drei Nachbarfelder zeigen ihre Zahlen. Die blasse Vorschau auf jedem Platz war
  unuebersichtlich und ist wieder draussen. Ueber einer Strassenkante steht die
  Strasse als Vorschau, sonst ein blasser Strich.
- **Tonknopf** oben im Schild: Lautsprecher mit Wellen oder Kreuz (SVG).
- **Wuerfelknopf** rechts neben der Leiste: Wuerfelsymbol, schrumpfender Balken
  fuer die dreissig Sekunden bis zum Selbstwurf, pulsierender Schein, beim Wurf ein
  Stoss und zwoelf Funken (CSS), dazu `playWurfStart`.

### Wetter, Tageszeit und Licht — **Platzhalter (Shader)**

`board/WetterSchicht.tsx`: ein WebGL-Fragment-Shader ueber dem Gelaende, in
Kunstpixeln gerechnet und pixelig hochskaliert.

- **Tageszeit:** Morgen und Abend warm getoent, Nacht dunkelblau mit Vignette.
- **Licht bei Nacht:** Lichtkreise in vier Stufen um Einheiten (Fackeln),
  Doerfer und Staedte (Fenster) und Lager (Feuer), flackernd, warm getoent.
- **Wetter:** ziehende Wolkenschatten, Sonnenbahnen, treibender Nebel,
  schraeger Pixelregen, pendelnde Schneeflocken, Blitz mit Aufhellen und
  gezacktem Strahl, dazu `playDonner`.
- **Fackel** (`fackel`, 3 x 6) neben jeder Figur bei Abend und Nacht.
- **Wettersymbol** oben im Schild (`ui/WetterSymbol.tsx`): Sonne, Mond, Wolke,
  Regen, Blitz, Schnee, Nebel aus Pixelkarten.
- **Klaenge:** `playHorde` (Horn und Trommeln), `playBrand` (Knistern).

*Was fehlt:* gezeichnete Regen- und Schneetexturen, Blitz-Einzelbilder,
Lichtkegel mit Form statt Kreisen, weiche Nebelschwaden, animierte Fackel- und
Feuerflammen, eine Brand-Animation an Strasse und Haus.

### Hinweis beim Bauen auf dem Handy — **Platzhalter**

"Nochmal tippen zum Bauen" als Schild oben (CSS `.befehl-hinweis`), solange
eine Vorschau auf den zweiten Tipp wartet.

### Zahlenmarker und Haefen — **tragbar**

Kreis mit Zahl und Punktreihe; Hafen als Rechteck mit "2:1". Zweckmaessig und
gut lesbar. Stehen Figuren auf dem Feld, sitzt der Marker auf 55 % verkleinert
im oberen Teil des Feldes, die Figuren etwas tiefer - sonst verdeckte er sie. Ein gezeichneter Holzmarker waere schoener, aber hier ist
Lesbarkeit wichtiger als Schoenheit - der Posten hat niedrige Prioritaet.

### Oberflaeche — **tragbar**

Pixelschrift Silkscreen (Google Fonts), harte Rahmen, Farben aus den Kacheln.
Das Seitenmenue und die Meldungen haben Charakter.

*Was fehlt:* echte Rahmengrafik statt CSS-Kanten - Ecken, Beschlaege, eine
Zierleiste am Menuekopf. Derzeit ist das Zierzeichen ein Schriftzeichen.

Im Menue ausserdem als CSS-Platzhalter: der Stapelzaehler an gleichen Karten
(`.menu-karte-anzahl`, "×3" auf goldenem Grund), die Lebensbalken der Ritter
(`.menu-ritter-leben`, ein Strich je Leben) und der Aufklapp-Pfeil der
Ritterzeilen (▸/▾ als Schriftzeichen). *Was fehlt:* kleine Herzen oder Schilde
fuer das Leben, ein gezeichneter Pfeil.

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
| **Einheiten-Sprites** | `raeuber.png`, `goblin.png`, `ritter.png`, `bogen.png`, `wanderer.png`, spaeter je Einheit | Werden ohne Codeaenderung gezeichnet (README in `src/assets/units`). Fuer Bewegung spaeter zwei Blickrichtungen. |
| **Fraktionswappen** | 9 kleine Wappen oder Banner | Ersetzen die blossen Farbpunkte in Menue und Feldinfo; koennten auch am Lager haengen. |
| **Kampf-Symbol** | `kampf.png`, etwa 12 x 12, gern 2 Einzelbilder | Ersetzt die Pixelschwerter ueber einem umkaempften Feld. |
| **Aktionssymbole** | 10 Symbole, etwa 16 x 16 | Strasse, Dorf, Stadt, Karte, Ritter, Bogen, Handel, Karten, Beute, Zugende in der Aktionsleiste. |
| **Bauplatz-Marke** | Ring oder Fundament, etwa 12 x 8 | Ersetzt den gezeichneten Ring auf freien Bauplaetzen. |
| **Wetter-Sprites** | Regen- und Schneetextur, 3-4 Blitzbilder, Wolkenschatten | Ersetzen die gerechneten Muster im Shader. |
| **Fackel und Feuer** | `fackel.png` 2-3 Einzelbilder, Lagerfeuer | Die Fackel an Figuren bei Nacht; das Licht bleibt im Shader. |
| **Brand** | kurze Einzelbildfolge Flammen und Rauch, dazu Asche | Ersetzt die zwei Pixelflammen (`Marken.tsx`) und die gezeichnete Asche. |
| **Held** | `held.png`, Portraet fuers Menue, 2 Blickrichtungen | Ersetzt die Pixelfigur mit Krone. |
| **Wachturm** | `turm.png`, etwa 7 x 13, Feuerschale animiert | Steht rechts hinter Dorf oder Stadt. |
| **Auftragszeichen** | Pergament, Sprechblase, je 2 Bilder | Ueber Ziel und Wanderer. |
| **Diplomatie** | Siegel fuer Frieden und Tribut, Kriegsbanner | Im Menue neben jeder Fraktion. |
| **Umgebungsklaenge** | Wind, Regen, Voegel, Grillen, Eule, Feuer, Dorf | Ersetzen die Synthese in `ambiente.ts`. |
| **Wettersymbole** | 7 Symbole, etwa 16 x 16 | Sonne, Mond, Wolke, Regen, Gewitter, Schnee, Nebel im Schild. |
| **Wuerfelknopf** | Knopfgrafik, Funken-Einzelbilder | Ersetzt CSS-Stoss und -Funken. |
| **Lebensanzeige** | kleine Herzen oder Balken | Ersetzt die roten Kunstpixel ueber Verwundeten. |
| **Kartenrahmen je Seltenheit** | 5 Rahmen, dazu Glanz als Einzelbildfolge | Ersetzt die CSS-Glut, Funken und Strahlen. Legendaer darf animiert sein, der Rest eher nicht. |
| **Kartenrueckseite** | 1 Motiv | Fuer das Austeilen - derzeit fliegen die Vorderseiten herein. |
| **Ritter-Farbmaske** | 1 Datei neben `ritter.png` | Ritter ziehen in Spielerfarbe ueber die Karte; ein Sprite koennte die Farbe aber noch nicht tragen. |
| **Pluenderung** | kurze Einzelbildfolge | Derzeit nur Meldung und Klang. Eine Staubwolke an der Siedlung, wenn ein Raubzug ankommt. |
| **Klaenge** | Aufnahmen oder komponiert | Ertrag, Karte nehmen (je Seltenheit), Marsch, Klingen (Kampfbeginn), Sieg, Pluenderung, Ruine zuerst. |
| **Ruinen-Sprite** | `ruine.png`, besser 2-3 Varianten | Ersetzt die Pixelsaeulen. Eine erkundete Ruine verschwindet derzeit - eine "leere" Variante waere schoener. |
| **Nebel** | weiche Kante, evtl. ziehende Schwaden | Derzeit harte Tönung je Feld. Ein Uebergang am Sichtrand wuerde das meiste bringen. |
| **Befehlsanzeige** | Fahne, Wegmarken, Auswahlring | Derzeit SVG-Formen. Eine gezeichnete Fahne und Fussspuren statt Strichlinie. |
| **Laufanimation** | 2-4 Einzelbilder je Einheit | Einheiten gleiten schon mit zwei Hopsern je Feld; Schrittbilder wuerden daraus Gehen machen. |
| **Kartenmotive** | 24 Motive, etwa 48 x 32 | Ersetzen die zusammengesetzten Bilder aus Kachel, Rohstoff, Sack, Waage und Truhe. |
| **Gefecht und Belagerung** | kurze Einzelbildfolgen | Derzeit nur Meldung und Klang. Ein Schwertblitz, eine Rauchwolke ueber einem fallenden Lager. |
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
