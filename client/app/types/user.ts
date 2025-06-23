export default interface User {
  userId: string;
  role: "admin" | "user";
  username: string;
  email: string;
}
