# Browser campaign

`/` outside Telegram and `/play` start the full eight-chapter campaign immediately. The retired `/demo` URL redirects to `/play`. Completing a character continues to the next one; chapter selection and Daily remain available during that visit.

## Session lifetime

Each mounted browser game owns an in-memory progression record. Refreshing, reopening the page, or opening another tab starts at the first chapter. Language changes and room transitions retain the current session. The game does not read or write browser campaign saves, use Web Locks, or synchronize tabs. Old local saves are left untouched and ignored. Audio and language preferences remain separate.

Telegram still verifies `initData` and keeps server-backed progress. Browser sessions never call those protected APIs.

## Shared rules

Canvas runs combat locally. Campaign progression uses the same Go rules as Telegram, compiled to WebAssembly. `internal/localgame` projects transitions into a serializable record; the browser now keeps that record only in memory. Go tests still verify the record format and all eight chapters.

```sh
npm run generate:browser-campaign
npm run check:browser-campaign
```

Use the toolchain in `apps/api/go.mod`. The build includes its matching `wasm_exec.js` and Go license. CI verifies the generated binary matches the rules. Browser tests cover fresh visits, language changes, blocked storage, session progression and absence of protected API calls.
