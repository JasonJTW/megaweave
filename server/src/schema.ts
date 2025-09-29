import { z } from "zod";
export const userRoles = ["user", "admin", "contributor"] as const;
export type UserRole = (typeof userRoles)[number];

export const sessionSchema = z.object({
  userId: z.string(),
  role: z.enum(userRoles),
  username: z.string().min(3),
  email: z.string().email(),
  provider: z.string().optional(),
  avatar_url: z.string().url().optional(),
  avatar_key: z.string().optional(),
});

export type UserSession = z.infer<typeof sessionSchema>;
