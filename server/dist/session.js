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
exports.createUserSession = createUserSession;
exports.getUserFromCookie = getUserFromCookie;
exports.getUserSessionFromRedis = getUserSessionFromRedis;
exports.removeUserSession = removeUserSession;
const zod_1 = require("zod");
const schema_1 = require("./schema");
const crypto_1 = __importDefault(require("crypto"));
const redis_1 = require("./utils/redis");
const SESSION_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
const COOKIE_SESSION_KEY = "session-id";
const REDIS_SESSION_KEY = "session";
const sessionSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    role: zod_1.z.enum(schema_1.userRoles),
    username: zod_1.z.string().min(3),
    email: zod_1.z.string().email(),
    provider: zod_1.z.string().optional(),
});
const redisClient = (0, redis_1.getRedisClient)();
function setCookie(res, name, value) {
    res.cookie(name, value, {
        maxAge: SESSION_EXPIRATION_SECONDS * 1000,
        expires: new Date(Date.now() + SESSION_EXPIRATION_SECONDS * 1000),
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
    });
}
function createUserSession(user, req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, redis_1.connectRedis)();
        const sessionId = crypto_1.default.randomBytes(512).toString("hex").normalize();
        const sessionData = JSON.stringify(sessionSchema.parse(user));
        yield redisClient.setEx(`${REDIS_SESSION_KEY}:${sessionId}`, SESSION_EXPIRATION_SECONDS, sessionData);
        setCookie(res, COOKIE_SESSION_KEY, sessionId);
        return sessionId;
    });
}
function getUserFromCookie(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const sessionId = req.cookies[COOKIE_SESSION_KEY];
        if (!sessionId) {
            console.log("cookies:", req.cookies);
            return res.status(401).json({ errorMessage: "Please login first" });
        }
        return yield getUserSessionFromRedis(sessionId, res);
    });
}
function getUserSessionFromRedis(sessionId, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield (0, redis_1.connectRedis)();
            const rawUser = yield redisClient.get(`${REDIS_SESSION_KEY}:${sessionId}`);
            console.log("rawUser from Redis", rawUser);
            if (!rawUser) {
                console.log("No session found for sessionId:", sessionId);
                return res
                    .status(400)
                    .json({ errorMessage: "Session expired or not found" });
            }
            const parsedUser = JSON.parse(rawUser);
            console.log("Parsed User:", parsedUser);
            const { success, data: user } = sessionSchema.safeParse(parsedUser);
            if (!success)
                console.log("⚠️ safeParse success:", success);
            return success
                ? res.status(200).json(user)
                : res.status(400).json({ errorMessage: "Invalid session data" });
        }
        catch (error) {
            console.error("Error retrieving user session from Redis:", error);
            return res.status(500).json({ errorMessage: "Internal server error" });
        }
    });
}
function removeUserSession(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const sessionId = req.cookies[COOKIE_SESSION_KEY];
        if (!sessionId) {
            return res.status(401).json({
                errorMessage: "No session ID found in cookies. Please login first.",
            });
        }
        try {
            yield (0, redis_1.connectRedis)();
            const result = yield redisClient.del(`${REDIS_SESSION_KEY}:${sessionId}`);
            console.log("Delete session from redis result:", result);
            res.clearCookie(COOKIE_SESSION_KEY);
        }
        catch (error) {
            console.error("Error removing user session :", error);
            return res
                .status(500)
                .json({ errorMessage: `Internal server error: ${error}` });
        }
        return res.status(200).json({ message: "Session removed successfully" });
    });
}
//# sourceMappingURL=session.js.map