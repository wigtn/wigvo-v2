import { resolve } from "path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Monorepo: 루트 .env 에서 환경변수 로드
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
