import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NODE_ENV === 'production' ? '/blockchain-webapp' : '',
  images: { unoptimized: true }
};

export default nextConfig;
