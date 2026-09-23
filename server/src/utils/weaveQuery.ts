export interface BuildWeavesFilterParams {
  userId: number;
  role?: string;
  postId?: number | string;
  status?: string;
}

export function buildWeavesFilter({
  userId,
  role,
  postId,
  status,
}: BuildWeavesFilterParams) {
  let whereClause = `WHERE (w.giver_id = ? OR w.receiver_id = ?)`;
  const params: (string | number)[] = [userId, userId];

  if (role === "giver") {
    whereClause = `WHERE w.giver_id = ?`;
    params.splice(0, 2, userId);
  } else if (role === "receiver") {
    whereClause = `WHERE w.receiver_id = ?`;
    params.splice(0, 2, userId);
  }

  if (postId !== undefined && postId !== null && postId !== "") {
    whereClause += ` AND w.post_id = ?`;
    params.push(Number(postId));
  }

  if (status && typeof status === "string") {
    whereClause += ` AND w.status = ?`;
    params.push(status);
  }

  return { whereClause, params };
}
