import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const contentRoot = path.join(
  repositoryRoot,
  "apps/api/internal/content/v4",
);
const publicRoot = path.join(
  repositoryRoot,
  "apps/miniapp/public/game/v4",
);
const manifest = JSON.parse(
  await readFile(path.join(contentRoot, "manifest.json"), "utf8"),
);

const MEBIBYTE = 1024 * 1024;
const assetBudgets = {
  backgrounds: { maxWidth: 768, maxHeight: 1365, maxBytes: 200 * 1024 },
  bosses: { maxWidth: 512, maxHeight: 512, maxBytes: 200 * 1024 },
  enemies: { maxWidth: 384, maxHeight: 384, maxBytes: 96 * 1024 },
  pickups: { maxWidth: 256, maxHeight: 256, maxBytes: 64 * 1024 },
  players: { maxWidth: 512, maxHeight: 512, maxBytes: 64 * 1024 },
};
const requiredAssets = [
  ...[
    "seventh-dock",
    "always-cheerful",
    "loss-hidden",
    "captains-do-not-rest",
    "localization-failed",
    "which-is-original",
    "laplace-florist",
    "zero-channel",
  ].map((slug) => `/game/v4/backgrounds/${slug}.webp`),
  ...[
    "nana7mi",
    "jiaran",
    "xiangwan",
    "bella",
    "lulu",
    "xingtong",
    "nailu",
  ].map((slug) => `/game/v4/players/${slug}.webp`),
  ...[
    "spam-bot",
    "clip-cutter",
    "caption-blob",
    "black-screen-ghost",
    "gift-thief",
    "censor-frame",
  ].map((slug) => `/game/v4/enemies/${slug}.webp`),
  ...[
    "optimal-nana",
    "always-on-idol",
    "perfect-highlight",
    "perfect-captain",
    "approved-translation",
    "physical-original",
    "reality-auditor",
    "auto-archive-system",
  ].map((slug) => `/game/v4/bosses/${slug}.webp`),
  ...["support-cyan", "support-pink", "support-gold"].map(
    (slug) => `/game/v4/pickups/${slug}.webp`,
  ),
];

const readUInt24LE = (buffer, offset) =>
  buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

const readWebPDimensions = (buffer, asset) => {
  if (
    buffer.length < 20 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    throw new Error(`Invalid WebP container: ${asset}`);
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + chunkSize > buffer.length) {
      throw new Error(`Truncated WebP chunk in ${asset}`);
    }
    if (chunk === "VP8X" && chunkSize >= 10) {
      return {
        width: readUInt24LE(buffer, data + 4) + 1,
        height: readUInt24LE(buffer, data + 7) + 1,
      };
    }
    if (chunk === "VP8L" && chunkSize >= 5 && buffer[data] === 0x2f) {
      const dimensions = buffer.readUInt32LE(data + 1);
      return {
        width: (dimensions & 0x3fff) + 1,
        height: ((dimensions >>> 14) & 0x3fff) + 1,
      };
    }
    if (
      chunk === "VP8 " &&
      chunkSize >= 10 &&
      buffer[data + 3] === 0x9d &&
      buffer[data + 4] === 0x01 &&
      buffer[data + 5] === 0x2a
    ) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    offset = data + chunkSize + (chunkSize & 1);
  }
  throw new Error(`WebP dimensions are missing: ${asset}`);
};

const walk = async (directory, suffix) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute, suffix)));
    else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(absolute);
  }
  return files;
};

const listed = Array.isArray(manifest.assets) ? manifest.assets : [];
const listedSet = new Set(listed);
if (listed.length === 0 || listedSet.size !== listed.length) {
  throw new Error("V4 manifest assets must be a non-empty unique list");
}
if (
  listed.length !== requiredAssets.length ||
  listed.some((asset, index) => asset !== requiredAssets[index])
) {
  throw new Error(
    `V4 manifest must contain the exact ${requiredAssets.length}-file runtime asset set in canonical order`,
  );
}
for (const asset of listed) {
  if (!/^\/game\/v4\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(asset)) {
    throw new Error(`Invalid V4 asset path: ${asset}`);
  }
}

const actual = (await walk(publicRoot, ".webp"))
  .map((filename) =>
    `/game/v4/${path.relative(publicRoot, filename).split(path.sep).join("/")}`,
  )
  .sort();
const actualSet = new Set(actual);
const missing = listed.filter((asset) => !actualSet.has(asset));
const unlisted = actual.filter((asset) => !listedSet.has(asset));
if (missing.length > 0 || unlisted.length > 0) {
  throw new Error(
    `V4 asset manifest mismatch\nMissing: ${missing.join(", ") || "none"}\nUnlisted: ${unlisted.join(", ") || "none"}`,
  );
}

let encodedBytes = 0;
let decodedBytes = 0;
await Promise.all(
  listed.map(async (asset) => {
    const category = asset.split("/")[3];
    const budget = assetBudgets[category];
    if (!budget) throw new Error(`Unknown V4 asset category: ${asset}`);
    const absolute = path.join(publicRoot, asset.slice("/game/v4/".length));
    const buffer = await readFile(absolute);
    const dimensions = readWebPDimensions(buffer, asset);
    if (
      dimensions.width > budget.maxWidth ||
      dimensions.height > budget.maxHeight ||
      buffer.length > budget.maxBytes
    ) {
      throw new Error(
        `V4 asset exceeds its mobile budget: ${asset} is ${dimensions.width}x${dimensions.height}, ${buffer.length} bytes`,
      );
    }
    const decoded = dimensions.width * dimensions.height * 4;
    encodedBytes += buffer.length;
    decodedBytes += decoded;
  }),
);
if (encodedBytes > 4 * MEBIBYTE) {
  throw new Error(`V4 encoded asset catalog exceeds 4 MiB: ${encodedBytes} bytes`);
}
if (decodedBytes > 56 * MEBIBYTE) {
  throw new Error(`V4 decoded asset catalog exceeds 56 MiB: ${decodedBytes} bytes`);
}

const referenced = new Set();
const collectReferences = (value) => {
  if (typeof value === "string") {
    if (value.startsWith("/game/v4/")) referenced.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(collectReferences);
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(collectReferences);
  }
};
for (const filename of await walk(contentRoot, ".json")) {
  if (filename === path.join(contentRoot, "manifest.json")) continue;
  collectReferences(JSON.parse(await readFile(filename, "utf8")));
}
const undeclaredReferences = [...referenced].filter(
  (asset) => !listedSet.has(asset),
);
if (undeclaredReferences.length > 0) {
  throw new Error(
    `Content references undeclared V4 assets: ${undeclaredReferences.join(", ")}`,
  );
}

console.log(
  `Verified ${listed.length} immutable V4 assets and ${referenced.size} authored references (${(encodedBytes / MEBIBYTE).toFixed(2)} MiB encoded, ${(decodedBytes / MEBIBYTE).toFixed(2)} MiB decoded catalog).`,
);
