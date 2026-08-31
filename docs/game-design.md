# Xuhuan V4 game design

## Player fantasy

The stream is over, but the aftershow group never disconnected. The player is its last viewer and helps seven fictional digital performers rescue unfinished moments before an automatic archive replaces them with perfect highlights.

V4 is a focused one-thumb shooter, not a large mobile action RPG. Depth comes from route reading, close dodges, support-note collection, build order, companion timing, and one charged character special. It intentionally avoids a second stick, inventory grid, shop currency, energy system, or paid progression.

## First minute

1. A single message reads, “The stream ended. Current viewers: 1.”
2. The player taps **Stay online**.
3. Nana enters a 30-second tutorial wave.
4. A finger press in the lower half of the arena captures input; horizontal finger position directly controls the character's X position.
5. Automatic straight-up shots demonstrate firing. A friendly support note demonstrates collection. The special button lights once and pauses its charge ring when pressed.
6. The first weapon choice appears after the wave.

There is no character, route, difficulty, or equipment choice before first movement.

## Core controls

The player remains near the bottom of a `360 x 640` portrait arena.

- **Move:** hold and move a finger horizontally. The character maps directly to that X column on the next Tick. Vertical finger movement is ignored; there is no catch-up step.
- **Stop:** lift the finger. No velocity or inertia survives the next Tick.
- **Fire:** automatic and straight upward. Positioning under a target is part of play; there is no nearest-target aim assist.
- **Special:** tap the one charged button. The action depends on the selected character.

Pointer Capture and `touch-action: none` apply only to the arena. The Telegram host adapter disables vertical WebView swipes only during combat and restores them on every exit, blur, or unmount path.

## The 35-to-45-second wave loop

Every normal segment is fixed-duration survival. Killing enemies creates room and score, while the screen presents one progress strip: survive until the aftershow connection stabilizes.

During a wave, the player balances three readable goals:

1. dodge telegraphed bullets and charged lanes;
2. move through friendly cyan, pink, and gold support notes to extend a combo and charge the special; and
3. spend the special on a dangerous overlap, a boss opening, or a pickup route.

Enemies appear in authored formations. A dangerous attack always shows a line, lane, fan edge, or charge warning before it can damage the player. The runtime permits at most 14 enemies, 120 hostile projectiles, 48 friendly projectiles, 12 pickups, and 24 visual effects.

The player has three hearts. Damage removes one heart and grants a short invulnerable window. A completed wave cannot be invalidated by waiting enemies; surviving its fixed duration is sufficient.

## Staged build decisions

Every chapter contains three normal segments followed by a boss. The reward after each segment has a different purpose:

| Segment | Reward stage | Decision |
| ---: | --- | --- |
| 1 | `weapon` | Choose the main firing shape for this chapter attempt. |
| 2 | `companion` | Choose one guest performer to provide a triggered assist for this attempt. |
| 3 | `rescue` | Choose a guard or recovery effect before the boss. |

This sequence teaches one system at a time and prevents three cards with tiny numeric differences from appearing together. V4 has 12 shared, one-level show effects. Each behavior changes a visible rule: twin shot, pierce, spread, stronger graze charge, special guard, pickup magnet, echo volley, boss break, last-heart power, longer combo, faster companion assist, or recovery drops.

There is no upgrade level, duplicate stacking, reroll currency, shop, or six-slot inventory. A chapter attempt is short enough that three meaningful choices are sufficient.

## Characters and companions

| Character | Special | Combat identity |
| --- | --- | --- |
| Nana | Route Break | Opens a safe lane through dense patterns. |
| Jiaran (Diana) | Cheer Check | Converts pressure into a guard and friendly pulse. |
| Xiangwan (Ava) | Second Take | Replays the most recent attack line. |
| Bella | Take Five | Parries nearby bullets and counters. |
| Lulu | Caption Flip | Converts hostile shots into friendly glitches. |
| Xingtong | Prism Call | Focuses a piercing beam through one lane. |
| Nailu | Memory Bloom | Creates a damaging temporary safe garden. |

Clearing each character chapter unlocks that performer as a companion. Companion assists are event-driven and automatic, so they add relationship and build texture without adding another button. Triggers include a wave clear, low health, special use, graze streak, pickup chain, boss stage change, and segment start.

## Enemy language

Six visual chassis combine one movement rule, one attack rule, and optional traits:

| Chassis | Movement | Primary attack | Readable twist |
| --- | --- | --- | --- |
| Spam Bot | drift | aimed shot | Simple positioning check. |
| Clip Cutter | dive | lane shot | Splits after destruction. |
| Caption Blob | sweep | fan | Leaves a delayed echo. |
| Black-Screen Ghost | mirror | delayed shot | Briefly jams presentation. |
| Gift Thief | orbit | ring | Steals unattended support notes. |
| Censor Frame | anchor | beam | Links and protects nearby enemies. |

Waves compose these roles rather than introducing a new rule every ten seconds. A pincer of Clip Cutters asks for timing; a Censor Frame plus drifting Spam Bots asks for target priority; a Gift Thief changes the safest support-note route.

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
| 7 | The Laplace Florist Never Existed | Nailu | A thanks-for-the-flowers photo exists before the flowers and stream; the archive is generating a future event. | Reality Auditor |
| 8 | Zero Channel | Player choice | An anniversary stream looks normal, but all seven performers say, “not us.” | Auto-Archive System |

Chapters unlock linearly and may be replayed. Every chapter contains:

- a prelude of at most three short group-chat bubbles;
- three fixed-duration waves and staged build choices;
- one concrete two-option intermission after the second wave;
- a three-stage boss;
- a short epilogue; and
- a replay recap that acknowledges the chapter is already known.

The intermission stores an explicit selected option ID and durable tag. It never adds invisible morality or personality points. Replaying a chapter appends a new choice revision; the latest revision changes the current story projection without erasing history.

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
