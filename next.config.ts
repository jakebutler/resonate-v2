import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      { source: "/v2", destination: "/calendar", permanent: false },
      { source: "/v2/research", destination: "/research", permanent: false },
      {
        source: "/v2/research/review/:postId",
        destination: "/research/review/:postId",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
