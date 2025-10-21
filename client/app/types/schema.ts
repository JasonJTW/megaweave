//* schema.ts

export interface Post {
  id: number;
  title: string;
  content: string;
  type: "seek" | "share" | "commons";
  status: "active" | "inactive" | "expired";
  location?: string;
  tags?: string;
  contact?: string;
  category_id: number;
  condition_level: number;
  expires_at?: string;
  view_count: number;
  interests_count: number;
  created_at: string;
  updated_at: string;
  showContact: boolean;
  username: string;
  category_name_en: string;
  image_urls?: string;
  thumbnail_urls?: string;
  avatar_url?: string;
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
  id: string | number;
  username: string;
  content: string;
  created_at: string;
  // 如果有其他屬性，也可以添加
  user_id?: string | number;
  post_id?: string | number;
}
