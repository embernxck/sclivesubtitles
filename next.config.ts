import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Для образа: Next кладёт в .next/standalone всё нужное вместе с сервером,
  // и в контейнер не нужно тащить node_modules целиком.
  output: "standalone",
  images: {
    // Обложки приходят прямо с CDN SoundCloud.
    remotePatterns: [{ protocol: "https", hostname: "*.sndcdn.com" }],
  },
};

export default config;
