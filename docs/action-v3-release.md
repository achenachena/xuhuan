# Action V3 forward-only production release

## Release boundary

Action V3 changes both durable game state and the deterministic client/server contract. The production payload must move as one unit:

- HTTP namespace: `/v2`
- content version: `v3`
- simulation protocol: `action-v2`
- Lambda `APP_VERSION`: the exact released Git commit SHA
- Mini App: a production-mode Vercel artifact built from that same SHA

Migration `005_action_v3_prepare.sql` preserves each player's Telegram user ID, language, timestamps, and the short-lived rollback columns while deleting previous progression, unlocks, story choices, Runs, and command history. It creates V3 campaign/chapter progress, revised immutable story choices, separate campaign/daily active-Run slots, and daily results. Public daily links reuse an existing completed Run UUID and create no token or database row. Migration 006 removes the unused Telegram profile-name columns with the rest of the Action V2 compatibility schema.

Migration `006_remove_action_v2.sql` removes legacy gameplay tables only after the V3 API, frontend, and signed production journey pass. Both SQL files, and every earlier numbered migration, remain in the repository permanently.

Once migration 005 commits, do not restore an Action V2 Lambda or frontend. Fix forward with a `v3`/`action-v2` compatible artifact.

## One protected workflow

Production is released only through **Release Production V3** in GitHub Actions. The older independent API deploy, Mini App deploy, promotion, and smoke workflows have been removed. Merging to `main` does not deploy: `apps/miniapp/vercel.json` disables Vercel Git deployment for `main`.

The workflow must itself be dispatched from `main` and accepts one input, `release_sha`. The input must be the full lowercase 40-character SHA at the current `origin/main` HEAD; older ancestors are rejected so a forward-only schema cannot receive a stale binary. Before building anything, the workflow polls the `main` push run of `CI` and requires a successful conclusion for that exact SHA. Checkout and the Lambda/Vercel metadata are then verified against the same value; there is no mutable branch or user-supplied deployment URL later in the flow.

The job uses the protected GitHub environment `Production`. Configure required reviewers and prevent self-review where the repository's GitHub plan supports it.

## Protected environment configuration

Environment secret:

- `VERCEL_TOKEN`: scoped token for the linked Mini App project/team.

Environment variables:

- `API_BASE_URL`
- `AWS_REGION`
- `AWS_DEPLOY_ROLE_ARN`
- `AWS_LAMBDA_FUNCTION`
- `AWS_LAMBDA_ALIAS`
- `AWS_LAMBDA_RESERVED_CONCURRENCY` (1 or 2)
- `AWS_DATABASE_URL_PARAMETER`
- `AWS_DATABASE_MIGRATION_URL_PARAMETER`
- `AWS_REDIS_URL_PARAMETER`
- `AWS_TELEGRAM_TOKEN_PARAMETER`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

The AWS role trust policy must allow GitHub OIDC only for this repository and the `Production` environment. Its permissions are limited to reading the four named SSM parameters and Lambda/account configuration, updating/publishing/invoking the Lambda, switching the alias, and managing the small concurrency guardrail.

The production Lambda timeout must remain at or below 30 seconds. The workflow verifies that setting before maintenance and drains for 35 seconds.

The Vercel IDs must point to the project linked at the repository root with Vercel Root Directory `apps/miniapp`. The workflow requires production `NEXT_PUBLIC_API_URL` to match `API_BASE_URL` exactly after trailing-slash normalization and rejects any development-authentication setting.

## Before opening the maintenance window

1. Merge the candidate and wait for CI on that exact SHA: infrastructure validation, Go race/unit/contract tests, PostgreSQL/Redis integration, frontend tests/lint/type/build, Playwright, English-source policy, dependency audit, and container scan.
2. Confirm the `Production` environment variables and secret names above are populated.
3. Confirm the SSM runtime and migration database URLs target the intended production Neon database, Redis uses `rediss://`, and the Telegram parameter is the intended bot.
4. Confirm no separate Vercel Git production deployment is queued for `main`.
5. Announce the short maintenance window. Migration 005 intentionally resets all game progress, although Telegram identities remain.
6. Copy the full candidate SHA from GitHub. Do not use a branch name, abbreviated SHA, staged URL, or Lambda version as workflow input.

## Run the release

In GitHub Actions, choose **Release Production V3**, select **Run workflow**, paste the full `release_sha`, and complete the protected-environment approval.

The workflow executes this fixed sequence:

1. **Validate the exact source.** It rejects non-SHA input, checks out the SHA, confirms `HEAD` matches, and requires that commit to remain the current `origin/main` HEAD.
2. **Validate the candidate.** It installs the lockfile, rejects legacy runtime endpoints, runs the English-source, locale-count/parity, production-smoke contract, and generated-API checks, then frontend test/lint/type checks and Go tests.
3. **Build and stage Vercel.** It pulls the production environment, builds with the pinned CLI, and deploys with `--prebuilt --prod --skip-domain`. Production domains do not move.
4. **Verify the staged frontend.** It waits for `READY`, requires target `production`, checks custom `releaseSha`, `contentVersion=v3`, and `actionProtocol=action-v2` deployment metadata, then requests the exact generated URL through Vercel deployment protection and requires its rendered `CONTENT-V3 / ACTION-V2` marker.
5. **Build backend artifacts.** It builds the arm64 Lambda archive and native migration runner from the same checkout.
6. **Validate production boundaries and publish an immutable Lambda candidate.** GitHub obtains short-lived AWS credentials, requires both the pooled runtime URL and direct migration URL to expose the same complete migration history at an explicitly supported V2/V3 boundary, and rejects weighted Lambda alias routing or an out-of-policy runtime. It then reads production values from SSM, updates unpublished code/configuration, and publishes a numbered version only if the unpublished revision and archive SHA still match this run.
7. **Check the candidate.** The immutable version description and `APP_VERSION` must equal the release SHA, then a direct qualified invocation runs its dependency and embedded-content startup check. Its response must identify `v3` and `action-v2`. A failure happens before downtime or public routing changes. If the function was already held at zero concurrency by an interrupted forward-only release, AWS cannot invoke any qualified version; in that recovery case the workflow requires exact configuration/content checks now and keeps the post-alias API handshake mandatory.
8. **Promote the exact frontend.** After re-fetching `origin/main` and confirming enough job-time budget remains, `vercel promote` receives the staged URL captured by this run. The frontend is not rebuilt and no operator can substitute another URL. The linked production deployment and at least one plain HTTPS production alias must serve the V3/action-v2 marker, and that alias must be present in the API's exact CORS allowlist, before maintenance can begin. The frontend requests only V3 endpoints, so the old API or the concurrency-zero window produces the connection-safe retry state instead of legacy gameplay writes.
9. **Enter API maintenance.** Reserved concurrency is set to zero and verified, then the workflow waits longer than the configured Lambda request timeout so existing invocations drain.
10. **Apply the expand migration.** The exact-SHA migration runner connects through the separate SSM migration URL with `MIGRATION_TARGET_VERSION=5`. Each numbered migration uses its own PostgreSQL transaction and advisory lock; migration 006 remains unapplied. If the command reports failure, a protected read of `schema_migrations` distinguishes a definitely absent version 5 from an already-committed or unknown boundary before traffic can be restored.
11. **Verify the runtime database and switch the API alias.** After the target-5 migration succeeds, the workflow connects through the Lambda runtime `DATABASE_URL` and requires migration 005 plus a V3 table to be visible. This prevents a direct/pooled database-parameter mismatch from publishing an incompatible candidate. Only then does the stable Function URL alias point to the checked immutable candidate, using the previously read alias revision as an optimistic-concurrency guard and rejecting weighted routing before and after the switch.
12. **Restore concurrency.** The workflow restores the configured bound only when the account can still leave AWS's required 100 executions unreserved; otherwise it removes function-level reservation and records a warning about the account-wide cap.
13. **Verify the API handshake.** A real OPTIONS request from the promoted public Mini App origin must pass the live V3 API's CORS middleware. `/healthz` must report the release SHA, `/readyz` must report ready, both localized content requests must report `v3` with `action-v2`, and both responses must expose every fixed V3 catalog count.
14. **Run the signed production journey and promoted-browser gate.** The workflow masks the deterministic synthetic identity before the smoke runner emits it and first requires that Telegram ID not to exist in PostgreSQL. It then retrieves and masks the Telegram bot token from SSM, signs that identity, and exercises the V3 authoritative flow. The same signed `initData` is written only to a mode-0600 runner-temporary file and injected through the Telegram SDK's launch bridge into headless system Chrome. That browser must load the promoted production origin, obtain an authenticated V3 game snapshot through the real frontend, switch to Chinese, and obtain the localized content and snapshot through the live API. The temporary file is removed by a shell trap and neither browser tracing nor credential logging is enabled. A collision aborts before the API can upsert or cleanup can delete any existing identity.
15. **Remove synthetic state.** An `always()` step consumes the smoke step's preflight output, retrieves the migration URL from SSM, and uses a bounded PostgreSQL transaction to delete only the guarded deterministic Telegram ID. PostgreSQL cascades remove its progression, choices, runs, commands, and daily results. Cleanup also runs when the journey fails after preparing its identity; neither the identity nor database URL is printed.
16. **Contract the legacy schema.** Only after smoke and synthetic-state cleanup succeed, the same exact-SHA runner uses `MIGRATION_TARGET_VERSION=6` to apply the legacy-table cleanup. If it fails, V3 stays live and the cleanup can be retried safely.

## Exit criteria

The release is complete only when the workflow summary reports all of the following for the same SHA:

- the Lambda alias serves `/healthz` with that full SHA and `/readyz` is healthy;
- the promoted public Mini App origin passes the live V3 API CORS preflight;
- English content returns `version=v3` and `protocol=action-v2`;
- the catalog contains 7 characters, 7 kits, 68 modules, 20 plugins, 36 enemies, 47 encounters, 28 events, 34 story scenes, 7 chapters plus the finale, and 620 keys per locale;
- the exact staged Vercel deployment has been promoted;
- signed Telegram authentication succeeds without logging raw init data or credentials;
- onboarding, tutorial/trace replay, disconnect recovery, campaign progression, the finale boundary, and the daily surface exercised by the smoke runner behave authoritatively;
- the promoted production frontend boots with the same signed synthetic Telegram launch data, renders the campaign hub, and reloads the live game snapshot and Chinese content after the language toggle;
- migration 006 has removed the unused Action V2 gameplay tables; and
- Lambda concurrency is no longer zero.

After automation passes, open the bot on a real phone and verify safe areas, language switching, joystick release, signal collection, Warp, room submission, and resume after closing the Mini App. This device check is presentation validation, not a substitute for the signed workflow gate.

## Failure handling

| Failure point | Public state | Required response |
| --- | --- | --- |
| Source, tests, Vercel build, or staged verification | unchanged | fix the candidate and run a new exact SHA |
| Lambda publish or pre-maintenance candidate check | unchanged | inspect the candidate/configuration; do not promote or enter maintenance manually |
| Frontend promotion fails | API and schema unchanged; the staged artifact remains independently verified | retry promotion of the URL captured by this run or ship a new exact SHA; do not enter API maintenance |
| Maintenance entry or migration 005 fails and version 5 is confirmed absent | V3 frontend is public; old alias/schema resumes traffic and the frontend shows its connection-safe retry state | investigate the failure, fix forward, and rerun |
| Migration reports failure but version 5 is present or cannot be checked | V3 frontend is public; concurrency remains zero | treat the boundary as forward-only, verify `schema_migrations`, repair/switch to the V3 candidate, then restore traffic |
| Target 5 fails after an older missing migration committed | V3 frontend is public; old alias has compatibility preparation only and traffic is restored | inspect `schema_migrations`; never edit applied SQL; add a new forward migration if needed |
| Migration 005 succeeds but alias switch fails | schema is V3; concurrency intentionally remains zero | keep maintenance, repair the alias to the published V3 candidate, then restore concurrency |
| Runtime and migration database parameters do not expose the same V3 boundary | the direct database is V3; concurrency intentionally remains zero | correct the protected SSM parameter, verify migration 005 through the runtime URL, then switch the V3 candidate and restore traffic |
| API handshake fails after alias switch | V3 frontend and candidate are live; schema is V3 | keep the compatible artifacts and fix forward; do not select an Action V2 version |
| Signed API or promoted-browser smoke fails after promotion | V3 API and frontend are live; the synthetic player cleanup still runs and legacy tables remain | preserve non-secret evidence, keep V3-compatible artifacts, and fix forward before the schema contract |
| Synthetic-player cleanup fails | V3 API and frontend are live; migration 006 is skipped | keep V3 live, remove the exact synthetic player through the protected migration role, and rerun the release guard before contracting |
| Post-smoke migration 006 fails | the validated V3 stack is live; legacy tables remain | leave V3 live, inspect `schema_migrations`, and retry the exact cleanup or add a forward migration |

The workflow prints an explicit forward-only error after a post-migration failure. If version 5 may have committed or alias switching fails after migration 005, the restore condition deliberately leaves Lambda concurrency at zero rather than exposing the old binary to the V3 schema.

Do not cancel the workflow after it enters the maintenance step. The workflow rejects a cutover when preflight has consumed more than 50 minutes of its 120-minute job deadline and bounds the promotion, drain, migration, alias, handshake, smoke, cleanup, and contract steps so normal failures reach their guarded recovery path; an external runner termination can still prevent any `always()` recovery step from executing.

## Operational evidence

Keep the GitHub run URL, release SHA, immutable Lambda version, staged/promoted Vercel URL, migration output, API handshake result, and smoke summary together. Do not copy SSM values, the bot token, raw Telegram `initData`, database URLs, or traces into an issue or release note.

No production deployment or migration occurs merely by merging this document or the workflow. A valid exact SHA, protected environment approval, and explicit workflow dispatch are all required.
