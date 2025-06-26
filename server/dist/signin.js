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
const express_1 = require("express");
const db_1 = __importDefault(require("./utils/db"));
const validations_1 = require("./validations");
const errorHandler_1 = require("./utils/errorHandler");
const passwordHasher_1 = require("./passwordHasher");
const session_1 = require("./session");
const google_auth_library_1 = require("google-auth-library");
const router = (0, express_1.Router)();
function findOrCreateUser(email, provider, providerData) {
    return __awaiter(this, void 0, void 0, function* () {
        const findQuery = "SELECT * FROM users WHERE email = ?";
        const [existingUsers] = yield db_1.default.query(findQuery, [
            email,
        ]);
        if (existingUsers.length > 0) {
            const existingUser = existingUsers[0];
            let providers = [];
            if (existingUser.providers) {
                try {
                    providers = JSON.parse(existingUser.providers);
                    if (!Array.isArray(providers)) {
                        providers = [];
                    }
                }
                catch (error) {
                    console.error("Error parsing providers JSON:", error);
                    providers = [];
                }
            }
            if (!providers.includes(provider)) {
                providers.push(provider);
            }
            let updateQuery = "UPDATE users SET providers = ?";
            let updateValues = [JSON.stringify(providers)];
            if (provider === "google" &&
                providerData.googleId &&
                !existingUser.google_id) {
                updateQuery += ", google_id = ?";
                updateValues.push(providerData.googleId);
            }
            else if (provider === "facebook" &&
                providerData.facebookId &&
                !existingUser.facebook_id) {
                updateQuery += ", facebook_id = ?";
                updateValues.push(providerData.facebookId);
            }
            else if (provider === "native" &&
                providerData.password &&
                !existingUser.password) {
                updateQuery += ", password = ?, salt = ?";
                updateValues.push(providerData.password, providerData.salt);
            }
            updateQuery += " WHERE email = ?";
            updateValues.push(email);
            yield db_1.default.query(updateQuery, updateValues);
            const [updatedUsers] = yield db_1.default.query(findQuery, [
                email,
            ]);
            return updatedUsers[0];
        }
        else {
            const insertQuery = `
      INSERT INTO users (email, username, password, salt, google_id, facebook_id, providers, role) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
            const insertValues = [
                email,
                providerData.username || email.split("@")[0],
                providerData.password || null,
                providerData.salt || null,
                providerData.googleId || null,
                providerData.facebookId || null,
                JSON.stringify([provider]),
                "user",
            ];
            const [result] = yield db_1.default.query(insertQuery, insertValues);
            const [newUsers] = yield db_1.default.query("SELECT * FROM users WHERE id = ?", [result.insertId]);
            return newUsers[0];
        }
    });
}
router.post("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("API signin called");
    const user = {
        email: req.body.email,
        password: req.body.password,
    };
    let validationResult;
    try {
        validationResult = validations_1.SigninUserSchema.parse(user);
    }
    catch (error) {
        console.error("signin validation error: ", error);
        return (0, errorHandler_1.handleError)(error, res);
    }
    if (!validationResult) {
        return res.status(400).json({ error: "Invalid input" });
    }
    try {
        const query = "SELECT * FROM users WHERE email = ?";
        const [rows] = yield db_1.default.query(query, [user.email]);
        if (rows.length === 0) {
            return res.status(404).json({ errorMessage: "User not found" });
        }
        const foundUser = rows[0];
        let userProviders = [];
        if (foundUser.providers) {
            try {
                userProviders = JSON.parse(foundUser.providers);
                if (!Array.isArray(userProviders)) {
                    userProviders = [];
                }
            }
            catch (error) {
                console.error("Error parsing user providers:", error);
                userProviders = [];
            }
        }
        if (!userProviders.includes("native") &&
            (!foundUser.password || !foundUser.salt)) {
            const availableProviders = userProviders.filter((p) => p !== "native");
            const providerText = availableProviders.length > 0
                ? availableProviders.join(" or ")
                : "social login";
            return res.status(400).json({
                errorMessage: `This email is registered with ${providerText}. Please use ${providerText} to sign in.`,
            });
        }
        const isCorrectPassword = yield (0, passwordHasher_1.verifyPassword)(user.password, foundUser.salt, foundUser.password);
        if (!isCorrectPassword) {
            return res.status(401).json({ errorMessage: "Invalid password" });
        }
        const validUser = {
            username: foundUser.username,
            email: foundUser.email,
            role: foundUser.role,
            userId: foundUser.id.toString(),
            provider: "native",
        };
        yield (0, session_1.createUserSession)(validUser, req, res);
        res.status(200).json({ message: "Signin successful" });
    }
    catch (error) {
        console.error("Database error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}));
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_ID);
function verifyGoogleCredential(credential) {
    return __awaiter(this, void 0, void 0, function* () {
        const ticket = yield googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID,
        });
        return ticket.getPayload();
    });
}
router.post("/google", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("API signin with Google called");
    const { credential } = req.body;
    if (!credential) {
        return res.status(400).json({ errorMessage: "Credential is required" });
    }
    try {
        const googleUser = yield verifyGoogleCredential(credential);
        if (!googleUser || !googleUser.email) {
            return res.status(400).json({ errorMessage: "Invalid Google user" });
        }
        const user = yield findOrCreateUser(googleUser.email, "google", {
            username: googleUser.name,
            googleId: googleUser.sub,
        });
        const googleUserSession = {
            username: user.username,
            email: user.email,
            role: user.role,
            userId: user.id.toString(),
            provider: "google",
        };
        yield (0, session_1.createUserSession)(googleUserSession, req, res);
        return res.status(200).json({ message: "Google sign in successful" });
    }
    catch (error) {
        console.error("Google sign in error: ", error);
        return res.status(500).json({ errorMessage: "Internal server error" });
    }
}));
function verifyFacebookToken(accessToken) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email,picture`);
            if (!response.ok) {
                console.error("Facebook API response not OK:", response.status);
                return null;
            }
            const userData = yield response.json();
            if (userData.error) {
                console.error("Facebook API error:", userData.error);
                return null;
            }
            return userData;
        }
        catch (error) {
            console.error("Error verifying Facebook token:", error);
            return null;
        }
    });
}
router.post("/facebook", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("API signin with Facebook called");
    const { accessToken } = req.body;
    if (!accessToken) {
        return res.status(400).json({ errorMessage: "Access token is required" });
    }
    try {
        const facebookUser = yield verifyFacebookToken(accessToken);
        if (!facebookUser || !facebookUser.email) {
            return res.status(401).json({
                errorMessage: "Invalid Facebook token or email not provided",
            });
        }
        const user = yield findOrCreateUser(facebookUser.email, "facebook", {
            username: facebookUser.name,
            facebookId: facebookUser.id,
        });
        const facebookUserSession = {
            username: user.username,
            email: user.email,
            role: user.role,
            userId: user.id.toString(),
            provider: "facebook",
        };
        yield (0, session_1.createUserSession)(facebookUserSession, req, res);
        return res.status(200).json({ message: "Facebook sign in successful" });
    }
    catch (error) {
        console.error("Facebook sign in error:", error);
        return res.status(500).json({ errorMessage: "Internal server error" });
    }
}));
exports.default = router;
//# sourceMappingURL=signin.js.map