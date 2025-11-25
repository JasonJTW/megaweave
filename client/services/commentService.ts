// services/commentService.ts

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

// ============ 型別定義 ============

export interface Comment {
  id: number;
  post_id: number;
  item_id: number | null;
  parent_id: number | null;
  user_id: number;
  public_id: string;
  username?: string;
  avatar_url?: string;
  content: string;
  root_id: number | null;
  depth: number;
  path: string;
  like_count: number;
  reply_count: number;
  created_at: string;
  children: Comment[];
  is_private: boolean;
}

export interface CreateCommentParams {
  post_id: number;
  item_id?: number | null; // null = "All"
  parent_id?: number | null;
  user_id: number;
  content: string;
  public_id: string;
}

export interface CommentsResponse {
  post_id: number;
  total: number;
  comments: Record<string, Comment[]>; // { all: [], item_1: [], item_2: [] }
}

export interface CommentCountsResponse {
  post_id: number;
  counts: Record<string, number>; // { all: 2, item_1: 3 }
}

// ============ API 函式 ============

/**
 * 創建留言
 */
export async function createComment(
  params: CreateCommentParams
): Promise<Comment> {
  const res = await fetch(`${hostName}/api/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", // 如果有用 cookie 驗證
    body: JSON.stringify({
      post_id: params.post_id,
      item_id: params.item_id ?? null,
      parent_id: params.parent_id ?? null,
      user_id: params.user_id,
      content: params.content,
      public_id: params.public_id,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to create comment");
  }

  return res.json();
}

/**
 * 取得留言列表
 * @param postId - 文章 ID
 * @param itemId - "all" = "All" 的留言, 數字 = 特定 item, 不傳 = 全部留言
 */
export async function getComments(
  postId: number,
  itemId?: number | "all" //
): Promise<CommentsResponse> {
  let url = `${hostName}/api/comments?post_id=${postId}`;

  if (itemId !== undefined) {
    url += `&item_id=${itemId}`;
  }
  // undefined = 不加參數，取全部留言

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to fetch comments");
  }

  return res.json();
}

/**
 * 取得各 item 的留言數量
 */
export async function getCommentCounts(
  postId: number
): Promise<CommentCountsResponse> {
  const res = await fetch(`${hostName}/api/comments/counts?post_id=${postId}`, {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to fetch comment counts");
  }

  return res.json();
}
