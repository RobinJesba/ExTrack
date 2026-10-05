import type { NextConfig } from "next";

const isExport = process.env.NEXT_EXPORT === 'true';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: isExport ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
