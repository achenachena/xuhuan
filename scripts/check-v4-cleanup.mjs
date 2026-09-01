import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((file) => file && existsSync(file));

const forbiddenPaths = [
  "apps/api/internal/action/",
  "apps/api/internal/content/v3/",
  "apps/miniapp/public/game/v3/",
  "apps/miniapp/src/features/action/",
  "apps/miniapp/src/features/game/route-map.tsx",
  "apps/miniapp/src/features/game/screens/event-screen.tsx",
  "apps/miniapp/src/features/game/screens/rest-screen.tsx",
  "apps/miniapp/src/features/game/screens/reward-screen.tsx",
  "docs/action-v3-release.md",
];

const stalePaths = files.filter((file) =>
  forbiddenPaths.some(
    (path) => file === path || (path.endsWith("/") && file.startsWith(path)),
  ),
);

const activeSource = files.filter(
  (file) =>
    file !== "scripts/check-v4-cleanup.mjs" &&
    (file === "apps/api/openapi/openapi.yaml" ||
      file.startsWith("apps/api/internal/") ||
      file.startsWith("apps/api/cmd/") ||
      file.startsWith("apps/miniapp/e2e/") ||
      file.startsWith("apps/miniapp/scripts/") ||
      file.startsWith("apps/miniapp/src/")) &&
    !file.startsWith("apps/api/internal/content/v4/locales/zh-CN"),
);

const forbiddenMarkers = [
  "action-v2",
  "/v2/content/v3",
  "complete_encounter",
  "choose_node",
  "choose_module_reward",
  "reroll_module_reward",
  "incomplete_encounter",
  "prediction_digest",
  "rle8-v1",
  "retention-protocol",
  "companion_ids",
  "show_option_ids",
  "show_effect_ids",
  "highest_noise_level",
  "noise_level",
  "tutorialWarp",
  "effectWarp",
  "signalWeave",
  "hazardDistortionRain",
  "request_hash",
  "start_request_hash",
  "share_token",
  "share-token",
  "payment_intent",
  "jsonwebtoken",
  "stripe",
];
// Migration boundary tests must name the retired columns they prove are
// removed. They are executable cleanup evidence, not an active V3 contract.
const migrationBoundaryMarkers = new Map([
  [
    "apps/api/internal/postgres/integration_test.go",
    new Set([
      "highest_noise_level",
      "noise_level",
      "request_hash",
      "start_request_hash",
    ]),
  ],
  [
    "apps/api/internal/postgres/migrate_test.go",
    new Set(["request_hash", "share_token"]),
  ],
]);
const staleMarkers = [];
for (const file of activeSource) {
  const text = readFileSync(file, "utf8");
  for (const marker of forbiddenMarkers) {
    if (
      text.includes(marker) &&
      !migrationBoundaryMarkers.get(file)?.has(marker)
    ) {
      staleMarkers.push(`${file}: ${marker}`);
    }
  }
}

if (stalePaths.length > 0 || staleMarkers.length > 0) {
  console.error("Action V3 cleanup check failed.");
  if (stalePaths.length > 0) {
    console.error(`Stale paths:\n${stalePaths.join("\n")}`);
  }
  if (staleMarkers.length > 0) {
    console.error(`Stale active-source markers:\n${staleMarkers.join("\n")}`);
  }
  process.exit(1);
}

const releaseWorkflow = readFileSync(
  ".github/workflows/release-production.yml",
  "utf8",
);
const orderedReleaseMarkers = [
  "go run ./cmd/migrate -target=7",
  "- name: Switch live alias to the immutable candidate",
  "- name: Run signed production V4 journey",
  "go run ./cmd/migrate -target=8",
  "- name: Remove synthetic production smoke player",
];
let previousReleaseMarker = -1;
for (const marker of orderedReleaseMarkers) {
  const index = releaseWorkflow.indexOf(marker);
  if (index <= previousReleaseMarker) {
    console.error(
      `Production release safety order is missing or invalid at: ${marker}`,
    );
    process.exit(1);
  }
  previousReleaseMarker = index;
}
const ownershipCheck = releaseWorkflow.indexOf(
  'if test "$identity_available" != "t"',
);
const cleanupTarget = releaseWorkflow.indexOf(
  'echo "synthetic_telegram_user_id=$smoke_telegram_user_id" >> "$GITHUB_OUTPUT"',
);
if (ownershipCheck < 0 || cleanupTarget <= ownershipCheck) {
  console.error(
    "Synthetic smoke cleanup target must be exposed only after its ownership check.",
  );
  process.exit(1);
}
const migrationCommands = releaseWorkflow.match(
  /go run \.\/cmd\/migrate(?:\s|$)[^;|\n]*/gu,
) ?? [];
if (
  migrationCommands.length !== 2 ||
  !migrationCommands.some((command) => command.includes("-target=7")) ||
  !migrationCommands.some((command) => command.includes("-target=8"))
) {
  console.error(
    "Production migrations must use exactly the explicit prepare and cleanup targets.",
  );
  process.exit(1);
}

console.log(
  `V4 cleanup check passed (${activeSource.length} active source files scanned).`,
);
