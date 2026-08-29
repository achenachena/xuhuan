# V3 content authoring guide

## Contract and file layout

V3 content is compiled into the Go binary from `apps/api/internal/content/v3/`. The format separates shared combat data, chapter-owned data, and language so each can be reviewed independently.

```text
v3/
  manifest.json
  shared.json
  chapters/                 seven character chapters plus zero-channel.json
  locales/en.json
  locales/zh-CN.json
```

`manifest.json` must identify `version: "v3"`, `protocol: "action-v2"`, English as the default locale, and the exact locale order `en`, `zh-CN`. Its `chapter_files` array is assembly order: chapters one through seven, then the Zero Channel finale.

The manifest limits are deterministic protocol constraints:

| Limit | Value |
| --- | ---: |
| Live enemies | 18 |
| Hostile projectiles | 160 |
| Player projectiles | 64 |
| Pickups | 6 |
| Effects | 96 |

Do not raise a limit as a content-only balance change. It changes replay cost and requires protocol/runtime review.

## Current fixed inventory

The current authored files contain:

- 7 characters and 7 one-to-one kits;
- 68 modules: 12 shared plus 8 for each character;
- 20 plugins: 6 shared plus 2 for each character;
- 8 chapter documents: 7 linear character chapters plus the finale;
- 36 enemies: 21 normal, 7 elite, and 8 bosses;
- 47 encounters: 30 normal, 8 elite, 8 boss, and 1 tutorial;
- 28 events;
- 34 story scenes; and
- 620 non-empty keys in each locale with exact key parity.

Startup validation enforces the primary object totals, module/plugin ownership splits, and non-empty exact locale parity; the kind breakdowns above describe the current authored inventory. The release gate also checks the current 620-key locale total. If a feature changes an object count, update the validator where fixed, tests, documentation, and compatibility decision together. If it adds copy, update both locale files and this documented key total. Do not weaken a count merely to make incomplete content load.

## Slugs, keys, and ownership

Slugs are stable machine identifiers. Use lowercase words separated by hyphens and never recycle a released slug for another meaning. Foreign keys use slugs, not localized names.

Translation keys use dotted namespaces such as:

```text
character.<slug>.name
module.<slug>.name
module.<slug>.description
plugin.<slug>.name
enemy.<slug>.name
event.<slug>.*
scene.<slug>.*
chapter.<slug>.title
chapter.<slug>.subtitle
```

Shared objects live in `shared.json`. An enemy, encounter, event, or scene normally lives in the chapter that owns it. The finale may reference enemies from earlier chapters because the catalog indexes every enemy before validating encounters.

## Shared document

### Characters and kits

Each character requires a unique slug; name, biography, and playstyle locale keys; a color; local portrait and player-model URLs; and a `kit_slug` owned by the same character. V3 deliberately uses the same transparent, text-free pixel sprite for `portrait_url` and `model_url`, which keeps the hub, story chat, and arena visually consistent without a second legacy portrait asset.

Kits require positive base health, attack damage, attack interval, movement speed, Warp cooldown, and Warp damage. Passive and Resonance must be one of these engine identities:

```text
nana_route_chain
diana_cheer_pulse
ava_afterimage
bella_perfect_warp
lulu_convert_projectiles
xingtong_signal_stance
nailu_memory_bloom
```

### Modules and plugins

A module has an optional `character_slug`, localized name/description keys, an archetype, a rarity, and exactly three levels. Every level contains at least one effect. Levels are cumulative: level 3 applies levels 1, 2, and 3 in order.

Supported archetypes are `surge`, `guard`, `echo`, and `glitch`. Supported rarities are `common`, `uncommon`, and `rare`.

A plugin is shared when `character_slug` is empty and character-specific otherwise. It requires localized name/description keys and at least one effect. Elite rewards exclude plugins already held and another character's plugins.

### Effects

Positive numeric effects require `amount > 0`:

```text
heal_run                 damage_run
attack_damage            attack_speed
move_speed               warp_cooldown
warp_damage              starting_shield
overload_bonus           distortion_gain
protocol_damage          protocol_shield
echo_power               resonance_power
projectile_pierce        projectile_count
projectile_speed         graze_radius
heal_on_protocol         reflect_damage
max_health               reroll_charge
```

`add_module` and `add_plugin` use `value`, which must resolve to an existing slug. Unknown effect kinds fail loading. A valid new effect may still require frontend presentation work; update labels, rendering, and tests in the same change.

## Chapter documents

Each chapter file has five top-level fields. Unknown JSON fields are rejected.

```json
{
  "chapter": {},
  "enemies": [],
  "encounters": [],
  "events": [],
  "scenes": []
}
```

### Chapter metadata

A character chapter needs:

- a unique slug and order from 1 through 7;
- title/subtitle keys, character, kit, background, and `available: true`;
- the next chapter at exactly the following order;
- at least two normal encounter-pool entries and one elite-pool entry;
- a boss, event pool, midpoint event, and prelude/midpoint/epilogue scenes; and
- exactly three non-empty Noise rules numbered 1, 2, and 3.

Noise-rule modifiers are intentionally narrower than ordinary item effects: every authored modifier must be a positive `distortion_gain`. Route restriction, rest replacement, telegraph pressure, and enemy scaling are cumulative engine behavior keyed by the selected Noise level.

The finale is order 8 with `finale: true`, no character or kit, and no successor. It still requires route pools, a boss, story references, a background, and Noise rules. `tutorial_encounter_slug` is optional and currently belongs only to Seventh Dock.

### Enemies

Enemy kinds are `normal`, `elite`, and `boss`. Every enemy needs positive health, non-negative speed/contact damage, localized name/description keys, a color, an image URL, movement, and at least one attack.

Supported movement kinds are `chase`, `orbit`, `strafe`, `charge`, `flee`, `stationary`, and `wander`.

Supported attack kinds are `aimed`, `fan`, `ring`, `spiral`, `delayed_echo`, `mine`, and `beam`. Attack intervals must be at least 20 Ticks. Damage must be positive. Every non-beam attack needs positive projectile speed; telegraph time cannot be negative, and an attack dealing at least 8 damage must have a non-zero telegraph.

Supported traits are `linked_shield`, `steal_signal`, `death_split`, `armored`, `distortion_aura`, and `teleport`.

Keep live counts within the manifest cap and verify the referenced local asset exists. The loader validates non-empty URLs and content references; visual review is still required for the actual file, scale, transparency, and contrast.

### Encounters

Encounter kinds are `tutorial`, `normal`, `elite`, `boss`, and `daily`. Objective kinds are `purge`, `stabilize`, `recover`, `holdout`, `elite`, and `boss`.

An encounter requires a unique slug, chapter slug, positive objective target, positive duration/hard cap, positive spawn interval, at least one existing enemy, risk from 1 through 3, and reward bias `surge`, `guard`, `echo`, `glitch`, or `balanced`. Duration cannot exceed the hard cap. A non-boss hard cap cannot exceed 1,800 Ticks, a boss hard cap cannot exceed 2,700, and `max_alive` cannot exceed 18.

Supported hazards are `narrow_arena`, `distortion_rain`, `signal_decay`, and `crossfire`. Set both kind `tutorial` and `tutorial: true` for the onboarding room.

### Events

An event needs localized title/body keys and at least two uniquely slugged options. Every option has localized label/result keys, effects, an optional durable `choice_tag`, and optional Trust/Authenticity/Retention deltas.

Event effects mutate the Run; metric deltas commit with progression. A choice tag should describe a durable fact, not presentation copy.

### Story scenes

Supported triggers are `new_player`, `chapter_prelude`, `chapter_midpoint`, `chapter_cleared`, `finale_unlocked`, and `ending`. An ending trigger also specifies `authentic`, `balanced`, or `retained`.

Each scene needs a title key, at least one message, and at least one option. Messages use sender kind `system` or `character`. Options require a unique slug, localized label, durable tag, and metric deltas.

Story choices are immutable revisions in PostgreSQL. Changing a released scene or option slug can reinterpret history, so add a revision/new slug instead of silently replacing its meaning.

## Localization and English source policy

English is the default and source-review language. Authored catalog copy lives in `apps/api/internal/content/v3/locales/`; Mini App interface copy lives in `apps/miniapp/src/locales/`. Add every player-facing key to both files in the relevant locale pair in the same change. Key sets must match exactly, and keys and values cannot be blank. Runtime code should consume locale data instead of embedding translated strings.

```sh
npm run check:english-source
```

The check rejects Han-script text in normal source and documentation. Its exceptions are deliberately path-specific:

- the canonical V3 content and Mini App UI `zh-CN` locale documents;
- the existing `001` through `006` SQL migration files, listed individually in the scanner so new migrations remain English; and
- the named fixtures `apps/api/internal/auth/telegram_test.go` and `apps/miniapp/e2e/roguelite.spec.ts`.

Do not exempt an entire source or test tree. When a new fixture genuinely needs non-English text, add its exact path to `scripts/check-english-source.mjs` and explain it in review.

## Assets

V3 URLs are rooted at `/game/v3/` and served by the Mini App. Put players, enemies, bosses, pickups, and backgrounds in their existing category directories with stable lowercase hyphenated names. Every deployed WebP must appear in `manifest.json#assets`; the Go loader rejects content references outside that immutable list.

`npm run check:content-assets` enforces exact parity between the manifest and the public V3 tree, verifies every authored content reference, parses each WebP header, and applies mobile download and decoded-memory budgets. Backgrounds are capped at 768 by 1365, bosses at 512 square, enemies at 384 square, pickups at 256 square, and players at 512 square. The complete encoded catalog must stay below 4 MiB and the decoded catalog below 56 MiB. Versioned assets are cached as immutable for one year, so publish a new content path instead of replacing a live V3 image. Also review portrait-viewport legibility, alpha behavior, source/redistribution status, and reasonable runtime size. Do not place source-only working files in the public runtime tree.

## Authoring workflow

1. Decide whether the change is compatible with unreleased V3. After V3 is live, create a new content version instead of mutating replay inputs in place.
2. Add or update shared and chapter-owned definitions with stable slugs.
3. Add every locale key to English and `zh-CN`; keep code and docs English.
4. Add local assets, register them in `manifest.json#assets`, and verify their presentation.
5. Register chapter documents in manifest order.
6. Run focused validation, then the full repository checks.

```sh
cd apps/api && go test ./internal/content ./internal/action ./internal/run ./internal/story
cd ../../
npm run check:english-source
npm run check:content-assets
npm run check:api-types --workspace @xuhuan/miniapp
npm run test --workspace @xuhuan/miniapp
make test
```

Review both localized endpoints:

```sh
curl 'http://localhost:8080/v2/content/v3?locale=en'
curl 'http://localhost:8080/v2/content/v3?locale=zh-CN'
```

Both must report `version: "v3"` and `protocol: "action-v2"`; only localized display text should differ.
