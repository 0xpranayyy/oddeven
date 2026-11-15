import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8787";

const config: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@oddeven/shared"],
  typedRoutes: true,
  async rewrites() {
    // Same-origin REST in the browser: no CORS, cookies-ready for real auth later.
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/v1/:path*` }];
  },
};

export default config;
