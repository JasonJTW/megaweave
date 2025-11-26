//* schema.ts

export interface Post {
  id: number;
  title: string;
  content: string;
  type: "wish" | "share" | "commons";
  status: "active" | "inactive" | "expired";
  location?: string;
  tags?: string;
  category_id: number;
  condition_level: number;
  expires_at?: string;
  view_count: number;
  likes_count: number;
  created_at: string;
  updated_at: string;
  username: string;
  category_name_en: string;
  image_urls?: string;
  thumbnail_urls?: string;
  avatar_url?: string;
  items?: Item[];
  author_public_id: string;
}

export interface CreatePostFormData {
  title: string;
  content: string;
  location: string;
  tags: string;
  categoryId: number | null;
  conditionLevel: number | null;
  type: Post["type"];
  items?: ItemInput[];
}

export interface Item {
  id: number;
  post_id: number;
  title: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface ItemInput {
  title: string;
  quantity: number | "";
}

export interface Category {
  id: number;
  name_en: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Condition {
  id: number;
  level: number;
  name: string;
  description: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Pagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

export interface PostsResponse {
  posts: Post[];
  pagination: Pagination;
}

export interface Comment {
  id: number;
  item_id: number;
  username: string;
  content: string;
  created_at: string;
  user_id?: number;
  post_id: number;
}
