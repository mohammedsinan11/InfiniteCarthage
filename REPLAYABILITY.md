# Replayability: play report and proposal

A proposal to argue with, in the spirit of DESIGN.md and IDEEN.md. It is
written in English because it was requested in English; the terms from the
game (Dorf, Fund, Lager, ...) are kept as they appear in the code.
Status: 26.09.2026.

---

## 0. The short version

InfiniteCarthage already has the *foundations* of a highly replayable game:
a pure, seeded world, a roguelike card draft, factions with their own lives,
weather, a day and night cycle, a hero, quests and an online server. What it
lacks are the things that make a player start the **next** game:

1. **Every game starts the same way.** Nothing is chosen before the first
   roll. There is no house, no leader and no run modifier, and the lobby only
   offers a points target.
2. **Most variety is cosmetic or numeric.** Biomes and seasons change the
   look only. Of the 32 cards, 23 are resource or production bumps and the
   other 9 are one-shot combat tactics.
3. **A game has no shape.** In solo play I had 4 of 30 VP after 60 rounds,
   one in-game year, and my score went *down* twice. There are no mid-term
   goals, and when the game ends there is only "X gewinnt!".
4. **Nothing carries over between games.** There are no stats, no unlocks,
   no seed to share and no challenge to beat.
5. **Online means the same room, taking turns.** There are no bots, no
   co-op, no async play, no replays and no shared challenges.

Recommended order, detailed in section 5:

| Phase | Theme | Core items |
|---|---|---|
| 0 | Shape of a game | fixed-length "One Year" mode, end-of-game chronicle, seed display and "play again", fixes from the play test |
| 1 | Every game different | **Omens** (run modifiers), **Houses** (asymmetric start), rule cards, card archetypes |
| 2 | Reasons to come back | **Daily Expedition** with leaderboard, **Chronicle levels** (difficulty ladder), achievements, dynasty |
| 3 | Online depth | **bots**, **co-op against the horde**, async turns, replays |
| 4 | Content cadence | scenarios, wonders, seasonal content drops |

> **Built:** the end-of-game chronicle, Omens (14 to start), the "One Year"
> length with its score, per-turn dice and the Daily Expedition with its
> leaderboard. The README section "Wiederspielwert" describes what exists;
> the rest of this document is still a proposal.

The first three items to build are the **end-of-game chronicle**, **Omens**
and the **Daily Expedition**. Together they are the smallest step that turns
"one long sandbox" into "a game you want to play again tomorrow". Each fits
the existing architecture, pure functions of seed and turn, without new
concepts.

---

## 1. What I played

- Local setup: `wrangler dev` on :8787 and `vite` on :5173. A headless
  Chromium drove the real UI; nothing was simulated.
- Solo room, target 30 VP, auto-roll switched off, "Zahlen immer zeigen" on.
- About 60 rounds: Spring to Winter of year 1. I followed a simple strategy:
  city > village > road, 4:1 bank trade when stuck, and the draft pick that
  gives lasting production. For the last 25 rounds the hero was on "Erkunden"
  (auto-explore).

### Timeline (condensed)

| Round | What happened |
|---|---|
| Setup | Village on 5/6/5 and village on three 9s (all clay). The hero "Isenmund der Listige" appears. The map grows as I build. |
| 1-4 | "Niemand bekommt etwas" three times in a row. Then a 7 gives a **Fund**: three epic cards in a well-made draft screen. |
| 5-10 | Pilznager and Dornmarder camps start a feud. 2 raids leave. Day turns to evening and then night, and a **Goblin horde** of 4 and 2 slimes arrive. |
| 10-20 | My knight fights the goblins over several rounds and wins. Goblins still plunder cards and **burn a road**. The unit reaches level 1. |
| 20-35 | I have no wood source at all, so every road costs a 4:1 trade. Plundering keeps draining the hand ("dich: 1 Karte" toasts pile up). The Saegewerk card ("forests +1 wood") is useless without a forest. |
| 35-60 | Villages built, a city built. **A village burns down** after a raid. I end the year with 4 VP, a snowy night and a loot draft I had overlooked. |

### What felt good

- **The draft screen.** Three cards, rarity glow and "the other two are
  gone". The strongest moment of the session.
- **The world is alive.** Camps feud, celebrate, and send raids and hordes.
  Wanderers pass through, and night changes what is dangerous. A lot happens
  without me.
- **Presentation.** Pixel tiles, weather overlay, night lighting and the
  growing map feel like a real game, not a prototype.
- **Joining is easy.** Room code, public list and seat PIN all work.

### What hurt replayability (observed, not theorised)

| # | Observation | Why it matters for replay |
|---|---|---|
| P1 | No wood income for 60 rounds; the whole game was bank trading. | A bad opening cannot be fixed, so the run feels lost early. Players restart instead of playing on, and a restart feels the same. |
| P2 | Score went 6 -> 5 -> 4 because raids burned villages. The log shows what happened, but not what I could have done about it. | Losing progress without understanding the counterplay reads as randomness, not challenge. |
| P3 | 4/30 VP after a full year. | A 30 VP solo game is several hours long, and a game that long is rarely replayed. |
| P4 | The draft offers mostly resource bumps (23 of 32 cards). Choices between three economy cards are decided by "which resource do I lack". | Decisions are arithmetic, not identity. Two games with different picks feel alike. |
| P5 | Biomes ("Wald wird zu Taiga oder Dschungel") and seasons change only the look (see `biome.ts`, `season.ts`). | The most visible variety has no mechanical weight. |
| P6 | Cards that say "Nimm N **beliebige** Rohstoffe" actually give *random* resources (`reducer.ts`, around line 559). | Text that says "any" but means "random" breaks trust in card text. It is a quick fix: change the text to "zufaellige". |
| P7 | The loot draft ("Beute") waited as a small badge in the action bar for many rounds before I noticed it. | Rewards the player never notices do not motivate. |
| P8 | The game ends with one line, "X gewinnt!" (`Game.tsx`, around line 1110). | The moment that should say "play again" says nothing. |

---

## 2. What makes a game replayable

Five pillars. Each proposal below serves at least one of them.

| Pillar | Question | Where the game is today |
|---|---|---|
| **Variety** | Is this game's world and situation different? | Strong world generation, but the differences are mostly cosmetic |
| **Decisions** | Do I play *differently* this time? | Weak: no start identity, flat draft |
| **Mastery** | Can I get better and see that I did? | Weak: no score, no stats, no shared seeds |
| **Goals** | Why start another game today? | Missing: no challenges, no progression |
| **Social** | Is it better with others, and can I show others? | Basic: rooms only |

The architecture is an unusual asset here. The world, camps, ruins, witch
houses, weather and draft are all **pure functions of seed and turn**, and
the rules are **one pure reducer**. That makes daily challenges, replays,
bots, simulations and shareable seeds cheap to build. Most proposals below
lean on that.

---

## 3. Proposals

Effort: **S** is a few days, **M** is one to two weeks, **L** is more than
that. Files are starting points, not a complete list.

### A. Identity at the start: Houses (Decisions, Variety) - M

`lore.ts` already generates *Adelshaeuser* whose names survive their heroes.
Make the house a real choice.

- At setup, each player is **offered 3 of about 8 houses** as a draft, from
  the seed, using the same UI as the card draft.
- Each house has **one strength, one quirk and one unique thing**, never pure
  power:

| House (working title) | Strength | Quirk | Unique |
|---|---|---|---|
| Carthage (merchants) | 3:1 bank trade from the start; ports 2:1 for any resource | Knights cost +1 ore | *Kontor* building: converts 2 of one resource into 1 of another every round |
| Mountain clans | Mountains +1 ore; towers cost no clay | Villages cost +1 wheat | *Dwarf hold*: a capital form that sees through mountains |
| Forest folk | Forests +1 wood; roads in forests cost only wood | Cities cost +1 ore | *Palisades* are free in forests |
| Horse lords | Units move 3 fields; hero +1 move | No harbours | *Stables*: knights move with the hero for free |
| Witch covenant | Can make peace with goblins; slimes ignore you | Hero has 1 less life | Can *enter* the witch house and take the witch's power instead of fighting |
| Wanderer kin | Every wanderer offers 2 quests; quest loot is one rarity higher | Starts with one village fewer | Quests can be *stacked* (no limit of 3) |
| Farmers of the plain | Fields +1 wheat, ignore the rain penalty | Knights -1 attack | *Granary*: hand limit +6 |
| Night watch | Night sight is not reduced; hordes attack you last | Daytime raids pick you first | *Beacon* tower that lights hexes |

- Implementation: a house is just a set of **lasting effects**, the same
  type the cards use (`cards/types.ts`, `effects.ts`), plus at most one
  unique action. Production, costs and trade already ask the lasting
  effects, so most houses need no new rule code.
- For replay value: 8 houses times the start position times the Omens below
  give hundreds of meaningfully different openings.

### B. Run modifiers: Omens (Variety, Decisions) - S/M

> **Built** (`src/core/omen.ts`): 8 blessings and 6 curses, one of each per
> game, reroll or "no omens" in the lobby. Not yet: cost, weather and
> night-length omens, which would need the client to read omens in more places.

The fourth card type in DESIGN.md ("Regel" cards) was never built. Build it
as **Omens**: rule changes that apply to *the whole game*.

- Each game rolls **2 Omens** from the seed and shows them in the lobby:
  usually one blessing and one curse, sometimes two curses for a bonus score.
- Examples:
  - *Rich Veins*: mountains produce double, fields half.
  - *Long Night*: nights last 4 rounds instead of 2.
  - *Merchant Winds*: bank 3:1 for everyone, no player trading.
  - *Seven Blessings*: every 7 gives a Fund to every player.
  - *Restless Tribes*: hordes come every night, but camps drop double loot.
  - *Endless Winter*: winter lasts two seasons, and snow slows units.
  - *Scattered Ruins*: three times as many ruins, no wanderers.
  - *Iron Age*: cities cost 1 ore less, villages 1 wood more.
  - *Blood Moon*: the goblin horde attack on the first night is doubled.
  - *Golden Age*: every big round, the player with the fewest VP gets a
    card choice.
- Implementation: `GameState.omens: string[]`, chosen as a pure function of
  seed in `createGame`. Omens are lasting effects plus a few flags that
  `zeit.ts`, `season.ts`, `raiders.ts` and `army.ts` already have hooks for,
  for example `WETTER_WIRKUNG` and the weather weights.
- Lobby: the host can *reroll* or *pick* Omens (friends' games) or leave them
  locked (daily, ranked).

### C. A deeper draft: archetypes and synergy (Decisions, Mastery) - M/L

Today's catalogue has 32 cards: 23 resource, production, trade or
hand-limit bumps and 9 one-shot combat tactics. Grow it to 90-120 cards organised
around **archetypes**, so that picks build a strategy:

| Archetype | Plays like | Example cards |
|---|---|---|
| Trade (Carthage) | Ports, bank, player trade | *Harbour Master*: each port you own gives +1 VP at 3 ports. *Silk Road*: every trade draws a card. |
| War | Knights, archers, camps | *Veterans*: level-ups heal. *Trophy Hall*: +1 VP per 3 camps destroyed. |
| Exploration | Hero, ruins, map growth | *Cartographer*: +1 VP per 10 fields revealed. *Lost Map*: the next ruin always gives a map. |
| Builder | Roads, villages, capitals | *Guild of Masons*: capitals cost 1 less. *Surveyor*: roads on ash are free. |
| Faith / night | Night, witch, weather | *Moon Priest*: nights give +1 of any resource. *Rain Dance*: choose the weather once per season. |

- **Scaling and tags.** Cards that count other cards ("+1 per trade card")
  create builds. This is the single mechanic that most increases draft
  replayability in roguelikes (Slay the Spire, Balatro).
- **Rule cards**, rare and individually tested (DESIGN.md's own rule): "the
  6 also counts as 8", "your 2 and 12 produce triple".
- **Cursed and trade-off cards** like *Karge Jahre*, which the design
  already loves: make about 15% of the pool "strong with a catch".
- **Market** (DESIGN.md step 7, not built): each big round, buy from 3 cards
  for resources. This gives spare resources a use and brings back the
  missing *choice* on "beliebige" cards.
- **Uniques and sets:** owning 3 cards of an archetype unlocks a set bonus
  card. The "owned uniques" list already exists in `draftOptions`.
- **Archetype weighting:** the draft slightly favours archetypes you already
  hold, so builds can form without being forced.

### D. Win conditions and game length (Goals, Mastery) - M

A 30 VP solo game is too long to replay. Offer **shaped** games:

| Mode | Ends | Scored by |
|---|---|---|
| **Skirmish** | 10 VP or 40 rounds | VP, then round reached |
| **One Year** | after round 60 (Spring to Winter) | score = VP x 10 + fame + camps + fields revealed |
| **Classic** | 30 / 60 VP | first to target (today's mode) |
| **Endless** | never | sandbox (today's "unendlich") |
| **Scenario** | scenario objective | stars (see G) |

And **alternative victories** inside Classic, so strategies diverge:

- **Conquest**: destroy 8 camps, or the witch plus 4 camps.
- **Exploration**: discover 3 landmarks, or reach a field 20 hexes from the
  origin.
- **Wonder**: finish a world wonder (IDEEN.md section 4 already lists
  Tenochtitlan, Akropolis and Kothon).
- **Merchant**: trade volume of 100 cards and 3 ports.

Fixed-length modes matter most. They make scores comparable, and
comparability is what makes leaderboards, daily challenges and "I can beat
that" possible.

### E. The end of a game: the Chronicle (Mastery, Social) - S/M

> **Built** (`src/core/chronik.ts`, `src/client/ui/Chronik.tsx`): ranking with
> score, points-over-time chart, key moments, per-player numbers, omens and
> "Diese Welt nochmal". Not yet: the generated saga paragraph and a share link.

Replace "X gewinnt!" with a **chronicle screen**:

- VP over time for each player, as a line chart from the log.
- **Key moments**, drawn from existing log events: first city, largest
  horde survived, villages lost, best draft pick, hero deaths and successors.
- Stats: resources produced by type, trades, camps destroyed, fields
  revealed, quests done.
- Seed, Omens and house, with a button for **"Play this world again"** and
  a **share link** (`?seed=...&omens=...`).
- A short generated **saga paragraph**, using lore names already in the
  game: "In the winter of year 2, Isenmund the Cunning fell before the
  Pilznager. His daughter Isenmara took up the banner of House
  Sturmfels..."

This costs little and is the moment that decides whether a second game
starts.

### F. Daily Expedition and leaderboards (Goals, Social) - M

> **Built** (`src/core/tages.ts`, `src/worker/bestenliste.ts`): one world per
> UTC day, one blessing and two curses, 60 rounds solo, best score per name.
> Instead of an env secret, the day's secret seed is rolled once and kept in
> that day's leaderboard object. Not yet: the weekly variant; "one attempt
> counts" needs accounts.

The world is already a pure function of `worldSeed`. Derive **both seeds
from the date**, and everyone plays the same world with the same Omens:

- **Daily**: One Year mode, fixed house and Omens, one attempt counts. A
  leaderboard lives in a new `Leaderboard` Durable Object, next to the
  existing `Verzeichnis`.
- **Weekly**: a harder Chronicle level (see H) and unlimited attempts; the
  best score counts.
- **Technical requirement.** Dice, combat and lore currently share **one
  RNG stream** (`s.rngState`, `reducer.ts` and `army.ts`). Two players on
  the same seed will get different dice as soon as one of them fights a
  battle. For a fair daily run, derive dice per turn as the draft already
  does: `roll = f(hash(secretSeed, turn, SALT_DICE))`. Combat can keep its
  own stream. The secret seed stays on the server, so dice remain
  unpredictable. This change is small and also useful on its own.
- Anti-cheat comes for free: the server is authoritative, so the score is
  whatever the reducer computed.

### G. Scenarios and a campaign (Goals, Variety) - M/L

Hand-written objectives on generated maps, 20-60 rounds each, rated with
1-3 stars:

- *Founding of Carthage*: reach 3 ports and 6 VP before round 30.
- *The Long Winter*: survive 30 rounds of Endless Winter without losing a
  village.
- *Goblin Siege*: a horde every night; hold your capital until spring.
- *Race to the Witch*: find and defeat the witch before the rival AI
  house does.
- *The Wanderer's Road*: complete 5 quests of 5 different kinds.

Stars unlock houses, card pools and capital forms (see H). A scenario is
data: start conditions, Omens, objective and time limit. It needs no new
engine.

### H. Progression between games (Goals) - M/L

Keep it **horizontal**: more options, not more power. Multiplayer stays
fair.

- **Chronicle levels (difficulty ladder).** After a win, unlock level +1.
  Each level adds a permanent curse: stronger hordes, fewer card choices,
  shorter nights for scouting, and so on. This is the core solo replay loop
  of modern roguelikes (Slay the Spire's Ascension, Hades' Heat).
- **Unlocks:** houses (start with 3), about a third of the card pool, and
  capital forms and biome variants (IDEEN.md section 4 has dozens of
  designs waiting).
- **Dynasty:** `lore.ts` already models successors who keep stem, house
  and title. Carry this across games. Your house's hall of fame lists past
  heroes, their deeds and one **heirloom** (a cosmetic banner or a starting
  relic in solo only).
- **Achievements**, about 50: "Win without building a city", "Befriend
  every bandit faction in one game", "Kill the witch with the hero alone",
  "Never lose a village in a year". They double as tutorials for systems
  players do not discover.
- **Requires light accounts:** a device ID plus a name, with an optional
  cross-device code as proposed in IDEEN.md section 1. Storage can be a
  per-player Durable Object or D1.

### I. Online play (Social) - L

- **AI opponents (bots).** The reducer is pure and the client already runs
  the rules read-only, so a bot is "pick an action from the legal ones"
  with a heuristic. Uses:
  - rival houses in solo play (the solo game currently has no competition)
  - filling empty seats in public rooms
  - **balance simulation**: thousands of headless games to find dominant
    cards, houses and Omens. IDEEN.md section 3.9 asks for exactly this.
- **Co-op against the horde.** The factions are already the natural enemy.
  2-4 players share the goal of "survive N nights" or "destroy every camp in
  a radius", with escalating hordes. Co-op is the most replayable
  multiplayer mode for friends and needs almost no new rules.
- **Async turns.** Long games suit play-by-notification: a push or email on
  your turn, turn timers of hours, and "Deine Partien" on the home page
  (IDEEN.md section 1).
- **Parallel race.** Everyone plays the **same seed in separate rooms**, and
  the results are compared at round 60. No waiting on others, but still
  competitive. This works well for 5-6 players, where today's
  one-roll-per-player turn order gets slow.
- **Replays and spectating.** Seeds plus the ordered action list give a
  full deterministic replay. Store actions in the Durable Object and add a
  replay viewer. Great for sharing ("watch how I survived the Blood Moon").
- **Ranked seasons**, later, on top of One Year mode and bots.

### J. World variety with teeth (Variety) - M

- **Biome rules:** jungle produces more but has disease events; desert
  wheat fails in summer; taiga forests produce in winter; swamps slow
  units. `biome.ts` already computes warmth and moisture, so let `production`
  read them.
- **Season rules:** `season.ts` says "Noch aendern die Jahreszeiten nur das
  Aussehen". Add harvest in autumn (fields +1), winter scarcity (no wheat)
  and spring floods.
- **World presets:** *Archipelago* (much water, ports matter), *Highlands*,
  *Great River*, *Frontier* (dense camps), *Peaceful* (few camps). Each is a
  parameter set for `worldgen.ts` noise and region densities.
- **Landmarks and wonders:** rare, seed-placed sites (a volcano, a sunken
  city, a dragon hoard) with a unique effect for whoever claims them first.
  They give races on the map.
- **Faction personalities:** each bandit or goblin faction rolls a trait
  (greedy, zealous, cowardly, mercantile) that changes how raids, peace and
  tribute behave, plus a named chief with a grudge memory.

### K. Events with choices (Decisions, Variety) - M

- A **seasonal event** each big round: 2-3 options with trade-offs, shown
  in the same card UI. Examples: "Refugees at the gate: take them in (+1
  village slot, -2 wheat per round for 5 rounds) or send them away (they
  join the Dornmarder)".
- **Wanderer encounters as choices**, not only quests. DESIGN.md already
  proposes this ("Begegnungen wie Karten").
- **Hero encounters:** a sword in a stone, a riddle or a merchant. Each is
  a one-shot choice card, reusing the Beute pipeline.

Events are cheap content with a high replay yield, because each is written
once and combined randomly forever.

### L. Fixes that are prerequisites (from the play test) - S

Replayability features are pointless if the first game frustrates. These
come first:

1. **Starvation safety net (P1).** When a player has had no production of a
   resource for N rounds, offer a 3:1 trade for it, or let the first Fund
   guarantee a card for the missing resource. Also: in setup, highlight
   whether the two chosen spots cover all 5 resources.
2. **Loss is explained (P2).** When a village burns, one line says what
   would have prevented it: "A watchtower or a knight next to it would have
   stopped the fire." Offer a discounted rebuild on the ash, as roads
   already get.
3. **Card text honesty (P6).** "beliebige" should be "zufaellige", or bring
   back a choice through the Market.
4. **Pending rewards are loud (P7).** Unopened loot pulses and is listed in
   an inbox (IDEEN.md section 3.6).
5. **Pacing (P3).** Default solo to One Year or Skirmish, and keep 30 VP for
   multiplayer.
6. **Progressive onboarding (IDEEN.md section 3.2).** The first game
   introduces systems one by one; later games start with everything. This is
   also a replay hook, because the second game feels bigger than the first.

---

## 4. How this fits the architecture

| Proposal | Where it lives | New state |
|---|---|---|
| Houses, Omens, rule cards | `cards/types.ts` lasting effects, `effects.ts`; `createGame` | `house` per player, `omens: string[]` |
| Archetypes, market | `cards/catalog.ts`, `draft.ts` (weighting), new `markt` source already in `QUELLE_ZU_ZAHL` | none (the draft is pure) |
| Game modes, victories | `reducer.ts` end-of-turn check | `mode`, `roundLimit` |
| Chronicle screen | client only, from log plus state; per-turn VP snapshots | `history: {turn, vp[]}[]` (small) |
| Daily Expedition | seed from date in `room.ts`; new `Leaderboard` DO | per-turn dice derivation instead of shared stream |
| Chronicle levels, unlocks, dynasty | new player-profile DO or D1 | profile outside the game |
| Bots | `src/core/bot/` using `applyAction` and placement helpers | none |
| Replays | `room.ts` stores the action list | `actions[]` per room |
| Biome and season rules | `production.ts` reading `biome.ts` / `season.ts` | none (pure) |
| Events | same pipeline as `loot`/draft | `pendingEvent` |

Almost everything is either pure data (cards, houses, Omens, scenarios,
events) or a pure function of seed and turn. That is exactly what the
project's core principle ("rein wie Gelaende") is good at.

---

## 5. Roadmap

**Phase 0: give a game a shape (1-2 weeks)**
- Fixes L1-L5.
- One Year and Skirmish modes (D).
- Chronicle end screen with seed and "play this world again" (E).
- Per-turn dice derivation (F, technical part).

**Phase 1: every game is different (3-5 weeks)**
- Omens: 20 to start (B).
- Houses: 4 to start, 8 later (A).
- 30 new cards in 3 archetypes, rule cards, the Market (C).
- Biome and season rules (J, first half).

**Phase 2: reasons to come back (3-4 weeks)**
- Light accounts ("Deine Partien", device code).
- Daily and weekly Expedition with leaderboard (F).
- Chronicle levels 1-10 (H).
- 30 achievements (H).

**Phase 3: online depth (4-8 weeks)**
- Heuristic bots, then balance simulation runs (I).
- Co-op against the horde (I).
- Async turns with notifications, and the parallel race (I).
- Replays (I).

**Phase 4: content cadence (ongoing)**
- Scenarios and campaign (G), events (K), landmarks and wonders (J),
  dynasty (H).
- Seasonal drops aligned with real-world seasons: a new house, 10 cards,
  5 Omens and an event chain.

---

## 6. How to know it works

Measure replayability; do not guess it:

- **Games started per player per week**, and the share of players with a
  second game within 48 hours.
- **Completion rate** of started games, by mode.
- **Draft pick entropy.** If one card is picked 80% of the time when
  offered, it is a trap or a must-pick. Rebalance it.
- **Win-rate spread** by house and Omen, from bot simulation first and real
  games later. Aim for 45-55% relative performance.
- **Daily participation** and repeat participation over 7 days.

Simple event logging in the room Durable Object (game start, draft pick,
game end with mode and score) is enough to begin.
