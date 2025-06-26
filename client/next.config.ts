import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  serverRuntimeConfig: {
    ...(process.env.NODE_ENV === "development" &&
    process.env.USE_HTTPS === "true"
      ? {
          https: {
            key: fs.readFileSync(
              path.join(__dirname, "../server/cert", "myCA.key")
            ),
            cert: fs.readFileSync(
              path.join(__dirname, "../server/cert", "myCA.pem")
            ),
            passphrase: "jgh0965102587", // 替換為你的密碼
          },
        }
      : {}),
  },
};

export default nextConfig;
