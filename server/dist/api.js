"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const signup_1 = __importDefault(require("./signup"));
const signin_1 = __importDefault(require("./signin"));
const currentUser_1 = __importDefault(require("./currentUser"));
const signout_1 = __importDefault(require("./signout"));
router.post("/test", (req, res) => {
    console.log("API test called");
    res.json({ message: "You're inside docker!" });
});
router.get("/test", (req, res) => {
    console.log("API test called");
    res.json({ message: "You're inside docker!" });
});
router.use("/signup", signup_1.default);
router.use("/signin", signin_1.default);
router.use("/currentUser", currentUser_1.default);
router.use("/signout", signout_1.default);
exports.default = router;
//# sourceMappingURL=api.js.map