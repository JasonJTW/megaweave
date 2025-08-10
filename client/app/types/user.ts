export default interface User {
  userId: string;
  role: "admin" | "user" | "contributor";
  username: string;
  email: string;
}
