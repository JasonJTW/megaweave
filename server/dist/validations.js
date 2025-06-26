"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SigninUserSchema = exports.UpdateUserSchema = exports.SignupUserSchema = exports.UserSchema = void 0;
const zod_1 = require("zod");
exports.UserSchema = zod_1.z.object({
    id: zod_1.z.number().int().positive(),
    username: zod_1.z.string().min(3, "Username must be at least 3 characters"),
    email: zod_1.z.string().email("Invalid email format"),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
    role: zod_1.z.enum(["admin", "user"]),
});
exports.SignupUserSchema = exports.UserSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    role: true,
});
exports.UpdateUserSchema = exports.UserSchema.partial({
    username: true,
    email: true,
    password: true,
    createdAt: true,
    updatedAt: true,
}).required({
    id: true,
});
exports.SigninUserSchema = exports.UserSchema.omit({
    id: true,
    username: true,
    createdAt: true,
    updatedAt: true,
    role: true,
});
//# sourceMappingURL=validations.js.map