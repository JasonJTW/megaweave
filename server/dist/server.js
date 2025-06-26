"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const app = (0, express_1.default)();
const api_1 = __importDefault(require("./api"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const https_1 = __importDefault(require("https"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const redis_1 = require("./utils/redis");
dotenv_1.default.config();
const PORT = parseInt(process.env.PORT || "8443");
const HOSTNAME = process.env.HOSTNAME || "localhost";
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === "true";
app.use((0, cors_1.default)({
    origin: "https://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use("/api", api_1.default);
if (ENABLE_HTTPS) {
    const CERT_PATH = process.env.CERT_PATH;
    const KEY_PATH = process.env.KEY_PATH;
    const PASSPHRASE = process.env.PASSPHRASE;
    if (!CERT_PATH || !KEY_PATH || !PASSPHRASE) {
        console.error("HTTPS configuration is incomplete. Please check your .env.development file.");
        process.exit(1);
    }
    const sslServer = https_1.default.createServer({
        key: fs_1.default.readFileSync(path_1.default.join(__dirname, KEY_PATH)),
        cert: fs_1.default.readFileSync(path_1.default.join(__dirname, CERT_PATH)),
        passphrase: PASSPHRASE,
    }, app);
    sslServer.listen(PORT, () => {
        console.log(`Secure server listening on port ${PORT}`);
    });
}
else {
    app.listen(PORT, () => {
        console.log(`Server listening on Port ${PORT}`);
    });
}
process.on("SIGINT", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Shutting down gracefully...");
    yield (0, redis_1.disconnectRedis)();
    process.exit(0);
}));
process.on("SIGTERM", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Shutting down gracefully...");
    yield (0, redis_1.disconnectRedis)();
    process.exit(0);
}));
//# sourceMappingURL=server.js.map