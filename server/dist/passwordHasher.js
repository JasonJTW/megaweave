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
exports.hashPassword = hashPassword;
exports.generateSalt = generateSalt;
exports.verifyPassword = verifyPassword;
const crypto_1 = __importDefault(require("crypto"));
function hashPassword(password, salt) {
    return new Promise((resolve, reject) => {
        crypto_1.default.scrypt(password.normalize(), salt, 64, (error, hash) => {
            if (error)
                reject(error);
            resolve(hash.toString("hex").normalize());
        });
    });
}
function generateSalt() {
    return crypto_1.default.randomBytes(16).toString("hex").normalize();
}
function verifyPassword(password, salt, hashedPassword) {
    return __awaiter(this, void 0, void 0, function* () {
        const inputHashedPassword = yield hashPassword(password, salt);
        console.log("inputHashedPassword:", inputHashedPassword);
        console.log("hashedPassword:", hashedPassword);
        console.log("salt:", salt);
        return crypto_1.default.timingSafeEqual(Buffer.from(inputHashedPassword, "hex"), Buffer.from(hashedPassword, "hex"));
    });
}
//# sourceMappingURL=passwordHasher.js.map