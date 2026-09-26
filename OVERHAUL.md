# Overhaul: from a replayable board game to a living world

A proposal to argue with, like REPLAYABILITY.md. Written in English because
the request was in English; game terms stay as they are in the code.
Status: 26.09.2026.

---

## 0. Where we are

Almost everything in REPLAYABILITY.md is built: houses, omens, world types,
card archetypes, events, seasons with effects, wonders, scenarios, the daily
expedition, chronicle levels, deeds, bots, co-op, alternative victory
paths, seasonal ambitions ("Vorhaben"), factions with chiefs, temperaments
and grudges, rumours, the Ahnenhalle and a dynasty that carries the hero's
house into the next game.

Three independent playtests rated the game at about **7/10 for
replayability** and **7-8/10 for immersion**, but only **5/10 for newcomer
ease and UI clarity**. Their shared verdict:

- Runs differ, but mostly through **random pressure** (raids, dice, cards).
  Player decisions shape a run less than they should.
- The world has faces now (chiefs, rumours, grudges), but it still **reacts
  instead of living**: nothing happens that you did not trigger or roll.
- The screen is **dense**: a dock with 12 buttons, a side menu with four
  tabs and ~15 sections, toasts, tips, a raid warning and an army bar
  compete for the same space.

More systems will not fix these three. The next step is structural. What
follows are five overhaul directions, ordered by how much they would change
the feel of the game, with a recommended path at the end.

---

## 1. A world that lives without you

> **Built (step 2):** chiefs can fall when their camp is destroyed (35 %) or
> captured (50 %) and a successor with a different temperament takes over;
> loot that raiders carry home makes the next raid stronger; every faction
> remembers each house (destroying camps and declaring war make it hostile,
> tribute and peace reconcile; a hated house gets no peace); each
> temperament has a stated goal. The season report "Kunde aus dem Land"
> (`src/core/kunde.ts`) appears at every season change and is kept in the
> Chronist's tab and on the end screen. Still open: camps growing into
> strongholds, factions merging or splitting.
>
> **Built (step 4):** population (`src/core/bevoelkerung.ts`: villages hold
> 3, cities 5, growth each big round, faster with food nearby; plunder costs
> an inhabitant; a city needs 2, a knight takes 1; figures on the map) and
> caravans (`src/core/karawane.ts`: one per player between the two farthest
> settlements, 2 cards of the scarcest sorts per arrival, raiders attack
> them).

**Idea.** The world simulates a little every big round, whether or not a
player touches it. Factions are not only raid spawners; they are actors
with goals.

- **Faction arcs.** Each chief has a goal (expand, get rich, avenge, unite
  the tribes) and a mood toward each house. Camps grow into **Burgen**,
  factions merge or split, a chief dies and a successor with a different
  temperament takes over. Feuds already exist; make their outcome change
  the map (the loser's camps change colour and chief).
- **Traders and pilgrims on the roads.** Caravans move between your towns
  and between faction towns. You can tax, protect or rob them. Roads stop
  being victory points and become arteries you can see.
- **Villages that have people.** Population (the old "Bevoelkerung"
  placeholder) as a single number per settlement: it grows with food and
  safety, shrinks after raids and fires, and produces the workers that
  cities, wonders and armies need. Visible as tiny figures on the map.
- **A season report.** At every season change a one-page "Kunde aus dem
  Land" in the chronicler's voice: what the factions did, who feuded, which
  chief fell, what the harvest was. It turns hidden simulation into story.

**Why it matters.** Runs would differ by *what the world did*, not only by
what was rolled. The player reads the world and responds to it; that is
immersion and decision-making at once.

**Cost.** Large. Needs a faction-AI layer in `rules/army.ts`, a population
field on buildings and a new event type for season reports. All of it stays
a pure function of seed, state and turn, so the architecture holds.

---

## 2. Advisors instead of menus: a diegetic interface

> **Built (step 1):** the four advisors (Kanzler, Marschall, Seherin,
> Chronist) with portrait, one line of advice and an attention badge; the
> "Rat?" button (bot logic in words, with the field highlighted); the
> timeline strip above the dock; camps clickable with a panel (chief,
> garrison, army/tribute/peace); the minimap (toggle under the zoom).
> Radial menus for all map objects are still open.

**Idea.** Replace the four-tab side menu with a **council** of four advisors
in the style of the game: the Kanzler (economy, trade, ambitions), the
Marschall (army, raids, factions), the Seherin (omens, rumours, events,
wonders) and the Chronist (score, victory paths, log). Each has a portrait,
a one-line "what I would do now" and a badge when something needs attention.

- **"Was jetzt?"** One button that asks the council and highlights the
  single most useful next action on the map (build here, answer this raid,
  take this card). This alone would fix most "I did not know what to do"
  moments from the playtests.
- **A timeline strip** above the dock: the next 5 rounds with what is
  coming (night, raid party arriving, season change, ambition deadline,
  event). Raids stop being surprises; planning becomes possible.
- **Map-first actions.** Click a building, a unit or a camp to get its
  actions in a small radial menu (build, upgrade, order, negotiate), instead
  of a 12-button dock that is mostly disabled.
- **A minimap** with icons for your settlements, army, known camps, ruins,
  wonder sites and rumours, and pins you can set yourself.

**Why it matters.** The two weakest scores (newcomer ease, UI clarity) are
both about *finding* things. Advisors turn information into characters and
advice, which also serves immersion.

**Cost.** Medium. Pure client work: the data already exists in
`PublicState`; the council is a re-organisation of `SideMenu.tsx`, the
timeline reads `season.ts`, `raiders`, `vorhaben` and the event schedule.

---

## 3. A dynasty campaign: one family, many generations

> **Built (step 3):** heirlooms (`src/core/erbe.ts`, chosen at the end of a
> game, a small start gift in solo normal games only), family trait, family
> tree on the home page, and gravestones of today's other players in the
> daily expedition. Cross-game faction reputation is still open.

**Idea.** Make the dynasty the spine of the game. Each game is **one
generation** of your house. What you achieve shapes the next generation's
start:

- **Inheritance.** A relic from the Ahnenhalle (one per generation, chosen
  at the end), a reputation with factions ("the Aschewoelfe remember your
  grandmother"), and a family trait earned by how you played (Builders,
  Warriors, Merchants).
- **A family tree** on the home page instead of the Ahnenhalle list, with
  each ancestor's world, deeds and death.
- **Shared-seed legacy.** In the daily expedition, the ruins of *other
  players'* failed settlements from yesterday appear on today's map as
  ruins with their names. The world remembers everyone.

**Why it matters.** It gives a reason to start the next game that is not a
number: continuing a story you care about. Roguelites that do this well
(Rogue Legacy, Hades) are replayed for hundreds of hours.

**Cost.** Medium. The dynasty plumbing exists (`lore.ts`, `profil.ts`, the
join message). Relics and traits need balance rules for multiplayer
(disabled or cosmetic there). Cross-player legacy needs a small store in
the worker next to the leaderboard.

---

## 4. The hero as the player's body

**Idea.** Today the hero is one unit among knights. Make the hero the
player's presence in the world: a journey with scars and relics, a
reputation in each faction's land, dialogue with chiefs and wanderers
("storylets" that depend on where you are and who you have met), and a
death that matters (the successor inherits one item and one enemy).

**Why it matters.** Immersion comes from being *somewhere*. The map is
beautiful but the player acts on it from above. A hero with a story makes
exploration personal, and the rumours system already points somewhere worth
going.

**Cost.** Large, content-heavy. The engine side is modest (hero state,
storylet conditions), the writing is the work.

---

## 5. Online: async and persistent

**Idea.** Two changes that make the online side replayable:

- **Play-by-notification.** Turns with a timer of hours, a push when it is
  your turn, several games at once ("Deine Partien" already exists).
- **Seasons of a shared world.** One persistent world per month, many
  players, each settling their own corner; factions and chiefs are shared.
  At the end of the month the world's chronicle is published and a new one
  begins.

**Cost.** Large. Durable Objects fit the model (one per region), but it is a
new product, not a feature.

---

## 6. Recommendation

| Step | What | Why first | Size |
|---|---|---|---|
| 1 | **Advisors, "Was jetzt?", timeline** (section 2) | Fixes the two weakest scores; pure client work; makes every later system easier to understand | M |
| 2 | **Season report and faction arcs** (section 1, without population) | Makes runs differ by what the world *did*; builds on chiefs and grudges that exist | M/L |
| 3 | **Dynasty campaign** (section 3) | Long-term reason to return; plumbing exists | M |
| 4 | **Population and caravans** (section 1) | Deepest change to the economy; do it once the UI can explain it | L |
| 5 | Hero storylets, async online | Content and product scale | L |

Keep the pixel style, the German voice, the pure seeded rules and the
server-authoritative room. None of the steps needs to break them.
