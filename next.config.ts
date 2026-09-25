import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    // Обложки приходят прямо с CDN SoundCloud.
    remotePatterns: [{ protocol: "https", hostname: "*.sndcdn.com" }],
  },
};

export default config;
