# Authoring V4 content

## Principles

V4 content is immutable, embedded in the Go binary, English-first, bilingual, deterministic, and fail-closed. The browser does not interpret arbitrary effect formulas. Content selects from behavior IDs implemented and tested in both authoritative Go replay and TypeScript prediction.

Do not add payment gates, account tokens, hidden story scores, runtime scripts, remote assets, or per-frame network behavior through content.

## Layout

```text
apps/api/internal/content/v4/
  manifest.json
  shared.json
  daily.json
  chapters/
    seventh-dock.json
    always-cheerful.json
    loss-hidden.json
    captains-do-not-rest.json
    localization-failed.json
    which-is-original.json
    laplace-florist.json
    zero-channel.json
  locales/
    en.json
    zh-CN.json
```

JSON decoding rejects unknown fields. All IDs use lowercase ASCII words separated with hyphens. Locale keys use lowercase dotted names. Released IDs are durable data references; add a new ID instead of silently changing the meaning of an existing story choice.

## Manifest

`manifest.json` declares:

- `content_version: "v4"`;
- `protocol: "shooter-v1"`;
- English as the default locale and exact locale order `en`, `zh-CN`;
- every immutable WebP asset;
- eight chapter files in campaign order;
- `daily.json`; and
- the fixed mobile simulation rules.

The current runtime contract is 30 Hz, a `3600 x 6400` logical arena, player Y `5200`, 128 horizontal input columns, and three starting hearts. Entity caps are 14 enemies, 120 hostile projectiles, 48 player projectiles, 12 pickups, and 24 effects.

Changing a replay-affecting rule requires a new protocol or content version and new cross-language vectors. Do not edit a released manifest in place.

## Shared content

### Show effects

V4 contains exactly 12 shared, one-level show effects. Each definition has an ID, localized name and description, archetype (`power`, `guard`, or `style`), behavior, and positive amount.

Supported behavior IDs are:

```text
twin_shot            piercing_shot       spread_shot
graze_charge         guard_on_special     pickup_magnet
echo_volley          boss_break           low_health_power
combo_extend         companion_charge     recovery_drop
```

Every effect must change a visible rule. Do not recreate three-level numerical upgrades or add a generic expression interpreter.

### Characters and specials

There are exactly seven character IDs:

```text
nana7mi  jiaran  xiangwan  bella  lulu  xingtong  nailu
```

A character has localized biography/playstyle copy, local visual assets, positive base stats, and one special with charge cost 100. Max health remains three hearts.

Supported special behaviors are:

```text
barrage_break       cheer_guard       afterimage_replay
captain_parry       subtitle_flip     prism_shift
memory_bloom
```

### Companions

Each character has one unlockable companion. An assist combines a trigger, behavior, positive amount, and cooldown.

```text
triggers:  segment_start  graze_streak  low_health  special_used
           boss_stage     pickup_chain  wave_clear

behaviors: side_shot  shield  echo_shot  clear_lane
           convert_bullet  focus_beam  heal
```

Companions are automatic. An authored change must not introduce another combat button.

### Enemy chassis

The six chassis IDs are fixed:

```text
spam-bot  clip-cutter  caption-blob
black-screen-ghost  gift-thief  censor-frame
```

Movement is one of `drift`, `sweep`, `dive`, `orbit`, `anchor`, or `mirror`. Shot patterns are `aimed`, `fan`, `lane`, `ring`, `delayed`, or `beam`. Optional traits are `shield_link`, `split`, `steal_pickup`, `armor`, `echo`, or `jammer`.

Every attack needs positive damage/projectile speed, an interval of at least 20 Ticks, and a telegraph of at least six Ticks. Content cannot exceed the manifest entity caps.

## Chapter documents

Each file wraps one `chapter` object. A chapter requires:

- a unique ID and order `1..8`;
- localized title and subtitle;
- one featured character and unlocked companion, except the player-choice finale;
- a registered background;
- exactly three segments and exactly three unique waves;
- one boss with positive health and exactly three stages;
- one prelude, one concrete two-choice intermission after segment two, one epilogue, and one replay recap;
- at least one encore modifier; and
- endings only for Zero Channel.

### Segments and rewards

Every normal segment is fixed-duration survival. There is no authored objective field. Segment duration is `1050..1350` Ticks (35–45 seconds); Nana's first tutorial segment may be exactly 900 Ticks.

The three segments must use these reward stages in order:

```text
1  weapon
2  companion
3  rescue
```

A segment references a chapter-owned wave and a registered background. A wave has one or more scheduled spawns. Formation is `line`, `fan`, `staggered`, `pincer`, `center`, or `sweep`; a spawn count cannot exceed eight.

### Bosses

A boss has a local sprite, positive `max_health`, a room duration of exactly 1800 Ticks, and exactly three stages. Stage health thresholds are exactly 100, 66, and 33. Each stage selects supported movement/shot patterns and names one script behavior implemented by the backend.

### Story

Each story message list contains one to three short bubbles. An intermission contains exactly two choices. A choice has:

- a durable ID;
- localized label and result;
- a concrete durable tag; and
- an optional existing show-effect reward.

There are no Trust, Authenticity, Retention, morality, reputation, or personality-score fields. Story projection uses the selected option IDs directly. Replaying appends a revision rather than overwriting the old choice.

Zero Channel contains exactly three ending IDs: `open-archive`, `shared-cut`, and `quiet-signoff`. Each ending declares the explicit selected choice IDs that make it available, localized title/summary, and one to three closing bubbles.

## Daily Aftershow

`daily.json` declares a UTC seed basis, exactly two combat segments (one normal wave and one boss), exactly one show choice between them, seven rotating character IDs, and references to existing waves, bosses, and encore modifiers. It is a deterministic content projection, not a cron job or separate economy.

## Localization

English is the canonical writing and review language. All player-facing content keys must exist with non-empty values in both locale files. The key sets must match exactly. Do not place translated copy in Go, TypeScript, Markdown, or chapter JSON.

The chapter dialogue should:

- sound like a late aftershow group rather than a product requirements document;
- use no more than three concise bubbles in a scene;
- center an everyday, concrete decision;
- reveal the archive mystery gradually;
- use only light, original, character-adjacent humor; and
- avoid factual claims about real people, private information, lyrics, and long quotations.

The source scanner allows Han characters only in narrowly reviewed localization and historical fixture files.

## Assets

V4 URLs are rooted at `/game/v4/` and use these directories:

```text
backgrounds/  players/  enemies/  bosses/  pickups/
```

Every public WebP must appear exactly once in `manifest.json#assets`; every authored visual reference must resolve to that list. The asset check also enforces exact manifest/public-tree parity, WebP validity, mobile dimensions, encoded download size, and decoded-memory limits.

Versioned assets are cached as immutable. Publish a new content path instead of replacing a live V4 file. Do not place editable source art in the public runtime tree.

## Validation workflow

```sh
cd apps/api
env GOCACHE=/tmp/xuhuan-go-cache go test ./internal/content
cd ../..
node scripts/check-content-assets.mjs
node scripts/check-english-source.mjs
```

Then run the relevant shooter, run-domain, frontend, and end-to-end suites. Review both localized endpoints:

```sh
curl 'http://localhost:8080/v2/content/v4?locale=en'
curl 'http://localhost:8080/v2/content/v4?locale=zh-CN'
```

Both responses must report `v4` and `shooter-v1`. Only localized display copy should differ.
