# Browser campaign

`/play` offers the full eight-chapter campaign, character and companion unlocks, Encore replays, all finale choices, and the unlocked Daily Aftershow. The root page still opens the short demo outside Telegram. Players can enter the full campaign from the demo at any time or from its result screen. Demo results do not alter campaign progress. `/play` starts a new campaign immediately or resumes the saved room. Continue moves directly into the next chapter; chapter, character and daily selection remain available from the result screen.

## Shared rules

Combat reuses the Canvas simulation and controls. Campaign transitions use `internal/run.NewState`, `Apply`, and `PrepareRun`, the same Go functions used by the Telegram backend. They are compiled to WebAssembly with Go's official browser runtime. No Go combat replay runs in the browser; this module only produces content and advances progression between rooms.

`internal/localgame` projects engine events into a local save. It does not implement a second copy of chapter sequencing, encounter generation, weapon choices, or finale rules. The PostgreSQL repository continues to project the same events into transactional server records. Tests complete all eight chapters and daily challenges with serialization/reload at every transition.

The Go runtime and campaign binary load only on `/play`. The demo does not download them. The `wasm-unsafe-eval` CSP permission enables WebAssembly compilation without permitting JavaScript `eval` in production.

## Saves and failure behavior

- One versioned localStorage record (`xuhuan.campaign.v1`) contains progress, runs, gameplay seeds and the latest daily result. Seeds reproduce an interrupted room; they are not credentials.
- A room result, unlocks, story choice and next room commit together as one storage write before the UI advances. Reloading restarts the current room from its saved seed; it does not save mid-combat positions.
- Web Locks serialize read/advance/write across tabs. A storage event refreshes other tabs; run ID/version checks reject stale commands.
- A denied write does not claim success. The finished arena retains its result for retry. Malformed or unsupported saves are preserved and require explicit confirmation before reset.
- Browser saves are local to the origin/browser profile. Clearing site data or private-browsing storage removes them. There is no cloud sync, account, browser identity, or transfer into Telegram saves.
- Local saves can be edited by their owner. This free single-player game has no competitive economy; browser progress is never accepted as authenticated server progress.

Telegram still uses verified Mini App `initData` and the existing protected APIs. No identity or persistence endpoints were added or relaxed.

## Build and verify

```sh
npm run generate:browser-campaign
npm run check:browser-campaign
cd apps/api
go test ./internal/run ./internal/game ./internal/localgame
```

Use the toolchain declared in `apps/api/go.mod`. The generator builds with `GOOS=js GOARCH=wasm`, strips local paths/build metadata, and copies the matching `wasm_exec.js`. CI rebuilds and compares all generated artifacts. The Go runtime's BSD license is included beside it; this does not license the project's character assets or the rest of the repository.

[Official Go WebAssembly guide](https://go.dev/wiki/WebAssembly). Browser tests cover actual combat, reload, language switching, denied storage, corrupt-save recovery, cross-tab updates, and absence of protected API requests.
