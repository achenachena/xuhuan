# Bullet Reversal Preview

## Delivery boundary

`demo-v2` is a browser-only Nana playability slice. The current eight-chapter Telegram campaign, saved Runs, REST endpoints, database schema, and rate limits are unchanged. No server replay, account, token, hash, analytics platform, or additional service is introduced.

The demo uses the existing TypeScript simulation, Canvas renderer, input, and audio. Go generates the English and Simplified Chinese static manifests from the current catalog. Optional `runtime_config.reversal` selects a weapon and an authored list of formation groups; existing campaign configs omit it. Group IDs associate local enemies and projectiles, not identities or public capabilities.

## Play sequence

- A 40-second wave begins with two harmless targets in the first eight seconds. It then introduces a controller, opposing formations, and a combined formation. No generic replenishment is used.
- Destroying an exposed control core converts only its formation's hostile projectiles to harmless support. Drops merge into at most six collectible star batons and escorts briefly power down.
- Support fills Rescue and boosts the current weapon for eight seconds. Further support refreshes the duration instead of stacking levels. The demo has three hearts and at most one shield.
- One safe, animated choice offers Twin Live Feed or Piercing Cannon. No separate reward page or numerical description is required.
- Optimal Nana lasts at most 45 seconds. Three health phases alternate cutting arms, delayed copied positions, and breakable side controllers. Success immediately presents replay and Telegram options; failure retries the current segment.

The opening is one original Nana line. During combat, a compact HUD stays outside the arena and no central objective circle or explanatory panel is shown. Horizontal dragging remains one-to-one; vertical dragging and finger release do not move the character.

## Assets and generation

The Preview owns four local WebP files under `/game/v4/reversal/`: `stage.webp`, `nana-sheet.webp`, `equipment-sheet.webp`, and `boss-sheet.webp`. The existing campaign asset manifest is unchanged. The asset checker verifies this separate exact set, image dimensions, download size, and total decoded-memory budget.

### Asset provenance

These four assets were created for this Preview with the built-in image-generation tool. The stage, control equipment, and fictional auto-Nana Boss are new game illustrations. The Nana animation atlas uses the repository's existing Nana character sprite as its visual reference; this remains an unofficial fan depiction, not an official character asset or endorsement.

| File | Intended content | Processing |
| --- | --- | --- |
| `stage.webp` | Modern virtual-idol livestream studio, fan merchandise, cameras, and a quiet central arena | Nearest-neighbor 720 x 1280 export and local WebP compression |
| `nana-sheet.webp` | Referenced Nana design with idle, movement, shooting, and hurt poses | Transparent-background atlas, nearest-neighbor resizing, local WebP compression |
| `equipment-sheet.webp` | Controllers, escorts, open cores, charge and destruction frames | Transparent-background atlas, nearest-neighbor resizing, local WebP compression |
| `boss-sheet.webp` | Auto-Nana and attack, exposed, hurt and breakdown frames | Transparent-background atlas, nearest-neighbor resizing, local WebP compression |

Sprite atlases use actual alpha transparency, not a checkerboard painted into the image. All four runtime assets are local static files; the game makes no image-generation request or external asset-service call. Generated provenance is not a claim that fan-character likeness rights have transferred. The repository's non-commercial fan-work notice still applies. Native-size and nearest-neighbor 2x visual review belongs in the Preview verification record.

The stage was revised on 2026-09-07 using the built-in image tool in edit mode, with the previous stage as a composition reference. The waterfront, timber, ropes, barrels, and sea-reflection animation were replaced with a modern virtual-idol studio. Acrylic standees, pin badges, penlights, cameras, and ring lights establish the fan-stream setting; the center stays calm and dark for combat. The screen visualization fits the new bezel, and successful reversals light its cyan/pink indicators without floor-wide light cones.

The final stage edit prompt was:

> Use case: precise-object-edit. Asset type: production pixel-art background for a portrait 360x640 logical-coordinate one-finger shooter, output 9:16 portrait. Input image 1 is the background to replace. Preserve only the useful game composition: a large rectangular broadcast display centered in the upper quarter, edge-mounted equipment, and an unobstructed low-detail floor covering the central/lower playing area. Completely replace the old harbor/pirate environment with a contemporary Chinese virtual-idol livestream studio / fan-event performance room. This should immediately evoke VTuber fan culture: small chibi acrylic standee collections and pin badges on shelves at the extreme side edges, neatly arranged cyan/pink/gold penlight racks, heart/star stage motifs, modern black cameras and ring lights, broadcast mixing desk glimpsed at the side, acoustic panels and LED strips. No people or enemies standing in the room. Modern navy matte floor tiles (NOT wood planks), clean graphite and cool white equipment, small pastel cyan/pink fan decorations, warm highlights only as tiny accents. The atmosphere is a charming late-night variety livestream interrupted by a sci-fi glitch, NOT a military warehouse or generic cyberpunk corridor. Clean hand-placed-looking 16-bit pixel art, crisp stepped outlines and limited palette matching the existing character sprites; no painterly fog or volumetric haze. For alignment with game animation: leave an unlit nearly black rectangular screen interior spanning approximately x25%-75%, y4%-17% of the entire image; a modern thin screen bezel immediately around it. Concentrate props and detail outside the middle 72% of the image, especially near the upper edges. Keep the bottom 70% calm and dark enough to distinguish red/purple bullets and cyan/gold friendly pickups. No bright objects or floor markings in the center, no huge circular platform. No text, lettering, logos, watermark, UI, health bars, player characters, ocean, water, boats, ropes, anchors, docks, barrels, lanterns, brass rivets, medieval/pirate/steampunk decoration. Change the entire theme, not simply add a few screens to the old harbor.

The unchanged Nana atlas uses a four-column grid of idle, left/right movement, firing and hurt poses. The equipment atlas uses controller, camera escort and cutting-device rows, each with closed, open, hit and broken frames. The Boss atlas uses calm and glitch rows with the same four action states. No lettering was baked into the artwork. Corrective alpha-background passes removed painted checkerboards before local nearest-neighbor WebP export.

Regenerate both immutable manifests and API types when their source contracts change:

```sh
npm run generate:portfolio-demo
npm run check:portfolio-demo
npm run generate:api-types --workspace @xuhuan/miniapp
npm run check:api-types --workspace @xuhuan/miniapp
npm run check:content-assets
npm run check:english-source
```

## Verification before sharing Preview

- Verify formation ownership, instant harmless conversion, body/core collision, continuous bullet collision, piercing deduplication, support limits, boost expiry, and sequential Rescue.
- Verify sustained horizontal dragging, ignored vertical movement, immediate release, focus recovery, both weapon choices, death, Boss victory, timeout, and retry.
- Confirm the static demo never calls protected APIs and the existing Telegram campaign tests still pass.
- Inspect 320 x 568, common mobile, and desktop layouts; keep a 30 Hz simulation and target near-60 FPS rendering. Reduce decorative effects before compromising danger visibility.
- Inspect all sprite frames at native pixel size and nearest-neighbor 2x. Check that friendly pickups cannot be mistaken for hostile equipment.

### Local verification record (2026-09-06)

- Go tests, vet, generated OpenAPI/demo checks, English-source and asset checks passed.
- Real Chrome browser regression passed at 320 x 568 and Pixel 7 sizes, including existing campaign, Daily and ending flows. Campaign API behavior is mocked in those browser tests, not a claim of production verification.
- Visually reviewed the new stage, choice, Boss and result screens at 320 x 568, 390 x 844 and desktop 1280 x 900. Reviewed all three transparent sprite atlases at native size and nearest-neighbor 2x.
- A local Chrome Boss sample measured 180 animation frames with median/p95 intervals of approximately 16.7 ms while its timer advanced from 44 to 41 seconds. This desktop result does not certify low-end phones or peak-entity performance.
- TypeScript, ESLint and the production Webpack build passed. Local Turbopack workers were blocked by the host's socket permission policy; the unchanged default Turbopack build is also checked in remote CI/Preview.
- No production deployment, migration, player reset or live API write was performed. Human testing below remains pending.

### Studio background verification (2026-09-07)

- Replaced only the reversal stage, its background animation, and this provenance record. Campaign assets and all simulation, input, and API logic are unchanged.
- Reviewed the 360 x 640 logical background at 1x and nearest-neighbor 2x, then the running demo at 320 x 568 and 1280 x 900. The display animation stays inside its bezel, and the HUD remains outside the combat plane. Chrome reported no browser errors.
- TypeScript, ESLint, all 96 unit tests, all 22 Chrome browser regressions, English-source, asset, and diff checks passed. Campaign browser tests still use mocked API responses.
- The replacement WebP is 52,106 bytes at 720 x 1280, down from 102,488 bytes. No new asset dependency or runtime service was added.
- These checks do not replace the human playtest gate below.

## Human playtest gate: pending

Do not promote production solely because automated tests pass. Recruit at least three people unfamiliar with the old game, and let each play twice without explaining the controls, upgrades, or objectives.

| Acceptance observation | Required result | Status |
| --- | --- | --- |
| Starts moving and shooting without help | Within ten seconds | Pending |
| Intentionally repeats a control-core reversal | At least two players, before the first normal segment ends | Pending |
| Distinguishes the two weapon choices | Without reading a rules explanation | Pending |
| Recalls a concrete battle moment and wants the other weapon | At least two players | Pending |

Record observed behavior and the exact Preview commit in the PR. Do not invent participants or substitute an agent playthrough for this gate. If the gate fails, improve this short slice before extending it to the campaign.

Production promotion requires a separate decision after the gate passes. This change needs no migration, save reset, Lambda protocol switch, or player-data cleanup.
