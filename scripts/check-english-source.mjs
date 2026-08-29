import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";

const textExtensions = new Set([
  ".css",
  ".example",
  ".graphql",
  ".go",
  ".hcl",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mod",
  ".sh",
  ".sql",
  ".scss",
  ".sum",
  ".svg",
  ".tf",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".yaml",
  ".yml",
]);
const textBasenames = new Set([
  ".dockerignore",
  ".gitignore",
  ".vercelignore",
  "Dockerfile",
  "Makefile",
  "env.example",
]);

// These are deliberate bilingual or historical fixtures. Keep this list exact:
// new exceptions should be reviewed instead of silently exempting whole trees.
const allowedHanFiles = new Set([
  "apps/api/internal/auth/telegram_test.go",
  "apps/api/internal/content/v3/locales/zh-CN.json",
  "apps/api/migrations/001_initial_schema.sql",
  "apps/api/migrations/002_story_roguelite.sql",
  "apps/api/migrations/003_remove_v1_compatibility.sql",
  "apps/api/migrations/004_action_roguelite.sql",
  "apps/api/migrations/005_action_v3_prepare.sql",
  "apps/api/migrations/006_remove_action_v2.sql",
  "apps/miniapp/e2e/roguelite.spec.ts",
  "apps/miniapp/src/locales/zh-CN.json",
]);
const hanPattern = /\p{Script=Han}/u;

const trackedAndUntrackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .sort();

const violations = [];
let scannedFiles = 0;

for (const file of trackedAndUntrackedFiles) {
  if (!existsSync(file)) {
    continue;
  }
  if (
    allowedHanFiles.has(file)
  ) {
    continue;
  }
  if (!textExtensions.has(extname(file)) && !textBasenames.has(basename(file))) {
    continue;
  }

  scannedFiles += 1;
  const lines = readFileSync(file, "utf8").split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (hanPattern.test(lines[index])) {
      violations.push(`${file}:${index + 1}: ${lines[index].trim()}`);
    }
  }
}

if (violations.length > 0) {
  console.error(
    "English-source check failed. Move localized copy into the canonical zh-CN locale document or add a narrowly reviewed fixture exception:\n",
  );
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log(
  `English-source check passed (${scannedFiles} source files scanned).`,
);
