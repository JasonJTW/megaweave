import express from "express";
import cookieParser from "cookie-parser";
const app = express();
import apiRoutes from "./api";
import cors from "cors";
import dotenv from "dotenv";
import https from "https";
import path from "path";
import fs from "fs";
import { disconnectRedis } from "./utils/redis";

dotenv.config();

const PORT = parseInt(process.env.PORT || "8443");
const HOSTNAME = process.env.HOSTNAME || "localhost";
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === "true";

app.use(
  cors({
    origin: "https://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use("/api", apiRoutes);

if (ENABLE_HTTPS) {
  const CERT_PATH = process.env.CERT_PATH;
  const KEY_PATH = process.env.KEY_PATH;
  const PASSPHRASE = process.env.PASSPHRASE;

  if (!CERT_PATH || !KEY_PATH || !PASSPHRASE) {
    console.error(
      "HTTPS configuration is incomplete. Please check your .env.development file."
    );
    process.exit(1);
  }
  //* Implement https in local dev env
  const sslServer = https.createServer(
    {
      key: fs.readFileSync(path.join(__dirname, KEY_PATH)),
      cert: fs.readFileSync(path.join(__dirname, CERT_PATH)),
      passphrase: PASSPHRASE, // 替換為你的密碼
    },
    app
  );

  sslServer.listen(PORT, () => {
    console.log(`Secure server listening on port ${PORT}`);
  });
} else {
  app.listen(PORT, HOSTNAME, () => {
    console.log(`Server listening on Port ${PORT}`);
  });
}

process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await disconnectRedis();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  await disconnectRedis();
  process.exit(0);
});
