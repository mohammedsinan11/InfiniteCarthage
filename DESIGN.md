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
  Besitzer an: ein feindliches Lager in der Naehe zerstoeren oder eine Ruine
  erkunden. 6 Runden Bedenkzeit, 30 Runden Frist, Lohn eine Kartenwahl.
  Verloren, wenn jemand anderes zuvorkommt. Hoechstens drei offene je Spieler,
  einer je Wanderer. Antworten darf man auch ausserhalb des eigenen Zugs.

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
