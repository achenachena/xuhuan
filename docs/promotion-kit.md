# Promotion kit — drafts, not posted

Publication gate: complete the first unfamiliar-player sessions in [playtest-kit.md](playtest-kit.md), confirm the production deployment and CI credential, and fix blocking comprehension issues. No outreach, community posts, itch.io page or engagement counts were created by this implementation.

## Assets and links

- Play: https://xuhuan-miniapp.vercel.app/demo
- Engineering: https://xuhuan-miniapp.vercel.app/engineering
- Repository: https://github.com/achenachena/xuhuan
- 18-second real gameplay + music: `/engineering/gameplay.mp4`
- 10-second opening excerpt: `/engineering/reversal-10s.mp4`
- Retry evidence playback: `/engineering/retry-evidence.mp4` (captured test output paced for reading, not latency footage)
- Poster: `/engineering/gameplay-poster.webp`

The game is an unofficial non-commercial fan project. Retain the repository's provenance notice. Source is publicly readable; do not describe all source/assets as freely licensed without an explicit licensing decision.

## PlayMyGame / small game communities

Title: **A 90-second shooter where enemies become your fans — browser playtest**

> I built a browser shooter where defeating a control core turns its enemy fire into support and robots into your fans. Each reversal brings another layer of the music back. It takes about 90 seconds, works on desktop or phone, and needs no account or Telegram.
>
> Play: https://xuhuan-miniapp.vercel.app/demo
>
> I am looking for feedback on the first ten seconds: could you tell what changed when the glowing core broke? Also, was the weapon choice clear? English and Simplified Chinese are available. This is an unofficial fan project; you do not need to know the characters.

Attach the 10-second clip, use the required flair and direct playable link, and participate in other developers' playtests. Recheck [current rules](https://www.reddit.com/r/playmygame/about/rules/) on publication day. Do not repeat this post across unrelated communities or ask for votes.

## itch.io page copy

Title: **Xuhuan: Only One Online**

Short description: **Turn enemies into fans. Bring the music back. A 90-second browser shooter.**

> Break control cores, turn hostile bullets into support, and recruit the machines into your audience. Move left and right; fire is automatic. Choose Twin Live Feed for two streams of fire or Piercing Cannon to shoot through a line.
>
> **[Play in your browser](https://xuhuan-miniapp.vercel.app/demo)** — no download, signup or Telegram needed. The full persistent campaign is available through Telegram.
>
> Controls: drag horizontally on phone; drag, A/D or arrow keys on desktop. Tap Rescue when charged, or press Space. English and Simplified Chinese.
>
> This is an unofficial, non-commercial fan project. Character rights remain with their holders; original game scenes and generated-art provenance are documented in the repository.

Use the poster, a real gameplay clip and a visible external Play link. Do not label the existing Next.js server as a downloadable HTML5 ZIP. Embedded HTML5 distribution would require a separate static build and review of [itch.io's upload requirements](https://itch.io/docs/creators/html5).

## Show HN

Title: **Show HN: A browser shooter where enemies become your fans**

Submit the direct playable URL. First comment:

> I built this small one-thumb shooter with TypeScript/Canvas, with a Go/PostgreSQL backend for the full Telegram campaign. The public demo is local and anonymous; it makes no protected API calls.
>
> One trade-off I enjoyed working through: combat stays on the client, while the server owns durable progression. With no economy or global leaderboard, I chose bounded room results over cross-language server replay. PostgreSQL transactions combine row locks, expected versions and idempotent command responses.
>
> There is a reproducible HTTP/database experiment for response loss and retries here: https://xuhuan-miniapp.vercel.app/engineering
>
> I would appreciate feedback on both the first-play experience and that backend trade-off.

Follow [Show HN guidelines](https://news.ycombinator.com/showhn.html). Do not coordinate upvotes or imply production scale that has not been measured.

## LinkedIn

> The tricky part of my game was not rendering bullets. It was deciding what happens when a room result commits and the mobile connection drops before the response arrives.
>
> I built Xuhuan, a playable browser demo with a persistent Telegram campaign backed by Go and PostgreSQL. I added a reproducible test that closes the HTTP connection after commit, retries the same request, and verifies one command row and one score update. A separate stale-version request is rejected, then recovers through an authoritative reload.
>
> Play: https://xuhuan-miniapp.vercel.app/demo
> Engineering notes and evidence: https://xuhuan-miniapp.vercel.app/engineering
>
> I am looking for backend/full-stack SDE opportunities in Canada and would welcome a discussion about the design trade-offs.

Attach real gameplay. Add player observations only after conducting the sessions; no invented user counts, retention, scale, availability or savings figures.

## Developer event pitch

Subject: **Short demo proposal: retry-safe game progress with Go and PostgreSQL**

> I am building a small game as a backend/full-stack portfolio project. Could a short technical demo fit an upcoming community session? I can show a playable 90-second browser game, then a reproducible response-loss experiment: one committed transaction, a failed response, and a retry that does not double-apply progress. The talk focuses on practical trade-offs rather than a product pitch.

Select a reachable local or online event; [Toronto JS](https://torontojs.com/) is one place to check. Verify the actual event format before contacting an organizer. Send only after the owner selects the recipient.

## Tracking

For each actual post, record date, channel, URL, explicit feedback and the resulting change. Record GitHub Traffic and stars with date windows separately from observed players. Do not buy stars, swap stars or gate gameplay behind starring the repo.
