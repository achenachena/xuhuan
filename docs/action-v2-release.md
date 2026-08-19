# Action V2 forward-only release

Migration `004_action_roguelite.sql` deletes every existing player-owned record and changes the live V2 command contract. The release therefore has a forward-only boundary: after the migration succeeds, do not move the Lambda alias back to a card-protocol binary.

## Before the maintenance window

1. Merge only after CI, PostgreSQL integration, and Playwright pass.
2. Deploy the API and Mini App to staging and complete the full browser journey.
3. Run **Deploy Mini App** for `production` with `promote_production=false`. Record the verified `vercel.app` artifact URL; the public Telegram URL is unchanged.
4. Confirm the production API parameters still reference Neon, Upstash TLS, and the intended Telegram bot. Confirm Billing remains on the free plan.

## Maintenance window

1. Stop inviting test traffic and note the start time.
2. Run **Deploy API** for `production`. It promotes the action binary, applies migration 004 once, and verifies `/v2/content/v2` reports `action-v1`.
3. If migration succeeds but the post-migration check fails, fix forward. Do not restore an old Lambda version.
4. Run **Promote Staged Mini App** with the recorded artifact URL. This changes the public Vercel target without rebuilding it.
5. Run **Smoke Production V2**, then open the bot on a real Telegram device and verify: one-tap prologue, movement, three beacons, Warp, room submission, reload recovery, reward selection, and safe-area layout.

## Exit criteria

- `/healthz` and `/readyz` are healthy and report the intended release.
- `/v2/content/v2` returns `protocol=action-v1` in Chinese and English.
- The synthetic signed production run clears the Boss and unlocks noise 1.
- A real Telegram session restarts the current room after closing the Mini App and does not lose the Run.
- Neon contains only action-era players/runs, and `run_commands.command_payload` contains the immutable `rle8-v1` trace for encounter commands.

No deployment or destructive migration is performed merely by merging this file; both production workflows remain protected manual actions.
