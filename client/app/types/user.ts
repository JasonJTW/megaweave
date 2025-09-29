export default interface User {
  userId: string;
  role: "admin" | "user" | "contributor";
  username: string;
  email: string;
  avatar_url?: string;
  avatar_key?: string;
}
