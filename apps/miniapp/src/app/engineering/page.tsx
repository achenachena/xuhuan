import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

const repo = "https://github.com/achenachena/xuhuan";
export const metadata: Metadata = {
  title: "Engineering Xuhuan — Play first. Look under the hood.",
  description: "A playable Canvas shooter, retry-safe Go/PostgreSQL progression, and the engineering decisions behind a small production game.",
  alternates: { canonical: "/engineering" },
  openGraph: { title: "Engineering Xuhuan", url: "/engineering", description: "Turn enemies into fans. See how the game is built." },
};

const EngineeringPage = () => {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Engineering navigation">
        <Link href="/">XUHUAN <span>ONLY ONE ONLINE</span></Link>
        <a href={repo}>Source ↗</a>
      </nav>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>A SMALL GAME. THE WHOLE SYSTEM.</p>
          <h1>Turn enemies into fans.<br /><em>Bring the music back.</em></h1>
          <p className={styles.intro}>A 90-second browser shooter. No signup. Break a control core, turn its bullets into support, and bring a robot into your audience.</p>
          <div className={styles.actions}><Link className={styles.primary} href="/demo">Play the demo →</Link><a href="#reliable-progress">Explore the engineering ↓</a></div>
          <p className={styles.caption}>Built with Go, PostgreSQL, TypeScript and Canvas. Designed for one-thumb play in Telegram.</p>
        </div>
        <figure className={styles.film}>
          <video controls playsInline preload="none" poster="/engineering/gameplay-poster.webp" aria-label="An 18-second real browser recording of the opening core reversal">
            <source src="/engineering/gameplay.mp4" type="video/mp4" />
            <track kind="captions" src="/engineering/gameplay.en.vtt" srcLang="en" label="English" default />
          </video>
          <figcaption>01 / Actual browser capture. Aim → reverse → recruit. <a href="/engineering/gameplay.mp4" download>Download clip</a></figcaption>
        </figure>
      </header>

      <section className={styles.section} aria-labelledby="architecture">
        <p className={styles.eyebrow}>01 / TWO EXPERIENCES, ONE RUNTIME</p>
        <h2 id="architecture">Fast under your thumb.<br />Durable where it matters.</h2>
        <div className={styles.architecture} role="img" aria-label="The anonymous browser demo runs a local Canvas simulation with static manifests, without protected API calls. Telegram verifies initData through a Go Lambda API, storing durable progress in PostgreSQL. Redis stores disposable rate-limit counters only.">
          <div><b>Browser demo</b><span>Canvas + static manifests</span><small>No account · no saved progress</small></div>
          <div><b>Telegram campaign</b><span>Same Canvas runtime</span><small>↓ Raw Telegram initData</small></div>
          <div><b>Go / AWS Lambda</b><span>Legal transitions + retries</span><small>↓ Atomic transactions</small></div>
          <div><b>PostgreSQL / Neon</b><span>Runs, commands, progress</span><small>Redis / Upstash: rate limits only</small></div>
        </div>
        <p className={styles.note}>The public browser demo does not exercise the persistent API. The evidence below uses the actual backend in an isolated local test environment; it is not production player traffic.</p>
      </section>

      <section id="reliable-progress" className={styles.section}>
        <p className={styles.eyebrow}>02 / RELIABLE PROGRESS</p>
        <h2>The request succeeded.<br /><em>The response never arrived.</em></h2>
        <p className={styles.intro}>A mobile client cannot tell whether to retry safely just because its connection broke. The server must remember what it already applied.</p>
        <div className={styles.columns}>
          <div>
            <ol className={styles.sequence}>
              <li><b>Commit, then lose the connection</b><p>A real HTTP handler commits a room result. A test wrapper closes the socket before sending the response.</p></li>
              <li><b>Repeat the exact request</b><p>The same idempotency key returns the stored response. The score remains 120, with one command row and Run version 2.</p></li>
              <li><b>Reject stale state, then recover</b><p>A new key with version 1 returns 409. The client reloads version 2 and submits its next legal choice, advancing to version 3.</p></li>
            </ol>
            <p>A PostgreSQL transaction combines a Run row lock, request comparison, expected version, command response and progress update. Idempotency protects retries; version checks protect against stale clients.</p>
            <div className={styles.links}><a href={`${repo}/blob/main/apps/api/internal/postgres/run_repository.go`}>Read the transaction ↗</a><a href={`${repo}/blob/main/docs/engineering-evidence.md`}>Reproduce this experiment ↗</a></div>
          </div>
          <div>
            <div className={styles.terminal}>
              <p>ISOLATED HTTP + POSTGRESQL / OBSERVED</p>
              <pre>{`POST room result → response lost\nSQL: version=2, commands=1, score=120\n\nRETRY same key → 200, replayed=true\nSQL: version=2, commands=1, score=120\n\nNEW KEY + stale version → 409\nGET run → version=2\nPOST next legal choice → 200\nSQL: version=3, commands=2, score=120`}</pre>
            </div>
            <p className={styles.caption}><a href={`${repo}/blob/main/docs/evidence/retry-transcript.txt`}>Recorded test output ↗</a> · Synthetic player · disposable database schema</p>
            <video className={styles.evidenceVideo} controls playsInline preload="none" aria-label="Captured HTTP and PostgreSQL test output, paced for reading">
              <source src="/engineering/retry-evidence.mp4" type="video/mp4" />
              <track kind="captions" src="/engineering/retry.en.vtt" srcLang="en" label="English" default />
            </video>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.eyebrow}>03 / MEASURE BEFORE CLAIMING</p>
        <h2>Less work in the hot path.</h2>
        <div className={styles.columns}>
          <div><h3>Collision checks without axis arrays</h3><p>Each moving projectile is tested against an enemy body. Removing temporary arrays reduces allocation in this frequently executed path while preserving the intersection algorithm.</p><p>A deterministic comparison checks 10,000 trajectories before timing both versions. Run the benchmark on your own machine; results depend on the runtime and workload.</p><div className={styles.links}><a href={`${repo}/blob/main/scripts/benchmark-collision.mjs`}>Run the comparison ↗</a><a href={`${repo}/blob/main/docs/evidence/collision-benchmark.txt`}>Measured output ↗</a></div></div>
          <aside className={styles.callout}>
            <table className={styles.measurements}>
              <caption>Median time · 1,000,000 collision checks</caption>
              <tbody><tr><th scope="row">Before: temporary arrays</th><td>38.81 ms</td></tr><tr><th scope="row">After: scalar bounds</th><td>31.50 ms</td></tr></tbody>
            </table>
            <p>Apple M4 · macOS arm64 · Node 22.18.0. Seven alternating trials after 200,000 warmup calls per function; identical results across 10,000 seeded trajectories.</p>
            <hr /><b>Microbenchmark ≠ frame rate.</b><p>This measures collision-function execution, not full-game FPS, mobile battery life or real-user throughput. No production engagement or scale claim is implied.</p><hr /><b>30 Hz simulation, interpolated rendering.</b><p>The browser updates combat locally. A completed room produces one bounded result rather than frame-by-frame network traffic.</p></aside>
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.eyebrow}>04 / THE DECISIONS THAT KEPT IT SMALL</p>
        <h2>Constraints shaped the architecture.</h2>
        <div className={styles.decisions}>
          <article><h3>One identity boundary</h3><p>Telegram initData is verified on the server. No additional JWT, session service or paid identity provider is needed for the campaign.</p></article>
          <article><h3>Local combat, server-owned progress</h3><p>This free single-player game has no economy or global leaderboard. Bounded client results are an explicit trust trade-off; the API enforces ownership and legal durable transitions.</p></article>
          <article><h3>Small operational footprint</h3><p>Lambda, Vercel, Neon and disposable Redis counters. No VPC, NAT gateway, Kubernetes cluster or frame-by-frame server replay.</p></article>
        </div>
        <p className={styles.note}>Verification includes Go tests, PostgreSQL/Redis integration, generated API contracts, content validation, browser journeys and dependency checks. <a href={`${repo}/actions/workflows/ci.yml`}>Inspect CI runs ↗</a></p>
      </section>
      <footer className={styles.footer}>
        <h2>Try the game.<br />Ask about the trade-offs.</h2>
        <div className={styles.actions}><Link className={styles.primary} href="/demo">Play in your browser →</Link><a href={repo}>Explore the repository ↗</a></div>
        <p>Unofficial, non-commercial fan project. Character rights belong to their respective holders. See the repository for art provenance. Independent player testing is pending; automated tests do not establish that the game is fun.</p>
      </footer>
    </main>
  );
};

export default EngineeringPage;
