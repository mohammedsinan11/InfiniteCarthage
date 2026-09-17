# Entwurf: Karten, Wuerfel, Held

Vorschlag zum Widersprechen. Gebaut sind: Fund statt Raeuber, das
Kartengeruest samt Dauerwirkungen - und inzwischen die Raeubernester mit
ihren Pluenderungen. Der Rest steht noch aus; siehe die Listen am Ende.

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

## Raeuber, zweiter Anlauf

> **Inzwischen abgeloest** vom Heer (`core/rules/army.ts`): Raeuber ziehen als
> Einheiten ueber die Karte und pluendern erst bei Ankunft, Ritter stehen als
> Figuren auf Feldern und stellen sie. Der Abschnitt bleibt als Weg dorthin
> stehen.

Der alte Raeuber ist gefallen, weil er einen zweiten Spieler zum Schaedigen
brauchte. Was zurueckkommt, ist etwas anderes: **Nester**, die auf der Karte
liegen wie das Gelaende, aus demselben Seed abgeleitet, und die alle fuenf
Runden zugreifen.

### Warum das mehr ist als eine Rueckkehr

**Die Karte ohne Rand bekommt eine Richtung.** Bisher war Hinausbauen reine
Aufwaertsbewegung - mehr Land, mehr Ertrag, es kostete nur Strassen. Jetzt ist
Entfernung eine Abwaegung: weit weg ist unerschlossen und ertragreich, aber
ungeschuetzt.

**Der Einzelspieler bekommt einen Gegner**, der nicht mitspielen muss.

**Die Handkartengrenze bekommt einen Anker.** Sie hing an der Sieben und war
damit an einen Wurf gebunden, der inzwischen ein Geschenk ist. Jetzt beisst
sie bei den Pluenderungen: Horten weitet die Reichweite der Nester (Vorraete
locken) und erhoeht den Verlust auf die Haelfte.

### Was gebaut ist

| Teil | Wo |
| --- | --- |
| Nester aus dem worldSeed, ein Nest je rund 70 Landfelder, Mindestabstand 3 | `core/raiders.ts` |
| Ruhe im Umkreis 3 um den Ursprung | `core/raiders.ts` |
| Pluenderung zum Beginn jeder grossen Runde | `core/rules/raid.ts` |
| Handkartengrenze, jetzt ohne Sieben | `core/rules/handlimit.ts` |
| Marker auf dem Brett, Meldung und Klang | `client/board/Nest.tsx`, `client/net/store.ts` |

### Was dabei bewusst offen blieb

- **Wer eng am Ursprung baut, kann ungestraft horten.** Die Reichweitenregel
  federt das ab, aber nicht ganz. Das ist ein Regler, kein Fehler: Sicherheit
  gegen Wachstum. Ob er richtig steht, zeigt erst das Spielen.
- **Nester tun nichts ausser nehmen.** Keine Truppen, keine Bewegung, keine
  Belagerung - das sind die Schritte 4 und 5.
- ~~**Der Ritter wehrt noch nichts ab.**~~ Inzwischen doch: Wachen, eine je
  Nest. Offen bleibt, ob sie auch ohne Ritterkarte zu haben sein sollen - etwa
  als Bauteil. Derzeit haengt die ganze Verteidigung am Kartendeck.

---

## Fraktionen, Kampf und Wanderer

Gebaut in `core/factions.ts`, `core/combat.ts` und `core/rules/army.ts`.

- **Fraktionen.** Jedes Lager gehoert einer Raeuberbande oder einem
  Goblinstamm. Die Gebiete entstehen aus Zellen von 18 Feldern mit verschobenen
  Mittelpunkten; Name und eine von neun Farben kommen aus dem Seed, Nachbarn
  tragen nie dieselbe. Im Spielstand steht nur, wer ein Lager erobert hat
  (`nestFraktion`).
- **Feindschaft.** Fraktionen gegeneinander und gegen Spieler, Spieler nicht
  untereinander, Wanderer mit niemandem - alles in einer Funktion
  (`feindlich`). Dort setzt spaeter die Diplomatie an.
- **Kampf.** Stehen Feinde auf einem Feld, wird jede Runde gewuerfelt: ein
  Treffer bei Wurf + Angriff >= 6 (Ritter 3, Raeuber 2, Goblin 1), eine Sechs
  trifft immer, eine Eins nie. Leben: Ritter 3, Raeuber und Goblins 2. Wer
  kaempft, zieht nicht. Wer stand, stuermt auf Feinde nebenan - so stellen
  Ritter weiterhin, wer an ihnen vorbeiwill. Die Karte zeigt Kaempfe mit zwei
  Schwertern.
- **Lager** kaempfen mit: Angreifer -1 (Palisade), Besatzung -2 (ungeordnet),
  ein Leben je Kopf - fuer den Ritter dieselben Werte wie bei der ersten
  Belagerung. Faellt die Besatzung, zerstoeren Ritter das Lager und bekommen
  Beute; fremde Fraktionen erobern es und werden seine Besatzung.
- **Heimkehr.** Raubzuege tragen die Beute heim. Erst dort ist sie fort, und der
  Trupp verstaerkt das Lager (hoechstens 3). Wer ihn unterwegs schlaegt, bekommt
  die Beute. Faellt das eigene Lager, sucht der Trupp ein anderes seiner
  Fraktion oder zerstreut sich.
- **Fehden.** Je grosser Runde schickt mit halber Chance ein Lager nahe den
  Spielern zwei Mann gegen ein feindliches Lager bis 7 Felder entfernt;
  hoechstens eine Fehde zugleich.
- **Wanderer.** Neutral, einer je Spieler, 20 Runden, das erste Ziel an einer
  Siedlung. Noch ohne Wirkung - der Platz fuer Begegnungen.
- **Ritter erholen sich** an eigenen Siedlungen um ein Leben je Runde.

Offen: Diplomatie; was Wanderer bringen (Handel, Geruechte, Auftraege); ob
Kaempfe zu mehreren zu schnell laufen, weil die Runde der Spielerzug ist.

---

## Nacht, Wetter und Feuer

Gebaut in `core/zeit.ts`, `core/rules/army.ts` und `client/board/WetterSchicht.tsx`.

- **Tageszeit.** Ein Tag dauert zehn Runden: zwei Morgen, vier Tag, zwei Abend,
  zwei Nacht - aus der Zugnummer abgeleitet wie die Jahreszeit. Anfangs war
  jede grosse Runde ein Tag; das wechselte zu schnell, um es wahrzunehmen.
- **Nacht.** Die Sicht reicht ein Feld weniger weit. Mit Beginn der Nacht bricht
  mit 60 % eine Goblin-Horde aus dem naechsten Goblinlager bis 12 Felder vor den
  Siedlungen auf: drei Goblins und einer je Spieler, hoechstens sechs. Im
  Weltprotokoll steht sie mit Ausrufezeichen.
- **Wetter.** Haelt fuenf Runden, gewichtet nach Jahreszeit (Winter: Schnee statt
  Regen, Sommer meist klar), aus dem oeffentlichen Seed. Es wirkt:
  Regen und Gewitter halbieren den Ertrag der Getreidefelder (abgerundet: ein
  Dorf dort nichts, eine Stadt eins) und loeschen Feuer; Gewitter ist Sturm und
  schliesst die Haefen; im Schnee ziehen Einheiten nur jede zweite Runde; Nebel
  verkuerzt die Sicht um ein Feld, nachts zusammen um zwei.
- **Feuer.** Nach jeder Pluenderung wuerfelt der Pluenderer: 4-5 legt Feuer an
  eine Strasse am Feld, 6 an ein Gebaeude. Es brennt, bis sein Besitzer einen
  eigenen Zug hinter sich hat - so bleibt immer genau ein Zug zum Loeschen: mit
  einer Rohstoffkarte (Klick auf die Flammen oder im Menue), mit einem Ritter
  oder dem Helden daneben, oder der Regen tut es. Sonst brennt die Strasse ab
  und hinterlaesst Asche - dort baut ihr Besitzer sie fuer ein Holz wieder auf -,
  die Stadt brennt zum Dorf herunter, das Dorf nieder. Das letzte Gebaeude eines
  Spielers bleibt stehen.
- **Wachturm.** Bauteil fuer Holz, Lehm und Erz an einem eigenen Dorf oder einer
  Stadt: sieht fuenf Felder weit, auch nachts, und laesst Brandstifter nicht an
  sein Haus und die Strassen an dieser Ecke - die Antwort auf die Nacht, die
  nicht nur Ritter heisst. Er schuetzt Tag und Nacht.
- **Shader.** Licht, Nacht, Wolken, Regen, Schnee, Nebel, Blitze; Einheiten
  tragen abends und nachts Fackeln, Doerfer und Lager leuchten. Zum Anschauen
  ueber die Adresse vorgebbar: `?zeit=nacht&wetter=gewitter`.

Offen: ob Ritter nachts staerker verteidigen; ob auch abgebrannte Doerfer
guenstiger wieder aufzubauen sein sollen.

## Diplomatie und Auftraege

Gebaut in `core/rules/diplomatie.ts` und `core/rules/auftraege.ts`.

- **Abkommen** gelten je Spieler und Fraktion und machen beide einander nicht
  feind (`feindlich` mit dem Spielstand): keine Raubzuege, keine Horden gegen
  ihn, keine Kaempfe. *Frieden* kostet 2 Getreide und 2 Wolle und gilt 20
  Runden - nur Raeuberbanden nehmen ihn. *Tribut* kostet eine Karte sofort und
  eine zu Beginn jeder grossen Runde, vom groessten Stapel; wer nicht zahlen
  kann, hat wieder Krieg. Krieg erklaeren geht jederzeit in der Bauphase.
- **Auftraege.** Kommt ein Wanderer an einer Siedlung vorbei, bietet er ihrem
  Besitzer einen an - Lohn immer eine Kartenwahl:
  - *Lager:* ein feindliches Lager in der Naehe zerstoeren.
  - *Ruine:* eine Ruine in der Naehe erkunden.
  - *Liefern:* 4 Karten eines Rohstoffs abgeben, per Knopf, auch ausserhalb
    des eigenen Zugs.
  - *Jagd:* 3 Raeuber oder Goblins schlagen, gleich wo - gezaehlt wird in jedem
    Kampf mit eigenen Leuten.
  - *Geleit:* einen Ritter oder den Helden zum Wanderer bringen, solange er
    noch im Land ist.
  - *Kundschaft:* mit einem Ritter oder dem Helden ein Feld 7 bis 10 weit
    draussen erreichen.

  6 Runden Bedenkzeit, 30 Runden Frist. Verloren, wenn jemand anderes zuvorkommt
  oder der Wanderer weiterzieht. Hoechstens drei offene je Spieler, von jeder
  Art einer, einer je Wanderer.

Offen: Auftraege, die Rohstoffe verlangen; Fraktionen, die von selbst Frieden
anbieten oder brechen; ob Tribut mit der Groesse des Reichs steigen soll.

## Kleinere Regeln, zuletzt geaendert

- **Die Bank ist unendlich.** Kein Bestand mehr, kein Ertrag, der ausfaellt,
  weil die Bank leer ist, kein Bankhandel, der daran scheitert. Bezahltes ist
  fort, Ertrag entsteht. Knapp ist nur noch die eigene Hand - und die
  Handkartengrenze bei Pluenderungen.
- **Entwicklungskarten: beliebig viele je Zug.** Die Grenze von einer Karte je
  Zug ist gefallen. Geblieben ist, dass eine frisch gekaufte Karte erst im
  naechsten Zug spielbar ist.
- **Erkunden.** Ritter und der Held lassen sich per Knopf von selbst erkunden:
  sie ziehen zum naechsten Feld, das Neues bringt - unerkundete Ruine oder Land,
  das noch niemand gesehen hat -, um Lager herum. Ein eigener Befehl beendet
  das. Gibt es in Reichweite nichts mehr, bleiben sie stehen.

## Karte, Zoom und Bedienung

- **Kachelabstand 23 x 17 Kunstpixel** - der Abstand, fuer den die Kacheln aus
  hexmap gezeichnet sind. Frueher 24 x 18,75: jede zweite Zeile lag zwischen den
  Kunstpixeln, zwischen den Kacheln blieben dunkle Fugen, und die Karte wirkte
  unscharf. Jede Kachel liegt jetzt auf ganzen Kunstpixeln (`tiles.ts`,
  `kachelEcke`), Figuren darauf ebenso. Vergleich: `labor.html?art=schaerfe`.
- **Eine Zoomstufe mehr:** 12 Geraetepixel je Kunstpixel - am Rechner 6
  CSS-Pixel, am Handy mit dreifacher Skalierung 4.
- **Klicks:** Das Brett faengt den Zeiger erst ein, wenn gezogen wird. Vorher
  bei jedem Druck - Chrome schickte den Klick dann ans Brett statt an den
  Bauplatz, und im Aufbau liess sich mit der Maus kein Dorf setzen.
- **Handy:** Ein Tipp auf ein Feld zeigt dessen Zahl und Feldinfo, wie der
  Zeiger am Rechner. Bauen geht in zwei Tipps - der erste zeigt Gebaeude oder
  Strasse als Vorschau samt den Zahlen der Nachbarfelder, der zweite baut.
  Bauplaetze, Kanten und Feuer werden nach Naehe getroffen, nicht nach
  Trefferflaeche.
- **Zahlen an eigenen Gebaeuden** stehen immer - auf jedem Geraet.
- **Verdecken, gebaut fuer die Hauptstadt:** Kacheln VOR einem Bauwerk
  duerfen es verdecken - aber nur hohe: Wald, Taiga, Dschungel, Berge. Das
  Brett zeichnet die beiden vorderen Nachbarn einer Hauptstadt, wenn sie Wald
  oder Gebirge sind, nach ihr noch einmal - beschnitten auf den Kasten des
  Bauwerks, damit sonst nichts auf der Kachel verschwindet.
  Flache Felder (Wiese, Feld, Lehm, Wueste, Schnee, Sumpf, Wasser) liegen
  darunter. Verdecken alle vorderen Kacheln, schneidet eine flache Wiese die
  Burg gerade ab - das sieht aus wie ein Fehler, genau wie bei den Kaempfern
  (seit der Korrektur zeichnet das Brett Einheiten erst nach der Reihe davor).
  Hohe Kacheln davor lassen ein Bauwerk dagegen im Gelaende stehen statt
  aufgeklebt. Gedacht zuerst fuer die Hauptstadt; Doerfer, Staedte und
  Einheiten koennten spaeter derselben Regel folgen.
- **Gipfel davor:** was ein Berg ueber sein Sechseck hinaus deckt, liegt ueber
  allem dahinter - Strassen, Doerfer, Staedte, Burg, Mauern (`tiles.ts`,
  `ueberhangBild`: das Bergbild minus die Deckung einer flachen Kachel). Kein
  Kasten mehr, der eine Stadt links verdeckt und rechts nicht: die Grenze ist
  der Umriss der Gipfel. Figuren bleiben obenauf. Wald vor einer Hauptstadt
  folgt noch dem Kasten; Wald vor Strassen bleibt darunter - Kronen
  verschluckten sonst ganze Wege.

## Hauptstadt

### Gebaut

- **Bedingung:** sechs eigene Strassen um ein Feld und drei eigene Staedte an
  seinen Ecken im Wechsel. Mehr als drei Gebaeude passen wegen der
  Abstandsregel ohnehin nicht. Doerfer zaehlen vorerst nicht. Beliebig viele
  Hauptstaedte je Spieler - jedes geschlossene Feld darf eine werden -, eine je
  Feld, nicht auf Wasser (`rules/hauptstadt.ts`, Aktion `foundCapital`).
- **Werte, Platzhalter:** Kosten `COST_CAPITAL` (2 Holz, 2 Lehm, 2 Getreide,
  3 Erz), +2 Siegpunkte (`HAUPTSTADT_PUNKTE`). Die drei Staedte behalten Ertrag
  und Punkte - die Hauptstadt kommt obendrauf.
- **Wie man davon erfaehrt:** eine Krone ueber dem Feld. Silbern, sobald
  hoechstens zwei Teile fehlen (Strassen oder Staedte, `FAST_GESCHLOSSEN`),
  golden und mit leuchtendem Feld, wenn der Ring geschlossen ist. Nur fuer den
  eigenen Spieler, an jedem Feld, auf dem noch keine Hauptstadt steht. Der Knopf
  "Bauen" leuchtet dann, und in der Bauzeile steht "Hauptstadt".
- **Ausbauen per Klick:** ein Klick auf ein eigenes Gebaeude oder eine Krone
  oeffnet eine kleine Tafel mit dem, was dort geht - Dorf zu Stadt, Wachturm,
  Hauptstadt -, samt Kosten. Was gerade nicht geht, steht gesperrt da, mit dem
  Grund ("Erst wuerfeln", "Es fehlen noch 1 Stadt").
- **Leiste:** wie vorher alle Knoepfe in einer Reihe; "Hauptstadt" erscheint
  darin, sobald ein Feld geschlossen ist. Die Bauzeile nach Entwurf V2 (Bauen
  tauscht die Leiste, ein Pfeil fuehrt zurueck) liegt als Schalter bereit:
  `BAU_ZEILE = true` in `ui/Aktionsleiste.tsx`. Sie war wieder aus, weil die
  Leiste noch nicht so breit ist - und weil Beute, Handel und Zug Ende fehlten,
  solange die Bauzeile offen stand. Beute steht rechts neben Handel und
  Karten, vor Zug Ende. Eine Zeit lang stand sie vorn, weil sie am Handy am
  Ende der scrollenden Reihe aus dem Bild rutschte.
- **Aussehen, Stufe I:** eine Burg in der Mitte zwischen den drei Staedten.
  Ihr Stein richtet sich nach der Kachelsorte - Sandstein, Ziegel, Granit,
  Moos, Schnee (`units.ts`, `STEIN_JE_SORTE`). Die Zahl des Feldes steht nur
  unter dem Zeiger, sonst laege sie auf der Burg.

- **Stufe II, Festungsring:** ueber die Ausbau-Tafel - Klick auf die Burg oder
  eine Stadt an ihrem Ring (Aktion `upgradeCapital`, Kosten `COST_FESTUNG`,
  +1 Siegpunkt, beides Platzhalter). Der Ring muss dafuer noch geschlossen
  sein. Aus den Strassen wird Mauer, aus den Staedten Bastionen - Ertrag und
  Punkte bleiben -, in der Mitte ein Palast. Stein und Turmdach nach Gelaende
  (`STEIN_JE_SORTE`, `DACH_JE_SORTE`), Fahnen in Spielerfarbe. Die Mauer
  brennt nicht, die Bastionen fangen kein Feuer, und der Ausbau loescht, was im
  Ring gerade brennt.

- **Stufe III, Koenigssitz:** dieselbe Tafel, eine Stufe weiter (Aktion
  `upgradeCapital`, Kosten `COST_KOENIGSSITZ`, +1 Siegpunkt, beides
  Platzhalter). Derselbe Palast, aber die Daecher sind vergoldet und statt der
  Fahne sitzt eine Krone auf der Spitze (`units.ts`, `KOENIGSSITZ`, `KRONE`).
  Die Spielerfarbe bleibt an den Seitentuermen, sonst saehen alle
  Koenigssitze gleich aus. `MAX_STUFE = 3`: hoeher geht es nicht, die Tafel
  sagt das.

- **Wachtuerme am Ring:** seit der Turm fuer sich steht (siehe Wachturm),
  nimmt ihm das Gruenden nichts mehr. Auf den drei freien Ecken des Rings darf
  einer stehen bleiben; die anderen drei tragen ohnehin Staedte.

- **Wer wen verdeckt:** steht auf der untersten Ecke eines Feldes eine Stadt,
  dann deckt die Burg (Stufe I) die beiden oberen Staedte, und ab Stufe II
  faellt die unterste Bastion weg - sie verdeckte nur den Palast. Ertrag und
  Punkte der Stadt bleiben davon unberuehrt, gezeichnet wird sie nicht. Eine
  Mauer, die von einer oberen Bastion abwaerts fuehrt, endet auf halber
  Turmhoehe an ihr: sie laeuft auf den Turm zu, der Turm steht davor, dahinter
  geht die Mauer weiter (`Board.tsx`, `ohneBastion`, `kurzeMauer`). Zuvor lief
  sie ueber ihn hinweg und verdeckte gerade das Bauteil, das die Silhouette
  traegt - in beiden Konstellationen, mit Stadt oben wie unten.

### Phase 2: was der Koenigssitz aufschliesst

Steht der Koenigssitz, beginnt fuer diesen Spieler Phase 2
(`hatKoenigssitz`). Der Weg dahin bleibt der alte: Residenz, Festungsring,
Koenigssitz. Danach faellt die Siedler-Mechanik als Nadeloehr weg.

- **Reichsbauten statt weiterer Burgen:** Burgfeste, Handelskontor und Tempel
  werden einzeln freigeschaltet und stehen fuer sich auf einer Kachel - ohne
  Ring aus Strassen und Staedten. Man muss nicht mehr fuer jede Richtung eine
  eigene Hauptstadt hochziehen. **Mehrfach erlaubt**, nicht einmal je Reich.
- **Wo sie stehen duerfen:** in der Umgebung des Koenigssitzes. Die Umgebung
  waechst mit dem, was schon steht - jeder Reichsbau und jedes Dorf, jede
  Stadt erweitert sie. So dehnt sich das Reich in Phase 2 aus, ohne dass jede
  Kachel eine Strasse braucht.
- **Aussehen:** wie im Entwurf mit Palast-Unterbau (Spalte 1 der Probe,
  `probe-bauten.html`).
- **Der Koenig ernennt Helden:** mit dem Koenigssitz waehlt man den ersten
  Zweig - Krieger, Hexe oder Haendler, passend zu den drei Bauten. Sie treten
  **zusaetzlich** zum bisherigen Helden an; ob man am Ende alle drei haben
  kann, ist noch offen. Das ist der Anfang des Technologiebaums.
- Noch offen: wo genau die Bauoptionen stehen (Vorschlag: ein Kronen-Knopf in
  der Leiste, der erst mit dem Koenigssitz erscheint und die erlaubten Kacheln
  aufleuchten laesst), was die drei Bauten kosten und wirken, und wie weit die
  Umgebung reicht.

### Geplant

- **Eine eigene Aufgabe fuer Tuerme an der Hauptstadt** - etwa Bogenschuetzen
  darauf, die weiter schiessen.
- **Richtungen und Formen** je Gelaende (Hexenturm, Kasbah, Weltenbaum, ...) -
  die Entwuerfe liegen als Bilder vor.
- **Verdecken fuer Doerfer, Staedte und Einheiten:** fuer die Hauptstadt
  gebaut (siehe Karte, Zoom und Bedienung); die uebrigen folgen vielleicht.
- Offen: Doerfer im Ring, was die Hauptstadt ueber die Punkte hinaus bringt.

## Wachturm

Der Turm steht fuer sich, nicht am Haus.

- **Wo:** auf einer freien Ecke, an der eine eigene Strasse anliegt - wie ein
  Dorf, nur **ohne Abstandsregel** (`rules/placement.ts`, `canPlaceTower`). Er
  darf also dicht an Doerfern, Staedten und anderen Tuermen stehen. Auf einer
  Ecke mit Haus geht er nicht, und zweimal auf derselben Ecke auch nicht.
- **Gesetzt** wird er ueber die Leiste wie Dorf und Stadt: Knopf "Turm", dann
  leuchten die erlaubten Ecken. Aus der Ausbau-Tafel eines Hauses ist er
  verschwunden - er gehoert dort nicht mehr hin.
- **Was er kann:** Sicht 5, auch nachts (`SICHT_TURM`). Brandstifter kommen
  nicht an die Haeuser an seinen **Nachbarecken** und nicht an die Strassen,
  die an seiner Ecke enden (`rules/feuer.ts`, `turmNeben`). Bogenschuetzen auf
  einem Feld an seiner Ecke schiessen zwei Felder weit (`bogenErhoeht`).
  Kosten `COST_TOWER` (1 Holz, 1 Lehm, 1 Erz), keine Siegpunkte.
- **Im Zustand:** `state.tuerme`, Ecke -> Besitzer und Stufe. Alte Staende, in
  denen der Turm ein Flag am Gebaeude war, werden beim Laden umgeschrieben
  (`rules/migration.ts`) - die laufende Partie ueberlebt den Umbau.
- **Gezeichnet** steht er mittig auf seiner Ecke; frueher rueckte er nach
  rechts, um neben das Haus zu passen.
- **Stufe 1, Grenzposten:** was oben steht - sehen, schuetzen, erhoehen.
- **Stufe 2, Geschuetzturm:** ueber die Ausbau-Tafel (Klick auf den Turm,
  Aktion `upgradeTower`, Kosten `COST_GESCHUETZTURM`, Platzhalter). Er
  schiesst dann selbst: jede Runde einmal auf Feinde bis `TURM_REICHWEITE`
  Felder weit, gerechnet von dem seiner drei Nachbarfelder, das dem Ziel am
  naechsten liegt - von dort fliegt auch der Pfeil (`rules/army.ts`,
  `beschuss`). Er trifft mit `TURM_ANGRIFF`, steht fest und kann nicht
  zurueckgeschlagen werden.
- **Geplant:** der Grenzposten soll die Umgebung erweitern, in der sich in
  Phase 2 bauen laesst. Eine dritte Stufe (Signalkette: zwei Tuerme in
  Sichtweite verbinden sich) liegt als Idee bereit.

## Kampf sehen

Ein Kampf war lange nur zwei gekreuzte Schwerter. Jetzt zeigt das Brett, was
darin geschieht:

- **Treffer:** jeder Treffer einer Kampfrunde steigt als Zahl ueber dem Feld
  auf, in der Farbe der getroffenen Seite; ein Fall blitzt zusaetzlich rot
  (`fight.treffer` aus `rules/army.ts`, `.treffer-zahl`, `.treffer-puls`). Die
  Zahlen raeumt Game nach gut zwei Sekunden weg, wie die Pfeile.
- **Lebensbalken:** wer im Gefecht steht, traegt seinen Balken - sonst nur die
  Verwundeten. So sieht man, wie es auf dem Feld steht, ohne zu zaehlen.
- **Kampftafel:** neben den Schwertern eine kleine Tafel, je Seite eine Zeile
  mit Farbe, Anzahl und Summe der Leben, dazu rot die Verluste der letzten
  Runde.
- **Pfeile** fliegen wie bisher bei jeder Salve - seit dem Geschuetzturm auch
  von ihm.
- **Der Hieb des Helden:** kaempft ein Held auf dem Feld, zieht ein heller
  Bogen einmal durchs Bild (`.held-slash`). Man soll sehen, dass er dabei ist.

## Die Hexe und der Morast

Zwei Dinge, die nicht zum Alltag gehoeren - man findet sie, oder sie findet
einen.

- **Das Hexenhaus** (`core/hexe.ts`, `hexenhausAt`) liegt wie Lager und Ruinen
  im Seed, nur viel seltener: eine Region von 24 Feldern traegt hoechstens
  eines, und nie im Umkreis von 8 um den Ursprung. Es teilt sein Feld mit
  nichts - kein Lager, keine Ruine, kein Wasser.
- **Die Hexe** steht dort, sobald jemand in Sichtweite siedelt
  (`rules/army.ts`, `hexenWache`). Sie gehoert einer Fraktion aus einer
  einzigen Person (`HEXE_FRAKTION`), mit der sich nicht verhandeln laesst. Sie
  trifft hart (Angriff 4) und haelt wenig aus (Leben 4) - und sie **zieht
  nie weg**. Wer sie will, muss zu ihr.
- **Der Morast** (`derMorast`) ist der grosse Schleim, den die Nacht
  ausspuckt. Er kommt nicht nach der Uhr, sondern nach dem Gemetzel: erst wenn
  die Spieler zusammen `MORAST_AB_GELEE` Gelee gesammelt haben, hat die Nacht
  genug verloren, um etwas Groesseres zu schicken. Er steigt bei dem Spieler
  auf, der am meisten sammelte - wer am fleissigsten Schleime erschlug,
  bekommt Besuch. Leben 12, Angriff 3: kein Gegner fuer einen einzelnen
  Ritter. Solange er lebt, kommt kein zweiter.

## Lager mit eigenem Leben

Lager waren bisher Ausgangspunkte fuer Raubzuege, sonst nichts. Jetzt geschieht
dort etwas, auch wenn man sie in Ruhe laesst (`rules/army.ts`, `lagerLeben`,
einmal je grosser Runde, nur im Umkreis der Spieler - was niemand sieht,
braucht kein Leben).

- **Der grosse Goblin:** jedes Goblinlager hat seinen **Haeuptling**
  (`garrisonUnits`) - der erste Kopf der Besatzung. Er trifft wie ein Ritter
  und haelt mehr aus als seine Leute; faellt er, ist die Bande kopflos.
- **Der Schamane** heilt nicht mit dem Schwert: wo einer im Lager steht, zieht
  es Wachen doppelt so schnell nach.
- **Wachwechsel:** einem Lager, dem Leute fehlen, kommt je Runde einer nach,
  bis `BESATZUNG_MAX`. Ein ausgeduenntes Lager fuellt sich also wieder - wer
  es leeren will, muss es zu Ende bringen.
- **Fest:** Goblinlager feiern (`FEST_CHANCE`). Wer feiert, heilt seine
  Besatzung voll auf und schickt dafuer niemanden auf Raubzug (`feiert`). Eine
  Nacht Ruhe fuer die Nachbarn - und am Morgen steht ein volles Lager da.
- **Streit unter Banden** gibt es schon als Fehde (`sendFeud`): zwei
  Fraktionen, die sich begegnen, kaempfen.

## Stufen: wer kaempft, dient sich hoch

Eine Einheit, die Feinde erschlaegt, bleibt nicht dieselbe.

- **Siege zaehlen:** wer den letzten Treffer setzt und selbst noch steht,
  bekommt ihn gutgeschrieben (`rules/army.ts`, `siegGutschreiben`) - im
  Nahkampf wie beim Beschuss. Nur Einheiten eines Spielers; Raeuber, Goblins
  und Schleime dienen sich nicht hoch.
- **Schwellen:** 2, 4, 7, 11 Siege (`STUFEN_AB`), also vier Stufen. Jede
  bringt +1 Angriff (`STUFE_ANGRIFF`) und +1 Leben (`STUFE_LEBEN`); das Leben
  gibt es sofort, sonst bliebe ein Aufstieg mitten im Kampf ohne Wirkung.
- **Name ab Stufe 2** (`NAME_AB_STUFE`): dann wuerfelt die Partie ihr einen aus
  denselben Bausteinen wie dem Helden - Vorname und Beiname, aber ohne Haus
  und ohne Titel (`core/lore.ts`, `einheitName`). Sie ist niemand von Stand,
  sie hat sich das Recht auf einen Namen erkaempft.
- **Zu sehen:** goldene Winkel ueber dem Kopf, einer je Stufe
  (`client/units.ts`, `zeichneStufe`); der Lebensbalken darunter waechst mit.
  In Feldinfo und Heerleiste steht der Name statt der Nummer.

## Kampf: wo einer steht, zaehlt

Frueher wuerfelte jeder Kaempfer einmal, und der Ort war gleichgueltig. Jetzt
entscheidet mit, wo gekaempft wird und wer wie viel verloren hat.

- **Deckung durch Gelaende** (`core/combat.ts`, `DECKUNG`): Wald und Gebirge
  machen ein Ziel um eins schwerer zu treffen; Wiese, Feld, Huegel und Wueste
  geben nichts. Gerechnet wird beim **Ziel**, nicht beim Schlagenden - deshalb
  zieht die Schlacht jetzt erst das Opfer und wuerfelt dann (`rules/army.ts`,
  `schlage`). Vorher war es umgekehrt, und Deckung haette nichts bewirkt.
- **Deckung durch Mauerwerk** (`DECKUNG_BAU`): wer auf einer eigenen
  Hauptstadt steht oder an einer Ecke seines Feldes einen eigenen Wachturm
  hat, ist um eins schwerer zu treffen. Damit zahlen Tuerme und Festungsring
  endlich auch im Kampf.
- **Moral statt Ausloeschung** (`MORAL_ANTEIL`): verliert eine Seite in einer
  Runde die Haelfte ihrer Leute, weicht der Rest auf ein Nachbarfeld aus -
  Landfeld, kein Lager, keine Feinde darauf. Ein verlorener Kampf ist damit
  kein Totalverlust mehr, sondern eine Niederlage, von der man sich erholt.
  **Ausnahme: der Held.** Wo er steht, weicht niemand.

## Die Nacht

Mit dem Einbruch der Nacht kriecht etwas aus dem Dunkel. Den Anfang machen
Schleime (`rules/army.ts`, `nachtVolk`).

- **Eigene Fraktion:** „Die Nacht" (`NACHT_ID`, `core/factions.ts`) - ohne
  Gebiet, ohne Lager, ohne Diplomatie. Mit ihr laesst sich kein Frieden
  schliessen; Tribut kennt sie nicht.
- **Woher sie kommen:** bei Nachtbeginn je Spieler `SCHLEIM_JE_NACHT` Stueck,
  genau `SCHLEIM_ABSTAND` Felder von seinen Siedlungen entfernt - also aus dem
  Nebel, nicht aus dem Vorgarten. Nicht auf Lagern, nicht auf besetzten
  Feldern, nie zwei auf demselben.
- **Was sie tun:** Auftrag `jagd` - sie ziehen zur naechsten Siedlung und
  greifen an, was ihnen begegnet. **Pluendern nicht, legen kein Feuer**: die
  Nacht will kein Gut. Ein Schleim allein ist harmlos (Angriff 1, Leben 2),
  gefaehrlich wird die Menge.
- **Bei Tagesanbruch** verschwinden sie nicht - sie werden friedfertig
  (Auftrag `ruht`). Solange sie ruhen, ist ihre Seite NEUTRAL
  (`core/combat.ts`, `seiteVon`), niemand kaempft mit ihnen, und ein laufender
  Kampf endet von selbst. Mit der naechsten Nacht wachen sie wieder auf.
- **Gelee:** wer einen Schleim erschlaegt, bekommt ein Stueck ins Inventar -
  im Nahkampf alle Spieler, die noch auf dem Feld stehen, beim Beschuss der
  Schuetze, beim Geschuetzturm sein Besitzer.
- **Geplant:** staerkere Nachtmobs, und irgendwann so etwas wie ein Blutmond.

## Inventar

Was man sammelt, liegt nicht in der Hand: Rohstoffe baut man, Dinge sammelt
man (`Player.inventar`, Kennung -> Anzahl).

- **Wo:** rechts am Rand unter dem Menue (`ui/Inventar.tsx`). Eingeklappt ein
  Beutel mit der Gesamtzahl, ausgeklappt eine Zeile je Ding mit Zeichen, Name
  und Anzahl. Der Beutel bleibt sichtbar, auch wenn nichts drin ist - sonst
  waere nicht zu sehen, dass es ihn gibt.
- **Oeffentlich** wie die Beute: die redigierte Sicht traegt es mit
  (`redact.ts`).
- **Heute drin:** Gelee. Wofuer es gut ist, entscheidet sich noch - Handwerk
  liegt nahe.

## Heldenlore

Ein Held heisst nicht "Held", sondern etwa "Aldebrand der Kuehne, Markgraf von
Sturmfels" (`core/lore.ts`).

- **Woher der Name kommt:** aus dem `rngState` der Partie, also vom Server und
  reproduzierbar - `Math.random` ist in `src/core` verboten. Vergeben wird er,
  wenn der Held zum ersten Mal antritt (`benenneHeld`); er liegt beim Spieler
  (`Player.held`), nicht bei der Einheit, und ueberlebt so dessen Tod.
- **Wie er gebaut ist:** Vorname aus Stamm und Endung ("Alde" + "brand"),
  Beiname mit Artikel, Adelshaus aus zwei Teilen ("Sturm" + "fels"), Titel in
  der Form, die zum Geschlecht passt. Alles ohne Umlaute, wie ueberall.
- **Wo er steht:** ueber der Figur auf der Karte (`.held-name`, auch bei
  fremden Helden - wer gegen ein Haus kaempft, soll wissen, gegen welches),
  in der Feldinfo mit Titel und Haus, in Heerleiste, Menue und Protokoll.
- **Wie er aussieht:** eine von zehn Gestalten (`gestalt`, `GESTALTEN`), beim
  Antreten gewuerfelt - fuenf Koepfe (Haar, Helm, Kapuze, Tuch, Reif) mal zwei
  Hauttoene (`client/units.ts`, `heldKarte`). Rumpf, Umhang in Spielerfarbe
  und Stiefel bleiben gleich, damit die Figur als Held lesbar bleibt. Der
  Nachfolger bekommt garantiert eine andere Gestalt.
- **Wofuer das gebaut ist (geplant):** ein Adelshaus. Faellt der Held, tritt
  sein Nachfolger an - gleicher Stamm, gleiches Haus, gleicher Titel, neue
  Endung, zufaelliges Geschlecht, wechselndes Aussehen (`nachfolger`, steht
  schon bereit, wird noch nicht gerufen: heute kehrt derselbe Held zurueck).

## Verbaende

Alle eigenen Einheiten eines Feldes sind ein Verband. Ein Klick auf das Feld
waehlt sie zusammen, und **der naechste Klick auf die Karte ist schon das
Ziel** - ob der Klick auf die Gruppe auf der Karte, in der Heerleiste oder auf
"untaetig" fiel.
Sie ziehen im Tempo des Langsamsten, also ein Feld - **ausser der Held zieht
mit**: er gibt sein Tempo an seine Schar weiter, wie an sein Gefolge
(`rules/army.ts`, `HELD_SCHRITTE`). Sie warten, solange einer von ihnen
kaempft. Am Ziel loest sich der Verband. Wer einer einzelnen Einheit ein Ziel
gibt, loest sie heraus.

**Scharen, Heerleiste, Befehlstafel** (Truppen A-C):
- **Schar mit Banner:** Wer zusammen einen Befehl bekommt, bildet eine Schar
  (`orderUnits`) und bleibt es auch am Ziel. Ein Wimpel mit Nummer steht ueber
  ihr auf der Karte. Ein Einzelbefehl loest eine Einheit heraus, "Banner
  aufloesen" (`disbandGroup`) die ganze Schar; "Halt" laesst sie beisammen.
- **Heerleiste** oben links (`ui/Heerleiste.tsx`): je Schar oder Feld ein
  Kaertchen mit Arten (H, R, B), Status (steht, zieht, erkundet, folgt,
  kaempft) und Lebensbalken - immer sichtbar. Ein Klick waehlt die Gruppe und
  zeigt sie. Daneben "N untaetig": springt reihum zur naechsten Einheit ohne
  Auftrag.
- **Befehlstafel** an den Einheiten: Klick auf eigene Einheiten oder ein
  Kaertchen oeffnet sie. Jede Einheit ist ein Chip zum An- und Abwaehlen - wer
  angehakt ist, geht mit. Ziel waehlen, Halt, Erkunden, Folgen, Banner
  aufloesen. Keine Wegvorschau, kein Rechtsklick, keine Kampfvorschau (bewusst).

**Im Menue** (Reiter "Heer & Auftraege", Abschnitt Einheiten) stehen alle
eigenen Einheiten je Feld: eine einzelne als Zeile, mehrere als Verband mit
Zusammensetzung ("Held, 2 Ritter, 1 Bogenschuetze") und Status. Ein Klick
klappt den Verband auf - darin jede Einheit mit Leben, Status und eigenen
Befehlen, oben "Ziel fuer alle". Frueher standen Verbaende und Ritter in zwei
getrennten Listen, und man sah nicht, wer zu welchem Verband gehoert.

## Bogenschuetzen

Gebaut (`rules/army.ts`, `beschuss`): angeworben fuer 2 Holz und 1 Wolle
(`COST_ARCHER`), Angriff 2, Leben 2. Sie stuermen nicht vor, sondern schiessen
jede Runde vor dem Kampf einmal auf das naechste Feld mit Feinden - ein Feld
weit, neben einem eigenen Wachturm oder auf der eigenen Hauptstadt zwei
(`bogenErhoeht`). Getroffene verlieren ein Leben und schlagen nicht zurueck;
wer faellt, laesst seine Beute beim Schuetzen, und die Jagd der Wanderer zaehlt
ihn. Die Besatzung eines Lagers trifft kein Pfeil. Im Nahkampf treffen sie um
eins schlechter (`BOGEN_NAHKAMPF`), und aus dem Nahkampf schiessen sie nicht.

Offen: ein sichtbarer Pfeil auf der Karte (heute nur Protokoll), Besatzungen
beschiessen, Schuetzen als Aufgabe fuer Tuerme an der Hauptstadt.

Offen: Verbaende ueber mehrere Felder (Banner), Formationen im Kampf.

## Wiedereinstieg

- **Deine Partien** (`client/net/partien.ts`): jeder Beitritt merkt Raumcode,
  Token und Namen im localStorage, 30 Tage, hoechstens 20. Die Startseite
  listet sie mit "Weiterspielen" - auch nach dem Schliessen des Browsers. Das
  Token daraus wird nur auf diesen Klick benutzt; wer in einem zweiten Tab mit
  dem Raumcode beitritt, bekommt weiter einen eigenen Platz.
- **Neuer Tab gewinnt:** Verbindet sich derselbe Platz ein zweites Mal, gibt
  die alte Verbindung ihn ab (`replaced`) und landet mit Hinweis auf der
  Startseite.
- **Anderes Geraet, derselbe Raumcode:** Eine laufende Partie ohne Token zeigt
  ihre Plaetze (`seats`); man waehlt seinen und nennt die Platz-PIN (4
  Zeichen, steht im Menue unter Reich). Der Raumcode allein genuegt nicht -
  oeffentliche Raeume stehen mit Code in der Liste. Die PIN gilt nur im Raum,
  also gibt es keinen zweiten Code, der weltweit eindeutig sein muesste. Nach
  8 falschen PINs in 10 Minuten sperrt der Raum weitere Versuche.
- **Laufende Partien in der Raumliste** oeffnen sich per Klick: mit gemerktem
  Platz direkt, sonst mit der Platzwahl.

## Kartenwert

Die Balance der Karten folgt einem ausdruecklichen Modell (`core/cards/wert.ts`),
gerechnet in Rohstoffkarten ueber eine Partie: ein Rohstoff 1, ein beliebiger
1,1, +1 Ertrag eines Gelaendes 8, -1 Ertrag -4, Bankhandel 1/2/3 guenstiger
5/12/18, eine Handkarte mehr 0,6. Jede Seltenheit hat eine Spanne -
gewoehnlich 3-6, ungewoehnlich 6-10, selten 10-14, episch 15-20, legendaer
22-30 -, und ein Test prueft, dass jede Karte in ihrer liegt.

Was sich dadurch geaendert hat: Dauerboni ohne Sofortwirkung sind nicht mehr
gewoehnlich (Holzfaellerlager ist jetzt ungewoehnlich); Sofortwirkungen sind
groesser; Karge Jahre bringt 14 statt 6; Grosse Scheune 12 statt 5. Neu: Holzstapel,
Wollballen, Erzbrocken, Baumeister, Saegewerk, Fruchtbares Tal, Handelsflotte,
Goldene Ernte - 24 Karten statt 15. Karten koennen mehrere Dauerwirkungen tragen.

Offen: das Modell unterstellt eine mittlere Partie. Wer frueh einen Dauerbonus
nimmt, gewinnt mehr als 8; wer spaet, weniger. Karten fuer Held, Feuer, Wetter
und Diplomatie brauchen neue Wirkungsarten.

---

## Der Held

Deine Idee einer zweiten, parallel laufenden Ebene. Sie passt gut zur
unbegrenzten Karte: bisher waechst die Welt, aber niemand geht hinaus.

> **Gebaut, erste Fassung** (`core/rules/army.ts`): Jeder Spieler bekommt nach
> dem Aufbau einen Helden. Er zieht zwei Felder je Runde auf ein gesetztes Ziel
> (Ziel setzen ja, Weite wuerfeln noch nicht), deckt vier Felder weit auf,
> geraet in Ruinen nie in einen Hinterhalt und findet eher Beute. Ritter auf
> seinem Feld treffen um eins leichter; Ritter im Gefolge ziehen mit ihm, so
> schnell wie er. Er hat 5 Leben, sieht drei Felder weit, auch nachts, und
> traegt das hellste Licht. Faellt er, kehrt er nach 10 Runden zurueck.
> Offen: gewuerfelte Weite, Begegnungen als Wahl, Gegenstaende.

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

1. ~~**Raeuber raus, Sieben wird Fund**~~ — gebaut.
2. ~~**Kartengeruest**~~ — gebaut: Typen, Katalog mit 15 Karten,
   Auswahlfunktion, Draft-Phase.
3. ~~**Dauerwirkungen**~~ — gebaut: Ertrag, Bankhandel und Handkartengrenze
   fragen die Karten.
4. ~~**Raeubernester und Pluenderungen**~~ — gebaut, siehe oben.
5. ~~**Verteidigung**~~ — gebaut: ein gespielter Ritter stellt eine Wache auf,
   jede Wache haelt bei der Pluenderung ein Nest ab und ist danach verbraucht.
6. **Belohnung nach grosser Runde** — dieselbe Mechanik, andere Quelle. Klein.
7. **Markt und Kosten** — die Runden-Karten, die etwas kosten. Braucht eine
   Kaufentscheidung und damit etwas mehr Oberflaeche.
8. ~~**Einheiten**~~ — gebaut: Ritter (angeworben oder per Karte), Raeuber und
   Goblins stehen im Spielstand und ziehen ein Feld je Runde. Raubzuege brechen
   zum Beginn jeder grossen Runde aus Lagern bis 8 Felder vor einer Siedlung auf
   - die naechsten zuerst, hoechstens einer mehr als Spieler am Tisch - und
   pluendern erst bei Ankunft. Seit den Fraktionen tragen sie die Beute heim,
   und Kaempfe dauern mehrere Runden (siehe "Fraktionen, Kampf und Wanderer").
9. ~~**Belagerung**~~ — gebaut: Ritter auf einem Lager treffen ab 4, die
   Besatzung ab 6. Faellt das Lager, gibt es Beute - eine Kartenwahl.
   *Erkundung:* Nebel ausserhalb der Sicht, Ruinen mit Schatz, Beute, alter
   Karte oder Hinterhalt. Offen: der Held selbst, und ob Einheiten zu mehreren
   langsamer ziehen sollen - die Runde ist der Spielerzug.
10. ~~**Held**~~ — erste Fassung gebaut, siehe "Der Held".
11. ~~**Fraktionen und Kampf**~~ — gebaut: Banden und Staemme mit Namen und
    Farben, Kaempfe ueber mehrere Runden, Heimkehr mit Beute, Fehden,
    Eroberungen, Wanderer. Seitdem auch Diplomatie (Frieden, Tribut) und
    Auftraege der Wanderer.

### Was beim Bauen aufgefallen ist

- **Der Ritter hatte seine Aufgabe verloren.** Ohne Raeuber zaehlte er nur noch
  fuer die Groesste Rittermacht. Mit den Nestern hat er sie zurueck: er stellt
  Wachen.
- **"Nimm beliebige Rohstoffe" verteilt derzeit gleichmaessig**, statt zu
  fragen. Eine echte Wahl waere eine eigene Phase; das lohnt erst, wenn es
  mehr solcher Karten gibt.
- **Das Abwerfen bei ueber sieben Handkarten ist geblieben.** Es ist die
  einzige Bremse gegen das Horten, und zwei Karten heben die Grenze an -
  damit ist es Teil des Kartenspiels statt einer reinen Strafe.
