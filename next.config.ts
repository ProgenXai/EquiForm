import type { NextConfig } from "next";

/** Ensure libvips (.so) is traced into every serverless function that imports sharp. */
const sharpNativeIncludes = [
  "./node_modules/@img/sharp-linux-x64/**/*",
  "./node_modules/@img/sharp-libvips-linux-x64/**/*",
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["canvas", "sharp"],
  outputFileTracingIncludes: {
    "/api/analyze": sharpNativeIncludes,
    "/api/analyze-full": sharpNativeIncludes,
    "/api/progenxai/analyze": sharpNativeIncludes,
    "/api/admin/reexport-all": sharpNativeIncludes,
    "/api/admin/calibration/save": sharpNativeIncludes,
  },
  experimental: {
    proxyClientMaxBodySize: "50mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
