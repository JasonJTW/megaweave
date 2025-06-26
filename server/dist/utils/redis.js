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
exports.connectRedis = connectRedis;
exports.disconnectRedis = disconnectRedis;
exports.getRedisClient = getRedisClient;
exports.isRedisConnected = isRedisConnected;
const client_1 = require("@redis/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const redisClient = (0, client_1.createClient)({
    url: process.env.REDIS_URL,
});
redisClient.on("error", (err) => {
    console.error("Redis Client Error", err);
});
redisClient.on("connect", () => {
    console.log("Redis client connected successfully.");
});
redisClient.on("disconnect", () => {
    console.log("Redis client disconnected.");
});
function connectRedis() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!redisClient.isOpen) {
                console.log("Connecting to Redis...");
                yield redisClient.connect();
            }
        }
        catch (error) {
            console.error("Failed to connect to Redis:", error);
            throw new Error("Redis connection failed");
        }
    });
}
function disconnectRedis() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (redisClient.isOpen) {
                console.log("Disconnecting from Redis...");
                yield redisClient.quit();
                console.log("Redis client disconnected successfully.");
            }
        }
        catch (error) {
            console.error("Error disconnecting Redis client:", error);
        }
    });
}
function getRedisClient() {
    return redisClient;
}
function isRedisConnected() {
    return redisClient.isOpen;
}
//# sourceMappingURL=redis.js.map