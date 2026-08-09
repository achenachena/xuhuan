/** @type {import('next').NextConfig} */
const config = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: {
    position: "top-right"
  },
  images: {
    remotePatterns: [
      new URL("https://lsx1nt3pdo55zsho.public.blob.vercel-storage.com/**")
    ]
  },
  reactStrictMode: true,
  typedRoutes: true
};

export default config;
