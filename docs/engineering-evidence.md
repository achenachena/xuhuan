# Reproduce the engineering evidence

The browser campaign runs the shared Go rules through WebAssembly, keeps progress in memory for the current visit, and does not call the persistent API. This experiment uses the real HTTP router, Telegram signature verifier, game service, run repository, migrations and PostgreSQL. It uses a synthetic player in a disposable schema, not production traffic. There is no public test endpoint or new identity mechanism.

## Retry and stale-client experiment

Prerequisites: the Go toolchain in `apps/api/go.mod` and a local PostgreSQL instance. Do not use a production connection string. The database user must be allowed to create and drop schemas. The existing integration helper isolates the test under a unique schema and removes it afterwards.

With the repository's local Docker dependencies running (`make db-up`):

```sh
cd apps/api
TEST_DATABASE_URL='postgres://xuhuan:local_xuhuan_password@127.0.0.1:5432/xuhuan?sslmode=disable' \
  go test -count=1 -v ./internal/postgres -run '^TestEngineeringRetryEvidence$'
```

Without Docker, use an independently started local PostgreSQL database and set `TEST_DATABASE_URL` to that instance. The committed capture used PostgreSQL 17 on loopback port 55439, a temporary data directory, and an isolated schema. No production credentials were used. No result is claimed if the test is skipped because the variable is missing.

The experiment performs these real operations:

1. Sign synthetic Telegram initData using a test-only key; create a campaign through HTTP.
2. Send `complete_segment` with expected version 1 and a stable idempotency key. The wrapper calls the production handler, lets its transaction commit, then hijacks and closes the HTTP socket before writing the response.
3. Query PostgreSQL: Run version 2, one command row, score 120.
4. Explicitly retry the identical HTTP request. Assert HTTP 200, `Idempotency-Replayed: true`, byte-for-byte equality with the committed response, and unchanged SQL state. Go's automatic transport retry is disabled in the fixture.
5. Submit a new key with stale expected version 1. Assert HTTP 409 and unchanged SQL state.
6. GET the authoritative Run, select a legal show option with version 2, and assert version 3, two command rows and score 120.

The synthetic signature is necessary to exercise the existing production identity check. It is not a guest credential, authentication alternative, or production bot token.

- [Experiment source](../apps/api/internal/postgres/engineering_evidence_test.go)
- [Captured output](evidence/retry-transcript.txt)
- [Transaction implementation](../apps/api/internal/postgres/run_repository.go)
- [Additional concurrency and idempotency cases](../apps/api/internal/postgres/integration_test.go)

The engineering-page video displays this captured output paced for reading; it is not a real-time latency demonstration. The transcript is the source of truth. The test's socket wrapper models response loss after commit, not every possible distributed failure.

## Collision benchmark

```sh
npm ci
node scripts/benchmark-collision.mjs
```

The script loads the current TypeScript collision function and compares it to the array-allocating implementation from commit `7729187`. Both run in the same JavaScript realm. It checks 10,000 deterministic cases, warms up each function with 200,000 calls, then alternates ordering across seven trials of one million calls. It consumes results in a checksum and reports every timing plus medians.

[Captured output](evidence/collision-benchmark.txt) includes the actual Node version and CPU. This supersedes the earlier ad hoc single-run measurement in PR #81; the harness and timings differ. Neither measurement establishes game FPS, battery savings, production throughput or engagement.

## Gameplay footage

The committed gameplay clips document the earlier short prototype, before the full browser campaign replaced it. They were recorded from real Canvas and Web Audio output without modifying combat state, health or timing. The engineering page labels this historical footage. Play the current campaign at `/play`; the retired prototype recording script has been removed.
