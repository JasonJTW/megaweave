//* schema.ts

export interface Post {
  id: number;
  user_id: number;
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
  deleted_at?: string;
  username: string;
  category_name_en: string;
  condition_name?: string;
  image_urls?: string;
  thumbnail_urls?: string;
  avatar_url?: string;
  items?: Item[];
  images?: { id: number; image_url: string; thumbnail_url?: string }[];
  author_public_id: string;
  author_user_id: number;
  place_id?: string;
  province?: string;
  city?: string;
  route?: string;
  full_address?: string;
  zip_code?: string;
  lat?: number;
  lng?: number;
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
  place_id?: string;
  province?: string;
  city?: string;
  route?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  expires_at?: Date;
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

export interface UserStats {
  postCount: number;
  weaveCount: number;
  points: number;
}

export interface Conversation {
  id: number;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  other_public_id: string;
  other_username: string;
  other_avatar_url?: string;
  last_message_content?: string;
  last_message_attachment_count?: number;
  unread_count: number;
}

export interface Attachment {
  id: number;
  message_id: number;
  file_url: string;
  file_type: "image" | "video" | "file";
  created_at: string;
}

export interface Message {
  id: number | string;
  conversation_id: number;
  sender_public_id: string;
  content: string;
  is_read: boolean;
  message_type?: string;
  metadata?: Record<string, unknown> | string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
  attachments?: Attachment[];
}

export interface User {
  userId: number;
  username: string;
  email: string;
  role: string;
  public_id: string;
  avatar_url?: string;
  avatar_key?: string;
}
