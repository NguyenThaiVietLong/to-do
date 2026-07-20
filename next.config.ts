import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the sidebar footer and covers the
  // Dashboard link. Nothing is lost by hiding it.
  devIndicators: false,
};

export default nextConfig;
