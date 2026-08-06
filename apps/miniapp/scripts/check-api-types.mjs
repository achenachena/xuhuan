import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const miniAppDirectory = resolve(scriptDirectory, "..");
const schemaPath = resolve(miniAppDirectory, "../api/openapi/openapi.yaml");
const committedPath = resolve(miniAppDirectory, "src/lib/api/generated.ts");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "xuhuan-api-types-"));
const generatedPath = join(temporaryDirectory, "generated.ts");

try {
  execFileSync("openapi-typescript", [schemaPath, "-o", generatedPath], {
    cwd: miniAppDirectory,
    stdio: "inherit"
  });
  const committed = readFileSync(committedPath);
  const generated = readFileSync(generatedPath);
  if (!committed.equals(generated)) {
    console.error("Generated API types are stale. Run npm run generate:api-types --workspace apps/miniapp.");
    process.exitCode = 1;
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
