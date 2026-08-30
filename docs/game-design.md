# Xuhuan V3 game design

## Player fantasy

The player is the last viewer still online after a stream ends. An impossible backstage channel remains open, and seven digital personas ask the player to help recover the parts of themselves that the Retention Protocol classified as inconsistent, inefficient, or difficult to market.

The design combines two forms of agency:

- **Embodied agency:** move, graze, weave signals, Warp through danger, and assemble a run build.
- **Relational agency:** answer messages and events that change Trust, Authenticity, and Retention across the campaign.

Combat should feel immediate enough for a one-thumb Telegram session, while durable outcomes remain legible, deterministic, and recoverable after a mobile interruption.

## Campaign structure

The campaign is linear at the chapter level and branching inside each Run.

| Order | Chapter | Character | Central conflict |
| ---: | --- | --- | --- |
| 1 | No Sea at the Seventh Dock | Nana7mi | recovering memories that were never clipped |
| 2 | Always Cheerful | Diana | owning sadness and silence instead of performing constant cheer |
| 3 | Loss Record Hidden | Ava | remaining visible when failure is removed from the highlight loop |
| 4 | Captains Do Not Rest | Bella | rejecting a leadership model that omits exhaustion |
| 5 | Localization Failed | Lulu | preserving voice and tone through endless correction |
| 6 | Which One Is Original | Xingtong | claiming reality without a required physical original |
| 7 | The Laplace Florist Never Existed | Nailu | allowing invented memories to carry real meaning |
| 8 | Zero Channel | Ensemble finale | confronting the Retention Protocol and resolving the campaign metrics |

A new player first answers the one-option prologue and enters Nana's tutorial directly. Clearing a character chapter records its best score and clear count, unlocks its next Noise level, advances the campaign, and unlocks the next character. The seven chapter clears lead to the ensemble finale.

Authored scenes and event options add signed deltas to three persistent metrics:

- **Trust** records how consistently the player treats the characters as participants rather than content.
- **Authenticity** favors contradiction, self-definition, and release from optimization.
- **Retention** favors preservation, continuity, and the system's safer framing.

After Zero Channel, Authenticity at least three points above Retention selects the authentic ending. Retention at least three points above Authenticity selects the retained ending. All other totals select the balanced ending. Trust remains visible campaign context but is not a hidden tie-breaker.

## Action controls and simulation

The action arena uses a 360 by 640 logical portrait space at a deterministic 30 Ticks per second. Rendering may interpolate at display rate, but replay advances only fixed Ticks.

- Dragging anywhere in the arena supplies one of 16 directions and a quantized magnitude for the next simulation Tick only. A stationary or released pointer produces no movement on the following Tick.
- Automatic attacks select the nearest live enemy.
- Tapping the arena activates Warp toward the tapped point. Warp moves 62 logical units, grants 12 invulnerable Ticks, damages enemies along the path, and clears projectiles near that path.
- The browser records direction, magnitude, and Warp state into `rle8-v1`; the server replays the same inputs and alone determines the authoritative result.

The player never reports their own damage, position, kills, objective completion, score, or rewards. A room ends only when authoritative replay satisfies its objective, defeats its boss, exhausts the hard Tick limit, or reduces health to zero.

## Signal weaving and protocols

Each arena contains three signal positions: Surge, Guard, and Echo. Touching a signal:

- adds its type to the current three-signal weave;
- clears nearby hostile projectiles;
- damages nearby enemies;
- advances a `recover` objective when applicable; and
- starts a short cooldown before that position can be collected again.

The player may repeat a signal. When the third signal is collected, Warp refreshes immediately and becomes protocol-ready.

| Three-signal composition | Protocol | Result when the empowered Warp is used |
| --- | --- | --- |
| two or three Surge | Surge Break | a wider, higher-damage path |
| two or three Guard | Guard Aegis | shield, full hostile-bullet clear, and longer invulnerability |
| two or three Echo | Echo Replay | a second damage pattern along the path |
| one Surge, one Guard, one Echo | Resonance | the current character's signature kit effect |

Using the empowered Warp consumes the weave. This creates a short planning loop: choose signals while dodging, decide whether a focused protocol or Resonance fits the room, then aim the spend.

## Seven kits

Every character has authored base health, attack, attack interval, movement speed, Warp cooldown, and Warp damage. Each kit also has a passive and a Resonance behavior.

| Character | Kit identity | Resonance emphasis |
| --- | --- | --- |
| Nana7mi | Route Chain | global damage through a completed route |
| Diana | Cheer Pulse | shield plus area damage |
| Ava | Afterimage | aggressive area damage |
| Bella | Perfect Warp | large shield and extended invulnerability |
| Lulu | Convert Projectiles | clears bullets, converts them to score, and damages enemies |
| Xingtong | Signal Stance | varied area damage across the enemy list |
| Nailu | Memory Bloom | healing plus area damage |

Character-specific modules and plugins reinforce these identities without changing the shared input language or trust model.

## Distortion risk and recovery

A hostile projectile that passes within the graze radius without hitting raises Distortion once. Noise and authored effects can increase the gain.

- Below 60, Distortion is latent pressure.
- At 60 or higher, automatic attacks gain at least a 25 percent overclock bonus.
- At 100, the player takes 12 damage, hostile bullets clear, and Distortion falls to 40 plus five per Noise level.
- After two seconds without a graze, Distortion begins to decay. Higher Noise slows that decay.

The first eligible account-wide death can trigger Emergency Reconnect: health returns to 40 percent, bullets clear, and the player receives 45 invulnerable Ticks. The progression flag is consumed when the authoritative room result commits, so refreshes cannot duplicate it.

## Enemies, attacks, and objectives

V3 contains 36 enemies: 21 normal, 7 elite, and 8 bosses. Enemies compose a movement rule, one or more attacks, and optional traits.

- Movement: chase, orbit, strafe, charge, flee, stationary, or wander.
- Attacks: aimed, fan, ring, spiral, delayed echo, mine, or beam.
- Traits: linked shields, signal theft, death splitting, armor, Distortion aura, or teleport.

Attacks expose an intent window before they fire. Noise shortens that window and attack interval. Boss health produces three deterministic phases: an opening pattern, a mid-health pattern that can react to the player's build, and a final radial-pressure phase.

The 47 authored encounters have this exact objective mix:

| Objective | Count | Completion rule |
| --- | ---: | --- |
| Purge | 8 | reach the kill target |
| Stabilize | 9 | hold the arena center for the required Ticks |
| Recover | 8 | collect the required signals |
| Holdout | 6 | survive to the target Tick |
| Elite | 8 | defeat the elite target set |
| Boss | 8 | defeat the boss before the hard cap |

One of those encounters is Nana's tutorial; the remaining kind distribution is 30 normal, 8 elite, and 8 boss encounters. Encounters may also apply narrow-arena, Distortion-rain, signal-decay, or crossfire hazards.

## Campaign Run flow

The server generates the complete route from the Run seed before play:

```text
combat choice
  -> event or combat
      -> elite or rest
          -> midpoint story event
              -> combat choice
                  -> boss
```

Selecting one node permanently locks alternatives in that layer. The Seventh Dock route prepends its tutorial encounter. Noise 2 narrows connections between the first two layers; Noise 3 replaces the rest option with another elite.

After a cleared non-boss encounter, the player receives up to three module choices. The first choice is biased toward the encounter's Surge, Guard, Echo, or Glitch reward identity when possible. Every Run begins with one reroll. A module occupies one of six slots and has exactly three cumulative levels; selecting it again advances the next level. An elite additionally grants one shared or character-compatible plugin not already held.

A rest node offers one of two authoritative operations:

- repair 30 percent of maximum health; or
- tune one owned module that is below level three.

Modules, plugins, route, health, and encounter state reset with the Run. Chapter progress, unlocks, story choices, metrics, endings, best scores, and daily history persist.

## Noise levels

Each character chapter and the finale author three cumulative Noise rules at levels 1, 2, and 3. Clearing a chapter at level *n* unlocks level *n + 1*, capped at 3. Engine rules change enemy health, firing cadence, telegraph time, Distortion pressure, route connectivity, and rest availability; authored Noise modifiers currently add only positive `distortion_gain`. Noise is not merely a health multiplier.

## Daily mode

Daily mode unlocks after the finale. It is deliberately smaller and more comparable than a campaign Run:

```text
combat -> elite -> boss
```

For each UTC date, the server:

1. rotates deterministically through the seven character chapters;
2. derives the Run seed from the date;
3. reuses that chapter's encounter and boss pools at Noise 0; and
4. records the best score and its module/plugin build for that player and date.

Clearing consecutive UTC dates increases the streak. A completed daily Run can be shared directly with its existing random Run UUID. The public endpoint returns only the anonymous best result for that player's UTC date; it exposes no Telegram identity and requires no share-token table, write request, cleanup task, or extra storage. Successful anonymous reads are cached publicly for five minutes.

## Content scale and localization

The complete authored bundle contains 7 characters, 7 kits, 68 modules, 20 plugins, 36 enemies, 47 encounters, 28 events, 34 story scenes, 7 chapters, and 1 finale. English and Simplified Chinese each contain the same 620 locale keys.

Startup and tests validate the primary catalog totals and exact locale parity; the current locale files contain 620 keys each, also checked by the release gate. See [content-authoring.md](content-authoring.md) before changing rules or authored content.
