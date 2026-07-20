import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the sidebar footer and covers the
  // Dashboard link. Nothing is lost by hiding it.
  devIndicators: false,

  // Ship a self-contained server so the Docker image doesn't carry node_modules.
  output: "standalone",
};

export default nextConfig;
