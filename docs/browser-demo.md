# Browser demo

## Scope and play

Both `/` (outside Telegram) and `/demo` start the local Nana demo directly. There is no introduction or portfolio landing page. A completed or failed attempt offers Restart, Telegram, and a smaller GitHub link. Restart begins a fresh attempt.

The `demo-v2` manifest selects a 40-second authored wave, one animated choice between Twin Live Feed and Piercing Cannon, and an Optimal Nana Boss lasting at most 45 seconds. Horizontal dragging follows the finger directly; vertical dragging and release never move the player. The HUD stays outside the arena.

- Breaking a core immediately converts only its formation's hostile bullets into at most six harmless star-baton drops. Remaining escorts briefly power down.
- A defeated controller or side device becomes a friendly robot with star eyes and two penlights. At most two robots join, fire at surviving enemies, then wave and leave after six seconds. They have no contact damage, recruit UI, inventory, or persistent identity.
- Support charges Rescue and boosts the selected weapon for eight seconds; another pickup refreshes the duration. The demo has three hearts and at most one shield. Shield mechanics remain, but there is no colored cage or floating gun decoration around the character.
- The original chiptune starts with a solo melody. Core reversals restore percussion, bass, and harmony. Sparse Boss glitches briefly interrupt it; Rescue restores the full arrangement for eight seconds. No beat-matching input is required.

## Implementation boundary

The demo reuses the TypeScript simulation, Canvas renderer, input, and audio. Go generates both static manifests from the current content catalog. Optional `runtime_config.reversal` enables demo behavior; campaign configs omit it. Existing eight-chapter content, saves, REST endpoints, database schema, and rate limits are unchanged.

Formation IDs are local entity references. Fans reuse their defeated enemy's ID and the existing friendly projectile pipeline. They never enter hostile collision arrays. No server replay, account, token, hash, telemetry platform, or additional service is introduced.

Music is synthesized locally with Web Audio after the first real interaction. Mute and background pause stop scheduled voices; ended oscillators disconnect. The combined sound/music voice cap is 24. Earned music layers carry from the wave to the Boss and reset on restart. Campaign music keeps its existing arrangement.

## Assets and provenance

Four local WebP assets under `/game/v4/reversal/` were generated for this project with the built-in image tool:

| File | Content |
| --- | --- |
| `stage.webp` | Modern virtual-idol livestream studio, fan merchandise, cameras, and a quiet central floor |
| `nana-sheet.webp` | Referenced Nana design: idle, left/right movement, shooting, and hurt poses |
| `equipment-sheet.webp` | Controllers, escorts, and cutting devices: closed, open, hit, and broken frames |
| `boss-sheet.webp` | Fictional auto-Nana: calm/glitch rows with four action states |

The stage was revised on 2026-09-07 to remove the old waterfront theme. Sprite sheets have actual alpha transparency and share a pixel scale and baseline. Native-size and nearest-neighbor 2x review preceded the initial release. Fans reuse the equipment sheet with small pixel face and penlight overlays; their projectiles are procedural pixel stars. No additional bitmap download is needed.

The Nana atlas references the repository's existing character sprite. It remains an unofficial fan depiction, not an endorsement or a transfer of likeness rights. The scene, control equipment, Boss fiction, and oscillator score are original project content. No runtime image/audio service is called. The asset checker enforces the exact asset set and decoded-memory/download budgets.

## Verification

Run frontend tests, Go tests, generated manifest/API checks, asset/source checks, and Playwright. Check ownership-scoped reversal, harmless fans and their lifetime/cap, hit feedback, weapon choices, boost expiry, health, Boss completion, mute/pause, continuous dragging, and restart. Browser coverage must include 320 x 568, a common phone size, and desktop, with no protected API requests in the demo. Existing Telegram journeys use isolated API fixtures and must keep passing.

The owner authorized production release on 2026-09-07; independent human testing remains pending. Before extending this demo design into the campaign, let at least three unfamiliar players try twice without instruction. At least two should deliberately repeat a reversal, distinguish both weapon choices, remember a concrete moment, and want another attempt. Automated correctness checks are not evidence that the game is fun.
