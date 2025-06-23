import { z } from "zod";
import { User } from "./types/user";

export const UserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  createdAt: z.date(),
  updatedAt: z.date(),
  role: z.enum(["admin", "user"]),
});

//* Schema for user signup, omitting (delete/skip) fields that are not required during signup
export const SignupUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  role: true,
});

export const UpdateUserSchema = UserSchema.partial({
  username: true,
  email: true,
  password: true,
  createdAt: true,
  updatedAt: true,
}).required({
  id: true,
});

export const SigninUserSchema = UserSchema.omit({
  id: true,
  username: true,
  createdAt: true,
  updatedAt: true,
  role: true,
});

export type UserSchemaType = z.infer<typeof UserSchema>;
export type SignupUserSchemaType = z.infer<typeof SignupUserSchema>;
export type UpdateUserSchemaType = z.infer<typeof UpdateUserSchema>;
export type SigninUserSchemaType = z.infer<typeof SigninUserSchema>;
