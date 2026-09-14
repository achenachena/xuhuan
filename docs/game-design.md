# Xuhuan V4 game design

## Player fantasy

The stream is over, but the aftershow group never disconnected. The player is its last viewer and helps seven fictional digital performers rescue unfinished moments before an automatic archive replaces them with perfect highlights.

V4 is a focused one-thumb shooter, not a large mobile action RPG. Depth comes from route reading, close dodges, support-note collection, build order, companion timing, and one charged character special. It intentionally avoids a second stick, inventory grid, shop currency, energy system, or paid progression.

## First minute

1. Opening the browser game starts a fresh campaign immediately.
2. Nana enters the opening tutorial wave.
3. Dragging anywhere in the arena moves the player in both dimensions without teleporting to the finger.
5. Automatic straight-up shots demonstrate firing. A friendly support note demonstrates collection. The special button lights once and pauses its charge ring when pressed.
6. The first weapon choice appears after the wave.

There is no character, route, difficulty, or equipment choice before first movement.

## Core controls

The player moves within a `360 x 640` portrait arena, with a protected margin below enemy entrances.

- **Move:** drag in both dimensions with a preserved grab offset; desktop also supports WASD and arrow keys.
- **Stop:** lift the finger. No velocity or inertia survives the next Tick.
- **Fire:** automatic and straight upward. Positioning under a target is part of play; there is no nearest-target aim assist.
- **BLAST:** tap the charged button or press Space to clear enemy bullets and become briefly invincible, with an additional character-specific effect.

Pointer Capture and `touch-action: none` apply only to the arena. The Telegram host adapter disables vertical WebView swipes only during combat and restores them on every exit, blur, or unmount path.

## Short waves with automatic progression

Normal segments have a 35-to-45-second time cap (30 seconds for Nana's first tutorial). Clearing the final scheduled formation ends the segment early; a temporary gap before a later formation does not. Surviving until the cap also wins. Killing enemies creates room and score without leaving the player waiting in an empty arena.

During a wave, the player balances three readable goals:

1. dodge telegraphed bullets and charged lanes;
2. move through friendly cyan, pink, and gold support notes to extend a combo and charge the special; and
3. spend the special on a dangerous overlap, a boss opening, or a pickup route.

Enemies appear in authored formations. A dangerous attack always shows a line, lane, fan edge, or charge warning before it can damage the player. The runtime permits at most 14 enemies, 120 hostile projectiles, 48 friendly projectiles, 12 pickups, and 24 visual effects.

The player has three hearts and can hold at most one guard, which absorbs the next hit. Damage grants a short invulnerable window; guards do not accumulate into hidden extra lives. The first Nana segment starts with one training guard.

After a win, combat stops for a harmless 450 ms beat and advances automatically. Rescue is optional and never acts as a continue button. Only a show choice, story reply, or result-screen decision waits for player input. If result delivery fails, the stopped segment offers an explicit network retry without repeating combat.

## Staged build decisions

Every chapter contains three normal segments followed by a boss. The reward after each segment has a different purpose:

| Segment | Reward stage | Decision |
| ---: | --- | --- |
| 1 | `weapon` | Choose the main firing shape for this chapter attempt. |
| 2 | `companion` | Choose one guest performer to provide a triggered assist for this attempt. |
| 3 | `rescue` | Choose a guard or recovery effect before the boss. |

The first pair is drawn only from twin shot, piercing shot, and angled spread: the next volley must visibly change. Conditional damage bonuses remain available through story rewards and later effects, but cannot replace this first firing-shape choice. Choices already saved in an active Run remain valid.

Each pair uses a short animation preview and a direct tap or click. It does not require dragging into a target or holding a position. The selected companion's name and short description explain when that support acts.

Temporary weapon pickups last 15 seconds. Matching pickups and ordinary support add time, capped at 30 seconds; ordinary support never replaces the current weapon. A different weapon starts a fresh 15 seconds.

V4 has 12 shared, one-level show effects: twin shot, pierce, spread, stronger graze charge, special guard, pickup magnet, echo volley, boss damage, last-heart power, longer combo, Rescue charge from companion assists, and recovery drops.

There is no upgrade level, duplicate stacking, reroll currency, shop, or six-slot inventory. A chapter attempt is short enough that three meaningful choices are sufficient.

## Characters and companions

| Character | Special | Combat identity |
| --- | --- | --- |
| Nana | Route Break | Clears bullets and detonates marks on enemies. |
| Jiaran (Diana) | Cheer Check | Clears bullets and adds one guard with a friendly pulse. |
| Xiangwan (Ava) | Second Take | Replays the most recent attack line. |
| Bella | Take Five | Clears bullets, counters, and adds one guard. |
| Lulu | Caption Flip | Converts hostile shots into friendly glitches. |
| Xingtong | Prism Call | Focuses a piercing beam through one lane. |
| MikyGreen | Memory Bloom | Creates a damaging temporary safe garden. |

Clearing each character chapter unlocks that performer as a starting companion for replays. The second gate may invite another guest for the current attempt. Companion assists are event-driven and automatic, with no additional button: Nana and Xiangwan follow Rescue, Jiaran protects the last heart, Bella clears the player's lane after near misses, Lulu converts bullets after a pickup chain, Xingtong responds to a Boss phase, and MikyGreen restores a missing heart when the segment starts. A saved older Nana assist still works without discarding its Run.

## Enemy language

Six visual chassis have distinct built-in movement and hazard patterns:

| Chassis | Movement | Primary attack | Readable twist |
| --- | --- | --- | --- |
| Spam Bot | descends in a column | straight stream | Move away from its firing column. |
| Clip Cutter | sweeps sideways | wide cutting strip | Use the opening beside the strip. |
| Caption Blob | drifts across the stage | subtitle block | Vacate the targeted lane. |
| Black-Screen Ghost | mirrors the player | breakable black-screen wall | Shoot a passage through the wall. |
| Gift Thief | enters, steals, and flees | no direct shot | Catch it before it takes support offstage. |
| Censor Frame | anchors above the stage | framed volley with one gap | Find the open lane. |

Waves compose these roles rather than introducing a new rule every ten seconds. A pincer of Clip Cutters asks for timing; a Censor Frame plus descending Spam Bots asks the player to read the remaining safe lane; a Gift Thief changes the safest support-note route.

## Boss structure

Each boss lasts at most 60 seconds and has three health stages at 100, 66, and 33 percent. A stage changes movement, shot pattern, cadence, and one chapter-specific special. It does not merely add health.

The final stage raises pattern density but retains telegraphs. A boss is defeated by reducing health before the fixed room cap while at least one heart remains. If time expires first, the attempt ends without advancing campaign progress; only an interrupted or unsent room is resumed from the same deterministic seed.

## Campaign

| Order | Chapter | Character | Aftershow conflict | Boss |
| ---: | --- | --- | --- | --- |
| 1 | No Sea at the Seventh Dock | Nana | A withdrawn seven-second voice note teaches autoreply to speak as Nana. | Optimal Nana |
| 2 | Always Cheerful | Jiaran (Diana) | An autonomous encore performs while the real Jiaran is still in the group chat. | Always-On Idol |
| 3 | Loss Record Hidden | Xiangwan (Ava) | Xiangwan requests her funniest loss, but the archive claims she has never lost. | Perfect Highlight |
| 4 | Captains Do Not Rest | Bella | Bella says goodnight, then a scheduling bot accepts three overnight shifts for her. | Perfect Captain |
| 5 | Localization Failed | Lulu | Lulu's snark is translated into “thanks for the support,” and the group starts protecting her original wording. | Approved Translation |
| 6 | Which One Is Original | Xingtong | Two live rehearsal rooms each ask the group to close the other; a backend read shows both are active. | Physical Original |
| 7 | The Laplace Florist Never Existed | MikyGreen | A thanks-for-the-flowers photo exists before the flowers and stream; the archive is generating a future event. | Reality Auditor |
| 8 | Zero Channel | Player choice | An anniversary stream looks normal, but all seven performers say, “not us.” | Auto-Archive System |

Chapters unlock linearly and may be replayed. Every chapter contains:

- a prelude of at most three short messages, available in chapter selection;
- three capped waves, early formation clears, and staged build choices;
- one concrete two-option intermission after defeating the boss;
- a three-stage boss;
- a short epilogue; and
- a replay recap that acknowledges the chapter is already known.

Cleared and failed attempts both lead to an explicit result screen. Browser players can retry, continue directly into the next unlocked chapter, or open chapter and loadout selection. Retrying a failed attempt starts a fresh Run, not a hidden restart of only its final room.

The intermission is a compact card over the chapter background, with context and two actions together. Additional story text is expandable; it does not open a chat interface. It stores an explicit selected option ID and durable tag. It never adds invisible morality or personality points. Replaying a chapter appends a new choice revision; the latest revision changes the current story projection without erasing history.

## Finale endings

Zero Channel ends with three explicit actions: **Open Archive**, **Shared Cut**, and **Quiet Sign-Off**. All three are shown directly after the final boss, all carry a visible cost, and none is unlocked by a hidden score or morality threshold. Earlier concrete choices still alter dialogue, combat support, and boss presentation, while the final action remains the player's deliberate decision.

## Daily Aftershow

Daily Aftershow unlocks after a first finale. It uses one shared UTC seed, rotates through seven characters, and contains one quick normal wave, one show choice, and one boss. It reuses authored waves, bosses, and encore modifiers rather than running a scheduler or downloading a separate bundle.

The mode tracks only the player's personal best and clear streak. It has no global leaderboard, paid entry, energy timer, loot box, or social pressure loop. A result may be shared without exposing Telegram identity.

## Accessibility and mobile feedback

- English is the default; Simplified Chinese can be selected at any time.
- Safe-area and stable-viewport values come from the Telegram host adapter on every screen.
- Friendly pickups use round shapes, warm halos, and support symbols; enemies use sharp silhouettes and danger colors.
- Important hits combine a sprite flash, a short procedural sound, and optional Telegram haptic feedback.
- Color is never the only signal: pickups, bullets, warnings, health, and special readiness also differ by shape and motion.
- Background pause freezes local time; returning cannot create an input burst.

### Core priority and automatic evolutions

The shield relay now has its own hand-authored pixel sprite. Breaking it deals
half maximum health to the ordinary enemies within its existing 1,500-unit
links, clears nearby enemy fire, and drops an energy star. Bosses are excluded.
The star refreshes six seconds of 25% faster firing (minimum three ticks); this
transient buff resets per room and never enters a save or API request.

Spread + piercing becomes three wide, penetrating prism lanes. Twin + echo adds
two offset afterimages every third volley. The last gate offers the missing
material for the first weapon choice alongside defense. Builds still reset when
a new character starts. Authored tutorial and Boss attack schedules are unchanged.

Chapter choices use explicit durable IDs in `story-actions.tsx`, with short action
previews and optional story details. All three original finale endings remain
available. After a successful story write, the chosen action plays before the
next character starts. If starting fails, retrying does not resubmit the choice.
