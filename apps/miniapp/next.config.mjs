const isDevelopment = process.env.NODE_ENV !== "production";

const safeOrigin = (value) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (isDevelopment && url.protocol === "http:")) {
      return url.origin;
    }
  } catch {
    // Environment validation in the application reports the actionable error.
  }
  return undefined;
};

const connectSources = new Set(["'self'", "https://*.telegram.org"]);
const mediaSources = new Set(["'self'", "blob:"]);
const scriptSources = ["'self'", "'unsafe-inline'"];
for (const value of [process.env.NEXT_PUBLIC_API_URL]) {
  const origin = safeOrigin(value);
  if (origin) connectSources.add(origin);
}
for (const value of [
  process.env.NEXT_PUBLIC_AUDIO_BASE_URL,
  process.env.NEXT_PUBLIC_AUDIO_BGM,
  process.env.NEXT_PUBLIC_AUDIO_SPECIAL_MOVE,
  process.env.NEXT_PUBLIC_AUDIO_DAMAGE,
  process.env.NEXT_PUBLIC_AUDIO_VICTORY,
  process.env.NEXT_PUBLIC_AUDIO_DEFEAT,
]) {
  const origin = safeOrigin(value);
  if (origin) mediaSources.add(origin);
}
if (isDevelopment) {
  connectSources.add("http:");
  connectSources.add("ws:");
  scriptSources.push("'unsafe-eval'");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src ${[...connectSources].join(" ")}`,
  "font-src 'self' data:",
  "form-action 'none'",
  "frame-ancestors https://telegram.org https://*.telegram.org",
  "img-src 'self' data: blob:",
  `media-src ${[...mediaSources].join(" ")}`,
  "object-src 'none'",
  `script-src ${scriptSources.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:"
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" }
];
const immutableGameAssetHeaders = [
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
];
if (!isDevelopment) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  });
}

/** @type {import('next').NextConfig} */
const config = {
  allowedDevOrigins: ["127.0.0.1"],
  // Telegram owns the viewport corners. The development toolbar would cover
  // the language control and make local touch testing differ from production.
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/game/v3/:path*", headers: immutableGameAssetHeaders }
    ];
  },
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true
};

export default config;
