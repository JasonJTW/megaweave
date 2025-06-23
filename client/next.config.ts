import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

console.log(
  "Loading key from:",
  path.join(__dirname, "../server/cert", "key.pem")
);
console.log(
  "Loading cert from:",
  path.join(__dirname, "../server/cert", "cert.pem")
);

const nextConfig: NextConfig = {
  /* config options here */
  serverRuntimeConfig: {
    https: {
      key: fs.readFileSync(path.join(__dirname, "../server/cert", "myCA.key")),
      cert: fs.readFileSync(path.join(__dirname, "../server/cert", "myCA.pem")),
      passphrase: "jgh0965102587", // 替換為你的密碼
    },
  },
};

export default nextConfig;
