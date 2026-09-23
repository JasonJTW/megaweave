import { z } from "zod";
import type { WeaveStatus } from "./weaveService";

export const WeavesListQuerySchema = z.object({
  role: z.enum(["giver", "receiver"]).optional(),
  postId: z.coerce.number().int().positive().optional(),
  status: z
    .enum(["requested", "pending", "completed", "rejected", "cancelled"])
    .optional(),
});

export interface BuildWeavesFilterParams {
  userId: number;
  role?: "giver" | "receiver";
  postId?: number;
  status?: WeaveStatus;
}

export function buildWeavesFilter({
  userId,
  role,
  postId,
  status,
}: BuildWeavesFilterParams) {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (role === "giver") {
    conditions.push("w.giver_id = ?");
    params.push(userId);
  } else if (role === "receiver") {
    conditions.push("w.receiver_id = ?");
    params.push(userId);
  } else {
    conditions.push("(w.giver_id = ? OR w.receiver_id = ?)");
    params.push(userId, userId);
  }

  if (postId !== undefined) {
    conditions.push("w.post_id = ?");
    params.push(postId);
  }

  if (status !== undefined) {
    conditions.push("w.status = ?");
    params.push(status);
  }

  return { whereClause: `WHERE ${conditions.join(" AND ")}`, params };
}
