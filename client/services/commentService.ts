// services/commentService.ts
import { api, type ApiPath } from "@/lib/api";

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
  params: CreateCommentParams,
): Promise<Comment> {
  return api<Comment>("/api/comments", {
    method: "POST",
    body: {
      post_id: params.post_id,
      item_id: params.item_id ?? null,
      parent_id: params.parent_id ?? null,
      user_id: params.user_id,
      content: params.content,
      public_id: params.public_id,
    },
  });
}

/**
 * 取得留言列表
 * @param postId - 文章 ID
 * @param itemId - "all" = "All" 的留言, 數字 = 特定 item, 不傳 = 全部留言
 */
export async function getComments(
  postId: number,
  itemId?: number | "all", //
): Promise<CommentsResponse> {
  let path: ApiPath = `/api/comments?post_id=${postId}`;

  if (itemId !== undefined) {
    path = `${path}&item_id=${itemId}`;
  }
  // undefined = 不加參數，取全部留言

  return api<CommentsResponse>(path);
}

/**
 * 取得各 item 的留言數量
 */
export async function getCommentCounts(
  postId: number,
): Promise<CommentCountsResponse> {
  return api<CommentCountsResponse>(`/api/comments/counts?post_id=${postId}`);
}
