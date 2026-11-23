import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runtime data is mounted independently from the application build.
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./.env*", "./.git/**/*", "./.venv/**/*", "./.codex/**/*", "./docs/**/*", "./openspec/**/*"],
  },
};

export default nextConfig;
