import express from "express";
import cookieParser from "cookie-parser";
const app = express();
import apiRoutes from "./api";
import cors from "cors";
import dotenv from "dotenv";
import https from "https";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { disconnectRedis } from "./utils/redis";

dotenv.config();

const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : ["https://localhost:3000"];
const PORT = parseInt(process.env.PORT || "8443");
const HOSTNAME = process.env.HOSTNAME || "localhost";
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === "true";
const NODE_ENV = process.env.NODE_ENV;
const limiter = rateLimit({
  windowMs: 1 * 10 * 1000, // 10 seconds
  limit: 20,
  // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  message: {
    errorMessage: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
console.log("Cors Origins:", CORS_ORIGINS);
// Apply the rate limiting middleware to all requests.
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: CORS_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

if (NODE_ENV !== "development") {
  app.use(limiter);
}
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    ssl: ENABLE_HTTPS,
  });
});
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
  app.listen(PORT, () => {
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
