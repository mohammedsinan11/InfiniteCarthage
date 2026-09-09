# Fremde Bestandteile

## Hex-Tiles

`src/assets/tiles/` enthaelt 48 Pixel-Art-Kacheln (26 x 32 px, Pointy-Top) aus
dem Projekt **hexmap** von Astropulse:

  https://github.com/Astropulse/hexmap

Sie stehen unter der MIT-Lizenz, Copyright (c) 2025 Astropulse. Der
vollstaendige Lizenztext liegt unveraendert neben den Dateien in
`src/assets/tiles/LICENSE` - MIT verlangt, dass Copyright- und Lizenzhinweis
bei jeder Weitergabe mitgeliefert werden, und diese Kacheln gehen mit jedem
Seitenaufruf mit.

Die Bilder wurden laut Autor mit Retro Diffusion erstellt
(https://www.retrodiffusion.ai/).

### Was NICHT uebernommen wurde

Der Generator `map.py` aus demselben Projekt ist bewusst nicht Teil dieses
Repos, obwohl die Lizenz es erlauben wuerde.

Er arbeitet global: `ocean_connected_hex` flutet die gesamte Karte, um Meer
von See zu unterscheiden, `carve_rivers` laeuft vom Gipfel bis zur Kueste,
`hex_bfs_distance` misst Abstaende ueber das ganze Gitter. Das setzt eine
endliche Karte mit Rand zwingend voraus.

Unsere Karte hat keinen Rand. Sie entsteht Chunk fuer Chunk aus einer reinen
Funktion von Seed und Koordinate (siehe `src/core/worldgen.ts`), damit sie
unbegrenzt wachsen kann und der Server nie Gelaende uebertragen muss. Beides
zusammen geht nicht - deshalb die Grafik ja, der Generator nein.

Die Idee der Biome ist trotzdem eingeflossen: `src/core/biome.ts` legt ein
grobes, ebenfalls seed-basiertes Klimafeld ueber die Karte, das
ausschliesslich die Auswahl der Kachel beeinflusst. Auf die Spielregeln hat
es keinerlei Wirkung.
