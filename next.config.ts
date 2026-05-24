import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["canvas"],
  experimental: {
    proxyClientMaxBodySize: "20mb",
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
