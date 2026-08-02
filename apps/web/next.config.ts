import type { NextConfig } from "next";

// The DB lives on the Mac Mini and is not reachable from Vercel's serverless
// runtime (no fixed egress IP to allowlist). So Vercel renders the UI and
// proxies every DB-touching API route to the Mac Mini, which talks to
// Postgres over the local docker network.
//
// Set API_PROXY_ORIGIN on Vercel only. A Mac Mini container running this same
// app must leave it unset — otherwise it would proxy /api/* to itself in a loop.
const apiProxyOrigin = process.env.API_PROXY_ORIGIN;

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    if (!apiProxyOrigin) return { beforeFiles: [] };
    // beforeFiles, not the plain array form. The array form is `afterFiles`,
    // which only runs when nothing on the filesystem matched — and every
    // /api/* route does exist here, so the proxy would never fire.
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${apiProxyOrigin}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
