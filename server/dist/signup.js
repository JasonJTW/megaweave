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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const validations_1 = require("./validations");
const passwordHasher_1 = require("./passwordHasher");
const errorHandler_1 = require("./utils/errorHandler");
const router = express_1.default.Router();
const db_1 = __importDefault(require("./utils/db"));
const session_1 = require("./session");
const schema_1 = require("./schema");
router.post("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("API signup called");
    const user = {
        id: 0,
        username: req.body.username,
        email: req.body.email,
        password: req.body.password,
        salt: "",
    };
    console.log(`User:`, user);
    let validationResult;
    try {
        validationResult = validations_1.SignupUserSchema.parse(user);
        console.log("Validation result:", validationResult);
    }
    catch (error) {
        console.log(`Validation result:`, validationResult);
        console.error(`Validation error:`, error);
        return (0, errorHandler_1.handleError)(error, res);
    }
    let userExisted;
    let result;
    try {
        const [rows] = yield db_1.default.query("SELECT * FROM users WHERE email = ?", [req.body.email]);
        result = rows[0];
        console.log(`Check user exists result:`, result);
        if (result) {
            userExisted = true;
            console.log(`User already exists`);
            return res.status(400).json({ errorMessage: "User already exists" });
        }
        userExisted = false;
    }
    catch (error) {
        console.error(`Error checking if user exists: `, error);
        console.log(`result`, result);
        return (0, errorHandler_1.handleError)(error, res);
    }
    console.log(`userExisted:`, userExisted);
    const salt = (0, passwordHasher_1.generateSalt)();
    const hashedPassword = yield (0, passwordHasher_1.hashPassword)(user.password, salt);
    console.log("hashedPassword:", hashedPassword);
    console.log("salt:", salt);
    user.password = hashedPassword;
    user.salt = salt;
    console.log("user after hashing password:", user);
    try {
        const query = `INSERT INTO users (username, email, password, salt, providers) VALUES (?, ?, ?, ?, ?)`;
        const [result] = yield db_1.default.query(query, [
            user.username,
            user.email,
            user.password,
            user.salt,
            JSON.stringify(["native"]),
        ]);
        console.log("Insert user result:", result);
        const userSession = {
            userId: result.insertId.toString(),
            role: schema_1.userRoles[1],
            username: user.username,
            email: user.email,
        };
        yield (0, session_1.createUserSession)(userSession, req, res);
        console.log("User session created:", userSession);
    }
    catch (error) {
        return (0, errorHandler_1.handleError)(error, res);
    }
    console.log("---------");
    res
        .status(200)
        .json({ message: "API signup called successfully!", user: user });
}));
exports.default = router;
//# sourceMappingURL=signup.js.map