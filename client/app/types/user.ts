export default interface User {
  userId: number;
  role: "admin" | "user" | "contributor";
  username: string;
  provide: string;
  email: string;
  avatar_url?: string;
  avatar_key?: string;
  public_id: string;
  joined_at: string;
}
